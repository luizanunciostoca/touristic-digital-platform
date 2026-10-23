import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  NODE_MODE,
  STAGING_SERVICE,
  SHA,
  integer,
  time,
  nonempty,
  assertObservationAfterBarrier,
} from "./staging-node-contracts.mjs";

const connectorReceipts = new WeakSet();
function freezeDeep(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
const RECEIPT_PREFIX = "TDP_STAGING_NODE_RECEIPT_V1\n";
export function receiptBody(payload) {
  return RECEIPT_PREFIX + JSON.stringify(payload);
}
export async function verifyConnectorReceipt(
  reference,
  { fetchComment, listComments, actor, expected, now },
) {
  assert.ok(integer(reference?.commentId), "RECEIPT_REFERENCE_REQUIRED");
  assert.match(
    reference?.sha256 ?? "",
    /^[a-f0-9]{64}$/u,
    "RECEIPT_DIGEST_REQUIRED",
  );
  assert.ok(
    integer(actor?.id) &&
      nonempty(actor?.login) &&
      Object.hasOwn(actor, "appId"),
    "RECEIPT_ACTOR_POLICY_REQUIRED",
  );
  const authorized = (comment) =>
    comment?.user?.id === actor.id &&
    comment.user.login === actor.login &&
    (comment.performed_via_github_app?.id ?? null) === actor.appId;
  const snapshot = (comment) =>
    JSON.stringify({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: comment.user,
      appId: comment.performed_via_github_app?.id ?? null,
      issueUrl: comment.issue_url,
    });
  const first = await fetchComment(reference.commentId);
  assert.equal(first.id, reference.commentId, "RECEIPT_ID_MISMATCH");
  assert.ok(authorized(first), "RECEIPT_ACTOR_MISMATCH");
  assert.equal(
    first.issue_url,
    "https://api.github.com/repos/luizanunciostoca/touristic-digital-platform/issues/1072",
    "RECEIPT_WRONG_CONTROL_TOWER",
  );
  assert.equal(first.created_at, first.updated_at, "RECEIPT_EDITED");
  assert.equal(
    createHash("sha256").update(first.body, "utf8").digest("hex"),
    reference.sha256,
    "RECEIPT_BYTES_MISMATCH",
  );
  assert.ok(first.body.startsWith(RECEIPT_PREFIX), "RECEIPT_FORMAT");
  const payload = JSON.parse(first.body.slice(RECEIPT_PREFIX.length));
  assert.equal(payload.schemaVersion, 1, "RECEIPT_SCHEMA");
  assert.equal(
    payload.producer,
    "ORCHESTRATOR_CONNECTOR_READBACK",
    "RECEIPT_PRODUCER",
  );
  assert.ok(
    ["pre-deploy", "post-deploy"].includes(payload.phase),
    "RECEIPT_PHASE",
  );
  for (const key of [
    "phase",
    "authorizationId",
    "requestId",
    "sourceSha",
    "treeSha",
    "runId",
    "runAttempt",
    "callerRunId",
    "callerRunAttempt",
  ])
    assert.equal(payload[key], expected[key], "RECEIPT_BINDING_MISMATCH");
  assert.match(payload.sourceSha ?? "", SHA, "RECEIPT_SOURCE_REQUIRED");
  assert.match(payload.treeSha ?? "", SHA, "RECEIPT_TREE_REQUIRED");
  assert.ok(
    nonempty(payload.authorizationId) && nonempty(payload.requestId),
    "RECEIPT_REQUEST_REQUIRED",
  );
  for (const key of ["runId", "runAttempt", "callerRunId", "callerRunAttempt"])
    assert.ok(integer(payload[key]), "RECEIPT_RUN_REQUIRED");
  assert.equal(payload.serviceId, STAGING_SERVICE, "RECEIPT_SERVICE_MISMATCH");
  assert.equal(payload.maximumDeployments, 1, "RECEIPT_USE_LIMIT");
  assert.equal(payload.mode, NODE_MODE, "RECEIPT_MODE");
  const observed = time(payload.observedAt),
    created = time(first.created_at),
    current = time(now);
  assert.ok(
    observed <= created && created <= current && current - observed <= 300_000,
    "RECEIPT_STALE_OR_FUTURE",
  );
  const listing = await listComments();
  assert.equal(listing?.complete, true, "RECEIPT_LIST_INCOMPLETE");
  assert.ok(Array.isArray(listing.comments), "RECEIPT_LIST_REQUIRED");
  const entries = listing.comments
    .filter(authorized)
    .filter((c) => c.body.startsWith(RECEIPT_PREFIX))
    .map((c) => ({
      comment: c,
      payload: JSON.parse(c.body.slice(RECEIPT_PREFIX.length)),
    }));
  assert.equal(
    entries.filter((x) => x.comment.id === reference.commentId).length,
    1,
    "RECEIPT_NOT_LISTED_ONCE",
  );
  assert.equal(
    snapshot(entries.find((x) => x.comment.id === reference.commentId).comment),
    snapshot(first),
    "RECEIPT_LIST_DRIFT",
  );
  assert.equal(
    entries.some(
      (x) =>
        x.payload.authorizationId === payload.authorizationId &&
        x.payload.phase === "revoked",
    ),
    false,
    "RECEIPT_REVOKED",
  );
  const samePhase = entries.filter(
    (x) =>
      x.payload.authorizationId === payload.authorizationId &&
      x.payload.phase === payload.phase,
  );
  if (payload.phase === "pre-deploy") {
    assert.equal(samePhase.length, 1, "RECEIPT_DUPLICATE_AUTHORIZATION");
  } else {
    assert.deepEqual(
      payload.verification,
      expected.verification,
      "RECEIPT_VERIFICATION_BINDING",
    );
    assert.deepEqual(
      payload.verificationBarrier,
      expected.verificationBarrier,
      "RECEIPT_VERIFICATION_BARRIER_BINDING",
    );
    assertObservationAfterBarrier(
      payload.observation,
      payload.observedAt,
      expected.verificationBarrier,
    );
    for (const key of [
      "runId",
      "runAttempt",
      "callerRunId",
      "callerRunAttempt",
    ])
      assert.ok(
        integer(payload.verification?.[key]),
        "RECEIPT_VERIFICATION_ID_REQUIRED",
      );
    assert.equal(
      payload.verificationId,
      `${payload.verification.runId}:${payload.verification.runAttempt}`,
      "RECEIPT_VERIFICATION_ID",
    );
    const ordered = samePhase.sort((a, b) => a.comment.id - b.comment.id);
    let previous = null;
    const seen = new Set();
    for (const entry of ordered) {
      const q = entry.payload;
      assert.equal(
        entry.comment.created_at,
        entry.comment.updated_at,
        "RECEIPT_CHAIN_EDITED",
      );
      assert.equal(
        entry.comment.issue_url,
        first.issue_url,
        "RECEIPT_CHAIN_LOCATION",
      );
      assert.equal(
        q.supersedesReceiptId,
        previous,
        "RECEIPT_SUPERSESSION_CONFLICT",
      );
      assert.ok(!seen.has(q.verificationId), "RECEIPT_VERIFICATION_DUPLICATE");
      for (const key of [
        "sourceSha",
        "treeSha",
        "runId",
        "runAttempt",
        "callerRunId",
        "callerRunAttempt",
        "requestId",
        "preReceiptId",
        "preReceiptSha256",
        "dispatchArtifactId",
        "dispatchSha256",
      ])
        assert.equal(q[key], payload[key], "RECEIPT_CHAIN_DISPATCH_DRIFT");
      seen.add(q.verificationId);
      previous = entry.comment.id;
    }
    assert.equal(previous, first.id, "RECEIPT_SUPERSEDED");
  }
  const last = await fetchComment(reference.commentId);
  assert.equal(snapshot(last), snapshot(first), "RECEIPT_REREAD_DRIFT");
  const receipt = freezeDeep({
    transport: "github-issue-comment",
    transportVerified: true,
    providerQueriedByCi: false,
    commentId: first.id,
    sha256: reference.sha256,
    payload: JSON.parse(JSON.stringify(payload)),
    publicationAuthorized: false,
  });
  connectorReceipts.add(receipt);
  return receipt;
}

// Membership can only be established by authenticated transport validation above.
export function assertAuthenticatedConnectorReceipt(receipt) {
  assert.ok(
    connectorReceipts.has(receipt),
    "NODE_AUTHENTICATED_RECEIPT_REQUIRED",
  );
}
