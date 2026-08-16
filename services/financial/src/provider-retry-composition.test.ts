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
  createFinancialSettlementIdempotencyKey,
  normalizeFinancialPayableId,
  normalizeFinancialSettlementId,
} from "@touristic/financial/settlement";

import {
  SandboxCheckoutProviderError,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxReconciliationProviderFromEnvironment,
  createSandboxRefundProviderFromEnvironment,
} from "./sandbox-checkout-provider.js";
import { createSandboxSettlementProviderFromEnvironment } from "./sandbox-settlement-provider.js";

function environment() {
  return {
    NODE_ENV: "test",
    PAYMENTS_PROVIDER_MODE: "sandbox",
    PAYMENTS_SANDBOX_PROVIDER_BASE_URL: "https://provider.example/",
    PAYMENTS_SANDBOX_PROVIDER_API_TOKEN: "x".repeat(48),
    PAYMENTS_SANDBOX_CHECKOUT_ORIGINS: "https://checkout.provider.example",
    PAYMENTS_PROVIDER_TIMEOUT_MS: "1000",
    PAYMENTS_PROVIDER_MAX_ATTEMPTS: "2",
    PAYMENTS_PROVIDER_RETRY_BASE_MS: "0",
  };
}

function checkoutRequest(): CheckoutProviderRequest {
  const paymentId = normalizePaymentId("pay_retry_adapter_0001");
  const idempotencyKey = createPaymentIdempotencyKey("ord_retry_adapter_0001");
  const amount = createMoney(49_900, "BRL");
  const request = createCheckoutProviderRequest({
    paymentId,
    idempotencyKey,
    amount,
    description: "Plano retry",
    returnUrl: "https://morro.digital/checkout/return",
    webhookUrl: "https://api.morro.digital/payments/webhook",
    customer: {
      name: "Cliente Retry",
      email: "retry@example.com",
      phone: null,
      document: null,
    },
    metadata: { orderId: "ord_retry_adapter_0001" },
  });
  if (!request) throw new Error("CHECKOUT_FIXTURE_INVALID");
  return request;
}

function refundRequest(): RefundProviderCommand {
  const paymentId = normalizePaymentId("pay_retry_refund_0001");
  const refundRequestId = normalizeRefundRequestId("rfd_retry_refund_0001");
  const idempotencyKey = createRefundIdempotencyKey(paymentId);
  const amount = createMoney(49_900, "BRL");
  const request = createRefundProviderCommand({
    refundRequestId,
    paymentId,
    idempotencyKey,
    amount,
    providerPaymentReference: "provider-payment-retry-0001",
    reason: "requested_by_business",
  });
  if (!request) throw new Error("REFUND_FIXTURE_INVALID");
  return request;
}

function settlementCommand() {
  const settlementId = normalizeFinancialSettlementId("stl_retry_12345678");
  const payableId = normalizeFinancialPayableId("pbl_retry_12345678");
  const paymentId = normalizePaymentId("pay_retry_12345678");
  const amount = createMoney(9_000, "BRL");
  const idempotencyKey = createFinancialSettlementIdempotencyKey(payableId);
  if (!settlementId || !payableId || !paymentId || !amount || !idempotencyKey) {
    throw new Error("SETTLEMENT_FIXTURE_INVALID");
  }
  return {
    settlementId,
    payableId,
    paymentId,
    beneficiaryReference: "business_retry",
    amount,
    idempotencyKey,
  };
}

