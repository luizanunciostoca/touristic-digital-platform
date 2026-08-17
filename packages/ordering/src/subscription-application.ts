import {
  normalizeFinancialTimestamp,
  type VerifiedPaymentResult,
} from "@touristic/financial";

import { normalizeOrderId, type OrderId } from "./index.js";
import {
  applyVerifiedSubscriptionRenewal,
  applyVerifiedSubscriptionRenewalFailure,
  createSubscriptionRenewalRequestKey,
  finalizeSubscriptionCancellation,
  normalizeSubscriptionId,
  prepareSubscriptionRenewal,
  type Subscription,
  type SubscriptionId,
  type SubscriptionRenewalIntent,
  type SubscriptionRenewalIntentRepositoryPort,
  type SubscriptionRepositoryPort,
} from "./subscription.js";

export interface SubscriptionRecurrenceClockPort {
  now(): unknown;
}

export interface SubscriptionRecurrenceObservation {
  readonly action: "renewal.prepare" | "renewal.apply_verified_outcome";
  readonly disposition:
    | SubscriptionRenewalPreparationDisposition
    | SubscriptionRenewalOutcomeDisposition;
  readonly subscriptionId: string;
  readonly periodNumber: number;
  readonly orderId: string | null;
  readonly verifiedResultId: string | null;
  readonly correlationId: string;
  readonly severity: "info" | "warn";
}

export interface SubscriptionRecurrenceObservationPort {
  record(event: SubscriptionRecurrenceObservation): void;
}

export interface SubscriptionRecurrenceDependencies {
  readonly subscriptions: SubscriptionRepositoryPort;
  readonly renewalIntents: SubscriptionRenewalIntentRepositoryPort;
  readonly clock: SubscriptionRecurrenceClockPort;
  readonly observations?: SubscriptionRecurrenceObservationPort;
}

export type SubscriptionRenewalPreparationDisposition =
  | "not_due"
  | "renewal_claimed"
  | "renewal_replayed"
  | "cancelled"
  | "blocked_past_due"
  | "already_cancelled";

export interface SubscriptionRenewalPreparationResult {
  readonly disposition: SubscriptionRenewalPreparationDisposition;
  readonly subscription: Subscription;
  readonly intent: SubscriptionRenewalIntent | null;
}

export type SubscriptionRenewalOutcomeDisposition =
  "advanced" | "past_due" | "replayed";

export interface SubscriptionRenewalOutcomeResult {
  readonly disposition: SubscriptionRenewalOutcomeDisposition;
  readonly subscription: Subscription;
  readonly intent: SubscriptionRenewalIntent;
}

export const subscriptionRecurrenceErrorCodes = Object.freeze([
  "SUBSCRIPTION_RECURRENCE_INVALID_ID",
  "SUBSCRIPTION_RECURRENCE_NOT_FOUND",
  "SUBSCRIPTION_RECURRENCE_INVALID_CLOCK",
  "SUBSCRIPTION_RECURRENCE_INVALID_RENEWAL_ORDER",
  "SUBSCRIPTION_RECURRENCE_INVALID_PERIOD_END",
  "SUBSCRIPTION_RECURRENCE_INVALID_INTENT",
  "SUBSCRIPTION_RECURRENCE_INTENT_CONFLICT",
  "SUBSCRIPTION_RECURRENCE_OUTCOME_NOT_CLAIMED",
  "SUBSCRIPTION_RECURRENCE_INVALID_VERIFIED_OUTCOME",
  "SUBSCRIPTION_RECURRENCE_STATE_CONFLICT",
] as const);

export type SubscriptionRecurrenceErrorCode =
  (typeof subscriptionRecurrenceErrorCodes)[number];

export class SubscriptionRecurrenceError extends Error {
  readonly code: SubscriptionRecurrenceErrorCode;

  constructor(code: SubscriptionRecurrenceErrorCode) {
    super(code);
    this.name = "SubscriptionRecurrenceError";
    this.code = code;
  }
}

function failure(code: SubscriptionRecurrenceErrorCode): never {
  throw new SubscriptionRecurrenceError(code);
}

