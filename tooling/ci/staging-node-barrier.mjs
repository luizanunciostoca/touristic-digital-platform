import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { integer, time } from "./staging-node-contracts.mjs";

const VERIFICATION_JOBS = Object.freeze({
  deploy: "staging / single authorized Node dispatch",
  verify: "staging / external provider and runtime verification",
});

export function verificationBarrierBinding({
  raw,
  artifact,
  job,
  attemptJobs,
  expected,
  now,
}) {
  const marker = JSON.parse(raw);
  assert.equal(marker.schemaVersion, 1, "NODE_BARRIER_SCHEMA");
  assert.equal(
    marker.kind,
    "STAGING_NODE_VERIFICATION_BARRIER",
    "NODE_BARRIER_KIND",
  );
  assert.equal(marker.sourceSha, expected.sourceSha, "NODE_BARRIER_SOURCE");
  assert.equal(marker.treeSha, expected.treeSha, "NODE_BARRIER_TREE");
  assert.equal(
    marker.authorizationId,
    expected.authorizationId,
    "NODE_BARRIER_AUTHORIZATION",
  );
  assert.equal(marker.requestId, expected.requestId, "NODE_BARRIER_REQUEST");
  assert.deepEqual(
    marker.verification,
    expected.verification,
    "NODE_BARRIER_VERIFICATION",
  );
  const v = marker.verification;
  for (const key of ["runId", "runAttempt", "callerRunId", "callerRunAttempt"])
    assert.ok(integer(v[key]), "NODE_BARRIER_RUN_IDENTITY");
  assert.ok(
    Object.hasOwn(VERIFICATION_JOBS, marker.jobKey),
    "NODE_BARRIER_JOB_KEY",
  );
  if (expected.jobKey)
    assert.equal(marker.jobKey, expected.jobKey, "NODE_BARRIER_CURRENT_JOB");
  assert.equal(
    marker.jobName,
    VERIFICATION_JOBS[marker.jobKey],
    "NODE_BARRIER_JOB_NAME",
  );
  assert.ok(integer(marker.jobId), "NODE_BARRIER_JOB_ID");
  assert.equal(job.id, marker.jobId, "NODE_BARRIER_JOB_ID");
  assert.equal(job.name, marker.jobName, "NODE_BARRIER_JOB_NAME");
  assert.equal(job.run_id, v.runId, "NODE_BARRIER_JOB_RUN");
  assert.ok(Array.isArray(attemptJobs), "NODE_BARRIER_ATTEMPT_JOBS_REQUIRED");
  const membership = attemptJobs.filter((j) => j.id === job.id);
  assert.equal(membership.length, 1, "NODE_BARRIER_ATTEMPT_MEMBERSHIP");
  for (const key of ["id", "run_id", "head_sha", "name", "started_at"])
    assert.equal(
      membership[0][key],
      job[key],
      "NODE_BARRIER_JOB_READBACK_DRIFT",
    );
  if (Object.hasOwn(job, "run_attempt"))
    assert.equal(job.run_attempt, v.runAttempt, "NODE_BARRIER_JOB_ATTEMPT");
  assert.equal(job.head_sha, marker.sourceSha, "NODE_BARRIER_JOB_HEAD");
  assert.equal(job.started_at, marker.jobStartedAt, "NODE_BARRIER_JOB_START");
  assert.ok(
    ["in_progress", "completed"].includes(job.status),
    "NODE_BARRIER_JOB_NOT_STARTED",
  );
  if (job.status === "completed")
    assert.equal(job.conclusion, "success", "NODE_BARRIER_JOB_FAILED");
  const recorded = time(marker.recordedAt);
  assert.ok(
    recorded >= time(job.started_at) && recorded <= time(now),
    "NODE_BARRIER_TIME_ORDER",
  );
  assert.ok(integer(artifact.id), "NODE_BARRIER_ARTIFACT_ID");
  assert.equal(
    artifact.name,
    `staging-node-verification-barrier-${v.runId}-${v.runAttempt}`,
    "NODE_BARRIER_ARTIFACT_NAME",
  );
  assert.equal(artifact.expired, false, "NODE_BARRIER_ARTIFACT_EXPIRED");
  assert.equal(artifact.workflow_run?.id, v.runId, "NODE_BARRIER_ARTIFACT_RUN");
  assert.equal(
    artifact.workflow_run?.head_sha,
    marker.sourceSha,
    "NODE_BARRIER_ARTIFACT_HEAD",
  );
  // GitHub artifact timestamps have second precision; marker clock has milliseconds.
  assert.ok(
    time(artifact.created_at) + 999 >= recorded,
    "NODE_BARRIER_ARTIFACT_PREDATES_MARKER",
  );
  return Object.freeze({
    artifactId: artifact.id,
    sha256: createHash("sha256").update(raw).digest("hex"),
    jobId: marker.jobId,
    recordedAt: marker.recordedAt,
  });
}
