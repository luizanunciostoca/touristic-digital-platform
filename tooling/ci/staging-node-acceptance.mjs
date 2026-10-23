import assert from "node:assert/strict";
import {
  SHA,
  NODE_MODE,
  integer,
  time,
  noOciIdentity,
  requireOciAcceptance,
} from "./staging-node-contracts.mjs";
import { verifyConnectorReceipt } from "./staging-node-receipts.mjs";
import { verificationBarrierBinding } from "./staging-node-barrier.mjs";

export async function verifyOciAcceptanceRun({
  runId,
  sourceSha,
  consumer,
  readRun,
  listArtifacts,
  readEvidence,
}) {
  assert.ok(integer(runId), "OCI_ACCEPTANCE_RUN_REQUIRED");
  assert.match(sourceSha ?? "", SHA, "OCI_ACCEPTANCE_SHA_REQUIRED");
  const run = await readRun(runId);
  assert.equal(run.id, runId, "OCI_ACCEPTANCE_RUN_MISMATCH");
  assert.equal(run.head_sha, sourceSha, "OCI_ACCEPTANCE_HEAD_MISMATCH");
  assert.equal(
    run.path,
    ".github/workflows/final-release-acceptance.yml",
    "OCI_ACCEPTANCE_WORKFLOW",
  );
  assert.ok(
    ["workflow_dispatch", "issue_comment"].includes(run.event),
    "OCI_ACCEPTANCE_EVENT",
  );
  assert.equal(run.status, "completed", "OCI_ACCEPTANCE_NOT_COMPLETE");
  assert.equal(run.conclusion, "success", "OCI_ACCEPTANCE_NOT_SUCCESS");
  assert.ok(integer(run.run_attempt), "OCI_ACCEPTANCE_ATTEMPT");
  const artifacts = await listArtifacts(runId);
  assert.equal(artifacts.complete, true, "OCI_ARTIFACT_LIST_INCOMPLETE");
  const name =
    "final-release-acceptance-evidence-" + runId + "-" + run.run_attempt;
  const matches = artifacts.items.filter((a) => a.name === name);
  assert.equal(matches.length, 1, "OCI_ACCEPTANCE_ARTIFACT_AMBIGUOUS");
  assert.equal(matches[0].expired, false, "OCI_ACCEPTANCE_ARTIFACT_EXPIRED");
  const evidence = await readEvidence(runId, matches[0]);
  assert.equal(evidence.expectedSha, sourceSha, "OCI_ACCEPTANCE_EVIDENCE_SHA");
  assert.equal(
    evidence.acceptanceRunId,
    String(runId),
    "OCI_ACCEPTANCE_EVIDENCE_RUN",
  );
  assert.equal(
    evidence.acceptanceRunAttempt,
    String(run.run_attempt),
    "OCI_ACCEPTANCE_EVIDENCE_ATTEMPT",
  );
  requireOciAcceptance(evidence, consumer);
  const last = await readRun(runId);
  for (const field of [
    "id",
    "head_sha",
    "run_attempt",
    "status",
    "conclusion",
    "path",
  ])
    assert.equal(last[field], run[field], "OCI_ACCEPTANCE_REREAD_DRIFT");
  return Object.freeze({
    mode: "oci-immutable",
    sourceSha,
    runId,
    runAttempt: run.run_attempt,
    consumer,
  });
}
export async function verifyNodeAcceptanceRun({
  runId,
  sourceSha,
  treeSha,
  callerRunId,
  callerRunAttempt,
  readRun,
  listArtifacts,
  readEvidence,
  readBarrier,
  readJob,
  listJobs,
  fetchComment,
  listComments,
  actor,
  now,
  clock = () => now,
}) {
  assert.ok(integer(runId), "NODE_ACCEPTANCE_RUN_ID");
  const run = await readRun(runId);
  assert.equal(run.id, runId, "NODE_ACCEPTANCE_RUN_ID");
  assert.equal(
    run.path,
    ".github/workflows/staging-render-promotion.yml",
    "NODE_ACCEPTANCE_PATH",
  );
  assert.equal(run.event, "workflow_dispatch", "NODE_ACCEPTANCE_EVENT");
  assert.equal(run.head_sha, sourceSha, "NODE_ACCEPTANCE_SHA");
  assert.equal(run.status, "completed", "NODE_ACCEPTANCE_PENDING");
  assert.equal(run.conclusion, "success", "NODE_ACCEPTANCE_FAILED");
  const name = `staging-node-verified-${runId}-${run.run_attempt}`;
  const artifacts = await listArtifacts(runId);
  assert.equal(artifacts.complete, true, "NODE_ACCEPTANCE_ARTIFACT_LIST");
  const matches = artifacts.items.filter((a) => a.name === name);
  assert.equal(matches.length, 1, "NODE_ACCEPTANCE_ARTIFACT_AMBIGUOUS");
  assert.equal(matches[0].expired, false, "NODE_ACCEPTANCE_ARTIFACT_EXPIRED");
  const e = await readEvidence(runId, matches[0]);
  assert.equal(e.mode, NODE_MODE, "NODE_ACCEPTANCE_MODE");
  assert.equal(e.sourceSha, sourceSha, "NODE_ACCEPTANCE_SOURCE");
  assert.equal(e.treeSha, treeSha, "NODE_ACCEPTANCE_TREE");
  assert.equal(e.productionEligible, false, "NODE_ACCEPTANCE_PRODUCTION");
  assert.equal(e.pagesEligible, false, "NODE_ACCEPTANCE_PAGES");
  noOciIdentity(e);
  const verification = {
    runId,
    runAttempt: run.run_attempt,
    callerRunId,
    callerRunAttempt,
  };
  assert.deepEqual(
    e.verification,
    verification,
    "NODE_ACCEPTANCE_CURRENT_CALLER",
  );
  assert.equal(e.verificationRunId, runId, "NODE_ACCEPTANCE_VERIFIER");
  assert.equal(
    e.verificationRunAttempt,
    run.run_attempt,
    "NODE_ACCEPTANCE_VERIFIER_ATTEMPT",
  );
  assert.deepEqual(
    e.evidenceStates,
    ["CI_VERIFIED", "CONNECTOR_OBSERVED", "RUNTIME_OBSERVED"],
    "NODE_ACCEPTANCE_STATES",
  );
  const barrierName = `staging-node-verification-barrier-${runId}-${run.run_attempt}`;
  const barrierArtifacts = artifacts.items.filter(
    (a) => a.name === barrierName,
  );
  assert.equal(barrierArtifacts.length, 1, "NODE_BARRIER_ARTIFACT_AMBIGUOUS");
  const barrierRaw = await readBarrier(runId, barrierArtifacts[0]);
  const verificationBarrier = verificationBarrierBinding({
    raw: barrierRaw,
    artifact: barrierArtifacts[0],
    job: await readJob(JSON.parse(barrierRaw).jobId),
    attemptJobs: await listJobs(runId, run.run_attempt),
    expected: {
      sourceSha,
      treeSha,
      authorizationId: e.authorizationId,
      requestId: e.workflow.requestId,
      verification,
    },
    now: clock(),
  });
  assert.deepEqual(
    e.verificationBarrier,
    verificationBarrier,
    "NODE_ACCEPTANCE_BARRIER_DRIFT",
  );
  const expected = {
    verificationBarrier,
    phase: "post-deploy",
    authorizationId: e.authorizationId,
    requestId: e.workflow.requestId,
    sourceSha,
    treeSha,
    runId: e.workflow.runId,
    runAttempt: e.workflow.runAttempt,
    callerRunId: e.workflow.callerRunId,
    callerRunAttempt: e.workflow.callerRunAttempt,
    verification,
  };
  const post = await verifyConnectorReceipt(
    { commentId: e.postReceiptId, sha256: e.postReceiptSha256 },
    { fetchComment, listComments, actor, expected, now: clock() },
  );
  for (const [key, value] of Object.entries(post.payload.observation))
    assert.deepEqual(e[key], value, "NODE_ACCEPTANCE_OBSERVATION_DRIFT");
  for (const key of ["preReceiptId", "preReceiptSha256", "dispatchArtifactId"])
    assert.equal(e[key], post.payload[key], "NODE_ACCEPTANCE_RECEIPT_BINDING");
  assert.ok(
    time(now) - time(e.origin.observedAt) <= 300000 &&
      time(e.origin.observedAt) <= time(now),
    "NODE_ACCEPTANCE_STALE_PROVIDER",
  );
  assert.ok(
    time(now) - time(e.runtime.observedAt) <= 300000 &&
      time(e.runtime.observedAt) <= time(now),
    "NODE_ACCEPTANCE_STALE_RUNTIME",
  );
  const last = await readRun(runId);
  for (const key of [
    "id",
    "path",
    "event",
    "head_sha",
    "status",
    "conclusion",
    "run_attempt",
  ])
    assert.equal(last[key], run[key], "NODE_ACCEPTANCE_RUN_DRIFT");
  assert.ok(
    time(clock()) - time(post.payload.observedAt) <= 300000,
    "NODE_ACCEPTANCE_EXPIRED_DURING_READBACK",
  );
  for (const observed of [e.origin.observedAt, e.runtime.observedAt])
    assert.ok(
      time(clock()) - time(observed) <= 300000 &&
        time(observed) <= time(clock()),
      "NODE_ACCEPTANCE_OBSERVATION_EXPIRED_DURING_READBACK",
    );
  return {
    ...e,
    expectedSha: sourceSha,
    liveSha: e.runtime.releaseSha,
    acceptanceRunId: String(callerRunId),
    acceptanceRunAttempt: String(callerRunAttempt),
  };
}
