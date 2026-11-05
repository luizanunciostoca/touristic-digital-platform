import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const activeGroups = new Set();
let interrupted = false;
const same = (a, b, code) => assert.deepEqual(a, b, code);

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
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: hooks,
    GIT_CONFIG_KEY_1: "core.fsmonitor",
    GIT_CONFIG_VALUE_1: "false",
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
    if (error.code === "ESRCH") return false;
    throw error;
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
      failure = null,
      exitTimer;
    const stop = (code) => {
      failure ??= code;
      if (child.pid) killGroup(child.pid, "SIGKILL");
    };
    const timer = setTimeout(() => stop("RETIREMENT_COMMAND_TIMEOUT"), timeout);
    if (child.pid) activeGroups.add(child.pid);
    const receive = (which, chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) return stop("RETIREMENT_LOG_LIMIT");
      if (which === "stdout") stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => receive("stdout", chunk));
    child.stderr.on("data", (chunk) => receive("stderr", chunk));
    child.on("error", () => {
      failure ??= "RETIREMENT_COMMAND_SPAWN_FAILED";
    });
    child.on("exit", () => {
      exitTimer = setTimeout(() => {
        if (groupExists(child.pid)) stop("RETIREMENT_CHILDREN_REMAIN");
      }, 100);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearTimeout(exitTimer);
      activeGroups.delete(child.pid);
      if (child.pid && groupExists(child.pid)) {
        killGroup(child.pid, "SIGKILL");
        failure ??= "RETIREMENT_CHILDREN_REMAIN";
      }
      if (token && `${stdout}${stderr}`.includes(token))
        failure = "RETIREMENT_TOKEN_IN_OUTPUT";
      if (interrupted) failure = "RETIREMENT_INTERRUPTED";
      if (failure || code !== 0)
        reject(new Error(failure ?? "RETIREMENT_COMMAND_FAILED"));
      else resolvePromise({ stdout, stderr, exitCode: code });
    });
  });
}

