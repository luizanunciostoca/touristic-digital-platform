import assert from "node:assert/strict";
import crypto from "node:crypto";

const SHA = /^[0-9a-f]{40}$/u;
const dispatchId = (value) =>
  "dispatch-" +
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
const blocked = (code, id, extra = {}) => ({
  status: "BLOCKED",
  code,
  dispatchId: id,
  ...extra,
});
export function buildDispatchRequest({
  grant,
  workspace,
  executor,
  attempt = 1,
}) {
  const changeSetId = grant?.changeSetId ?? grant?.id;
  assert.ok(
    changeSetId &&
      workspace?.ready &&
      workspace?.path &&
      executor &&
      Number.isSafeInteger(attempt) &&
      attempt > 0,
    "DISPATCH_INPUT_INVALID",
  );
  assert.match(grant.exactBaseSha ?? "", SHA);
  assert.equal(
    workspace.exactBaseSha,
    grant.exactBaseSha,
    "DISPATCH_WORKSPACE_BASE_MISMATCH",
  );
  const identity = {
    changeSetId,
    exactBaseSha: grant.exactBaseSha,
    workspacePath: workspace.path,
    executor,
    attempt,
  };
  return {
    schemaVersion: 1,
    kind: "TDP_WORKER_DISPATCH",
    dispatchId: dispatchId(identity),
    ...identity,
    objective: grant.objective ?? null,
    runtime: workspace.runtime ?? null,
  };
}
export function verifyDispatchReadback(request, readback) {
  assert.ok(request?.dispatchId, "DISPATCH_REQUEST_REQUIRED");
  if (
    readback?.dispatchId !== request.dispatchId ||
    readback?.workerStarted !== true ||
    readback?.exactBaseSha !== request.exactBaseSha
  )
    return blocked("DISPATCH_NOT_READ_BACK", request.dispatchId, {
      readback: readback ?? null,
    });
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
export async function dispatchWithReadback({
  request,
  receipts = [],
  adapter,
}) {
  assert.ok(
    request?.dispatchId &&
      typeof adapter?.dispatch === "function" &&
      typeof adapter?.readback === "function",
    "DISPATCH_ADAPTER_INVALID",
  );
  if (
    receipts.some(
      (x) =>
        x.dispatchId === request.dispatchId &&
        ["STARTED", "PASS"].includes(x.status),
    )
  )
    return blocked("DUPLICATE_DISPATCH", request.dispatchId);
  if ((await adapter.dispatch(request))?.accepted !== true)
    return blocked("DISPATCH_REJECTED", request.dispatchId);
  return verifyDispatchReadback(
    request,
    await adapter.readback(request.dispatchId),
  );
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
  if (superseded) return "SUPERSEDED";
  if (!claim || !manifest) return "ORPHANED";
  if (mergeEvidence?.materialChange === true) return "POST_MERGE_CLOSURE";
  const expiry = Date.parse(claim.expiresAt ?? ""),
    current = Date.parse(now);
  if (
    !Number.isFinite(expiry) ||
    !Number.isFinite(current) ||
    expiry <= current
  )
    return "STALE";
  return workerStarted === true || openPr === true || branchPresent === true
    ? "ACTIVE_WORK"
    : "CLAIMED_AWAITING_DISPATCH";
}
export const activeClaimIdleFinding = ({ missionState, executorHealthy }) =>
  missionState === "CLAIMED_AWAITING_DISPATCH" && executorHealthy === true
    ? { code: "ACTIVE_CLAIM_IDLE_WITH_HEALTHY_EXECUTOR", severity: "high" }
    : null;
