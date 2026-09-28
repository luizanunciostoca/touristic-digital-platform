import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  bootstrap,
  createTask,
  diagnosticCode,
  inventory,
} from "./morro-workspace.mjs";

const git = (args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), "morro-workspace-test-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const remote = join(home, "upstream");
  git(["init", "--initial-branch=main", remote]);
  writeFileSync(join(remote, "README.md"), "fixture\n");
  git(["-C", remote, "add", "README.md"]);
  git([
    "-C",
    remote,
    "-c",
    "user.name=Workspace Test",
    "-c",
    "user.email=workspace-test@example.invalid",
    "commit",
    "-m",
    "fixture",
  ]);
  return { home, remote, sha: git(["-C", remote, "rev-parse", "HEAD"]) };
}

test("bootstrap creates independent non-mirror bare repository and is idempotent", (t) => {
  const f = fixture(t);
  const first = bootstrap(f.sha, f);
  assert.deepEqual(bootstrap(f.sha, f), first);
  assert.equal(
    git(["--git-dir", first.bare, "rev-parse", "--is-bare-repository"]),
    "true",
  );
  assert.equal(
    git(["--git-dir", first.bare, "config", "--get", "remote.origin.mirror"]),
    "false",
  );
  assert.equal(
    existsSync(join(first.bare, "objects", "info", "alternates")),
    false,
  );
});

test("stale expected main fails before creating the canonical repository", (t) => {
  const f = fixture(t);
  assert.throws(() => bootstrap("0".repeat(40), f), /Remote main moved/);
  assert.equal(existsSync(join(f.home, "morro-repo.git")), false);
});

test("task is isolated at exact main and existing task paths/branches are protected", (t) => {
  const f = fixture(t);
  bootstrap(f.sha, f);
  const task = createTask("task-one", "infra/task-one", f.sha, f);
  writeFileSync(join(task.path, "untracked.txt"), "must survive");
  assert.equal(git(["-C", task.path, "rev-parse", "HEAD"]), f.sha);
  assert.throws(
    () => createTask("task-one", "infra/task-two", f.sha, f),
    /refusing overwrite/,
  );
  assert.throws(
    () => createTask("task-two", "infra/task-one", f.sha, f),
    /refusing reuse/,
  );
  assert.equal(
    readFileSync(join(task.path, "untracked.txt"), "utf8"),
    "must survive",
  );
  assert.throws(
    () => createTask("task-three", "infra/task-three", "0".repeat(40), f),
    /Main identity mismatch/,
  );
  assert.equal(existsSync(join(f.home, "worktrees", "task-three")), false);
});

test("inventory preserves dirty and unique work without granting deletion authority", (t) => {
  const f = fixture(t);
  bootstrap(f.sha, f);
  const dirty = createTask("dirty", "infra/dirty", f.sha, f);
  const unique = createTask("unique", "infra/unique", f.sha, f);
  writeFileSync(join(dirty.path, "untracked.txt"), "preserve");
  writeFileSync(join(unique.path, "unique.txt"), "preserve");
  git(["-C", unique.path, "add", "unique.txt"]);
  git([
    "-C",
    unique.path,
    "-c",
    "user.name=Workspace Test",
    "-c",
    "user.email=workspace-test@example.invalid",
    "commit",
    "-m",
    "unique",
  ]);
  const state = inventory(f);
  assert.equal(state.worktreeCount, 2);
  assert.equal(
    state.worktrees.find((w) => w.path === dirty.path).state,
    "PRESERVE_DIRTY",
  );
  assert.equal(
    state.worktrees.find((w) => w.path === unique.path).state,
    "PRESERVE_UNIQUE_OR_UNKNOWN",
  );
  assert.equal(
    state.worktrees.every((w) => w.removalAllowed === false),
    true,
  );
  assert.equal(
    readFileSync(join(dirty.path, "untracked.txt"), "utf8"),
    "preserve",
  );
});

test("unsafe mirror or canonical origin config is rejected", (t) => {
  const f = fixture(t);
  const { bare } = bootstrap(f.sha, f);
  git(["--git-dir", bare, "config", "remote.origin.mirror", "true"]);
  assert.throws(
    () => createTask("task", "infra/task", f.sha, f),
    /Mirror repositories/,
  );
  git(["--git-dir", bare, "config", "remote.origin.mirror", "false"]);
  git([
    "--git-dir",
    bare,
    "remote",
    "set-url",
    "origin",
    join(f.home, "unknown"),
  ]);
  assert.throws(() => inventory(f), /Canonical origin mismatch/);
});

