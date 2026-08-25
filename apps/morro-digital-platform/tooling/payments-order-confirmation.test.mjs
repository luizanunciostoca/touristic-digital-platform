import assert from "node:assert/strict";
import test from "node:test";

import { createOrderConfirmingVerifiedPaymentOutcomeService } from "./payments-api.mjs";

// Exact-head regression for the verified Financial outcome -> Ordering transition.
const orderId = "ord_12345678";
const paymentId = "pay_12345678";

function order(
  status = "pending_payment",
  updatedAt = "2026-08-25T01:00:00.000Z",
) {
  return Object.freeze({
    id: orderId,
    requestKey: "business:session_12345678:provider_acceptance_test",
    source: Object.freeze({
      kind: "business_onboarding",
      reference: "session_12345678",
    }),
    status,
    pricing: Object.freeze({
      planId: "provider_acceptance_test",
      planName: "Provider acceptance TEST",
      amount: Object.freeze({ minorUnits: 1000, currency: "BRL" }),
      pricingVersion: "acceptance_v1",
      capturedAt: "2026-08-25T01:00:00.000Z",
    }),
    createdAt: "2026-08-25T01:00:00.000Z",
    updatedAt,
  });
}

function approvedOutcome() {
  return Object.freeze({
    disposition: "applied",
    payment: Object.freeze({
      id: paymentId,
      status: "confirmed",
      subject: Object.freeze({ kind: "order", reference: orderId }),
    }),
    result: Object.freeze({
      kind: "approved",
      paymentStatus: "confirmed",
      paymentId,
      orderReference: orderId,
      recordedAt: "2026-08-25T01:00:01.000Z",
    }),
  });
}

function fixture({ initialOrder = order(), outcome = approvedOutcome() } = {}) {
  let persisted = initialOrder;
  let saves = 0;
  const orders = {
    async findById(id) {
      assert.equal(id, orderId);
      return persisted;
    },
    async save(next) {
      saves += 1;
      persisted = next;
      return next;
    },
  };
  const service = createOrderConfirmingVerifiedPaymentOutcomeService({
    outcomes: {
      async apply() {
        return outcome;
      },
    },
    orders,
    clock: { now: () => "2026-08-25T01:00:02.000Z" },
  });
  return {
    service,
    getPersisted: () => persisted,
    getSaves: () => saves,
  };
}

test("projects a verified approved payment into the canonical Ordering transition", async () => {
  const outcome = approvedOutcome();
  const { service, getPersisted, getSaves } = fixture({ outcome });
  const result = await service.apply({});
  assert.equal(result, outcome);
  assert.equal(getSaves(), 1);
  assert.equal(getPersisted().status, "payment_confirmed");
  assert.equal(getPersisted().id, orderId);
  assert.equal(getPersisted().source.kind, "business_onboarding");
  assert.ok(
    Date.parse(getPersisted().updatedAt) >
      Date.parse("2026-08-25T01:00:00.000Z"),
  );
});

test("is idempotent when Ordering is already payment_confirmed", async () => {
  const { service, getSaves } = fixture({
    initialOrder: order("payment_confirmed"),
  });
  await service.apply({});
  assert.equal(getSaves(), 0);
});

test("does not advance Ordering for a non-approved verified outcome", async () => {
  const rejected = Object.freeze({
    disposition: "applied",
    payment: Object.freeze({
      id: paymentId,
      status: "failed",
      subject: Object.freeze({ kind: "order", reference: orderId }),
    }),
    result: Object.freeze({
      kind: "rejected",
      paymentStatus: "failed",
      paymentId,
      orderReference: orderId,
      recordedAt: "2026-08-25T01:00:01.000Z",
    }),
  });
  const { service, getPersisted, getSaves } = fixture({ outcome: rejected });
  await service.apply({});
  assert.equal(getSaves(), 0);
  assert.equal(getPersisted().status, "pending_payment");
});

test("treats a concurrent successful confirmation as an idempotent replay", async () => {
  let latest = order();
  const outcome = approvedOutcome();
  let saves = 0;
  const orders = {
    async findById() {
      return latest;
    },
    async save(next) {
      saves += 1;
      latest = Object.freeze({ ...next, status: "payment_confirmed" });
      throw new Error("ORDERING_CONCURRENT_ORDER_MODIFICATION");
    },
  };
  const service = createOrderConfirmingVerifiedPaymentOutcomeService({
    outcomes: {
      async apply() {
        return outcome;
      },
    },
    orders,
    clock: { now: () => "2026-08-25T01:00:02.000Z" },
  });
  const result = await service.apply({});
  assert.equal(result, outcome);
  assert.equal(saves, 1);
  assert.equal(latest.status, "payment_confirmed");
});

test("fails closed instead of resurrecting a cancelled order", async () => {
  const { service, getSaves } = fixture({ initialOrder: order("cancelled") });
  await assert.rejects(
    () => service.apply({}),
    /PAYMENTS_VERIFIED_ORDER_STATUS_CONFLICT/u,
  );
  assert.equal(getSaves(), 0);
});
