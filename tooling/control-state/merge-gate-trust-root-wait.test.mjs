import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { execFileSync } from "node:child_process";
const workflow = readFileSync(".github/workflows/morro-merge-gate.yml", "utf8");

test("immutable trust-root candidate exits wait before polling", () => {
  const wait = workflow.match(
    /- name: Wait for exact-head Trusted Claim Guard[\s\S]*?- name: Run trusted merge-gate policy/,
  )?.[0];
  assert.ok(wait);
  assert.match(
    wait,
    /if: github\.event_name == 'pull_request' && steps\.retirement\.outputs\.eligible != 'true'/,
  );
  assert.match(
    wait,
    /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.match(
    wait,
    /git -C candidate diff --name-only "\$BASE_SHA\.\.\.\$HEAD_SHA"/,
  );
  const rootCheck = wait.indexOf("morro-claim-guard.yml");
  const earlyExit = wait.indexOf(
    "TRUSTED_CLAIM_GUARD_WAIT_SKIPPED_IMMUTABLE_ROOT",
  );
  const poll = wait.indexOf("for (let attempt = 1; attempt <= 60; attempt++)");
  assert.ok(rootCheck >= 0 && rootCheck < earlyExit && earlyExit < poll);
});

test("ordinary scope is classified from base and only exempts claim wait", () => {
  assert.match(
    workflow,
    /node trusted\/tooling\/mdctl\/native-pr-gate\.mjs --classify trusted candidate/,
  );
  const wait = workflow.match(
    /- name: Wait for exact-head Trusted Claim Guard[\s\S]*?- name: Run trusted merge-gate policy/,
  )?.[0];
  assert.match(wait, /steps\.native-scope\.outputs\.ordinary != 'true'/);
  assert.doesNotMatch(
    workflow,
    /node candidate\/tooling\/mdctl\/native-pr-gate/,
  );
});

test("sensitive wait consumes base verifier and never accepts absence by name", () => {
  const wait = workflow.match(
    /- name: Wait for exact-head Trusted Claim Guard[\s\S]*?- name: Run trusted merge-gate policy/,
  )?.[0];
  assert.match(
    wait,
    /import \{ verifyTrustedClaimEvidence \} from '\.\/trusted\/tooling\/mdctl\/scheduler-live\.mjs'/,
  );
  assert.match(
    wait,
    /const evidence = await verifyTrustedClaimEvidence\(args\)/,
  );
  assert.match(wait, /if \(evidence\.trusted === true\) process\.exit\(0\)/);
  assert.match(wait, /headSha: process\.env\.HEAD_SHA/);
  assert.match(wait, /mainSha: process\.env\.BASE_SHA/);
  assert.match(wait, /prNumber: Number\(process\.env\.PR_NUMBER\)/);
  assert.match(wait, /throw new Error\('TRUSTED_PRODUCER_REJECTED:'/);
  assert.match(wait, /throw new Error\('TRUSTED_PRODUCER_TIMEOUT:'/);
  assert.doesNotMatch(wait, /\.name == "Trusted Claim Guard Bootstrap"/);
});

test("fail-fast exit cannot bypass the trusted merge-gate policy", () => {
  const block = workflow.match(
    /- name: Run trusted merge-gate policy[\s\S]*?- name: Upload PR merge-gate decision/,
  )?.[0];
  assert.ok(block);
  assert.match(block, /if: github\.event_name == 'pull_request'/);
  assert.doesNotMatch(block, /continue-on-error:\s*true/);
  assert.match(block, /node trusted\/tooling\/mdctl\/merge-gate\.mjs/);
  assert.match(block, /jq -e '\.decision == "POLICY_SATISFIED"'/);
});

// Preserve wait semantics across orchestration language changes.
const block = workflow.match(
  /      - name: Wait for exact-head Trusted Claim Guard\n([\s\S]*?)      - name: Run trusted merge-gate policy/,
)[1];
const program = block
  .match(/node --input-type=module <<'NODE'\n([\s\S]*?)          NODE/)[1]
  .replace(/^          /gm, "");
assert.match(
  program,
  /^import \{ verifyTrustedClaimEvidence \} from '\.\/trusted\/tooling\/mdctl\/scheduler-live.mjs';/,
);
// Exercise exact workflow orchestration; only its imported transport verifier is injected.
// Production verifier itself is separately covered by the real-module identity regressions.
const executable = program.replace(/^import .*?;\n/, "");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction(
  "verifyTrustedClaimEvidence",
  "process",
  "setTimeout",
  executable,
);
const env = {
  REPOSITORY: "o/r",
  BASE_SHA: "a".repeat(40),
  HEAD_SHA: "b".repeat(40),
  HEAD_BRANCH: "feature",
  PR_NUMBER: "7",
};
async function simulate(sequence) {
  let calls = 0,
    sleeps = 0;
  const args = [];
  const exit = {};
  let error, code;
  try {
    await run(
      async (input) => {
        args.push(input);
        const r = sequence[Math.min(calls++, sequence.length - 1)];
        if (r instanceof Error) throw r;
        return r;
      },
      {
        env,
        exit: (n) => {
          code = n;
          throw exit;
        },
      },
      (resolve, ms) => {
        assert.equal(ms, 10000);
        sleeps++;
        resolve();
      },
    );
  } catch (e) {
    if (e !== exit) error = e;
  }
  return { calls, sleeps, args, code, error };
}
const pending = {
  trusted: false,
  reason: "TRUSTED_CLAIM_GUARD_RUN_NOT_COMPLETED",
};
const missing = { trusted: false, reason: "TRUSTED_CLAIM_GUARD_RUN_MISSING" };
test("exact-base/head/repo/branch/PR passed to trusted resolver", async () => {
  const r = await simulate([{ trusted: true }]);
  assert.equal(r.code, 0);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.args, [
    {
      repository: "o/r",
      mainSha: env.BASE_SHA,
      headSha: env.HEAD_SHA,
      branch: "feature",
      prNumber: 7,
    },
  ]);
});
test("pending then proved permits only proved result", async () => {
  const r = await simulate([pending, pending, { trusted: true }]);
  assert.equal(r.code, 0);
  assert.equal(r.calls, 3);
  assert.equal(r.sleeps, 2);
});
test("60 pending results fail closed with bounded timeout", async () => {
  const r = await simulate([pending]);
  assert.equal(r.code, undefined);
  assert.equal(r.calls, 60);
  assert.equal(r.sleeps, 60);
  assert.match(r.error.message, /^TRUSTED_PRODUCER_TIMEOUT:b{40}$/);
});
test("producer absence rejected on third observation, never green", async () => {
  const r = await simulate([missing]);
  assert.equal(r.code, undefined);
  assert.equal(r.calls, 3);
  assert.equal(r.sleeps, 2);
  assert.match(
    r.error.message,
    /^TRUSTED_PRODUCER_REJECTED:TRUSTED_CLAIM_GUARD_RUN_MISSING$/,
  );
});
for (const reason of [
  "TRUSTED_CLAIM_GUARD_RUN_NOT_SUCCESS",
  "TRUSTED_CLAIM_GUARD_JOB_INVALID:job",
  "TRUSTED_GITHUB_ACTIONS_CHECK_MISSING:job",
  "TRUSTED_IMMUTABLE_FILE_DIVERGED:policy",
  "UNEXPECTED",
])
  test("terminal rejection stays rejection: " + reason, async () => {
    const r = await simulate([{ trusted: false, reason }]);
    assert.equal(r.code, undefined);
    assert.equal(r.calls, 1);
    assert.equal(r.sleeps, 0);
    assert.equal(r.error.message, "TRUSTED_PRODUCER_REJECTED:" + reason);
  });
test("resolver exception propagates, no conversion to success", async () => {
  const e = new Error("network unavailable");
  const r = await simulate([e]);
  assert.equal(r.error, e);
  assert.equal(r.code, undefined);
});
test("truthy nonboolean trust is not accepted", async () => {
  const r = await simulate([{ trusted: "true", reason: "MALFORMED" }]);
  assert.equal(r.code, undefined);
  assert.match(r.error.message, /REJECTED:MALFORMED/);
});
const condition = block
  .match(/        if: (.*)/)[1]
  .replaceAll("github.event_name", "event")
  .replaceAll("steps.retirement.outputs.eligible", "retirement")
  .replaceAll("steps.native-scope.outputs.ordinary", "ordinary");
const shouldWait = new Function(
  "event",
  "retirement",
  "ordinary",
  "return " + condition,
);
for (const [label, event, retirement, ordinary, expected] of [
  ["sensitive PR", "pull_request", "false", "false", true],
  ["unknown ordinary output", "pull_request", "false", "", true],
  ["ordinary PR", "pull_request", "false", "true", false],
  ["retirement PR", "pull_request", "true", "false", false],
  ["merge group", "merge_group", "false", "false", false],
])
  test("wait routing: " + label, () =>
    assert.equal(shouldWait(event, retirement, ordinary), expected),
  );
test("immutable root skips ONLY wait before executing node; other paths reach node", () => {
  const prefix = block
    .match(/          changed=([\s\S]*?)          node --input-type/)[0]
    .replace(/          node --input-type$/, "")
    .replace(/^          /gm, "");
  const shell =
    'set -euo pipefail\ngit(){ printf "%s\\n" "$TEST_CHANGED"; }\n' +
    prefix +
    '\nprintf "POLL_REACHED\\n"\n';
  for (const [path, skip] of [
    [".github/workflows/morro-claim-guard.yml", true],
    ["packages/crm/src/authorization.ts", false],
  ]) {
    const out = execFileSync("bash", ["-c", shell], {
      env: {
        PATH: process.env.PATH,
        BASE_SHA: env.BASE_SHA,
        HEAD_SHA: env.HEAD_SHA,
        TEST_CHANGED: path,
      },
      encoding: "utf8",
    });
    assert.equal(out.includes("POLL_REACHED"), !skip);
    assert.equal(out.includes("WAIT_SKIPPED_IMMUTABLE_ROOT"), skip);
  }
});
test("skipped wait never exempts final policy step or changes required context", () => {
  const final = workflow.match(
    /- name: Run trusted merge-gate policy[\s\S]*?- name: Upload PR merge-gate decision/,
  )[0];
  assert.match(final, /if: github.event_name == 'pull_request'\n/);
  assert.doesNotMatch(
    final,
    /continue-on-error:|native-scope.outputs.ordinary|retirement.outputs.eligible/,
  );
  assert.match(final, /node trusted\/tooling\/mdctl\/merge-gate.mjs/);
  assert.match(final, /jq -e '\.decision == "POLICY_SATISFIED"'/);
  assert.equal(
    [...workflow.matchAll(/^    name: morro\/merge-gate$/gm)].length,
    1,
  );
  assert.match(workflow, /^  pull_request:$/m);
  assert.match(workflow, /^  merge_group:$/m);
});
