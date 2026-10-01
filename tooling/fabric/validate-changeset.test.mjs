import assert from "node:assert/strict";
import test from "node:test";
import {
  validateChangeSet,
  validateLegacyChangeSet,
} from "./validate-changeset.mjs";
import {
  changeSetDigest,
  validateChangeSetV2,
} from "../mdctl/changeset-v2.mjs";

function v2() {
  return {
    schemaVersion: 2,
    id: "MD-TEST-V2",
    baseSha: "a".repeat(40),
    branch: "infra/test-v2",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: { paths: ["tooling/mdctl/**"], contracts: ["TEST-CONTRACT"] },
    reads: { contracts: ["GITHUB-CURRENT-MAIN"] },
    produces: { events: ["TASK_SUBMITTED"], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["local-proof", "remote-proof"],
    requiredCapabilities: ["github:read", "workspace:write:claimed-paths"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 2, maxSeconds: 120 },
      commands: [
        {
          id: "unit",
          argv: ["node", "--test", "tooling/test.test.mjs"],
          timeoutSeconds: 60,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
  };
}

test("ChangeSet V2 validates and has a stable canonical digest", () => {
  const manifest = v2();
  assert.equal(validateChangeSetV2(manifest), manifest);
  assert.equal(validateChangeSet(manifest), manifest);
  assert.match(changeSetDigest(manifest), /^sha256:[0-9a-f]{64}$/u);
  const reordered = Object.fromEntries(Object.entries(manifest).reverse());
  assert.equal(changeSetDigest(reordered), changeSetDigest(manifest));
});

test("ChangeSet V2 fails closed on unsafe ownership paths", () => {
  const manifest = v2();
  manifest.owns.paths = ["../secret"];
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_PATH_TRAVERSAL/u,
  );
});

test("ChangeSet V2 enforces proof budgets and bounded node test targets", () => {
  const manifest = v2();
  manifest.proof.commands[0].argv[0] = "bash";
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_PROOF_EXECUTABLE_DENIED/u,
  );

  manifest.proof.commands[0].argv = ["node", "-e", "process.exit(0)"];
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_PROOF_SUBCOMMAND_DENIED/u,
  );

  manifest.proof.commands[0].argv = ["node", "--test", "scripts/arbitrary.mjs"];
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_PROOF_TARGET_DENIED/u,
  );

  manifest.proof.commands[0].argv = [
    "node",
    "--test",
    "../tooling/escape.test.mjs",
  ];
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_PROOF_TARGET_TRAVERSAL/u,
  );

  manifest.proof.commands[0].argv = ["node", "--test", "tooling/test.test.mjs"];
  manifest.proof.commands[0].timeoutSeconds = 121;
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_PROOF_TIMEOUT_INVALID|CHANGESET_PROOF_TIME_BUDGET_EXCEEDED/u,
  );
});

test("remote evidence must also be declared required evidence", () => {
  const manifest = v2();
  manifest.proof.requiredRemoteEvidence = ["missing"];
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_REMOTE_EVIDENCE_NOT_REQUIRED/u,
  );
});

test("legacy ChangeSets remain valid during V2 rollout", () => {
  const legacy = {
    id: "MD-LEGACY",
    baseSha: "a".repeat(40),
    branch: "infra/legacy",
    state: "IMPLEMENTING",
    risk: "high",
    owns: { paths: ["tooling/legacy.mjs"] },
    dependencies: [],
    requiredEvidence: ["test"],
    stopAt: "REMOTE_PROVEN",
  };
  assert.equal(validateLegacyChangeSet(legacy), legacy);
  assert.equal(validateChangeSet(legacy), legacy);
});

test("ChangeSet V2 rejects unknown and missing closed-schema fields", () => {
  let manifest = { ...v2(), unexpected: true };
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_PROPERTY_UNKNOWN/u,
  );

  manifest = v2();
  delete manifest.reads;
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_FIELD_REQUIRED:reads/u,
  );

  manifest = v2();
  delete manifest.owns.contracts;
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_OWNS_FIELD_REQUIRED:contracts/u,
  );

  manifest = v2();
  manifest.proof.commands[0].unexpected = true;
  assert.throws(
    () => validateChangeSetV2(manifest),
    /CHANGESET_PROOF_COMMAND_PROPERTY_UNKNOWN/u,
  );
});

test("explicit unsupported schema versions fail closed", () => {
  assert.throws(
    () => validateChangeSet({ ...v2(), schemaVersion: 3 }),
    /unsupported ChangeSet schemaVersion/u,
  );
});