function canonicalTimestamp(value: unknown): string {
  const normalized = normalizeFinancialTimestamp(value);
  if (!normalized) failure("SUBSCRIPTION_RECURRENCE_INVALID_CLOCK");
  return new Date(normalized).toISOString();
}

function requireSubscriptionId(value: unknown): SubscriptionId {
  const subscriptionId = normalizeSubscriptionId(value);
  if (!subscriptionId) failure("SUBSCRIPTION_RECURRENCE_INVALID_ID");
  return subscriptionId;
}

function requireRenewalOrderId(value: unknown): OrderId {
  const orderId = normalizeOrderId(value);
  if (!orderId) failure("SUBSCRIPTION_RECURRENCE_INVALID_RENEWAL_ORDER");
  return orderId;
}

function recurrenceCorrelationId(
  value: unknown,
  subscriptionId: string,
  periodNumber: number,
  action: string,
): string {
  const supplied = typeof value === "string" ? value.trim() : "";
  if (/^[A-Za-z0-9._:-]{1,160}$/u.test(supplied)) return supplied;
  return `recurrence:${subscriptionId}:period:${periodNumber}:${action}`.slice(
    0,
    160,
  );
}

function recordObservation(
  dependencies: SubscriptionRecurrenceDependencies,
  event: SubscriptionRecurrenceObservation,
): void {
  try {
    dependencies.observations?.record(Object.freeze({ ...event }));
  } catch {
    // Observability is read-only and cannot change Subscription/Financial authority.
  }
}

function observePreparation(
  dependencies: SubscriptionRecurrenceDependencies,
  result: SubscriptionRenewalPreparationResult,
  requestedCorrelationId: unknown,
): SubscriptionRenewalPreparationResult {
  const periodNumber =
    result.intent?.periodNumber ?? result.subscription.currentPeriod.number;
  recordObservation(dependencies, {
    action: "renewal.prepare",
    disposition: result.disposition,
    subscriptionId: result.subscription.id,
    periodNumber,
    orderId: result.intent?.orderId ?? null,
    verifiedResultId: null,
    correlationId: recurrenceCorrelationId(
      requestedCorrelationId,
      result.subscription.id,
      periodNumber,
      "prepare",
    ),
    severity:
      result.disposition === "blocked_past_due" ? "warn" : "info",
  });
  return result;
}

function observeOutcome(
  dependencies: SubscriptionRecurrenceDependencies,
  result: SubscriptionRenewalOutcomeResult,
  verifiedOutcome: VerifiedPaymentResult,
  requestedCorrelationId: unknown,
): SubscriptionRenewalOutcomeResult {
  recordObservation(dependencies, {
    action: "renewal.apply_verified_outcome",
    disposition: result.disposition,
    subscriptionId: result.subscription.id,
    periodNumber: result.intent.periodNumber,
    orderId: result.intent.orderId,
    verifiedResultId: verifiedOutcome.resultId,
    correlationId: recurrenceCorrelationId(
      requestedCorrelationId,
      result.subscription.id,
      result.intent.periodNumber,
      "outcome",
    ),
    severity: result.disposition === "past_due" ? "warn" : "info",
  });
  return result;
}

function sameIntent(
  left: SubscriptionRenewalIntent,
  right: SubscriptionRenewalIntent,
): boolean {
  return (
    left.subscriptionId === right.subscriptionId &&
    left.periodNumber === right.periodNumber &&
    left.requestKey === right.requestKey &&
    left.orderId === right.orderId &&
    left.dueAt === right.dueAt &&
    left.periodStartAt === right.periodStartAt &&
    left.periodEndAt === right.periodEndAt &&
    left.pricing.planId === right.pricing.planId &&
    left.pricing.planName === right.pricing.planName &&
    left.pricing.amount.minorUnits === right.pricing.amount.minorUnits &&
    left.pricing.amount.currency === right.pricing.amount.currency &&
    left.pricing.pricingVersion === right.pricing.pricingVersion &&
    left.pricing.capturedAt === right.pricing.capturedAt &&
    left.preparedAt === right.preparedAt
  );
}

