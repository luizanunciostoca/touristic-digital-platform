import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { detectors as canonicalDetectors } from "./detectors.mjs";
import crypto from "node:crypto";
const TERMINAL = new Set([
  "TRANSIENT_RESOLVED",
  "FALSE_POSITIVE",
  "SUPERSEDED",
]);
export const STATES = new Set([
  "OBSERVED",
  "REPRODUCED",
  "ROOT_CAUSE_CONFIRMED",
  "PREVENTION_PROPOSED",
  "PREVENTION_IMPLEMENTED",
  "PREVENTION_PROVEN",
  "ACTIVE_GUARD",
  "TRANSIENT_RESOLVED",
  "BLOCKED",
  "UNKNOWN_REQUIRES_INVESTIGATION",
  "FALSE_POSITIVE",
  "SUPERSEDED",
]);
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const clone = (value) => (value == null ? value : structuredClone(value));

const ACTIVATION_REGISTRY_URL = new URL(
  "../../.github/morro-control/failures/guard-activations.json",
  import.meta.url,
);

function activationRecordFor(proof) {
  return {
    guardId: proof?.guardId,
    state: "ACTIVE_GUARD",
    candidateSha: proof?.candidateSha,
    candidateBinding: proof?.candidateBinding,
    regressionTest: proof?.regressionTest,
    independentProof: proof?.independentProof,
    independentProofCandidateSha: proof?.independentProofCandidateSha,
    freshness: proof?.freshness,
    freshnessSeconds: proof?.freshnessSeconds,
    observedAt: proof?.observedAt,
    expiresAt: proof?.expiresAt,
    validatorRevision: proof?.validatorRevision,
    activatedAt: proof?.activatedAt,
    repository: proof?.repository,
    runId: proof?.runId,
    runAttempt: proof?.runAttempt,
    workflow: proof?.workflow,
    job: proof?.job,
    assertion: proof?.assertion,
  };
}

function readActivationRegistry() {
  const registry = JSON.parse(readFileSync(ACTIVATION_REGISTRY_URL, "utf8"));
  if (
    registry?.schemaVersion !== 1 ||
    registry?.authority !== "ORCHESTRATOR" ||
    !Array.isArray(registry?.activations)
  )
    throw new Error("GUARD_ACTIVATION_REGISTRY_INVALID");
  return registry;
}

function requireCanonicalActivation(proof) {
  const expected = activationRecordFor(proof);
  const canonical = readActivationRegistry().activations.some((item) =>
    isDeepStrictEqual(item, expected),
  );
  if (!canonical) throw new Error("GUARD_PROOF_SOURCE_UNVERIFIED");
  return expected;
}

