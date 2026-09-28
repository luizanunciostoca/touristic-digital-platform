#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const CANONICAL_REMOTE =
  "https://github.com/luizanunciostoca/touristic-digital-platform.git";
const MAIN_REF = "refs/remotes/origin/main";
const FETCH_REFSPEC = "+refs/heads/main:refs/remotes/origin/main";

export function diagnosticCode(cause) {
  const message =
    cause && typeof cause === "object" && "message" in cause
      ? String(cause.message)
      : "";
  return /^[A-Z][A-Z0-9_:.-]{2,160}$/u.test(message)
    ? message
    : "WORKSPACE_OPERATION_FAILED";
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `Git command failed (${result.status}): ${result.stderr.trim().replace(/(https?:\/\/)[^/\s@]+@/g, "$1[REDACTED]@")}`,
    );
  }
  return { code: result.status, stdout: result.stdout.trim() };
}

function options(input = {}) {
  const home = input.home ?? homedir();
  return {
    bare: input.bare ?? join(home, "morro-repo.git"),
    root: input.root ?? join(home, "worktrees"),
    remote: input.remote ?? CANONICAL_REMOTE,
  };
}

function requireSha(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? ""))
    throw new Error("An exact 40-character expected main SHA is required");
}

function pathExists(path) {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

function validatePathComponents(path) {
  const absolute = resolve(path);
  const { root } = parse(absolute);
  const parts = absolute.slice(root.length).split(sep).filter(Boolean);
  let current = root;

  for (const part of parts) {
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (!stat) break;
    if (stat.isSymbolicLink())
      throw new Error(`Refusing non-directory or symlink path: ${current}`);
    if (current !== absolute && !stat.isDirectory())
      throw new Error(`Refusing non-directory or symlink path: ${current}`);
  }
  return absolute;
}

function directoryOnly(path) {
  const absolute = validatePathComponents(path);
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new Error(`Refusing non-directory or symlink path: ${absolute}`);
  }
  return absolute;
}

function safeWorktreePath(path, root) {
  const absolute = resolve(path);
  const canonicalRoot = resolve(root);
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (
    !stat ||
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    (absolute !== canonicalRoot &&
      !absolute.startsWith(canonicalRoot + sep))
  )
    return null;
  try {
    validatePathComponents(absolute);
  } catch {
    return null;
  }
  return absolute;
}

function validateBare(config) {
  directoryOnly(config.bare);
  if (!pathExists(config.bare))
    throw new Error(
      "Canonical bare repository is missing; run bootstrap first",
    );
  const args = ["--git-dir", config.bare];
  if (git([...args, "rev-parse", "--is-bare-repository"]).stdout !== "true")
    throw new Error("Repository must be bare");
  if (git([...args, "remote", "get-url", "origin"]).stdout !== config.remote)
    throw new Error("Canonical origin mismatch");
  if (
    git([...args, "config", "--get", "remote.origin.mirror"], {
      allowFailure: true,
    }).stdout === "true"
  ) {
    throw new Error("Mirror repositories are not allowed");
  }
  if (
    git([...args, "config", "--get-all", "remote.origin.fetch"]).stdout !==
    FETCH_REFSPEC
  ) {
    throw new Error(
      "Unsafe fetch refspec; expected origin/main remote-tracking ref only",
    );
  }
  for (const name of ["alternates", "http-alternates"]) {
    if (pathExists(join(config.bare, "objects", "info", name)))
      throw new Error("Canonical bare repository must not use object alternates");
  }
}

function currentMain(config, expectedMain) {
  requireSha(expectedMain);
  validateBare(config);
  const sha = git(["--git-dir", config.bare, "rev-parse", MAIN_REF]).stdout;
  if (sha !== expectedMain)
    throw new Error(
      `Main identity mismatch: expected ${expectedMain}, observed ${sha}`,
    );
  return sha;
}

export function bootstrap(expectedMain, input = {}) {
  requireSha(expectedMain);
  const config = options(input);
  directoryOnly(config.bare);
  directoryOnly(config.root);
  const auth =
    config.remote === CANONICAL_REMOTE
      ? ["-c", "credential.https://github.com.helper=!gh auth git-credential"]
      : [];
  const remoteHead = git([
    ...auth,
    "ls-remote",
    "--exit-code",
    config.remote,
    "refs/heads/main",
  ]).stdout.split(/\s+/)[0];
  if (remoteHead !== expectedMain)
    throw new Error(
      `Remote main moved: ${remoteHead}; recapture before bootstrap`,
    );
  if (!pathExists(config.bare)) {
    git(["init", "--bare", "--initial-branch=main", config.bare]);
    git(["--git-dir", config.bare, "remote", "add", "origin", config.remote]);
    git([
      "--git-dir",
      config.bare,
      "config",
      "remote.origin.fetch",
      FETCH_REFSPEC,
    ]);
    git(["--git-dir", config.bare, "config", "remote.origin.mirror", "false"]);
    if (auth.length)
      git([
        "--git-dir",
        config.bare,
        "config",
        "credential.https://github.com.helper",
        "!gh auth git-credential",
      ]);
  }
  validateBare(config);
  git(["--git-dir", config.bare, "fetch", "--no-tags", "origin"]);
  const sha = currentMain(config, expectedMain);
  const localMain = git(
    ["--git-dir", config.bare, "rev-parse", "--verify", "refs/heads/main"],
    { allowFailure: true },
  );
  if (localMain.code !== 0 || localMain.stdout !== sha)
    git(["--git-dir", config.bare, "update-ref", "refs/heads/main", sha]);
  git(["--git-dir", config.bare, "symbolic-ref", "HEAD", "refs/heads/main"]);
  mkdirSync(config.root, { recursive: true });
  return {
    bare: config.bare,
    worktreeRoot: config.root,
    mainSha: sha,
    mirror: false,
  };
}

