import assert from "node:assert/strict";
import test from "node:test";
import {
  pathOwned,
  validateManifestAndFiles,
} from "./independent-proof-trusted.mjs";

const manifest = {
  id: "MD-TEST-001",
  baseSha: "a".repeat(40),
  state: "REMOTE_PROVEN",
  owns: {
    paths: [
      ".github/agents/**",
      ".github/workflows/example.yml",
      ".morro/changesets/MD-TEST-001.json",
    ],
  },
  requiredEvidence: ["format", "automated-independent-proof"],
};

test("exact and recursive ownership patterns match only their scope", () => {
  assert.equal(pathOwned(".github/agents/a.agent.md", ".github/agents/**"), true);
  assert.equal(pathOwned(".github/agents2/a.agent.md", ".github/agents/**"), false);
  assert.equal(
    pathOwned(".github/workflows/example.yml", ".github/workflows/example.yml"),
    true,
  );
});

test("proof accepts only files covered by the ChangeSet", () => {
  const proof = validateManifestAndFiles(manifest, [
    ".github/agents/a.agent.md",
    ".github/workflows/example.yml",
    ".morro/changesets/MD-TEST-001.json",
  ]);
  assert.equal(proof.changeSetId, "MD-TEST-001");
});

test("proof rejects an unowned write", () => {
  assert.throws(
    () =>
      validateManifestAndFiles(manifest, [
        ".github/agents/a.agent.md",
        ".github/morro-control/claims.json",
      ]),
    /CHANGESET_OWNERSHIP_VIOLATION/u,
  );
});

test("proof rejects unsupported wildcard ownership", () => {
  const widened = structuredClone(manifest);
  widened.owns.paths = [".github/*/unsafe.yml"];
  assert.throws(
    () => validateManifestAndFiles(widened, [".github/x/unsafe.yml"]),
    /UNSUPPORTED_OWNERSHIP_PATTERN/u,
  );
});

test("proof rejects pre-proof lifecycle state", () => {
  const implementing = structuredClone(manifest);
  implementing.state = "IMPLEMENTING";
  assert.throws(
    () => validateManifestAndFiles(implementing, []),
    /MANIFEST_NOT_PROOF_READY/u,
  );
});
