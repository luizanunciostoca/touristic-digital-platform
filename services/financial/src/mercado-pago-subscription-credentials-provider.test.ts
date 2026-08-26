import { describe, expect, it } from "vitest";

import { createMoney } from "@touristic/financial";
import {
  createSubscriptionProviderIdempotencyKey,
  normalizeProviderSubscriptionRequest,
} from "@touristic/financial/subscription-provider";

import { createMercadoPagoSubscriptionProviderFromEnvironment } from "./mercado-pago-subscription-credentials-provider.js";

const subscriptionId = "sub_credentials_isolation_0001";
const idempotencyKey = createSubscriptionProviderIdempotencyKey(subscriptionId);
const amount = createMoney(12_900, "BRL");
if (!idempotencyKey || !amount) throw new Error("TEST_FIXTURE_INVALID");
const request = normalizeProviderSubscriptionRequest({
  subscriptionId,
  idempotencyKey,
  amount,
  frequency: 1,
  frequencyType: "months",
  reason: "Plano Growth",
  payerEmail: "buyer@example.com",
  cardToken: "card_token_subscription_credentials_0001",
  backUrl: "https://morro.digital/checkout/return",
  metadata: {
    orderId: "ord_credentials_isolation_0001",
    pricingVersion: "pricing_v1",
  },
});
if (!request) throw new Error("TEST_REQUEST_INVALID");

const dedicatedToken =
  "TEST_SUBSCRIPTIONS_ACCESS_TOKEN_fixture_123456789012345678901234567890";
const bricksToken =
  "TEST_BRICKS_ACCESS_TOKEN_fixture_123456789012345678901234567890";

function providerPayload(
  options: Readonly<{
    includePayerEmail?: boolean;
    transactionAmount?: number | string;
  }> = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: "preapproval_credentials_0001",
    external_reference: subscriptionId,
    status: "authorized",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: options.transactionAmount ?? 129,
      currency_id: "BRL",
    },
  };
  if (options.includePayerEmail !== false) {
    payload.payer_email = "buyer@example.com";
  }
  return payload;
}

function baseEnvironment() {
  return {
    PAYMENTS_PROVIDER_MODE: "mercado_pago",
    PAYMENTS_PROVIDER_MAX_ATTEMPTS: "1",
    MERCADO_PAGO_CHECKOUT_MODE: "test",
    MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
    MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN: dedicatedToken,
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
  } as const;
}

