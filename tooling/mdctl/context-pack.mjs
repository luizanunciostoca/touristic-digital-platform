import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  canonicalJson,
  changeSetDigest,
  validateChangeSetV2,
} from "./changeset-v2.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const LEASE_ID = /^lease-[A-Za-z0-9._-]{1,120}$/u;

function digestPayload(value) {
  return (
    "sha256:" + createHash("sha256").update(canonicalJson(value)).digest("hex")
  );
}

export function contextPackDigest(pack) {
  const { digest, ...payload } = pack;
  return digestPayload(payload);
}

export function buildContextPack({
  changeSet,
  candidateSha,
  treeSha,
  branch = changeSet?.branch,
  capabilityLeaseIds,
  generatedAt = new Date().toISOString(),
}) {
  validateChangeSetV2(changeSet);
  assert.match(candidateSha ?? "", SHA, "CONTEXT_CANDIDATE_SHA_INVALID");
  assert.match(treeSha ?? "", SHA, "CONTEXT_TREE_SHA_INVALID");
  assert.equal(branch, changeSet.branch, "CONTEXT_BRANCH_MISMATCH");
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
    ownership: {
      paths: changeSet.owns.paths,
      contracts: changeSet.owns.contracts,
    },
    contracts: {
      reads: changeSet.reads.contracts,
      owns: changeSet.owns.contracts,
    },
    dependencies: changeSet.dependencies,
    capabilityLeaseIds,
    proofPlan: {
      commandIds: changeSet.proof.commands.map((command) => command.id),
      requiredEvidence: changeSet.requiredEvidence,
      requiredRemoteEvidence: changeSet.proof.requiredRemoteEvidence,
      budget: changeSet.proof.budget,
    },
    generatedAt,
  };
  const withDigest = { ...pack, digest: digestPayload(pack) };
  validateContextPack(withDigest, changeSet);
  return withDigest;
}

export function validateContextPack(pack, changeSet) {
  validateChangeSetV2(changeSet);
  assert.equal(pack?.schemaVersion, 1, "CONTEXT_SCHEMA_INVALID");
  assert.equal(pack?.kind, "TDP_CONTEXT_PACK", "CONTEXT_KIND_INVALID");
  assert.equal(pack?.changeSetId, changeSet.id, "CONTEXT_CHANGESET_MISMATCH");
  assert.equal(
    pack?.changeSetDigest,
    changeSetDigest(changeSet),
    "CONTEXT_CHANGESET_DIGEST_MISMATCH",
  );
  assert.equal(pack?.baseSha, changeSet.baseSha, "CONTEXT_BASE_SHA_MISMATCH");
  assert.match(pack?.candidateSha ?? "", SHA, "CONTEXT_CANDIDATE_SHA_INVALID");
  assert.match(pack?.treeSha ?? "", SHA, "CONTEXT_TREE_SHA_INVALID");
  assert.equal(pack?.branch, changeSet.branch, "CONTEXT_BRANCH_MISMATCH");
  assert.equal(pack?.scope, changeSet.scope, "CONTEXT_SCOPE_MISMATCH");
  assert.equal(
    pack?.digest,
    contextPackDigest(pack),
    "CONTEXT_DIGEST_MISMATCH",
  );
  const bytes = Buffer.byteLength(JSON.stringify(pack), "utf8");
  assert.ok(bytes <= changeSet.contextPack.maxBytes, "CONTEXT_PACK_TOO_LARGE");
  return pack;
}
