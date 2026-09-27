import assert from "node:assert/strict";
import { test } from "vitest";

import { createOrderConfirmingVerifiedPaymentOutcomeService } from "./payments-api.mjs";

function order(status = "pending_payment") {
  return {
    id: "ord_restaurant_12345678",
    requestKey: "restaurant:rrv_restaurant_12345678",
    source: {
      kind: "restaurant_reservation",
      reference: "rrv_restaurant_12345678",
    },
    status,
    pricing: {
      planId: "rrv_restaurant_12345678",
      planName: "restaurant_deposit",
      amount: { minorUnits: 5000, currency: "BRL" },
      pricingVersion: "rdep_12345678",
      capturedAt: "2026-09-24T01:00:00.000Z",
    },
    createdAt: "2026-09-24T01:00:00.000Z",
    updatedAt: "2026-09-24T01:00:00.000Z",
  };
}

test("restaurant fulfillment runs only after a verified confirmed outcome", async () => {
  let currentOrder = order();
  const fulfilled = [];
  const service = createOrderConfirmingVerifiedPaymentOutcomeService({
    outcomes: {
      async apply() {
        return {
          payment: {
            id: "pay_restaurant_12345678",
            subject: { kind: "order", reference: currentOrder.id },
            status: "confirmed",
          },
          result: {
            kind: "approved",
            paymentId: "pay_restaurant_12345678",
            orderReference: currentOrder.id,
            paymentStatus: "confirmed",
            recordedAt: "2026-09-24T01:01:00.000Z",
          },
        };
      },
    },
    orders: {
      async findById() {
        return currentOrder;
      },
      async save(value) {
        currentOrder = value;
        return value;
      },
    },
    restaurantFulfillment: {
      async handle(input) {
        fulfilled.push(input);
      },
    },
    clock: { now: () => "2026-09-24T01:01:01.000Z" },
  });

  await service.apply({ provider: "sandbox" });
  assert.equal(currentOrder.status, "payment_confirmed");
  assert.equal(fulfilled.length, 1);
  assert.equal(fulfilled[0].order.id, "ord_restaurant_12345678");

  await service.apply({ provider: "sandbox" });
  assert.equal(
    fulfilled.length,
    2,
    "replay must re-run idempotent fulfillment",
  );
});

test("restaurant fulfillment is not called for an unconfirmed outcome", async () => {
  const fulfilled = [];
  const service = createOrderConfirmingVerifiedPaymentOutcomeService({
    outcomes: {
      async apply() {
        return {
          payment: {
            id: "pay_restaurant_12345678",
            subject: { kind: "order", reference: "ord_restaurant_12345678" },
            status: "pending",
          },
          result: {
            kind: "pending",
            paymentId: "pay_restaurant_12345678",
            orderReference: "ord_restaurant_12345678",
            paymentStatus: "pending",
            recordedAt: "2026-09-24T01:01:00.000Z",
          },
        };
      },
    },
    orders: {
      async findById() {
        return order();
      },
      async save(value) {
        return value;
      },
    },
    restaurantFulfillment: {
      async handle(input) {
        fulfilled.push(input);
      },
    },
    clock: { now: () => "2026-09-24T01:01:01.000Z" },
  });

  await service.apply({ provider: "sandbox" });
  assert.equal(fulfilled.length, 0);
});

test("restaurant verified outcome fails closed when fulfillment is unavailable", async () => {
  const confirmed = order("payment_confirmed");
  const service = createOrderConfirmingVerifiedPaymentOutcomeService({
    outcomes: {
      async apply() {
        return {
          payment: {
            id: "pay_restaurant_12345678",
            subject: { kind: "order", reference: confirmed.id },
            status: "confirmed",
          },
          result: {
            kind: "approved",
            paymentId: "pay_restaurant_12345678",
            orderReference: confirmed.id,
            paymentStatus: "confirmed",
            recordedAt: "2026-09-24T01:01:00.000Z",
          },
        };
      },
    },
    orders: {
      async findById() {
        return confirmed;
      },
      async save(value) {
        return value;
      },
    },
    clock: {
      now() {
        return "2026-09-24T01:01:01.000Z";
      },
    },
  });

  await assert.rejects(
    service.apply({ provider: "sandbox" }),
    /PAYMENTS_RESTAURANT_FULFILLMENT_REQUIRED/,
  );
});
