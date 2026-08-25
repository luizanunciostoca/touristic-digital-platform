import { describe, expect, it, vi } from "vitest";

import { createMoney } from "@touristic/financial";
import {
  createSubscriptionProviderIdempotencyKey,
  normalizeProviderSubscriptionRequest,
} from "@touristic/financial/subscription-provider";

import { createMercadoPagoSubscriptionProviderFromEnvironment } from "./mercado-pago-subscription-provider.js";
import {
  executeBoundedProviderRequest,
  ProviderRequestUnavailableError,
} from "./provider-retry.js";

describe("safe transient provider response metadata", () => {
  it("preserves only allowlisted bounded metadata on the final transient response", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response("sensitive response body", {
        status: 503,
        headers: {
          "x-request-id": "mp-request-safe-503",
          "retry-after": "2",
          "content-type": "application/json",
          "x-provider-secret": "must-never-be-captured",
        },
      });

    let captured: unknown;
    try {
      await executeBoundedProviderRequest({
        fetch: fetchMock,
        url: new URL("https://api.mercadopago.com/preapproval"),
        init: {
          method: "POST",
          headers: { "Idempotency-Key": "safe-idempotency-key" },
        },
        timeoutMs: 8000,
        policy: { maxAttempts: 1, baseDelayMs: 0 },
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(ProviderRequestUnavailableError);
    expect(captured).toMatchObject({
      message: "PROVIDER_REQUEST_UNAVAILABLE",
      httpStatus: 503,
      providerRequestId: "mp-request-safe-503",
      retryAfter: "2",
      contentType: "application/json",
    });
    expect(captured).not.toHaveProperty("body");
    expect(captured).not.toHaveProperty("x-provider-secret");
  });

  it("emits allowlisted metadata without logging body or arbitrary headers", async () => {
    const amount = createMoney(12_900, "BRL");
    if (!amount) throw new Error("TEST_AMOUNT_INVALID");
    const subscriptionId = "sub_metadata_0001";
    const idempotencyKey =
      createSubscriptionProviderIdempotencyKey(subscriptionId);
    if (!idempotencyKey) throw new Error("TEST_IDEMPOTENCY_KEY_INVALID");
    const request = normalizeProviderSubscriptionRequest({
      subscriptionId,
      idempotencyKey,
      amount,
      frequency: 1,
      frequencyType: "months",
      reason: "Plano Growth",
      payerEmail: "buyer@example.com",
      cardToken: "card_token_metadata_0001",
      backUrl: "https://morro.digital/checkout/return",
      metadata: {
        orderId: "ord_metadata_0001",
        pricingVersion: "pricing_v1",
      },
    });
    if (!request) throw new Error("TEST_REQUEST_INVALID");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
        {
          PAYMENTS_PROVIDER_MODE: "mercado_pago",
          PAYMENTS_PROVIDER_TIMEOUT_MS: "8000",
          PAYMENTS_PROVIDER_MAX_ATTEMPTS: "1",
          PAYMENTS_PROVIDER_RETRY_BASE_MS: "0",
          MERCADO_PAGO_CHECKOUT_MODE: "test",
          MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
          MERCADO_PAGO_ACCESS_TOKEN:
            "TEST_ACCESS_TOKEN_fixture_123456789012345678901234567890",
        },
        {
          fetch: async () =>
            new Response("sensitive provider body must not be logged", {
              status: 503,
              headers: {
                "x-request-id": "mp-subscription-request-503",
                "retry-after": "3",
                "content-type": "application/json",
                "x-provider-secret": "must-never-be-logged",
              },
            }),
        },
      );

      await expect(provider.createSubscription(request)).rejects.toMatchObject({
        code: "MERCADO_PAGO_UNAVAILABLE",
      });

      const messages = warn.mock.calls.flat().map(String).join("\n");
      expect(messages).toContain('"reason":"PROVIDER_REQUEST_UNAVAILABLE"');
      expect(messages).toContain('"httpStatus":503');
      expect(messages).toContain(
        '"providerRequestId":"mp-subscription-request-503"',
      );
      expect(messages).toContain('"retryAfter":"3"');
      expect(messages).toContain('"contentType":"application/json"');
      expect(messages).not.toContain("sensitive provider body");
      expect(messages).not.toContain("must-never-be-logged");
    } finally {
      warn.mockRestore();
    }
  });
});
