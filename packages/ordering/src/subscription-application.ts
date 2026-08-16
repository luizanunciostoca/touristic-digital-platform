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

export interface SubscriptionRecurrenceDependencies {
  readonly subscriptions: SubscriptionRepositoryPort;
  readonly renewalIntents: SubscriptionRenewalIntentRepositoryPort;
  readonly clock: SubscriptionRecurrenceClockPort;
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
  | "advanced"
  | "past_due"
  | "replayed";

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
  const subscription = await dependencies.subscriptions.findById(subscriptionId);
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
    }): Promise<SubscriptionRenewalPreparationResult> {
      const subscription = await loadSubscription(
        dependencies,
        input.subscriptionId,
      );
      const now = canonicalTimestamp(dependencies.clock.now());
      const dueAt = subscription.currentPeriod.endAt;

      if (subscription.status === "cancelled") {
        return Object.freeze({
          disposition: "already_cancelled" as const,
          subscription,
          intent: null,
        });
      }
      if (subscription.status === "past_due") {
        return Object.freeze({
          disposition: "blocked_past_due" as const,
          subscription,
          intent: null,
        });
      }
      if (subscription.status === "cancel_at_period_end") {
        if (Date.parse(now) < Date.parse(dueAt)) {
          return Object.freeze({
            disposition: "not_due" as const,
            subscription,
            intent: null,
          });
        }
        const cancelled = finalizeSubscriptionCancellation({
          subscription,
          effectiveAt: now,
        });
        if (!cancelled) failure("SUBSCRIPTION_RECURRENCE_STATE_CONFLICT");
        const persisted = await dependencies.subscriptions.save(cancelled);
        return Object.freeze({
          disposition: "cancelled" as const,
          subscription: persisted,
          intent: null,
        });
      }

      if (Date.parse(now) < Date.parse(dueAt)) {
        return Object.freeze({
          disposition: "not_due" as const,
          subscription,
          intent: null,
        });
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
        return Object.freeze({
          disposition: "renewal_replayed" as const,
          subscription,
          intent: existing,
        });
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
        return Object.freeze({
          disposition: claim.claimed
            ? ("renewal_claimed" as const)
            : ("renewal_replayed" as const),
          subscription,
          intent: claim.intent,
        });
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
        return Object.freeze({
          disposition: "replayed" as const,
          subscription,
          intent,
        });
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
      return Object.freeze({
        disposition:
          persisted.status === "past_due"
            ? ("past_due" as const)
            : ("advanced" as const),
        subscription: persisted,
        intent,
      });
    },
  });
}
