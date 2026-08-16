import {
  normalizeFinancialEventId,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type FinancialEventId,
  type PaymentId,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultKind,
} from "@touristic/financial";

import {
  capturePricingSnapshot,
  normalizeOrderId,
  type Order,
  type OrderId,
  type OrderPricingSnapshot,
} from "./index.js";

const ID_BODY = /^[A-Za-z0-9_-]+$/u;
const RENEWAL_KEY = /^(sub_[A-Za-z0-9_-]+):period:([1-9][0-9]{0,8})$/u;

const subscriptionIdBrand: unique symbol = Symbol("SubscriptionId");
const subscriptionRenewalRequestKeyBrand: unique symbol = Symbol(
  "SubscriptionRenewalRequestKey",
);

export type SubscriptionId = string & {
  readonly [subscriptionIdBrand]: true;
};
export type SubscriptionRenewalRequestKey = string & {
  readonly [subscriptionRenewalRequestKeyBrand]: true;
};

export const subscriptionStatuses = Object.freeze([
  "active",
  "cancel_at_period_end",
  "past_due",
  "cancelled",
] as const);
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export interface SubscriptionPeriod {
  readonly number: number;
  readonly startAt: string;
  readonly endAt: string;
  readonly orderId: OrderId;
  readonly paymentId: PaymentId;
  readonly verifiedResultId: FinancialEventId;
  readonly pricing: OrderPricingSnapshot;
}

export interface SubscriptionPastDueEvidence {
  readonly periodNumber: number;
  readonly renewalOrderId: OrderId;
  readonly paymentId: PaymentId;
  readonly verifiedResultId: FinancialEventId;
  readonly kind: Exclude<
    VerifiedPaymentResultKind,
    "approved" | "refunded"
  >;
  readonly occurredAt: string;
  readonly recordedAt: string;
}

