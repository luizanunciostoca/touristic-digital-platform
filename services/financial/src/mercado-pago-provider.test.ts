import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createCheckoutProviderRequest,
  createMoney,
  createPaymentIdempotencyKey,
  createRefundIdempotencyKey,
  createRefundProviderCommand,
  normalizePaymentId,
  normalizeRefundRequestId,
  type CheckoutProviderRequest,
  type RefundProviderCommand,
} from "@touristic/financial";

import {
  MercadoPagoProviderError,
  createMercadoPagoCheckoutProviderFromEnvironment,
  createMercadoPagoReconciliationProviderFromEnvironment,
  createMercadoPagoRefundProviderFromEnvironment,
  createMercadoPagoWebhookVerifierFromEnvironment,
} from "./mercado-pago-provider.js";
import { createMercadoPagoAuthenticatingWebhookVerifierFromEnvironment } from "./mercado-pago-webhook-authenticator.js";

function environment() {
  return {
    NODE_ENV: "production",
    PAYMENTS_PROVIDER_MODE: "mercado_pago",
    PAYMENTS_PROVIDER_TIMEOUT_MS: "2000",
    PAYMENTS_PROVIDER_MAX_ATTEMPTS: "1",
    PAYMENTS_PROVIDER_RETRY_BASE_MS: "0",
    PAYMENTS_WEBHOOK_TOLERANCE_SECONDS: "300",
    MERCADO_PAGO_ACCESS_TOKEN:
      "fixture-token-not-a-real-credential-with-thirty-two-characters",
    MERCADO_PAGO_WEBHOOK_SECRET:
      "fixture-webhook-secret-not-a-real-credential-value",
    MERCADO_PAGO_CHECKOUT_ORIGINS: "https://checkout.mercadopago.example",
    MERCADO_PAGO_CHECKOUT_MODE: "test",
    MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
  };
}

