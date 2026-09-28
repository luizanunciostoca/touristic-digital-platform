import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildIndependentProof,
  pathOwned,
  validateManifestAndFiles,
  validateManifestPath,
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
  assert.equal(
    pathOwned(".github/agents/a.agent.md", ".github/agents/**"),
    true,
  );
  assert.equal(
    pathOwned(".github/agents2/a.agent.md", ".github/agents/**"),
    false,
  );
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

test("manifest input is a canonical regular file under the candidate", (t) => {
  const root = mkdtempSync(join(tmpdir(), "proof-path-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".morro/changesets"), { recursive: true });
  const name = ".morro/changesets/MD-TEST-001.json";
  writeFileSync(join(root, name), "{}");
  assert.equal(
    validateManifestPath(root, name),
    join(realpathSync(root), name),
  );
});

test("independent proof rejects a manifest whose filename and internal id differ", (t) => {
  const root = mkdtempSync(join(tmpdir(), "proof-id-path-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".morro/changesets"), { recursive: true });
  const path = ".morro/changesets/MD-TEST-001.json";
  writeFileSync(
    join(root, path),
    JSON.stringify({ ...manifest, id: "MD-DIFFERENT" }),
  );
  assert.throws(
    () => buildIndependentProof(root, path, {}),
    /MANIFEST_ID_PATH_MISMATCH/u,
  );
});

test("manifest input rejects traversal, absolute paths and shell metacharacters", () => {
  for (const value of [
    "../MD-TEST.json",
    "/tmp/MD-TEST.json",
    ".morro/changesets/../MD-TEST.json",
    ".morro/changesets/MD-TEST.json\n",
    '.morro/changesets/MD-TEST.json"; echo injected; #',
    ".morro/changesets/MD-TEST.json/extra",
    ".morro/changesets/OTHER.json",
    null,
  ]) {
    assert.throws(
      () => validateManifestPath(".", value),
      /MANIFEST_PATH_INVALID/u,
    );
  }
});

test("manifest input rejects symbolic links and directories", (t) => {
  const root = mkdtempSync(join(tmpdir(), "proof-link-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".morro/changesets"), { recursive: true });
  writeFileSync(join(root, "outside.json"), "{}");
  symlinkSync(
    join(root, "outside.json"),
    join(root, ".morro/changesets/MD-LINK.json"),
  );
  mkdirSync(join(root, ".morro/changesets/MD-DIR.json"));
  for (const name of ["MD-LINK", "MD-DIR"]) {
    assert.throws(
      () => validateManifestPath(root, `.morro/changesets/${name}.json`),
      /MANIFEST_NOT_REGULAR_FILE/u,
    );
  }
});

test("manifest input rejects a symlinked changeset directory", (t) => {
  const root = mkdtempSync(join(tmpdir(), "proof-parent-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".morro"));
  mkdirSync(join(root, "elsewhere"));
  writeFileSync(join(root, "elsewhere/MD-TEST.json"), "{}");
  symlinkSync(join(root, "elsewhere"), join(root, ".morro/changesets"));
  assert.throws(
    () => validateManifestPath(root, ".morro/changesets/MD-TEST.json"),
    /MANIFEST_PATH_ESCAPE/u,
  );
});

test("trusted bootstrap validates registry writes generically under orchestrator authority", () => {
  const workflow = readFileSync(
    new URL(
      "../../.github/workflows/morro-claim-guard-trust-bootstrap.yml",
      import.meta.url,
    ),
    "utf8",
  );
  for (const marker of [
    "needs: unit",
    "MANIFEST_PATH: ${{ needs.unit.outputs.manifest_path }}",
    "CLAIM_GUARD_AUTHORITY: ORCHESTRATOR",
    "grep -Fxq '.github/morro-control/claims.json'",
    'test "$owner" = "CHATGPT-PRO-CONTROL"',
    "steps.registry-proof.outputs.required == 'true'",
  ]) {
    assert.ok(workflow.includes(marker), marker);
  }
  assert.equal(
    workflow.includes(
      "github.event.pull_request.head.ref == 'infra/remediation-workspace-claim-registration-20260928'",
    ),
    false,
  );
});

test("agent profile caller resolves the branch ChangeSet instead of using a hardcoded manifest", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/morro-agent-profiles.yml", import.meta.url),
    "utf8",
  );
  for (const marker of [
    "resolve-agent-profile-changeset",
    'node tooling/fabric/resolve-changeset.mjs "$HEAD_BRANCH"',
    "needs: resolve-changeset",
    "manifest_path: ${{ needs.resolve-changeset.outputs.manifest_path }}",
  ]) {
    assert.ok(workflow.includes(marker), marker);
  }
  assert.equal(
    workflow.includes("manifest_path: ${{ startsWith("),
    false,
  );
});
