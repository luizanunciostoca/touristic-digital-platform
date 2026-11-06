import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const repository = "luizanunciostoca/touristic-digital-platform";
export const workflowPath = ".github/workflows/merged-retirement-executor.yml";
const owner = repository.split("/")[0];
const SHA = /^[a-f0-9]{40}$/u;
const registryPath = ".github/morro-control/claims.json";
const ledgerPath = ".github/morro-control/events.ndjson";
const MAX_BYTES = 16 * 1024 * 1024;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const manifestPath = (id) => `.morro/changesets/${id}.json`;
export const metadataPaths = (id) =>
  [registryPath, ledgerPath, manifestPath(id)].sort();
const activeCommands = new Set();
let interrupted = false;
const same = (a, b, code) => assert.deepEqual(a, b, code);
const isGitPath = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  !value.includes("\0") &&
  value.split("/").every((part) => part && part !== "." && part !== "..");

export function validateRequest(inputs) {
  same(
    Object.keys(inputs ?? {}).sort(),
    [
      "claim_id",
      "expected_main",
      "material_head",
      "merge_sha",
      "merged_pr",
      "nonce",
    ].sort(),
    "RETIREMENT_INPUT_FIELDS",
  );
  assert.ok(
    Object.values(inputs).every((value) => typeof value === "string"),
    "RETIREMENT_INPUT_TYPES",
  );
  assert.ok(
    /^MD-[A-Z0-9-]{1,117}$/u.test(inputs.claim_id),
    "RETIREMENT_CLAIM_ID",
  );
  for (const key of ["expected_main", "material_head", "merge_sha"])
    assert.ok(SHA.test(inputs[key] ?? ""), "RETIREMENT_SHA");
  assert.ok(/^[1-9][0-9]{0,8}$/u.test(inputs.merged_pr ?? ""), "RETIREMENT_PR");
  assert.ok(/^[a-f0-9]{12}$/u.test(inputs.nonce ?? ""), "RETIREMENT_NONCE");
  return Object.freeze({ ...inputs });
}

export function validateInvocation(environment, event) {
  const request = validateRequest(event?.inputs);
  const exact = {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_OWNER: owner,
    GITHUB_ACTOR: owner,
    GITHUB_TRIGGERING_ACTOR: owner,
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_ACTIONS: "true",
    CI: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Linux",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_API_URL: "https://api.github.com",
    GITHUB_WORKFLOW_REF: `${repository}/${workflowPath}@refs/heads/main`,
    GITHUB_SHA: request.expected_main,
    GITHUB_WORKFLOW_SHA: request.expected_main,
  };
  for (const [key, value] of Object.entries(exact))
    same(environment[key], value, "RETIREMENT_WORKFLOW_ORIGIN");
  assert.ok(
    /^[1-9][0-9]*$/u.test(environment.GITHUB_RUN_ID ?? ""),
    "RETIREMENT_RUN_ID",
  );
  const repo = event.repository;
  same(repo?.full_name, repository, "RETIREMENT_EVENT_REPOSITORY");
  same(
    String(repo?.id),
    environment.GITHUB_REPOSITORY_ID,
    "RETIREMENT_REPOSITORY_ID",
  );
  same(repo?.private, false, "RETIREMENT_REPOSITORY_VISIBILITY");
  same(repo?.owner?.login, owner, "RETIREMENT_EVENT_OWNER");
  same(event.sender?.login, owner, "RETIREMENT_EVENT_ACTOR");
  assert.ok(
    !environment.GH_TOKEN && !environment.GH_ENTERPRISE_TOKEN,
    "RETIREMENT_UNEXPECTED_AUTH",
  );
  return {
    request,
    origin: {
      repository,
      repositoryId: repo.id,
      workflowPath,
      workflowSha: request.expected_main,
      runId: environment.GITHUB_RUN_ID,
      runAttempt: 1,
      actor: owner,
    },
  };
}

export function isolatedEnvironment(environment, hooks, temporary) {
  const safe = {};
  for (const key of [
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ])
    if (environment[key]) safe[key] = environment[key];
  return {
    ...safe,
    CI: "true",
    GITHUB_REPOSITORY: repository,
    TMPDIR: temporary,
    TURBO_TELEMETRY_DISABLED: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_NO_LAZY_FETCH: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: hooks,
    GIT_CONFIG_KEY_1: "core.fsmonitor",
    GIT_CONFIG_VALUE_1: "false",
  };
}

export function executorGitEnvironment(environment) {
  return {
    ...environment,
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_2: "protocol.file.allow",
    GIT_CONFIG_VALUE_2: "never",
  };
}

