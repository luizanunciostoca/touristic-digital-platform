import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readFileSync,
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
  buildClaimReanchorProof,
  buildClaimHandoffProof,
  findClaimCollisions,
  pathOwned,
  patternsOverlap,
  resolveCandidatePath,
  validateClaimContext,
  validateClaimHandoff,
} from "./claim-guard.mjs";
import { buildIndependentProof } from "../quality/independent-proof-trusted.mjs";
import { evaluateMergeGate } from "../mdctl/merge-gate.mjs";

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

function handoffFixture() {
  const fromPaths = [
    "tooling/fabric/claim-guard.mjs",
    ".github/morro-control/claims.json",
  ];
  const toPaths = [
    ".github/hooks/**",
    ".github/workflows/morro-claim-guard.yml",
    ".morro/changesets/MD-CP-003-HOOKS.json",
  ];

  const baseFromManifest = {
    id: "MD-CP-003-TRUST",
    baseSha: BASE_SHA,
    branch: "infra/control-plane-v3.2-stage-c-trust-bootstrap-20260927",
    state: "MERGE_READY",
    owns: { paths: [...fromPaths] },
  };

  const candidateFromManifest = {
    ...baseFromManifest,
    owns: { paths: [...fromPaths] },
    state: "MERGED",
  };
  const toManifest = {
    id: "MD-CP-003-HOOKS",
    baseSha: CURRENT_BASE_SHA,
    branch: "infra/control-plane-v3.2-stage-c-hooks-20260928",
    state: "IMPLEMENTING",
    owns: { paths: [...toPaths] },
    dependencies: ["MD-CP-003-TRUST"],
  };

  const baseRegistry = {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: {
      "MD-CP-003-TRUST": {
        owner: "CHATGPT-PRO-CONTROL",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: baseFromManifest.branch,
        baseSha: baseFromManifest.baseSha,
        paths: [...fromPaths],
        domains: ["ci-governance"],
        risk: "P1",
        status: "INTEGRATION_READY",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    },
  };
  const candidateRegistry = {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: {
      "MD-CP-003-HOOKS": {
        owner: "CHATGPT-PRO-CONTROL",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: toManifest.branch,

        baseSha: toManifest.baseSha,
        paths: [...toPaths],
        domains: ["ci-governance"],
        risk: "P1",
        status: "IMPLEMENTING",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    },
  };

  return {
    baseRegistry,
    candidateRegistry,
    baseFromManifest,
    candidateFromManifest,
    toManifest,
  };
}

test("valid orchestrator claim handoff passes deterministically", () => {
  const result = validateClaimHandoff(handoffFixture());
  assert.equal(result.fromId, "MD-CP-003-TRUST");
  assert.equal(result.toId, "MD-CP-003-HOOKS");

  assert.equal(result.authority, "ORCHESTRATOR");
  assert.equal(result.collisions, 0);
});

test("handoff rejects an old claim that remains active", () => {
  const fixture = handoffFixture();
  fixture.candidateRegistry.claims["MD-CP-003-TRUST"] =
    fixture.baseRegistry.claims["MD-CP-003-TRUST"];

  assert.throws(
    () => validateClaimHandoff(fixture),
    /HANDOFF_OLD_CLAIM_STILL_ACTIVE/u,
  );
});

test("handoff rejects target claim paths that diverge from ChangeSet", () => {
  const fixture = handoffFixture();
  fixture.candidateRegistry.claims["MD-CP-003-HOOKS"].paths.pop();

  assert.throws(
    () => validateClaimHandoff(fixture),
    /HANDOFF_TARGET_PATHS_MISMATCH/u,
  );
});

test("handoff requires the target ChangeSet to depend on the merged source", () => {
  const fixture = handoffFixture();
  fixture.toManifest.dependencies = [];

  assert.throws(
    () => validateClaimHandoff(fixture),
    /HANDOFF_DEPENDENCY_MISSING/u,
  );
});

test("handoff rejects overlapping target claims", () => {
  const fixture = handoffFixture();
  fixture.candidateRegistry.claims["MD-CP-999"] = {
    owner: "OTHER-WORKER",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: "infra/other",
    baseSha: CURRENT_BASE_SHA,

    paths: [".github/hooks/pre-write.json"],
    domains: ["ci-governance"],
    risk: "P1",
    status: "CLAIMED",
    expiresAt: "2099-01-01T00:00:00Z",
  };

  assert.throws(
    () => validateClaimHandoff(fixture),
    /HANDOFF_TARGET_OVERLAP_DETECTED/u,
  );
});

test("handoff rejects a source ChangeSet that is not reconciled to MERGED", () => {
  const fixture = handoffFixture();
  fixture.candidateFromManifest.state = "MERGE_READY";

  assert.throws(
    () => validateClaimHandoff(fixture),
    /HANDOFF_FROM_NOT_MERGED/u,
  );
});

test("handoff rejects an expired trusted source claim", () => {
  const fixture = handoffFixture();
  fixture.baseRegistry.claims["MD-CP-003-TRUST"].expiresAt =
    "2026-09-27T00:00:00Z";

  assert.throws(
    () => validateClaimHandoff({ ...fixture, now: NOW }),
    /HANDOFF_BASE_CLAIM_EXPIRED/u,
  );
});

function createHandoffProofRepository() {
  const parent = mkdtempSync(resolve(tmpdir(), "morro-pair-proof-"));
  const root = resolve(parent, "candidate");
  const trusted = resolve(parent, "trusted");
  mkdirSync(root, { recursive: true });

  const reconcileBranch =
    "infra/control-plane-v3.2-stage-c-trust-reconcile-20260928";
  git(root, ["init", "-b", reconcileBranch]);
  git(root, ["config", "user.email", "proof@example.test"]);
  git(root, ["config", "user.name", "Morro Proof"]);

  writeFileSync(resolve(root, "README.md"), "genesis\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "genesis"]);
  const sourceBaseSha = git(root, ["rev-parse", "HEAD"]);

  const fromId = "MD-CP-003-TRUST";
  const toId = "MD-CP-003-HOOKS";
  const fromPath = `.morro/changesets/${fromId}.json`;
  const toPath = `.morro/changesets/${toId}.json`;
  const reconPath = ".morro/changesets/MD-CP-003-TRUST-RECON.json";

  const fromPaths = [
    ".github/workflows/morro-claim-guard-trusted.yml",
    ".github/morro-control/claims.json",
    fromPath,
    "tooling/fabric/claim-guard.mjs",
  ];
  const baseFromManifest = {
    id: fromId,
    baseSha: sourceBaseSha,
    branch: "infra/control-plane-v3.2-stage-c-trust-bootstrap-20260927",
    state: "MERGE_READY",
    owns: { paths: [...fromPaths] },
    requiredEvidence: ["automated-independent-proof"],
  };
  const baseRegistry = {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [fromId]: {
        owner: "CHATGPT-PRO-CONTROL",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: baseFromManifest.branch,
        baseSha: sourceBaseSha,
        paths: [...fromPaths],
        domains: ["ci-governance"],
        risk: "P1",
        status: "INTEGRATION_READY",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    },
  };

  writeJson(root, fromPath, baseFromManifest);
  writeJson(root, ".github/morro-control/claims.json", baseRegistry);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "trusted base"]);
  const currentBaseSha = git(root, ["rev-parse", "HEAD"]);
  git(root, ["worktree", "add", "--detach", trusted, currentBaseSha]);

  const candidateFromManifest = {
    ...baseFromManifest,
    owns: { paths: [...fromPaths] },
    state: "MERGED",
  };
  const toPaths = [
    ".github/hooks/morro-pretool-guard.mjs",
    ".github/workflows/morro-claim-guard.yml",
    toPath,
  ];
  const toManifest = {
    id: toId,
    baseSha: currentBaseSha,
    branch: "infra/control-plane-v3.2-stage-c-hooks-20260928",
    state: "IMPLEMENTING",
    owns: { paths: [...toPaths] },
    dependencies: [fromId],
    requiredEvidence: ["trusted-claim-guard"],
  };
  const reconciliationManifest = {
    id: "MD-CP-003-TRUST-RECON",
    baseSha: currentBaseSha,
    branch: reconcileBranch,
    state: "MERGE_READY",
    owns: {
      paths: [".github/morro-control/claims.json", fromPath, toPath, reconPath],
    },
    dependencies: [fromId],
    requiredEvidence: [
      "orchestrator-claim-handoff",
      "automated-independent-proof",
    ],
  };
  const candidateRegistry = {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [toId]: {
        owner: "CHATGPT-PRO-CONTROL",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: toManifest.branch,
        baseSha: currentBaseSha,
        paths: [...toPaths],
        domains: ["ci-governance"],
        risk: "P1",
        status: "IMPLEMENTING",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    },
  };

  writeJson(root, fromPath, candidateFromManifest);
  writeJson(root, toPath, toManifest);
  writeJson(root, reconPath, reconciliationManifest);
  writeJson(root, ".github/morro-control/claims.json", candidateRegistry);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "handoff"]);
  const headSha = git(root, ["rev-parse", "HEAD"]);

  return {
    parent,
    root,
    trusted,
    reconcileBranch,
    currentBaseSha,
    headSha,
    fromPath,
    toPath,
    reconPath,
  };
}

