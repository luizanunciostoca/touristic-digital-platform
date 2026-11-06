import assert from "node:assert/strict";
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