export interface Subscription {
  readonly id: SubscriptionId;
  readonly status: SubscriptionStatus;
  readonly currentPeriod: SubscriptionPeriod;
  readonly cancellationRequestedAt: string | null;
  readonly cancelledAt: string | null;
  readonly pastDueEvidence: SubscriptionPastDueEvidence | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubscriptionRenewalIntent {
  readonly subscriptionId: SubscriptionId;
  readonly periodNumber: number;
  readonly requestKey: SubscriptionRenewalRequestKey;
  readonly orderId: OrderId;
  readonly dueAt: string;
  readonly periodStartAt: string;
  readonly periodEndAt: string;
  readonly pricing: OrderPricingSnapshot;
  readonly preparedAt: string;
}

export interface SubscriptionRepositoryPort {
  findById(subscriptionId: SubscriptionId): Promise<Subscription | null>;
  save(subscription: Subscription): Promise<Subscription>;
}

export interface SubscriptionRenewalClaim {
  readonly claimed: boolean;
  readonly intent: SubscriptionRenewalIntent;
}

export interface SubscriptionRenewalIntentRepositoryPort {
  findByRequestKey(
    requestKey: SubscriptionRenewalRequestKey,
  ): Promise<SubscriptionRenewalIntent | null>;
  claim(intent: SubscriptionRenewalIntent): Promise<SubscriptionRenewalClaim>;
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

function canonicalTimestamp(value: unknown): string {
  const normalized = normalizeFinancialTimestamp(value);
  return normalized ? new Date(normalized).toISOString() : "";
}

function clonePricing(
  pricing: OrderPricingSnapshot,
): OrderPricingSnapshot | null {
  return capturePricingSnapshot(pricing, pricing.capturedAt);
}

function samePricing(
  left: OrderPricingSnapshot,
  right: OrderPricingSnapshot,
): boolean {
  return (
    left.planId === right.planId &&
    left.planName === right.planName &&
    left.pricingVersion === right.pricingVersion &&
    left.capturedAt === right.capturedAt &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency
  );
}

function normalizeVerifiedResultForOrder(
  result: VerifiedPaymentResult,
  orderId: OrderId,
): Readonly<{
  paymentId: PaymentId;
  resultId: FinancialEventId;
  occurredAt: string;
  recordedAt: string;
}> | null {
  const paymentId = normalizePaymentId(result.paymentId);
  const resultId = normalizeFinancialEventId(result.resultId);
  const occurredAt = canonicalTimestamp(result.occurredAt);
  const recordedAt = canonicalTimestamp(result.recordedAt);
  if (
    !paymentId ||
    !resultId ||
    !occurredAt ||
    !recordedAt ||
    Date.parse(recordedAt) < Date.parse(occurredAt) ||
    result.orderReference !== orderId
  ) {
    return null;
  }
  return Object.freeze({ paymentId, resultId, occurredAt, recordedAt });
}

function isVerifiedApproval(result: VerifiedPaymentResult): boolean {
  return result.kind === "approved" && result.paymentStatus === "confirmed";
}

function isVerifiedRenewalFailure(
  result: VerifiedPaymentResult,
): result is VerifiedPaymentResult & {
  readonly kind: "failed" | "cancelled" | "expired";
} {
  return (
    (result.kind === "failed" && result.paymentStatus === "failed") ||
    (result.kind === "cancelled" && result.paymentStatus === "cancelled") ||
    (result.kind === "expired" && result.paymentStatus === "expired")
  );
}

function createPeriod(input: {
  readonly number: number;
  readonly startAt: unknown;
  readonly endAt: unknown;
  readonly orderId: unknown;
  readonly paymentId: unknown;
  readonly verifiedResultId: unknown;
  readonly pricing: OrderPricingSnapshot;
}): SubscriptionPeriod | null {
  const startAt = canonicalTimestamp(input.startAt);
  const endAt = canonicalTimestamp(input.endAt);
  const orderId = normalizeOrderId(input.orderId);
  const paymentId = normalizePaymentId(input.paymentId);
  const verifiedResultId = normalizeFinancialEventId(input.verifiedResultId);
  const pricing = clonePricing(input.pricing);
  if (
    !Number.isSafeInteger(input.number) ||
    input.number < 1 ||
    input.number > 999_999_999 ||
    !startAt ||
    !endAt ||
    Date.parse(endAt) <= Date.parse(startAt) ||
    !orderId ||
    !paymentId ||
    !verifiedResultId ||
    !pricing
  ) {
    return null;
  }
  return Object.freeze({
    number: input.number,
    startAt,
    endAt,
    orderId,
    paymentId,
    verifiedResultId,
    pricing,
  });
}

function matchesIntent(
  subscription: Subscription,
  intent: SubscriptionRenewalIntent,
): boolean {
  return (
    intent.subscriptionId === subscription.id &&
    intent.periodNumber === subscription.currentPeriod.number + 1 &&
    intent.periodStartAt === subscription.currentPeriod.endAt &&
    intent.dueAt === subscription.currentPeriod.endAt &&
    samePricing(intent.pricing, subscription.currentPeriod.pricing)
  );
}

export function normalizeSubscriptionId(value: unknown): SubscriptionId | null {
  const normalized = normalizeString(value, 120);
  if (!normalized.startsWith("sub_")) return null;
  const body = normalized.slice("sub_".length);
  return body.length >= 8 && ID_BODY.test(body)
    ? (normalized as SubscriptionId)
    : null;
}

export function createSubscriptionRenewalRequestKey(
  subscriptionIdInput: unknown,
  periodNumberInput: unknown,
): SubscriptionRenewalRequestKey | null {
  const subscriptionId = normalizeSubscriptionId(subscriptionIdInput);
  if (
    !subscriptionId ||
    typeof periodNumberInput !== "number" ||
    !Number.isSafeInteger(periodNumberInput) ||
    periodNumberInput < 2 ||
    periodNumberInput > 999_999_999
  ) {
    return null;
  }
  return `${subscriptionId}:period:${periodNumberInput}` as SubscriptionRenewalRequestKey;
}

export function normalizeSubscriptionRenewalRequestKey(
  value: unknown,
): SubscriptionRenewalRequestKey | null {
  const normalized = normalizeString(value, 180);
  const match = RENEWAL_KEY.exec(normalized);
  if (!match) return null;
  const subscriptionId = normalizeSubscriptionId(match[1]);
  const periodNumber = Number.parseInt(match[2] ?? "", 10);
  const expected = createSubscriptionRenewalRequestKey(
    subscriptionId,
    periodNumber,
  );
  return expected === normalized ? expected : null;
}

export function createActiveSubscription(input: {
  readonly id: unknown;
  readonly order: Order;
  readonly verifiedPayment: VerifiedPaymentResult;
  readonly periodStartAt: unknown;
  readonly periodEndAt: unknown;
  readonly createdAt: unknown;
}): Subscription | null {
  const id = normalizeSubscriptionId(input.id);
  const orderId = normalizeOrderId(input.order.id);
  const createdAt = canonicalTimestamp(input.createdAt);
  const verified = orderId
    ? normalizeVerifiedResultForOrder(input.verifiedPayment, orderId)
    : null;
  if (
    !id ||
    !orderId ||
    input.order.status !== "payment_confirmed" ||
    !isVerifiedApproval(input.verifiedPayment) ||
    !verified ||
    !createdAt ||
    Date.parse(createdAt) < Date.parse(verified.recordedAt)
  ) {
    return null;
  }

  const currentPeriod = createPeriod({
    number: 1,
    startAt: input.periodStartAt,
    endAt: input.periodEndAt,
    orderId,
    paymentId: verified.paymentId,
    verifiedResultId: verified.resultId,
    pricing: input.order.pricing,
  });
  if (!currentPeriod) return null;

  return Object.freeze({
    id,
    status: "active" as const,
    currentPeriod,
    cancellationRequestedAt: null,
    cancelledAt: null,
    pastDueEvidence: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function prepareSubscriptionRenewal(input: {
  readonly subscription: Subscription;
  readonly renewalOrderId: unknown;
  readonly nextPeriodEndAt: unknown;
  readonly preparedAt: unknown;
}): SubscriptionRenewalIntent | null {
  const { subscription } = input;
  if (subscription.status !== "active") return null;

  const orderId = normalizeOrderId(input.renewalOrderId);
  const preparedAt = canonicalTimestamp(input.preparedAt);
  const periodEndAt = canonicalTimestamp(input.nextPeriodEndAt);
  const periodStartAt = subscription.currentPeriod.endAt;
  const periodNumber = subscription.currentPeriod.number + 1;
  const requestKey = createSubscriptionRenewalRequestKey(
    subscription.id,
    periodNumber,
  );
  const pricing = clonePricing(subscription.currentPeriod.pricing);
  if (
    !orderId ||
    !preparedAt ||
    !periodEndAt ||
    !requestKey ||
    !pricing ||
    Date.parse(preparedAt) < Date.parse(periodStartAt) ||
    Date.parse(periodEndAt) <= Date.parse(periodStartAt)
  ) {
    return null;
  }

  return Object.freeze({
    subscriptionId: subscription.id,
    periodNumber,
    requestKey,
    orderId,
    dueAt: periodStartAt,
    periodStartAt,
    periodEndAt,
    pricing,
    preparedAt,
  });
}

export function applyVerifiedSubscriptionRenewal(input: {
  readonly subscription: Subscription;
  readonly intent: SubscriptionRenewalIntent;
  readonly verifiedPayment: VerifiedPaymentResult;
  readonly updatedAt: unknown;
}): Subscription | null {
  const { subscription, intent, verifiedPayment } = input;
  const verified = normalizeVerifiedResultForOrder(
    verifiedPayment,
    intent.orderId,
  );
  const updatedAt = canonicalTimestamp(input.updatedAt);
  if (!verified || !isVerifiedApproval(verifiedPayment) || !updatedAt) {
    return null;
  }

  if (
    subscription.status === "active" &&
    subscription.currentPeriod.number === intent.periodNumber &&
    subscription.currentPeriod.orderId === intent.orderId &&
    subscription.currentPeriod.paymentId === verified.paymentId &&
    subscription.currentPeriod.verifiedResultId === verified.resultId
  ) {
    return subscription;
  }

  if (
    subscription.status !== "active" ||
    !matchesIntent(subscription, intent) ||
    Date.parse(verified.occurredAt) < Date.parse(intent.preparedAt) ||
    Date.parse(updatedAt) < Date.parse(verified.recordedAt) ||
    Date.parse(updatedAt) < Date.parse(subscription.updatedAt)
  ) {
    return null;
  }

  const currentPeriod = createPeriod({
    number: intent.periodNumber,
    startAt: intent.periodStartAt,
    endAt: intent.periodEndAt,
    orderId: intent.orderId,
    paymentId: verified.paymentId,
    verifiedResultId: verified.resultId,
    pricing: intent.pricing,
  });
  if (!currentPeriod) return null;

  return Object.freeze({
    ...subscription,
    status: "active" as const,
    currentPeriod,
    pastDueEvidence: null,
    updatedAt,
  });
}

export function applyVerifiedSubscriptionRenewalFailure(input: {
  readonly subscription: Subscription;
  readonly intent: SubscriptionRenewalIntent;
  readonly verifiedFailure: VerifiedPaymentResult;
  readonly updatedAt: unknown;
}): Subscription | null {
  const { subscription, intent, verifiedFailure } = input;
  const verified = normalizeVerifiedResultForOrder(
    verifiedFailure,
    intent.orderId,
  );
  const updatedAt = canonicalTimestamp(input.updatedAt);
  if (
    !verified ||
    !isVerifiedRenewalFailure(verifiedFailure) ||
    !updatedAt
  ) {
    return null;
  }

  const existing = subscription.pastDueEvidence;
  if (
    subscription.status === "past_due" &&
    existing?.periodNumber === intent.periodNumber &&
    existing.renewalOrderId === intent.orderId &&
    existing.paymentId === verified.paymentId &&
    existing.verifiedResultId === verified.resultId &&
    existing.kind === verifiedFailure.kind
  ) {
    return subscription;
  }

  if (
    subscription.status !== "active" ||
    !matchesIntent(subscription, intent) ||
    Date.parse(verified.occurredAt) < Date.parse(intent.preparedAt) ||
    Date.parse(updatedAt) < Date.parse(verified.recordedAt) ||
    Date.parse(updatedAt) < Date.parse(subscription.updatedAt)
  ) {
    return null;
  }

  const pastDueEvidence: SubscriptionPastDueEvidence = Object.freeze({
    periodNumber: intent.periodNumber,
    renewalOrderId: intent.orderId,
    paymentId: verified.paymentId,
    verifiedResultId: verified.resultId,
    kind: verifiedFailure.kind,
    occurredAt: verified.occurredAt,
    recordedAt: verified.recordedAt,
  });

  return Object.freeze({
    ...subscription,
    status: "past_due" as const,
    pastDueEvidence,
    updatedAt,
  });
}

export function scheduleSubscriptionCancellation(input: {
  readonly subscription: Subscription;
  readonly requestedAt: unknown;
}): Subscription | null {
  const { subscription } = input;
  const requestedAt = canonicalTimestamp(input.requestedAt);
  if (!requestedAt) return null;
  if (subscription.status === "cancel_at_period_end") return subscription;
  if (
    subscription.status !== "active" ||
    Date.parse(requestedAt) < Date.parse(subscription.updatedAt) ||
    Date.parse(requestedAt) > Date.parse(subscription.currentPeriod.endAt)
  ) {
    return null;
  }
  return Object.freeze({
    ...subscription,
    status: "cancel_at_period_end" as const,
    cancellationRequestedAt: requestedAt,
    updatedAt: requestedAt,
  });
}

export function finalizeSubscriptionCancellation(input: {
  readonly subscription: Subscription;
  readonly effectiveAt: unknown;
}): Subscription | null {
  const { subscription } = input;
  const effectiveAt = canonicalTimestamp(input.effectiveAt);
  if (!effectiveAt) return null;
  if (subscription.status === "cancelled") return subscription;
  if (
    subscription.status !== "cancel_at_period_end" ||
    Date.parse(effectiveAt) < Date.parse(subscription.currentPeriod.endAt) ||
    Date.parse(effectiveAt) < Date.parse(subscription.updatedAt)
  ) {
    return null;
  }
  return Object.freeze({
    ...subscription,
    status: "cancelled" as const,
    cancelledAt: subscription.currentPeriod.endAt,
    updatedAt: effectiveAt,
  });
}
