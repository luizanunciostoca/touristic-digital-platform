import { describe, expect, it } from "vitest";

import { createMercadoPagoSubscriptionProviderFromEnvironment } from "./mercado-pago-subscription-provider.js";

const environment = Object.freeze({
  PAYMENTS_PROVIDER_MODE: "mercado_pago",
  PAYMENTS_PROVIDER_TIMEOUT_MS: "8000",
  PAYMENTS_PROVIDER_MAX_ATTEMPTS: "1",
  PAYMENTS_PROVIDER_RETRY_BASE_MS: "0",
  MERCADO_PAGO_CHECKOUT_MODE: "test",
  MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
  MERCADO_PAGO_ACCESS_TOKEN:
    "TEST_ACCESS_TOKEN_fixture_123456789012345678901234567890",
});

function normalizeRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requireStringBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") throw new Error("TEST_BODY_NOT_STRING");
  return init.body;
}

function providerPayload(status: string) {
  return {
    id: "preapproval_cancel_compat_0001",
    external_reference: "sub_cancel_compat_0001",
    status,
    payer_email: "buyer@example.com",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 129,
      currency_id: "BRL",
    },
  };
}

describe("Mercado Pago subscription cancel TEST compatibility", () => {
  it("retries once with cancelled only after the exact TEST provider spelling rejection", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({ url: normalizeRequestUrl(input), init });
      if (requests.length === 1) {
        return new Response(
          JSON.stringify({
            error: "Invalid_preapproval_status_param:_canceled",
            status: 400,
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (requests.length === 2) {
        return new Response(JSON.stringify({ status: "cancelled" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(providerPayload("cancelled")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      environment,
      { fetch: fetchMock },
    );

    await expect(
      provider.cancelSubscription("preapproval_cancel_compat_0001"),
    ).resolves.toMatchObject({ status: "cancelled" });

    expect(requests).toHaveLength(3);
    expect(requests.map((request) => request.init?.method)).toEqual([
      "PUT",
      "PUT",
      "GET",
    ]);
    expect(
      requests.every((request) =>
        request.url.endsWith("preapproval_cancel_compat_0001"),
      ),
    ).toBe(true);
    expect(
      JSON.parse(requireStringBody(requests[0]?.init)) as { status?: unknown },
    ).toMatchObject({ status: "canceled" });
    expect(
      JSON.parse(requireStringBody(requests[1]?.init)) as { status?: unknown },
    ).toMatchObject({ status: "cancelled" });
  });

  it("does not retry for unrelated provider rejections", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({ url: normalizeRequestUrl(input), init });
      return new Response(
        JSON.stringify({ error: "subscription_not_allowed", status: 400 }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      environment,
      { fetch: fetchMock },
    );

    await expect(
      provider.cancelSubscription("preapproval_cancel_compat_0001"),
    ).rejects.toMatchObject({ code: "MERCADO_PAGO_REJECTED" });
    expect(requests).toHaveLength(1);
  });

  it("never applies the TEST compatibility fallback in production mode", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({ url: normalizeRequestUrl(input), init });
      return new Response(
        JSON.stringify({
          error: "Invalid_preapproval_status_param:_canceled",
          status: 400,
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      { ...environment, MERCADO_PAGO_CHECKOUT_MODE: "production" },
      { fetch: fetchMock },
    );

    await expect(
      provider.cancelSubscription("preapproval_cancel_compat_0001"),
    ).rejects.toMatchObject({ code: "MERCADO_PAGO_REJECTED" });
    expect(requests).toHaveLength(1);
  });
});
