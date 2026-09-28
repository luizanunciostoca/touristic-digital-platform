import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROOF_STATES = new Set([
  "REMOTE_PROVEN",
  "COMPOSITION_PROVEN",
  "POLICY_SATISFIED",
  "MERGE_READY",
]);
const REMOTE_PROOF_INPUT_STATES = new Set(["IMPLEMENTING", "LOCAL_PROVEN"]);
const RUN_ID = /^[1-9][0-9]*$/u;

export function trustedRemoteProofContext(env = process.env) {
  if (env.TRUSTED_REMOTE_PROOF !== "1") {
    return { enabled: false, workflowRunId: null };
  }
  assert.equal(env.GITHUB_ACTIONS, "true", "REMOTE_PROOF_CONTEXT_INVALID");
  assert.match(env.GITHUB_RUN_ID ?? "", RUN_ID, "REMOTE_PROOF_RUN_ID_INVALID");
  return { enabled: true, workflowRunId: env.GITHUB_RUN_ID };
}

export function resolveProofLifecycle(
  manifestState,
  { enabled = false, workflowRunId = null } = {},
) {
  if (PROOF_STATES.has(manifestState)) {
    return {
      manifestState,
      provenState: manifestState,
      remotePromotionApplied: false,
      workflowRunId: enabled ? workflowRunId : null,
    };
  }
  assert.ok(
    enabled && REMOTE_PROOF_INPUT_STATES.has(manifestState),
    "MANIFEST_NOT_PROOF_READY",
  );
  assert.match(workflowRunId ?? "", RUN_ID, "REMOTE_PROOF_RUN_ID_INVALID");
  return {
    manifestState,
    provenState: "REMOTE_PROVEN",
    remotePromotionApplied: true,
    workflowRunId,
  };
}

export function pathOwned(path, pattern) {
  assert.equal(typeof path, "string", "CHANGED_PATH_INVALID");
  assert.equal(typeof pattern, "string", "OWNED_PATTERN_INVALID");
  if (pattern.endsWith("/**")) {
    return path.startsWith(pattern.slice(0, -2));
  }
  assert.ok(!pattern.includes("*"), "UNSUPPORTED_OWNERSHIP_PATTERN");
  return path === pattern;
}

