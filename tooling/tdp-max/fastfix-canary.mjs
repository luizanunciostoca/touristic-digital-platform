#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FASTFIX_CANARY_IDS = Object.freeze([
  "acquisition-admission-format",
  "workspace-runtime-fallback",
  "executor-functional-fallback",
]);

function result(id, condition, evidence, failureClass) {
  return {
    id,
    status: condition ? "PASS" : "FAIL",
    failureClass: condition ? null : failureClass,
    evidence,
  };
}

export function evaluateFastfixCanaries(evidence) {
  assert.ok(
    evidence && typeof evidence === "object" && !Array.isArray(evidence),
    "FASTFIX_CANARY_EVIDENCE_REQUIRED",
  );
  const acquisition = evidence.acquisition ?? {};
  const workspace = evidence.workspace ?? {};
  const executor = evidence.executor ?? {};

  const results = [
    result(
      "acquisition-admission-format",
      acquisition.remoteFormatFailureObserved === true &&
        Number.isInteger(acquisition.remoteRunId) &&
        acquisition.remoteRunId > 0 &&
        acquisition.remoteFailureStep === "Check affected formatting" &&
        acquisition.lifecyclePrepareEnforced === true &&
        acquisition.localPreparePassed === true &&
        acquisition.rollbackOnPrepareFailureProven === true,
      acquisition,
      "PRE_PUSH_ADMISSION_BYPASS",
    ),
    result(
      "workspace-runtime-fallback",
      workspace.nativeReady === false &&
        /unexpected e_type: 2/u.test(
          String(workspace.nativeFailureSignature ?? ""),
        ) &&
        workspace.fallbackReady === true &&
        workspace.selectedRuntime === "debian-proot" &&
        workspace.fallbackUsed === true,
      workspace,
      "WORKSPACE_BOOTSTRAP_INCOMPLETE",
    ),
    result(
      "executor-functional-fallback",
      executor.preferredExecutor === "codex" &&
        executor.preferredFunctional === false &&
        ["TIMEOUT", "USAGE_LIMIT"].includes(executor.failureReason) &&
        executor.selectedExecutor === "chatgpt-control" &&
        executor.fallbackUsed === true &&
        executor.reviewerImplementationAuthorized === false,
      executor,
      "EXECUTOR_FAILURE",
    ),
  ];
  const passed = results.filter((item) => item.status === "PASS").length;
  return {
    schemaVersion: 1,
    kind: "TDP_FASTFIX_CANARY_REPORT",
    total: FASTFIX_CANARY_IDS.length,
    passed,
    failed: results.length - passed,
    status: passed === FASTFIX_CANARY_IDS.length ? "PASS" : "FAIL",
    results,
  };
}

export function evaluateControlPlaneV32Freeze({
  canaryReport,
  controlPlaneVersion,
  parallelArchitectureDetected,
  unresolvedReviewThreads,
  projectionSafe,
}) {
  assert.equal(
    Number.isInteger(unresolvedReviewThreads) && unresolvedReviewThreads >= 0,
    true,
    "FASTFIX_FREEZE_REVIEW_COUNT_INVALID",
  );
  const checks = {
    canaries: canaryReport?.status === "PASS" && canaryReport?.passed === 3,
    version: controlPlaneVersion === "3.2",
    noParallelArchitecture: parallelArchitectureDetected === false,
    reviewReconciled: unresolvedReviewThreads === 0,
    projectionReconciled: projectionSafe === true,
  };
  return {
    schemaVersion: 1,
    kind: "TDP_CONTROL_PLANE_V3_2_FREEZE",
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    checks,
  };
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const path = process.argv[2];
  assert.ok(path, "FASTFIX_CANARY_EVIDENCE_PATH_REQUIRED");
  const input = JSON.parse(readFileSync(resolve(path), "utf8"));
  const canaryReport = evaluateFastfixCanaries(input);
  const freeze = evaluateControlPlaneV32Freeze({
    canaryReport,
    controlPlaneVersion: input.controlPlaneVersion,
    parallelArchitectureDetected: input.parallelArchitectureDetected,
    unresolvedReviewThreads: input.unresolvedReviewThreads,
    projectionSafe: input.projectionSafe,
  });
  process.stdout.write(
    JSON.stringify({ canaryReport, freeze }, null, 2) + "\n",
  );
  if (canaryReport.status !== "PASS" || freeze.status !== "PASS")
    process.exitCode = 2;
}
