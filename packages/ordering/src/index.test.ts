import { describe, expect, it, vi } from "vitest";

import {
  assertOrderTransition,
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  isOrderTransitionAllowed,
  normalizeOrderId,
  normalizeOrderRequestKey,
  normalizeOrderSourceReference,
  type Order,
  type OrderPricingAuthorityPort,
  type OrderRepositoryPort,
  type OrderPlacedEvent,
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

describe("M136 ordering identities", () => {
  it("preserves the V1 logical Business request key without making Business a payment authority", () => {
    expect(createBusinessOrderRequestKey("session_123", "performance")).toBe(
      "business:session_123:performance",
    );
    expect(createBusinessOrderRequestKey("session with spaces", "performance")).toBeNull();
    expect(normalizeOrderRequestKey("business:session_123:performance")).toBe(
      "business:session_123:performance",
    );
  });

  it("requires explicit internal order identity", () => {
    expect(normalizeOrderId("ord_12345678")).toBe("ord_12345678");
    expect(normalizeOrderId("order_12345678")).toBeNull();
    expect(normalizeOrderId("ord_bad value")).toBeNull();
  });
});

describe("M136 pricing authority vocabulary", () => {
  it("captures a server-owned immutable price in minor units", () => {
    const value = quote();
    expect(value).toEqual({
      planId: "performance",
      planName: "Performance",
      amount: { minorUnits: 49_900, currency: "BRL" },
      pricingVersion: "plans_2026_08",
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.amount)).toBe(true);
  });

  it("rejects malformed plan, version and floating-point price inputs", () => {
    expect(
      createPricingQuote({
        planId: "bad plan",
        planName: "Bad",
        minorUnits: 100,
        currency: "BRL",
        pricingVersion: "v1",
      }),
    ).toBeNull();
    expect(
      createPricingQuote({
        planId: "performance",
        planName: "Performance",
        minorUnits: 10.5,
        currency: "BRL",
        pricingVersion: "plans_2026_08",
      }),
    ).toBeNull();
  });

  it("freezes the price at a specific UTC timestamp", () => {
    const value = snapshot();
    expect(value.capturedAt).toBe("2026-08-14T19:30:00Z");
    expect(Object.isFrozen(value)).toBe(true);
    expect(capturePricingSnapshot(quote(), "2026-08-14")).toBeNull();
  });
});

describe("M136 order lifecycle", () => {
  it("creates an immutable order without provider or payment implementation details", () => {
    const order = createOrder({
      id: orderId(),
      requestKey: requestKey(),
      source: source(),
      pricing: snapshot(),
      createdAt: "2026-08-14T19:31:00Z",
    });

    expect(order).toMatchObject({
      id: "ord_12345678",
      requestKey: "business:session_123:performance",
      status: "draft",
      source: {
        kind: "business_onboarding",
        reference: "demo_business_123",
      },
    });
    expect(order?.pricing.amount).toEqual({ minorUnits: 49_900, currency: "BRL" });
    expect(order).not.toHaveProperty("providerUrl");
    expect(order).not.toHaveProperty("providerToken");
    expect(Object.isFrozen(order)).toBe(true);
  });

  it("allows only explicit forward order transitions plus idempotent repeats", () => {
    expect(isOrderTransitionAllowed("draft", "pending_payment")).toBe(true);
    expect(isOrderTransitionAllowed("pending_payment", "payment_confirmed")).toBe(
      true,
    );
    expect(isOrderTransitionAllowed("payment_confirmed", "pending_payment")).toBe(
      false,
    );
    expect(isOrderTransitionAllowed("cancelled", "draft")).toBe(false);
    expect(isOrderTransitionAllowed("cancelled", "cancelled")).toBe(true);
    expect(() => assertOrderTransition("payment_confirmed", "cancelled")).toThrow(
      "ORDERING_INVALID_TRANSITION:payment_confirmed:cancelled",
    );
  });
});

describe("M136 Ordering ports", () => {
  it("keeps pricing and persistence behind explicit ports", async () => {
    const pricing: OrderPricingAuthorityPort = {
      resolvePlan: vi.fn(async () => quote()),
    };
    const stored = createOrder({
      id: orderId(),
      requestKey: requestKey(),
      source: source(),
      pricing: snapshot(),
      createdAt: "2026-08-14T19:31:00Z",
    });
    if (!stored) throw new Error("TEST_ORDER_INVALID");
    const repository: OrderRepositoryPort = {
      findById: vi.fn(async () => stored),
      findByRequestKey: vi.fn(async () => stored),
      save: vi.fn(async (order: Order) => order),
    };

    await expect(pricing.resolvePlan("performance")).resolves.toEqual(quote());
    await expect(repository.findByRequestKey(requestKey())).resolves.toBe(stored);
    await expect(repository.save(stored)).resolves.toBe(stored);
  });

  it("exposes a versioned OrderPlaced event without importing provider semantics", () => {
    const event: OrderPlacedEvent = Object.freeze({
      eventId: "oev_12345678",
      type: "OrderPlaced",
      version: 1,
      occurredAt: "2026-08-14T19:31:00Z",
      orderId: orderId(),
      requestKey: requestKey(),
      source: source(),
      total: snapshot().amount,
    });

    expect(event.type).toBe("OrderPlaced");
    expect(event.version).toBe(1);
    expect(event).not.toHaveProperty("paymentProvider");
  });
});
