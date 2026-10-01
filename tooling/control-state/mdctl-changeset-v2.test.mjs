import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  changeSetDigest,
  validateChangeSetV2,
} from "../mdctl/changeset-v2.mjs";

const manifestPath = ".morro/changesets/MD-CP-AUTONOMOUS-BLOCK-B.json";

test("Block B dogfoods ChangeSet V2 with bounded executable proof", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateChangeSetV2(manifest);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.scope, "PLATFORM");
  assert.ok(manifest.requiredCapabilities.length >= 1);
  assert.ok(manifest.contextPack.maxBytes <= 1024 * 1024);
  assert.ok(manifest.proof.commands.length <= manifest.proof.budget.maxCommands);
  assert.match(changeSetDigest(manifest), /^sha256:[0-9a-f]{64}$/u);

  for (const command of manifest.proof.commands) {
    assert.equal(command.argv[0], "node");
    assert.equal(command.argv[1], "--test");
    for (const file of command.argv.slice(2)) {
      assert.equal((await stat(file)).isFile(), true, file);
    }
  }
});

test("Block B remote proof requirements remain explicit and non-local", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const evidence of [
    "automated-independent-proof",
    "exact-head-identity",
  ]) {
    assert.ok(manifest.requiredEvidence.includes(evidence));
    assert.ok(manifest.proof.requiredRemoteEvidence.includes(evidence));
  }
});
