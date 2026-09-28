import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  assertSupportedPattern,
  buildClaimGuardProof,
  findClaimCollisions,
  pathOwned,
  patternsOverlap,
  resolveCandidatePath,
  validateClaimContext,
} from "./claim-guard.mjs";

const BASE_SHA = "a".repeat(40);
const CURRENT_BASE_SHA = "b".repeat(40);
const BRANCH_HEAD_SHA = "c".repeat(40);
const NOW = Date.parse("2026-09-28T02:00:00Z");

function fixture() {
  const manifest = {
    id: "MD-CP-003",
    baseSha: BASE_SHA,
    branch: "infra/control-plane-v3.2-stage-c-safety-20260927",
    state: "IMPLEMENTING",
    risk: "high",
    owns: {
      paths: [
        ".github/hooks/**",
        ".github/workflows/morro-claim-guard.yml",
        ".github/morro-control/backlog.json",
        ".morro/changesets/MD-CP-003.json",
        "tooling/fabric/claim-guard.mjs",
        "tooling/fabric/claim-guard.test.mjs",
      ],
    },
    dependencies: ["MD-CP-002C"],
    requiredEvidence: ["claim-guard-contract"],
    stopAt: "REMOTE_PROVEN",
  };

  const registry = {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: {
      "MD-CP-003": {
        owner: "CHATGPT-PRO-CONTROL",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: manifest.branch,
        baseSha: BASE_SHA,
        paths: [...manifest.owns.paths],
        domains: ["ci-governance"],
        risk: "P1",
        status: "CLAIMED",
        expiresAt: "2026-10-05T23:59:59Z",
      },
    },
  };

  return { manifest, registry };
}

function validate(overrides = {}) {
  const { manifest, registry } = fixture();

  return validateClaimContext({
    registry: overrides.registry ?? registry,
    manifest: overrides.manifest ?? manifest,
    branch: overrides.branch ?? manifest.branch,
    currentBaseSha: overrides.currentBaseSha ?? CURRENT_BASE_SHA,
    branchHeadSha: overrides.branchHeadSha ?? BRANCH_HEAD_SHA,
    changedFiles: overrides.changedFiles ?? [
      "tooling/fabric/claim-guard.mjs",
      "tooling/fabric/claim-guard.test.mjs",
    ],
    now: overrides.now ?? NOW,
    authority: overrides.authority ?? "WORKER",
    isAncestor: overrides.isAncestor ?? (() => true),
  });
}

test("path ownership accepts exact and recursive scopes only", () => {
  assert.equal(
    pathOwned(".github/hooks/pre-write.json", ".github/hooks/**"),
    true,
  );
  assert.equal(
    pathOwned(".github/hooks2/pre-write.json", ".github/hooks/**"),
    false,
  );
  assert.equal(
    pathOwned(
      "tooling/fabric/claim-guard.mjs",
      "tooling/fabric/claim-guard.mjs",
    ),
    true,
  );
});

test("unsupported wildcard patterns fail closed", () => {
  assert.throws(
    () => assertSupportedPattern(".github/*/unsafe.yml"),
    /CLAIM_PATTERN_WILDCARD_UNSUPPORTED/u,
  );
});

test("overlap detection handles exact and recursive patterns", () => {
  assert.equal(
    patternsOverlap(".github/hooks/**", ".github/hooks/a.json"),
    true,
  );
  assert.equal(
    patternsOverlap(".github/hooks/**", ".github/hooks/nested/**"),
    true,
  );
  assert.equal(
    patternsOverlap(".github/hooks/**", ".github/workflows/example.yml"),
    false,
  );
});

test("valid claimed write passes deterministic guard", () => {
  const result = validate();
  assert.equal(result.claimId, "MD-CP-003");
  assert.equal(result.reviewer, "AUTOMATED-INDEPENDENT-PROOF");
  assert.equal(result.collisions, 0);
});

test("missing claim fails closed", () => {
  const { manifest, registry } = fixture();
  delete registry.claims[manifest.id];

  assert.throws(
    () => validate({ manifest, registry }),
    /ACTIVE_CLAIM_MISSING/u,
  );
});

test("expired claim is rejected", () => {
  const { registry } = fixture();
  registry.claims["MD-CP-003"].expiresAt = "2026-09-27T00:00:00Z";

  assert.throws(() => validate({ registry }), /CLAIM_EXPIRED/u);
});

test("branch mismatch is rejected", () => {
  assert.throws(
    () => validate({ branch: "infra/other-branch" }),
    /CLAIM_RUNTIME_BRANCH_MISMATCH/u,
  );
});

test("claim and ChangeSet base identity must match", () => {
  const { registry } = fixture();
  registry.claims["MD-CP-003"].baseSha = "c".repeat(40);

  assert.throws(() => validate({ registry }), /CLAIM_MANIFEST_BASE_MISMATCH/u);
});