test("path traversal, protected branches and unsafe fetch refspecs fail closed", (t) => {
  const f = fixture(t);
  const { bare } = bootstrap(f.sha, f);
  assert.throws(
    () => createTask("../escape", "infra/escape", f.sha, f),
    /Invalid task ID/,
  );
  assert.throws(
    () => createTask("task", "main", f.sha, f),
    /Invalid task branch/,
  );
  git(["--git-dir", bare, "config", "remote.origin.fetch", "+refs/*:refs/*"]);
  assert.throws(
    () => createTask("task", "infra/task", f.sha, f),
    /Unsafe fetch refspec/,
  );
});

test("dangling symlinks cannot become task paths or canonical directories", (t) => {
  const f = fixture(t);
  bootstrap(f.sha, f);
  symlinkSync(join(f.home, "missing"), join(f.home, "worktrees", "linked"));
  assert.throws(
    () => createTask("linked", "infra/linked", f.sha, f),
    /refusing overwrite/,
  );
  const linkedBare = join(f.home, "linked-bare");
  symlinkSync(join(f.home, "missing-bare"), linkedBare);
  assert.throws(
    () => bootstrap(f.sha, { ...f, bare: linkedBare }),
    /symlink path/,
  );
});

test("symlinked parent components cannot redirect canonical repository paths", (t) => {
  const f = fixture(t);
  const actual = join(f.home, "actual-parent");
  mkdirSync(actual);
  const linked = join(f.home, "linked-parent");
  symlinkSync(actual, linked);
  assert.throws(
    () =>
      bootstrap(f.sha, {
        ...f,
        bare: join(linked, "morro-repo.git"),
        root: join(f.home, "worktrees"),
      }),
    /symlink path/,
  );
});

test("existing canonical bare repository cannot depend on object alternates", (t) => {
  const f = fixture(t);
  const { bare } = bootstrap(f.sha, f);
  mkdirSync(join(f.home, "external-objects"));
  writeFileSync(
    join(bare, "objects", "info", "alternates"),
    join(f.home, "external-objects") + "\n",
  );
  assert.throws(() => inventory(f), /object alternates/);
});

test("bootstrap advances local bare main whenever verified remote main advances", (t) => {
  const f = fixture(t);
  const { bare } = bootstrap(f.sha, f);
  writeFileSync(join(f.remote, "next.txt"), "next\n");
  git(["-C", f.remote, "add", "next.txt"]);
  git([
    "-C",
    f.remote,
    "-c",
    "user.name=Workspace Test",
    "-c",
    "user.email=workspace-test@example.invalid",
    "commit",
    "-m",
    "advance verified main",
  ]);
  const next = git(["-C", f.remote, "rev-parse", "HEAD"]);
  const state = bootstrap(next, f);
  assert.equal(state.mainSha, next);
  assert.equal(
    git(["--git-dir", bare, "rev-parse", "refs/heads/main"]),
    next,
  );
  assert.equal(git(["--git-dir", bare, "rev-parse", "HEAD"]), next);
});

test("inventory preserves symlinked registered worktrees as unknown without probing them", (t) => {
  const f = fixture(t);
  bootstrap(f.sha, f);
  const task = createTask("legacy-link", "infra/legacy-link", f.sha, f);
  rmSync(task.path, { recursive: true, force: true });
  symlinkSync(f.remote, task.path);
  const state = inventory(f);
  const entry = state.worktrees.find((worktree) => worktree.path === task.path);
  assert.equal(entry?.state, "UNKNOWN");
  assert.equal(entry?.removalAllowed, false);
});

test("create rejects remote main advancement even when cached main and expected SHA match", (t) => {
  const f = fixture(t);
  const { bare } = bootstrap(f.sha, f);
  writeFileSync(join(f.remote, "advanced.txt"), "new remote main");
  git(["-C", f.remote, "add", "advanced.txt"]);
  git([
    "-C",
    f.remote,
    "-c",
    "user.name=Workspace Test",
    "-c",
    "user.email=workspace-test@example.invalid",
    "commit",
    "-m",
    "advance main",
  ]);
  assert.equal(
    git(["--git-dir", bare, "rev-parse", "refs/remotes/origin/main"]),
    f.sha,
  );
  assert.throws(
    () => createTask("stale", "infra/stale", f.sha, f),
    /Remote main moved/,
  );
  assert.equal(existsSync(join(f.home, "worktrees", "stale")), false);
  assert.equal(
    git([
      "--git-dir",
      bare,
      "for-each-ref",
      "--format=%(refname)",
      "refs/heads/infra/stale",
    ]),
    "",
  );
});

test("CLI diagnostics preserve safe codes and redact raw error detail", () => {
  assert.equal(
    diagnosticCode(new Error("REMOTE_MAIN_MOVED")),
    "REMOTE_MAIN_MOVED",
  );
  assert.equal(
    diagnosticCode(
      new Error("Git command failed: https://user:secret@example.invalid"),
    ),
    "WORKSPACE_OPERATION_FAILED",
  );
  assert.equal(
    diagnosticCode({ message: "unsafe detail with spaces" }),
    "WORKSPACE_OPERATION_FAILED",
  );
});
