import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ACTIVE_CLAIM_STATUSES = new Set([
  "CLAIMED",
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "PROOF_ACCEPTED",
  "INTEGRATION_READY",
]);

const WRITE_LIFECYCLE_STATES = new Set([
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "COMPOSITION_PROVEN",
  "POLICY_SATISFIED",
  "MERGE_READY",
]);

const AUTHORITY_STATES = new Map([
  ["WORKER", new Set(["IMPLEMENTING", "LOCAL_PROVEN", "REMOTE_PROVEN"])],
  [
    "INTEGRATOR",
    new Set(["COMPOSITION_PROVEN", "POLICY_SATISFIED", "MERGE_READY"]),
  ],
  ["ORCHESTRATOR", new Set(WRITE_LIFECYCLE_STATES)],
]);

const AUTHORITIES = new Set(AUTHORITY_STATES.keys());
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

export function assertSupportedPattern(pattern) {
  assert.equal(typeof pattern, "string", "CLAIM_PATTERN_INVALID");
  assert.ok(pattern.length > 0, "CLAIM_PATTERN_EMPTY");

  if (pattern.endsWith("/**")) {
    assert.equal(
      pattern.slice(0, -3).includes("*"),
      false,
      "CLAIM_PATTERN_WILDCARD_UNSUPPORTED",
    );
    return;
  }

  assert.equal(
    pattern.includes("*"),
    false,
    "CLAIM_PATTERN_WILDCARD_UNSUPPORTED",
  );
}

export function pathOwned(path, pattern) {
  assert.equal(typeof path, "string", "CLAIM_PATH_INVALID");
  assertSupportedPattern(pattern);

  if (pattern.endsWith("/**")) {
    return path.startsWith(pattern.slice(0, -2));
  }

  return path === pattern;
}

export function patternsOverlap(left, right) {
  assertSupportedPattern(left);
  assertSupportedPattern(right);

  if (left === right) return true;

  const leftRecursive = left.endsWith("/**");
  const rightRecursive = right.endsWith("/**");

  if (leftRecursive && rightRecursive) {
    const leftPrefix = left.slice(0, -2);
    const rightPrefix = right.slice(0, -2);
    return (
      leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix)
    );
  }

  if (leftRecursive) return pathOwned(right, left);
  if (rightRecursive) return pathOwned(left, right);

  return false;
}

function parseExpiry(value) {
  assert.equal(typeof value, "string", "CLAIM_EXPIRY_INVALID");
  const timestamp = Date.parse(value);
  assert.ok(Number.isFinite(timestamp), "CLAIM_EXPIRY_INVALID");
  return timestamp;
}

export function findClaimCollisions(registry, claimId, now = Date.now()) {
  assert.equal(
    registry?.registryAuthority,
    "ORCHESTRATOR",
    "REGISTRY_AUTHORITY_INVALID",
  );
  assert.ok(
    registry.claims && typeof registry.claims === "object",
    "CLAIM_REGISTRY_INVALID",
  );

  const current = registry.claims[claimId];
  assert.ok(current, "ACTIVE_CLAIM_MISSING");

  const collisions = [];
  for (const [otherId, other] of Object.entries(registry.claims)) {
    if (otherId === claimId) continue;
    if (!ACTIVE_CLAIM_STATUSES.has(other.status)) continue;
    if (parseExpiry(other.expiresAt) <= now) continue;

    if (other.branch === current.branch) {
      collisions.push({ otherId, kind: "branch", value: current.branch });
    }

    for (const left of current.paths ?? []) {
      for (const right of other.paths ?? []) {
        if (patternsOverlap(left, right)) {
          collisions.push({
            otherId,
            kind: "path",
            value: `${left} <-> ${right}`,
          });
        }
      }
    }
  }

  return collisions;
}

