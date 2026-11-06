import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
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
  repository,
  workflowPath,
  validateRequest,
  validateInvocation,
  terminalObject,
  tapSummary,
  runChecked,
  sealEvidence,
  createGithubReader,
  validateRemote,
  isolatedEnvironment,
  executorGitEnvironment,
} from "./merged-retirement-executor.mjs";

const request = {
  claim_id: "MD-FIXTURE-MERGED",
  expected_main: "a".repeat(40),
  material_head: "b".repeat(40),
  merge_sha: "c".repeat(40),
  merged_pr: "12",
  nonce: "abcdef012345",
};
const execute = (script, options) =>
  runChecked(process.execPath, ["-e", script], options);
function invocation() {
  const event = {
    inputs: { ...request },
    repository: {
      id: 123,
      full_name: repository,
      private: false,
      owner: { login: "luizanunciostoca" },
    },
    sender: { login: "luizanunciostoca" },
  };
  const env = {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_ID: "123",
    GITHUB_REPOSITORY_OWNER: "luizanunciostoca",
    GITHUB_ACTOR: "luizanunciostoca",
    GITHUB_TRIGGERING_ACTOR: "luizanunciostoca",
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
    GITHUB_RUN_ID: "999",
  };
  return { event, env };
}

test("retirement accepts a generic, closed request bound to owner/main dispatch", () => {
  const { event, env } = invocation();
  assert.deepEqual(validateInvocation(env, event).request, request);
  assert.equal(
    validateRequest({ ...request, claim_id: "MD-A-DIFFERENT-MERGED-TASK" })
      .claim_id,
    "MD-A-DIFFERENT-MERGED-TASK",
  );
  for (const change of [
    { claim_id: "../other" },
    { expected_main: "main" },
    { merged_pr: 12 },
    { nonce: "old" },
    { material_head: "" },
    { merge_sha: "UNKNOWN" },
    { approval: "historical" },
  ])
    assert.throws(() => validateRequest({ ...request, ...change }));
  for (const key of [
    "GITHUB_SHA",
    "GITHUB_WORKFLOW_SHA",
    "GITHUB_REPOSITORY",
    "GITHUB_REPOSITORY_ID",
    "GITHUB_REF",
    "GITHUB_ACTOR",
    "GITHUB_TRIGGERING_ACTOR",
    "GITHUB_RUN_ATTEMPT",
    "RUNNER_ENVIRONMENT",
    "GITHUB_WORKFLOW_REF",
  ])
    assert.throws(() => validateInvocation({ ...env, [key]: "other" }, event));
  const changed = structuredClone(event);
  changed.inputs.nonce = "000000000000";
  assert.equal(validateInvocation(env, changed).request.nonce, "000000000000");
  changed.sender.login = "other";
  assert.throws(() => validateInvocation(env, changed));
});

test("semantic terminal and TAP evidence reject duplicate, stale and skipped proof", () => {
  const result = {
    mode: "CERTIFIED",
    headSha: request.expected_main,
    nested: { value: "{quoted}" },
  };
  const output = "command output\n" + JSON.stringify(result, null, 2) + "\n";
  assert.deepEqual(
    terminalObject(output, {
      mode: "CERTIFIED",
      headSha: request.expected_main,
    }),
    result,
  );
  assert.throws(() => terminalObject(output + output, { mode: "CERTIFIED" }));
  assert.throws(() =>
    terminalObject(output, {
      mode: "CERTIFIED",
      headSha: request.material_head,
    }),
  );
  const tap =
    "# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  assert.equal(tapSummary(tap).pass, 2);
  assert.throws(() => tapSummary(tap.replace("# skipped 0", "# skipped 1")));
  assert.throws(() => tapSummary(tap + tap));
});

test("real subprocess execution is bounded, rejects leaked tokens and drains descendants", async () => {
  const result = await execute("process.stdout.write('actual-execution')");
  assert.equal(result.stdout, "actual-execution");
  await assert.rejects(() => execute("process.exit(2)"), /COMMAND_FAILED/u);
  await assert.rejects(
    () => execute("setInterval(()=>{},1000)", { timeout: 100 }),
    /TIMEOUT/u,
  );
  await assert.rejects(
    () =>
      execute("console.log('fixture-token')", {
        token: "fixture-token",
      }),
    /TOKEN_IN_OUTPUT/u,
  );
  await assert.rejects(
    () =>
      execute("console.log('x'.repeat(1000))", {
        maxBytes: 20,
      }),
    /LOG_LIMIT/u,
  );
  await assert.rejects(
    () =>
      execute(
        "require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}).unref()",
      ),
    /CHILDREN_REMAIN/u,
  );
});

