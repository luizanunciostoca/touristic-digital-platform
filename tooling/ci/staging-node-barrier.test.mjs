import test from "node:test";
import assert from "node:assert/strict";
import { verificationBarrierBinding } from "./staging-node-barrier.mjs";
import { validateExternalNodeObservation } from "./staging-node-contracts.mjs";
import { fixture, barrierFixture, now } from "./staging-node-test-fixtures.mjs";

test("post-lock continuation accepts fresh queries while retaining historical deployment timestamps", () => {
  const f = fixture();
  const b = barrierFixture();
  f.expected.verificationBarrier = b.binding;
  assert.ok(
    Date.parse(f.evidence.provider.createdAt) <
      Date.parse(b.binding.recordedAt),
  );
  assert.ok(
    Date.parse(f.evidence.provider.liveAt) < Date.parse(b.binding.recordedAt),
  );
  assert.equal(
    validateExternalNodeObservation(f.evidence, f.expected, { now })
      .contractValid,
    true,
  );
});
for (const [name, mutate] of [
  [
    "workflow-start timestamp masquerading as post-lock marker",
    (f) => {
      f.marker.recordedAt = "2026-10-23T04:18:00Z";
    },
  ],
  [
    "other job",
    (f) => {
      f.job.id = 889;
    },
  ],
  [
    "queued job",
    (f) => {
      f.job.status = "queued";
    },
  ],
  [
    "wrong attempt",
    (f) => {
      f.job.run_attempt = 2;
    },
  ],
  [
    "wrong artifact run",
    (f) => {
      f.artifact.workflow_run.id = 99;
    },
  ],
  [
    "wrong source",
    (f) => {
      f.job.head_sha = "f".repeat(40);
    },
  ],
])
  test("authenticated barrier rejects " + name, () => {
    const f = barrierFixture();
    mutate(f);
    f.raw = JSON.stringify(f.marker);
    assert.throws(() => verificationBarrierBinding({ ...f, now }));
  });
test("job attempt is authenticated through attempt-scoped membership when GET job omits run_attempt", () => {
  const f = barrierFixture();
  delete f.job.run_attempt;
  assert.equal(verificationBarrierBinding({ ...f, now }).jobId, 888);
});
test("job from another attempt cannot satisfy the marker", () => {
  const f = barrierFixture();
  f.attemptJobs = [];
  assert.throws(
    () => verificationBarrierBinding({ ...f, now }),
    /NODE_BARRIER_ATTEMPT_MEMBERSHIP/,
  );
});