test("handoff and reconciliation independent proof pass together", () => {
  const repo = createHandoffProofRepository();
  try {
    const env = {
      EXPECTED_CANDIDATE_SHA: repo.headSha,
      EXPECTED_BASE_SHA: repo.currentBaseSha,
      EXPECTED_BRANCH: repo.reconcileBranch,
      MANIFEST_PATH: repo.reconPath,
      HANDOFF_FROM_MANIFEST_PATH: repo.fromPath,
      HANDOFF_TO_MANIFEST_PATH: repo.toPath,
    };
    const handoff = buildClaimHandoffProof(repo.trusted, repo.root, env);
    assert.equal(handoff.contract, "MORRO-DETERMINISTIC-CLAIM-HANDOFF");
    assert.equal(handoff.reconciliationChangeSetId, "MD-CP-003-TRUST-RECON");

    const independent = buildIndependentProof(repo.root, repo.reconPath, {
      EXPECTED_CANDIDATE_SHA: repo.headSha,
      EXPECTED_BASE_SHA: repo.currentBaseSha,
      TRUSTED_VALIDATOR_SHA: "d".repeat(40),
      TRUSTED_VALIDATOR_TREE_SHA: "e".repeat(40),
    });
    assert.equal(independent.contract, "MORRO-AUTOMATED-INDEPENDENT-PROOF");
    assert.equal(independent.changeSetId, "MD-CP-003-TRUST-RECON");
  } finally {
    git(repo.root, ["worktree", "remove", "--force", repo.trusted]);
    rmSync(repo.parent, { recursive: true, force: true });
  }
});

