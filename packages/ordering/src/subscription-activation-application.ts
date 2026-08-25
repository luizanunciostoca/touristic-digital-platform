import {
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type PaymentId,
  type VerifiedPaymentResultRepositoryPort,
} from "@touristic/financial";

import {
  normalizeOrderId,
  type OrderRepositoryPort,
} from "./index.js";
import {
  createActiveSubscription,
  normalizeSubscriptionId,
  type Subscription,
  type SubscriptionRepositoryPort,
} from "./subscription.js";

export interface SubscriptionActivationClockPort {
  now(): unknown;
}

export interface SubscriptionActivationDependencies {
  readonly orders: OrderRepositoryPort;
  readonly subscriptions: SubscriptionRepositoryPort;
  readonly verifiedPayments: VerifiedPaymentResultRepositoryPort;
  readonly clock: SubscriptionActivationClockPort;
}

export type SubscriptionActivationDisposition = "created" | "replayed";

export interface SubscriptionActivationResult {
  readonly disposition: SubscriptionActivationDisposition;
  readonly subscription: Subscription;
}

export const subscriptionActivationErrorCodes = Object.freeze([
  "SUBSCRIPTION_ACTIVATION_INVALID_ORDER_ID",
  "SUBSCRIPTION_ACTIVATION_INVALID_PAYMENT_ID",
  "SUBSCRIPTION_ACTIVATION_ORDER_NOT_FOUND",
  "SUBSCRIPTION_ACTIVATION_ORDER_NOT_ELIGIBLE",
  "SUBSCRIPTION_ACTIVATION_PAYMENT_NOT_VERIFIED",
  "SUBSCRIPTION_ACTIVATION_INVALID_CLOCK",
  "SUBSCRIPTION_ACTIVATION_INVALID_STATE",
] as const);

export type SubscriptionActivationErrorCode =
  (typeof subscriptionActivationErrorCodes)[number];

export class SubscriptionActivationError extends Error {
  readonly code: SubscriptionActivationErrorCode;

  constructor(code: SubscriptionActivationErrorCode) {
    super(code);
    this.name = "SubscriptionActivationError";
    this.code = code;
  }
}

function failure(code: SubscriptionActivationErrorCode): never {
  throw new SubscriptionActivationError(code);
}

function canonicalTimestamp(value: unknown): string {
  const normalized = normalizeFinancialTimestamp(value);
  if (!normalized) failure("SUBSCRIPTION_ACTIVATION_INVALID_CLOCK");
  return new Date(normalized).toISOString();
}

function requirePaymentId(value: unknown): PaymentId {
  const paymentId = normalizePaymentId(value);
  if (!paymentId) failure("SUBSCRIPTION_ACTIVATION_INVALID_PAYMENT_ID");
  return paymentId;
}

function subscriptionIdFromOrderId(orderId: string): string {
  const subscriptionId = normalizeSubscriptionId(`sub_${orderId.slice(4)}`);
  if (!subscriptionId) failure("SUBSCRIPTION_ACTIVATION_INVALID_STATE");
  return subscriptionId;
}

function nextCalendarMonth(startAt: string): string {
  const start = new Date(startAt);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const targetYear = month === 11 ? year + 1 : year;
  const targetMonth = (month + 1) % 12;
  const lastTargetDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const end = new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastTargetDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
  return end.toISOString();
}

export function createSubscriptionActivationApplicationService(
  dependencies: SubscriptionActivationDependencies,
) {
  return Object.freeze({
    async activate(input: {
      readonly orderId: unknown;
      readonly paymentId: unknown;
    }): Promise<SubscriptionActivationResult> {
      const orderId = normalizeOrderId(input.orderId);
      if (!orderId) failure("SUBSCRIPTION_ACTIVATION_INVALID_ORDER_ID");
      const paymentId = requirePaymentId(input.paymentId);

      const order = await dependencies.orders.findById(orderId);
      if (!order) failure("SUBSCRIPTION_ACTIVATION_ORDER_NOT_FOUND");
      if (
        order.source.kind !== "business_onboarding" ||
        order.status !== "payment_confirmed"
      ) {
        failure("SUBSCRIPTION_ACTIVATION_ORDER_NOT_ELIGIBLE");
      }

      const verifiedPayment =
        await dependencies.verifiedPayments.findByPaymentStatus(
          paymentId,
          "confirmed",
        );
      if (
        !verifiedPayment ||
        verifiedPayment.kind !== "approved" ||
        verifiedPayment.paymentStatus !== "confirmed" ||
        verifiedPayment.orderReference !== order.id ||
        verifiedPayment.paymentId !== paymentId
      ) {
        failure("SUBSCRIPTION_ACTIVATION_PAYMENT_NOT_VERIFIED");
      }

      const subscriptionId = subscriptionIdFromOrderId(order.id);
      const existing = await dependencies.subscriptions.findById(
        normalizeSubscriptionId(subscriptionId)!,
      );
      if (existing) {
        return Object.freeze({
          disposition: "replayed" as const,
          subscription: existing,
        });
      }

      const now = canonicalTimestamp(dependencies.clock.now());
      if (Date.parse(now) < Date.parse(verifiedPayment.recordedAt)) {
        failure("SUBSCRIPTION_ACTIVATION_INVALID_CLOCK");
      }
      const periodStartAt = canonicalTimestamp(verifiedPayment.occurredAt);
      const periodEndAt = nextCalendarMonth(periodStartAt);
      const subscription = createActiveSubscription({
        id: subscriptionId,
        order,
        verifiedPayment,
        periodStartAt,
        periodEndAt,
        createdAt: now,
      });
      if (!subscription) failure("SUBSCRIPTION_ACTIVATION_INVALID_STATE");

      const persisted = await dependencies.subscriptions.save(subscription);
      return Object.freeze({
        disposition: "created" as const,
        subscription: persisted,
      });
    },
  });
}
