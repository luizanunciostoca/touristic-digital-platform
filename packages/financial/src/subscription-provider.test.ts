import { describe, expect, it } from "vitest";

import { createMoney } from "./index.js";
import {
  createSubscriptionProviderIdempotencyKey,
  normalizeProviderSubscriptionRequest,
  normalizeProviderSubscriptionSnapshot,
} from "./subscription-provider.js";

const amount = createMoney(12_900, "BRL");
if (!amount) throw new Error("TEST_AMOUNT_INVALID");

const subscriptionId = "sub_subscription_provider_0001";
const idempotencyKey = createSubscriptionProviderIdempotencyKey(subscriptionId);
if (!idempotencyKey) throw new Error("TEST_IDEMPOTENCY_KEY_INVALID");

describe("subscription provider contract", () => {
  it("normalizes a server-owned monthly recurring agreement", () => {
    expect(
      normalizeProviderSubscriptionRequest({
        subscriptionId,
        idempotencyKey,
        amount,
        frequency: 1,
        frequencyType: "months",
        reason: "Plano Growth",
        payerEmail: "BUYER@example.com",
        cardToken: "card_token_subscription_0001",
        backUrl: "https://morro.digital/checkout/return",
        metadata: {
          orderId: "ord_subscription_provider_0001",
          pricingVersion: "pricing_v1",
        },
      }),
    ).toEqual({
      subscriptionId,
      idempotencyKey,
      amount,
      frequency: 1,
      frequencyType: "months",
      reason: "Plano Growth",
      payerEmail: "buyer@example.com",
      cardToken: "card_token_subscription_0001",
      backUrl: "https://morro.digital/checkout/return",
      metadata: {
        orderId: "ord_subscription_provider_0001",
        pricingVersion: "pricing_v1",
      },
    });
  });

  it("rejects a forged idempotency key, non-monthly frequency and insecure back URL", () => {
    expect(
      normalizeProviderSubscriptionRequest({
        subscriptionId,
        idempotencyKey: "subscription:v1:sub_other_00000001",
        amount,
        frequency: 2,
        frequencyType: "months",
        reason: "Plano Growth",
        payerEmail: "buyer@example.com",
        cardToken: "card_token_subscription_0001",
        backUrl: "http://morro.digital/checkout/return",
      }),
    ).toBeNull();
  });

  it("normalizes authoritative provider readback", () => {
    expect(
      normalizeProviderSubscriptionSnapshot({
        providerSubscriptionReference: "preapproval_00000001",
        externalReference: subscriptionId,
        status: "authorized",
        amount,
        frequency: 1,
        frequencyType: "months",
        payerEmail: "buyer@example.com",
      }),
    ).toEqual({
      providerSubscriptionReference: "preapproval_00000001",
      externalReference: subscriptionId,
      status: "authorized",
      amount,
      frequency: 1,
      frequencyType: "months",
      payerEmail: "buyer@example.com",
    });
  });
});
