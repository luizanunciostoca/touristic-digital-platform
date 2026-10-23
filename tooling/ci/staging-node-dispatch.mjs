import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  SHA,
  STAGING_SERVICE,
  NODE_MODE,
  nonempty,
  time,
} from "./staging-node-contracts.mjs";
import { assertAuthenticatedConnectorReceipt } from "./staging-node-receipts.mjs";

export function canonicalNodeHook(raw, sourceSha) {
  assert.match(sourceSha ?? "", SHA, "NODE_HOOK_SHA");
  const input = new URL(raw);
  assert.equal(input.origin, "https://api.render.com", "NODE_HOOK_ORIGIN");
  assert.equal(input.username + input.password, "", "NODE_HOOK_USERINFO");
  assert.equal(input.hash, "", "NODE_HOOK_FRAGMENT");
  assert.equal(
    input.pathname,
    "/deploy/" + STAGING_SERVICE,
    "NODE_HOOK_SERVICE",
  );
  const keys = [...input.searchParams.keys()];
  assert.deepEqual(keys, ["key"], "NODE_HOOK_QUERY");
  assert.ok(nonempty(input.searchParams.get("key")), "NODE_HOOK_KEY");
  const result = new URL("https://api.render.com/deploy/" + STAGING_SERVICE);
  result.searchParams.set("key", input.searchParams.get("key"));
  result.searchParams.set("ref", sourceSha);
  return result;
}

export async function dispatchNodeWithReservation({
  policy,
  receipt,
  expected,
  now,
  refStore,
  postHook,
}) {
  assert.equal(policy?.enabled, true, "NODE_DISPATCH_DISABLED");
  assertAuthenticatedConnectorReceipt(receipt);
  const p = receipt.payload,
    current = time(now);
  assert.equal(p.phase, "pre-deploy", "NODE_PREDEPLOY_RECEIPT_REQUIRED");
  assert.equal(
    p.authorizationId,
    policy.authorizationId,
    "NODE_POLICY_AUTHORIZATION",
  );
  assert.equal(p.runAttempt, 1, "NODE_DISPATCH_RERUN_FORBIDDEN");
  for (const key of [
    "runId",
    "runAttempt",
    "callerRunId",
    "callerRunAttempt",
    "requestId",
    "sourceSha",
    "treeSha",
  ])
    assert.equal(p[key], expected[key], "NODE_DISPATCH_IDENTITY");
  assert.ok(time(policy.expiresAt) > current, "NODE_AUTHORIZATION_EXPIRED");
  assert.ok(
    current - time(p.observedAt) <= 300000,
    "NODE_PREDEPLOY_RECEIPT_STALE",
  );
  assert.equal(p.maximumDeployments, 1, "NODE_SINGLE_PUBLICATION_REQUIRED");
  assert.equal(
    p.preflight?.configurationPreserved,
    true,
    "NODE_CONFIGURATION_NOT_PROVEN",
  );
  assert.equal(
    p.preflight?.recovery?.status,
    "PROVEN",
    "NODE_RECOVERY_NOT_PROVEN",
  );
  assert.equal(
    p.preflight.recovery.candidateSha,
    p.sourceSha,
    "NODE_RECOVERY_CANDIDATE",
  );
  for (const key of [
    "backupRef",
    "restoreRef",
    "rollbackRef",
    "mutationInventoryRef",
  ])
    assert.ok(
      nonempty(p.preflight.recovery[key]),
      "NODE_RECOVERY_REFERENCE_REQUIRED",
    );
  const ref =
    "refs/tags/staging-node-use/" +
    createHash("sha256").update(p.authorizationId).digest("hex");
  assert.equal(
    await refStore.getRef(ref),
    null,
    "NODE_PUBLICATION_ALREADY_RESERVED",
  );
  // GitHub create-ref is atomic. Never retry this operation after ambiguity.
  try {
    await refStore.createRef(ref, p.sourceSha);
  } catch {
    throw new Error("NODE_RESERVATION_UNCERTAIN_RECONCILE");
  }
  assert.equal(
    (await refStore.getRef(ref))?.sha,
    p.sourceSha,
    "NODE_RESERVATION_READBACK_FAILED",
  );
  let response;
  // Reservation precedes the only hook POST, including when POST times out.
  try {
    response = await postHook();
  } catch {
    throw new Error("NODE_HOOK_OUTCOME_UNCERTAIN_RECONCILE");
  }
  assert.match(
    response?.deploymentId ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "NODE_HOOK_ID_MISSING_RECONCILE",
  );
  return Object.freeze({
    mode: NODE_MODE,
    state: "DISPATCH_ACCEPTED_NOT_LIVE",
    reservationRef: ref,
    providerDeploymentId: response.deploymentId,
    sourceSha: p.sourceSha,
    requestId: p.requestId,
    runId: p.runId,
    runAttempt: p.runAttempt,
    preReceiptId: receipt.commentId,
    preReceiptSha256: receipt.sha256,
    productionEligible: false,
    pagesEligible: false,
  });
}
