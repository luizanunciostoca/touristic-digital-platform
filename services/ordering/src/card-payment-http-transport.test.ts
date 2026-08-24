import { describe, expect, it, vi } from "vitest";

import {
  createPendingPayment,
  normalizePaymentId,
  type Payment,
} from "@touristic/financial";
import type { CardPaymentProviderRequest } from "@touristic/financial/card-payment";
import {
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  normalizeOrderSourceReference,
} from "@touristic/ordering";

import { createCheckoutAccessRecord } from "./checkout-access.js";
import { CardPaymentHttpTransport } from "./card-payment-http-transport.js";
import { createCheckoutStatusCapability } from "./checkout-security.js";

const createdAt = "2026-08-23T22:00:00.000Z";
const orderId = normalizeOrderId("ord_card_http_0001");
const paymentId = normalizePaymentId("pay_card_http_0001");
const requestKey = createBusinessOrderRequestKey("session_card_http_0001", "growth");
const source = normalizeOrderSourceReference(
  "session_card_http_0001",
  "business_onboarding",
);
const quote = createPricingQuote({
  planId: "growth",
  planName: "Plano Growth",
  minorUnits: 12_900,
  currency: "BRL",
  pricingVersion: "pricing_v1",
});
if (!orderId || !paymentId || !requestKey || !source || !quote) {
  throw new Error("TEST_FIXTURE_INVALID");
}
const pricing = capturePricingSnapshot(quote, createdAt);
if (!pricing) throw new Error("TEST_PRICING_INVALID");
const order = createOrder({
  id: orderId,
  requestKey,
  source,
  status: "pending_payment",
  pricing,
  createdAt,
});
const initialPayment = createPendingPayment({
  id: paymentId,
  orderReference: orderId,
  amount: quote.amount,
  createdAt,
});
if (!order || !initialPayment) throw new Error("TEST_DOMAIN_FIXTURE_INVALID");

const capabilities = createCheckoutStatusCapability(
  "test-status-secret-123456789012345678901234567890",
);
const issued = capabilities.issue(orderId);
const access = createCheckoutAccessRecord({
  orderId,
  paymentId,
  requestFingerprint: "a".repeat(64),
  tokenHash: issued.tokenHash,
  context: {
    requesterKind: "authenticated",
    actorSubject: "user:test",
    destinationId: "morro",
    tenantId: null,
  },
  correlationId: "corr_card_http_0001",
  createdAt,
  expiresAt: "2026-08-24T22:00:00.000Z",
});
if (!access) throw new Error("TEST_ACCESS_INVALID");

function createFixture(paymentInput: Payment = initialPayment) {
  let payment = paymentInput;
  let providerRequest: CardPaymentProviderRequest | null = null;
  const providerCall = vi.fn(async (input: CardPaymentProviderRequest) => {
    providerRequest = input;
    return {
      providerPaymentReference: "provider_payment_0001",
      status: "paid" as const,
    };
  });
  const auditEvents: unknown[] = [];
  const transport = new CardPaymentHttpTransport({
    orders: {
      findById: async () => order,
      findByRequestKey: async () => order,
      save: async (value) => value,
    },
    payments: {
      findById: async () => payment,
      save: async (value) => {
        payment = value;
        return value;
      },
    },
    access: {
      findByOrderId: async () => access,
      claim: async (value) => value,
    },
    statusCapabilities: capabilities,
    rateLimits: {
      consume: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    },
    provider: { createCardPayment: providerCall },
    audit: {
      record: async (event) => {
        auditEvents.push(event);
      },
    },
    clock: { now: () => "2026-08-23T22:00:01.000Z" },
    webhookUrl: "https://morro.digital/api/payments/v1/webhooks/sandbox",
  });
  return {
    transport,
    providerCall,
    auditEvents,
    getPayment: () => payment,
    getProviderRequest: () => providerRequest,
  };
}

function request(token = issued.token) {
  return {
    method: "POST",
    pathname: `/api/payments/v1/checkouts/${orderId}/card`,
    correlationId: "corr_card_submit_0001",
    clientIp: "127.0.0.1",
    headers: { "x-checkout-token": token },
    body: {
      token: "card_token_browser_0001",
      installments: 3,
      payment_method_id: "visa",
      issuer_id: "123",
      payer: { email: "buyer@example.com" },
      transaction_amount: 0.01,
      currency_id: "USD",
      amount: 1,
      currency: "USD",
    },
  } as const;
}

describe("CardPaymentHttpTransport", () => {
  it("uses server monetary authority and persists provider reference before accepting submission", async () => {
    const fixture = createFixture();

    const result = await fixture.transport.handle(request());

    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({
      data: {
        checkoutId: orderId,
        paymentId,
        status: "PENDING",
        submitted: true,
        replayed: false,
      },
    });
    expect(fixture.providerCall).toHaveBeenCalledTimes(1);
    expect(fixture.getProviderRequest()).toMatchObject({
      paymentId,
      amount: { minorUnits: 12_900, currency: "BRL" },
      installments: 3,
      paymentMethodId: "visa",
      issuerId: "123",
      customer: { email: "buyer@example.com" },
    });
    expect(fixture.getPayment().providerReference).toBe(
      "provider_payment_0001",
    );
  });

  it("rejects an invalid checkout capability before the provider call", async () => {
    const fixture = createFixture();

    const result = await fixture.transport.handle(request("invalid-token"));

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "CHECKOUT_NOT_FOUND" });
    expect(fixture.providerCall).not.toHaveBeenCalled();
  });

  it("replays an already persisted provider binding without reusing the card token", async () => {
    const existing = Object.freeze({
      ...initialPayment,
      providerReference: "provider_payment_0001",
      updatedAt: "2026-08-23T22:00:01.000Z",
    });
    const fixture = createFixture(existing);

    const result = await fixture.transport.handle(request());

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: { replayed: true } });
    expect(fixture.providerCall).not.toHaveBeenCalled();
  });
});
