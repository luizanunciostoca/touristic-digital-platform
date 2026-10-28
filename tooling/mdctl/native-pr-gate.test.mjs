import test from "node:test";
import assert from "node:assert/strict";
import { evaluateNativeFronts, assertFrontsStable } from "./native-pr-gate.mjs";
const head = "b".repeat(40),
  base = "a".repeat(40);
const fixture = () => ({
  fronts: [
    {
      number: 1,
      head: { sha: head, repo: { full_name: "o/r" } },
      base: { sha: base, ref: "main" },
      state: "open",
      draft: false,
      paths: ["apps/a/src/a.ts"],
    },
  ],
  prNumber: 1,
  head,
  base,
  repository: "o/r",
  files: ["apps/a/src/a.ts"],
  changedLines: 10,
  changedFileCount: 1,
  policy: { hardFiles: 20, hardLines: 100 },
  unresolvedReviewThreads: 0,
});
test("single ordinary front keeps explicit reduced guarantee", () => {
  const r = evaluateNativeFronts(fixture());
  assert.equal(r.decision, "POLICY_SATISFIED");
  assert.equal(r.semanticDependenciesProven, false);
  assert.equal(r.semanticCollisionsProven, false);
});
test("two disjoint fronts allowed", () => {
  const f = fixture();
  f.fronts.push({ ...f.fronts[0], number: 2, paths: ["apps/a/src/b.ts"] });
  assert.equal(evaluateNativeFronts(f).openPrs, 2);
});
for (const [name, mutate] of [
  [
    "third front",
    (f) =>
      f.fronts.push(
        { ...f.fronts[0], number: 2 },
        { ...f.fronts[0], number: 3 },
      ),
  ],
  ["overlap", (f) => f.fronts.push({ ...f.fronts[0], number: 2 })],
  [
    "directory overlap",
    (f) => f.fronts.push({ ...f.fronts[0], number: 2, paths: ["apps/a/src"] }),
  ],
  ["threads", (f) => (f.unresolvedReviewThreads = 1)],
  ["files budget", (f) => (f.changedFileCount = 21)],
  ["lines budget", (f) => (f.changedLines = 101)],
  ["missing live candidate", (f) => (f.fronts = [])],
  ["head moved", (f) => (f.fronts[0].head.sha = base)],
  ["base moved", (f) => (f.fronts[0].base.sha = head)],
  ["fork", (f) => (f.fronts[0].head.repo.full_name = "other/repo")],
  ["draft", (f) => (f.fronts[0].draft = true)],
  ["closed", (f) => (f.fronts[0].state = "closed")],
  ["unknown paths", (f) => (f.fronts[0].paths = [])],
])
  test(name, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => evaluateNativeFronts(f));
  });
import { ordinaryPrScope } from "../fabric/ordinary-pr-policy.mjs";
import { readFileSync } from "node:fs";
test("patch cannot approve its own scope through ordinary mode", () => {
  const risk = JSON.parse(
    readFileSync(new URL("../../.morro/risk-policy.json", import.meta.url)),
  );
  const own = JSON.parse(
    readFileSync(new URL("../../.morro/ownership.json", import.meta.url)),
  );
  assert.equal(
    ordinaryPrScope(
      [
        ".github/workflows/morro-merge-gate.yml",
        "tooling/mdctl/merge-gate.mjs",
        "tooling/mdctl/native-pr-gate.mjs",
      ],
      risk,
      own,
    ),
    false,
  );
});
import { nativeFrontSnapshot, classifyNativeScope } from "./native-pr-gate.mjs";
test("snapshot includes old and new rename paths, fails incomplete files", async () => {
  const f = fixture(),
    live = { ...f.fronts[0], changed_files: 1 };
  const api = async (path) =>
    path.includes("/files?")
      ? [[{ filename: "apps/new.ts", previous_filename: "apps/old.ts" }]]
      : path.includes("/pulls?")
        ? [[live]]
        : live;
  const out = await nativeFrontSnapshot("o/r", api);
  assert.deepEqual(out[0].paths, ["apps/new.ts", "apps/old.ts"]);
  live.changed_files = 2;
  await assert.rejects(() => nativeFrontSnapshot("o/r", api), /INCOMPLETE/);
});
test("final snapshot rejects another front moving", async () => {
  const f = fixture(),
    live = {
      ...f.fronts[0],
      head: { ...f.fronts[0].head, sha: base },
      changed_files: 1,
    };
  const api = async (path) =>
    path.includes("/files?")
      ? [[{ filename: "apps/a/src/a.ts" }]]
      : path.includes("/pulls?")
        ? [[live]]
        : live;
  await assert.rejects(
    () => assertFrontsStable(f.fronts, "o/r", api),
    /FRONTS_MOVED/,
  );
});
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
test("real classifier reads base policies and cannot approve candidate policy alteration", () => {
  const root = mkdtempSync(join(tmpdir(), "native-classify-")),
    repo = join(root, "repo"),
    trusted = join(root, "trusted");
  mkdirSync(repo);
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    for (const path of [".morro/risk-policy.json", ".morro/ownership.json"]) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(
        join(repo, path),
        readFileSync(new URL("../../" + path, import.meta.url)),
      );
    }
    const file = "apps/morro-digital-platform/src/map/example.ts";
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), "base");
    git("add", ".");
    git("commit", "-m", "base");
    const b = git("rev-parse", "HEAD");
    git("worktree", "add", "--detach", trusted, b);
    git("checkout", "-b", "feature");
    writeFileSync(join(repo, file), "updated");
    git("add", ".");
    git("commit", "-m", "ordinary");
    assert.equal(
      classifyNativeScope(trusted, repo, b, git("rev-parse", "HEAD")),
      true,
    );
    writeFileSync(join(repo, ".morro/risk-policy.json"), "{}");
    git("add", ".");
    git("commit", "-m", "policy");
    assert.equal(
      classifyNativeScope(trusted, repo, b, git("rev-parse", "HEAD")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("overlap uses raw API paths, not git quoted name-status output", () => {
  const f = fixture();
  f.files = ['\"apps/a/src/\\303\\251.ts\"'];
  f.fronts[0].paths = ["apps/a/src/é.ts"];
  f.fronts.push({ ...f.fronts[0], number: 2 });
  assert.throws(() => evaluateNativeFronts(f), /PATH_OVERLAP/);
});
