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