test("handoff proof rejects source or target used as reconciliation manifest", () => {
  const repo = createHandoffProofRepository();
  try {
    assert.throws(
      () =>
        buildClaimHandoffProof(repo.trusted, repo.root, {
          EXPECTED_CANDIDATE_SHA: repo.headSha,
          EXPECTED_BASE_SHA: repo.currentBaseSha,
          EXPECTED_BRANCH: repo.reconcileBranch,
          MANIFEST_PATH: repo.fromPath,
          HANDOFF_FROM_MANIFEST_PATH: repo.fromPath,
          HANDOFF_TO_MANIFEST_PATH: repo.toPath,
        }),
      /HANDOFF_RECONCILIATION_EQUALS_SOURCE_MANIFEST/u,
    );
  } finally {
    git(repo.root, ["worktree", "remove", "--force", repo.trusted]);
    rmSync(repo.parent, { recursive: true, force: true });
  }
});

test("orchestrator maintains registry without assigning it to a worker", () => {
  const { manifest, registry } = fixture();
  manifest.owns.paths.push(".github/morro-control/claims.json");
  const result = validate({
    manifest,
    registry,
    changedFiles: [
      ".github/morro-control/claims.json",
      "tooling/fabric/claim-guard.mjs",
    ],
    authority: "ORCHESTRATOR",
  });
  assert.equal(result.authority, "ORCHESTRATOR");
  assert.equal(result.collisions, 0);
});

test("registry maintenance requires exact manifest ownership", () => {
  const { manifest } = fixture();
  manifest.owns.paths.push(".github/morro-control/**");
  assert.throws(
    () =>
      validate({
        manifest,
        changedFiles: [".github/morro-control/claims.json"],
        authority: "ORCHESTRATOR",
      }),
    /ORCHESTRATOR_CLAIM_REGISTRY_OWNERSHIP_REQUIRED/u,
  );
});

test("registry exemption never grants workers or integrators registry writes", () => {
  const { manifest } = fixture();
  manifest.owns.paths.push(".github/morro-control/claims.json");
  assert.throws(
    () =>
      validate({
        manifest,
        changedFiles: [".github/morro-control/claims.json"],
      }),
    /WORKER_CLAIM_REGISTRY_MUTATION_FORBIDDEN/u,
  );
  manifest.state = "MERGE_READY";
  assert.throws(
    () =>
      validate({
        manifest,
        changedFiles: [".github/morro-control/claims.json"],
        authority: "INTEGRATOR",
      }),
    /WORKER_CLAIM_REGISTRY_MUTATION_FORBIDDEN/u,
  );
});

test("orchestrator registry maintenance cannot widen worker path ownership", () => {
  const { manifest, registry } = fixture();
  manifest.owns.paths.push(
    ".github/morro-control/claims.json",
    "services/auth/secret.ts",
  );
  assert.throws(
    () =>
      validate({
        manifest,
        registry,
        changedFiles: [
          ".github/morro-control/claims.json",
          "services/auth/secret.ts",
        ],
        authority: "ORCHESTRATOR",
      }),
    /CLAIM_PATH_VIOLATION/u,
  );
});

test("registry maintenance still rejects overlapping live worker claims", () => {
  const { manifest, registry } = fixture();
  manifest.owns.paths.push(".github/morro-control/claims.json");
  registry.claims["MD-OTHER"] = {
    ...registry.claims[manifest.id],
    branch: "infra/other",
    paths: ["tooling/fabric/claim-guard.mjs"],
  };
  assert.throws(
    () =>
      validate({
        manifest,
        registry,
        changedFiles: [".github/morro-control/claims.json"],
        authority: "ORCHESTRATOR",
      }),
    /CLAIM_OVERLAP_DETECTED/u,
  );
});

test("handoff source ownership cannot be removed, narrowed or broadened", () => {
  for (const mutate of [
    (source) => {
      delete source.owns;
    },
    (source) => {
      source.owns.paths.pop();
    },
    (source) => {
      source.owns.paths.push("server/**");
    },
    (source) => {
      delete source.owns.contracts;
    },
    (source) => {
      source.owns.contracts.push("new-contract");
    },
  ]) {
    const data = handoffFixture();
    data.baseFromManifest.owns.contracts = ["existing-contract"];
    data.candidateFromManifest.owns.contracts = ["existing-contract"];
    mutate(data.candidateFromManifest);
    assert.throws(
      () => validateClaimHandoff(data),
      /HANDOFF_FROM_OWNERSHIP_(?:REQUIRED|CHANGED)/u,
    );
  }
});

test("handoff rejects a divergent candidate even with valid manifests and identical tree", () => {
  const repo = createHandoffProofRepository();
  try {
    git(repo.root, ["checkout", "-b", "divergent", repo.currentBaseSha + "^"]);
    git(repo.root, ["read-tree", "--reset", "-u", repo.headSha]);
    git(repo.root, [
      "commit",
      "-m",
      "same candidate files on divergent history",
    ]);
    const candidateHead = git(repo.root, ["rev-parse", "HEAD"]);
    assert.equal(
      git(repo.root, ["rev-parse", candidateHead + "^{tree}"]),
      git(repo.root, ["rev-parse", repo.headSha + "^{tree}"]),
    );
    assert.throws(
      () =>
        buildClaimHandoffProof(repo.trusted, repo.root, {
          EXPECTED_CANDIDATE_SHA: candidateHead,
          EXPECTED_BASE_SHA: repo.currentBaseSha,
          EXPECTED_BRANCH: repo.reconcileBranch,
          MANIFEST_PATH: repo.reconPath,
          HANDOFF_FROM_MANIFEST_PATH: repo.fromPath,
          HANDOFF_TO_MANIFEST_PATH: repo.toPath,
        }),
      /HANDOFF_BASE_NOT_ANCESTOR/u,
    );
  } finally {
    git(repo.root, ["worktree", "remove", "--force", repo.trusted]);
    rmSync(repo.parent, { recursive: true, force: true });
  }
});

