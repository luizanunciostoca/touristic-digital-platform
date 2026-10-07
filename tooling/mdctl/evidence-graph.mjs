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

const TYPES = new Set(EVIDENCE_TYPES);
const STATUSES = new Set(EVIDENCE_STATUSES);
const SHA = /^[0-9a-f]{40}$/u;

function text(value, code) {
  assert.equal(typeof value, "string", code);
  assert.ok(value.trim().length > 0, code);
  return value.trim();
}

function strings(value, code) {
  assert.ok(Array.isArray(value), code);
  assert.ok(
    value.every((item) => typeof item === "string" && item.length > 0),
    code,
  );
  assert.equal(new Set(value).size, value.length, code + "_DUPLICATE");
  return [...value];
}

export function validateEvidenceNode(node) {
  assert.ok(
    node && typeof node === "object" && !Array.isArray(node),
    "EVIDENCE_NODE_INVALID",
  );
  text(node.id, "EVIDENCE_ID_INVALID");
  assert.ok(TYPES.has(node.type), "EVIDENCE_TYPE_INVALID");
  assert.ok(STATUSES.has(node.status), "EVIDENCE_STATUS_INVALID");
  text(node.assertion, "EVIDENCE_ASSERTION_INVALID");
  text(node.source, "EVIDENCE_SOURCE_INVALID");
  text(node.validatorRevision, "EVIDENCE_VALIDATOR_INVALID");
  text(node.toolchain, "EVIDENCE_TOOLCHAIN_INVALID");
  text(node.observedAt, "EVIDENCE_OBSERVED_AT_INVALID");
  assert.ok(
    Number.isFinite(Date.parse(node.observedAt)),
    "EVIDENCE_OBSERVED_AT_INVALID",
  );
  assert.ok(
    Number.isSafeInteger(node.freshnessSeconds) && node.freshnessSeconds >= 0,
    "EVIDENCE_FRESHNESS_INVALID",
  );
  strings(node.dependencies, "EVIDENCE_DEPENDENCIES_INVALID");
  if (node.candidateSha != null)
    assert.match(node.candidateSha, SHA, "EVIDENCE_CANDIDATE_SHA_INVALID");
  if (node.treeSha != null)
    assert.match(node.treeSha, SHA, "EVIDENCE_TREE_SHA_INVALID");
  if (["CODE_BOUND", "STATE_BOUND"].includes(node.type)) {
    assert.match(
      node.candidateSha ?? "",
      SHA,
      "EVIDENCE_CANDIDATE_BINDING_REQUIRED",
    );
    assert.match(node.treeSha ?? "", SHA, "EVIDENCE_TREE_BINDING_REQUIRED");
  }
  if (["RUNTIME_BOUND", "EXTERNAL_BOUND"].includes(node.type)) {
    text(node.environment, "EVIDENCE_ENVIRONMENT_REQUIRED");
  }
  return structuredClone(node);
}

function intersects(left = [], right = []) {
  const set = new Set(left);
  return right.some((value) => set.has(value));
}

function shouldInvalidate(node, mutation) {
  const dependencies = mutation.dependencies ?? [];
  const dependencyHit = intersects(node.dependencies, dependencies);
  if (mutation.kind === "METADATA_ONLY") {
    return node.type === "STATE_BOUND" && dependencyHit;
  }
  if (mutation.kind === "CANDIDATE_MUTATION") {
    return ["CODE_BOUND", "STATE_BOUND"].includes(node.type) && dependencyHit;
  }
  if (mutation.kind === "VALIDATOR_MUTATION") {
    return (
      node.validatorRevision === mutation.previousValidatorRevision ||
      dependencyHit
    );
  }
  if (mutation.kind === "RUNTIME_CHANGE") {
    return (
      node.type === "RUNTIME_BOUND" &&
      (mutation.environment == null ||
        mutation.environment === node.environment) &&
      dependencyHit
    );
  }
  if (mutation.kind === "EXTERNAL_CHANGE") {
    return node.type === "EXTERNAL_BOUND" && dependencyHit;
  }
  if (mutation.kind === "MAIN_ADVANCE") {
    return (
      mutation.semanticIntersection === true &&
      ["CODE_BOUND", "STATE_BOUND"].includes(node.type) &&
      dependencyHit
    );
  }
  throw new Error("EVIDENCE_MUTATION_KIND_INVALID");
}

export function invalidateEvidence(nodes, mutation) {
  assert.ok(Array.isArray(nodes), "EVIDENCE_NODES_REQUIRED");
  assert.ok(
    mutation && typeof mutation === "object",
    "EVIDENCE_MUTATION_REQUIRED",
  );
  return nodes.map((raw) => {
    const node = validateEvidenceNode(raw);
    if (node.status !== "PASS" || !shouldInvalidate(node, mutation))
      return node;
    return {
      ...node,
      status: "SUPERSEDED",
      supersededBy: mutation.id ?? mutation.kind,
    };
  });
}

export function planEvidenceReuse(nodes, mutation) {
  const next = invalidateEvidence(nodes, mutation);
  return {
    preserved: next.filter((node) => node.status !== "SUPERSEDED"),
    invalidated: next.filter((node) => node.status === "SUPERSEDED"),
  };
}

export function evidenceSatisfiesRequirement(
  node,
  { candidateSha = null, treeSha = null } = {},
) {
  const value = validateEvidenceNode(node);
  if (value.status !== "PASS") return false;
  if (["CODE_BOUND", "STATE_BOUND"].includes(value.type)) {
    if (candidateSha && value.candidateSha !== candidateSha) return false;
    if (treeSha && value.treeSha !== treeSha) return false;
  }
  return true;
}
