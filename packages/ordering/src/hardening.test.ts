import { describe, expect, it } from "vitest";

import {
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  normalizeOrderRequestKey,
  normalizeOrderSourceReference,
  type OrderPricingSnapshot,
  type OrderStatus,
} from "./index.js";

function orderId() {
  const value = normalizeOrderId("ord_12345678");
  if (!value) throw new Error("TEST_ORDER_ID_INVALID");
  return value;
}

function requestKey() {
  const value = createBusinessOrderRequestKey("session_123", "performance");
  if (!value) throw new Error("TEST_REQUEST_KEY_INVALID");
  return value;
}

function source() {
  const value = normalizeOrderSourceReference("demo_business_123");
  if (!value) throw new Error("TEST_SOURCE_INVALID");
  return value;
}

function quote() {
  const value = createPricingQuote({
    planId: "performance",
    planName: "Performance",
    minorUnits: 49_900,
    currency: "BRL",
    pricingVersion: "plans_2026_08",
  });
  if (!value) throw new Error("TEST_QUOTE_INVALID");
  return value;
}

function snapshot() {
  const value = capturePricingSnapshot(quote(), "2026-08-14T19:30:00Z");
  if (!value) throw new Error("TEST_SNAPSHOT_INVALID");
  return value;
}

describe("M136 ordering identity hardening", () => {
  it("rejects oversized values instead of truncating them into valid identities", () => {
    expect(normalizeOrderId(`ord_${"a".repeat(200)}`)).toBeNull();
    expect(
      createBusinessOrderRequestKey(`session_${"a".repeat(200)}`, "performance"),
    ).toBeNull();
    expect(
      normalizeOrderRequestKey(`business:${"a".repeat(220)}:performance`),
    ).toBeNull();
    expect(normalizeOrderSourceReference(`demo_${"a".repeat(200)}`)).toBeNull();
  });

  it("rejects oversized authoritative pricing fields instead of silently truncating", () => {
    expect(
      createPricingQuote({
        planId: `plan_${"a".repeat(100)}`,
        planName: "Oversized",
        minorUnits: 10_000,
        currency: "BRL",
        pricingVersion: "plans_2026_08",
      }),
    ).toBeNull();
    expect(
      createPricingQuote({
        planId: "performance",
        planName: "x".repeat(200),
        minorUnits: 10_000,
        currency: "BRL",
        pricingVersion: "plans_2026_08",
      }),
    ).toBeNull();
  });
});

describe("M136 ordering constructor hardening", () => {
  it("revalidates a forged pricing snapshot instead of trusting a typed object", () => {
    const forged = {
      ...snapshot(),
      planId: `plan_${"a".repeat(100)}`,
    } as OrderPricingSnapshot;

    expect(capturePricingSnapshot(forged, forged.capturedAt)).toBeNull();
    expect(
      createOrder({
        id: orderId(),
        requestKey: requestKey(),
        source: source(),
        pricing: forged,
        createdAt: "2026-08-14T19:31:00Z",
      }),
    ).toBeNull();
  });

  it("rejects a forged runtime status that bypasses TypeScript", () => {
    expect(
      createOrder({
        id: orderId(),
        requestKey: requestKey(),
        source: source(),
        status: "paid_somehow" as OrderStatus,
        pricing: snapshot(),
        createdAt: "2026-08-14T19:31:00Z",
      }),
    ).toBeNull();
  });
});
