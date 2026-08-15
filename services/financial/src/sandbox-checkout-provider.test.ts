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
  SandboxCheckoutProviderError,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxReconciliationProviderFromEnvironment,
  createSandboxRefundProviderFromEnvironment,
} from "./sandbox-checkout-provider.js";

function environment() {
  return {
    NODE_ENV: "production",
    PAYMENTS_PROVIDER_MODE: "sandbox",
    PAYMENTS_SANDBOX_PROVIDER_BASE_URL: "https://api.sandbox-payments.example/",
    PAYMENTS_SANDBOX_PROVIDER_API_TOKEN:
      "sandbox-token-with-at-least-thirty-two-characters",
    PAYMENTS_SANDBOX_CHECKOUT_ORIGINS:
      "https://checkout.sandbox-payments.example",
    PAYMENTS_PROVIDER_TIMEOUT_MS: "2000",
  };
}

function request(): CheckoutProviderRequest {
  const paymentId = normalizePaymentId("pay_sandbox_adapter_0001");
  const idempotencyKey = createPaymentIdempotencyKey(
    "ord_sandbox_adapter_0001",
  );
  const amount = createMoney(49_900, "BRL");
  const result = createCheckoutProviderRequest({
    paymentId,
    idempotencyKey,
    amount,
    description: "Plano Crescimento",
    returnUrl: "https://morro.digital/checkout/return",
    webhookUrl: "https://api.morro.digital/payments/webhook",
    customer: {
      name: "Cliente Sandbox",
      email: "cliente@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    metadata: {
      orderId: "ord_sandbox_adapter_0001",
      sessionId: "session_sandbox_adapter_0001",
    },
  });
  if (!result) throw new Error("FIXTURE_INVALID");
  return result;
}

function refundRequest(): RefundProviderCommand {
  const paymentId = normalizePaymentId("pay_sandbox_refund_0001");
  const idempotencyKey = createRefundIdempotencyKey(paymentId);
  const refundRequestId = normalizeRefundRequestId("rfd_sandbox_refund_0001");
  const amount = createMoney(49_900, "BRL");
  const result = createRefundProviderCommand({
    refundRequestId,
    paymentId,
    idempotencyKey,
    amount,
    providerPaymentReference: "sandbox_payment_refund_0001",
    reason: "requested_by_business",
  });
  if (!result) throw new Error("REFUND_FIXTURE_INVALID");
  return result;
}

