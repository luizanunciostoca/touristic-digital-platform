import { now } from "./staging-node-test-fixtures.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NODE_MODE } from "./staging-node-contracts.mjs";
import { receiptBody } from "./staging-node-receipts.mjs";
import {
  verifyOciAcceptanceRun,
  verifyNodeAcceptanceRun,
} from "./staging-node-acceptance.mjs";
import {
  ociFixture,
  nodeAcceptanceFixture,
} from "./staging-node-test-fixtures.mjs";

test("consumer verifies one current-attempt artifact and exact successful run", async () => {
  const f = ociFixture();
  assert.equal((await verifyOciAcceptanceRun(f.options)).runAttempt, 2);
});
for (const [name, mutate] of [
  [
    "Node acceptance",
    (f) => {
      f.evidence.mode = NODE_MODE;
      f.evidence.productionEligible = false;
    },
  ],
  [
    "wrong evidence run",
    (f) => {
      f.evidence.acceptanceRunId = "43";
    },
  ],
  [
    "wrong evidence attempt",
    (f) => {
      f.evidence.acceptanceRunAttempt = "1";
    },
  ],
  [
    "old artifact attempt",
    (f) => {
      f.artifact.name = "final-release-acceptance-evidence-42-1";
    },
  ],
  [
    "expired artifact",
    (f) => {
      f.artifact.expired = true;
    },
  ],
  [
    "different candidate",
    (f) => {
      f.run.head_sha = "e".repeat(40);
    },
  ],
  [
    "wrong workflow",
    (f) => {
      f.run.path = ".github/workflows/other.yml";
    },
  ],
  [
    "duplicate artifact",
    (f) => {
      f.options.listArtifacts = async () => ({
        complete: true,
        items: [f.artifact, f.artifact],
      });
    },
  ],
  [
    "incomplete artifact listing",
    (f) => {
      f.options.listArtifacts = async () => ({
        complete: false,
        items: [f.artifact],
      });
    },
  ],
])
  test(name + " cannot authorize downstream dispatch", async () => {
    const f = ociFixture();
    mutate(f);
    let mutations = 0;
    await assert.rejects(async () => {
      await verifyOciAcceptanceRun(f.options);
      mutations++;
    });
    assert.equal(mutations, 0);
  });
test("FRA revalidates fresh authenticated observation tied to current acceptance caller", async () => {
  const f = nodeAcceptanceFixture();
  const result = await verifyNodeAcceptanceRun(f.acceptanceOptions);
  assert.equal(result.acceptanceRunId, "11");
  assert.equal(result.workflow.callerRunId, 10);
});
for (const [name, mutate] of [
  [
    "historical same-SHA caller",
    (f) => {
      f.acceptanceOptions.callerRunId = 99;
    },
  ],
  [
    "expired observation in retained artifact",
    (f) => {
      f.acceptanceOptions.now = "2026-10-23T04:26:00Z";
    },
  ],
  [
    "revoked after child verification",
    (f) => {
      f.comments.push({
        ...f.comment,
        id: 124,
        body: receiptBody({ ...f.payload, phase: "revoked" }),
      });
    },
  ],
  [
    "modified runtime in artifact",
    (f) => {
      f.evidence.runtime = { ...f.evidence.runtime, identity: "forged" };
    },
  ],
  [
    "wrong current attempt",
    (f) => {
      f.acceptanceOptions.callerRunAttempt = 2;
    },
  ],
  [
    "stale runtime with fresh provider",
    (f) => {
      f.evidence.runtime.observedAt = "2026-10-23T04:00:00Z";
    },
  ],
])
  test("FRA rejects " + name, async () => {
    const f = nodeAcceptanceFixture();
    mutate(f);
    await assert.rejects(verifyNodeAcceptanceRun(f.acceptanceOptions));
  });
test("FRA fails when receipt expires during authenticated readback", async () => {
  const f = nodeAcceptanceFixture();
  let calls = 0;
  f.acceptanceOptions.clock = () =>
    ++calls <= 2 ? now : "2026-10-23T04:26:00Z";
  await assert.rejects(
    verifyNodeAcceptanceRun(f.acceptanceOptions),
    /NODE_ACCEPTANCE_EXPIRED_DURING_READBACK/,
  );
});
test("FRA reauthenticates barrier and rejects pre-lock provider evidence retained in an artifact", async () => {
  const f = nodeAcceptanceFixture();
  f.payload.observation.origin.observedAt = "2026-10-23T04:19:19Z";
  f.payload.observation.externalEvidence.items[0].observedAt =
    f.payload.observation.origin.observedAt;
  f.evidence.origin = structuredClone(f.payload.observation.origin);
  f.evidence.externalEvidence = structuredClone(
    f.payload.observation.externalEvidence,
  );
  f.comment.body = receiptBody(f.payload);
  f.evidence.postReceiptSha256 = createHash("sha256")
    .update(f.comment.body)
    .digest("hex");
  await assert.rejects(
    verifyNodeAcceptanceRun(f.acceptanceOptions),
    /NODE_PROVIDER_OBSERVATION_PREDATES_VERIFICATION_BARRIER/,
  );
});
