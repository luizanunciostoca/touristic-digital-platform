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
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
try {
  const input = readFileSync(0);
  if (input.length > 65536) throw new Error();
  const p = JSON.parse(input.toString("utf8"));
  if (resolve(process.cwd()) !== p.root) throw new Error();
  const git = (args) => {
    const r = spawnSync("git", args, {
      cwd: p.root, encoding: "utf8", timeout: 30000, maxBuffer: 4194304,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.error || r.signal || r.status !== 0) throw new Error();
    return r.stdout.trim();
  };
  if (git(["rev-parse", "--show-toplevel"]) !== p.root ||
      git(["rev-parse", "HEAD"]) !== p.head ||
      git(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") throw new Error();
  const env = { ...process.env, GH_TOKEN: p.token, GITHUB_TOKEN: p.token,
    GITHUB_REPOSITORY: p.repository, GH_HOST: "github.com",
    GITHUB_SERVER_URL: "https://github.com", GITHUB_API_URL: "https://api.github.com" };
  const r = spawnSync(p.command, p.args, {
    cwd: p.root, env, encoding: "utf8", timeout: p.timeoutMs, maxBuffer: 4194304,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error || r.signal || !Number.isInteger(r.status)) throw new Error();
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  process.exitCode = r.status;
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

  const cleanEnv = launcherEnvironment(env);
  function invoke(program, argv, options = {}) {
    try {
      const result = spawn(program, argv, {
        cwd: root,
        env: cleanEnv,
        encoding: "utf8",
        timeout: 30000,
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
  }
  verifyLocalIdentity();
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
  verifyLocalIdentity();
  const input = JSON.stringify({
    root,
    repository,
    head: expectedHead,
    token,
    command,
    args,
    timeoutMs,
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
      timeout: timeoutMs + 90000,
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
