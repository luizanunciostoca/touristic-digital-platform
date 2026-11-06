import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/morro-merge-gate.yml", import.meta.url),
  "utf8",
);
function step(name) {
  const marker = "      - name: " + name + "\n";
  assert.equal(
    workflow.split(marker).length,
    2,
    "unique workflow step: " + name,
  );
  return workflow.split(marker)[1].split("\n      - name: ")[0];
}
const policy = step("Run trusted merge-gate policy");
const script = policy
  .split("        run: |\n")[1]
  .split("\n")
  .map((line) => line.replace(/^          /, ""))
  .join("\n");

test("closed bootstrap exceptions cannot bypass current trusted merge policy", () => {
  assert.doesNotMatch(
    policy,
    /PR737|NODE_PR737|retirementBootstrap|OWNER_APPROVED_ONE_TIME_BOOTSTRAP/,
  );
  assert.doesNotMatch(
    policy,
    /APPROVED_BOOTSTRAP_HEAD|issues\/(?:711|718|737)\/comments/,
  );
  assert.doesNotMatch(policy, /PR_NUMBER.*(?:714|719|737)/);
  assert.equal(
    (script.match(/node trusted\/tooling\/mdctl\/merge-gate\.mjs/g) ?? [])
      .length,
    1,
  );
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /jq -e '.decision == "POLICY_SATISFIED"'/);
});

test("immutable-root wait compatibility and independent trusted checkout stay intact", () => {
  const wait = step("Wait for exact-head Trusted Claim Guard");
  assert.match(wait, /TRUSTED_CLAIM_GUARD_WAIT_SKIPPED_IMMUTABLE_ROOT/);
  assert.match(wait, /grep -Fxq '.github\/workflows\/morro-claim-guard.yml'/);
  assert.match(wait, /verifyTrustedClaimEvidence/);
  assert.ok(
    step("Checkout trusted base").includes(
      "ref: ${{ github.event.pull_request.base.sha }}",
    ),
  );
  assert.ok(
    step("Checkout candidate as data").includes(
      "ref: ${{ github.event.pull_request.head.sha }}",
    ),
  );
  assert.match(
    step("Reject fork candidates"),
    /test "\$HEAD_REPOSITORY" = "\$BASE_REPOSITORY"/,
  );
  assert.doesNotMatch(
    script,
    /candidate\/tooling\/|import.*candidate|IMMUTABLE_ROOT/,
  );
});

const historical = [
  [
    "714",
    "de6c1637abc98e4e86e9c575ac0aaeb00a99551c",
    "fix/claim-lifecycle-bootstrap-20261004",
  ],
  [
    "719",
    "d006a94aecfb7a70f9829acdc14ff5a22a142201",
    "fix/scheduler-reanchor-bootstrap-20261004",
  ],
  [
    "737",
    "28b37f58abccffd9d4d212d95270f2b987e24f25",
    "fix/canonical-retirement-correctness-20261004",
  ],
  ["9000", "a".repeat(40), "fix/current-candidate"],
];
function runPolicy(
  [pr, base, branch],
  decision = "POLICY_SATISFIED",
  exit = "0",
) {
  const cwd = mkdtempSync(join(tmpdir(), "retired-bootstrap-"));
  try {
    mkdirSync(join(cwd, "trusted/tooling/mdctl"), { recursive: true });
    mkdirSync(join(cwd, "bin"));
    const blockedGh = join(cwd, "bin/gh");
    writeFileSync(blockedGh, "#!/bin/sh\nexit 97\n");
    chmodSync(blockedGh, 0o755);
    writeFileSync(
      join(cwd, "trusted/tooling/mdctl/merge-gate.mjs"),
      [
        'import { writeFileSync } from "node:fs";',
        'writeFileSync("trusted-invocation.json", JSON.stringify(process.argv.slice(2)));',
        "console.log(JSON.stringify({ decision: process.env.FIXTURE_DECISION }));",
        "process.exit(Number(process.env.FIXTURE_EXIT));",
      ].join("\n"),
    );
    const head = "b".repeat(40);
    const repository = "luizanunciostoca/touristic-digital-platform";
    const result = spawnSync("bash", ["-c", script], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: join(cwd, "bin") + ":" + process.env.PATH,
        PR_NUMBER: pr,
        BASE_SHA: base,
        HEAD_SHA: head,
        HEAD_BRANCH: branch,
        REPOSITORY: repository,
        HEAD_REPOSITORY: repository,
        BASE_REF: "main",
        FIXTURE_DECISION: decision,
        FIXTURE_EXIT: exit,
      },
    });
    assert.ifError(result.error);
    let invocation = null;
    try {
      invocation = JSON.parse(
        readFileSync(join(cwd, "trusted-invocation.json"), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return {
      ...result,
      invocation,
      expected: [
        "--trusted",
        "trusted",
        "--candidate",
        "candidate",
        "--repository",
        repository,
        "--pr-number",
        pr,
        "--head-sha",
        head,
        "--base-sha",
        base,
        "--branch",
        branch,
      ],
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

for (const candidate of historical) {
  test(
    "PR " + candidate[0] + " uses the same exact-head trusted policy",
    () => {
      const result = runPolicy(candidate);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.invocation, result.expected);
      assert.equal(JSON.parse(result.stdout).decision, "POLICY_SATISFIED");
    },
  );
  test(
    "PR " +
      candidate[0] +
      " cannot turn failed or unsatisfied policy into success",
    () => {
      for (const [decision, exit] of [
        ["BLOCKED", "0"],
        ["MERGE_READY", "0"],
        ["POLICY_SATISFIED", "17"],
        ["", "0"],
      ]) {
        const result = runPolicy(candidate, decision, exit);
        assert.notEqual(result.status, 0, decision + ":" + exit);
        assert.deepEqual(result.invocation, result.expected);
      }
    },
  );
}
