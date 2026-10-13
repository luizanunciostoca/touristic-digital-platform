import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { validateAdmission, changedFiles } from "./local-fast-gate.mjs";
import {
  buildClaimRetirement,
  buildClaimAcquisition,
} from "../mdctl/claim-lifecycle.mjs";
const BASE = "a".repeat(40);
const EXPIRY = "2026-10-06T06:20:00.000Z";
function manifest(overrides = {}) {
  return {
    schemaVersion: 2,
    id: "MD-FASTFIX-TEST",
    objective: "prove-fastfix-claim-lifecycle",
    baseSha: BASE,
    branch: "fix/fastfix-test",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: {
      paths: [
        "tooling/ci/local-fast-gate.mjs",
        ".morro/changesets/MD-FASTFIX-TEST.json",
      ],
      contracts: ["TDP-FAST-GATE"],
    },
    reads: { contracts: ["MAIN"] },
    produces: { events: ["CLAIM_ACQUIRED"], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["automated-independent-proof", "exact-head-identity"],
    requiredCapabilities: ["github:read"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "claim-proof",
          argv: ["node", "--test", "tooling/ci/local-fast-gate.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: [
        "automated-independent-proof",
        "exact-head-identity",
      ],
    },
    stopAt: "REMOTE_PROVEN",
    ...overrides,
  };
}

const registry = (claims = {}) => ({
  schemaVersion: 1,
  registryAuthority: "ORCHESTRATOR",
  claims,
});

function activeClaim(overrides = {}) {
  const value = manifest();
  return {
    owner: "CHATGPT-PRO-CONTROL",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: value.branch,
    baseSha: BASE,
    paths: value.owns.paths,
    domains: ["ci-release"],
    risk: "P1",
    status: "IMPLEMENTING",
    expiresAt: EXPIRY,
    ...overrides,
  };
}

const REG = ".github/morro-control/claims.json";
const LED = ".github/morro-control/events.ndjson";
const MAN = ".morro/changesets/MD-FASTFIX-TEST.json";
const NOW = "2026-10-07T00:00:00.000Z";
const options = {
  env: { GITHUB_REPOSITORY: "fixture/repo", GITHUB_TOKEN: "fixture-only" },
  now: Date.parse(NOW),
  fetchImpl: async (url) => {
    assert.ok(url.includes("/pulls?"), "only fixture PR evidence expected");
    return { ok: true, json: async () => [] };
  },
};
function setup(t, acquisition = false) {
  const root = mkdtempSync(join(tmpdir(), "tdp-gate-test-"));
  const prior = process.cwd();
  t.after(() => {
    process.chdir(prior);
    rmSync(root, { recursive: true, force: true });
  });
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === "string" ? value : JSON.stringify(value) + "\n",
    );
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Fixture");
  put("README.md", "fixture\n");
  git("add", ".");
  git("commit", "-qm", "ancestor");
  const ancestor = git("rev-parse", "HEAD");
  const originalManifest = manifest({ baseSha: ancestor });
  const originalRegistry = registry(
    acquisition
      ? {}
      : { "MD-FASTFIX-TEST": activeClaim({ baseSha: ancestor }) },
  );
  put(REG, originalRegistry);
  put(LED, "");
  if (!acquisition) put(MAN, originalManifest);
  put(".morro/ownership.json", {
    domains: [{ pathPrefixes: [".github/", ".morro/", "tooling/"] }],
  });
  git("add", ".");
  git("commit", "-qm", "canonical fixture");
  const base = git("rev-parse", "HEAD");
  const branch = acquisition ? "fix/fastfix-test" : "infra/retire-fastfix-test";
  git("switch", "-qc", branch);
  const mutation = acquisition
    ? buildClaimAcquisition({
        registry: originalRegistry,
        ledgerText: "",
        manifest: manifest({ baseSha: base }),
        expiresAt: "2099-10-08T00:00:00.000Z",
        observedAt: NOW,
        domains: ["ci-release"],
      })
    : buildClaimRetirement({
        registry: originalRegistry,
        ledgerText: "",
        manifest: originalManifest,
        evidence: {
          id: originalManifest.id,
          reason: "EXPIRED",
          branch: originalManifest.branch,
          baseSha: ancestor,
        },
        retirementBaseSha: base,
        retirementBranch: branch,
        observedAt: NOW,
      });
  put(REG, mutation.registry);
  put(LED, mutation.ledgerText);
  put(MAN, mutation.manifest);
  const commit = () => {
    git("add", ".");
    git("commit", "-qm", "candidate");
    return git("rev-parse", "HEAD");
  };
  const head = commit();
  process.chdir(root);
  return { root, git, put, commit, base, head, mutation };
}
test("retirement admits exactly one expired claim and cleans temporary worktree", async (t) => {
  const f = setup(t);
  const worktrees = f.git("worktree", "list", "--porcelain");
  const proof = await validateAdmission(
    f.base,
    f.head,
    changedFiles(f.base),
    options,
  );
  assert.equal(proof.retirement, true);
  assert.equal(proof.status, "pass");
  assert.equal(proof.claimId, "MD-FASTFIX-TEST");
  assert.equal(f.git("worktree", "list", "--porcelain"), worktrees);
});
test("acquisition uses canonical acquisition proof instead of reanchor", async (t) => {
  const f = setup(t, true);
  const proof = await validateAdmission(
    f.base,
    f.head,
    changedFiles(f.base),
    options,
  );
  assert.equal(proof.claimId, "MD-FASTFIX-TEST");
});
for (const [name, mutate, code] of [
  [
    "extra file",
    (f) => f.put("tooling/unrelated.mjs", "export {};"),
    /RETIREMENT_SCOPE_INVALID/,
  ],
  [
    "wrong branch",
    (f) => f.put(MAN, { ...f.mutation.manifest, branch: "infra/wrong" }),
    /RETIREMENT_BRANCH_MISMATCH/,
  ],
  [
    "registry metadata",
    (f) => f.put(REG, { ...f.mutation.registry, injected: true }),
    /REGISTRY_DIVERGED/,
  ],
  [
    "new claim",
    (f) => f.put(REG, registry({ "MD-UNRELATED": activeClaim() })),
    /ADDITION_FORBIDDEN/,
  ],
  ["missing event", (f) => f.put(LED, ""), /RETIREMENT_SCOPE_INVALID/],
  [
    "changed authority",
    (f) => f.put(MAN, { ...f.mutation.manifest, risk: "critical" }),
    /AUTHORITY_DIVERGED/,
  ],
])
  test(`retirement rejects ${name}`, async (t) => {
    const f = setup(t);
    mutate(f);
    const head = f.commit();
    await assert.rejects(
      validateAdmission(f.base, head, changedFiles(f.base), options),
      code,
    );
  });
