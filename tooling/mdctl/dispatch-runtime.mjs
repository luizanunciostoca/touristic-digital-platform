import assert from "node:assert/strict";
import crypto from "node:crypto";

const SHA = /^[0-9a-f]{40}$/u;

function dispatchDigest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

export function buildDispatchRequest({
  grant,
  workspace,
  executor,
  attempt = 1,
}) {
  assert.ok(grant?.id, "DISPATCH_GRANT_ID_REQUIRED");
  assert.match(grant?.exactBaseSha ?? "", SHA, "DISPATCH_BASE_INVALID");
  assert.equal(workspace?.ready, true, "DISPATCH_WORKSPACE_NOT_READY");
  assert.equal(
    workspace?.exactBaseSha,
    grant.exactBaseSha,
    "DISPATCH_WORKSPACE_BASE_MISMATCH",
  );
  assert.equal(
    typeof workspace?.path,
    "string",
    "DISPATCH_WORKSPACE_PATH_REQUIRED",
  );
  assert.equal(typeof executor, "string", "DISPATCH_EXECUTOR_REQUIRED");
  assert.ok(
    Number.isSafeInteger(attempt) && attempt >= 1,
    "DISPATCH_ATTEMPT_INVALID",
  );
  const identity = {
    changeSetId: grant.id,
    exactBaseSha: grant.exactBaseSha,
    workspacePath: workspace.path,
    executor,
    attempt,
  };
  return {
    schemaVersion: 1,
    kind: "TDP_WORKER_DISPATCH",
    dispatchId: "dispatch-" + dispatchDigest(identity),
    ...identity,
    objective: grant.objective ?? null,
    runtime: workspace.runtime ?? null,
  };
}

export async function dispatchWithReadback({
  request,
  receipts = [],
  adapter,
}) {
  assert.ok(request?.dispatchId, "DISPATCH_REQUEST_REQUIRED");
  assert.ok(
    adapter && typeof adapter.dispatch === "function",
    "DISPATCH_ADAPTER_REQUIRED",
  );
  assert.ok(
    typeof adapter.readback === "function",
    "DISPATCH_READBACK_REQUIRED",
  );
  if (
    receipts.some(
      (receipt) =>
        receipt.dispatchId === request.dispatchId &&
        ["STARTED", "PASS"].includes(receipt.status),
    )
  ) {
    return {
      status: "BLOCKED",
      code: "DUPLICATE_DISPATCH",
      dispatchId: request.dispatchId,
    };
  }
  const accepted = await adapter.dispatch(request);
  if (accepted?.accepted !== true) {
    return {
      status: "BLOCKED",
      code: "DISPATCH_REJECTED",
      dispatchId: request.dispatchId,
    };
  }
  const readback = await adapter.readback(request.dispatchId);
  if (
    readback?.dispatchId !== request.dispatchId ||
    readback?.workerStarted !== true ||
    readback?.exactBaseSha !== request.exactBaseSha
  ) {
    return {
      status: "BLOCKED",
      code: "DISPATCH_NOT_READ_BACK",
      dispatchId: request.dispatchId,
      readback: readback ?? null,
    };
  }
  return {
    status: "PASS",
    code: null,
    dispatchId: request.dispatchId,
    receipt: {
      dispatchId: request.dispatchId,
      status: "STARTED",
      workerId: readback.workerId ?? null,
      exactBaseSha: request.exactBaseSha,
    },
  };
}

export function classifyClaimMissionState({
  claim,
  manifest,
  openPr = false,
  branchPresent = null,
  mergeEvidence = null,
  workerStarted = null,
  superseded = false,
  now = new Date().toISOString(),
}) {
  if (superseded === true) return "SUPERSEDED";
  if (!claim || !manifest) return "ORPHANED";
  const expiry = Date.parse(claim.expiresAt ?? "");
  const current = Date.parse(now);
  if (
    !Number.isFinite(expiry) ||
    !Number.isFinite(current) ||
    expiry <= current
  )
    return "STALE";
  if (mergeEvidence?.materialChange === true) return "POST_MERGE_CLOSURE";
  if (workerStarted === true || openPr === true || branchPresent === true)
    return "ACTIVE_WORK";
  return "CLAIMED_AWAITING_DISPATCH";
}

export function activeClaimIdleFinding({ missionState, executorHealthy }) {
  return missionState === "CLAIMED_AWAITING_DISPATCH" &&
    executorHealthy === true
    ? { code: "ACTIVE_CLAIM_IDLE_WITH_HEALTHY_EXECUTOR", severity: "high" }
    : null;
}