function replayedOutcomeMatches(
  subscription: Subscription,
  intent: SubscriptionRenewalIntent,
  outcome: VerifiedPaymentResult,
): boolean {
  if (
    subscription.status === "active" &&
    subscription.currentPeriod.number === intent.periodNumber &&
    subscription.currentPeriod.orderId === intent.orderId
  ) {
    return (
      outcome.kind === "approved" &&
      outcome.paymentStatus === "confirmed" &&
      subscription.currentPeriod.paymentId === outcome.paymentId &&
      subscription.currentPeriod.verifiedResultId === outcome.resultId
    );
  }

  const evidence = subscription.pastDueEvidence;
  return Boolean(
    subscription.status === "past_due" &&
    evidence &&
    evidence.periodNumber === intent.periodNumber &&
    evidence.renewalOrderId === intent.orderId &&
    evidence.paymentId === outcome.paymentId &&
    evidence.verifiedResultId === outcome.resultId &&
    evidence.kind === outcome.kind,
  );
}

async function loadSubscription(
  dependencies: SubscriptionRecurrenceDependencies,
  input: unknown,
): Promise<Subscription> {
  const subscriptionId = requireSubscriptionId(input);
  const subscription =
    await dependencies.subscriptions.findById(subscriptionId);
  if (!subscription) failure("SUBSCRIPTION_RECURRENCE_NOT_FOUND");
  return subscription;
}