test("retirement requires clean exact HEAD and complete file list", async (t) => {
  const f = setup(t);
  await assert.rejects(
    validateAdmission(f.base, f.base, changedFiles(f.base), options),
    /HEAD_MISMATCH/,
  );
  await assert.rejects(
    validateAdmission(f.base, f.head, [], options),
    /CHANGED_FILES_MISMATCH/,
  );
  f.put("untracked", "dirty");
  await assert.rejects(
    validateAdmission(f.base, f.head, changedFiles(f.base), options),
    /CLEAN_WORKTREE/,
  );
});
test("remote evidence failure is fail closed and temporary worktree is removed", async (t) => {
  const f = setup(t);
  const before = f.git("worktree", "list", "--porcelain");
  await assert.rejects(
    validateAdmission(f.base, f.head, changedFiles(f.base), {
      ...options,
      fetchImpl: async () => ({ ok: false }),
    }),
    /GITHUB_EVIDENCE_REQUEST_FAILED/,
  );
  assert.equal(f.git("worktree", "list", "--porcelain"), before);
});

for (const path of [MAN, REG, LED]) {
  test(`retirement rejects external symlink input ${path}`, async (t) => {
    const f = setup(t);
    const external = mkdtempSync(join(tmpdir(), "tdp-gate-external-"));
    t.after(() => rmSync(external, { recursive: true, force: true }));
    const target = join(external, "data.json");
    const contents =
      path === MAN
        ? JSON.stringify(f.mutation.manifest) + "\n"
        : path === REG
          ? JSON.stringify(f.mutation.registry) + "\n"
          : f.mutation.ledgerText;
    writeFileSync(target, contents);
    rmSync(join(f.root, path));
    symlinkSync(target, join(f.root, path));
    const head = f.commit();
    assert.match(f.git("ls-tree", "HEAD", "--", path), /^120000 blob /);
    assert.equal(f.git("status", "--porcelain", "--untracked-files=all"), "");
    await assert.rejects(
      validateAdmission(f.base, head, changedFiles(f.base), options),
      /FAST_GATE_INPUT_NOT_REGULAR/,
    );
    writeFileSync(target, "{}");
    await assert.rejects(
      validateAdmission(f.base, head, changedFiles(f.base), options),
      /FAST_GATE_INPUT_NOT_REGULAR/,
    );
    assert.equal(f.git("rev-parse", "HEAD"), head);
    assert.equal(f.git("status", "--porcelain", "--untracked-files=all"), "");
  });
}

