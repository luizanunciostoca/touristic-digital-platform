import {
  createPlatformObservation,
  type PlatformObservation,
  type PlatformObservationAttributes,
  type PlatformObservationSeverity,
} from "@touristic/core";

export type PaymentObservationName =
  | "payments.checkout.created"
  | "payments.webhook.received"
  | "payments.payment.outcome"
  | "payments.refund.requested"
  | "payments.refund.completed"
  | "payments.reconciliation.completed"
  | "payments.provider.degraded"
  | "payments.provider.recovered"
  | "payments.rate_limited"
  | "payments.subscription.renewal.claimed"
  | "payments.subscription.renewal.succeeded"
  | "payments.subscription.renewal.failed"
  | "payments.subscription.past_due"
  | "payments.subscription.retry_exhausted"
  | "payments.subscription.cancelled";

export interface PaymentObservationInput {
  readonly name: PaymentObservationName;
  readonly severity: PlatformObservationSeverity;
  readonly destinationId: string;
  readonly correlationId: string;
  readonly occurredAt?: string;
  readonly tenantId?: string;
  readonly causationId?: string;
  readonly attributes?: PlatformObservationAttributes;
}

export interface PaymentObservationSink {
  observe(observation: PlatformObservation): void | Promise<void>;
}

export function createPaymentObservation(
  input: PaymentObservationInput,
): PlatformObservation {
  return createPlatformObservation({
    kind:
      input.severity === "critical" || input.severity === "error"
        ? "alert"
        : "metric",
    name: input.name,
    severity: input.severity,
    destinationId: input.destinationId,
    correlationId: input.correlationId,
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {}),
    ...(input.attributes ? { attributes: input.attributes } : {}),
  });
}

export class PaymentObservationEmitter {
  public constructor(private readonly sink: PaymentObservationSink) {}

  public emit(input: PaymentObservationInput): Promise<void> {
    const observation = createPaymentObservation(input);
    return Promise.resolve(this.sink.observe(observation));
  }
}