function checkoutRequest(): CheckoutProviderRequest {
  const paymentId = normalizePaymentId("pay_mercado_pago_0001");
  const idempotencyKey = createPaymentIdempotencyKey("ord_mercado_pago_0001");
  const amount = createMoney(49_900, "BRL");
  const request = createCheckoutProviderRequest({
    paymentId,
    idempotencyKey,
    amount,
    description: "Plano Crescimento",
    returnUrl: "https://morro.digital/checkout/return",
    webhookUrl: "https://v2.morro.digital/api/payments/v1/webhooks/sandbox",
    customer: {
      name: "Cliente Mercado Pago",
      email: "cliente@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    metadata: { orderId: "ord_mercado_pago_0001" },
  });
  if (!request) throw new Error("CHECKOUT_FIXTURE_INVALID");
  return request;
}

function refundRequest(): RefundProviderCommand {
  const paymentId = normalizePaymentId("pay_mercado_pago_refund_0001");
  const refundRequestId = normalizeRefundRequestId(
    "rfd_mercado_pago_refund_0001",
  );
  const idempotencyKey = createRefundIdempotencyKey(paymentId);
  const amount = createMoney(49_900, "BRL");
  const request = createRefundProviderCommand({
    refundRequestId,
    paymentId,
    idempotencyKey,
    amount,
    providerPaymentReference: "123456789",
    reason: "requested_by_business",
  });
  if (!request) throw new Error("REFUND_FIXTURE_INVALID");
  return request;
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Mercado Pago payment provider adapter", () => {
  it("creates Checkout Pro preference with explicitly confirmed automatic TEST credentials", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const provider = createMercadoPagoCheckoutProviderFromEnvironment(
      environment(),
      {
        fetch(input, init) {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          calls.push({ url, init });
          return Promise.resolve(
            response({
              id: "pref-mercado-pago-0001",
              init_point: "https://checkout.mercadopago.example/prod/pref-0001",
              sandbox_init_point:
                "https://checkout.mercadopago.example/legacy/pref-0001",
            }),
          );
        },
      },
    );

    await expect(provider.createCheckout(checkoutRequest())).resolves.toEqual({
      providerCheckoutId: "pref-mercado-pago-0001",
      checkoutUrl: "https://checkout.mercadopago.example/prod/pref-0001",
      providerReference: null,
    });
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.mercadopago.com/checkout/preferences",
    ]);
    const preferenceInit = calls[0]?.init;
    const headers = new Headers(preferenceInit?.headers);
    expect(headers.get("Authorization")).toBe(
      "Bearer fixture-token-not-a-real-credential-with-thirty-two-characters",
    );
    expect(headers.get("X-Idempotency-Key")).toBe(
      "payment:v1:ord_mercado_pago_0001",
    );
    if (typeof preferenceInit?.body !== "string") {
      throw new Error("CAPTURED_BODY_INVALID");
    }
    expect(JSON.parse(preferenceInit.body)).toMatchObject({
      items: [
        {
          id: "pay_mercado_pago_0001",
          currency_id: "BRL",
          quantity: 1,
          unit_price: 499,
        },
      ],
      external_reference: "pay_mercado_pago_0001",
      notification_url:
        "https://v2.morro.digital/api/payments/v1/webhooks/sandbox",
      auto_return: "approved",
    });
  });

  it("fails closed before preference creation when TEST credentials are not explicitly confirmed", async () => {
    let calls = 0;
    const provider = createMercadoPagoCheckoutProviderFromEnvironment(
      {
        ...environment(),
        MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "false",
      },
      {
        fetch: () => {
          calls += 1;
          return Promise.resolve(response({}));
        },
      },
    );

    await expect(provider.createCheckout(checkoutRequest())).rejects.toEqual(
      new MercadoPagoProviderError("MERCADO_PAGO_TEST_ACCOUNT_REQUIRED"),
    );
    expect(calls).toBe(0);
  });

  it("fails closed on unsafe checkout origin and missing credentials", async () => {
    const unsafe = createMercadoPagoCheckoutProviderFromEnvironment(
      environment(),
      {
        fetch() {
          return Promise.resolve(
            response({
              id: "pref-mercado-pago-0001",
              init_point: "https://evil.example/pref-0001",
            }),
          );
        },
      },
    );
    await expect(unsafe.createCheckout(checkoutRequest())).rejects.toEqual(
      new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE"),
    );

    expect(() =>
      createMercadoPagoCheckoutProviderFromEnvironment({
        ...environment(),
        MERCADO_PAGO_ACCESS_TOKEN: "short",
      }),
    ).toThrow("MERCADO_PAGO_ACCESS_TOKEN is required");
  });

  it("uses Mercado Pago refund endpoint with durable idempotency", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const provider = createMercadoPagoRefundProviderFromEnvironment(
      environment(),
      {
        fetch(input, init) {
          capturedUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          capturedInit = init;
          return Promise.resolve(
            response({ id: 987654321, status: "approved" }),
          );
        },
      },
    );

    await expect(provider.requestRefund(refundRequest())).resolves.toEqual({
      accepted: true,
      providerRefundReference: "987654321",
    });
    expect(capturedUrl).toBe(
      "https://api.mercadopago.com/v1/payments/123456789/refunds",
    );
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("X-Idempotency-Key")).toBe(
      "refund:v1:pay_mercado_pago_refund_0001",
    );
    expect(headers.get("Idempotency-Key")).toBeNull();
    if (typeof capturedInit?.body !== "string") {
      throw new Error("CAPTURED_REFUND_BODY_INVALID");
    }
    expect(JSON.parse(capturedInit.body)).toEqual({ amount: 499 });
  });

  it("reconciles payment readback and rejects external-reference substitution", async () => {
    const paymentId = normalizePaymentId("pay_mercado_pago_reconcile_0001");
    if (!paymentId) throw new Error("PAYMENT_FIXTURE_INVALID");
    const provider = createMercadoPagoReconciliationProviderFromEnvironment(
      environment(),
      {
        fetch: () =>
          Promise.resolve(
            response({
              id: 123456789,
              status: "approved",
              external_reference: paymentId,
              currency_id: "BRL",
              transaction_amount: 499,
              date_last_updated: "2026-08-17T23:00:00Z",
            }),
          ),
      },
    );

    await expect(
      provider.readPayment({
        paymentId,
        providerPaymentReference: "123456789",
      }),
    ).resolves.toEqual({
      paymentId,
      providerPaymentReference: "123456789",
      status: "paid",
      amount: { minorUnits: 49_900, currency: "BRL" },
      observedAt: "2026-08-17T23:00:00.000Z",
    });

    const substituted = createMercadoPagoReconciliationProviderFromEnvironment(
      environment(),
      {
        fetch: () =>
          Promise.resolve(
            response({
              id: 123456789,
              status: "approved",
              external_reference: "pay_mercado_pago_other_0001",
              currency_id: "BRL",
              transaction_amount: 499,
              date_last_updated: "2026-08-17T23:00:00Z",
            }),
          ),
      },
    );
    await expect(
      substituted.readPayment({
        paymentId,
        providerPaymentReference: "123456789",
      }),
    ).rejects.toEqual(
      new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE"),
    );
  });

  it("authenticates signed query identity and only promotes terminal provider state", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({ action: "payment.updated", data: { id: "123456789" } }),
    );
    const timestamp = "1787018400";
    const requestId = "request-mercado-pago-0001";
    const dataId = "123456789";
    const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
    const digest = createHmac(
      "sha256",
      environment().MERCADO_PAGO_WEBHOOK_SECRET,
    )
      .update(manifest)
      .digest("hex");
    const signatureEnvelope = JSON.stringify({
      signature: `ts=${timestamp},v1=${digest}`,
      requestId,
      dataId,
    });
    const now = () => 1_787_018_400_000;

    const pendingFetch: typeof fetch = () =>
      Promise.resolve(
        response({
          id: 123456789,
          status: "pending",
          external_reference: "pay_mercado_pago_0001",
          date_last_updated: "2026-08-17T23:00:00Z",
        }),
      );
    const authenticating =
      createMercadoPagoAuthenticatingWebhookVerifierFromEnvironment(
        environment(),
        { fetch: pendingFetch, now },
      );
    await expect(
      authenticating.verifyAuthenticity(rawBody, signatureEnvelope),
    ).resolves.toBe(true);
    await expect(
      authenticating.verify(rawBody, signatureEnvelope),
    ).resolves.toBeNull();

    const substitutedQuery = JSON.stringify({
      signature: `ts=${timestamp},v1=${digest}`,
      requestId,
      dataId: "987654321",
    });
    await expect(
      authenticating.verifyAuthenticity(rawBody, substitutedQuery),
    ).resolves.toBe(false);
    await expect(
      authenticating.verify(rawBody, substitutedQuery),
    ).resolves.toBeNull();

    const terminal = createMercadoPagoWebhookVerifierFromEnvironment(
      environment(),
      {
        now,
        fetch: () =>
          Promise.resolve(
            response({
              id: 123456789,
              status: "approved",
              external_reference: "pay_mercado_pago_0001",
              transaction_amount: 499,
              currency_id: "BRL",
              date_last_updated: "2026-08-17T23:00:00Z",
            }),
          ),
      },
    );
    await expect(
      terminal.verify(rawBody, signatureEnvelope),
    ).resolves.toMatchObject({
      externalReference: "pay_mercado_pago_0001",
      providerPaymentReference: "123456789",
      amountMinorUnits: 49_900,
      currency: "BRL",
      status: "paid",
      occurredAt: "2026-08-17T23:00:00.000Z",
    });
  });
});
