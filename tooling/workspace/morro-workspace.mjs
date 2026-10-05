#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const CANONICAL_REMOTE =
  "https://github.com/luizanunciostoca/touristic-digital-platform.git";
const MAIN_REF = "refs/heads/main";
const FETCH_REFSPEC = "+refs/heads/main:refs/heads/main";

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
    bare: input.bare ?? join(home, "repos", "touristic-digital-platform.git"),
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
    (absolute !== canonicalRoot && !absolute.startsWith(canonicalRoot + sep))
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
      throw new Error(
        "Canonical bare repository must not use object alternates",
      );
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
    mkdirSync(dirname(config.bare), { recursive: true });
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
    !/^(agent|chore|feat|fix|infra|wave)\/[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(
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

function runtimeSpawn(runtime, cwd, command, args, run = spawnSync) {
  const options = {
    cwd,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  };
  if (runtime === "native") return run(command, args, options);
  if (runtime === "debian-proot") {
    return run(
      "proot-distro",
      [
        "login",
        "debian",
        "--",
        "bash",
        "-lc",
        'cd "$1"; shift; exec "$@"',
        "_",
        cwd,
        command,
        ...args,
      ],
      options,
    );
  }
  throw new Error("WORKSPACE_RUNTIME_INVALID");
}

function successful(result) {
  return result && result.status === 0 && !result.error;
}

function requiredNodeMajor(root) {
  const value = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const match = /^(\d+)\.x$/u.exec(value?.engines?.node ?? "");
  if (!match) throw new Error("WORKSPACE_NODE_ENGINE_UNSUPPORTED");
  return Number(match[1]);
}

export function probeWorkspaceRuntime(
  root,
  runtime,
  { run = spawnSync, includeWorkspaceTools = true } = {},
) {
  directoryOnly(root);
  const requiredMajor = requiredNodeMajor(root);
  const node = runtimeSpawn(runtime, root, "node", ["--version"], run);
  const pnpm = runtimeSpawn(runtime, root, "pnpm", ["--version"], run);
  const nodeVersion = String(node?.stdout ?? "").trim();
  const nodeMajor = Number(/^v?(\d+)\./u.exec(nodeVersion)?.[1] ?? NaN);
  const commands = {
    node: successful(node) && nodeMajor === requiredMajor,
    pnpm: successful(pnpm),
  };
  if (includeWorkspaceTools) {
    const prettier = runtimeSpawn(
      runtime,
      root,
      "pnpm",
      ["exec", "prettier", "--version"],
      run,
    );
    const turbo = runtimeSpawn(
      runtime,
      root,
      "pnpm",
      ["exec", "turbo", "--version"],
      run,
    );
    commands.prettier = successful(prettier);
    commands.turbo = successful(turbo);
  }
  return {
    runtime,
    ready: Object.values(commands).every(Boolean),
    requiredNodeMajor: requiredMajor,
    nodeVersion,
    commands,
  };
}

export function chooseWorkspaceRuntime(probes) {
  if (!Array.isArray(probes) || probes.length === 0)
    throw new Error("WORKSPACE_RUNTIME_PROBES_REQUIRED");
  const ready = probes.find((probe) => probe?.ready === true);
  if (!ready) {
    return {
      result: "BLOCK",
      failureClass: "WORKTREE_FAILURE",
      rootCause: "WORKSPACE_BOOTSTRAP_INCOMPLETE",
      probes,
    };
  }
  return {
    result: "PASS",
    runtime: ready.runtime,
    fallbackUsed: probes.indexOf(ready) > 0,
    probe: ready,
  };
}

export function prepareTaskWorkspace(
  root,
  exactBaseSha,
  { run = spawnSync, installIfMissing = true } = {},
) {
  requireSha(exactBaseSha);
  directoryOnly(root);
  const headSha = git(["-C", root, "rev-parse", "HEAD"]).stdout;
  const branch = git(["-C", root, "branch", "--show-current"]).stdout;
  const status = git([
    "-C",
    root,
    "status",
    "--porcelain=v1",
    "--untracked-files=normal",
  ]).stdout;
  const baseIsAncestor =
    git(["-C", root, "merge-base", "--is-ancestor", exactBaseSha, headSha], {
      allowFailure: true,
    }).code === 0;
  if (!baseIsAncestor) throw new Error("WORKSPACE_EXACT_BASE_NOT_ANCESTOR");
  if (headSha != exactBaseSha) {
    return {
      ready: false,
      exactBaseSha,
      headSha,
      branch,
      reason: "WORKSPACE_NOT_AT_EXACT_BASE",
    };
  }
  if (status) {
    return {
      ready: false,
      exactBaseSha,
      headSha,
      branch,
      reason: "WORKSPACE_NOT_CLEAN",
    };
  }

  let installedDependencies = pathExists(join(root, "node_modules"));
  if (!installedDependencies) {
    if (!installIfMissing) {
      return {
        ready: false,
        exactBaseSha,
        headSha,
        branch,
        reason: "DEPENDENCIES_MISSING",
      };
    }
    const core = chooseWorkspaceRuntime(
      ["native", "debian-proot"].map((runtime) =>
        probeWorkspaceRuntime(root, runtime, {
          run,
          includeWorkspaceTools: false,
        }),
      ),
    );
    if (core.result !== "PASS") {
      return {
        ready: false,
        exactBaseSha,
        headSha,
        branch,
        reason: core.rootCause,
        runtimeSelection: core,
      };
    }
    const install = runtimeSpawn(
      core.runtime,
      root,
      "pnpm",
      ["install", "--frozen-lockfile", "--prefer-offline"],
      run,
    );
    if (!successful(install)) {
      return {
        ready: false,
        exactBaseSha,
        headSha,
        branch,
        reason: "DEPENDENCY_BOOTSTRAP_FAILED",
        runtimeSelection: core,
      };
    }
    installedDependencies = true;
  }

  const runtimeSelection = chooseWorkspaceRuntime(
    ["native", "debian-proot"].map((runtime) =>
      probeWorkspaceRuntime(root, runtime, { run }),
    ),
  );
  return {
    ready: runtimeSelection.result === "PASS",
    exactBaseSha,
    headSha,
    branch,
    dependenciesReady: installedDependencies,
    runtime:
      runtimeSelection.result === "PASS" ? runtimeSelection.runtime : null,
    fallbackUsed:
      runtimeSelection.result === "PASS" ? runtimeSelection.fallbackUsed : null,
    runtimeSelection,
  };
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
  if (command === "ready" && args.length === 2)
    return prepareTaskWorkspace(args[0], args[1]);
  throw new Error(
    "Usage: morro-workspace.mjs bootstrap <main-sha> | create <task-id> <branch> <main-sha> | inventory | ready <worktree> <main-sha>",
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