export function createGithubReader(token, fetchImpl = fetch) {
  const prefix = `/repos/${repository}`;
  return {
    async get(path, missing = false) {
      assert.ok(
        path === prefix || path.startsWith(prefix + "/"),
        "RETIREMENT_API_TARGET",
      );
      const response = await fetchImpl(`https://api.github.com${path}`, {
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
          const key = item.id ?? item.sha ?? item.filename;
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
function snapshot(root, id) {
  return {
    registry: JSON.parse(plainFile(join(root, registryPath))),
    manifest: JSON.parse(plainFile(join(root, manifestPath(id)))),
    ledger: plainFile(join(root, ledgerPath)).toString(),
  };
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

export async function prepareMergedRetirement(environment = process.env) {
  const event = JSON.parse(plainFile(environment.GITHUB_EVENT_PATH));
  const { request, origin } = validateInvocation(environment, event);
  const base = request.expected_main;
  const id = request.claim_id;
  const paths = metadataPaths(id);
  assert.ok(
    process.versions.node.split(".")[0] === "22",
    "RETIREMENT_NODE_VERSION",
  );
  const token = environment.GITHUB_TOKEN;
  assert.ok(
    typeof token === "string" && token.length > 0,
    "RETIREMENT_READ_TOKEN_REQUIRED",
  );
  for (const key of ["RUNNER_TEMP", "GITHUB_WORKSPACE"]) {
    assert.ok(
      isAbsolute(environment[key] ?? "") &&
        realpathSync(environment[key]) === environment[key],
      "RETIREMENT_HOSTED_PATH",
    );
  }
  plainFile(environment.GITHUB_OUTPUT);
  const api = createGithubReader(token),
    prefix = `/repos/${repository}`;
  const capture = async () => {
    const data = await Promise.all([
      api.get(prefix),
      api.get(prefix + "/git/ref/heads/main"),
      api.get(prefix + "/pulls/" + request.merged_pr),
      api.get(prefix + "/git/commits/" + request.material_head),
    ]);
    return validateRemote(request, origin, ...data);
  };
  const remote = await capture();
  const task = mkdtempSync(join(environment.RUNNER_TEMP, "merged-retirement-"));
  const repo = join(task, "repository"),
    evidence = join(task, "evidence"),
    hooks = join(task, "hooks"),
    temporary = join(task, "temporary");
  for (const dir of [evidence, hooks, temporary])
    mkdirSync(dir, { mode: 0o700 });
  const safeEnv = isolatedEnvironment(environment, hooks, temporary);
  const branch = `chore/retire-merged-${id.toLowerCase()}-${request.nonce}`;
  const executions = [];
  const run = async (name, command, args, options = {}) => {
    const startedAt = new Date().toISOString();
    const output = await runChecked(command, args, {
      cwd: repo,
      env: safeEnv,
      token,
      ...options,
    });
    writeEvidence(evidence, `${name}.log`, output.stdout + output.stderr);
    executions.push({
      name,
      command,
      args,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: output.exitCode,
      outputSha256: digest(output.stdout + output.stderr),
    });
    return output.stdout;
  };
  let sequence = 0;
  const git = async (...args) =>
    (await run(`git-${++sequence}`, "git", args)).trim();
  const fresh = async () => {
    assert.ok(!interrupted, "RETIREMENT_INTERRUPTED");
    same(await capture(), remote, "RETIREMENT_PROVIDER_IDENTITY_CHANGED");
    same(
      (
        await git("ls-remote", "--exit-code", "origin", "refs/heads/main")
      ).split(/\s/u)[0],
      base,
      "RETIREMENT_REMOTE_MAIN_CHANGED",
    );
  };
  const clean = async (head, tree = null) => {
    same(await git("rev-parse", "HEAD"), head, "RETIREMENT_HEAD_CHANGED");
    if (tree)
      same(
        await git("rev-parse", "HEAD^{tree}"),
        tree,
        "RETIREMENT_TREE_CHANGED",
      );
    same(
      await git("branch", "--show-current"),
      branch,
      "RETIREMENT_BRANCH_CHANGED",
    );
    same(
      await git("status", "--porcelain=v1", "--untracked-files=all"),
      "",
      "RETIREMENT_WORKTREE_DIRTY",
    );
    same(
      realpathSync(resolve(repo, await git("rev-parse", "--git-common-dir"))),
      realpathSync(join(repo, ".git")),
      "RETIREMENT_STORE_SHARED",
    );
  };
  const sourceBytes = async (
    root,
    sha,
    paths = [
      "tooling",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ],
  ) => {
    const listing = (
      await run(
        `source-${++sequence}`,
        "git",
        ["ls-tree", "-rz", sha, "--", ...paths],
        { cwd: root },
      )
    )
      .split("\0")
      .filter(Boolean);
    const records = listing.map((line) => {
      const [entry, path] = line.split("\t");
      const [mode, type, oid] = entry.split(" ");
      same(type, "blob", "RETIREMENT_SOURCE_TYPE");
      assert.ok(
        mode === "100644" || mode === "100755",
        "RETIREMENT_SOURCE_MODE",
      );
      const bytes = plainFile(join(root, path));
      same(
        createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex"),
        oid,
        "RETIREMENT_EXECUTED_BYTES_CHANGED",
      );
      return [path, mode, oid];
    });
    return digest(json(records));
  };
  const outcome = {
    kind: "MERGED_RETIREMENT_PREPARATION",
    classification: "VERIFICATION_INPUT_NOT_CERTIFICATE",
    request,
    origin,
    remote,
    branch,
    status: "NOT_PROVEN",
    publicationAuthorized: false,
    independentReview: "PENDING",
  };
  try {
    const trusted = environment.GITHUB_WORKSPACE;
    same(
      (
        await run("trusted-head", "git", ["rev-parse", "HEAD"], {
          cwd: trusted,
        })
      ).trim(),
      base,
      "RETIREMENT_TRUSTED_HEAD",
    );
    same(
      (
        await run(
          "trusted-clean",
          "git",
          ["status", "--porcelain=v1", "--untracked-files=all"],
          { cwd: trusted },
        )
      ).trim(),
      "",
      "RETIREMENT_TRUSTED_DIRTY",
    );
    same(
      realpathSync(fileURLToPath(import.meta.url)),
      realpathSync(join(trusted, "tooling/ci/merged-retirement-executor.mjs")),
      "RETIREMENT_EXECUTOR_LOCATION",
    );
    const trustedBytes = await sourceBytes(trusted, base);
    await run("git-init", "git", ["init", "--quiet", repo], { cwd: task });
    await git(
      "remote",
      "add",
      "origin",
      `https://github.com/${repository}.git`,
    );
    await run(
      "git-fetch",
      "git",
      [
        "fetch",
        "--no-tags",
        "--no-recurse-submodules",
        "origin",
        "refs/heads/main:refs/remotes/origin/main",
      ],
      { timeout: 300000 },
    );
    same(
      await git("rev-parse", "refs/remotes/origin/main"),
      base,
      "RETIREMENT_FETCH_STALE",
    );
    same(
      await git("rev-parse", "--is-shallow-repository"),
      "false",
      "RETIREMENT_HISTORY_INCOMPLETE",
    );
    assert.ok(
      !existsSync(join(repo, ".git/objects/info/alternates")),
      "RETIREMENT_ALTERNATE_STORE",
    );
    await git("checkout", "-b", branch, base);
    await clean(base);
    same(
      await sourceBytes(repo, base),
      trustedBytes,
      "RETIREMENT_TRUSTED_SOURCE_MISMATCH",
    );
    await git("merge-base", "--is-ancestor", request.merge_sha, base);
    const before = snapshot(repo, id);
    if (!Object.hasOwn(before.registry.claims, id)) {
      outcome.readback = verifyAlreadyRetired(before, request);
      await git("merge-base", "--is-ancestor", before.manifest.baseSha, base);
      await fresh();
      await clean(base);
      outcome.status = outcome.readback.status;
    } else {
      same(
        before.registry.claims[id].branch,
        remote.materialBranch,
        "RETIREMENT_CLAIM_BRANCH",
      );
      same(before.manifest.id, id, "RETIREMENT_MANIFEST_ID");
      assert.ok(
        (await api.get(
          prefix + "/git/ref/heads/" + encodeURIComponent(branch),
          true,
        )) === null,
        "RETIREMENT_REMOTE_BRANCH_EXISTS",
      );
      for (const pr of await api.list(prefix + "/pulls?state=open&base=main")) {
        const files = await api.list(prefix + `/pulls/${pr.number}/files`);
        assert.ok(
          !files.some(
            (file) =>
              paths.includes(file.filename) ||
              paths.includes(file.previous_filename),
          ),
          "RETIREMENT_OPEN_WORK_OVERLAP",
        );
      }
      await run(
        "dependencies",
        "pnpm",
        ["install", "--frozen-lockfile", "--ignore-scripts"],
        { timeout: 300000 },
      );
      const ready = await run("workspace", process.execPath, [
        "tooling/workspace/morro-workspace.mjs",
        "ready",
        repo,
        base,
      ]);
      terminalObject(
        ready,
        {
          ready: true,
          exactBaseSha: base,
          headSha: base,
          branch,
          runtime: "native",
          fallbackUsed: false,
          dependenciesReady: true,
        },
        "workspace",
      );
      await clean(base);
      await fresh();
      const authenticated = {
        ...safeEnv,
        GITHUB_TOKEN: token,
        NODE_REDIRECT_WARNINGS: join(temporary, "warnings.log"),
      };
      const produced = await run(
        "canonical-producer",
        process.execPath,
        [
          "tooling/mdctl/mdctl.mjs",
          "claim",
          "retire",
          manifestPath(id),
          "--base-sha",
          base,
        ],
        { env: authenticated, timeout: 180000 },
      );
      outcome.producer = terminalObject(produced, {
        action: "retire",
        changeSetId: id,
        branch,
        baseSha: base,
        evidenceReason: "MERGED_PR",
        state: "MERGED",
        eventTypes: ["MERGED", "CLAIM_RELEASED"],
        authority: "LOCAL_TRANSITION_REQUIRES_INDEPENDENT_GIT_PROOF",
      });
      const prepared = await run(
        "prepare",
        process.execPath,
        ["tooling/ci/local-fast-gate.mjs", "--prepare", "--base", base],
        { timeout: 180000 },
      );
      const terminal = terminalObject(prepared, {
        mode: "PREPARED",
        baseSha: base,
        headSha: base,
      });
      same(terminal.files.slice().sort(), paths, "RETIREMENT_PREPARE_SCOPE");
      outcome.transition = verifyTransition(
        before,
        snapshot(repo, id),
        request,
        branch,
      );
      same(
        (await git("diff", "--name-only", base)).split("\n").sort(),
        paths,
        "RETIREMENT_DIFF_SCOPE",
      );
      await git("diff", "--check");
      await git("add", "--", ...paths);
      await git(
        "-c",
        "user.name=Morro Retirement Executor",
        "-c",
        "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "commit",
        "-m",
        `chore(governance): retire merged ${id}`,
      );
      const head = await git("rev-parse", "HEAD"),
        tree = await git("rev-parse", "HEAD^{tree}");
      same(
        await git("rev-list", "--parents", "-n", "1", head),
        `${head} ${base}`,
        "RETIREMENT_CANDIDATE_PARENT",
      );
      outcome.candidate = {
        head,
        tree,
        base: base,
        branch,
        claimId: id,
      };
      outcome.candidate.metadataDigest = await sourceBytes(repo, head, paths);
      for (const mode of ["admission", "certify"]) {
        await clean(head, tree);
        await fresh();
        const output = await run(
          mode,
          process.execPath,
          ["tooling/ci/local-fast-gate.mjs", `--${mode}`, "--base", base],
          { env: authenticated, timeout: mode === "certify" ? 600000 : 180000 },
        );
        terminalObject(output, {
          mode: "NON_RUNTIME",
          baseSha: base,
          headSha: head,
          treeSha: tree,
        });
        outcome[mode] = terminalObject(output, {
          mode: mode === "certify" ? "CERTIFIED" : "ADMISSION_PASS",
          baseSha: base,
          headSha: head,
          treeSha: tree,
          claimId: id,
          workspaceRuntime: "native",
          workspaceFallbackUsed: false,
        });
        if (mode === "certify") outcome.tests = tapSummary(output);
      }
      await clean(head, tree);
      await fresh();
      verifyTransition(before, snapshot(repo, id), request, branch);
      same(
        await sourceBytes(repo, head),
        trustedBytes,
        "RETIREMENT_SOURCE_AFTER_PROOF",
      );
      same(
        await sourceBytes(repo, head, paths),
        outcome.candidate.metadataDigest,
        "RETIREMENT_METADATA_AFTER_PROOF",
      );
      writeEvidence(
        evidence,
        "candidate.patch",
        await run("candidate-patch", "git", [
          "diff",
          "--binary",
          "--full-index",
          base,
          head,
        ]),
      );
      const bundle = join(evidence, "verification-input.bundle");
      await git("bundle", "create", bundle, "HEAD", "^" + base);
      await git("bundle", "verify", bundle);
      same(
        await git("bundle", "list-heads", bundle),
        `${head} HEAD`,
        "RETIREMENT_BUNDLE_HEAD",
      );
      const header = plainFile(bundle)
        .subarray(0, plainFile(bundle).indexOf("\n\n"))
        .toString();
      same(
        [...header.matchAll(/^-([a-f0-9]{40}) /gmu)].map((match) => match[1]),
        [base],
        "RETIREMENT_BUNDLE_PREREQUISITE",
      );
      await fresh();
      await clean(head, tree);
      assert.ok(
        (await api.get(
          prefix + "/git/ref/heads/" + encodeURIComponent(branch),
          true,
        )) === null,
        "RETIREMENT_BRANCH_CREATED_DURING_PROOF",
      );
      outcome.status = "LOCAL_CANONICAL_GATES_PASS_REVIEW_PENDING";
    }
    writeEvidence(evidence, "result.json", { ...outcome, executions });
    sealEvidence(evidence, token);
    appendFileSync(environment.GITHUB_OUTPUT, `evidence_dir=${evidence}\n`);
    return outcome;
  } catch (error) {
    writeEvidence(evidence, "failure.json", {
      ...outcome,
      status: "NOT_PROVEN",
      error: /^[A-Z_]+$/u.test(error.message)
        ? error.message
        : "RETIREMENT_FAILED",
      executions,
    });
    try {
      sealEvidence(evidence, token);
      appendFileSync(environment.GITHUB_OUTPUT, `evidence_dir=${evidence}\n`);
    } catch {
      /* Failed artifact validation must never enable upload. */
    }
    throw new Error("MERGED_RETIREMENT_PREPARATION_FAILED");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      interrupted = true;
      for (const pid of activeGroups) killGroup(pid, "SIGKILL");
    });
  prepareMergedRetirement()
    .then((result) => console.log(json(result)))
    .catch(() => {
      console.error("MERGED_RETIREMENT_PREPARATION_FAILED");
      process.exitCode = 1;
    });
}