test("stale claim base that is not ancestor of current base is rejected", () => {
  assert.throws(
    () => validate({ isAncestor: () => false }),
    /CLAIM_BASE_NOT_ANCESTOR_OF_CURRENT_BASE/u,
  );
});

test("current main must be an ancestor of the branch head", () => {
  assert.throws(
    () =>
      validate({
        isAncestor: (ancestor, descendant) =>
          !(ancestor === CURRENT_BASE_SHA && descendant === BRANCH_HEAD_SHA),
      }),
    /CURRENT_BASE_NOT_ANCESTOR_OF_BRANCH_HEAD/u,
  );
});

test("write outside active claim is rejected", () => {
  assert.throws(
    () => validate({ changedFiles: ["services/auth/src/index.ts"] }),
    /CLAIM_PATH_VIOLATION/u,
  );
});

test("write outside ChangeSet ownership is rejected even when claim is wider", () => {
  const { registry } = fixture();
  registry.claims["MD-CP-003"].paths.push(".github/morro-control/policy.json");

  assert.throws(
    () =>
      validate({
        registry,
        changedFiles: [".github/morro-control/policy.json"],
      }),
    /CHANGESET_OWNERSHIP_VIOLATION/u,
  );
});

test("worker cannot mutate orchestrator claim registry", () => {
  const { manifest, registry } = fixture();
  manifest.owns.paths.push(".github/morro-control/claims.json");
  registry.claims["MD-CP-003"].paths.push(".github/morro-control/claims.json");

  assert.throws(
    () =>
      validate({
        manifest,
        registry,
        changedFiles: [".github/morro-control/claims.json"],
      }),
    /WORKER_CLAIM_REGISTRY_MUTATION_FORBIDDEN/u,
  );
});

test("orchestrator may mutate explicitly owned claim registry", () => {
  const { manifest, registry } = fixture();
  manifest.owns.paths.push(".github/morro-control/claims.json");
  registry.claims["MD-CP-003"].paths.push(".github/morro-control/claims.json");

  const result = validate({
    manifest,
    registry,
    changedFiles: [".github/morro-control/claims.json"],
    authority: "ORCHESTRATOR",
  });
  assert.equal(result.authority, "ORCHESTRATOR");
});

test("human or complementary reviewer cannot replace automated proof authority", () => {
  const { registry } = fixture();
  registry.claims["MD-CP-003"].reviewer = "COPILOT-REVIEW";

  assert.throws(
    () => validate({ registry }),
    /CLAIM_REVIEW_AUTHORITY_INVALID/u,
  );
});

test("worker cannot claim integrator lifecycle authority", () => {
  const { manifest } = fixture();
  manifest.state = "MERGE_READY";

  assert.throws(
    () => validate({ manifest }),
    /CHANGESET_STATE_AUTHORITY_VIOLATION/u,
  );
});

test("integrator may validate merge-ready state but not implementation state", () => {
  const { manifest } = fixture();
  manifest.state = "MERGE_READY";
  assert.equal(
    validate({ manifest, authority: "INTEGRATOR" }).authority,
    "INTEGRATOR",
  );

  manifest.state = "IMPLEMENTING";
  assert.throws(
    () => validate({ manifest, authority: "INTEGRATOR" }),
    /CHANGESET_STATE_AUTHORITY_VIOLATION/u,
  );
});

test("release lifecycle states are outside Claim Guard write authority", () => {
  const { manifest } = fixture();
  manifest.state = "RELEASE_CANDIDATE";

  assert.throws(
    () => validate({ manifest, authority: "ORCHESTRATOR" }),
    /CHANGESET_NOT_WRITE_ACTIVE/u,
  );
});

test("overlapping live claims are rejected", () => {
  const { registry } = fixture();
  registry.claims["MD-CP-999"] = {
    owner: "OTHER-WORKER",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: "infra/other",
    baseSha: BASE_SHA,
    paths: [".github/hooks/pre-write.json"],
    domains: ["ci-governance"],
    risk: "P1",
    status: "CLAIMED",
    expiresAt: "2026-10-05T23:59:59Z",
  };

  assert.deepEqual(findClaimCollisions(registry, "MD-CP-003", NOW), [
    {
      otherId: "MD-CP-999",
      kind: "path",
      value: ".github/hooks/** <-> .github/hooks/pre-write.json",
    },
  ]);
  assert.throws(() => validate({ registry }), /CLAIM_OVERLAP_DETECTED/u);
});

test("expired overlapping claim does not block safe parallelism", () => {
  const { registry } = fixture();
  registry.claims["MD-CP-999"] = {
    owner: "OTHER-WORKER",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: "infra/other",
    baseSha: BASE_SHA,
    paths: [".github/hooks/pre-write.json"],
    domains: ["ci-governance"],
    risk: "P1",
    status: "CLAIMED",
    expiresAt: "2026-09-27T00:00:00Z",
  };

  assert.deepEqual(findClaimCollisions(registry, "MD-CP-003", NOW), []);
  assert.equal(validate({ registry }).collisions, 0);
});

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function writeJson(root, relativePath, value) {
  const target = resolve(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value, null, 2) + "\n");
}

