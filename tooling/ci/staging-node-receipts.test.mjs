import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  receiptBody,
  verifyConnectorReceipt,
  assertAuthenticatedConnectorReceipt,
} from "./staging-node-receipts.mjs";
import {
  receiptFixture,
  postFixture,
  now,
} from "./staging-node-test-fixtures.mjs";

test("authenticated comment transport does not claim CI queried Render", async () => {
  const { reference, options } = receiptFixture();
  const result = await verifyConnectorReceipt(reference, options);
  assert.equal(result.transportVerified, true);
  assert.equal(result.providerQueriedByCi, false);
  assert.equal(result.publicationAuthorized, false);
});
for (const [name, mutate] of [
  [
    "actor drift",
    (f) => {
      f.comment.user.id = 1;
    },
  ],
  [
    "app provenance drift",
    (f) => {
      f.comment.performed_via_github_app = { id: 1 };
    },
  ],
  [
    "edited comment",
    (f) => {
      f.comment.updated_at = "2026-10-23T04:19:50Z";
    },
  ],
  [
    "raw bytes drift",
    (f) => {
      f.comment.body += " ";
    },
  ],
  [
    "wrong tower",
    (f) => {
      f.comment.issue_url = f.comment.issue_url.replace("1072", "1");
    },
  ],
  [
    "request mismatch",
    (f) => {
      f.options.expected.runId = 13;
    },
  ],
  [
    "incomplete pagination",
    (f) => {
      f.options.listComments = async () => ({
        complete: false,
        comments: [f.comment],
      });
    },
  ],
  [
    "duplicate grant",
    (f) => {
      f.options.listComments = async () => ({
        complete: true,
        comments: [f.comment, { ...f.comment, id: 124 }],
      });
    },
  ],
  [
    "revocation",
    (f) => {
      f.options.listComments = async () => ({
        complete: true,
        comments: [
          f.comment,
          {
            ...f.comment,
            id: 125,
            body: receiptBody({
              authorizationId: "one-staging-publication",
              phase: "revoked",
            }),
          },
        ],
      });
    },
  ],
  [
    "reread drift",
    (f) => {
      let reads = 0;
      f.options.fetchComment = async () => ({
        ...f.comment,
        body: f.comment.body + (reads++ ? " " : ""),
      });
    },
  ],
])
  test(name + " rejects receipt", async () => {
    const f = receiptFixture();
    mutate(f);
    await assert.rejects(verifyConnectorReceipt(f.reference, f.options));
  });
test("post observation can supersede a stale immutable observation of the same dispatch", async () => {
  const f = postFixture();
  const old = {
    ...f.comment,
    id: 122,
    created_at: "2026-10-23T04:00:00Z",
    updated_at: "2026-10-23T04:00:00Z",
    body: receiptBody({
      ...f.payload,
      observedAt: "2026-10-23T03:59:59Z",
      verification: { ...f.payload.verification, runId: 13 },
      verificationId: "13:1",
    }),
  };
  f.comments.unshift(old);
  f.payload.supersedesReceiptId = 122;
  f.comment.body = receiptBody(f.payload);
  f.reference.sha256 = createHash("sha256")
    .update(f.comment.body)
    .digest("hex");
  assert.equal(
    (await verifyConnectorReceipt(f.reference, f.options)).commentId,
    123,
  );
});
for (const [name, mutate] of [
  [
    "forked supersession",
    (f) => {
      f.payload.supersedesReceiptId = 999;
    },
  ],
  [
    "wrong verification caller",
    (f) => {
      f.payload.verification.callerRunId = 19;
    },
  ],
  [
    "stale post observation",
    (f) => {
      f.payload.observedAt = "2026-10-23T04:00:00Z";
    },
  ],
  [
    "verification ID drift",
    (f) => {
      f.payload.verificationId = "15:1";
    },
  ],
])
  test("post observation rejects " + name, async () => {
    const f = postFixture();
    mutate(f);
    f.comment.body = receiptBody(f.payload);
    f.reference.sha256 = createHash("sha256")
      .update(f.comment.body)
      .digest("hex");
    await assert.rejects(verifyConnectorReceipt(f.reference, f.options));
  });
test("supersession never makes an older receipt current again", async () => {
  const f = postFixture();
  const next = {
    ...f.comment,
    id: 124,
    body: receiptBody({
      ...f.payload,
      verificationId: "15:1",
      verification: { ...f.payload.verification, runId: 15 },
      supersedesReceiptId: 123,
    }),
  };
  f.comments.push(next);
  await assert.rejects(
    verifyConnectorReceipt(f.reference, f.options),
    /RECEIPT_SUPERSEDED/,
  );
});

test("only original authenticated receipt retains private membership", async () => {
  const f = receiptFixture();
  const receipt = await verifyConnectorReceipt(f.reference, f.options);
  assert.doesNotThrow(() => assertAuthenticatedConnectorReceipt(receipt));
  for (const forged of [
    JSON.parse(JSON.stringify(receipt)),
    { ...receipt },
    Object.create(receipt),
    null,
  ]) {
    assert.throws(
      () => assertAuthenticatedConnectorReceipt(forged),
      /NODE_AUTHENTICATED_RECEIPT_REQUIRED/,
    );
  }
});
test("authenticated receipt and nested payload cannot be mutated", async () => {
  const f = receiptFixture();
  const receipt = await verifyConnectorReceipt(f.reference, f.options);
  assert.ok(Object.isFrozen(receipt));
  assert.ok(Object.isFrozen(receipt.payload));
  assert.throws(() => {
    receipt.payload.runId = 999;
  }, TypeError);
  assert.throws(() => {
    receipt.publicationAuthorized = true;
  }, TypeError);
});