describe("M152 provider retry composition", () => {
  it("retries checkout transport failure with the exact durable idempotency command", async () => {
    const captured: RequestInit[] = [];
    let calls = 0;
    const provider = createSandboxCheckoutProviderFromEnvironment(environment(), {
      fetch: async (_input, init) => {
        captured.push(init ?? {});
        calls += 1;
        if (calls === 1) throw new Error("secret network detail");
        return new Response(
          JSON.stringify({
            version: 1,
            checkoutId: "chk_retry_0001",
            checkoutUrl: "https://checkout.provider.example/pay/chk_retry_0001",
            paymentReference: null,
          }),
          { status: 201 },
        );
      },
    });

    await expect(provider.createCheckout(checkoutRequest())).resolves.toMatchObject({
      providerCheckoutId: "chk_retry_0001",
    });
    expect(captured).toHaveLength(2);
    expect(captured.map((init) => new Headers(init.headers).get("Idempotency-Key"))).toEqual([
      "payment:v1:ord_retry_adapter_0001",
      "payment:v1:ord_retry_adapter_0001",
    ]);
    expect(captured[1]?.body).toBe(captured[0]?.body);
  });

  it("retries refund 503 with the exact same idempotency key and payload", async () => {
    const captured: RequestInit[] = [];
    let calls = 0;
    const provider = createSandboxRefundProviderFromEnvironment(environment(), {
      fetch: async (_input, init) => {
        captured.push(init ?? {});
        calls += 1;
        return calls === 1
          ? new Response(null, { status: 503 })
          : new Response(
              JSON.stringify({
                version: 1,
                accepted: true,
                refundId: "refund-retry-0001",
              }),
              { status: 202 },
            );
      },
    });

    await expect(provider.requestRefund(refundRequest())).resolves.toEqual({
      accepted: true,
      providerRefundReference: "refund-retry-0001",
    });
    expect(captured.map((init) => new Headers(init.headers).get("Idempotency-Key"))).toEqual([
      "refund:v1:pay_retry_refund_0001",
      "refund:v1:pay_retry_refund_0001",
    ]);
    expect(captured[1]?.body).toBe(captured[0]?.body);
  });

  it("retries reconciliation 429 as a read-only GET and preserves identity checks", async () => {
    const paymentId = normalizePaymentId("pay_retry_reconcile_0001");
    const amount = createMoney(49_900, "BRL");
    if (!paymentId || !amount) throw new Error("RECONCILIATION_FIXTURE_INVALID");
    let calls = 0;
    const provider = createSandboxReconciliationProviderFromEnvironment(
      environment(),
      {
        fetch: async () => {
          calls += 1;
          return calls === 1
            ? new Response(null, { status: 429 })
            : new Response(
                JSON.stringify({
                  version: 1,
                  externalReference: paymentId,
                  paymentReference: "provider-payment-reconcile-retry",
                  status: "paid",
                  amount,
                  observedAt: "2026-08-16T04:30:00Z",
                }),
                { status: 200 },
              );
        },
      },
    );

    await expect(
      provider.readPayment({
        paymentId,
        providerPaymentReference: "provider-payment-reconcile-retry",
      }),
    ).resolves.toMatchObject({ paymentId, status: "paid" });
    expect(calls).toBe(2);
  });

  it("retries settlement POST only because its durable idempotency key is present", async () => {
    const captured: RequestInit[] = [];
    let calls = 0;
    const provider = createSandboxSettlementProviderFromEnvironment(environment(), {
      fetch: async (_input, init) => {
        captured.push(init ?? {});
        calls += 1;
        return calls === 1
          ? new Response(null, { status: 503 })
          : new Response(
              JSON.stringify({
                version: 1,
                settlementId: "stl_retry_12345678",
                accepted: true,
                transferReference: "transfer-retry-12345678",
              }),
              { status: 200 },
            );
      },
    });

    await expect(provider.requestTransfer(settlementCommand())).resolves.toEqual({
      accepted: true,
      providerTransferReference: "transfer-retry-12345678",
    });
    expect(captured.map((init) => new Headers(init.headers).get("Idempotency-Key"))).toEqual([
      "settlement:v1:pbl_retry_12345678",
      "settlement:v1:pbl_retry_12345678",
    ]);
    expect(captured[1]?.body).toBe(captured[0]?.body);
  });

  it("never retries semantic rejection through the composed checkout adapter", async () => {
    let calls = 0;
    const provider = createSandboxCheckoutProviderFromEnvironment(environment(), {
      fetch: async () => {
        calls += 1;
        return new Response("secret provider detail", { status: 422 });
      },
    });

    await expect(provider.createCheckout(checkoutRequest())).rejects.toEqual(
      new SandboxCheckoutProviderError("SANDBOX_PROVIDER_REJECTED"),
    );
    expect(calls).toBe(1);
  });
});