export function validateClaimContext({
  registry,
  manifest,
  branch,
  currentBaseSha,
  branchHeadSha,
  changedFiles,
  now = Date.now(),
  authority = "WORKER",
  isAncestor = () => true,
}) {
  assert.equal(
    registry?.registryAuthority,
    "ORCHESTRATOR",
    "REGISTRY_AUTHORITY_INVALID",
  );
  assert.ok(
    registry.claims && typeof registry.claims === "object",
    "CLAIM_REGISTRY_INVALID",
  );
  assert.ok(manifest && typeof manifest === "object", "CHANGESET_REQUIRED");
  assert.match(manifest.id ?? "", /^MD-[A-Z0-9-]+$/u, "CHANGESET_ID_INVALID");
  assert.match(
    manifest.baseSha ?? "",
    SHA_PATTERN,
    "CHANGESET_BASE_SHA_INVALID",
  );
  assert.ok(
    WRITE_LIFECYCLE_STATES.has(manifest.state),
    "CHANGESET_NOT_WRITE_ACTIVE",
  );
  assert.ok(AUTHORITIES.has(authority), "CLAIM_GUARD_AUTHORITY_INVALID");
  assert.ok(
    AUTHORITY_STATES.get(authority).has(manifest.state),
    "CHANGESET_STATE_AUTHORITY_VIOLATION",
  );
  assert.equal(typeof branch, "string", "BRANCH_REQUIRED");
  assert.match(currentBaseSha ?? "", SHA_PATTERN, "CURRENT_BASE_SHA_INVALID");
  assert.match(branchHeadSha ?? "", SHA_PATTERN, "BRANCH_HEAD_SHA_INVALID");
  assert.ok(Array.isArray(changedFiles), "CHANGED_FILES_REQUIRED");

  const claim = registry.claims[manifest.id];
  assert.ok(claim, "ACTIVE_CLAIM_MISSING");
  assert.ok(ACTIVE_CLAIM_STATUSES.has(claim.status), "CLAIM_STATUS_INACTIVE");
  assert.equal(
    claim.reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "CLAIM_REVIEW_AUTHORITY_INVALID",
  );
  assert.equal(claim.branch, manifest.branch, "CLAIM_MANIFEST_BRANCH_MISMATCH");
  assert.equal(branch, manifest.branch, "CLAIM_RUNTIME_BRANCH_MISMATCH");
  assert.match(claim.baseSha ?? "", SHA_PATTERN, "CLAIM_BASE_SHA_INVALID");
  assert.equal(claim.baseSha, manifest.baseSha, "CLAIM_MANIFEST_BASE_MISMATCH");
  assert.ok(parseExpiry(claim.expiresAt) > now, "CLAIM_EXPIRED");

  assert.ok(
    Array.isArray(claim.paths) && claim.paths.length > 0,
    "CLAIM_PATHS_REQUIRED",
  );
  assert.ok(
    Array.isArray(manifest.owns?.paths) && manifest.owns.paths.length > 0,
    "CHANGESET_OWNERSHIP_REQUIRED",
  );

  for (const pattern of claim.paths) assertSupportedPattern(pattern);
  for (const pattern of manifest.owns.paths) assertSupportedPattern(pattern);

  assert.ok(
    isAncestor(manifest.baseSha, currentBaseSha),
    "CLAIM_BASE_NOT_ANCESTOR_OF_CURRENT_BASE",
  );
  assert.ok(
    isAncestor(currentBaseSha, branchHeadSha),
    "CURRENT_BASE_NOT_ANCESTOR_OF_BRANCH_HEAD",
  );

  const collisions = findClaimCollisions(registry, manifest.id, now);
  assert.deepEqual(collisions, [], "CLAIM_OVERLAP_DETECTED");

  const unauthorizedByClaim = changedFiles.filter(
    (path) => !claim.paths.some((pattern) => pathOwned(path, pattern)),
  );
  assert.deepEqual(unauthorizedByClaim, [], "CLAIM_PATH_VIOLATION");

  const unauthorizedByManifest = changedFiles.filter(
    (path) => !manifest.owns.paths.some((pattern) => pathOwned(path, pattern)),
  );
  assert.deepEqual(unauthorizedByManifest, [], "CHANGESET_OWNERSHIP_VIOLATION");

  if (changedFiles.includes(".github/morro-control/claims.json")) {
    assert.equal(
      authority,
      "ORCHESTRATOR",
      "WORKER_CLAIM_REGISTRY_MUTATION_FORBIDDEN",
    );
    assert.ok(
      manifest.owns.paths.includes(".github/morro-control/claims.json"),
      "ORCHESTRATOR_CLAIM_REGISTRY_OWNERSHIP_REQUIRED",
    );
  }

  return {
    claimId: manifest.id,
    owner: claim.owner,
    reviewer: claim.reviewer,
    branch,
    claimBaseSha: claim.baseSha,
    currentBaseSha,
    branchHeadSha,
    changedFiles,
    authority,
    collisions: 0,
  };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function isGitAncestor(root, ancestor, descendant) {
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

export function resolveCandidatePath(root, candidatePath) {
  assert.equal(typeof candidatePath, "string", "CANDIDATE_PATH_INVALID");
  assert.ok(candidatePath.length > 0, "CANDIDATE_PATH_EMPTY");
  assert.equal(
    isAbsolute(candidatePath),
    false,
    "CANDIDATE_PATH_MUST_BE_RELATIVE",
  );

  const rootReal = realpathSync(root);
  const resolved = resolve(rootReal, candidatePath);
  const lexicalRelative = relative(rootReal, resolved);
  assert.ok(
    lexicalRelative &&
      lexicalRelative !== ".." &&
      !lexicalRelative.startsWith(`..${sep}`) &&
      !isAbsolute(lexicalRelative),
    "CANDIDATE_PATH_OUTSIDE_ROOT",
  );

  const real = realpathSync(resolved);
  const realRelative = relative(rootReal, real);
  assert.ok(
    realRelative &&
      realRelative !== ".." &&
      !realRelative.startsWith(`..${sep}`) &&
      !isAbsolute(realRelative),
    "CANDIDATE_PATH_OUTSIDE_ROOT",
  );

  return real;
}

function sortedStrings(values, code) {
  assert.ok(Array.isArray(values) && values.length > 0, code);
  return [...values].sort();
}

export function validateClaimHandoff({
  baseRegistry,
  candidateRegistry,
  baseFromManifest,
  candidateFromManifest,
  toManifest,
  now = Date.now(),
}) {
  assert.equal(
    baseRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "HANDOFF_BASE_REGISTRY_AUTHORITY_INVALID",
  );
  assert.equal(
    candidateRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "HANDOFF_CANDIDATE_REGISTRY_AUTHORITY_INVALID",
  );

  const fromId = baseFromManifest?.id;
  const toId = toManifest?.id;
  assert.match(fromId ?? "", /^MD-[A-Z0-9-]+$/u, "HANDOFF_FROM_ID_INVALID");
  assert.match(toId ?? "", /^MD-[A-Z0-9-]+$/u, "HANDOFF_TO_ID_INVALID");
  assert.notEqual(fromId, toId, "HANDOFF_IDS_MUST_DIFFER");

  assert.equal(candidateFromManifest?.id, fromId, "HANDOFF_FROM_ID_CHANGED");
  assert.equal(
    candidateFromManifest?.branch,
    baseFromManifest?.branch,
    "HANDOFF_FROM_BRANCH_CHANGED",
  );
  assert.equal(
    candidateFromManifest?.baseSha,
    baseFromManifest?.baseSha,
    "HANDOFF_FROM_BASE_CHANGED",
  );
  assert.equal(
    candidateFromManifest?.state,
    "MERGED",
    "HANDOFF_FROM_NOT_MERGED",
  );
  assert.equal(
    toManifest?.state,
    "IMPLEMENTING",
    "HANDOFF_TO_NOT_IMPLEMENTING",
  );
  assert.ok(
    Array.isArray(toManifest?.dependencies) &&
      toManifest.dependencies.includes(fromId),
    "HANDOFF_DEPENDENCY_MISSING",
  );

  const baseClaim = baseRegistry.claims?.[fromId];
  assert.ok(baseClaim, "HANDOFF_BASE_CLAIM_MISSING");
  assert.ok(
    ACTIVE_CLAIM_STATUSES.has(baseClaim.status),
    "HANDOFF_BASE_CLAIM_INACTIVE",
  );
  assert.ok(
    parseExpiry(baseClaim.expiresAt) > now,
    "HANDOFF_BASE_CLAIM_EXPIRED",
  );
  assert.equal(
    baseClaim.reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "HANDOFF_BASE_REVIEW_AUTHORITY_INVALID",
  );
  assert.equal(
    baseClaim.branch,
    baseFromManifest.branch,
    "HANDOFF_BASE_BRANCH_MISMATCH",
  );
  assert.equal(
    baseClaim.baseSha,
    baseFromManifest.baseSha,
    "HANDOFF_BASE_SHA_MISMATCH",
  );
  assert.deepEqual(
    sortedStrings(baseClaim.paths, "HANDOFF_BASE_PATHS_REQUIRED"),
    sortedStrings(
      baseFromManifest.owns?.paths,
      "HANDOFF_BASE_OWNERSHIP_REQUIRED",
    ),
    "HANDOFF_BASE_PATHS_MISMATCH",
  );

  assert.equal(
    candidateRegistry.claims?.[fromId],
    undefined,
    "HANDOFF_OLD_CLAIM_STILL_ACTIVE",
  );

  const toClaim = candidateRegistry.claims?.[toId];
  assert.ok(toClaim, "HANDOFF_TARGET_CLAIM_MISSING");
  assert.equal(toClaim.status, "IMPLEMENTING", "HANDOFF_TARGET_STATUS_INVALID");
  assert.equal(
    toClaim.reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "HANDOFF_TARGET_REVIEW_AUTHORITY_INVALID",
  );
  assert.equal(
    toClaim.branch,
    toManifest.branch,
    "HANDOFF_TARGET_BRANCH_MISMATCH",
  );
  assert.equal(
    toClaim.baseSha,
    toManifest.baseSha,
    "HANDOFF_TARGET_BASE_MISMATCH",
  );
  assert.ok(
    parseExpiry(toClaim.expiresAt) > now,
    "HANDOFF_TARGET_CLAIM_EXPIRED",
  );
  assert.deepEqual(
    sortedStrings(toClaim.paths, "HANDOFF_TARGET_PATHS_REQUIRED"),
    sortedStrings(toManifest.owns?.paths, "HANDOFF_TARGET_OWNERSHIP_REQUIRED"),
    "HANDOFF_TARGET_PATHS_MISMATCH",
  );

  for (const pattern of toClaim.paths) assertSupportedPattern(pattern);
  assert.deepEqual(
    findClaimCollisions(candidateRegistry, toId, now),
    [],
    "HANDOFF_TARGET_OVERLAP_DETECTED",
  );

  return {
    fromId,
    toId,
    fromState: candidateFromManifest.state,
    toState: toManifest.state,
    targetBranch: toManifest.branch,
    targetBaseSha: toManifest.baseSha,
    targetStatus: toClaim.status,
    authority: "ORCHESTRATOR",
    collisions: 0,
  };
}

export function buildClaimHandoffProof(
  baseRoot,
  candidateRoot,
  env = process.env,
) {
  const trustedRoot = resolve(baseRoot);
  const targetRoot = resolve(candidateRoot);
  const expectedHead = env.EXPECTED_CANDIDATE_SHA ?? "";
  const expectedBase = env.EXPECTED_BASE_SHA ?? "";
  const expectedBranch = env.EXPECTED_BRANCH ?? "";
  const reconciliationManifestPath = env.MANIFEST_PATH ?? "";
  const fromManifestPath = env.HANDOFF_FROM_MANIFEST_PATH ?? "";
  const toManifestPath = env.HANDOFF_TO_MANIFEST_PATH ?? "";
  const registryPath =
    env.CLAIM_REGISTRY_PATH ?? ".github/morro-control/claims.json";

  assert.match(expectedHead, SHA_PATTERN, "EXPECTED_HEAD_INVALID");
  assert.match(expectedBase, SHA_PATTERN, "EXPECTED_BASE_INVALID");
  assert.ok(expectedBranch, "EXPECTED_BRANCH_REQUIRED");
  assert.ok(reconciliationManifestPath, "MANIFEST_PATH_REQUIRED");
  assert.ok(fromManifestPath, "HANDOFF_FROM_MANIFEST_PATH_REQUIRED");
  assert.ok(toManifestPath, "HANDOFF_TO_MANIFEST_PATH_REQUIRED");
  assert.notEqual(
    reconciliationManifestPath,
    fromManifestPath,
    "HANDOFF_RECONCILIATION_EQUALS_SOURCE_MANIFEST",
  );
  assert.notEqual(
    reconciliationManifestPath,
    toManifestPath,
    "HANDOFF_RECONCILIATION_EQUALS_TARGET_MANIFEST",
  );

  const baseHead = git(trustedRoot, ["rev-parse", "HEAD"]);
  const candidateHead = git(targetRoot, ["rev-parse", "HEAD"]);
  const treeSha = git(targetRoot, ["rev-parse", "HEAD^{tree}"]);
  assert.equal(baseHead, expectedBase, "HANDOFF_BASE_SHA_MISMATCH");
  assert.equal(candidateHead, expectedHead, "CANDIDATE_SHA_MISMATCH");

  const dirty = git(targetRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  assert.equal(dirty, "", "DIRTY_CANDIDATE_WORKTREE");

  const baseRegistry = JSON.parse(
    readFileSync(resolveCandidatePath(trustedRoot, registryPath), "utf8"),
  );
  const candidateRegistry = JSON.parse(
    readFileSync(resolveCandidatePath(targetRoot, registryPath), "utf8"),
  );
  const baseFromManifest = JSON.parse(
    readFileSync(resolveCandidatePath(trustedRoot, fromManifestPath), "utf8"),
  );
  const candidateFromManifest = JSON.parse(
    readFileSync(resolveCandidatePath(targetRoot, fromManifestPath), "utf8"),
  );
  const toManifest = JSON.parse(
    readFileSync(resolveCandidatePath(targetRoot, toManifestPath), "utf8"),
  );
  const reconciliationManifest = JSON.parse(
    readFileSync(
      resolveCandidatePath(targetRoot, reconciliationManifestPath),
      "utf8",
    ),
  );

  const changedRaw = git(targetRoot, [
    "diff",
    "--name-only",
    `${expectedBase}...${candidateHead}`,
  ]);
  const changedFiles = changedRaw ? changedRaw.split("\n").filter(Boolean) : [];

  assert.match(
    reconciliationManifest.id ?? "",
    /^MD-[A-Z0-9-]+$/u,
    "HANDOFF_RECONCILIATION_ID_INVALID",
  );
  assert.notEqual(
    reconciliationManifest.id,
    baseFromManifest.id,
    "HANDOFF_RECONCILIATION_ID_COLLIDES_WITH_SOURCE",
  );
  assert.notEqual(
    reconciliationManifest.id,
    toManifest.id,
    "HANDOFF_RECONCILIATION_ID_COLLIDES_WITH_TARGET",
  );
  assert.equal(
    reconciliationManifest.baseSha,
    expectedBase,
    "HANDOFF_RECONCILIATION_BASE_MISMATCH",
  );
  assert.equal(
    reconciliationManifest.branch,
    expectedBranch,
    "HANDOFF_RECONCILIATION_BRANCH_MISMATCH",
  );
  assert.equal(
    reconciliationManifest.state,
    "MERGE_READY",
    "HANDOFF_RECONCILIATION_NOT_MERGE_READY",
  );
  assert.equal(
    toManifest.baseSha,
    expectedBase,
    "HANDOFF_TARGET_BASE_NOT_CURRENT_BASE",
  );

  for (const requiredPath of [
    registryPath,
    fromManifestPath,
    toManifestPath,
    reconciliationManifestPath,
  ]) {
    assert.ok(
      reconciliationManifest.owns?.paths?.includes(requiredPath),
      "HANDOFF_RECONCILIATION_OWNERSHIP_INCOMPLETE",
    );
  }

  const unauthorized = changedFiles.filter(
    (path) =>
      !reconciliationManifest.owns.paths.some((pattern) =>
        pathOwned(path, pattern),
      ),
  );
  assert.deepEqual(
    unauthorized,
    [],
    "HANDOFF_RECONCILIATION_CHANGED_PATH_VIOLATION",
  );

  const handoff = validateClaimHandoff({
    baseRegistry,
    candidateRegistry,
    baseFromManifest,
    candidateFromManifest,
    toManifest,
  });

  return {
    contract: "MORRO-DETERMINISTIC-CLAIM-HANDOFF",
    status: "pass",
    failClosed: true,
    exactHead: candidateHead,
    treeSha,
    currentBaseSha: baseHead,
    reconciliationChangeSetId: reconciliationManifest.id,
    reconciliationBranch: reconciliationManifest.branch,
    changedFiles,
    ...handoff,
  };
}

export function buildClaimGuardProof(root, env = process.env) {
  const targetRoot = resolve(root);
  const expectedHead = env.EXPECTED_CANDIDATE_SHA ?? "";
  const expectedBase = env.EXPECTED_BASE_SHA ?? "";
  const expectedBranch = env.EXPECTED_BRANCH ?? "";
  const manifestPath = env.MANIFEST_PATH ?? "";
  const registryPath =
    env.CLAIM_REGISTRY_PATH ?? ".github/morro-control/claims.json";
  const authority = env.CLAIM_GUARD_AUTHORITY ?? "WORKER";

  assert.match(expectedHead, SHA_PATTERN, "EXPECTED_HEAD_INVALID");
  assert.match(expectedBase, SHA_PATTERN, "EXPECTED_BASE_INVALID");
  assert.ok(expectedBranch, "EXPECTED_BRANCH_REQUIRED");
  assert.ok(manifestPath, "MANIFEST_PATH_REQUIRED");

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
    isGitAncestor(targetRoot, expectedBase, headSha),
    "CURRENT_BASE_NOT_ANCESTOR",
  );

  const manifestFile = resolveCandidatePath(targetRoot, manifestPath);
  const registryFile = resolveCandidatePath(targetRoot, registryPath);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const registry = JSON.parse(readFileSync(registryFile, "utf8"));

  const changedRaw = git(targetRoot, [
    "diff",
    "--name-only",
    `${expectedBase}...${headSha}`,
  ]);
  const changedFiles = changedRaw ? changedRaw.split("\n").filter(Boolean) : [];

  const claim = validateClaimContext({
    registry,
    manifest,
    branch: expectedBranch,
    currentBaseSha: expectedBase,
    branchHeadSha: headSha,
    changedFiles,
    authority,
    isAncestor: (ancestor, descendant) =>
      isGitAncestor(targetRoot, ancestor, descendant),
  });

  return {
    contract: "MORRO-DETERMINISTIC-CLAIM-GUARD",
    status: "pass",
    failClosed: true,
    exactHead: headSha,
    treeSha,
    ...claim,
  };
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
    "UNEXPECTED_CLAIM_GUARD_ERROR"
  );
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    if (process.argv[2] === "--handoff") {
      console.log(
        JSON.stringify(
          buildClaimHandoffProof(
            process.argv[3] ?? ".",
            process.argv[4] ?? ".",
          ),
        ),
      );
    } else {
      console.log(JSON.stringify(buildClaimGuardProof(process.argv[2] ?? ".")));
    }
  } catch (cause) {
    console.error(`MORRO_CLAIM_GUARD_FAILED:${diagnosticCode(cause)}`);
    process.exitCode = 1;
  }
}
