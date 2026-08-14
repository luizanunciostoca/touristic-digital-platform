import { describe, expect, it } from "vitest";

import {
  createCheckoutProviderRequest,
  createMoney,
  createPaymentIdempotencyKey,
  normalizeCheckoutProviderSession,
  normalizePaymentId,
} from "./index.js";

function validRequest() {
  const paymentId = normalizePaymentId("pay_provider_contract_0001");
  const idempotencyKey = createPaymentIdempotencyKey(
    "ord_provider_contract_0001",
  );
  const amount = createMoney(49_900, "BRL");
  if (!paymentId || !idempotencyKey || !amount) {
    throw new Error("FIXTURE_INVALID");
  }
  return {
    paymentId,
    idempotencyKey,
    amount,
    description: "Plano Crescimento",
    returnUrl: "https://morro.digital/checkout/return",
    webhookUrl: "https://api.morro.digital/payments/webhook",
    customer: {
      name: "Cliente Sandbox",
      email: "CLIENTE@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    metadata: {
      sessionId: "session_provider_0001",
      orderId: "ord_provider_contract_0001",
    },
  };
}

describe("M140 checkout provider contract constructors", () => {
  it("creates a canonical deeply immutable request", () => {
    const request = createCheckoutProviderRequest(validRequest());

    expect(request).toEqual({
      ...validRequest(),
      customer: {
        ...validRequest().customer,
        email: "cliente@example.com",
      },
      metadata: {
        orderId: "ord_provider_contract_0001",
        sessionId: "session_provider_0001",
      },
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request?.customer)).toBe(true);
    expect(Object.isFrozen(request?.metadata)).toBe(true);
  });

  it("rejects forged money, idempotency, URLs and metadata", () => {
    expect(
      createCheckoutProviderRequest({
        ...validRequest(),
        amount: { minorUnits: 49_900.5, currency: "BRL" },
      }),
    ).toBeNull();
    expect(
      createCheckoutProviderRequest({
        ...validRequest(),
        idempotencyKey: "payment:v1:invalid space",
      }),
    ).toBeNull();
    expect(
      createCheckoutProviderRequest({
        ...validRequest(),
        returnUrl: "https://user:pass@morro.digital/return",
      }),
    ).toBeNull();
    expect(
      createCheckoutProviderRequest({
        ...validRequest(),
        metadata: { "invalid key": "value" },
      }),
    ).toBeNull();
  });

  it("normalizes only safe provider sessions", () => {
    expect(
      normalizeCheckoutProviderSession({
        providerCheckoutId: "chk_sandbox_0001",
        checkoutUrl:
          "https://sandbox-payments.example/checkout/chk_sandbox_0001",
        providerReference: null,
      }),
    ).toEqual({
      providerCheckoutId: "chk_sandbox_0001",
      checkoutUrl: "https://sandbox-payments.example/checkout/chk_sandbox_0001",
      providerReference: null,
    });
    expect(
      normalizeCheckoutProviderSession({
        providerCheckoutId: "bad id",
        checkoutUrl: "javascript:alert(1)",
        providerReference: null,
      }),
    ).toBeNull();
  });
});
