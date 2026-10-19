import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildAffectedTurboArgs } from "./affected-quality.mjs";
import { validateAffectedTaskGraph as sharedValidator } from "./affected-task-proof.mjs";
import { validateAffectedTaskGraph as localValidator } from "./local-fast-gate.mjs";

const APP = "@touristic/morro-digital-platform";
const PKG = "apps/morro-digital-platform/package.json";
const CHECKER = "tooling/performance/check-morro-digital-budget.mjs";
function graph(kinds = ["lint", "typecheck", "test", "build"]) {
  return {
    version: "1",
    turboVersion: "2.10.8",
    tasks: kinds.map((task) => ({
      taskId: `${APP}#${task}`,
      task,
      package: APP,
      directory: "apps/morro-digital-platform",
      command: "node fixture-task.mjs",
    })),
  };
}
// Real planner, analyzer, task proof and CLI entrypoints. Only claim admission
// and workspace discovery are boundary doubles; external pnpm produces a
// controlled dry plan. These tests do not certify native claim authority.
function fixture(
  t,
  { packageName = APP, mutation = "checker", dry = graph() } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "affected-consumer-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  for (const name of [
    "affected-quality.mjs",
    "affected-task-proof.mjs",
    "impact-analyzer.mjs",
    "test-impact-manifest.json",
    "local-fast-gate.mjs",
  ])
    put(
      `tooling/ci/${name}`,
      readFileSync(new URL(name, import.meta.url), "utf8"),
    );
  put(
    "tooling/fabric/ownership-path.mjs",
    "export const matchesOwnershipPath=(path,prefix)=>path.startsWith(prefix);\n",
  );
  put(
    "tooling/fabric/claim-guard.mjs",
    "export const buildClaimGuardProof=()=>({claimId:'FIXTURE'});\n",
  );
  put(
    "tooling/fabric/claim-retirement-proof.mjs",
    "export const removedClaimIds=()=>[]; export const assertCanonicalRetirementTransition=()=>{throw Error('UNEXPECTED_RETIREMENT')}; export const buildClaimRetirementProof=()=>{throw Error('UNEXPECTED_RETIREMENT')};\n",
  );
  put(
    "tooling/workspace/morro-workspace.mjs",
    "export const probeWorkspaceRuntime=()=>({}); export const chooseWorkspaceRuntime=()=>({result:'PASS',runtime:'native',fallbackUsed:false});\n",
  );
  put(
    "tooling/ci/fixture.test.mjs",
    "import test from 'node:test'; test('root contract',()=>console.log('ROOT_EXECUTED'));\n",
  );
  put(".github/morro-control/claims.json", {
    claims: { FIXTURE: { branch: "fix/fixture" } },
  });
  put(".github/morro-control/events.ndjson", "");
  put(".morro/changesets/FIXTURE.json", { state: "IMPLEMENTING" });
  put(".morro/ownership.json", {
    domains: [
      { pathPrefixes: ["tooling/", "apps/", "packages/", "unknown/", "docs/"] },
    ],
  });
  put(PKG, {
    name: packageName,
    scripts: {
      lint: "eslint src",
      typecheck: "tsc --noEmit",
      test: "vitest run",
      build: "tsc",
    },
  });
  put(CHECKER, "// base checker\n");
  put(
    "tooling/performance/check-morro-digital-budget.test.mjs",
    "// base test\n",
  );
  put("packages/business/src/catalog.ts", "// base workspace source\n");
  put("docs/example.md", "base\n");
  put(
    "bin/pnpm",
    `#!/bin/sh
case "$*" in
 *--dry=json*) printf '%s' "$FIXTURE_GRAPH";;
 'exec turbo run '*)
 case "$FIXTURE_AFTER_PROOF" in
 head) git commit --allow-empty -qm 'proof changed HEAD';;
 dirty) printf 'changed' >> tooling/performance/check-morro-digital-budget.mjs;;
 esac
 printf 'WORKSPACE_EXECUTED\\\\n';;

esac
`,
  );
  chmodSync(join(root, "bin/pnpm"), 0o755);
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("add", ".");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  git("remote", "add", "origin", root);
  git("update-ref", "refs/remotes/origin/main", base);
  git("switch", "-qc", "fix/fixture");
  if (mutation === "delete") rmSync(join(root, CHECKER));
  else if (mutation === "unknown") put("unknown/runtime.js", "// unknown\n");
  else if (mutation === "nonruntime") put("docs/example.md", "candidate\n");
  else if (mutation === "deep")
    put("services/financial/src/provider.ts", "// critical\n");
  else if (mutation === "normal")
    put("packages/business/src/catalog.ts", "// changed\n");
  else {
    put(CHECKER, "// changed checker\n");
    if (mutation === "two")
      put(
        "tooling/performance/check-morro-digital-budget.test.mjs",
        "// changed test\n",
      );
  }
  if (["checker", "delete", "two"].includes(mutation))
    put(
      "tooling/ci/performance-budget-accounting.test.mjs",
      "// changed root CI shim\n",
    );
  git("add", ".");
  git("commit", "-qm", "candidate");
  const head = git("rev-parse", "HEAD");
  const env = {
    ...process.env,
    PATH: join(root, "bin") + ":" + process.env.PATH,
    FIXTURE_GRAPH: JSON.stringify(dry),
  };
  delete env.NODE_TEST_CONTEXT;
  for (const key of [
    "GITHUB_EVENT_NAME",
    "GITHUB_EVENT_PATH",
    "GITHUB_REF",
    "GITHUB_SHA",
  ])
    delete env[key];
  const invoke = (local = false, extra = [], baseArg = base) =>
    spawnSync(
      process.execPath,
      [
        join(
          root,
          `tooling/ci/${local ? "local-fast-gate" : "affected-quality"}.mjs`,
        ),
        ...(local ? ["--certify", "--base", baseArg] : [baseArg]),
        ...extra,
      ],
      {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  return { root, put, git, base, head, invoke, env };
}
function mainPushFixture(t) {
  const f = fixture(t);
  f.git("update-ref", "refs/heads/main", f.head);
  f.put(".git/push-event.json", {
    ref: "refs/heads/main",
    before: f.base,
    after: f.head,
  });
  Object.assign(f.env, {
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: f.head,
    GITHUB_EVENT_PATH: join(f.root, ".git/push-event.json"),
  });
  return f;
}
function pass(result) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
function reject(result, pattern) {
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stdout, /WORKSPACE_EXECUTED|"mode":"CERTIFIED"/);
}
function dryArgv(output) {
  return output
    .split("\n")
    .find(
      (line) =>
        line.startsWith("native pnpm exec turbo run") &&
        line.endsWith("--dry=json"),
    );
}

