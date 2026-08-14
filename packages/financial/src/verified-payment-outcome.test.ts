import { describe, expect, it } from "vitest";

import {
  applyVerifiedProviderPaymentEvent,
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
  normalizeVerifiedPaymentResult,
  normalizeVerifiedProviderPaymentEvent,
  type Payment,
} from "./index.js";

function payment(status: Payment["status"] = "pending"): Payment {
  const id = normalizePaymentId("pay_verified_transition_0001");
  const key = createPaymentIdempotencyKey(
    "ord_verified_transition_0001",
  );
  const amount = createMoney(49_900, "BRL");
  if (!id || !key || !amount) throw new Error("FIXTURE_INVALID");
  return {
    id,
    idempotencyKey: key,
    subject: {
      kind: "order",
      reference: "ord_verified_transition_0001",
    },
    amount,
    status,
    providerReference:
      status === "pending" ? null : "sandbox_verified_payment_0001",
    createdAt: "2026-08-14T23:20:00Z",
    updatedAt:
      status === "pending"
        ? "2026-08-14T23:20:00Z"
        : "2026-08-14T23:21:00Z",
    confirmedAt:
      status === "confirmed" || status === "refunded"
        ? "2026-08-14T23:21:00Z"
        : null,
    refundedAt:
      status === "refunded" ? "2026-08-14T23:22:00Z" : null,
  };
}

function event(
  status: "paid" | "failed" | "cancelled" | "expired" | "refunded",
  occurredAt = "2026-08-14T23:21:00Z",
) {
  const value = normalizeVerifiedProviderPaymentEvent({
    providerEventId: "pwe_verified_transition_0001",
    externalReference: "pay_verified_transition_0001",
    providerPaymentReference: "sandbox_verified_payment_0001",
    status,
    occurredAt,
  });
  if (!value) throw new Error("EVENT_FIXTURE_INVALID");
  return value;
}

describe("M142 verified Payment transition", () => {
  it("confirms pending Payment only from a verified paid event", () => {
    expect(applyVerifiedProviderPaymentEvent(payment(), event("paid"))).toMatchObject({
      disposition: "applied",
      payment: {
        status: "confirmed",
        providerReference: "sandbox_verified_payment_0001",
        updatedAt: "2026-08-14T23:21:00.000Z",
        confirmedAt: "2026-08-14T23:21:00.000Z",
      },
      resultKind: "approved",
    });
  });

  it("preserves stale and out-of-order evidence without rollback", () => {
    expect(
      applyVerifiedProviderPaymentEvent(
        payment("confirmed"),
        event("failed", "2026-08-14T23:20:59Z"),
      ),
    ).toMatchObject({ disposition: "stale", resultKind: null });
    expect(
      applyVerifiedProviderPaymentEvent(payment(), event("refunded")),
    ).toMatchObject({ disposition: "deferred", resultKind: null });
  });

  it("applies refund only after confirmation", () => {
    expect(
      applyVerifiedProviderPaymentEvent(
        payment("confirmed"),
        event("refunded", "2026-08-14T23:22:00Z"),
      ),
    ).toMatchObject({
      disposition: "applied",
      payment: {
        status: "refunded",
        refundedAt: "2026-08-14T23:22:00.000Z",
      },
      resultKind: "refunded",
    });
  });

  it("rejects forged result kind/status pairs", () => {
    const base = {
      resultId: "fev_verified_result_0001",
      providerEventId: "pwe_verified_transition_0001",
      paymentId: "pay_verified_transition_0001",
      orderReference: "ord_verified_transition_0001",
      paymentReference: "sandbox_verified_payment_0001",
      occurredAt: "2026-08-14T23:21:00Z",
      recordedAt: "2026-08-14T23:21:01Z",
    };
    expect(
      normalizeVerifiedPaymentResult({
        ...base,
        kind: "approved",
        paymentStatus: "confirmed",
      }),
    ).toMatchObject({ kind: "approved", paymentStatus: "confirmed" });
    expect(
      normalizeVerifiedPaymentResult({
        ...base,
        kind: "approved",
        paymentStatus: "failed",
      }),
    ).toBeNull();
  });
});
