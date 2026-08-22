import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCheckoutProviderRequest,
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
} from "@touristic/financial";

import { createSandboxCheckoutProviderFromEnvironment } from "./index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Mercado Pago environment composition", () => {
  it("propagates the TEST credential confirmation from process.env to the adapter", async () => {
    vi.stubEnv(
      "MERCADO_PAGO_ACCESS_TOKEN",
      "fixture-token-not-a-real-credential-with-thirty-two-characters",
    );
    vi.stubEnv(
      "MERCADO_PAGO_CHECKOUT_ORIGINS",
      "https://www.mercadopago.com.br",
    );
    vi.stubEnv("MERCADO_PAGO_CHECKOUT_MODE", "test");
    vi.stubEnv("MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED", "true");

    const paymentId = normalizePaymentId("pay_env_bridge_0001");
    const idempotencyKey = createPaymentIdempotencyKey("ord_env_bridge_0001");
    const request = createCheckoutProviderRequest({
      paymentId,
      idempotencyKey,
      amount: createMoney(100, "BRL"),
      description: "Staging acceptance",
      returnUrl: "https://morro-digital-v2-staging.onrender.com/",
      webhookUrl:
        "https://morro-digital-v2-staging.onrender.com/api/payments/v1/webhooks/sandbox",
      customer: {
        name: "Morro Digital Test Buyer",
        email: "test@testuser.com",
        phone: "5500000000000",
        document: "00000000000",
      },
      metadata: { orderId: "ord_env_bridge_0001" },
    });
    if (!request) throw new Error("CHECKOUT_FIXTURE_INVALID");

    const calls: string[] = [];
    const provider = createSandboxCheckoutProviderFromEnvironment(
      { PAYMENTS_PROVIDER_MODE: "mercado_pago" },
      {
        fetch(input) {
          calls.push(
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          );
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: "pref-env-bridge-0001",
                init_point:
                  "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-env-bridge-0001",
              }),
              {
                status: 201,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        },
      },
    );

    await expect(provider.createCheckout(request)).resolves.toEqual({
      providerCheckoutId: "pref-env-bridge-0001",
      checkoutUrl:
        "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-env-bridge-0001",
      providerReference: null,
    });
    expect(calls).toEqual([
      "https://api.mercadopago.com/checkout/preferences",
    ]);
  });
});