test("local API reexports the identical task-proof validator", () =>
  assert.equal(sharedValidator, localValidator));
for (const mutation of ["checker", "delete", "two"]) {
  test(`real remote and local CLI agree on consumer selection for ${mutation}`, (t) => {
    const f = fixture(t, { mutation });
    const remote = f.invoke();
    const local = f.invoke(true);
    pass(remote);
    pass(local);
    const expected = `native pnpm ${[...buildAffectedTurboArgs(f.base), `--filter=${APP}`, "--dry=json"].join(" ")}`;
    assert.equal(dryArgv(remote.stdout), expected);
    assert.equal(dryArgv(local.stdout), expected);
    for (const result of [remote, local]) {
      assert.equal((result.stdout.match(/ROOT_EXECUTED/g) ?? []).length, 1);
      assert.match(result.stdout, /WORKSPACE_EXECUTED/);
      assert.match(result.stdout, new RegExp(f.head));
      assert.match(result.stdout, new RegExp(f.base));
    }
    assert.equal(
      (expected.match(new RegExp(`--filter=${APP}`, "g")) || []).length,
      1,
    );
  });
}
test("normal workspace impact preserves the original Git-only argv", (t) => {
  const f = fixture(t, { mutation: "normal" });
  const result = f.invoke();
  pass(result);
  assert.equal(
    dryArgv(result.stdout),
    `native pnpm ${[...buildAffectedTurboArgs(f.base), "--dry=json"].join(" ")}`,
  );
});
for (const mutation of ["unknown", "nonruntime", "deep"]) {
  test(`remote affected CLI cannot rescue ${mutation} as AFFECTED`, (t) => {
    const f = fixture(t, { mutation });
    reject(f.invoke(), /AFFECTED_QUALITY_PROFILE_NOT_AFFECTED/);
  });
}
test("wrong consumer package name at the exact candidate HEAD fails closed", (t) => {
  const f = fixture(t, { packageName: "@touristic/unknown" });
  reject(f.invoke(), /AFFECTED_QUALITY_CONSUMER_NAME_MISMATCH/);
  reject(f.invoke(true), /AFFECTED_QUALITY_CONSUMER_NAME_MISMATCH/);
});
test("dirty package name cannot be used instead of the exact candidate blob", (t) => {
  const f = fixture(t);
  f.put(PKG, { name: "@touristic/unknown" });
  reject(f.invoke(), /AFFECTED_QUALITY_DIRTY_WORKTREE/);
  reject(f.invoke(true), /FAST_GATE_EXACT_HEAD_REQUIRES_CLEAN_WORKTREE/);
});
test("stale base is rejected by both actual entrypoints", (t) => {
  const f = fixture(t);
  f.git("update-ref", "refs/heads/main", f.head);
  reject(f.invoke(), /AFFECTED_QUALITY_BASE_STALE/);
  reject(
    f.invoke(true),
    /FAST_GATE_BASE_STALE|FAST_GATE_MAIN_NOT_SYNCHRONIZED/,
  );
});
test("main push uses its real before/after interval when remote main is already HEAD", (t) => {
  const f = mainPushFixture(t);
  const result = f.invoke();
  pass(result);
  assert.equal((result.stdout.match(/ROOT_EXECUTED/g) ?? []).length, 1);
  assert.match(result.stdout, /WORKSPACE_EXECUTED/);
  const proof = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.equal(proof.baseSha, f.base);
  assert.equal(proof.headSha, f.head);
  assert.equal(proof.treeSha, f.git("rev-parse", "HEAD^{tree}"));
});
for (const [field, expectedError] of [
  ["before", /AFFECTED_QUALITY_PUSH_BASE_MISMATCH/],
  ["after", /AFFECTED_QUALITY_PUSH_HEAD_MISMATCH/],
  ["ref", /AFFECTED_QUALITY_PUSH_REF_MISMATCH/],
]) {
  test(`main push rejects mismatched event ${field} before executing proof`, (t) => {
    const f = mainPushFixture(t);
    const event = JSON.parse(readFileSync(f.env.GITHUB_EVENT_PATH, "utf8"));
    event[field] = field === "ref" ? "refs/heads/other" : "0".repeat(40);
    f.put(".git/push-event.json", event);
    const result = f.invoke();
    reject(result, expectedError);
    assert.doesNotMatch(result.stdout, /ROOT_EXECUTED/);
  });
}
test("main push rejects a GITHUB_SHA different from the checkout", (t) => {
  const f = mainPushFixture(t);
  f.env.GITHUB_SHA = f.base;
  const result = f.invoke();
  reject(result, /AFFECTED_QUALITY_EVENT_SHA_MISMATCH/);
  assert.doesNotMatch(result.stdout, /ROOT_EXECUTED/);
});
for (const malformed of [false, true]) {
  test(`main push rejects ${malformed ? "malformed" : "missing"} event payload`, (t) => {
    const f = mainPushFixture(t);
    if (malformed) f.put(".git/push-event.json", "{invalid-json");
    else delete f.env.GITHUB_EVENT_PATH;
    const result = f.invoke();
    reject(result, /AFFECTED_QUALITY_PUSH_EVENT_INVALID/);
    assert.doesNotMatch(result.stdout, /ROOT_EXECUTED/);
  });
}
test("main push rejects remote main different from its exact HEAD", (t) => {
  const f = mainPushFixture(t);
  f.git("update-ref", "refs/heads/main", f.base);
  const result = f.invoke();
  reject(result, /AFFECTED_QUALITY_REMOTE_HEAD_STALE/);
  assert.doesNotMatch(result.stdout, /ROOT_EXECUTED/);
});
for (const [eventName, ref] of [
  ["pull_request", "refs/pull/1/merge"],
  ["merge_group", "refs/heads/gh-readonly-queue/main/fixture"],
  ["workflow_dispatch", "refs/heads/main"],
  ["push", "refs/heads/other"],
]) {
  test(`${eventName} on ${ref} retains the remote-main-equals-base rule`, (t) => {
    const f = mainPushFixture(t);
    f.env.GITHUB_EVENT_NAME = eventName;
    f.env.GITHUB_REF = ref;
    const result = f.invoke();
    reject(result, /AFFECTED_QUALITY_BASE_STALE/);
    assert.doesNotMatch(result.stdout, /ROOT_EXECUTED/);
  });
}
for (const extra of [
  ["--filter=@touristic/other"],
  ["--report=fabricated.json"],
  ["--head=" + "a".repeat(40)],
]) {
  test(`remote CLI refuses caller selection override ${extra[0]}`, (t) => {
    const f = fixture(t);
    reject(f.invoke(false, extra), /AFFECTED_QUALITY_ARGUMENTS_INVALID/);
    reject(f.invoke(true, extra), /FAST_GATE_ARGUMENTS_INVALID/);
  });
}
for (const dry of [
  graph([]),
  graph(["build"]),
  graph(["lint", "test", "build"]),
]) {
  test(`real remote and local dispatch reject incomplete dry graph (${dry.tasks.length})`, (t) => {
    const f = fixture(t, { dry });
    for (const result of [f.invoke(), f.invoke(true)]) {
      reject(
        result,
        /FAST_GATE_AFFECTED_GRAPH_EMPTY|FAST_GATE_AFFECTED_KIND_UNCOVERED/,
      );
      assert.match(result.stdout, /ROOT_EXECUTED/);
    }
  });
}
test("reverting only remote CLI guard dispatch reproduces false PASS on zero tasks", (t) => {
  const f = fixture(t, { dry: graph([]) });
  reject(f.invoke(), /FAST_GATE_AFFECTED_GRAPH_EMPTY/);
  const p = "tooling/ci/affected-quality.mjs";
  const source = readFileSync(join(f.root, p), "utf8");
  const start = source.indexOf("  const proof = runAffectedProof(");
  const end = source.indexOf("\n  assert.equal(", start);
  assert.ok(start >= 0 && end > start);
  f.put(
    p,
    source.slice(0, start) +
      '  const proof = {}; execFileSync("pnpm", selection.args, {stdio:"inherit"});' +
      source.slice(end),
  );
  f.git("add", ".");
  f.git("commit", "-qm", "historical remote guard mutation");
  const result = f.invoke();
  pass(result);
  assert.match(result.stdout, /WORKSPACE_EXECUTED/);
  assert.doesNotMatch(result.stdout, /ROOT_EXECUTED/);
  assert.match(result.stdout, /"result":"PASS"/);
});

for (const mutation of ["head", "dirty"]) {
  test(`both real entrypoints reject ${mutation} identity mutation after proof`, (t) => {
    for (const local of [false, true]) {
      const f = fixture(t);
      f.env.FIXTURE_AFTER_PROOF = mutation;
      const result = f.invoke(local);
      assert.ifError(result.error);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /WORKSPACE_EXECUTED/);
      assert.match(
        result.stderr,
        mutation === "head" ? /HEAD_CHANGED_AFTER_PROOF/ : /DIRTY_AFTER_PROOF/,
      );
      assert.doesNotMatch(result.stdout, /"result":"PASS"|"mode":"CERTIFIED"/);
    }
  });
}