export function fingerprint(input) {
  const identity = {
    failureClass: input.failureClass,
    domain: input.domain,
    environment: input.environment,
    operation: input.operation ?? null,
    expected: input.expected,
    observed: input.observed,
  };
  return (
    "sha256:" +
    crypto.createHash("sha256").update(stable(identity)).digest("hex")
  );
}
export function rootCauseFingerprint(input) {
  if (!input.rootCause) return null;
  return (
    "sha256:" +
    crypto
      .createHash("sha256")
      .update(
        stable({
          failureClass: input.failureClass,
          rootCause: input.rootCause,
        }),
      )
      .digest("hex")
  );
}
export function recordOccurrence(existing, occurrence) {
  if (
    !occurrence ||
    typeof occurrence.occurrenceId !== "string" ||
    !occurrence.occurrenceId.trim()
  )
    throw new Error("OCCURRENCE_ID_REQUIRED");

  const fp = fingerprint(occurrence);
  const occurred = Date.parse(occurrence.observedAt);
  if (!Number.isFinite(occurred))
    throw new Error("OCCURRENCE_TIMESTAMP_INVALID");
  if (existing && existing.fingerprint !== fp)
    throw new Error("INCIDENT_FINGERPRINT_MISMATCH");
  const activationAt = existing?.guardActivationAt;
  const activation =
    typeof activationAt === "string" ? Date.parse(activationAt) : NaN;
  // Replay is idempotent only after persisted guard metadata is validated.
  if (
    (existing?.state === "ACTIVE_GUARD" || activationAt != null) &&
    !Number.isFinite(activation)
  )
    throw new Error("GUARD_ACTIVATION_TIMESTAMP_INVALID");
  if (existing?.state === "ACTIVE_GUARD" || activationAt != null) {
    if (!existing?.guardProof || typeof existing.guardProof !== "object")
      throw new Error("GUARD_ACTIVATION_NOT_CANONICAL");
    try {
      requireCanonicalActivation(existing.guardProof);
    } catch {
      throw new Error("GUARD_ACTIVATION_NOT_CANONICAL");
    }
  }
  if (existing?.occurrenceIds?.includes(occurrence.occurrenceId)) {
    const known = existing.occurrences?.find(
      (x) => x.occurrenceId === occurrence.occurrenceId,
    );
    if (
      !known ||
      known.fingerprint !== fp ||
      known.observedAt !== occurrence.observedAt ||
      JSON.stringify(known.severity ?? null) !==
        JSON.stringify(occurrence.severity ?? null) ||
      JSON.stringify(known.sources ?? []) !==
        JSON.stringify(occurrence.sources ?? []) ||
      JSON.stringify(known.evidenceRefs ?? []) !==
        JSON.stringify(occurrence.evidenceRefs ?? []) ||
      JSON.stringify(known.retry ?? null) !==
        JSON.stringify(occurrence.retry ?? null) ||
      JSON.stringify(known.materialOutcome ?? null) !==
        JSON.stringify(occurrence.materialOutcome ?? null)
    )
      throw new Error("OCCURRENCE_REPLAY_CONFLICT");
    return existing;
  }
  const after = Number.isFinite(activation) && occurred >= activation;
  const metrics = {
    occurrencesBeforeGuard: 0,
    occurrencesAfterGuard: 0,
    preventedCount: 0,
    falsePositiveCount: 0,
    guardEffectiveness: "UNKNOWN",
    ...(existing?.metrics ?? {}),
  };
  if (after) {
    metrics.occurrencesAfterGuard++;
    metrics.guardEffectiveness = "INEFFECTIVE";
  } else metrics.occurrencesBeforeGuard++;
  const oldFirst = Date.parse(existing?.firstOccurrence ?? "");
  const oldLast = Date.parse(existing?.lastOccurrence ?? "");
  const occurrenceRecord = {
    occurrenceId: occurrence.occurrenceId,
    observedAt: occurrence.observedAt,
    fingerprint: fp,
    severity: occurrence.severity ?? null,
    sources: clone(occurrence.sources ?? []),
    evidenceRefs: clone(occurrence.evidenceRefs ?? []),
    retry: clone(occurrence.retry ?? null),
    materialOutcome: occurrence.materialOutcome ?? null,
  };
  const occurrenceOwned = {};
  for (const key of [
    "severity",
    "sources",
    "evidenceRefs",
    "retry",
    "materialOutcome",
  ])
    if (Object.hasOwn(occurrence, key))
      occurrenceOwned[key] = clone(occurrence[key]);
  const initial = existing ?? {
    schemaVersion: 1,
    incidentId: occurrence.incidentId,
    occurrenceId: occurrence.occurrenceId,
    failureClass: occurrence.failureClass,
    severity: occurrence.severity,
    operation: occurrence.operation ?? null,
    domain: occurrence.domain,
    environment: occurrence.environment,
    expected: occurrence.expected,
    observed: occurrence.observed,
    sources: clone(occurrence.sources ?? []),
    evidenceRefs: clone(occurrence.evidenceRefs ?? []),
    state: "OBSERVED",
    rootCause: null,
    rootCauseFingerprint: null,
    preventionState: "NONE",
  };
  for (const key of [
    "incidentId",
    "failureClass",
    "domain",
    "environment",
    "expected",
    "observed",
  ])
    if (!initial[key]) throw new Error("INCIDENT_IDENTITY_REQUIRED:" + key);
  return {
    ...initial,
    ...occurrenceOwned,
    fingerprint: fp,
    occurrenceIds: [
      ...(existing?.occurrenceIds ?? []),
      occurrence.occurrenceId,
    ],
    occurrences: [...(existing?.occurrences ?? []), occurrenceRecord],
    firstOccurrence:
      !Number.isFinite(oldFirst) || occurred < oldFirst
        ? occurrence.observedAt
        : existing.firstOccurrence,
    lastOccurrence:
      !Number.isFinite(oldLast) || occurred > oldLast
        ? occurrence.observedAt
        : existing.lastOccurrence,
    metrics,
    state: after ? "ROOT_CAUSE_CONFIRMED" : (existing?.state ?? "OBSERVED"),
    recurrenceAfterGuard: Boolean(existing?.recurrenceAfterGuard) || after,
  };
}
export function promoteGuard(incident, proof) {
  if (incident.state !== "PREVENTION_PROVEN" || !incident.rootCause)
    throw new Error("GUARD_PROMOTION_PRECONDITION");
  for (const key of [
    "regressionTest",
    "independentProof",
    "candidateBinding",
    "freshness",
    "validatorRevision",
    "guardId",
    "activatedAt",
  ])
    if (!proof?.[key]) throw new Error("GUARD_PROMOTION_PROOF_MISSING:" + key);
  if (!/^[0-9a-f]{40}$/.test(proof.candidateBinding))
    throw new Error("GUARD_CANDIDATE_BINDING_INVALID");
  if (
    !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+/.test(
      proof.independentProof,
    )
  )
    throw new Error("GUARD_INDEPENDENT_PROOF_INVALID");
  let runUrl, testUrl;
  try {
    runUrl = new URL(proof.independentProof);
    testUrl = new URL(proof.regressionTest);
  } catch {
    throw new Error("GUARD_PROOF_URL_INVALID");
  }
  for (const [url, original] of [
    [runUrl, proof.independentProof],
    [testUrl, proof.regressionTest],
  ]) {
    if (
      url.origin !== "https://github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.href !== original ||
      url.pathname.includes("%")
    )
      throw new Error("GUARD_PROOF_URL_INVALID");
  }
  const runParts = runUrl.pathname.split("/").slice(1);
  const testParts = testUrl.pathname.split("/").slice(1);
  const repo = "luizanunciostoca/touristic-digital-platform";
  if (
    runParts.slice(0, 2).join("/") !== repo ||
    testParts.slice(0, 2).join("/") !== repo
  )
    throw new Error("GUARD_PROOF_REPOSITORY_MISMATCH");
  if (
    runParts.length !== 5 ||
    runParts[2] !== "actions" ||
    runParts[3] !== "runs" ||
    !/^[1-9][0-9]*$/.test(runParts[4]) ||
    testParts[2] !== "blob" ||
    testParts.length < 5 ||
    testParts.slice(4).some((p) => !p)
  )
    throw new Error("GUARD_PROOF_URL_INVALID");
  const regressionSha = proof.regressionTest.match(
    /\/blob\/([0-9a-f]{40})\//,
  )?.[1];
  if (!regressionSha) throw new Error("GUARD_REGRESSION_PROOF_INVALID");
  if (regressionSha !== proof.candidateBinding)
    throw new Error("GUARD_PROOF_BINDING_MISMATCH");
  if (proof.independentProofCandidateSha !== proof.candidateBinding)
    throw new Error("GUARD_INDEPENDENT_PROOF_BINDING_MISMATCH");
  if (!/^sha256:[0-9a-f]{64}$/.test(proof.validatorRevision))
    throw new Error("GUARD_VALIDATOR_REVISION_INVALID");
  if (proof.freshness !== "FRESH") throw new Error("GUARD_FRESHNESS_INVALID");
  if (!Number.isFinite(Date.parse(proof.activatedAt)))
    throw new Error("GUARD_ACTIVATION_TIMESTAMP_INVALID");
  requireCanonicalActivation(proof);
  return {
    ...incident,
    state: "ACTIVE_GUARD",
    guardId: proof.guardId,
    guardRevision: proof.validatorRevision,
    guardActivationAt: proof.activatedAt,
    proofReference: proof.independentProof,
    candidateBinding: proof.candidateBinding,
    regressionTestReference: proof.regressionTest,
    guardProof: clone(proof),
  };
}
export function closeIncident(incident, outcome) {
  if (!outcome?.materialOutcome) throw new Error("NO_SILENT_FAILURE");
  if (!TERMINAL.has(outcome.state))
    throw new Error("INCIDENT_FINAL_STATE_REQUIRED");
  return {
    ...incident,
    state: outcome.state,
    materialOutcome: outcome.materialOutcome,
    retry: outcome.retry ?? null,
  };
}
export function evaluateGuards({
  operation,
  domain,
  detectors,
  registry,
  observation = {},
}) {
  const canonical = JSON.parse(
    readFileSync(
      new URL(
        "../../.github/morro-control/tdp-max/anti-recurrence.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).failures;
  if (registry !== undefined && !isDeepStrictEqual(registry, canonical))
    throw new Error("GUARD_REGISTRY_OVERRIDE_FORBIDDEN");
  if (!Array.isArray(canonical) || canonical.length === 0)
    throw new Error("CANONICAL_GUARD_REGISTRY_INVALID");
  detectors ??= canonicalDetectors;
  for (const [name, detector] of Object.entries(detectors))
    if (detector !== canonicalDetectors[name])
      throw new Error("GUARD_DETECTOR_OVERRIDE_FORBIDDEN");
  const applicable = canonical.filter(
    (g) =>
      (g.operations ?? ["*"]).includes("*") ||
      (g.operations ?? []).includes(operation) ||
      (g.domains ?? []).includes(domain),
  );
  return applicable.map((g) => {
    const detector = detectors[g.class];
    if (!detector)
      return {
        id: g.id,
        class: g.class,
        result: g.severity === "critical" ? "NOT_PROVEN" : "WARN",
        reason: "DETECTOR_MISSING",
      };
    const r = detector({ operation, domain, observation });
    if (!["PASS", "WARN", "BLOCK", "NOT_PROVEN"].includes(r))
      throw new Error("GUARD_RESULT_INVALID");
    return { id: g.id, class: g.class, result: r };
  });
}