export function validateManifestAndFiles(
  manifest,
  changedFiles,
  { proofContext = { enabled: false, workflowRunId: null } } = {},
) {
  assert.ok(manifest && typeof manifest === "object", "MANIFEST_REQUIRED");
  assert.match(manifest.id ?? "", /^MD-[A-Z0-9-]+$/u, "MANIFEST_ID_INVALID");
  assert.match(
    manifest.baseSha ?? "",
    /^[0-9a-f]{40}$/u,
    "MANIFEST_BASE_SHA_INVALID",
  );
  const lifecycle = resolveProofLifecycle(manifest.state, proofContext);
  assert.ok(
    Array.isArray(manifest.owns?.paths) && manifest.owns.paths.length > 0,
    "OWNED_PATHS_REQUIRED",
  );
  assert.ok(
    Array.isArray(manifest.requiredEvidence) &&
      manifest.requiredEvidence.length > 0,
    "REQUIRED_EVIDENCE_MISSING",
  );

  const unauthorized = changedFiles.filter(
    (path) => !manifest.owns.paths.some((pattern) => pathOwned(path, pattern)),
  );
  assert.deepEqual(unauthorized, [], "CHANGESET_OWNERSHIP_VIOLATION");

  if (changedFiles.includes(".github/morro-control/claims.json")) {
    assert.ok(
      manifest.owns.paths.includes(".github/morro-control/claims.json"),
      "CLAIM_REGISTRY_AUTHORITY_VIOLATION",
    );
  }

  return {
    changeSetId: manifest.id,
    state: lifecycle.provenState,
    manifestState: lifecycle.manifestState,
    provenState: lifecycle.provenState,
    remotePromotionApplied: lifecycle.remotePromotionApplied,
    workflowRunId: lifecycle.workflowRunId,
    changedFiles,
    ownedPatterns: manifest.owns.paths,
  };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function isAncestor(root, ancestor, descendant) {
  try {
    execFileSync(
      "git",
      ["-C", root, "merge-base", "--is-ancestor", ancestor, descendant],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

function diagnosticCode(cause) {
  const message =
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
      ? cause.message
      : "";
  return (
    message.match(/[A-Z][A-Z0-9_:.-]{2,160}/u)?.[0] ??
    "UNEXPECTED_INDEPENDENT_PROOF_ERROR"
  );
}

export function validateManifestPath(root, manifestPath) {
  assert.equal(typeof manifestPath, "string", "MANIFEST_PATH_INVALID");
  assert.match(
    manifestPath,
    /^\.morro\/changesets\/MD-[A-Z0-9-]+\.json$/u,
    "MANIFEST_PATH_INVALID",
  );
  const canonicalRoot = realpathSync(resolve(root));
  const expectedPath = resolve(canonicalRoot, manifestPath);
  assert.ok(lstatSync(expectedPath).isFile(), "MANIFEST_NOT_REGULAR_FILE");
  assert.equal(
    realpathSync(expectedPath),
    expectedPath,
    "MANIFEST_PATH_ESCAPE",
  );
  return expectedPath;
}

export function buildIndependentProof(root, manifestPath, env = process.env) {
  const targetRoot = resolve(root);
  const manifest = JSON.parse(
    readFileSync(validateManifestPath(targetRoot, manifestPath), "utf8"),
  );

  assert.equal(
    manifestPath,
    `.morro/changesets/${manifest.id}.json`,
    "MANIFEST_ID_PATH_MISMATCH",
  );

  const expectedHead = env.EXPECTED_CANDIDATE_SHA ?? "";
  const expectedBase = env.EXPECTED_BASE_SHA ?? "";
  const trustedValidatorSha = env.TRUSTED_VALIDATOR_SHA ?? "";
  const trustedValidatorTreeSha = env.TRUSTED_VALIDATOR_TREE_SHA ?? "";

  assert.match(expectedHead, /^[0-9a-f]{40}$/u, "EXPECTED_HEAD_INVALID");
  assert.match(expectedBase, /^[0-9a-f]{40}$/u, "EXPECTED_BASE_INVALID");
  assert.match(
    trustedValidatorSha,
    /^[0-9a-f]{40}$/u,
    "TRUSTED_VALIDATOR_SHA_INVALID",
  );
  assert.match(
    trustedValidatorTreeSha,
    /^[0-9a-f]{40}$/u,
    "TRUSTED_VALIDATOR_TREE_INVALID",
  );

  const dirty = git(targetRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  assert.equal(dirty, "", "DIRTY_CANDIDATE_WORKTREE");

  const headSha = git(targetRoot, ["rev-parse", "HEAD"]);
  const treeSha = git(targetRoot, ["rev-parse", "HEAD^{tree}"]);
  assert.equal(headSha, expectedHead, "CANDIDATE_SHA_MISMATCH");
  assert.ok(
    isAncestor(targetRoot, expectedBase, headSha),
    "CURRENT_BASE_NOT_ANCESTOR",
  );
  assert.ok(
    isAncestor(targetRoot, manifest.baseSha, headSha),
    "MANIFEST_BASE_NOT_ANCESTOR",
  );

  const changedRaw = git(targetRoot, [
    "diff",
    "--name-only",
    `${expectedBase}...${headSha}`,
  ]);
  const changedFiles = changedRaw ? changedRaw.split("\n") : [];
  const proofContext = trustedRemoteProofContext(env);
  const manifestProof = validateManifestAndFiles(manifest, changedFiles, {
    proofContext,
  });

  return {
    contract: "MORRO-AUTOMATED-INDEPENDENT-PROOF",
    status: "pass",
    authority: "AUTOMATED-INDEPENDENT-PROOF",
    humanReviewerRequired: false,
    exactHead: headSha,
    treeSha,
    currentBaseSha: expectedBase,
    manifestBaseSha: manifest.baseSha,
    trustedValidatorSha,
    trustedValidatorTreeSha,
    ...manifestProof,
  };
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const [root = ".", manifestPath] = process.argv.slice(2);
    assert.ok(manifestPath, "MANIFEST_PATH_REQUIRED");
    console.log(JSON.stringify(buildIndependentProof(root, manifestPath)));
  } catch (cause) {
    console.error(
      `MORRO_AUTOMATED_INDEPENDENT_PROOF_FAILED:${diagnosticCode(cause)}`,
    );
    process.exitCode = 1;
  }
}