test("claim collision ignore is exact-path only and explicit", () => {
  const registry = {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      "MD-NEW": {
        status: "IMPLEMENTING",
        branch: "fix/new",
        expiresAt: "2099-01-01T00:00:00Z",
        paths: [
          ".github/morro-control/claims.json",
          ".github/morro-control/events.ndjson",
          "tooling/fabric/new.mjs",
        ],
      },
      "MD-EXISTING": {
        status: "IMPLEMENTING",
        branch: "feat/existing",
        expiresAt: "2099-01-01T00:00:00Z",
        paths: [
          ".github/morro-control/claims.json",
          ".github/morro-control/events.ndjson",
          "tooling/fabric/existing.mjs",
        ],
      },
    },
  };
  assert.equal(findClaimCollisions(registry, "MD-NEW").length, 2);
  assert.deepEqual(
    findClaimCollisions(
      registry,
      "MD-NEW",
      Date.parse("2026-10-03T00:00:00Z"),
      {
        allowSerializedAcquisitionBookkeeping: true,
        authority: "ORCHESTRATOR",
      },
    ),
    [],
  );
  registry.claims["MD-EXISTING"].paths.push("tooling/fabric/**");
  assert.ok(
    findClaimCollisions(
      registry,
      "MD-NEW",
      Date.parse("2026-10-03T00:00:00Z"),
      {
        allowSerializedAcquisitionBookkeeping: true,
        authority: "ORCHESTRATOR",
      },
    ).some((x) => x.kind === "path" && x.value.includes("tooling/fabric")),
  );
  assert.throws(
    () =>
      findClaimCollisions(
        registry,
        "MD-NEW",
        Date.parse("2026-10-03T00:00:00Z"),
        { allowSerializedAcquisitionBookkeeping: true, authority: "WORKER" },
      ),
    /CLAIM_COLLISION_EXEMPTION_REQUIRES_ORCHESTRATOR/u,
  );
});

