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
  if (existing?.occurrenceIds?.includes(occurrence.occurrenceId))
    return existing;
  const fp = fingerprint(occurrence);
  if (existing && existing.fingerprint !== fp)
    throw new Error("INCIDENT_FINGERPRINT_MISMATCH");
  const activation = existing?.guardActivationAt
    ? Date.parse(existing.guardActivationAt)
    : null;
  const occurred = Date.parse(occurrence.observedAt);
  const after =
    Number.isFinite(activation) &&
    Number.isFinite(occurred) &&
    occurred >= activation;
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
  return {
    ...existing,
    ...occurrence,
    fingerprint: fp,
    occurrenceIds: [
      ...(existing?.occurrenceIds ?? []),
      occurrence.occurrenceId,
    ],
    firstOccurrence: existing?.firstOccurrence ?? occurrence.observedAt,
    lastOccurrence:
      Math.max(Date.parse(existing?.lastOccurrence ?? 0), occurred) === occurred
        ? occurrence.observedAt
        : existing.lastOccurrence,
    metrics,
    state: after ? "ROOT_CAUSE_CONFIRMED" : (existing?.state ?? "OBSERVED"),
    recurrenceAfterGuard: after,
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
  ])
    if (!proof?.[key]) throw new Error("GUARD_PROMOTION_PROOF_MISSING:" + key);
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
  if (!TERMINAL.has(outcome.state) && outcome.state !== "ACTIVE_GUARD")
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