export function createTask(taskId, branch, expectedMain, input = {}) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(taskId ?? ""))
    throw new Error("Invalid task ID");
  if (
    !/^(agent|feat|fix|infra|wave)\/[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(
      branch ?? "",
    )
  )
    throw new Error("Invalid task branch");
  const config = options(input);
  const sha = currentMain(config, expectedMain);
  const remoteHead = git([
    "--git-dir",
    config.bare,
    "ls-remote",
    "--exit-code",
    "origin",
    "refs/heads/main",
  ]).stdout.split(/\s+/)[0];
  if (remoteHead !== sha) {
    throw new Error(
      `Remote main moved: ${remoteHead}; recapture and bootstrap before creating a task`,
    );
  }
  directoryOnly(config.root);
  if (!pathExists(config.root))
    throw new Error("Worktree root is missing; run bootstrap first");
  const path = join(config.root, taskId);
  if (pathExists(path))
    throw new Error("Task path already exists; refusing overwrite");
  git(["check-ref-format", "--branch", branch]);
  if (
    git(
      [
        "--git-dir",
        config.bare,
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${branch}`,
      ],
      { allowFailure: true },
    ).code === 0
  ) {
    throw new Error("Task branch already exists; refusing reuse");
  }
  // A task always starts at the explicit verified ref; bare HEAD is never its source.
  git(["--git-dir", config.bare, "worktree", "add", "-b", branch, path, sha]);
  return { taskId, branch, path, mainSha: sha };
}

export function inventory(input = {}) {
  const config = options(input);
  validateBare(config);
  const mainSha = git(["--git-dir", config.bare, "rev-parse", MAIN_REF]).stdout;
  const blocks = git([
    "--git-dir",
    config.bare,
    "worktree",
    "list",
    "--porcelain",
  ]).stdout.split("\n\n");
  const worktrees = [];
  for (const block of blocks) {
    const record = Object.fromEntries(
      block.split("\n").map((line) => {
        const space = line.indexOf(" ");
        return space < 0
          ? [line, true]
          : [line.slice(0, space), line.slice(space + 1)];
      }),
    );
    if (record.bare) continue;
    const path = record.worktree;
    const safePath = safeWorktreePath(path, config.root);
    if (!safePath) {
      worktrees.push({ path, state: "UNKNOWN", removalAllowed: false });
      continue;
    }
    const status = git([
      "-C",
      safePath,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "-z",
    ]).stdout;
    const ignored = git([
      "-C",
      safePath,
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
      "-z",
    ]).stdout;
    const ancestor =
      git(
        [
          "--git-dir",
          config.bare,
          "merge-base",
          "--is-ancestor",
          record.HEAD,
          mainSha,
        ],
        { allowFailure: true },
      ).code === 0;
    worktrees.push({
      path,
      headSha: record.HEAD,
      branch: record.branch ?? null,
      dirty: status.length > 0,
      ignoredEntryCount: ignored.split("\0").filter(Boolean).length,
      headReachableFromMain: ancestor,
      state:
        status.length > 0
          ? "PRESERVE_DIRTY"
          : ancestor
            ? "REVIEW_CLEAN"
            : "PRESERVE_UNIQUE_OR_UNKNOWN",
      // Inventory cannot prove claims, open PRs, ignored-file value or active processes.
      removalAllowed: false,
    });
  }
  return {
    bare: config.bare,
    mainSha,
    worktreeCount: worktrees.length,
    worktrees,
  };
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === "bootstrap" && args.length === 1) return bootstrap(args[0]);
  if (command === "create" && args.length === 3) return createTask(...args);
  if (command === "inventory" && args.length === 0) return inventory();
  throw new Error(
    "Usage: morro-workspace.mjs bootstrap <main-sha> | create <task-id> <branch> <main-sha> | inventory",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${diagnosticCode(error)}\n`);
    process.exitCode = 1;
  }
}
