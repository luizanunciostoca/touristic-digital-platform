import { describe, expect, it, vi } from "vitest";
import {
  createPaymentObservation,
  PaymentObservationEmitter,
} from "./payment-observation.js";

describe("Payment observations", () => {
  it("creates Platform Observation v1 compatible provider lifecycle observations", () => {
    const observation = createPaymentObservation({
      name: "payments.provider.degraded",
      severity: "error",
      destinationId: "morro-de-sao-paulo",
      correlationId: "corr_payments_observation_0001",
      attributes: { provider: "sandbox", attempt: 2, retryable: true },
    });
    expect(observation.kind).toBe("alert");
    expect(observation.name).toBe("payments.provider.degraded");
    expect(observation.attributes).toEqual({
      provider: "sandbox",
      attempt: 2,
      retryable: true,
    });
  });

  it("emits through an injected sink without changing payment authority", async () => {
    const observe = vi.fn();
    const emitter = new PaymentObservationEmitter({ observe });
    await emitter.emit({
      name: "payments.rate_limited",
      severity: "warn",
      destinationId: "morro-de-sao-paulo",
      correlationId: "corr_payments_observation_0002",
      attributes: { bucket: "checkout-create", retryAfterSeconds: 60 },
    });
    expect(observe).toHaveBeenCalledOnce();
    expect(observe.mock.calls[0]?.[0].attributes).toEqual({
      bucket: "checkout-create",
      retryAfterSeconds: 60,
    });
  });
});
