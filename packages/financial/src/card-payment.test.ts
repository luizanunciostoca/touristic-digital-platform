import { describe, expect, it } from "vitest";

import { createMoney, normalizePaymentId } from "./index.js";
import {
  createCardPaymentIdempotencyKey,
  createCardPaymentProviderRequest,
  normalizeCardPaymentProviderReceipt,
} from "./card-payment.js";

const paymentId = normalizePaymentId("pay_card_payment_0001");
if (!paymentId) throw new Error("TEST_PAYMENT_ID_INVALID");
const amount = createMoney(100, "BRL");
if (!amount) throw new Error("TEST_AMOUNT_INVALID");
const idempotencyKey = createCardPaymentIdempotencyKey(paymentId);
if (!idempotencyKey) throw new Error("TEST_IDEMPOTENCY_KEY_INVALID");

const validRequest = Object.freeze({
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
  metadata: { orderId: "ord_card_payment_0001" },
});

describe("direct card payment contract", () => {
  it("normalizes a server-authoritative provider request", () => {
    const request = createCardPaymentProviderRequest(validRequest);

    expect(request).toEqual(validRequest);
    expect(request && Object.isFrozen(request)).toBe(true);
    expect(request && Object.isFrozen(request.customer)).toBe(true);
    expect(request && Object.isFrozen(request.metadata)).toBe(true);
  });

  it("derives provider idempotency from the internal payment attempt", () => {
    expect(idempotencyKey).toBe("card-payment:v1:pay_card_payment_0001");
    expect(
      createCardPaymentProviderRequest({
        ...validRequest,
        idempotencyKey: "card-payment:v1:pay_other_payment_0001",
      }),
    ).toBeNull();
  });

  it.each([0, -1, 49, 1.5])(
    "rejects invalid installments %s",
    (installments) => {
      expect(
        createCardPaymentProviderRequest({ ...validRequest, installments }),
      ).toBeNull();
    },
  );

  it("rejects insecure webhook URLs", () => {
    expect(
      createCardPaymentProviderRequest({
        ...validRequest,
        webhookUrl: "http://example.com/webhook",
      }),
    ).toBeNull();
  });

  it("rejects malformed browser/provider fields", () => {
    expect(
      createCardPaymentProviderRequest({ ...validRequest, token: "<token>" }),
    ).toBeNull();
    expect(
      createCardPaymentProviderRequest({
        ...validRequest,
        paymentMethodId: "visa<script>",
      }),
    ).toBeNull();
    expect(
      createCardPaymentProviderRequest({
        ...validRequest,
        customer: { email: "not-an-email" },
      }),
    ).toBeNull();
  });

  it("normalizes accepted provider receipts without provider payload leakage", () => {
    expect(
      normalizeCardPaymentProviderReceipt({
        providerPaymentReference: "1234567890",
        status: "paid",
      }),
    ).toEqual({ providerPaymentReference: "1234567890", status: "paid" });

    expect(
      normalizeCardPaymentProviderReceipt({
        providerPaymentReference: "1234567890",
        status: "unknown",
      }),
    ).toBeNull();
  });
});
