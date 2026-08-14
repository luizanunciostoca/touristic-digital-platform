import { createHash } from "node:crypto";

import {
  applyVerifiedProviderPaymentEvent,
  normalizeFinancialEventId,
  normalizeFinancialTimestamp,
  normalizeVerifiedPaymentResult,
  normalizeVerifiedProviderPaymentEvent,
  type Payment,
  type PaymentRepositoryPort,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
  type VerifiedProviderPaymentEvent,
} from "@touristic/financial";

export type VerifiedPaymentOutcomeDisposition =
  | "applied"
  | "replayed"
  | "recovered"
  | "no_change"
  | "unmatched"
  | "stale"
  | "deferred";

export interface VerifiedPaymentOutcome {
  readonly disposition: VerifiedPaymentOutcomeDisposition;
  readonly payment: Payment | null;
  readonly result: VerifiedPaymentResult | null;
}

export interface VerifiedPaymentOutcomeApplicationPort {
  apply(event: VerifiedProviderPaymentEvent): Promise<VerifiedPaymentOutcome>;
}

export interface VerifiedPaymentOutcomeServiceDependencies {
  readonly payments: PaymentRepositoryPort;
  readonly results: VerifiedPaymentResultRepositoryPort;
  readonly clock: { now(): string };
}

function deterministicResultId(
  payment: Payment,
): VerifiedPaymentResult["resultId"] {
  const digest = createHash("sha256")
    .update(`verified-payment:v1:${payment.id}:${payment.status}`)
    .digest("hex")
    .slice(0, 32);
  const id = normalizeFinancialEventId("fev_" + digest);
  if (!id) throw new Error("FINANCIAL_PAYMENT_RESULT_ID_INVALID");
  return id;
}

function canonicalNow(clock: { now(): string }): string {
  const value = normalizeFinancialTimestamp(clock.now());
  if (!value) throw new Error("FINANCIAL_PAYMENT_RESULT_CLOCK_INVALID");
  return new Date(value).toISOString();
}

export function createVerifiedPaymentOutcomeService(
  dependencies: VerifiedPaymentOutcomeServiceDependencies,
): VerifiedPaymentOutcomeApplicationPort {
  return Object.freeze({
    async apply(
      eventInput: VerifiedProviderPaymentEvent,
    ): Promise<VerifiedPaymentOutcome> {
      const event = normalizeVerifiedProviderPaymentEvent(eventInput);
      if (!event) throw new Error("FINANCIAL_PROVIDER_EVENT_INVALID");
      const exact = await dependencies.results.findByProviderEventId(
        event.providerEventId,
      );
      if (exact) {
        const payment = await dependencies.payments.findById(exact.paymentId);
        if (!payment) throw new Error("FINANCIAL_PAYMENT_RESULT_INCONSISTENT");
        return Object.freeze({
          disposition: "replayed" as const,
          payment,
          result: exact,
        });
      }

      const payment = await dependencies.payments.findById(
        event.externalReference,
      );
      if (!payment) {
        return Object.freeze({
          disposition: "unmatched" as const,
          payment: null,
          result: null,
        });
      }
      const transition = applyVerifiedProviderPaymentEvent(payment, event);
      if (
        transition.disposition === "stale" ||
        transition.disposition === "deferred"
      ) {
        return Object.freeze({
          disposition: transition.disposition,
          payment,
          result: null,
        });
      }

      const targetStatus = transition.payment.status;
      const existing =
        transition.resultKind && targetStatus !== "pending"
          ? await dependencies.results.findByPaymentStatus(
              payment.id,
              targetStatus,
            )
          : null;
      if (existing) {
        return Object.freeze({
          disposition: "no_change" as const,
          payment: transition.payment,
          result: existing,
        });
      }

      const persistedPayment =
        transition.disposition === "applied"
          ? await dependencies.payments.save(transition.payment)
          : transition.payment;
      if (!transition.resultKind || persistedPayment.status === "pending") {
        throw new Error("FINANCIAL_PAYMENT_RESULT_TRANSITION_INVALID");
      }
      const result = normalizeVerifiedPaymentResult({
        resultId: deterministicResultId(persistedPayment),
        providerEventId: event.providerEventId,
        paymentId: persistedPayment.id,
        orderReference: persistedPayment.subject.reference,
        kind: transition.resultKind,
        paymentStatus: persistedPayment.status,
        paymentReference: persistedPayment.providerReference,
        occurredAt: event.occurredAt,
        recordedAt: canonicalNow(dependencies.clock),
      });
      if (!result) throw new Error("FINANCIAL_PAYMENT_RESULT_INVALID");
      const savedResult = await dependencies.results.save(result);
      return Object.freeze({
        disposition:
          transition.disposition === "applied"
            ? ("applied" as const)
            : ("recovered" as const),
        payment: persistedPayment,
        result: savedResult,
      });
    },
  });
}
