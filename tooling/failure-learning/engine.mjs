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
  const fp = fingerprint(occurrence);
  const occurred = Date.parse(occurrence.observedAt);
  if (!Number.isFinite(occurred))
    throw new Error("OCCURRENCE_TIMESTAMP_INVALID");
  if (existing && existing.fingerprint !== fp)
    throw new Error("INCIDENT_FINGERPRINT_MISMATCH");
  if (existing?.occurrenceIds?.includes(occurrence.occurrenceId)) {
    const known = existing.occurrences?.find(
      (x) => x.occurrenceId === occurrence.occurrenceId,
    );
    if (
      !known ||
      known.fingerprint !== fp ||
      known.observedAt !== occurrence.observedAt
    )
      throw new Error("OCCURRENCE_REPLAY_CONFLICT");
    return existing;
  }
  const activation = existing?.guardActivationAt
    ? Date.parse(existing.guardActivationAt)
    : null;
  if (existing?.state === "ACTIVE_GUARD" && !Number.isFinite(activation))
    throw new Error("GUARD_ACTIVATION_TIMESTAMP_INVALID");
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
  };
  const mutable = { ...occurrence };
  for (const key of [
    "guardId",
    "guardRevision",
    "guardActivationAt",
    "proofReference",
    "state",
    "metrics",
    "recurrenceAfterGuard",
    "occurrenceIds",
    "occurrences",
    "firstOccurrence",
    "lastOccurrence",
  ])
    delete mutable[key];
  return {
    ...existing,
    ...mutable,
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
  if (!Number.isFinite(Date.parse(proof.activatedAt)))
    throw new Error("GUARD_ACTIVATION_TIMESTAMP_INVALID");
  return {
    ...incident,
    state: "ACTIVE_GUARD",
    guardId: proof.guardId,
    guardRevision: proof.validatorRevision,
    guardActivationAt: proof.activatedAt,
    proofReference: proof.independentProof,
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
  const applicable = registry.filter(
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