for (const path of [MAN, REG, LED]) {
  test(`retirement rejects hidden worktree changes to ${path}`, async (t) => {
    const f = setup(t);
    f.git("update-index", "--skip-worktree", "--", path);
    const original = readFileSync(join(f.root, path), "utf8");
    writeFileSync(join(f.root, path), original + "\n");
    assert.equal(f.git("status", "--porcelain", "--untracked-files=all"), "");
    await assert.rejects(
      validateAdmission(f.base, f.head, changedFiles(f.base), options),
      /FAST_GATE_INPUT_CONTENT_MISMATCH/,
    );
  });
}

for (const kind of ["acquisition", "worker"]) {
  for (const path of [MAN, LED, ".morro/ownership.json"]) {
    test(`${kind} rejects Git-unbound hidden input ${path}`, async (t) => {
      const f = setup(t, true);
      let base = f.base;
      let head = f.head;
      if (kind === "worker") {
        base = head;
        f.put("tooling/ci/local-fast-gate.mjs", "export {};\n");
        head = f.commit();
      }
      await validateAdmission(base, head, changedFiles(base), options);
      const original = readFileSync(join(f.root, path), "utf8");
      // Commit invalid bytes; hide restored valid bytes from git status.
      f.put(path, "{}\n");
      head = f.commit();
      f.git("update-index", "--skip-worktree", "--", path);
      writeFileSync(join(f.root, path), original);
      assert.equal(f.git("status", "--porcelain", "--untracked-files=all"), "");
      await assert.rejects(
        validateAdmission(base, head, changedFiles(base), options),
        /FAST_GATE_INPUT_CONTENT_MISMATCH/,
      );
    });
    test(`${kind} rejects symlink input ${path}`, async (t) => {
      const f = setup(t, true);
      let base = f.base;
      let head = f.head;
      if (kind === "worker") {
        base = head;
        f.put("tooling/ci/local-fast-gate.mjs", "export {};\n");
        head = f.commit();
      }
      await validateAdmission(base, head, changedFiles(base), options);
      const external = mkdtempSync(join(tmpdir(), "tdp-admission-input-"));
      t.after(() => rmSync(external, { recursive: true, force: true }));
      const target = join(external, "input");
      writeFileSync(target, readFileSync(join(f.root, path)));
      rmSync(join(f.root, path));
      symlinkSync(target, join(f.root, path));
      head = f.commit();
      assert.equal(f.git("status", "--porcelain", "--untracked-files=all"), "");
      await assert.rejects(
        validateAdmission(base, head, changedFiles(base), options),
        /FAST_GATE_INPUT_NOT_REGULAR/,
      );
    });
  }
}
