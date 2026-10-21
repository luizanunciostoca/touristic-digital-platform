import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const SHA = /^[a-f0-9]{40}$/u;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u;
const BUFFER_LIMIT = 4 * 1024 * 1024;
const INPUT_LIMIT = 65536;

function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

// The launcher never receives credentials or Node preloads through its environment.
function launcherEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        ![
          "GH_TOKEN",
          "GITHUB_TOKEN",
          "GH_REPO",
          "NODE_OPTIONS",
          "NODE_PATH",
          "GH_DEBUG",
        ].includes(key) && !key.startsWith("GIT_"),
    ),
  );
}

// Static code only: payload and credential cross the runtime boundary through stdin.
const RUNTIME_WRAPPER = String.raw`
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
try {
  const input = readFileSync(0);
  if (input.length > 65536) throw new Error();
  const p = JSON.parse(input.toString("utf8"));
  process.chdir(p.root);
  if (resolve(process.cwd()) !== p.root) throw new Error();
  const git = (args) => {
    const r = spawnSync("git", args, {
      cwd: p.root, encoding: "utf8", timeout: 30000, killSignal: "SIGKILL", maxBuffer: 4194304,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.error || r.signal || r.status !== 0) throw new Error();
    return r.stdout.trim();
  };
  if (git(["rev-parse", "--show-toplevel"]) !== p.root ||
      git(["rev-parse", "HEAD"]) !== p.head ||
      git(["remote", "get-url", "origin"]) !== p.origin ||
      git(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") throw new Error();
  // Reserve cleanup time even if runtime startup or the four Git probes are slow.
  const commandBudget = Math.min(p.timeoutMs, p.deadlineAt - Date.now() - 5000);
  if (!Number.isFinite(commandBudget) || commandBudget <= 0) throw new Error();
  const env = { ...process.env, GH_TOKEN: p.token, GITHUB_TOKEN: p.token,
    GITHUB_REPOSITORY: p.repository, GH_REPO: p.repository, GH_HOST: "github.com",
    GITHUB_SERVER_URL: "https://github.com", GITHUB_API_URL: "https://api.github.com" };
  const child = spawn(p.command, p.args, {
    cwd: p.root, env, detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [], stderr = [];
  let failed = false, bytes = 0;
  const killOwnedGroup = () => {
    if (!Number.isInteger(child.pid) || child.pid <= 0) return;
    try { process.kill(-child.pid, "SIGKILL"); }
    catch { try { child.kill("SIGKILL"); } catch {} }
  };
  const result = await new Promise((resolveResult) => {
    let settled = false, fallback;
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);clearTimeout(fallback);
      process.removeListener("SIGTERM", abort);
      process.removeListener("SIGINT", abort);
      killOwnedGroup();
      resolveResult({code, signal});
    };
    const abort = () => {
      if (failed || settled) return;
      failed = true;killOwnedGroup();
      child.stdout.destroy();child.stderr.destroy();
      fallback = setTimeout(() => finish(null, "SIGKILL"), 1000);
    };
    const collect = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > 4194304) abort();
      else target.push(chunk);
    };
    const timer = setTimeout(abort, Math.max(0, Math.min(commandBudget, p.deadlineAt - Date.now() - 5000)));
    child.stdout.on("data", collect(stdout));child.stderr.on("data", collect(stderr));
    child.once("error", abort);child.once("close", finish);
    process.once("SIGTERM", abort);process.once("SIGINT", abort);
  });
  if (failed || result.signal || !Number.isInteger(result.code)) throw new Error();
  process.stdout.write(Buffer.concat(stdout));
  process.stderr.write(Buffer.concat(stderr));
  process.exitCode = result.code;
} catch {
  process.stderr.write("AUTH_EXEC_RUNTIME_FAILED\n");
  process.exitCode = 125;
}
`;

