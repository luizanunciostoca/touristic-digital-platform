import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  canonicalJson,
  changeSetDigest,
  validateChangeSetV2,
} from "./changeset-v2.mjs";
import { assertRequiredCapabilityLeases } from "./capability-leases.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const LEASE_ID = /^lease-[A-Za-z0-9._-]{1,120}$/u;
const OWNER = /^[A-Za-z0-9._:@/-]{1,120}$/u;
const TOP_KEYS = new Set([
  "schemaVersion",
  "kind",
  "changeSetId",
  "changeSetDigest",
  "baseSha",
  "candidateSha",
  "treeSha",
  "branch",
  "scope",
  "owner",
  "ownership",
  "contracts",
  "dependencies",
  "capabilityLeaseIds",
  "proofPlan",
  "generatedAt",
  "digest",
]);
const OWNERSHIP_KEYS = new Set(["paths", "contracts"]);
const CONTRACT_KEYS = new Set(["reads", "owns"]);
const PROOF_KEYS = new Set([
  "commandIds",
  "requiredEvidence",
  "requiredRemoteEvidence",
  "budget",
]);
const BUDGET_KEYS = new Set(["maxCommands", "maxSeconds"]);
function assertClosedObject(value, allowed, code) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    code + "_OBJECT_INVALID",
  );
  for (const key of Object.keys(value))
    assert.ok(allowed.has(key), code + "_PROPERTY_UNKNOWN:" + key);
  return value;
}

function digestPayload(value) {
  return (
    "sha256:" + createHash("sha256").update(canonicalJson(value)).digest("hex")
  );
}

export function contextPackDigest(pack) {
  const { digest, ...payload } = pack;
  return digestPayload(payload);
}

function expectedProjection(changeSet) {
  return {
    ownership: {
      paths: changeSet.owns.paths,
      contracts: changeSet.owns.contracts,
    },
    contracts: {
      reads: changeSet.reads.contracts,
      owns: changeSet.owns.contracts,
    },
    dependencies: changeSet.dependencies,
    proofPlan: {
      commandIds: changeSet.proof.commands.map((command) => command.id),
      requiredEvidence: changeSet.requiredEvidence,
      requiredRemoteEvidence: changeSet.proof.requiredRemoteEvidence,
      budget: changeSet.proof.budget,
    },
  };
}
function assertLeaseBinding({
  pack,
  changeSet,
  leaseRegistry,
  owner,
  branch,
  now,
}) {
  assert.ok(leaseRegistry, "CONTEXT_LEASE_REGISTRY_REQUIRED");
  assert.match(owner ?? "", OWNER, "CONTEXT_OWNER_INVALID");
  const active = assertRequiredCapabilityLeases({
    registry: leaseRegistry,
    changeSet,
    owner,
    branch,
    now,
  });
  const requiredIds = active
    .filter((lease) =>
      changeSet.requiredCapabilities.includes(lease.capability),
    )
    .map((lease) => lease.leaseId)
    .sort();
  const suppliedIds = [...pack.capabilityLeaseIds].sort();
  assert.deepEqual(
    suppliedIds,
    requiredIds,
    "CONTEXT_CAPABILITY_LEASE_BINDING_MISMATCH",
  );
}

export function buildContextPack({
  changeSet,
  candidateSha,
  treeSha,
  branch = changeSet?.branch,
  capabilityLeaseIds,
  leaseRegistry,
  owner,
  generatedAt = new Date().toISOString(),
}) {
  validateChangeSetV2(changeSet);
  assert.match(candidateSha ?? "", SHA, "CONTEXT_CANDIDATE_SHA_INVALID");
  assert.match(treeSha ?? "", SHA, "CONTEXT_TREE_SHA_INVALID");
  assert.equal(branch, changeSet.branch, "CONTEXT_BRANCH_MISMATCH");
  assert.match(owner ?? "", OWNER, "CONTEXT_OWNER_INVALID");
  assert.ok(
    Array.isArray(capabilityLeaseIds) && capabilityLeaseIds.length > 0,
    "CONTEXT_LEASE_IDS_REQUIRED",
  );
  assert.equal(
    new Set(capabilityLeaseIds).size,
    capabilityLeaseIds.length,
    "CONTEXT_LEASE_ID_DUPLICATE",
  );
  for (const leaseId of capabilityLeaseIds)
    assert.match(leaseId, LEASE_ID, "CONTEXT_LEASE_ID_INVALID");
  assert.ok(Number.isFinite(Date.parse(generatedAt)), "CONTEXT_TIME_INVALID");

  const projection = expectedProjection(changeSet);
  const pack = {
    schemaVersion: 1,
    kind: "TDP_CONTEXT_PACK",
    changeSetId: changeSet.id,
    changeSetDigest: changeSetDigest(changeSet),
    baseSha: changeSet.baseSha,
    candidateSha,
    treeSha,
    branch,
    scope: changeSet.scope,
    owner,
    ...projection,
    capabilityLeaseIds,
    generatedAt,
  };
  const withDigest = { ...pack, digest: digestPayload(pack) };
  validateContextPack(withDigest, changeSet, {
    leaseRegistry,
    owner,
    now: generatedAt,
  });
  return withDigest;
}