describe("M140/M144 sandbox payment provider adapters", () => {
  it("maps the authoritative request and provider idempotency exactly", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchMock: typeof fetch = (input, init) => {
      capturedUrl =
        input instanceof URL
          ? input.toString()
          : typeof input === "string"
            ? input
            : input.url;
      capturedInit = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            version: 1,
            checkoutId: "chk_sandbox_0001",
            checkoutUrl:
              "https://checkout.sandbox-payments.example/pay/chk_sandbox_0001",
            paymentReference: null,
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    };
    const provider = createSandboxCheckoutProviderFromEnvironment(
      environment(),
      { fetch: fetchMock },
    );

    await expect(provider.createCheckout(request())).resolves.toEqual({
      providerCheckoutId: "chk_sandbox_0001",
      checkoutUrl:
        "https://checkout.sandbox-payments.example/pay/chk_sandbox_0001",
      providerReference: null,
    });
    expect(capturedUrl).toBe(
      "https://api.sandbox-payments.example/v1/checkouts",
    );
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("Idempotency-Key")).toBe(
      "payment:v1:ord_sandbox_adapter_0001",
    );
    expect(headers.get("Authorization")).toBe(
      "Bearer sandbox-token-with-at-least-thirty-two-characters",
    );
    const capturedBody = capturedInit?.body;
    if (typeof capturedBody !== "string") {
      throw new Error("CAPTURED_PROVIDER_BODY_INVALID");
    }
    expect(JSON.parse(capturedBody)).toEqual({
      version: 1,
      externalReference: "pay_sandbox_adapter_0001",
      amount: { minorUnits: 49_900, currency: "BRL" },
      description: "Plano Crescimento",
      returnUrl: "https://morro.digital/checkout/return",
      webhookUrl: "https://api.morro.digital/payments/webhook",
      customer: {
        name: "Cliente Sandbox",
        email: "cliente@example.com",
        phone: "+55 75 99999-0000",
        document: "123.456.789-00",
      },
      metadata: {
        orderId: "ord_sandbox_adapter_0001",
        sessionId: "session_sandbox_adapter_0001",
      },
    });
  });

  it("normalizes rejection, outage and unsafe responses without leaking bodies", async () => {
    const rejected = createSandboxCheckoutProviderFromEnvironment(
      environment(),
      {
        fetch: () =>
          Promise.resolve(
            new Response("secret provider detail", { status: 422 }),
          ),
      },
    );
    await expect(rejected.createCheckout(request())).rejects.toEqual(
      new SandboxCheckoutProviderError("SANDBOX_PROVIDER_REJECTED"),
    );

    const unavailable = createSandboxCheckoutProviderFromEnvironment(
      environment(),
      {
        fetch: () => Promise.reject(new Error("secret network failure detail")),
      },
    );
    await expect(unavailable.createCheckout(request())).rejects.toEqual(
      new SandboxCheckoutProviderError("SANDBOX_PROVIDER_UNAVAILABLE"),
    );

    const oversized = createSandboxCheckoutProviderFromEnvironment(
      environment(),
      {
        fetch: () =>
          Promise.resolve(
            new Response("x".repeat(64 * 1024 + 1), {
              status: 200,
            }),
          ),
      },
    );
    await expect(oversized.createCheckout(request())).rejects.toEqual(
      new SandboxCheckoutProviderError("SANDBOX_PROVIDER_INVALID_RESPONSE"),
    );

    const wrongOrigin = createSandboxCheckoutProviderFromEnvironment(
      environment(),
      {
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                version: 1,
                checkoutId: "chk_sandbox_0001",
                checkoutUrl: "https://evil.example/pay/1",
                paymentReference: null,
              }),
              { status: 200 },
            ),
          ),
      },
    );
    await expect(wrongOrigin.createCheckout(request())).rejects.toEqual(
      new SandboxCheckoutProviderError("SANDBOX_PROVIDER_INVALID_RESPONSE"),
    );
  });

  it("fails closed on absent mode, token and checkout allowlist", () => {
    expect(() =>
      createSandboxCheckoutProviderFromEnvironment({
        ...environment(),
        PAYMENTS_PROVIDER_MODE: "",
      }),
    ).toThrow("PAYMENTS_PROVIDER_MODE=sandbox is required");
    expect(() =>
      createSandboxCheckoutProviderFromEnvironment({
        ...environment(),
        PAYMENTS_SANDBOX_PROVIDER_API_TOKEN: "short",
      }),
    ).toThrow("PAYMENTS_SANDBOX_PROVIDER_API_TOKEN is required");
    expect(() =>
      createSandboxCheckoutProviderFromEnvironment({
        ...environment(),
        PAYMENTS_SANDBOX_CHECKOUT_ORIGINS: "",
      }),
    ).toThrow("PAYMENTS_SANDBOX_CHECKOUT_ORIGINS is required");
  });

  it("maps the full-refund command and exact durable idempotency key", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const provider = createSandboxRefundProviderFromEnvironment(environment(), {
      fetch(input, init) {
        capturedUrl =
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url;
        capturedInit = init;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              version: 1,
              accepted: true,
              refundId: "sandbox_refund_0001",
            }),
            { status: 202 },
          ),
        );
      },
    });

    await expect(provider.requestRefund(refundRequest())).resolves.toEqual({
      accepted: true,
      providerRefundReference: "sandbox_refund_0001",
    });
    expect(capturedUrl).toBe("https://api.sandbox-payments.example/v1/refunds");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("Idempotency-Key")).toBe(
      "refund:v1:pay_sandbox_refund_0001",
    );
    const capturedBody = capturedInit?.body;
    if (typeof capturedBody !== "string") {
      throw new Error("CAPTURED_REFUND_BODY_INVALID");
    }
    expect(JSON.parse(capturedBody)).toEqual({
      version: 1,
      refundRequestId: "rfd_sandbox_refund_0001",
      externalReference: "pay_sandbox_refund_0001",
      paymentReference: "sandbox_payment_refund_0001",
      amount: { minorUnits: 49_900, currency: "BRL" },
      reason: "requested_by_business",
    });
  });

  it("fails closed on an unverified refund provider receipt", async () => {
    const provider = createSandboxRefundProviderFromEnvironment(environment(), {
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              version: 1,
              accepted: false,
              refundId: "sandbox_refund_rejected_0001",
            }),
            { status: 200 },
          ),
        ),
    });

    await expect(provider.requestRefund(refundRequest())).rejects.toEqual(
      new SandboxCheckoutProviderError("SANDBOX_PROVIDER_INVALID_RESPONSE"),
    );
  });

  it("reads a bounded provider snapshot without mutating provider state", async () => {
    const paymentId = normalizePaymentId("pay_sandbox_reconcile_0001");
    const amount = createMoney(49_900, "BRL");
    if (!paymentId || !amount) throw new Error("FIXTURE_INVALID");
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const provider = createSandboxReconciliationProviderFromEnvironment(
      environment(),
      {
        fetch(input, init) {
          capturedUrl =
            input instanceof URL
              ? input.toString()
              : typeof input === "string"
                ? input
                : input.url;
          capturedInit = init;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                version: 1,
                externalReference: paymentId,
                paymentReference: "sandbox_payment_reconcile_0001",
                status: "paid",
                amount,
                observedAt: "2026-08-15T02:00:00Z",
              }),
              { status: 200 },
            ),
          );
        },
      },
    );

    await expect(
      provider.readPayment({
        paymentId,
        providerPaymentReference: "sandbox_payment_reconcile_0001",
      }),
    ).resolves.toEqual({
      paymentId,
      providerPaymentReference: "sandbox_payment_reconcile_0001",
      status: "paid",
      amount,
      observedAt: "2026-08-15T02:00:00.000Z",
    });
    expect(capturedUrl).toBe(
      "https://api.sandbox-payments.example/v1/payments/sandbox_payment_reconcile_0001",
    );
    expect(capturedInit?.method).toBe("GET");
    expect(capturedInit?.body).toBeUndefined();
  });

  it("distinguishes provider absence and rejects identity substitution", async () => {
    const paymentId = normalizePaymentId("pay_sandbox_reconcile_0001");
    if (!paymentId) throw new Error("FIXTURE_INVALID");
    const missing = createSandboxReconciliationProviderFromEnvironment(
      environment(),
      { fetch: () => Promise.resolve(new Response(null, { status: 404 })) },
    );
    await expect(
      missing.readPayment({
        paymentId,
        providerPaymentReference: "sandbox_payment_reconcile_0001",
      }),
    ).resolves.toBeNull();

    const substituted = createSandboxReconciliationProviderFromEnvironment(
      environment(),
      {
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                version: 1,
                externalReference: "pay_sandbox_reconcile_other",
                paymentReference: "sandbox_payment_reconcile_0001",
                status: "paid",
                amount: { minorUnits: 49_900, currency: "BRL" },
                observedAt: "2026-08-15T02:00:00Z",
              }),
              { status: 200 },
            ),
          ),
      },
    );
    await expect(
      substituted.readPayment({
        paymentId,
        providerPaymentReference: "sandbox_payment_reconcile_0001",
      }),
    ).rejects.toEqual(
      new SandboxCheckoutProviderError("SANDBOX_PROVIDER_INVALID_RESPONSE"),
    );
  });
});