function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
function groupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

export async function runChecked(
  command,
  args,
  { cwd, env, timeout = 60000, maxBytes = MAX_BYTES, token = "" } = {},
) {
  assert.ok(!interrupted, "RETIREMENT_INTERRUPTED");
  assert.ok(process.platform === "linux", "RETIREMENT_LINUX_REQUIRED");
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      bytes = 0,
      failure = null;
    let exitCode = null,
      signal = null,
      settled = false,
      exitTimer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(exitTimer);
      activeCommands.delete(stop);
      if (
        token &&
        [stdout + stderr, stderr + stdout].some((value) =>
          value.includes(token),
        )
      )
        failure = "RETIREMENT_TOKEN_IN_OUTPUT";
      if (interrupted) failure = "RETIREMENT_INTERRUPTED";
      const redaction =
        token.length >= 10 ? "[REDACTED]" : "*".repeat(token.length);
      const streams = [stdout, stderr];
      for (const [first, second] of [
        [0, 1],
        [1, 0],
      ])
        for (let length = 1; length < token.length; length++)
          if (
            streams[first].endsWith(token.slice(0, length)) &&
            streams[second].startsWith(token.slice(length))
          ) {
            streams[first] = streams[first].slice(0, -length) + redaction;
            streams[second] = streams[second].slice(token.length - length);
            break;
          }
      [stdout, stderr] = streams;
      const redact = (value) => {
        if (!token) return value;
        value = value.replaceAll(token, redaction);
        if (failure)
          for (
            let length = Math.min(token.length - 1, value.length);
            length > 0;
            length--
          )
            if (value.endsWith(token.slice(0, length)))
              return value.slice(0, -length) + redaction;
        return value;
      };
      stdout = redact(stdout);
      stderr = redact(stderr);
      if (
        token &&
        [stdout + stderr, stderr + stdout].some((value) =>
          value.includes(token),
        )
      ) {
        stdout = redaction;
        stderr = "";
      }
      const execution = {
        stdout,
        stderr,
        exitCode,
        signal,
        failureCode:
          failure ?? (exitCode === 0 ? null : "RETIREMENT_COMMAND_FAILED"),
        outputTruncated: bytes > maxBytes,
      };
      if (execution.failureCode)
        reject(Object.assign(new Error(execution.failureCode), { execution }));
      else resolvePromise(execution);
    };
    const terminate = () => {
      try {
        if (child.pid) killGroup(child.pid, "SIGKILL");
      } catch {
        failure ??= "RETIREMENT_TERMINATION_FAILED";
      }
    };
    const stop = (code) => {
      if (settled) return;
      failure ??= code;
      terminate();
      // Process groups do not contain escaped sessions. Closing our pipes
      // bounds this promise; the ephemeral hosted runner is the outer boundary.
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      finish();
    };
    const timer = setTimeout(() => stop("RETIREMENT_COMMAND_TIMEOUT"), timeout);
    activeCommands.add(stop);
    const receive = (which, chunk) => {
      if (settled) return;
      const buffer = Buffer.from(chunk);
      const captured = buffer
        .subarray(0, Math.max(0, maxBytes - bytes))
        .toString();
      bytes += buffer.length;
      if (which === "stdout") stdout += captured;
      else stderr += captured;
      if (bytes > maxBytes) stop("RETIREMENT_LOG_LIMIT");
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => receive("stdout", chunk));
    child.stderr.on("data", (chunk) => receive("stderr", chunk));
    child.on("error", () => stop("RETIREMENT_COMMAND_SPAWN_FAILED"));
    child.on("exit", (code, observedSignal) => {
      if (settled) return;
      exitCode = code;
      signal = observedSignal;
      exitTimer = setTimeout(() => {
        if (groupExists(child.pid)) stop("RETIREMENT_CHILDREN_REMAIN");
      }, 100);
    });
    child.on("close", (code, observedSignal) => {
      if (settled) return;
      exitCode = code;
      signal = observedSignal;
      if (child.pid && groupExists(child.pid)) {
        failure ??= "RETIREMENT_CHILDREN_REMAIN";
        terminate();
      }
      finish();
    });
  });
}

