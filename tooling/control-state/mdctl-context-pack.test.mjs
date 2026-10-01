import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireCapabilityLeases,
  createLeaseRegistry,
  releaseCapabilityLeases,
} from "../mdctl/capability-leases.mjs";
import {
  buildContextPack,
  contextPackDigest,
  validateContextPack,
} from "../mdctl/context-pack.mjs";

const NOW = "2026-10-01T09:00:00Z";
const OWNER = "worker-1";

function changeSet() {
  return {
    schemaVersion: 2,
    id: "MD-CONTEXT-TEST",
    baseSha: "a".repeat(40),
    branch: "infra/context-test",
    state: "IMPLEMENTING",
    risk: "medium",
    scope: "PLATFORM",
    owns: { paths: ["tooling/mdctl/**"], contracts: ["C1"] },
    reads: { contracts: ["C2"] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: ["MD-BASE"],
    requiredEvidence: ["remote-proof"],
    requiredCapabilities: ["github:read"],
    contextPack: {
      maxBytes: 65536,
      include: [
        "changeset",
        "git-identity",
        "ownership",
        "contracts",
        "dependencies",
        "proof-plan",
      ],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "unit",
          argv: ["node", "--test", "tooling/test.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
  };
}

function leased(manifest = changeSet()) {
  const acquired = acquireCapabilityLeases({
    registry: createLeaseRegistry(),
    changeSet: manifest,
    owner: OWNER,
    now: NOW,
    ttlSeconds: 3600,
    idFactory: () => "one",
  });
  return {
    manifest,
    registry: acquired.registry,
    leaseIds: acquired.leases.map((lease) => lease.leaseId),
  };
}

function build(fixture = leased()) {
  return buildContextPack({
    changeSet: fixture.manifest,
    candidateSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    capabilityLeaseIds: fixture.leaseIds,
    leaseRegistry: fixture.registry,
    owner: OWNER,
    generatedAt: NOW,
  });
}

test("Context Pack is candidate-bound, compact and lease verified", () => {
  const fixture = leased();
  const pack = build(fixture);
  assert.equal(
    validateContextPack(pack, fixture.manifest, {
      leaseRegistry: fixture.registry,
      owner: OWNER,
      now: NOW,
    }),
    pack,
  );
  assert.equal(pack.digest, contextPackDigest(pack));
  assert.equal(pack.candidateSha, "b".repeat(40));
  assert.equal(pack.owner, OWNER);
  assert.ok(Buffer.byteLength(JSON.stringify(pack)) < 65536);
});

test("Context Pack rejects invented capability lease IDs", () => {
  const fixture = leased();
  assert.throws(
    () =>
      buildContextPack({
        changeSet: fixture.manifest,
        candidateSha: "b".repeat(40),
        treeSha: "c".repeat(40),
        capabilityLeaseIds: ["lease-invented"],
        leaseRegistry: fixture.registry,
        owner: OWNER,
        generatedAt: NOW,
      }),
    /CONTEXT_CAPABILITY_LEASE_BINDING_MISMATCH/u,
  );
});

test("Context Pack rejects released capability leases", () => {
  const fixture = leased();
  const released = releaseCapabilityLeases({
    registry: fixture.registry,
    leaseIds: fixture.leaseIds,
    changeSetId: fixture.manifest.id,
    owner: OWNER,
    branch: fixture.manifest.branch,
  });
  assert.throws(
    () =>
      buildContextPack({
        changeSet: fixture.manifest,
        candidateSha: "b".repeat(40),
        treeSha: "c".repeat(40),
        capabilityLeaseIds: fixture.leaseIds,
        leaseRegistry: released,
        owner: OWNER,
        generatedAt: NOW,
      }),
    /REQUIRED_CAPABILITY_LEASE_MISSING/u,
  );
});

test("recomputed digest cannot hide projected authority tampering", () => {
  const fixture = leased();
  const pack = build(fixture);
  const tampered = structuredClone(pack);
  tampered.ownership.paths = ["tooling/other/**"];
  tampered.digest = contextPackDigest(tampered);
  assert.throws(
    () =>
      validateContextPack(tampered, fixture.manifest, {
        leaseRegistry: fixture.registry,
        owner: OWNER,
        now: NOW,
      }),
    /CONTEXT_OWNERSHIP_MISMATCH/u,
  );
});

test("Context Pack closed nested shape rejects unknown fields", () => {
  const fixture = leased();
  const pack = build(fixture);
  const tampered = structuredClone(pack);
  tampered.proofPlan.unexpected = true;
  tampered.digest = contextPackDigest(tampered);
  assert.throws(
    () =>
      validateContextPack(tampered, fixture.manifest, {
        leaseRegistry: fixture.registry,
        owner: OWNER,
        now: NOW,
      }),
    /CONTEXT_PROOF_PLAN_PROPERTY_UNKNOWN/u,
  );
});

test("Context Pack fails closed after digest-bearing identity tampering", () => {
  const fixture = leased();
  const pack = build(fixture);
  const tampered = { ...pack, candidateSha: "d".repeat(40) };
  assert.throws(
    () =>
      validateContextPack(tampered, fixture.manifest, {
        leaseRegistry: fixture.registry,
        owner: OWNER,
        now: NOW,
      }),
    /CONTEXT_DIGEST_MISMATCH/u,
  );
});

test("Context Pack size budget fails closed", () => {
  const manifest = changeSet();
  manifest.contextPack.maxBytes = 4096;
  manifest.owns.paths = Array.from(
    { length: 150 },
    (_, index) => "tooling/mdctl/path-" + index.toString().padStart(3, "0"),
  );
  const fixture = leased(manifest);
  assert.throws(() => build(fixture), /CONTEXT_PACK_TOO_LARGE/u);
});
