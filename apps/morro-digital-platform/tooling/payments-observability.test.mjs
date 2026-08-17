import { describe, expect, it, vi } from "vitest";

import { createPaymentsPlatformObservability } from "./payments-observability.mjs";

function fixture() {
  const records = [];
  const observations = createPaymentsPlatformObservability({
    destinationId: "morro-de-sao-paulo",
    sink: (record) => records.push(record),
  });
  return { records, observations };
}

describe("FEATURE-0009 canonical payments observations", () => {
  it("emits bounded audit visibility with the caller correlation ID", () => {
    const { records, observations } = fixture();

    observations.runWithCorrelation("corr_checkout_123456", () => {
      observations.recordAudit({
        action: "payment.refund",
        result: "success",
        reason: "provider_accepted",
        correlationId: "corr_checkout_123456",
        tenantId: "business_123",
        paymentId: "pay_12345678",
      });
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      contract: "PLATFORM-OBSERVATION",
      contractVersion: 1,
      observation: {
        kind: "audit",
        name: "payments.refund.lifecycle",
        severity: "info",
        destinationId: "morro-de-sao-paulo",
        tenantId: "business_123",
        correlationId: "corr_checkout_123456",
        attributes: {
          domain: "payments-financial-subscription",
          result: "success",
          reason: "provider_accepted",
          paymentId: "pay_12345678",
        },
      },
    });
  });

  it("emits provider degraded once and recovered after a successful read", async () => {
    const { records, observations } = fixture();
    const unavailable = Object.assign(new Error("provider unavailable"), {
      code: "SANDBOX_PROVIDER_UNAVAILABLE",
    });
    const failing = observations.observeReconciliationProvider({
      readPayment: vi.fn().mockRejectedValue(unavailable),
    });

    await observations.runWithCorrelation("corr_provider_123", () =>
      expect(
        failing.readPayment({
          paymentId: "pay_12345678",
          providerPaymentReference: "provider_123",
        }),
      ).rejects.toBe(unavailable),
    );
    await observations.runWithCorrelation("corr_provider_124", () =>
      expect(
        failing.readPayment({
          paymentId: "pay_12345678",
          providerPaymentReference: "provider_123",
        }),
      ).rejects.toBe(unavailable),
    );

    const healthy = observations.observeReconciliationProvider({
      readPayment: vi.fn().mockResolvedValue(null),
    });
    await observations.runWithCorrelation("corr_provider_125", () =>
      healthy.readPayment({
        paymentId: "pay_12345678",
        providerPaymentReference: "provider_123",
      }),
    );

    expect(records.map((record) => record.observation.name)).toEqual([
      "platform.provider.degraded",
      "platform.provider.recovered",
    ]);
    expect(records[0].observation.correlationId).toBe("corr_provider_123");
    expect(records[1].observation.correlationId).toBe("corr_provider_125");
  });

  it("does not classify semantic provider rejection as health degradation", async () => {
    const { records, observations } = fixture();
    const rejected = Object.assign(new Error("rejected"), {
      code: "SANDBOX_PROVIDER_REJECTED",
    });
    const provider = observations.observeRefundProvider({
      requestRefund: vi.fn().mockRejectedValue(rejected),
    });

    await expect(
      observations.runWithCorrelation("corr_refund_rejected", () =>
        provider.requestRefund({}),
      ),
    ).rejects.toBe(rejected);

    expect(records).toHaveLength(1);
    expect(records[0].observation.name).toBe(
      "payments.provider.command_rejected",
    );
  });

  it("swallows sink failure and preserves provider return authority", async () => {
    const observations = createPaymentsPlatformObservability({
      destinationId: "morro-de-sao-paulo",
      sink: () => {
        throw new Error("collector unavailable");
      },
    });
    const providerResult = Object.freeze({ providerCheckoutId: "checkout_1" });
    const provider = observations.observeCheckoutProvider({
      createCheckout: vi.fn().mockResolvedValue(providerResult),
    });

    await expect(
      observations.runWithCorrelation("corr_sink_failure", () =>
        provider.createCheckout({}),
      ),
    ).resolves.toBe(providerResult);
  });

  it("maps recurrence decisions to the same canonical observation contract", () => {
    const { records, observations } = fixture();
    observations.recurrencePort().record({
      action: "renewal.apply_verified_outcome",
      disposition: "advanced",
      subscriptionId: "sub_12345678",
      periodNumber: 2,
      orderId: "ord_renewal01",
      verifiedResultId: "fev_renewal123",
      correlationId: "corr_recurrence_123",
      severity: "info",
    });

    expect(records).toHaveLength(1);
    expect(records[0].observation).toMatchObject({
      kind: "audit",
      name: "payments.subscription.recurrence",
      correlationId: "corr_recurrence_123",
      attributes: {
        disposition: "advanced",
        subscriptionId: "sub_12345678",
        periodNumber: 2,
        orderId: "ord_renewal01",
        verifiedResultId: "fev_renewal123",
      },
    });
  });
});