export function createSubscriptionRecurrenceApplicationService(
  dependencies: SubscriptionRecurrenceDependencies,
) {
  return Object.freeze({
    async prepareDueRenewal(input: {
      readonly subscriptionId: unknown;
      readonly renewalOrderId: unknown;
      readonly nextPeriodEndAt: unknown;
      readonly correlationId?: unknown;
    }): Promise<SubscriptionRenewalPreparationResult> {
      const subscription = await loadSubscription(
        dependencies,
        input.subscriptionId,
      );
      const now = canonicalTimestamp(dependencies.clock.now());
      const dueAt = subscription.currentPeriod.endAt;

      if (subscription.status === "cancelled") {
        return observePreparation(
          dependencies,
          Object.freeze({
            disposition: "already_cancelled" as const,
            subscription,
            intent: null,
          }),
          input.correlationId,
        );
      }
      if (subscription.status === "past_due") {
        return observePreparation(
          dependencies,
          Object.freeze({
            disposition: "blocked_past_due" as const,
            subscription,
            intent: null,
          }),
          input.correlationId,
        );
      }
      if (subscription.status === "cancel_at_period_end") {
        if (Date.parse(now) < Date.parse(dueAt)) {
          return observePreparation(
            dependencies,
            Object.freeze({
              disposition: "not_due" as const,
              subscription,
              intent: null,
            }),
            input.correlationId,
          );
        }
        const cancelled = finalizeSubscriptionCancellation({
          subscription,
          effectiveAt: now,
        });
        if (!cancelled) failure("SUBSCRIPTION_RECURRENCE_STATE_CONFLICT");
        const persisted = await dependencies.subscriptions.save(cancelled);
        return observePreparation(
          dependencies,
          Object.freeze({
            disposition: "cancelled" as const,
            subscription: persisted,
            intent: null,
          }),
          input.correlationId,
        );
      }

      if (Date.parse(now) < Date.parse(dueAt)) {
        return observePreparation(
          dependencies,
          Object.freeze({
            disposition: "not_due" as const,
            subscription,
            intent: null,
          }),
          input.correlationId,
        );
      }

      const periodNumber = subscription.currentPeriod.number + 1;
      const requestKey = createSubscriptionRenewalRequestKey(
        subscription.id,
        periodNumber,
      );
      if (!requestKey) failure("SUBSCRIPTION_RECURRENCE_INVALID_INTENT");
      const existing =
        await dependencies.renewalIntents.findByRequestKey(requestKey);
      if (existing) {
        return observePreparation(
          dependencies,
          Object.freeze({
            disposition: "renewal_replayed" as const,
            subscription,
            intent: existing,
          }),
          input.correlationId,
        );
      }

      const renewalOrderId = requireRenewalOrderId(input.renewalOrderId);
      if (renewalOrderId === subscription.currentPeriod.orderId) {
        failure("SUBSCRIPTION_RECURRENCE_INVALID_RENEWAL_ORDER");
      }
      const nextPeriodEndAt = canonicalTimestamp(input.nextPeriodEndAt);
      if (Date.parse(nextPeriodEndAt) <= Date.parse(dueAt)) {
        failure("SUBSCRIPTION_RECURRENCE_INVALID_PERIOD_END");
      }
      const intent = prepareSubscriptionRenewal({
        subscription,
        renewalOrderId,
        nextPeriodEndAt,
        preparedAt: now,
      });
      if (!intent) failure("SUBSCRIPTION_RECURRENCE_INVALID_INTENT");

      try {
        const claim = await dependencies.renewalIntents.claim(intent);
        if (!sameIntent(claim.intent, intent)) {
          failure("SUBSCRIPTION_RECURRENCE_INTENT_CONFLICT");
        }
        return observePreparation(
          dependencies,
          Object.freeze({
            disposition: claim.claimed
              ? ("renewal_claimed" as const)
              : ("renewal_replayed" as const),
            subscription,
            intent: claim.intent,
          }),
          input.correlationId,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "ORDERING_SUBSCRIPTION_RENEWAL_CLAIM_CONFLICT"
        ) {
          failure("SUBSCRIPTION_RECURRENCE_INTENT_CONFLICT");
        }
        throw error;
      }
    },

    async applyVerifiedOutcome(input: {
      readonly subscriptionId: unknown;
      readonly verifiedOutcome: VerifiedPaymentResult;
      readonly correlationId?: unknown;
    }): Promise<SubscriptionRenewalOutcomeResult> {
      const subscription = await loadSubscription(
        dependencies,
        input.subscriptionId,
      );
      const periodNumber =
        subscription.status === "past_due"
          ? (subscription.pastDueEvidence?.periodNumber ??
            subscription.currentPeriod.number + 1)
          : input.verifiedOutcome.orderReference ===
                subscription.currentPeriod.orderId &&
              input.verifiedOutcome.resultId ===
                subscription.currentPeriod.verifiedResultId
            ? subscription.currentPeriod.number
            : subscription.currentPeriod.number + 1;
      const requestKey = createSubscriptionRenewalRequestKey(
        subscription.id,
        periodNumber,
      );
      if (!requestKey) failure("SUBSCRIPTION_RECURRENCE_OUTCOME_NOT_CLAIMED");
      const intent =
        await dependencies.renewalIntents.findByRequestKey(requestKey);
      if (!intent) failure("SUBSCRIPTION_RECURRENCE_OUTCOME_NOT_CLAIMED");

      if (replayedOutcomeMatches(subscription, intent, input.verifiedOutcome)) {
        return observeOutcome(
          dependencies,
          Object.freeze({
            disposition: "replayed" as const,
            subscription,
            intent,
          }),
          input.verifiedOutcome,
          input.correlationId,
        );
      }

      if (subscription.status !== "active") {
        failure("SUBSCRIPTION_RECURRENCE_INVALID_VERIFIED_OUTCOME");
      }
      const now = canonicalTimestamp(dependencies.clock.now());
      const next =
        input.verifiedOutcome.kind === "approved" &&
        input.verifiedOutcome.paymentStatus === "confirmed"
          ? applyVerifiedSubscriptionRenewal({
              subscription,
              intent,
              verifiedPayment: input.verifiedOutcome,
              updatedAt: now,
            })
          : applyVerifiedSubscriptionRenewalFailure({
              subscription,
              intent,
              verifiedFailure: input.verifiedOutcome,
              updatedAt: now,
            });
      if (!next) failure("SUBSCRIPTION_RECURRENCE_INVALID_VERIFIED_OUTCOME");
      const persisted = await dependencies.subscriptions.save(next);
      return observeOutcome(
        dependencies,
        Object.freeze({
          disposition:
            persisted.status === "past_due"
              ? ("past_due" as const)
              : ("advanced" as const),
          subscription: persisted,
          intent,
        }),
        input.verifiedOutcome,
        input.correlationId,
      );
    },
  });
}
