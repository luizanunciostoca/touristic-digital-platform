import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSupportedPattern,
  findClaimCollisions,
  pathOwned,
  patternsOverlap,
  validateClaimContext,
} from "./claim-guard.mjs";

const BASE_SHA = "a".repeat(40);
const CURRENT_BASE_SHA = "b".repeat(40);
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
