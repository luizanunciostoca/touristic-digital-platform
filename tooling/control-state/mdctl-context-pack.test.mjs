import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextPack,
  contextPackDigest,
  validateContextPack,
} from "../mdctl/context-pack.mjs";

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

test("Context Pack is candidate-bound, compact and digest verified", () => {
  const pack = buildContextPack({
    changeSet: changeSet(),
    candidateSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    capabilityLeaseIds: ["lease-one"],
    generatedAt: "2026-10-01T09:00:00Z",
  });
  assert.equal(validateContextPack(pack, changeSet()), pack);
  assert.equal(pack.digest, contextPackDigest(pack));
  assert.equal(pack.candidateSha, "b".repeat(40));
  assert.ok(Buffer.byteLength(JSON.stringify(pack)) < 65536);
});

test("Context Pack fails closed after evidence-bearing identity tampering", () => {
  const pack = buildContextPack({
    changeSet: changeSet(),
    candidateSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    capabilityLeaseIds: ["lease-one"],
    generatedAt: "2026-10-01T09:00:00Z",
  });
  const tampered = { ...pack, candidateSha: "d".repeat(40) };
  assert.throws(
    () => validateContextPack(tampered, changeSet()),
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
  assert.throws(
    () =>
      buildContextPack({
        changeSet: manifest,
        candidateSha: "b".repeat(40),
        treeSha: "c".repeat(40),
        capabilityLeaseIds: ["lease-one"],
        generatedAt: "2026-10-01T09:00:00Z",
      }),
    /CONTEXT_PACK_TOO_LARGE/u,
  );
});