// Invoke the actual workflow CLI: component-only collision tests missed this path.
function acquisitionCliFixture(scenario, persistentOnly = false) {
  const root = mkdtempSync(resolve(tmpdir(), "claim-acquisition-cli-"));
  const registryPath = ".github/morro-control/claims.json";
  const ledgerPath = ".github/morro-control/events.ndjson";
  const manifestPath = ".morro/changesets/MD-CLI-ACQUISITION.json";
  const branch = "test/cli-acquisition";
  const survivor = {
    owner: "OTHER-SESSION",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: "test/survivor",
    baseSha: "a".repeat(40),
    paths: [registryPath, ledgerPath, "tooling/failure-learning/**"],
    domains: ["ci-release"],
    risk: "P1",
    status: "IMPLEMENTING",
    expiresAt: "2099-01-01T00:00:00Z",
  };
  const registry = {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: { "MD-SURVIVOR": survivor },
  };
  if (scenario === "same branch") survivor.branch = branch;
  if (scenario === "real overlap")
    survivor.paths.push("tooling/quality/cli-owned.mjs");
  if (scenario === "recursive overlap")
    survivor.paths.push(".github/morro-control/**");
  const originalEvent = {
    schemaVersion: 1,
    eventId: "evt-prior",
    eventType: "MERGED",
    observedAt: "2026-10-01T00:00:00Z",
    actor: "ORCHESTRATOR",
    entity: "MD-PRIOR",
    sourceSha: "a".repeat(40),
    payloadVersion: 1,
    payload: {},
  };
  const originalLedger = JSON.stringify(originalEvent) + "\n";
  git(root, ["init", "-q", "-b", branch]);
  git(root, ["config", "user.name", "CLI Regression"]);
  git(root, ["config", "user.email", "cli@example.invalid"]);
  if (persistentOnly) {
    git(root, ["commit", "--allow-empty", "-qm", "fixture ancestry"]);
    survivor.baseSha = git(root, ["rev-parse", "HEAD"]);
    survivor.paths.push(".morro/changesets/MD-SURVIVOR.json");
    const survivingManifest = JSON.parse(
      readFileSync(
        resolve(process.cwd(), ".morro/changesets/MD-TDP-LEARNING-001.json"),
        "utf8",
      ),
    );
    Object.assign(survivingManifest, {
      id: "MD-SURVIVOR",
      branch: survivor.branch,
      baseSha: survivor.baseSha,
      objective: "preserved-learning-work",
      dependencies: [],
      owns: { paths: [...survivor.paths], contracts: [] },
    });
    writeJson(root, ".morro/changesets/MD-SURVIVOR.json", survivingManifest);
  }
  writeJson(root, registryPath, registry);
  writeFileSync(resolve(root, ledgerPath), originalLedger);
  if (scenario === "manifest already exists")
    writeJson(root, manifestPath, { old: true });
  if (scenario === "rename origin")
    writeFileSync(resolve(root, "unowned.txt"), "old\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  const manifest = JSON.parse(
    readFileSync(
      resolve(process.cwd(), ".morro/changesets/MD-TDP-LEARNING-001.json"),
      "utf8",
    ),
  );
  Object.assign(manifest, {
    id: "MD-CLI-ACQUISITION",
    objective: "prove-cli-acquisition",
    baseSha: base,
    branch,
    state: "IMPLEMENTING",
    dependencies: [],
  });
  manifest.owns = {
    paths: [
      registryPath,
      ledgerPath,
      manifestPath,
      "tooling/quality/cli-owned.mjs",
    ],
    contracts: [],
  };
  if (persistentOnly)
    manifest.owns.paths = manifest.owns.paths.filter(
      (path) => ![registryPath, ledgerPath].includes(path),
    );
  const claim = {
    ...survivor,
    owner: "CHATGPT-PRO-CONTROL",
    branch,
    baseSha: base,
    paths: [...manifest.owns.paths],
  };
  registry.claims[manifest.id] = claim;
  const event = { ...originalEvent, entity: manifest.id, sourceSha: base };
  const created = {
    ...event,
    eventId: "evt-cli-created",
    eventType: "CHANGESET_CREATED",
    payload: { branch, objective: manifest.objective },
  };
  const acquired = {
    ...event,
    eventId: "evt-cli-acquired",
    eventType: "CLAIM_ACQUIRED",
    payload: { branch, risk: claim.risk, expiresAt: claim.expiresAt },
  };
  let history = originalLedger;
  let events = [created, acquired];
  if (scenario === "survivor paths") survivor.paths = [];
  if (scenario === "survivor expiry")
    survivor.expiresAt = "2098-01-01T00:00:00Z";
  if (scenario === "survivor status") survivor.status = "MERGED";
  if (scenario === "remove survivor") delete registry.claims["MD-SURVIVOR"];
  if (scenario === "extra claim")
    registry.claims["MD-EXTRA"] = { ...claim, branch: "extra" };
  if (scenario === "registry metadata") registry.extra = true;
  if (scenario === "registry authority") registry.registryAuthority = "WORKER";
  if (scenario === "claim owner") claim.owner = "OTHER";
  if (scenario === "claim reviewer") claim.reviewer = "SELF";
  if (scenario === "claim status") claim.status = "LOCAL_PROVEN";
  if (scenario === "claim paths") claim.paths = [manifestPath];
  if (scenario === "claim base") claim.baseSha = "a".repeat(40);
  if (scenario === "manifest state") manifest.state = "LOCAL_PROVEN";
  if (scenario === "manifest base") manifest.baseSha = "a".repeat(40);
  if (scenario === "manifest branch") manifest.branch = "wrong";
  if (scenario === "ledger rewrite")
    history =
      JSON.stringify({ ...originalEvent, payload: { rewritten: true } }) + "\n";
  if (scenario === "ledger whitespace")
    history = JSON.stringify(originalEvent, null, 2) + "\n";
  if (scenario === "event duplicate") acquired.eventId = created.eventId;
  if (scenario === "event reorder") events.reverse();
  if (scenario === "event actor") created.actor = "WORKER";
  if (scenario === "event base") created.sourceSha = "a".repeat(40);
  if (scenario === "event branch") acquired.payload.branch = "wrong";
  if (scenario === "event expiry")
    acquired.payload.expiresAt = "2098-01-01T00:00:00Z";
  if (scenario === "extra event")
    events.push({ ...acquired, eventId: "evt-extra" });
  if (scenario === "event malformed") delete acquired.eventId;
  writeJson(root, registryPath, registry);
  writeJson(root, manifestPath, manifest);
  writeFileSync(
    resolve(root, ledgerPath),
    history + events.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );
  if (scenario === "implementation write") {
    mkdirSync(resolve(root, "tooling/quality"), { recursive: true });
    writeFileSync(
      resolve(root, "tooling/quality/cli-owned.mjs"),
      "export default 1;\n",
    );
  }
  if (scenario === "rename origin") rmSync(resolve(root, "unowned.txt"));
  if (scenario === "manifest symlink") {
    rmSync(resolve(root, manifestPath));
    symlinkSync(resolve(root, registryPath), resolve(root, manifestPath));
  }
  if (scenario === "ledger symlink") {
    rmSync(resolve(root, ledgerPath));
    symlinkSync(resolve(root, registryPath), resolve(root, ledgerPath));
  }
  if (scenario === "executable manifest")
    execFileSync("chmod", ["+x", resolve(root, manifestPath)]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "candidate acquisition"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const env = {
    ...process.env,
    EXPECTED_CANDIDATE_SHA: head,
    EXPECTED_BASE_SHA: base,
    EXPECTED_BRANCH: branch,
    MANIFEST_PATH: manifestPath,
    CLAIM_GUARD_AUTHORITY: "ORCHESTRATOR",
  };
  if (scenario === "worker") env.CLAIM_GUARD_AUTHORITY = "WORKER";
  if (scenario === "integrator") env.CLAIM_GUARD_AUTHORITY = "INTEGRATOR";
  if (scenario === "wrong head") env.EXPECTED_CANDIDATE_SHA = base;
  if (scenario === "wrong base") env.EXPECTED_BASE_SHA = "a".repeat(40);
  if (scenario === "wrong branch") env.EXPECTED_BRANCH = "wrong";
  if (scenario === "alternate registry")
    env.CLAIM_REGISTRY_PATH =
      ".github/morro-control/../morro-control/claims.json";
  if (scenario === "existing claim") env.EXPECTED_BASE_SHA = head;
  return {
    root,
    env,
    head,
    base,
    registryPath,
    ledgerPath,
    manifestPath,
    manifest,
    registry,
  };
}

for (const patterns of [
  [".github/morro-control/claims.json"],
  [".github/morro-control/events.ndjson"],
  [".github/morro-control/claims.json", ".github/morro-control/events.ndjson"],
  [".github/morro-control/**"],
  [".github/**"],
]) {
  test(`CLI and independent proof reject new persistent bookkeeping: ${patterns.join(",")}`, () => {
    const f = acquisitionCliFixture("valid", true);
    try {
      f.manifest.owns.paths.push(...patterns);
      f.registry.claims[f.manifest.id].paths = [...f.manifest.owns.paths];
      writeJson(f.root, f.manifestPath, f.manifest);
      writeJson(f.root, f.registryPath, f.registry);
      git(f.root, ["add", "."]);
      git(f.root, ["commit", "-qm", "forbidden new persistent ownership"]);
      f.env.EXPECTED_CANDIDATE_SHA = git(f.root, ["rev-parse", "HEAD"]);
      const result = spawnSync(
        process.execPath,
        [resolve(process.cwd(), "tooling/fabric/claim-guard.mjs"), f.root],
        { env: f.env, encoding: "utf8" },
      );
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /ACQUISITION_PERSISTENT_BOOKKEEPING_FORBIDDEN/u,
      );
      // The generic proof must validate a new acquisition even if its unsafe
      // manifest declares the bookkeeping files to be owned.
      assert.throws(
        () =>
          buildIndependentProof(f.root, f.manifestPath, {
            ...f.env,
            TRUSTED_REMOTE_PROOF: "1",
            GITHUB_ACTIONS: "true",
            GITHUB_RUN_ID: "42",
            TRUSTED_VALIDATOR_SHA: f.base,
            TRUSTED_VALIDATOR_TREE_SHA: git(f.root, [
              "rev-parse",
              `${f.base}^{tree}`,
            ]),
          }),
        /ACQUISITION_PERSISTENT_BOOKKEEPING_FORBIDDEN/u,
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}

test("already-canonical legacy claim retains ordinary implementation ownership", () => {
  const f = acquisitionCliFixture("valid", false);
  try {
    delete f.registry.claims["MD-SURVIVOR"];
    writeJson(f.root, f.registryPath, f.registry);
    git(f.root, ["add", "."]);
    git(f.root, ["commit", "-qm", "fixture canonical legacy claim"]);
    const base = git(f.root, ["rev-parse", "HEAD"]);
    mkdirSync(resolve(f.root, "tooling/quality"), { recursive: true });
    writeFileSync(
      resolve(f.root, "tooling/quality/cli-owned.mjs"),
      "export default 1;\n",
    );
    git(f.root, ["add", "."]);
    git(f.root, ["commit", "-qm", "legacy ordinary implementation"]);
    const proof = buildClaimGuardProof(f.root, {
      ...f.env,
      EXPECTED_BASE_SHA: base,
      EXPECTED_CANDIDATE_SHA: git(f.root, ["rev-parse", "HEAD"]),
    });
    assert.equal(proof.acquisition, false);
    assert.equal(proof.reanchor, false);
    assert.deepEqual(proof.transientOrchestratorPaths, []);
    assert.ok(f.registry.claims[f.manifest.id].paths.includes(f.registryPath));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

const acquisitionScenarios = [
  "valid",
  "worker",
  "integrator",
  "same branch",
  "real overlap",
  "recursive overlap",
  "survivor paths",
  "survivor expiry",
  "survivor status",
  "remove survivor",
  "extra claim",
  "registry metadata",
  "registry authority",
  "claim owner",
  "claim reviewer",
  "claim status",
  "claim paths",
  "claim base",
  "manifest state",
  "manifest base",
  "manifest branch",
  "manifest already exists",
  "ledger rewrite",
  "ledger whitespace",
  "event duplicate",
  "event reorder",
  "event actor",
  "event base",
  "event branch",
  "event expiry",
  "event malformed",
  "extra event",
  "implementation write",
  "rename origin",
  "manifest symlink",
  "ledger symlink",
  "executable manifest",
  "wrong head",
  "wrong base",
  "wrong branch",
  "alternate registry",
  "existing claim",
];
for (const persistentOnly of [false, true]) {
  for (const scenario of acquisitionScenarios) {
    test(`real CLI acquisition (persistentOnly=${persistentOnly}): ${scenario}`, () => {
      const f = acquisitionCliFixture(scenario, persistentOnly);
      try {
        const run = spawnSync(
          process.execPath,
          [resolve(process.cwd(), "tooling/fabric/claim-guard.mjs"), f.root],
          { env: f.env, encoding: "utf8" },
        );
        if (
          persistentOnly &&
          (scenario === "valid" || scenario === "existing claim")
        ) {
          assert.equal(run.status, 0, run.stderr);
          const proof = JSON.parse(run.stdout);
          assert.equal(proof.status, "pass");
          assert.equal(proof.authority, "ORCHESTRATOR");
          assert.equal(proof.exactHead, f.head);
          assert.equal(proof.currentBaseSha, f.env.EXPECTED_BASE_SHA);
          assert.equal(proof.collisions, 0);
          assert.deepEqual(
            proof.changedFiles,
            scenario === "existing claim"
              ? []
              : [f.registryPath, f.ledgerPath, f.manifestPath].sort(),
          );
        } else {
          assert.equal(run.status, 1, `${scenario} unexpectedly accepted`);
          assert.match(run.stderr, /MORRO_CLAIM_GUARD_FAILED:/u);
          if (!persistentOnly && scenario === "valid")
            assert.match(
              run.stderr,
              /ACQUISITION_PERSISTENT_BOOKKEEPING_FORBIDDEN/u,
            );
          assert.doesNotMatch(run.stderr, /UNEXPECTED_CLAIM_GUARD_ERROR/u);
          assert.equal(run.stdout, "");
        }
        assert.equal(
          git(f.root, ["status", "--porcelain"]),
          "",
          "CLI must not mutate candidate",
        );
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    });
  }
}

test("persistent-only acquisition permits disjoint implementation and preserved learning resumption", () => {
  const f = acquisitionCliFixture("valid", true);
  const invoke = (env) =>
    spawnSync(
      process.execPath,
      [resolve(process.cwd(), "tooling/fabric/claim-guard.mjs"), f.root],
      { env: { ...f.env, ...env }, encoding: "utf8" },
    );
  try {
    const before = readFileSync(resolve(f.root, f.registryPath), "utf8");
    const acquisition = invoke({});
    assert.equal(acquisition.status, 0, acquisition.stderr);
    assert.equal(JSON.parse(acquisition.stdout).acquisition, true);
    const independent = buildIndependentProof(f.root, f.manifestPath, {
      ...f.env,
      TRUSTED_REMOTE_PROOF: "1",
      GITHUB_ACTIONS: "true",
      GITHUB_RUN_ID: "42",
      TRUSTED_VALIDATOR_SHA: f.base,
      TRUSTED_VALIDATOR_TREE_SHA: git(f.root, [
        "rev-parse",
        `${f.base}^{tree}`,
      ]),
    });
    assert.deepEqual(
      independent.transientOrchestratorPaths.sort(),
      [f.registryPath, f.ledgerPath].sort(),
    );
    assert.deepEqual(f.registry.claims[f.manifest.id].paths, [
      f.manifestPath,
      "tooling/quality/cli-owned.mjs",
    ]);
    mkdirSync(resolve(f.root, "tooling/quality"), { recursive: true });
    writeFileSync(
      resolve(f.root, "tooling/quality/cli-owned.mjs"),
      "export default 1;\n",
    );
    git(f.root, ["add", "."]);
    git(f.root, ["commit", "-qm", "disjoint implementation"]);
    let head = git(f.root, ["rev-parse", "HEAD"]);
    for (const authority of ["WORKER", "ORCHESTRATOR"]) {
      const result = invoke({
        EXPECTED_BASE_SHA: f.head,
        EXPECTED_CANDIDATE_SHA: head,
        CLAIM_GUARD_AUTHORITY: authority,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).acquisition, false);
      assert.deepEqual(
        JSON.parse(result.stdout).transientOrchestratorPaths,
        [],
      );
    }
    assert.equal(readFileSync(resolve(f.root, f.registryPath), "utf8"), before);
    mkdirSync(resolve(f.root, "tooling/failure-learning"), { recursive: true });
    writeFileSync(
      resolve(f.root, "tooling/failure-learning/resumed.mjs"),
      "export default 2;\n",
    );
    git(f.root, ["add", "."]);
    git(f.root, ["commit", "-qm", "resume learning"]);
    const result = invoke({
      EXPECTED_BASE_SHA: head,
      EXPECTED_CANDIDATE_SHA: git(f.root, ["rev-parse", "HEAD"]),
      EXPECTED_BRANCH: "test/survivor",
      MANIFEST_PATH: ".morro/changesets/MD-SURVIVOR.json",
      CLAIM_GUARD_AUTHORITY: "WORKER",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(resolve(f.root, f.registryPath), "utf8"), before);
    // Bookkeeping access must not leak into ordinary worker writes.
    writeFileSync(
      resolve(f.root, f.ledgerPath),
      readFileSync(resolve(f.root, f.ledgerPath), "utf8") + "{}\n",
    );
    git(f.root, ["add", "."]);
    git(f.root, ["commit", "-qm", "unowned ledger write"]);
    for (const authority of ["WORKER", "ORCHESTRATOR"]) {
      const rejected = invoke({
        EXPECTED_BASE_SHA: f.head,
        EXPECTED_CANDIDATE_SHA: git(f.root, ["rev-parse", "HEAD"]),
        CLAIM_GUARD_AUTHORITY: authority,
      });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /CLAIM_PATH_VIOLATION/);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

function reanchorCliFixture(scenario) {
  const f = acquisitionCliFixture("valid", true);
  f.canonicalRegistry = structuredClone(f.registry);
  f.canonicalManifest = structuredClone(f.manifest);
  f.manifest.baseSha = f.head;
  f.manifest.state = "LOCAL_PROVEN";
  const current = f.registry.claims[f.manifest.id];
  current.baseSha = f.head;
  const survivor = f.registry.claims["MD-SURVIVOR"];
  if (scenario === "owner") current.owner = "OTHER";
  if (scenario === "reviewer") current.reviewer = "SELF";
  if (scenario === "expiry") current.expiresAt = "2098-01-01T00:00:00Z";
  if (scenario === "status") current.status = "LOCAL_PROVEN";
  if (scenario === "branch") current.branch = "other";
  if (scenario === "scope") current.paths.push("tooling/other/**");
  if (scenario === "survivor") survivor.status = "MERGED";
  if (scenario === "remove survivor") delete f.registry.claims["MD-SURVIVOR"];
  if (scenario === "extra claim")
    f.registry.claims["MD-EXTRA"] = { ...current };
  if (scenario === "registry metadata") f.registry.extra = true;
  if (scenario === "manifest authority") f.manifest.requiredEvidence = ["fake"];
  if (scenario === "manifest base") f.manifest.baseSha = f.base;
  const event = {
    schemaVersion: 1,
    eventId: "evt-bounded-reanchor",
    eventType: "CLAIM_RENEWED",
    observedAt: "2026-10-04T00:00:00Z",
    actor: "ORCHESTRATOR",
    entity: f.manifest.id,
    sourceSha: f.head,
    payloadVersion: 1,
    payload: {
      currentBaseSha: f.head,
      currentBranch: f.manifest.branch,
      authorityScopeChanged: false,
    },
  };
  if (scenario === "event actor") event.actor = "WORKER";
  if (scenario === "event type") event.eventType = "MERGED";
  if (scenario === "event identity") event.entity = "MD-SURVIVOR";
  if (scenario === "event source") event.sourceSha = f.base;
  if (scenario === "event base") event.payload.currentBaseSha = f.base;
  if (scenario === "event branch") event.payload.currentBranch = "wrong";
  if (scenario === "event scope") event.payload.authorityScopeChanged = true;
  if (scenario === "duplicate event") event.eventId = "evt-cli-acquired";
  let ledger = readFileSync(resolve(f.root, f.ledgerPath), "utf8");
  if (scenario === "ledger bytes") ledger = " " + ledger;
  if (scenario !== "missing event") ledger += JSON.stringify(event) + "\n";
  if (scenario === "extra event")
    ledger += JSON.stringify({ ...event, eventId: "evt-extra" }) + "\n";
  writeJson(f.root, f.registryPath, f.registry);
  writeJson(f.root, f.manifestPath, f.manifest);
  writeFileSync(resolve(f.root, f.ledgerPath), ledger);
  mkdirSync(resolve(f.root, "tooling/quality"), { recursive: true });
  writeFileSync(
    resolve(f.root, "tooling/quality/cli-owned.mjs"),
    "export default 1;\n",
  );
  if (scenario === "unowned implementation")
    writeFileSync(resolve(f.root, "outside.mjs"), "export default 2;\n");
  if (scenario === "manifest mode")
    execFileSync("chmod", ["+x", resolve(f.root, f.manifestPath)]);
  git(f.root, ["add", "."]);
  git(f.root, ["commit", "-qm", "implementation with exact base"]);
  f.implementationHead = git(f.root, ["rev-parse", "HEAD"]);
  f.env = {
    ...f.env,
    EXPECTED_BASE_SHA: f.head,
    EXPECTED_CANDIDATE_SHA: f.implementationHead,
  };
  if (scenario === "worker") f.env.CLAIM_GUARD_AUTHORITY = "WORKER";
  return f;
}

for (const scenario of [
  "valid",
  "worker",
  "owner",
  "reviewer",
  "expiry",
  "status",
  "branch",
  "scope",
  "survivor",
  "remove survivor",
  "extra claim",
  "registry metadata",
  "manifest authority",
  "manifest base",
  "event actor",
  "event type",
  "event identity",
  "event source",
  "event base",
  "event branch",
  "event scope",
  "duplicate event",
  "ledger bytes",
  "missing event",
  "extra event",
  "unowned implementation",
  "manifest mode",
]) {
  test(`real CLI and independent proof reanchor: ${scenario}`, () => {
    const f = reanchorCliFixture(scenario);
    try {
      const result = spawnSync(
        process.execPath,
        [resolve(process.cwd(), "tooling/fabric/claim-guard.mjs"), f.root],
        { env: f.env, encoding: "utf8" },
      );
      const proof = () =>
        buildIndependentProof(f.root, f.manifestPath, {
          ...f.env,
          TRUSTED_REMOTE_PROOF: "1",
          GITHUB_ACTIONS: "true",
          GITHUB_RUN_ID: "42",
          TRUSTED_VALIDATOR_SHA: f.head,
          TRUSTED_VALIDATOR_TREE_SHA: git(f.root, [
            "rev-parse",
            `${f.head}^{tree}`,
          ]),
        });
      if (scenario === "valid") {
        assert.equal(result.status, 0, result.stderr);
        const checked = JSON.parse(result.stdout);
        assert.equal(checked.acquisition, false);
        assert.equal(checked.reanchor, true);
        assert.deepEqual(
          proof().transientOrchestratorPaths.sort(),
          [f.registryPath, f.ledgerPath].sort(),
        );
        assert.deepEqual(
          f.registry.claims["MD-SURVIVOR"],
          f.canonicalRegistry.claims["MD-SURVIVOR"],
        );
        const reanchorProof = buildClaimReanchorProof(f.root, {
          baseSha: f.head,
          headSha: f.implementationHead,
          manifestPath: f.manifestPath,
        });
        const gateInput = {
          manifest: f.manifest,
          canonicalManifest: f.canonicalManifest,
          registry: f.registry,
          canonicalRegistry: f.canonicalRegistry,
          branch: f.manifest.branch,
          baseSha: f.head,
          headSha: f.implementationHead,
          authorizationPaths: checked.changedFiles,
          changedFileCount: checked.changedFiles.length,
          changedLines: 100,
          currentPrNumber: 10,
          liveItems: [
            {
              prNumber: 10,
              openPr: true,
              writerActive: true,
              headSha: f.implementationHead,
              changeSet: f.manifest,
              invalid: null,
              trust: {
                trusted: true,
                authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
              },
            },
          ],
          dependenciesSatisfied: true,
          unresolvedReviewThreads: 0,
          reanchorProof,
          ancestor: (a, b) => {
            try {
              git(f.root, ["merge-base", "--is-ancestor", a, b]);
              return true;
            } catch {
              return false;
            }
          },
        };
        assert.equal(evaluateMergeGate(gateInput).decision, "POLICY_SATISFIED");
        assert.throws(
          () =>
            evaluateMergeGate({
              ...gateInput,
              reanchorProof: { ...reanchorProof },
            }),
          /REANCHOR_CERTIFICATE_UNVERIFIED/,
        );
        assert.throws(
          () => evaluateMergeGate({ ...gateInput, headSha: f.head }),
          /REANCHOR_CERTIFICATE_IDENTITY_MISMATCH/,
        );
        const changedRegistry = structuredClone(f.registry);
        changedRegistry.uncommittedMetadata = "not-covered-by-certificate";
        assert.throws(
          () => evaluateMergeGate({ ...gateInput, registry: changedRegistry }),
          /REANCHOR_CERTIFICATE_CONTENT_MISMATCH/,
        );
      } else {
        assert.equal(result.status, 1, `${scenario} accepted`);
        assert.match(result.stderr, /MORRO_CLAIM_GUARD_FAILED:/);
        if (scenario !== "worker") assert.throws(proof);
      }
      assert.equal(git(f.root, ["status", "--porcelain"]), "");
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}
