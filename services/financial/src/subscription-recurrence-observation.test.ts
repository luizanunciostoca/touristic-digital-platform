import { describe, expect, it, vi } from "vitest";
import type { PlatformObservation } from "@touristic/core";
import { PaymentObservationEmitter } from "./payment-observation.js";
import { createSubscriptionRecurrenceObservationService } from "./subscription-recurrence-observation.js";

const baseInput = {
  destinationId: "morro-de-sao-paulo",
  correlationId: "corr_sub_renewal_001",
  subscriptionId: "sub_abc12345",
  periodNumber: 3,
  orderId: "ord_xyz789",
  paymentId: "pay_def456",
  verifiedResultId: "evt_ghi012",
};

function createObserveMock() {
  return vi.fn<(obs: PlatformObservation) => void>();
}

describe("Subscription recurrence observation", () => {
  it("emits renewal claimed with correct attributes", async () => {
    const observe = createObserveMock();
    const emitter = new PaymentObservationEmitter({ observe });
    const service = createSubscriptionRecurrenceObservationService(emitter);

    await service.emitRenewalClaimed(baseInput);

    expect(observe).toHaveBeenCalledOnce();
    const obs = observe.mock.calls[0]![0];
    expect(obs.name).toBe("payments.subscription.renewal.claimed");
    expect(obs.severity).toBe("info");
    expect(obs.attributes).toEqual({
      subscriptionId: "sub_abc12345",
      periodNumber: 3,
      orderId: "ord_xyz789",
      paymentId: "pay_def456",
      verifiedResultId: "evt_ghi012",
    });
  });

  it("emits renewal succeeded as info", async () => {
    const observe = createObserveMock();
    const emitter = new PaymentObservationEmitter({ observe });
    const service = createSubscriptionRecurrenceObservationService(emitter);

    await service.emitRenewalSucceeded(baseInput);

    const obs = observe.mock.calls[0]![0];
    expect(obs.name).toBe("payments.subscription.renewal.succeeded");
    expect(obs.severity).toBe("info");
  });

  it("emits renewal failed as warn", async () => {
    const observe = createObserveMock();
    const emitter = new PaymentObservationEmitter({ observe });
    const service = createSubscriptionRecurrenceObservationService(emitter);

    await service.emitRenewalFailed(baseInput);

    const obs = observe.mock.calls[0]![0];
    expect(obs.name).toBe("payments.subscription.renewal.failed");
    expect(obs.severity).toBe("warn");
  });

  it("emits past_due as error alert", async () => {
    const observe = createObserveMock();
    const emitter = new PaymentObservationEmitter({ observe });
    const service = createSubscriptionRecurrenceObservationService(emitter);

    await service.emitPastDue(baseInput);

    const obs = observe.mock.calls[0]![0];
    expect(obs.name).toBe("payments.subscription.past_due");
    expect(obs.severity).toBe("error");
    expect(obs.kind).toBe("alert");
  });

  it("emits retry_exhausted as critical alert", async () => {
    const observe = createObserveMock();
    const emitter = new PaymentObservationEmitter({ observe });
    const service = createSubscriptionRecurrenceObservationService(emitter);

    await service.emitRetryExhausted(baseInput);

    const obs = observe.mock.calls[0]![0];
    expect(obs.name).toBe("payments.subscription.retry_exhausted");
    expect(obs.severity).toBe("critical");
    expect(obs.kind).toBe("alert");
  });

  it("emits cancelled as info metric", async () => {
    const observe = createObserveMock();
    const emitter = new PaymentObservationEmitter({ observe });
    const service = createSubscriptionRecurrenceObservationService(emitter);

    await service.emitCancelled(baseInput);

    const obs = observe.mock.calls[0]![0];
    expect(obs.name).toBe("payments.subscription.cancelled");
    expect(obs.severity).toBe("info");
    expect(obs.kind).toBe("metric");
  });

  it("omits optional paymentId and verifiedResultId when not provided", async () => {
    const observe = createObserveMock();
    const emitter = new PaymentObservationEmitter({ observe });
    const service = createSubscriptionRecurrenceObservationService(emitter);

    await service.emitRenewalClaimed({
      destinationId: baseInput.destinationId,
      correlationId: baseInput.correlationId,
      subscriptionId: baseInput.subscriptionId,
      periodNumber: baseInput.periodNumber,
      orderId: baseInput.orderId,
    });

    const obs = observe.mock.calls[0]![0];
    expect(obs.attributes).toEqual({
      subscriptionId: "sub_abc12345",
      periodNumber: 3,
      orderId: "ord_xyz789",
    });
    expect(obs.attributes).not.toHaveProperty("paymentId");
    expect(obs.attributes).not.toHaveProperty("verifiedResultId");
  });
});
