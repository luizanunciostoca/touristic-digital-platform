import type {
  PaymentObservationEmitter,
  PaymentObservationName,
} from "./payment-observation.js";

export interface SubscriptionRecurrenceObservationInput {
  readonly destinationId: string;
  readonly correlationId: string;
  readonly subscriptionId: string;
  readonly periodNumber: number;
  readonly orderId: string;
  readonly paymentId?: string;
  readonly verifiedResultId?: string;
  readonly tenantId?: string;
  readonly causationId?: string;
  readonly occurredAt?: string;
}

export interface SubscriptionRecurrenceObservationPort {
  emitRenewalClaimed(
    input: SubscriptionRecurrenceObservationInput,
  ): Promise<void>;
  emitRenewalSucceeded(
    input: SubscriptionRecurrenceObservationInput,
  ): Promise<void>;
  emitRenewalFailed(
    input: SubscriptionRecurrenceObservationInput,
  ): Promise<void>;
  emitPastDue(input: SubscriptionRecurrenceObservationInput): Promise<void>;
  emitRetryExhausted(
    input: SubscriptionRecurrenceObservationInput,
  ): Promise<void>;
  emitCancelled(input: SubscriptionRecurrenceObservationInput): Promise<void>;
}

function buildAttributes(
  input: SubscriptionRecurrenceObservationInput,
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {
    subscriptionId: input.subscriptionId,
    periodNumber: input.periodNumber,
    orderId: input.orderId,
  };
  if (input.paymentId) attributes.paymentId = input.paymentId;
  if (input.verifiedResultId)
    attributes.verifiedResultId = input.verifiedResultId;
  return attributes;
}

export function createSubscriptionRecurrenceObservationService(
  emitter: PaymentObservationEmitter,
): SubscriptionRecurrenceObservationPort {
  async function emit(
    name: PaymentObservationName,
    severity: "info" | "warn" | "error" | "critical",
    input: SubscriptionRecurrenceObservationInput,
  ): Promise<void> {
    await emitter.emit({
      name,
      severity,
      destinationId: input.destinationId,
      correlationId: input.correlationId,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
      attributes: buildAttributes(input),
    });
  }

  return Object.freeze({
    emitRenewalClaimed: (input: SubscriptionRecurrenceObservationInput) =>
      emit("payments.subscription.renewal.claimed", "info", input),
    emitRenewalSucceeded: (input: SubscriptionRecurrenceObservationInput) =>
      emit("payments.subscription.renewal.succeeded", "info", input),
    emitRenewalFailed: (input: SubscriptionRecurrenceObservationInput) =>
      emit("payments.subscription.renewal.failed", "warn", input),
    emitPastDue: (input: SubscriptionRecurrenceObservationInput) =>
      emit("payments.subscription.past_due", "error", input),
    emitRetryExhausted: (input: SubscriptionRecurrenceObservationInput) =>
      emit("payments.subscription.retry_exhausted", "critical", input),
    emitCancelled: (input: SubscriptionRecurrenceObservationInput) =>
      emit("payments.subscription.cancelled", "info", input),
  });
}