test("hardening: detached pipe holders cannot postpone the command deadline", async () => {
  const directory = mkdtempSync(join(tmpdir(), "retirement-detached-"));
  const pidFile = join(directory, "descendant.pid");
  // Native readiness avoids spending the command deadline in Node bootstrap.
  const script = `setsid sh -c 'printf "%s\\n" "$$" > "$1"; exec sleep 60' fixture "$1" &
while [ ! -s "$1" ]; do sleep 0.01; done`;
  let watchdog;
  const started = Date.now();
  const operation = runChecked("sh", ["-c", script, "fixture", pidFile], {
    timeout: 700,
    env: { PATH: process.env.PATH },
  }).then(
    () => ({ passed: true }),
    (error) => ({ error }),
  );
  let result;
  try {
    result = await Promise.race([
      operation,
      new Promise((done) => {
        watchdog = setTimeout(() => done({ hung: true }), 2500);
      }),
    ]);
    assert.ok(
      existsSync(pidFile),
      "fixture must create the escaped descendant",
    );
    assert.equal(result.hung, undefined);
    assert.match(result.error?.message ?? "", /RETIREMENT_COMMAND_TIMEOUT/);
    assert.ok(Date.now() - started < 2200);
    assert.doesNotThrow(() => process.kill(Number(readFileSync(pidFile)), 0));
    // The command deadline is bounded; killing an escaped session is the
    // ephemeral runner's responsibility. This fixture owns its local cleanup.
  } finally {
    clearTimeout(watchdog);
    if (existsSync(pidFile)) {
      try {
        process.kill(-Number(readFileSync(pidFile)), "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    await operation;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("hardening: failed commands retain bounded redacted output and exit identity", async () => {
  await assert.rejects(
    () =>
      execute(
        "console.log('before fixture-secret after');console.error('diagnostic');process.exit(7)",
        { token: "fixture-secret" },
      ),
    (error) => {
      assert.equal(error.execution.exitCode, 7);
      assert.equal(error.execution.signal, null);
      assert.equal(error.execution.failureCode, "RETIREMENT_TOKEN_IN_OUTPUT");
      assert.equal(error.execution.stdout, "before [REDACTED] after\n");
      assert.equal(error.execution.stderr, "diagnostic\n");
      return true;
    },
  );
  await assert.rejects(
    () =>
      execute(
        "process.stdout.write('fixture-');process.stderr.write('secret');process.exit(7)",
        { token: "fixture-secret" },
      ),
    (error) => {
      assert.equal(error.execution.stdout, "[REDACTED]");
      assert.equal(error.execution.stderr, "");
      return true;
    },
  );
  await assert.rejects(
    () =>
      execute("console.log('x'.repeat(1000))", {
        token: "x",
        maxBytes: 20,
      }),
    (error) => {
      assert.equal(error.execution.outputTruncated, true);
      assert.equal(error.execution.stdout, "*".repeat(20));
      return true;
    },
  );
  await assert.rejects(
    () => execute("process.kill(process.pid, 'SIGTERM')"),
    (error) => {
      assert.equal(error.execution.exitCode, null);
      assert.equal(error.execution.signal, "SIGTERM");
      return true;
    },
  );
});

test("artifact publication requires regular bounded files and a clean token scan", () => {
  const directory = mkdtempSync(join(tmpdir(), "merged-retirement-artifact-"));
  try {
    writeFileSync(
      join(directory, "result.json"),
      JSON.stringify({ status: "NOT_PROVEN" }),
    );
    sealEvidence(directory, "fixture-token");
    const manifest = JSON.parse(
      readFileSync(join(directory, "artifact-manifest.json")),
    );
    assert.equal(manifest.publicationAuthorized, false);
    assert.equal(manifest.classification, "VERIFICATION_INPUT_NOT_CERTIFICATE");
    assert.equal(manifest.members.length, 1);
    assert.throws(() => sealEvidence(directory, "fixture-token"));
    rmSync(join(directory, "artifact-manifest.json"));
    writeFileSync(join(directory, "result.json"), "fixture-token");
    assert.throws(() => sealEvidence(directory, "fixture-token"));
    writeFileSync(join(directory, "result.json"), "safe");
    symlinkSync(join(directory, "result.json"), join(directory, "redirect"));
    assert.throws(() => sealEvidence(directory, "fixture-token"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("terminal uniqueness precedes identity matching for each discriminator", () => {
  for (const expected of [
    { mode: "CERTIFIED", headSha: "a".repeat(40) },
    { action: "retire", baseSha: "a".repeat(40) },
  ]) {
    const key = expected.mode ? "headSha" : "baseSha";
    const other = { ...expected, [key]: "b".repeat(40) };
    const encode = (value) => JSON.stringify(value) + "\n";
    assert.deepEqual(terminalObject(encode(expected), expected), expected);
    for (const values of [
      [expected, other],
      [other, expected],
    ])
      assert.throws(() =>
        terminalObject(values.map(encode).join(""), expected),
      );
  }
  const workspace = { ready: true, headSha: "a".repeat(40) };
  const stale = { ...workspace, ready: false, headSha: "b".repeat(40) };
  assert.throws(() => terminalObject(JSON.stringify(workspace), workspace));
  assert.deepEqual(
    terminalObject(JSON.stringify(workspace), workspace, "workspace"),
    workspace,
  );
  for (const values of [
    [workspace, stale],
    [stale, workspace],
  ])
    assert.throws(() =>
      terminalObject(
        values.map((v) => JSON.stringify(v)).join("\n"),
        workspace,
        "workspace",
      ),
    );
});

const prefix = `/repos/${repository}`;
const encode = (value) => JSON.stringify(value, null, 2) + "\n";

test("GitHub reads enforce repository, GET, bounded timeout and redirect denial", async () => {
  const calls = [];
  const reader = createGithubReader(
    "fixture-read-token",
    async (url, options) => {
      calls.push({ url, options });
      return new Response('{"value":42}');
    },
  );
  assert.deepEqual(await reader.get(prefix), { value: 42 });
  const { url, options } = calls[0];
  assert.equal(url, "https://api.github.com" + prefix);
  assert.equal(options.method, "GET");
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.headers.Authorization, "Bearer fixture-read-token");
  for (const path of [
    "https://other.invalid",
    "/repos/other/repo",
    prefix + "-other",
    prefix + "/../../other/repo",
    prefix + "/%2e%2e/%2e%2e/other/repo",
    prefix + "/../../touristic-digital-platform-other/repo",
  ])
    await assert.rejects(() => reader.get(path), /RETIREMENT_API_TARGET/u);
  assert.equal(calls.length, 1);
  const missing = createGithubReader(
    "fixture",
    async () => new Response("", { status: 404 }),
  );
  assert.equal(await missing.get(prefix + "/missing", true), null);
  await assert.rejects(
    () => missing.get(prefix + "/missing"),
    /RETIREMENT_API_READ_FAILED/u,
  );
});

test("pagination rejects duplicates, malformed pages and unproven truncation", async () => {
  const sha = execFileSync("git", ["hash-object", "--stdin"], {
    input: "same file bytes",
    encoding: "utf8",
  }).trim();
  const files = [
    { filename: "first.txt", sha },
    { filename: "second.txt", sha },
  ];
  const distinct = createGithubReader(
    "fixture",
    async () => new Response(encode(files)),
  );
  assert.deepEqual(await distinct.list(prefix + "/pulls/12/files"), files);
  for (const [batches, expected] of [
    [[[{ id: 1 }, { id: 1 }]], /RETIREMENT_API_DUPLICATE/u],
    [
      [[{ filename: "same" }, { filename: "same" }]],
      /RETIREMENT_API_DUPLICATE/u,
    ],
    [
      [
        [
          { filename: "same", sha },
          { filename: "same", sha: "a".repeat(40) },
        ],
      ],
      /RETIREMENT_API_DUPLICATE/u,
    ],
    [[{ incomplete: true }], /RETIREMENT_API_PAGE_INVALID/u],
    [
      [Array.from({ length: 101 }, (_, id) => ({ id }))],
      /RETIREMENT_API_PAGE_INVALID/u,
    ],
  ]) {
    const reader = createGithubReader(
      "fixture",
      async () => new Response(encode(batches.shift())),
    );
    await assert.rejects(() => reader.list(prefix + "/pulls"), expected);
  }
  let count = 0;
  const endless = createGithubReader("fixture", async (url) => {
    count++;
    assert.equal(new URL(url).searchParams.get("page"), String(count));
    return new Response(
      encode(Array.from({ length: 100 }, (_, i) => ({ id: count * 100 + i }))),
    );
  });
  await assert.rejects(
    () => endless.list(prefix + "/pulls?state=open"),
    /RETIREMENT_API_PAGINATION_INCOMPLETE/u,
  );
  assert.equal(count, 20);
});

test("provider readback binds merged PR, source repository, main and material tree", () => {
  const repo = {
    id: 123,
    full_name: repository,
    private: false,
    default_branch: "main",
  };
  const pr = {
    number: 12,
    merged: true,
    state: "closed",
    base: { ref: "main", repo },
    head: { repo, ref: "infra/material", sha: request.material_head },
    merge_commit_sha: request.merge_sha,
  };
  const main = { object: { sha: request.expected_main } };
  const commit = { sha: request.material_head, tree: { sha: "d".repeat(40) } };
  const check = (values) =>
    validateRemote(request, { repositoryId: 123 }, ...values);
  assert.equal(check([repo, main, pr, commit]).materialTree, commit.tree.sha);
  for (const change of [
    { merged: false },
    { state: "open" },
    { number: 13 },
    { base: { ref: "release", repo } },
    { head: { ...pr.head, repo: { full_name: "other/fork" } } },
    { merge_commit_sha: "e".repeat(40) },
  ])
    assert.throws(() => check([repo, main, { ...pr, ...change }, commit]));
  assert.throws(() =>
    check([repo, { object: { sha: request.merge_sha } }, pr, commit]),
  );
  assert.throws(() =>
    check([repo, main, pr, { ...commit, tree: { sha: "main" } }]),
  );
});

test("credentials split across output streams fail and redact in either order", async () => {
  for (const [out, err] of [
    ["fixture-", "secret"],
    ["secret", "fixture-"],
  ]) {
    await assert.rejects(
      () =>
        execute(
          `process.stdout.write(${JSON.stringify(out)});process.stderr.write(${JSON.stringify(err)})`,
          { token: "fixture-secret", env: { PATH: process.env.PATH } },
        ),
      (error) => {
        assert.equal(error.execution.failureCode, "RETIREMENT_TOKEN_IN_OUTPUT");
        assert.equal(
          error.execution.stdout + error.execution.stderr,
          "[REDACTED]",
        );
        return true;
      },
    );
  }
});

test("trusted test subprocesses can read their isolated local Git fixtures", async () => {
  const directory = mkdtempSync(join(tmpdir(), "retirement-local-git-"));
  try {
    const local = join(directory, "fixture.git");
    const env = isolatedEnvironment(
      process.env,
      join(directory, "hooks"),
      directory,
    );
    execFileSync("git", ["init", "--bare", local], { env, stdio: "ignore" });
    const script = `require('node:child_process').execFileSync('git',['ls-remote',${JSON.stringify(local)}]);process.stdout.write('fixture-ready')`;
    const result = await execute(script, { env, cwd: directory });
    assert.equal(result.stdout, "fixture-ready");
    await assert.rejects(
      () =>
        runChecked("git", ["ls-remote", local], {
          env: executorGitEnvironment(env),
          cwd: directory,
        }),
      (error) => {
        assert.match(error.execution.stderr, /transport .file. not allowed/u);
        return true;
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("child isolation removes ambient authorization and disables implicit Git execution", () => {
  const env = isolatedEnvironment(
    {
      PATH: "/fixture/bin",
      HOME: "/fixture/home",
      GITHUB_TOKEN: "secret",
      GH_TOKEN: "other",
      NODE_OPTIONS: "--import malicious",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "evil",
      SSH_AUTH_SOCK: "/fixture/socket",
      BASH_ENV: "/fixture/evil",
    },
    "/fixture/hooks",
    "/fixture/tmp",
  );
  assert.equal(env.PATH, "/fixture/bin");
  assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null");
  assert.equal(env.GIT_NO_LAZY_FETCH, "1");
  assert.equal(env.GIT_CONFIG_KEY_0, "core.hooksPath");
  assert.equal(env.GIT_CONFIG_VALUE_0, "/fixture/hooks");
  assert.equal(env.GIT_CONFIG_COUNT, "2");
  assert.equal(
    executorGitEnvironment(env).GIT_CONFIG_KEY_2,
    "protocol.file.allow",
  );
  assert.equal(executorGitEnvironment(env).GIT_CONFIG_VALUE_2, "never");
  assert.equal(env.GIT_CONFIG_KEY_2, undefined);
  for (const key of [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "NODE_OPTIONS",
    "SSH_AUTH_SOCK",
    "BASH_ENV",
  ])
    assert.equal(env[key], undefined);
});

test("foundation direct invocation refuses to claim retirement execution", async () => {
  await assert.rejects(
    () =>
      runChecked(process.execPath, [
        new URL("./merged-retirement-executor.mjs", import.meta.url).pathname,
      ]),
    (error) => {
      assert.equal(error.execution.exitCode, 1);
      assert.equal(error.execution.stdout, "");
      assert.match(
        error.execution.stderr,
        /MERGED_RETIREMENT_PREPARATION_NOT_IMPLEMENTED/u,
      );
      return true;
    },
  );
});
