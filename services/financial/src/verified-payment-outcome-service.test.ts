import { describe, expect, it } from "vitest";

import {
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
  normalizeVerifiedPaymentResult,
  normalizeVerifiedProviderPaymentEvent,
  type Payment,
  type PaymentId,
  type PaymentRepositoryPort,
  type ProviderEventId,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
  type VerifiedPaymentTerminalStatus,
} from "@touristic/financial";

import { createVerifiedPaymentOutcomeService } from "./verified-payment-outcome-service.js";

function payment(status: Payment["status"] = "pending"): Payment {
  const id = normalizePaymentId("pay_outcome_service_0001");
  const idempotencyKey = createPaymentIdempotencyKey(
    "ord_outcome_service_0001",
  );
  const amount = createMoney(49_900, "BRL");
  if (!id || !idempotencyKey || !amount) throw new Error("FIXTURE_INVALID");
  const terminal = status !== "pending";
  return {
    id,
    idempotencyKey,
    subject: { kind: "order", reference: "ord_outcome_service_0001" },
    amount,
    status,
    providerReference: terminal ? "sandbox_outcome_service_0001" : null,
    createdAt: "2026-08-14T23:30:00Z",
    updatedAt: terminal
      ? "2026-08-14T23:30:01Z"
      : "2026-08-14T23:30:00Z",
    confirmedAt:
      status === "confirmed" || status === "refunded"
        ? "2026-08-14T23:30:01Z"
        : null,
    refundedAt:
      status === "refunded" ? "2026-08-14T23:30:02Z" : null,
  };
}

function event(
  status: "paid" | "failed" | "cancelled" | "expired" | "refunded" = "paid",
  providerEventId = "pwe_outcome_service_0001",
  occurredAt = "2026-08-14T23:30:01Z",
) {
  const value = normalizeVerifiedProviderPaymentEvent({
    providerEventId,
    externalReference: "pay_outcome_service_0001",
    providerPaymentReference: "sandbox_outcome_service_0001",
    status,
    occurredAt,
  });
  if (!value) throw new Error("EVENT_FIXTURE_INVALID");
  return value;
}

class MemoryPayments implements PaymentRepositoryPort {
  current: Payment | null;

  constructor(value: Payment | null) {
    this.current = value;
  }

  findById(id: PaymentId): Promise<Payment | null> {
    return Promise.resolve(this.current?.id === id ? this.current : null);
  }

  save(value: Payment): Promise<Payment> {
    this.current = value;
    return Promise.resolve(value);
  }
}

class MemoryResults implements VerifiedPaymentResultRepositoryPort {
  readonly values: VerifiedPaymentResult[] = [];

  findByProviderEventId(
    providerEventId: ProviderEventId,
  ): Promise<VerifiedPaymentResult | null> {
    return Promise.resolve(
      this.values.find((value) => value.providerEventId === providerEventId) ??
        null,
    );
  }

  findByPaymentStatus(
    paymentId: PaymentId,
    paymentStatus: VerifiedPaymentTerminalStatus,
  ): Promise<VerifiedPaymentResult | null> {
    return Promise.resolve(
      this.values.find(
        (value) =>
          value.paymentId === paymentId &&
          value.paymentStatus === paymentStatus,
      ) ?? null,
    );
  }

  save(input: VerifiedPaymentResult): Promise<VerifiedPaymentResult> {
    const value = normalizeVerifiedPaymentResult(input);
    if (!value) return Promise.reject(new Error("RESULT_INVALID"));
    const existing = this.values.find(
      (candidate) =>
        candidate.providerEventId === value.providerEventId ||
        (candidate.paymentId === value.paymentId &&
          candidate.paymentStatus === value.paymentStatus),
    );
    if (existing) return Promise.resolve(existing);
    this.values.push(value);
    return Promise.resolve(value);
  }
}

function service(value: Payment | null) {
  const payments = new MemoryPayments(value);
  const results = new MemoryResults();
  return {
    payments,
    results,
    outcomes: createVerifiedPaymentOutcomeService({
      payments,
      results,
      clock: { now: () => "2026-08-14T23:30:03Z" },
    }),
  };
}

describe("M142 verified Payment outcome service", () => {
  it("applies a paid event once and replays the durable result", async () => {
    const { payments, results, outcomes } = service(payment());
    const verified = event();

    await expect(outcomes.apply(verified)).resolves.toMatchObject({
      disposition: "applied",
      payment: {
        status: "confirmed",
        providerReference: "sandbox_outcome_service_0001",
      },
      result: {
        kind: "approved",
        paymentStatus: "confirmed",
        providerEventId: verified.providerEventId,
      },
    });
    await expect(outcomes.apply(verified)).resolves.toMatchObject({
      disposition: "replayed",
      result: { providerEventId: verified.providerEventId },
    });
    expect(payments.current?.status).toBe("confirmed");
    expect(results.values).toHaveLength(1);
  });

  it("recovers the result after Payment committed before result persistence", async () => {
    const { outcomes, results } = service(payment("confirmed"));

    await expect(outcomes.apply(event())).resolves.toMatchObject({
      disposition: "recovered",
      result: {
        kind: "approved",
        paymentStatus: "confirmed",
      },
    });
    expect(results.values).toHaveLength(1);
  });

  it("preserves stale evidence and defers an invalid refund order", async () => {
    const confirmed = service(payment("confirmed"));
    await expect(
      confirmed.outcomes.apply(
        event(
          "failed",
          "pwe_outcome_service_stale",
          "2026-08-14T23:30:00Z",
        ),
      ),
    ).resolves.toMatchObject({
      disposition: "stale",
      result: null,
      payment: { status: "confirmed" },
    });

    const pending = service(payment());
    await expect(
      pending.outcomes.apply(
        event(
          "refunded",
          "pwe_outcome_service_refund",
          "2026-08-14T23:30:02Z",
        ),
      ),
    ).resolves.toMatchObject({
      disposition: "deferred",
      result: null,
      payment: { status: "pending" },
    });
  });

  it("acknowledges a verified event with no matching Payment without forging state", async () => {
    const { outcomes, results } = service(null);
    await expect(outcomes.apply(event())).resolves.toEqual({
      disposition: "unmatched",
      payment: null,
      result: null,
    });
    expect(results.values).toHaveLength(0);
  });
});