/** Execute a governed command after an authenticated exact-main preflight.
 * This helper does not grant a claim, approve a merge, or replace command gates.
 */
export function runGithubAuthExec(
  {
    runtime,
    root,
    repository,
    expectedHead,
    expectedMain,
    command,
    args = [],
    timeoutMs = 300000,
  },
  { env = process.env, spawn = spawnSync } = {},
) {
  requireCondition(
    ["native", "debian-proot"].includes(runtime),
    "AUTH_EXEC_RUNTIME_INVALID",
  );
  requireCondition(
    typeof root === "string" && isAbsolute(root) && resolve(root) === root,
    "AUTH_EXEC_WORKTREE_INVALID",
  );
  let stat;
  try {
    stat = lstatSync(root);
  } catch {
    throw new Error("AUTH_EXEC_WORKTREE_INVALID");
  }
  requireCondition(
    stat.isDirectory() && !stat.isSymbolicLink(),
    "AUTH_EXEC_WORKTREE_INVALID",
  );
  requireCondition(
    REPOSITORY.test(repository ?? ""),
    "AUTH_EXEC_REPOSITORY_INVALID",
  );
  requireCondition(
    SHA.test(expectedHead ?? "") && SHA.test(expectedMain ?? ""),
    "AUTH_EXEC_SHA_INVALID",
  );
  requireCondition(
    typeof command === "string" &&
      command.length > 0 &&
      !command.includes("\0") &&
      Array.isArray(args) &&
      args.every((arg) => typeof arg === "string" && !arg.includes("\0")),
    "AUTH_EXEC_COMMAND_INVALID",
  );
  requireCondition(
    Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 900000,
    "AUTH_EXEC_TIMEOUT_INVALID",
  );
  for (const [key, expected] of Object.entries({
    GH_HOST: "github.com",
    GITHUB_REPOSITORY: repository,
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_API_URL: "https://api.github.com",
  }))
    requireCondition(
      !env[key] || env[key] === expected,
      "AUTH_EXEC_ENV_IDENTITY_MISMATCH",
    );
  requireCondition(
    !env.GH_REPO ||
      [repository, `github.com/${repository}`].includes(env.GH_REPO),
    "AUTH_EXEC_ENV_IDENTITY_MISMATCH",
  );

  const cleanEnv = launcherEnvironment(env);
  function invoke(program, argv, options = {}) {
    try {
      const result = spawn(program, argv, {
        cwd: root,
        env: cleanEnv,
        encoding: "utf8",
        timeout: 30000,
        killSignal: "SIGKILL",
        maxBuffer: BUFFER_LIMIT,
        stdio: ["ignore", "pipe", "pipe"],
        ...options,
      });
      requireCondition(
        !result.error && !result.signal && Number.isInteger(result.status),
        "AUTH_EXEC_PROCESS_FAILED",
      );
      return result;
    } catch {
      throw new Error("AUTH_EXEC_PROCESS_FAILED");
    }
  }
  function git(argv) {
    const result = invoke("git", argv);
    requireCondition(result.status === 0, "AUTH_EXEC_GIT_FAILED");
    return result.stdout.trim();
  }
  function verifyLocalIdentity() {
    requireCondition(
      git(["rev-parse", "--show-toplevel"]) === root,
      "AUTH_EXEC_WORKTREE_MISMATCH",
    );
    requireCondition(
      git(["rev-parse", "HEAD"]) === expectedHead,
      "AUTH_EXEC_HEAD_MISMATCH",
    );
    requireCondition(
      git(["status", "--porcelain=v1", "--untracked-files=all"]) === "",
      "AUTH_EXEC_WORKTREE_DIRTY",
    );
    const origin = git(["remote", "get-url", "origin"]);
    requireCondition(
      [
        `https://github.com/${repository}`,
        `https://github.com/${repository}.git`,
        `git@github.com:${repository}`,
        `git@github.com:${repository}.git`,
        `ssh://git@github.com/${repository}`,
        `ssh://git@github.com/${repository}.git`,
      ].includes(origin),
      "AUTH_EXEC_ORIGIN_MISMATCH",
    );
    return origin;
  }
  verifyLocalIdentity();
  requireCondition(
    invoke("git", ["merge-base", "--is-ancestor", expectedMain, expectedHead])
      .status === 0,
    "AUTH_EXEC_BASE_NOT_ANCESTOR",
  );

  const supplied = [env.GITHUB_TOKEN, env.GH_TOKEN].filter(
    (value) => value !== undefined && value !== "",
  );
  requireCondition(
    supplied.every(
      (value) =>
        typeof value === "string" &&
        value.trim() === value &&
        !/\s/u.test(value),
    ),
    "AUTH_EXEC_CREDENTIAL_INVALID",
  );
  requireCondition(
    new Set(supplied).size <= 1,
    "AUTH_EXEC_CREDENTIAL_CONFLICT",
  );
  let token = supplied[0];
  const credentialSource = token ? "environment" : "gh-store";
  if (!token) {
    const result = invoke("gh", ["auth", "token", "--hostname", "github.com"]);
    requireCondition(result.status === 0, "AUTH_EXEC_CREDENTIAL_UNAVAILABLE");
    token = result.stdout.trim();
  }
  requireCondition(
    typeof token === "string" &&
      token.length >= 8 &&
      token.length <= 8192 &&
      !/\s/u.test(token),
    "AUTH_EXEC_CREDENTIAL_INVALID",
  );
  requireCondition(
    ![command, ...args].some((value) => value.includes(token)),
    "AUTH_EXEC_CREDENTIAL_IN_ARGUMENTS",
  );
  const authenticatedEnv = {
    ...cleanEnv,
    GH_TOKEN: token,
    GITHUB_TOKEN: token,
    GH_HOST: "github.com",
    GH_REPO: repository,
    GITHUB_REPOSITORY: repository,
  };
  const response = invoke(
    "gh",
    ["api", `repos/${repository}/commits/main`, "--hostname", "github.com"],
    { env: authenticatedEnv },
  );
  requireCondition(response.status === 0, "AUTH_EXEC_PREFLIGHT_FAILED");
  let main;
  try {
    main = JSON.parse(response.stdout).sha;
  } catch {
    throw new Error("AUTH_EXEC_PREFLIGHT_INVALID");
  }
  requireCondition(main === expectedMain, "AUTH_EXEC_MAIN_MISMATCH");
  // Network preflight can take time: recheck immediately before dispatch as well.
  const origin = verifyLocalIdentity();
  // 4 × 30s runtime Git checks, startup margin and bounded group cleanup.
  const launcherTimeoutMs = timeoutMs + 180000;
  const deadlineAt = Date.now() + launcherTimeoutMs;
  const input = JSON.stringify({
    root,
    repository,
    origin,
    head: expectedHead,
    token,
    command,
    args,
    timeoutMs,
    deadlineAt,
  });
  requireCondition(
    Buffer.byteLength(input) <= INPUT_LIMIT,
    "AUTH_EXEC_INPUT_TOO_LARGE",
  );
  const argv =
    runtime === "native"
      ? ["--input-type=module", "-e", RUNTIME_WRAPPER]
      : [
          "login",
          "debian",
          "--",
          "node",
          "--input-type=module",
          "-e",
          RUNTIME_WRAPPER,
        ];
  const result = invoke(
    runtime === "native" ? process.execPath : "proot-distro",
    argv,
    {
      input,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: launcherTimeoutMs,
    },
  );
  const redact = (value) =>
    String(value ?? "")
      .split(token)
      .join("[REDACTED]");
  return {
    mode: "AUTH_EXEC",
    runtime,
    repository,
    headSha: expectedHead,
    baseSha: expectedMain,
    credentialSource,
    exitCode: result.status,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr),
  };
}