function createProofRepository() {
  const root = mkdtempSync(resolve(tmpdir(), "morro-claim-proof-"));
  git(root, ["init", "-b", "feature"]);
  git(root, ["config", "user.email", "proof@example.test"]);
  git(root, ["config", "user.name", "Morro Proof"]);
  writeFileSync(resolve(root, "README.md"), "baseline\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "baseline"]);
  const claimBaseSha = git(root, ["rev-parse", "HEAD"]);

  const manifest = {
    id: "MD-TEST-001",
    baseSha: claimBaseSha,
    branch: "feature",
    state: "IMPLEMENTING",
    owns: { paths: ["tooling/fabric/owned.txt"] },
  };
  const registry = {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: {
      "MD-TEST-001": {
        owner: "TEST-WORKER",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: "feature",
        baseSha: claimBaseSha,
        paths: ["tooling/fabric/owned.txt"],
        domains: ["ci-governance"],
        risk: "P1",
        status: "CLAIMED",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    },
  };

  writeJson(root, ".morro/changesets/MD-TEST-001.json", manifest);
  writeJson(root, ".github/morro-control/claims.json", registry);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "control plane baseline"]);
  const currentBaseSha = git(root, ["rev-parse", "HEAD"]);

  mkdirSync(resolve(root, "tooling/fabric"), { recursive: true });
  writeFileSync(resolve(root, "tooling/fabric/owned.txt"), "candidate\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "candidate"]);
  const headSha = git(root, ["rev-parse", "HEAD"]);

  git(root, ["switch", "-c", "side", claimBaseSha]);
  writeFileSync(resolve(root, "side.txt"), "side\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "side"]);
  const sideSha = git(root, ["rev-parse", "HEAD"]);
  git(root, ["switch", "feature"]);

  return { root, currentBaseSha, headSha, sideSha };
}

function proofEnv(repo, overrides = {}) {
  return {
    EXPECTED_CANDIDATE_SHA: repo.headSha,
    EXPECTED_BASE_SHA: repo.currentBaseSha,
    EXPECTED_BRANCH: "feature",
    MANIFEST_PATH: ".morro/changesets/MD-TEST-001.json",
    CLAIM_GUARD_AUTHORITY: "WORKER",
    ...overrides,
  };
}

test("candidate paths reject traversal and symlink escape", () => {
  const parent = mkdtempSync(resolve(tmpdir(), "morro-claim-path-"));
  const root = resolve(parent, "candidate");
  const outside = resolve(parent, "outside");
  mkdirSync(root, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(resolve(outside, "manifest.json"), "{}\n");
  symlinkSync(outside, resolve(root, "escape"), "dir");
  assert.throws(
    () => resolveCandidatePath(root, "../outside/manifest.json"),
    /CANDIDATE_PATH_OUTSIDE_ROOT/u,
  );
  assert.throws(
    () => resolveCandidatePath(root, "escape/manifest.json"),
    /CANDIDATE_PATH_OUTSIDE_ROOT/u,
  );
  rmSync(parent, { recursive: true, force: true });
});

test("workflow proof validates exact head and changed-file calculation", () => {
  const repo = createProofRepository();
  try {
    const proof = buildClaimGuardProof(repo.root, proofEnv(repo));
    assert.equal(proof.exactHead, repo.headSha);
    assert.deepEqual(proof.changedFiles, ["tooling/fabric/owned.txt"]);
    assert.equal(proof.status, "pass");
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("workflow proof rejects dirty worktree and head mismatch", () => {
  const repo = createProofRepository();
  try {
    writeFileSync(resolve(repo.root, "dirty.txt"), "dirty\n");
    assert.throws(
      () => buildClaimGuardProof(repo.root, proofEnv(repo)),
      /DIRTY_CANDIDATE_WORKTREE/u,
    );
    rmSync(resolve(repo.root, "dirty.txt"));
    assert.throws(
      () =>
        buildClaimGuardProof(
          repo.root,
          proofEnv(repo, { EXPECTED_CANDIDATE_SHA: "f".repeat(40) }),
        ),
      /CANDIDATE_SHA_MISMATCH/u,
    );
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("workflow proof rejects a current base outside branch ancestry", () => {
  const repo = createProofRepository();
  try {
    assert.throws(
      () =>
        buildClaimGuardProof(
          repo.root,
          proofEnv(repo, { EXPECTED_BASE_SHA: repo.sideSha }),
        ),
      /CURRENT_BASE_NOT_ANCESTOR/u,
    );
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("workflow proof rejects manifest traversal before loading", () => {
  const repo = createProofRepository();
  try {
    assert.throws(
      () =>
        buildClaimGuardProof(
          repo.root,
          proofEnv(repo, { MANIFEST_PATH: "../outside.json" }),
        ),
      /CANDIDATE_PATH_OUTSIDE_ROOT/u,
    );
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});