function successfulProviderFetch(captured: {
  authorizationHeaders: string[];
  scopeHeaders: string[];
}): typeof fetch {
  let call = 0;
  return async (_input, init) => {
    call += 1;
    const headers = new Headers(init?.headers);
    captured.authorizationHeaders.push(headers.get("Authorization") ?? "");
    captured.scopeHeaders.push(headers.get("X-scope") ?? "");
    if (call === 1) {
      return new Response(
        JSON.stringify({ id: "preapproval_credentials_0001" }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify(providerPayload()), { status: 200 });
  };
}

describe("Mercado Pago subscription credential isolation", () => {
  it("fails closed in V2 staging when the dedicated subscription token is absent", () => {
    expect(() =>
      createMercadoPagoSubscriptionProviderFromEnvironment({
        PAYMENTS_PROVIDER_MODE: "mercado_pago",
        MERCADO_PAGO_CHECKOUT_MODE: "test",
        MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
        MERCADO_PAGO_ACCESS_TOKEN: bricksToken,
        RENDER_SERVICE_NAME: "morro-digital-v2-staging",
      }),
    ).toThrow("MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN is required");
  });

  it("uses the dedicated token and keeps X-scope stage by default", async () => {
    const captured = { authorizationHeaders: [], scopeHeaders: [] } as {
      authorizationHeaders: string[];
      scopeHeaders: string[];
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      {
        ...baseEnvironment(),
        MERCADO_PAGO_ACCESS_TOKEN: bricksToken,
      },
      { fetch: successfulProviderFetch(captured) },
    );

    await expect(provider.createSubscription(request)).resolves.toMatchObject({
      providerSubscriptionReference: "preapproval_credentials_0001",
      status: "authorized",
    });
    expect(captured.authorizationHeaders).toEqual([
      `Bearer ${dedicatedToken}`,
      `Bearer ${dedicatedToken}`,
    ]);
    expect(captured.scopeHeaders).toEqual(["stage", "stage"]);
    expect(
      captured.authorizationHeaders.some((value) =>
        value.includes(bricksToken),
      ),
    ).toBe(false);
  });

  it("can omit X-scope only during explicit V2 TEST provider acceptance", async () => {
    const captured = { authorizationHeaders: [], scopeHeaders: [] } as {
      authorizationHeaders: string[];
      scopeHeaders: string[];
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      {
        ...baseEnvironment(),
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN: "true",
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER: "omit",
      },
      { fetch: successfulProviderFetch(captured) },
    );

    await expect(provider.createSubscription(request)).resolves.toMatchObject({
      providerSubscriptionReference: "preapproval_credentials_0001",
      status: "authorized",
    });
    expect(captured.authorizationHeaders).toEqual([
      `Bearer ${dedicatedToken}`,
      `Bearer ${dedicatedToken}`,
    ]);
    expect(captured.scopeHeaders).toEqual(["", ""]);
  });

  it("normalizes the documented preapproval shape without weakening readback", async () => {
    let call = 0;
    const fetchMock: typeof fetch = async () => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            id: "preapproval_credentials_0001",
            external_reference: subscriptionId,
            status: "authorized",
            auto_recurring: {
              frequency: 1,
              frequency_type: "months",
              transaction_amount: "129.00",
              currency_id: "BRL",
            },
          }),
          { status: 201 },
        );
      }
      return new Response(
        JSON.stringify(
          providerPayload({
            includePayerEmail: false,
            transactionAmount: "129.00",
          }),
        ),
        { status: 200 },
      );
    };
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      baseEnvironment(),
      { fetch: fetchMock },
    );

    await expect(provider.createSubscription(request)).resolves.toEqual({
      providerSubscriptionReference: "preapproval_credentials_0001",
      externalReference: subscriptionId,
      status: "authorized",
      amount,
      frequency: 1,
      frequencyType: "months",
      payerEmail: "buyer@example.com",
    });
    expect(call).toBe(2);
  });

  it("resolves an omitted payer email from the persisted binding context", async () => {
    const resolvedReferences: string[] = [];
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify(
          providerPayload({
            includePayerEmail: false,
            transactionAmount: "129.00",
          }),
        ),
        { status: 200 },
      );
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      baseEnvironment(),
      {
        fetch: fetchMock,
        resolvePayerEmail(externalReference) {
          resolvedReferences.push(externalReference);
          return externalReference === subscriptionId
            ? "buyer@example.com"
            : null;
        },
      },
    );

    await expect(
      provider.readSubscription("preapproval_credentials_0001"),
    ).resolves.toEqual({
      providerSubscriptionReference: "preapproval_credentials_0001",
      externalReference: subscriptionId,
      status: "authorized",
      amount,
      frequency: 1,
      frequencyType: "months",
      payerEmail: "buyer@example.com",
    });
    expect(resolvedReferences).toEqual([subscriptionId]);
  });

  it("does not coerce a non-decimal provider amount", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify(
          providerPayload({
            transactionAmount: "1.29e2",
          }),
        ),
        { status: 200 },
      );
    const provider = createMercadoPagoSubscriptionProviderFromEnvironment(
      baseEnvironment(),
      { fetch: fetchMock },
    );

    await expect(
      provider.readSubscription("preapproval_credentials_0001"),
    ).rejects.toMatchObject({ code: "MERCADO_PAGO_INVALID_RESPONSE" });
  });

  it("denies scope omission outside the controlled V2 TEST acceptance window", () => {
    expect(() =>
      createMercadoPagoSubscriptionProviderFromEnvironment({
        ...baseEnvironment(),
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER: "omit",
      }),
    ).toThrow("STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER_OMIT_DENIED");

    expect(() =>
      createMercadoPagoSubscriptionProviderFromEnvironment({
        ...baseEnvironment(),
        MERCADO_PAGO_CHECKOUT_MODE: "production",
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN: "true",
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER: "omit",
      }),
    ).toThrow("STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER_OMIT_DENIED");
  });
});