export function createGithubReader(token, fetchImpl = fetch) {
  const prefix = `/repos/${repository}`;
  return {
    async get(path, missing = false) {
      assert.ok(!interrupted, "RETIREMENT_INTERRUPTED");
      const url = new URL(`https://api.github.com${path}`);
      assert.ok(
        url.origin === "https://api.github.com" &&
          (url.pathname === prefix || url.pathname.startsWith(prefix + "/")),
        "RETIREMENT_API_TARGET",
      );
      const response = await fetchImpl(url.href, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (missing && response.status === 404) return null;
      assert.ok(response.ok, "RETIREMENT_API_READ_FAILED");
      const text = await response.text();
      assert.ok(
        Buffer.byteLength(text) <= 4 * 1024 * 1024,
        "RETIREMENT_API_LIMIT",
      );
      return JSON.parse(text);
    },
    async list(path) {
      const rows = [],
        ids = new Set();
      for (let page = 1; page <= 20; page++) {
        const batch = await this.get(
          `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
        );
        assert.ok(
          Array.isArray(batch) && batch.length <= 100,
          "RETIREMENT_API_PAGE_INVALID",
        );
        for (const item of batch) {
          const key = item.id ?? item.filename ?? item.sha;
          assert.ok(
            key !== undefined && !ids.has(key),
            "RETIREMENT_API_DUPLICATE",
          );
          ids.add(key);
          rows.push(item);
        }
        if (batch.length < 100) return rows;
      }
      throw new Error("RETIREMENT_API_PAGINATION_INCOMPLETE");
    },
  };
}

export function validateRemote(request, origin, repo, main, pr, commit) {
  same(repo.id, origin.repositoryId, "RETIREMENT_PROVIDER_REPOSITORY_ID");
  same(repo.full_name, repository, "RETIREMENT_PROVIDER_REPOSITORY");
  same(repo.default_branch, "main", "RETIREMENT_DEFAULT_BRANCH");
  same(repo.private, false, "RETIREMENT_PRIVATE_REPOSITORY");
  same(main.object?.sha, request.expected_main, "RETIREMENT_STALE_MAIN");
  same(pr.number, Number(request.merged_pr), "RETIREMENT_PR_NUMBER");
  same(pr.merged, true, "RETIREMENT_PR_NOT_MERGED");
  same(pr.state, "closed", "RETIREMENT_PR_NOT_CLOSED");
  same(pr.base?.ref, "main", "RETIREMENT_PR_BASE");
  same(pr.base?.repo?.full_name, repository, "RETIREMENT_PR_BASE_REPOSITORY");
  same(pr.head?.repo?.full_name, repository, "RETIREMENT_PR_HEAD_REPOSITORY");
  same(pr.head?.sha, request.material_head, "RETIREMENT_MATERIAL_HEAD");
  same(pr.merge_commit_sha, request.merge_sha, "RETIREMENT_MERGE_SHA");
  same(commit.sha, request.material_head, "RETIREMENT_MATERIAL_COMMIT");
  assert.ok(SHA.test(commit.tree?.sha ?? ""), "RETIREMENT_MATERIAL_TREE");
  return {
    repositoryId: repo.id,
    baseSha: request.expected_main,
    pr: pr.number,
    materialHead: pr.head.sha,
    materialTree: commit.tree.sha,
    materialBranch: pr.head.ref,
    mergeSha: pr.merge_commit_sha,
  };
}

function verifyMergedEvents(events, request) {
  same(
    events.map((event) => event.eventType),
    ["MERGED", "CLAIM_RELEASED"],
    "RETIREMENT_EVENT_TYPES",
  );
  for (const event of events) {
    same(event.entity, request.claim_id, "RETIREMENT_EVENT_CLAIM");
    same(event.actor, "ORCHESTRATOR", "RETIREMENT_EVENT_ACTOR");
    same(event.sourceSha, request.merge_sha, "RETIREMENT_EVENT_MERGE");
    same(
      event.payload,
      {
        basis: "GITHUB_MERGED_PR_AND_MAIN_ANCESTRY",
        pullRequest: Number(request.merged_pr),
        mergeSha: request.merge_sha,
      },
      "RETIREMENT_EVENT_PROVENANCE",
    );
  }
}

export function verifyTransition(before, after, request, branch) {
  const expectedRegistry = structuredClone(before.registry);
  assert.ok(
    Object.hasOwn(expectedRegistry.claims, request.claim_id),
    "RETIREMENT_CLAIM_ABSENT",
  );
  delete expectedRegistry.claims[request.claim_id];
  same(after.registry, expectedRegistry, "RETIREMENT_SURVIVORS_CHANGED");
  same(
    after.manifest,
    {
      ...before.manifest,
      baseSha: request.expected_main,
      branch,
      state: "MERGED",
    },
    "RETIREMENT_MANIFEST_AUTHORITY_CHANGED",
  );
  assert.ok(
    after.ledger.startsWith(before.ledger),
    "RETIREMENT_HISTORY_CHANGED",
  );
  const appended = after.ledger
    .slice(before.ledger.length)
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  verifyMergedEvents(appended, request);
  return {
    paths: metadataPaths(request.claim_id),
    eventTypes: appended.map((event) => event.eventType),
    reason: "MERGED_PR",
  };
}

export function verifyAlreadyRetired(snapshot, request) {
  assert.ok(
    !Object.hasOwn(snapshot.registry.claims, request.claim_id),
    "RETIREMENT_STILL_ACTIVE",
  );
  same(
    snapshot.manifest.id,
    request.claim_id,
    "RETIREMENT_ARCHIVED_MANIFEST_ID",
  );
  same(snapshot.manifest.state, "MERGED", "RETIREMENT_ARCHIVED_MANIFEST_STATE");
  const history = snapshot.ledger
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((event) => event.entity === request.claim_id);
  const events = history.slice(-2);
  verifyMergedEvents(events, request);
  return {
    status: "ALREADY_RETIRED_VERIFIED",
    claimId: request.claim_id,
    observedBase: request.expected_main,
    mergeSha: request.merge_sha,
  };
}

export function terminalObject(output, expected, discriminator) {
  const objects = [];
  for (let start = 0; start < output.length; start++) {
    if (
      output[start] !== "{" ||
      output.slice(output.lastIndexOf("\n", start - 1) + 1, start).trim()
    )
      continue;
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let end = start; end < output.length; end++) {
      const char = output[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          objects.push(JSON.parse(output.slice(start, end + 1)));
        } catch {
          /* Non-JSON command output. */
        }
        start = end;
        break;
      }
    }
  }
  const kind =
    discriminator ?? (Object.hasOwn(expected, "mode") ? "mode" : "action");
  assert.ok(
    kind === "workspace" ||
      (["mode", "action"].includes(kind) &&
        typeof expected[kind] === "string" &&
        expected[kind].length > 0),
    "RETIREMENT_TERMINAL_DISCRIMINATOR",
  );
  const matches = objects.filter((value) =>
    kind === "workspace"
      ? Object.hasOwn(value, "ready")
      : value[kind] === expected[kind],
  );
  same(matches.length, 1, "RETIREMENT_SEMANTIC_TERMINAL");
  for (const [key, required] of Object.entries(expected))
    same(matches[0][key], required, "RETIREMENT_TERMINAL_IDENTITY");
  return matches[0];
}

export function tapSummary(output) {
  const counts = {};
  for (const field of [
    "tests",
    "pass",
    "fail",
    "cancelled",
    "skipped",
    "todo",
  ]) {
    const matches = [
      ...output.matchAll(new RegExp(`^# ${field} ([0-9]+)\\s*$`, "gmu")),
    ];
    same(matches.length, 1, "RETIREMENT_TAP_AMBIGUOUS");
    counts[field] = Number(matches[0][1]);
  }
  assert.ok(
    counts.tests > 0 &&
      counts.tests === counts.pass &&
      ["fail", "cancelled", "skipped", "todo"].every(
        (field) => counts[field] === 0,
      ),
    "RETIREMENT_TAP_NOT_ALL_PASS",
  );
  return counts;
}

function plainFile(path) {
  const info = lstatSync(path);
  assert.ok(
    info.isFile() && !info.isSymbolicLink(),
    "RETIREMENT_REGULAR_FILE_REQUIRED",
  );
  return readFileSync(path);
}
function writeEvidence(directory, name, value) {
  writeFileSync(
    join(directory, name),
    typeof value === "string" || Buffer.isBuffer(value) ? value : json(value),
    { flag: "wx", mode: 0o600 },
  );
}

export function sealEvidence(directory, token) {
  const members = readdirSync(directory)
    .sort()
    .map((name) => {
      const bytes = plainFile(join(directory, name));
      assert.ok(
        !token || !bytes.includes(Buffer.from(token)),
        "RETIREMENT_TOKEN_IN_ARTIFACT",
      );
      return { name, bytes: bytes.length, sha256: digest(bytes) };
    });
  assert.ok(
    members.reduce((total, member) => total + member.bytes, 0) <=
      64 * 1024 * 1024,
    "RETIREMENT_ARTIFACT_LIMIT",
  );
  writeEvidence(directory, "artifact-manifest.json", {
    classification: "VERIFICATION_INPUT_NOT_CERTIFICATE",
    members,
    independentReview: "PENDING",
    publicationAuthorized: false,
    remoteProof: "NOT_STARTED",
  });
}

// The hosted orchestrator is a separate, dependent delivery.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.error("MERGED_RETIREMENT_PREPARATION_NOT_IMPLEMENTED");
  process.exitCode = 1;
}
