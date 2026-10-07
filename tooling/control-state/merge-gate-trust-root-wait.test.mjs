import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
  const poll = wait.indexOf("for attempt in $(seq 1 60)");
  assert.ok(rootCheck >= 0 && rootCheck < earlyExit && earlyExit < poll);
});

test("ordinary candidates preserve exact-head Trusted Claim Guard polling", () => {
  assert.match(workflow, /TRUSTED_CLAIM_GUARD_TIMEOUT:\$HEAD_SHA/);
  assert.match(workflow, /\.name == "Trusted Claim Guard Bootstrap"/);
  assert.match(workflow, /\.head_sha == env\.HEAD_SHA/);
  assert.match(workflow, /test "\$conclusion" = "success"/);
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
