import { describe, expect, it, vi } from "vitest";

import { createMoney } from "@touristic/financial";
import {
  createSubscriptionProviderIdempotencyKey,
  normalizeProviderSubscriptionRequest,
} from "@touristic/financial/subscription-provider";

import { createMercadoPagoSubscriptionProviderFromEnvironment } from "./mercado-pago-subscription-provider.js";

const subscriptionId = "sub_mercado_pago_0001";
const idempotencyKey = createSubscriptionProviderIdempotencyKey(subscriptionId);
if (!idempotencyKey) throw new Error("TEST_IDEMPOTENCY_KEY_INVALID");
const amount = createMoney(12_900, "BRL");
if (!amount) throw new Error("TEST_AMOUNT_INVALID");
const request = normalizeProviderSubscriptionRequest({
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
if (!request) throw new Error("TEST_REQUEST_INVALID");

const environment = Object.freeze({
  PAYMENTS_PROVIDER_MODE: "mercado_pago",
  PAYMENTS_PROVIDER_TIMEOUT_MS: "8000",
  PAYMENTS_PROVIDER_MAX_ATTEMPTS: "2",
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

function providerPayload(status: string, externalReference = subscriptionId) {
  return {
    id: "preapproval_00000001",
    external_reference: externalReference,
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

describe("Mercado Pago subscription provider", () => {
  it("creates an authorized recurring agreement and requires authoritative readback", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = normalizeRequestUrl(input);
      requests.push({ url, init });
      if (requests.length === 1) {
        return new Response(
          JSON.stringify({ id: "preapproval_00000001", status: "authorized" }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify(providerPayload("authorized")), {
        status: 200,
      });
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      environment,
      { fetch: fetchMock },
    );

    await expect(provider.createSubscription(request)).resolves.toEqual({
      providerSubscriptionReference: "preapproval_00000001",
      externalReference: subscriptionId,
      status: "authorized",
      amount,
      frequency: 1,
      frequencyType: "months",
      payerEmail: "buyer@example.com",
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe("https://api.mercadopago.com/preapproval");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[1]?.url).toBe(
      "https://api.mercadopago.com/preapproval/preapproval_00000001",
    );
    expect(requests[1]?.init?.method).toBe("GET");

    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("Idempotency-Key")).toBeNull();
    expect(headers.get("X-Idempotency-Key")).toBe(idempotencyKey);
    expect(headers.get("X-scope")).toBe("stage");
    const body = JSON.parse(requireStringBody(requests[0]?.init)) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      reason: "Plano Growth",
      external_reference: subscriptionId,
      payer_email: "buyer@example.com",
      card_token_id: "card_token_subscription_0001",
      status: "authorized",
      back_url: "https://morro.digital/checkout/return",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 129,
        currency_id: "BRL",
      },
    });
    expect(body).not.toHaveProperty("amount_from_browser");
  });

  it("never sends the staging scope in production mode", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({ url: normalizeRequestUrl(input), init });
      if (requests.length === 1) {
        return new Response(
          JSON.stringify({ id: "preapproval_00000001", status: "authorized" }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify(providerPayload("authorized")), {
        status: 200,
      });
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      {
        ...environment,
        MERCADO_PAGO_CHECKOUT_MODE: "production",
      },
      { fetch: fetchMock },
    );

    await expect(provider.createSubscription(request)).resolves.toMatchObject({
      status: "authorized",
    });
    expect(requests).toHaveLength(2);
    expect(new Headers(requests[0]?.init?.headers).get("X-scope")).toBeNull();
    expect(new Headers(requests[1]?.init?.headers).get("X-scope")).toBeNull();
  });

  it.each([
    ["pauseSubscription", "paused", "paused"],
    ["resumeSubscription", "authorized", "authorized"],
    ["cancelSubscription", "canceled", "cancelled"],
  ] as const)(
    "%s writes the provider state then verifies it by GET",
    async (operation, writtenStatus, readStatus) => {
      const requests: Array<{ url: string; init: RequestInit | undefined }> =
        [];
      const fetchMock: typeof fetch = async (input, init) => {
        requests.push({ url: normalizeRequestUrl(input), init });
        if (init?.method === "PUT") {
          return new Response(JSON.stringify({ status: writtenStatus }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify(providerPayload(readStatus)), {
          status: 200,
        });
      };
      const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
        environment,
        { fetch: fetchMock },
      );

      await expect(
        provider[operation]("preapproval_00000001"),
      ).resolves.toMatchObject({ status: readStatus });
      expect(requests.map((item) => item.init?.method)).toEqual(["PUT", "GET"]);
      const updateBody = JSON.parse(requireStringBody(requests[0]?.init)) as {
        status?: unknown;
      };
      expect(updateBody.status).toBe(writtenStatus);
    },
  );

  it("fails closed when create readback does not match the local subscription", async () => {
    let call = 0;
    const fetchMock: typeof fetch = async () => {
      call += 1;
      return call === 1
        ? new Response(JSON.stringify({ id: "preapproval_00000001" }), {
            status: 201,
          })
        : new Response(
            JSON.stringify(providerPayload("authorized", "sub_other_00000001")),
            { status: 200 },
          );
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      environment,
      { fetch: fetchMock },
    );

    await expect(provider.createSubscription(request)).rejects.toMatchObject({
      code: "MERCADO_PAGO_INVALID_RESPONSE",
    });
  });

  it("logs only sanitized provider metadata for a permanent rejection", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      const fetchMock: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            error: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES",
            status: 403,
            cause: [{ code: "subscription_not_allowed" }],
            message: "sensitive provider explanation must not be logged",
          }),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
              "x-request-id": "provider-request-403",
            },
          },
        );
      const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
        environment,
        { fetch: fetchMock },
      );

      await expect(provider.createSubscription(request)).rejects.toMatchObject({
        code: "MERCADO_PAGO_REJECTED",
      });

      const diagnostics = warning.mock.calls.flat().join("\n");
      expect(diagnostics).toContain('"httpStatus":403');
      expect(diagnostics).toContain(
        '"providerErrorCode":"PA_UNAUTHORIZED_RESULT_FROM_POLICIES"',
      );
      expect(diagnostics).toContain(
        '"providerCauseCodes":["subscription_not_allowed"]',
      );
      expect(diagnostics).toContain('"credentialClass":"OTHER"');
      expect(diagnostics).not.toContain("sensitive provider explanation");
    } finally {
      warning.mockRestore();
    }
  });

  it("fails closed in TEST mode without explicit credential confirmation", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(JSON.stringify(providerPayload("authorized")), {
        status: 200,
      });
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      {
        ...environment,
        MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "false",
      },
      { fetch: fetchMock },
    );

    await expect(provider.createSubscription(request)).rejects.toMatchObject({
      code: "MERCADO_PAGO_TEST_ACCOUNT_REQUIRED",
    });
  });
});
