import { describe, expect, it } from "vitest";

import {
  createMoney,
  createRefundIdempotencyKey,
  createRefundProviderCommand,
  normalizeRefundProviderReceipt,
  normalizeRefundRequest,
  normalizeRefundRequestId,
} from "./index.js";

describe("M144 refund command domain contract", () => {
  it("binds one full-refund key and provider command to Payment", () => {
    const amount = createMoney(49_900, "BRL");
    expect(createRefundIdempotencyKey("pay_refund_domain_0001")).toBe(
      "refund:v1:pay_refund_domain_0001",
    );
    expect(
      createRefundProviderCommand({
        refundRequestId: "rfd_refund_domain_0001",
        paymentId: "pay_refund_domain_0001",
        idempotencyKey: "refund:v1:pay_refund_domain_0001",
        amount,
        providerPaymentReference: "sandbox_payment_domain_0001",
        reason: "requested_by_business",
      }),
    ).toMatchObject({
      refundRequestId: "rfd_refund_domain_0001",
      paymentId: "pay_refund_domain_0001",
      amount: { minorUnits: 49_900, currency: "BRL" },
    });
  });

  it("enforces claimed/accepted state and rejects forged input", () => {
    const base = {
      id: "rfd_refund_domain_0001",
      idempotencyKey: "refund:v1:pay_refund_domain_0001",
      paymentId: "pay_refund_domain_0001",
      approvedResultId: "fev_refund_domain_0001",
      amount: { minorUnits: 49_900, currency: "BRL" },
      providerPaymentReference: "sandbox_payment_domain_0001",
      createdAt: "2026-08-15T00:15:00Z",
      updatedAt: "2026-08-15T00:15:00Z",
    };
    expect(
      normalizeRefundRequest({
        ...base,
        status: "claimed",
        providerRefundReference: null,
      }),
    ).toMatchObject({ status: "claimed" });
    expect(
      normalizeRefundRequest({
        ...base,
        status: "provider_accepted",
        providerRefundReference: null,
      }),
    ).toBeNull();
    expect(
      normalizeRefundProviderReceipt({
        accepted: false,
        providerRefundReference: "sandbox_refund_domain_0001",
      }),
    ).toBeNull();
    expect(normalizeRefundRequestId("refund_bad")).toBeNull();
  });
});
