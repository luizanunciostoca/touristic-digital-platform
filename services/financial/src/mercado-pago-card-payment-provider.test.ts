import { describe, expect, it, vi } from "vitest";

import {
  createCardPaymentIdempotencyKey,
  createCardPaymentProviderRequest,
} from "@touristic/financial/card-payment";
import { createMoney, normalizePaymentId } from "@touristic/financial";

import { MercadoPagoProviderError } from "./mercado-pago-provider.js";
import { createMercadoPagoCardPaymentProviderFromEnvironment } from "./mercado-pago-card-payment-provider.js";

const paymentId = normalizePaymentId("pay_card_provider_0001");
if (!paymentId) throw new Error("TEST_PAYMENT_ID_INVALID");
const idempotencyKey = createCardPaymentIdempotencyKey(paymentId);
if (!idempotencyKey) throw new Error("TEST_IDEMPOTENCY_KEY_INVALID");
const amount = createMoney(100, "BRL");
if (!amount) throw new Error("TEST_AMOUNT_INVALID");

const request = createCardPaymentProviderRequest({
  paymentId,
  idempotencyKey,
  amount,
  description: "Staging acceptance",
  token: "card-token-fixture_12345678",
  installments: 1,
  paymentMethodId: "visa",
  issuerId: "123",
  webhookUrl:
    "https://morro-digital-v2-staging.onrender.com/api/payments/v1/webhooks/sandbox",
  customer: { email: "buyer@example.com" },
  metadata: { orderId: "ord_card_provider_0001" },
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

describe("Mercado Pago direct card provider", () => {
  it("creates a TEST payment through the official payments endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 1234567890, status: "approved" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = createMercadoPagoCardPaymentProviderFromEnvironment(
      environment,
      { fetch: fetchMock as typeof fetch },
    );

    await expect(provider.createCardPayment(request)).resolves.toEqual({
      providerPaymentReference: "1234567890",
      status: "paid",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.mercadopago.com/v1/payments");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Idempotency-Key")).toBe(idempotencyKey);
    expect(headers.get("Idempotency-Key")).toBe(idempotencyKey);
    expect(headers.get("Authorization")).toBe(
      `Bearer ${environment.MERCADO_PAGO_ACCESS_TOKEN}`,
    );

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      transaction_amount: 1,
      token: request.token,
      installments: 1,
      payment_method_id: "visa",
      issuer_id: "123",
      external_reference: paymentId,
      notification_url: request.webhookUrl,
      payer: { email: "buyer@example.com" },
    });
    expect(body).not.toHaveProperty("currency_from_browser");
  });

  it.each([
    ["pending", "pending"],
    ["in_process", "pending"],
    ["rejected", "failed"],
    ["cancelled", "cancelled"],
    ["refunded", "refunded"],
  ] as const)("maps provider status %s to %s", async (providerStatus, expected) => {
    const provider = createMercadoPagoCardPaymentProviderFromEnvironment(
      environment,
      {
        fetch: (async () =>
          new Response(
            JSON.stringify({ id: "provider-payment-0001", status: providerStatus }),
            { status: 200 },
          )) as typeof fetch,
      },
    );

    await expect(provider.createCardPayment(request)).resolves.toEqual({
      providerPaymentReference: "provider-payment-0001",
      status: expected,
    });
  });

  it("fails closed in TEST mode without explicit TEST credential confirmation", async () => {
    const provider = createMercadoPagoCardPaymentProviderFromEnvironment(
      {
        ...environment,
        MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "false",
      },
      {
        fetch: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
      },
    );

    await expect(provider.createCardPayment(request)).rejects.toMatchObject<
      Partial<MercadoPagoProviderError>
    >({ code: "MERCADO_PAGO_TEST_ACCOUNT_REQUIRED" });
  });

  it("rejects non-BRL requests before the provider call", async () => {
    const usd = createMoney(100, "USD");
    if (!usd) throw new Error("TEST_USD_AMOUNT_INVALID");
    const usdRequest = createCardPaymentProviderRequest({ ...request, amount: usd });
    if (!usdRequest) throw new Error("TEST_USD_REQUEST_INVALID");
    const fetchMock = vi.fn();
    const provider = createMercadoPagoCardPaymentProviderFromEnvironment(
      environment,
      { fetch: fetchMock as unknown as typeof fetch },
    );

    await expect(provider.createCardPayment(usdRequest)).rejects.toMatchObject<
      Partial<MercadoPagoProviderError>
    >({ code: "MERCADO_PAGO_INVALID_REQUEST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
