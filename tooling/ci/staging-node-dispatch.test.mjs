import { STAGING_SERVICE } from "./staging-node-contracts.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  dispatchNodeWithReservation,
  canonicalNodeHook,
} from "./staging-node-dispatch.mjs";
import { sha, dispatchFixture } from "./staging-node-test-fixtures.mjs";

test("reserve before one hook POST; subsequent calls cannot replay", async () => {
  const f = await dispatchFixture();
  const result = await dispatchNodeWithReservation(f.options);
  assert.equal(result.state, "DISPATCH_ACCEPTED_NOT_LIVE");
  assert.equal(f.refs.size, 1);
  assert.equal(f.getPosts(), 1);
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /ALREADY_RESERVED/,
  );
  assert.equal(f.getPosts(), 1);
});
test("timeout after hook acceptance never produces a second POST", async () => {
  const f = await dispatchFixture();
  f.setHook(() => {
    throw Error("accepted but response lost");
  });
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /OUTCOME_UNCERTAIN_RECONCILE/,
  );
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /ALREADY_RESERVED/,
  );
  assert.equal(f.getPosts(), 1);
});
test("missing provider ID remains reserved and requires reconciliation", async () => {
  const f = await dispatchFixture();
  f.setHook(() => ({}));
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /ID_MISSING_RECONCILE/,
  );
  assert.equal(f.getPosts(), 1);
  assert.equal(f.refs.size, 1);
});
test("new run cannot reuse prior receipt", async () => {
  const f = await dispatchFixture();
  f.options.expected = { ...f.options.expected, runId: 13 };
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /DISPATCH_IDENTITY/,
  );
  assert.equal(f.getPosts(), 0);
});
test("JSON copying a verified receipt cannot manufacture dispatch authority", async () => {
  const f = await dispatchFixture();
  f.options.receipt = structuredClone(f.options.receipt);
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /AUTHENTICATED_RECEIPT_REQUIRED/,
  );
  assert.equal(f.getPosts(), 0);
});
test("uncertain reservation outcome forbids hook POST", async () => {
  const f = await dispatchFixture();
  f.options.refStore.createRef = async () => {
    throw Error("timeout");
  };
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /RESERVATION_UNCERTAIN/,
  );
  assert.equal(f.getPosts(), 0);
});
test("disabled policy never reserves or sends a POST", async () => {
  const f = await dispatchFixture();
  f.options.policy.enabled = false;
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /DISPATCH_DISABLED/,
  );
  assert.equal(f.getPosts(), 0);
  assert.equal(f.refs.size, 0);
});
for (const [name, suffix] of [
  ["imageURL", "?key=fixture&imageURL=forbidden"],
  ["duplicate key", "?key=one&key=two"],
  ["existing ref", "?key=fixture&ref=other"],
  ["unknown query", "?key=fixture&extra=x"],
  ["fragment", "?key=fixture#redirect"],
  ["missing key", ""],
])
  test("canonical hook rejects " + name, () =>
    assert.throws(() =>
      canonicalNodeHook(
        "https://api.render.com/deploy/" + STAGING_SERVICE + suffix,
        sha,
      ),
    ),
  );
test("canonical hook rejects non-default port and constructs only key plus exact ref", () => {
  assert.throws(() =>
    canonicalNodeHook(
      "https://api.render.com:444/deploy/" + STAGING_SERVICE + "?key=fixture",
      sha,
    ),
  );
  const u = canonicalNodeHook(
    "https://api.render.com/deploy/" + STAGING_SERVICE + "?key=fixture",
    sha,
  );
  assert.deepEqual([...u.searchParams.keys()], ["key", "ref"]);
  assert.equal(u.searchParams.get("ref"), sha);
});