export function validateContextPack(
  pack,
  changeSet,
  { leaseRegistry, owner = pack?.owner, now = pack?.generatedAt } = {},
) {
  validateChangeSetV2(changeSet);
  assertClosedObject(pack, TOP_KEYS, "CONTEXT");
  assertClosedObject(pack.ownership, OWNERSHIP_KEYS, "CONTEXT_OWNERSHIP");
  assertClosedObject(pack.contracts, CONTRACT_KEYS, "CONTEXT_CONTRACTS");
  assertClosedObject(pack.proofPlan, PROOF_KEYS, "CONTEXT_PROOF_PLAN");
  assertClosedObject(
    pack.proofPlan.budget,
    BUDGET_KEYS,
    "CONTEXT_PROOF_BUDGET",
  );
  assert.equal(pack.schemaVersion, 1, "CONTEXT_SCHEMA_INVALID");
  assert.equal(pack.kind, "TDP_CONTEXT_PACK", "CONTEXT_KIND_INVALID");
  assert.equal(pack.changeSetId, changeSet.id, "CONTEXT_CHANGESET_MISMATCH");
  assert.equal(
    pack.changeSetDigest,
    changeSetDigest(changeSet),
    "CONTEXT_CHANGESET_DIGEST_MISMATCH",
  );
  assert.equal(pack.baseSha, changeSet.baseSha, "CONTEXT_BASE_SHA_MISMATCH");
  assert.match(pack.candidateSha ?? "", SHA, "CONTEXT_CANDIDATE_SHA_INVALID");
  assert.match(pack.treeSha ?? "", SHA, "CONTEXT_TREE_SHA_INVALID");
  assert.equal(pack.branch, changeSet.branch, "CONTEXT_BRANCH_MISMATCH");
  assert.equal(pack.scope, changeSet.scope, "CONTEXT_SCOPE_MISMATCH");
  assert.match(pack.owner ?? "", OWNER, "CONTEXT_OWNER_INVALID");
  assert.equal(pack.owner, owner, "CONTEXT_OWNER_MISMATCH");
  assert.ok(
    Array.isArray(pack.capabilityLeaseIds) &&
      pack.capabilityLeaseIds.length > 0,
    "CONTEXT_LEASE_IDS_REQUIRED",
  );
  assert.equal(
    new Set(pack.capabilityLeaseIds).size,
    pack.capabilityLeaseIds.length,
    "CONTEXT_LEASE_ID_DUPLICATE",
  );
  for (const leaseId of pack.capabilityLeaseIds)
    assert.match(leaseId, LEASE_ID, "CONTEXT_LEASE_ID_INVALID");
  assert.ok(
    Number.isFinite(Date.parse(pack.generatedAt)),
    "CONTEXT_TIME_INVALID",
  );
  const expected = expectedProjection(changeSet);
  assert.deepEqual(
    pack.ownership,
    expected.ownership,
    "CONTEXT_OWNERSHIP_MISMATCH",
  );
  assert.deepEqual(
    pack.contracts,
    expected.contracts,
    "CONTEXT_CONTRACTS_MISMATCH",
  );
  assert.deepEqual(
    pack.dependencies,
    expected.dependencies,
    "CONTEXT_DEPENDENCIES_MISMATCH",
  );
  assert.deepEqual(
    pack.proofPlan,
    expected.proofPlan,
    "CONTEXT_PROOF_PLAN_MISMATCH",
  );

  assertLeaseBinding({
    pack,
    changeSet,
    leaseRegistry,
    owner,
    branch: pack.branch,
    now,
  });

  assert.equal(pack.digest, contextPackDigest(pack), "CONTEXT_DIGEST_MISMATCH");
  const bytes = Buffer.byteLength(JSON.stringify(pack), "utf8");
  assert.ok(bytes <= changeSet.contextPack.maxBytes, "CONTEXT_PACK_TOO_LARGE");
  return pack;
}
