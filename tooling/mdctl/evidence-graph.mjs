import assert from "node:assert/strict";

export const EVIDENCE_TYPES = Object.freeze([
  "CODE_BOUND",
  "STATE_BOUND",
  "RUNTIME_BOUND",
  "EXTERNAL_BOUND",
]);
export const EVIDENCE_STATUSES = Object.freeze([
  "PASS",
  "FAIL",
  "NOT_RUN",
  "SKIPPED",
  "SUPERSEDED",
]);
const SHA = /^[0-9a-f]{40}$/u,
  CANDIDATE = new Set(EVIDENCE_TYPES.slice(0, 2));
const requiredText = (value, code) =>
  assert.ok(typeof value === "string" && value.trim(), code);
export function validateEvidenceNode(raw) {
  assert.ok(
    raw && typeof raw === "object" && !Array.isArray(raw),
    "EVIDENCE_NODE_INVALID",
  );
  const node = structuredClone(raw);
  for (const [value, code] of [
    [node.id, "EVIDENCE_ID_INVALID"],
    [node.assertion, "EVIDENCE_ASSERTION_INVALID"],
    [node.source, "EVIDENCE_SOURCE_INVALID"],
    [node.validatorRevision, "EVIDENCE_VALIDATOR_INVALID"],
    [node.toolchain, "EVIDENCE_TOOLCHAIN_INVALID"],
    [node.observedAt, "EVIDENCE_OBSERVED_AT_INVALID"],
  ])
    requiredText(value, code);
  assert.ok(
    EVIDENCE_TYPES.includes(node.type) &&
      EVIDENCE_STATUSES.includes(node.status),
    "EVIDENCE_ENUM_INVALID",
  );
  assert.ok(
    Number.isFinite(Date.parse(node.observedAt)) &&
      Number.isSafeInteger(node.freshnessSeconds) &&
      node.freshnessSeconds >= 0,
    "EVIDENCE_TIME_INVALID",
  );
  assert.ok(
    Array.isArray(node.dependencies) &&
      node.dependencies.every((x) => typeof x === "string" && x) &&
      new Set(node.dependencies).size === node.dependencies.length,
    "EVIDENCE_DEPENDENCIES_INVALID",
  );
  if (CANDIDATE.has(node.type)) {
    assert.match(node.candidateSha ?? "", SHA);
    assert.match(node.treeSha ?? "", SHA);
  } else requiredText(node.environment, "EVIDENCE_ENVIRONMENT_REQUIRED");
  return node;
}
const depends = (node, mutation) =>
  (mutation.dependencies ?? []).some((x) => node.dependencies.includes(x));
function affected(node, mutation) {
  if (mutation.kind === "CANDIDATE_MUTATION") return CANDIDATE.has(node.type);
  if (mutation.kind === "METADATA_ONLY")
    return node.type === "STATE_BOUND" && depends(node, mutation);
  if (mutation.kind === "VALIDATOR_MUTATION")
    return (
      node.validatorRevision === mutation.previousValidatorRevision ||
      depends(node, mutation)
    );
  if (mutation.kind === "RUNTIME_CHANGE")
    return (
      node.type === "RUNTIME_BOUND" &&
      (mutation.environment == null ||
        mutation.environment === node.environment) &&
      depends(node, mutation)
    );
  if (mutation.kind === "EXTERNAL_CHANGE")
    return node.type === "EXTERNAL_BOUND" && depends(node, mutation);
  if (mutation.kind === "MAIN_ADVANCE")
    return (
      mutation.semanticIntersection === true &&
      CANDIDATE.has(node.type) &&
      depends(node, mutation)
    );
  throw new Error("EVIDENCE_MUTATION_KIND_INVALID");
}
export function invalidateEvidence(nodes, mutation) {
  assert.ok(
    Array.isArray(nodes) && mutation && typeof mutation === "object",
    "EVIDENCE_MUTATION_INVALID",
  );
  return nodes.map((raw) => {
    const node = validateEvidenceNode(raw);
    return node.status === "PASS" && affected(node, mutation)
      ? {
          ...node,
          status: "SUPERSEDED",
          supersededBy: mutation.id ?? mutation.kind,
        }
      : node;
  });
}
export function planEvidenceReuse(nodes, mutation) {
  const next = invalidateEvidence(nodes, mutation);
  return {
    preserved: next.filter((x) => x.status !== "SUPERSEDED"),
    invalidated: next.filter((x) => x.status === "SUPERSEDED"),
  };
}
export function evidenceSatisfiesRequirement(
  raw,
  {
    candidateSha = null,
    treeSha = null,
    now = Date.now(),
    clockSkewSeconds = 0,
  } = {},
) {
  const node = validateEvidenceNode(raw),
    current = typeof now === "number" ? now : Date.parse(now),
    observed = Date.parse(node.observedAt),
    skew = clockSkewSeconds * 1000;
  assert.ok(
    Number.isFinite(current) && Number.isFinite(skew) && skew >= 0,
    "EVIDENCE_CLOCK_INVALID",
  );
  return (
    node.status === "PASS" &&
    observed <= current + skew &&
    current <= observed + node.freshnessSeconds * 1000 + skew &&
    (!CANDIDATE.has(node.type) ||
      ((!candidateSha || node.candidateSha === candidateSha) &&
        (!treeSha || node.treeSha === treeSha)))
  );
}
