import assert from "node:assert/strict";
import test from "node:test";
import {
  FASTFIX_CANARY_IDS,
  evaluateControlPlaneV32Freeze,
  evaluateFastfixCanaries,
} from "./fastfix-canary.mjs";

function evidence(overrides = {}) {
  return {
    acquisition: {
      remoteFormatFailureObserved: true,
      remoteRunId: 37345750073,
      remoteFailureStep: "Check affected formatting",
      lifecyclePrepareEnforced: true,
      localPreparePassed: true,
      rollbackOnPrepareFailureProven: true,
    },
    workspace: {
      nativeReady: false,
      nativeFailureSignature: "unexpected e_type: 2",
      fallbackReady: true,
      selectedRuntime: "debian-proot",
      fallbackUsed: true,
    },
    executor: {
      preferredExecutor: "codex",
      preferredFunctional: false,
      failureReason: "TIMEOUT",
      selectedExecutor: "chatgpt-control",
      fallbackUsed: true,
      reviewerImplementationAuthorized: false,
    },
    ...overrides,
  };
}

test("the three real FASTFIX canary contracts pass only with corrective controls", () => {
  const report = evaluateFastfixCanaries(evidence());
  assert.equal(report.status, "PASS");
  assert.equal(report.passed, 3);
  assert.deepEqual(
    report.results.map((item) => item.id),
    [...FASTFIX_CANARY_IDS],
  );
});

test("each FASTFIX canary fails closed when its preventive control is absent", () => {
  const cases = [
    [
      {
        acquisition: {
          remoteFormatFailureObserved: true,
          remoteRunId: 37345750073,
          remoteFailureStep: "Check affected formatting",
          lifecyclePrepareEnforced: false,
          localPreparePassed: false,
          rollbackOnPrepareFailureProven: false,
        },
      },
      "PRE_PUSH_ADMISSION_BYPASS",
    ],
    [
      {
        workspace: {
          nativeReady: false,
          nativeFailureSignature: "unexpected e_type: 2",
          fallbackReady: false,
          selectedRuntime: null,
          fallbackUsed: false,
        },
      },
      "WORKSPACE_BOOTSTRAP_INCOMPLETE",
    ],
    [
      {
        executor: {
          preferredExecutor: "codex",
          preferredFunctional: false,
          failureReason: "TIMEOUT",
          selectedExecutor: "copilot-reviewer",
          fallbackUsed: true,
          reviewerImplementationAuthorized: true,
        },
      },
      "EXECUTOR_FAILURE",
    ],
  ];
  for (const [override, failureClass] of cases) {
    const report = evaluateFastfixCanaries(evidence(override));
    assert.equal(report.status, "FAIL");
    assert.ok(
      report.results.some(
        (item) => item.status === "FAIL" && item.failureClass === failureClass,
      ),
      failureClass,
    );
  }
});

test("Control Plane V3.2 freeze requires canaries, zero threads and safe projection", () => {
  const canaryReport = evaluateFastfixCanaries(evidence());
  const baseline = {
    canaryReport,
    controlPlaneVersion: "3.2",
    parallelArchitectureDetected: false,
    unresolvedReviewThreads: 0,
    projectionSafe: true,
  };
  assert.equal(evaluateControlPlaneV32Freeze(baseline).status, "PASS");
  for (const override of [
    { controlPlaneVersion: "4" },
    { parallelArchitectureDetected: true },
    { unresolvedReviewThreads: 1 },
    { projectionSafe: false },
  ]) {
    assert.equal(
      evaluateControlPlaneV32Freeze({ ...baseline, ...override }).status,
      "FAIL",
    );
  }
});
