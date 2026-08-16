import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  normalizeFinancialEventId,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type FinancialEventId,
  type PaymentId,
} from "@touristic/financial";
import {
  capturePricingSnapshot,
  createPricingQuote,
  normalizeOrderId,
  type OrderId,
  type OrderPricingSnapshot,
} from "@touristic/ordering";
import {
  createSubscriptionRenewalRequestKey,
  normalizeSubscriptionId,
  normalizeSubscriptionRenewalRequestKey,
  subscriptionStatuses,
  type Subscription,
  type SubscriptionId,
  type SubscriptionPastDueEvidence,
  type SubscriptionRenewalClaim,
  type SubscriptionRenewalIntent,
  type SubscriptionRenewalIntentRepositoryPort,
  type SubscriptionRenewalRequestKey,
  type SubscriptionRepositoryPort,
  type SubscriptionStatus,
} from "@touristic/ordering/subscription";

interface SubscriptionRow extends RowDataPacket {
  subscription_id: string;
  status: string;
  current_period_number: number | string;
  current_period_start_at: Date | string;
  current_period_end_at: Date | string;
  current_order_id: string;
  current_payment_id: string;
  current_verified_result_id: string;
  plan_id: string;
  plan_name: string;
  amount_minor: number | string;
  currency: string;
  pricing_version: string;
  pricing_captured_at: Date | string;
  cancellation_requested_at: Date | string | null;
  cancelled_at: Date | string | null;
  past_due_period_number: number | string | null;
  past_due_order_id: string | null;
  past_due_payment_id: string | null;
  past_due_verified_result_id: string | null;
  past_due_kind: string | null;
  past_due_occurred_at: Date | string | null;
  past_due_recorded_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RenewalIntentRow extends RowDataPacket {
  request_key: string;
  subscription_id: string;
  period_number: number | string;
  order_id: string;
  due_at: Date | string;
  period_start_at: Date | string;
  period_end_at: Date | string;
  plan_id: string;
  plan_name: string;
  amount_minor: number | string;
  currency: string;
  pricing_version: string;
  pricing_captured_at: Date | string;
  prepared_at: Date | string;
}

const SUBSCRIPTION_COLUMNS = `
  subscription_id,
  status,
  current_period_number,
  current_period_start_at,
  current_period_end_at,
  current_order_id,
  current_payment_id,
  current_verified_result_id,
  plan_id,
  plan_name,
  amount_minor,
  currency,
  pricing_version,
  pricing_captured_at,
  cancellation_requested_at,
  cancelled_at,
  past_due_period_number,
  past_due_order_id,
  past_due_payment_id,
  past_due_verified_result_id,
  past_due_kind,
  past_due_occurred_at,
  past_due_recorded_at,
  created_at,
  updated_at
`;

const RENEWAL_INTENT_COLUMNS = `
  request_key,
  subscription_id,
  period_number,
  order_id,
  due_at,
  period_start_at,
  period_end_at,
  plan_id,
  plan_name,
  amount_minor,
  currency,
  pricing_version,
  pricing_captured_at,
  prepared_at
`;

function canonicalTimestamp(value: unknown): string | null {
  const candidate = value instanceof Date ? value.toISOString() : value;
  const normalized = normalizeFinancialTimestamp(candidate);
  return normalized ? new Date(normalized).toISOString() : null;
}

function normalizePeriodNumber(value: unknown, minimum: number): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= minimum &&
    parsed <= 999_999_999
    ? parsed
    : null;
}

function normalizeStatus(value: unknown): SubscriptionStatus | null {
  return subscriptionStatuses.includes(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : null;
}

function normalizePricing(input: {
  readonly planId: unknown;
  readonly planName: unknown;
  readonly amountMinor: unknown;
  readonly currency: unknown;
  readonly pricingVersion: unknown;
  readonly capturedAt: unknown;
}): OrderPricingSnapshot | null {
  const minorUnits =
    typeof input.amountMinor === "number"
      ? input.amountMinor
      : Number(input.amountMinor);
  const capturedAt = canonicalTimestamp(input.capturedAt);
  const quote = createPricingQuote({
    planId: input.planId,
    planName: input.planName,
    minorUnits,
    currency: input.currency,
    pricingVersion: input.pricingVersion,
  });
  if (!capturedAt || !quote) return null;
  return capturePricingSnapshot(quote, capturedAt);
}

function samePricing(
  left: OrderPricingSnapshot,
  right: OrderPricingSnapshot,
): boolean {
  return (
    left.planId === right.planId &&
    left.planName === right.planName &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency &&
    left.pricingVersion === right.pricingVersion &&
    left.capturedAt === right.capturedAt
  );
}

function normalizePastDueEvidence(
  value: SubscriptionPastDueEvidence,
  currentPeriodNumber: number,
): SubscriptionPastDueEvidence | null {
  const periodNumber = normalizePeriodNumber(value.periodNumber, 2);
  const renewalOrderId = normalizeOrderId(value.renewalOrderId);
  const paymentId = normalizePaymentId(value.paymentId);
  const verifiedResultId = normalizeFinancialEventId(value.verifiedResultId);
  const occurredAt = canonicalTimestamp(value.occurredAt);
  const recordedAt = canonicalTimestamp(value.recordedAt);
  const kind = value.kind;
  if (
    !periodNumber ||
    periodNumber !== currentPeriodNumber + 1 ||
    !renewalOrderId ||
    !paymentId ||
    !verifiedResultId ||
    (kind !== "failed" && kind !== "cancelled" && kind !== "expired") ||
    !occurredAt ||
    !recordedAt ||
    Date.parse(recordedAt) < Date.parse(occurredAt)
  ) {
    return null;
  }
  return Object.freeze({
    periodNumber,
    renewalOrderId,
    paymentId,
    verifiedResultId,
    kind,
    occurredAt,
    recordedAt,
  });
}

function normalizeSubscriptionSnapshot(
  input: Subscription,
): Subscription | null {
  const id = normalizeSubscriptionId(input.id);
  const status = normalizeStatus(input.status);
  const periodNumber = normalizePeriodNumber(input.currentPeriod.number, 1);
  const periodStartAt = canonicalTimestamp(input.currentPeriod.startAt);
  const periodEndAt = canonicalTimestamp(input.currentPeriod.endAt);
  const orderId = normalizeOrderId(input.currentPeriod.orderId);
  const paymentId = normalizePaymentId(input.currentPeriod.paymentId);
  const verifiedResultId = normalizeFinancialEventId(
    input.currentPeriod.verifiedResultId,
  );
  const pricing = normalizePricing({
    planId: input.currentPeriod.pricing.planId,
    planName: input.currentPeriod.pricing.planName,
    amountMinor: input.currentPeriod.pricing.amount.minorUnits,
    currency: input.currentPeriod.pricing.amount.currency,
    pricingVersion: input.currentPeriod.pricing.pricingVersion,
    capturedAt: input.currentPeriod.pricing.capturedAt,
  });
  const cancellationRequestedAt =
    input.cancellationRequestedAt === null
      ? null
      : canonicalTimestamp(input.cancellationRequestedAt);
  const cancelledAt =
    input.cancelledAt === null ? null : canonicalTimestamp(input.cancelledAt);
  const createdAt = canonicalTimestamp(input.createdAt);
  const updatedAt = canonicalTimestamp(input.updatedAt);

  if (
    !id ||
    !status ||
    !periodNumber ||
    !periodStartAt ||
    !periodEndAt ||
    Date.parse(periodEndAt) <= Date.parse(periodStartAt) ||
    !orderId ||
    !paymentId ||
    !verifiedResultId ||
    !pricing ||
    (input.cancellationRequestedAt !== null && !cancellationRequestedAt) ||
    (input.cancelledAt !== null && !cancelledAt) ||
    !createdAt ||
    !updatedAt ||
    Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    return null;
  }

  const pastDueEvidence = input.pastDueEvidence
    ? normalizePastDueEvidence(input.pastDueEvidence, periodNumber)
    : null;
  if (input.pastDueEvidence && !pastDueEvidence) return null;

  if (
    status === "active" &&
    (cancellationRequestedAt || cancelledAt || pastDueEvidence)
  ) {
    return null;
  }
  if (
    status === "cancel_at_period_end" &&
    (!cancellationRequestedAt ||
      cancelledAt ||
      pastDueEvidence ||
      Date.parse(cancellationRequestedAt) > Date.parse(periodEndAt))
  ) {
    return null;
  }
  if (
    status === "past_due" &&
    (cancellationRequestedAt || cancelledAt || !pastDueEvidence)
  ) {
    return null;
  }
  if (
    status === "cancelled" &&
    (!cancellationRequestedAt ||
      !cancelledAt ||
      pastDueEvidence ||
      cancelledAt !== periodEndAt)
  ) {
    return null;
  }

  return Object.freeze({
    id,
    status,
    currentPeriod: Object.freeze({
      number: periodNumber,
      startAt: periodStartAt,
      endAt: periodEndAt,
      orderId,
      paymentId,
      verifiedResultId,
      pricing,
    }),
    cancellationRequestedAt,
    cancelledAt,
    pastDueEvidence,
    createdAt,
    updatedAt,
  });
}

function subscriptionFromRow(row: SubscriptionRow): Subscription {
  const snapshot = normalizeSubscriptionSnapshot({
    id: row.subscription_id as SubscriptionId,
    status: row.status as SubscriptionStatus,
    currentPeriod: {
      number: Number(row.current_period_number),
      startAt: canonicalTimestamp(row.current_period_start_at) ?? "",
      endAt: canonicalTimestamp(row.current_period_end_at) ?? "",
      orderId: row.current_order_id as OrderId,
      paymentId: row.current_payment_id as PaymentId,
      verifiedResultId: row.current_verified_result_id as FinancialEventId,
      pricing: {
        planId: row.plan_id,
        planName: row.plan_name,
        amount: {
          minorUnits: Number(row.amount_minor),
          currency: row.currency as OrderPricingSnapshot["amount"]["currency"],
        },
        pricingVersion: row.pricing_version,
        capturedAt: canonicalTimestamp(row.pricing_captured_at) ?? "",
      },
    },
    cancellationRequestedAt: row.cancellation_requested_at
      ? canonicalTimestamp(row.cancellation_requested_at)
      : null,
    cancelledAt: row.cancelled_at ? canonicalTimestamp(row.cancelled_at) : null,
    pastDueEvidence:
      row.past_due_period_number === null
        ? null
        : {
            periodNumber: Number(row.past_due_period_number),
            renewalOrderId: row.past_due_order_id as OrderId,
            paymentId: row.past_due_payment_id as PaymentId,
            verifiedResultId:
              row.past_due_verified_result_id as FinancialEventId,
            kind: row.past_due_kind as SubscriptionPastDueEvidence["kind"],
            occurredAt: canonicalTimestamp(row.past_due_occurred_at) ?? "",
            recordedAt: canonicalTimestamp(row.past_due_recorded_at) ?? "",
          },
    createdAt: canonicalTimestamp(row.created_at) ?? "",
    updatedAt: canonicalTimestamp(row.updated_at) ?? "",
  });
  if (!snapshot) throw new Error("ORDERING_INVALID_PERSISTED_SUBSCRIPTION");
  return snapshot;
}

function samePeriod(
  left: Subscription["currentPeriod"],
  right: Subscription["currentPeriod"],
): boolean {
  return (
    left.number === right.number &&
    left.startAt === right.startAt &&
    left.endAt === right.endAt &&
    left.orderId === right.orderId &&
    left.paymentId === right.paymentId &&
    left.verifiedResultId === right.verifiedResultId &&
    samePricing(left.pricing, right.pricing)
  );
}

function samePastDue(
  left: SubscriptionPastDueEvidence | null,
  right: SubscriptionPastDueEvidence | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.periodNumber === right.periodNumber &&
    left.renewalOrderId === right.renewalOrderId &&
    left.paymentId === right.paymentId &&
    left.verifiedResultId === right.verifiedResultId &&
    left.kind === right.kind &&
    left.occurredAt === right.occurredAt &&
    left.recordedAt === right.recordedAt
  );
}

function sameSubscription(left: Subscription, right: Subscription): boolean {
  return (
    left.id === right.id &&
    left.status === right.status &&
    samePeriod(left.currentPeriod, right.currentPeriod) &&
    left.cancellationRequestedAt === right.cancellationRequestedAt &&
    left.cancelledAt === right.cancelledAt &&
    samePastDue(left.pastDueEvidence, right.pastDueEvidence) &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

function canPersistTransition(
  current: Subscription,
  next: Subscription,
): boolean {
  if (
    current.id !== next.id ||
    current.createdAt !== next.createdAt ||
    Date.parse(next.updatedAt) <= Date.parse(current.updatedAt)
  ) {
    return false;
  }

  if (current.status === "active" && next.status === "active") {
    return (
      next.currentPeriod.number === current.currentPeriod.number + 1 &&
      next.currentPeriod.startAt === current.currentPeriod.endAt &&
      samePricing(next.currentPeriod.pricing, current.currentPeriod.pricing) &&
      next.cancellationRequestedAt === null &&
      next.cancelledAt === null &&
      next.pastDueEvidence === null
    );
  }

  if (current.status === "active" && next.status === "past_due") {
    return (
      samePeriod(current.currentPeriod, next.currentPeriod) &&
      next.pastDueEvidence?.periodNumber === current.currentPeriod.number + 1
    );
  }

  if (current.status === "active" && next.status === "cancel_at_period_end") {
    return (
      samePeriod(current.currentPeriod, next.currentPeriod) &&
      next.cancellationRequestedAt === next.updatedAt
    );
  }

  if (
    current.status === "cancel_at_period_end" &&
    next.status === "cancelled"
  ) {
    return (
      samePeriod(current.currentPeriod, next.currentPeriod) &&
      current.cancellationRequestedAt === next.cancellationRequestedAt &&
      next.cancelledAt === next.currentPeriod.endAt
    );
  }

  return false;
}

function normalizeRenewalIntent(
  input: SubscriptionRenewalIntent,
): SubscriptionRenewalIntent | null {
  const subscriptionId = normalizeSubscriptionId(input.subscriptionId);
  const periodNumber = normalizePeriodNumber(input.periodNumber, 2);
  const requestKey = normalizeSubscriptionRenewalRequestKey(input.requestKey);
  const orderId = normalizeOrderId(input.orderId);
  const dueAt = canonicalTimestamp(input.dueAt);
  const periodStartAt = canonicalTimestamp(input.periodStartAt);
  const periodEndAt = canonicalTimestamp(input.periodEndAt);
  const preparedAt = canonicalTimestamp(input.preparedAt);
  const pricing = normalizePricing({
    planId: input.pricing.planId,
    planName: input.pricing.planName,
    amountMinor: input.pricing.amount.minorUnits,
    currency: input.pricing.amount.currency,
    pricingVersion: input.pricing.pricingVersion,
    capturedAt: input.pricing.capturedAt,
  });
  const expectedKey = createSubscriptionRenewalRequestKey(
    subscriptionId,
    periodNumber,
  );
  if (
    !subscriptionId ||
    !periodNumber ||
    !requestKey ||
    requestKey !== expectedKey ||
    !orderId ||
    !dueAt ||
    !periodStartAt ||
    dueAt !== periodStartAt ||
    !periodEndAt ||
    Date.parse(periodEndAt) <= Date.parse(periodStartAt) ||
    !preparedAt ||
    Date.parse(preparedAt) < Date.parse(dueAt) ||
    !pricing
  ) {
    return null;
  }
  return Object.freeze({
    subscriptionId,
    periodNumber,
    requestKey,
    orderId,
    dueAt,
    periodStartAt,
    periodEndAt,
    pricing,
    preparedAt,
  });
}

function renewalIntentFromRow(
  row: RenewalIntentRow,
): SubscriptionRenewalIntent {
  const intent = normalizeRenewalIntent({
    requestKey: row.request_key as SubscriptionRenewalRequestKey,
    subscriptionId: row.subscription_id as SubscriptionId,
    periodNumber: Number(row.period_number),
    orderId: row.order_id as OrderId,
    dueAt: canonicalTimestamp(row.due_at) ?? "",
    periodStartAt: canonicalTimestamp(row.period_start_at) ?? "",
    periodEndAt: canonicalTimestamp(row.period_end_at) ?? "",
    pricing: {
      planId: row.plan_id,
      planName: row.plan_name,
      amount: {
        minorUnits: Number(row.amount_minor),
        currency: row.currency as OrderPricingSnapshot["amount"]["currency"],
      },
      pricingVersion: row.pricing_version,
      capturedAt: canonicalTimestamp(row.pricing_captured_at) ?? "",
    },
    preparedAt: canonicalTimestamp(row.prepared_at) ?? "",
  });
  if (!intent) throw new Error("ORDERING_INVALID_PERSISTED_RENEWAL_INTENT");
  return intent;
}

function sameRenewalIntent(
  left: SubscriptionRenewalIntent,
  right: SubscriptionRenewalIntent,
): boolean {
  return (
    left.requestKey === right.requestKey &&
    left.subscriptionId === right.subscriptionId &&
    left.periodNumber === right.periodNumber &&
    left.orderId === right.orderId &&
    left.dueAt === right.dueAt &&
    left.periodStartAt === right.periodStartAt &&
    left.periodEndAt === right.periodEndAt &&
    samePricing(left.pricing, right.pricing) &&
    left.preparedAt === right.preparedAt
  );
}

type SqlParameter = string | number | Date | null;

function subscriptionParams(subscription: Subscription): SqlParameter[] {
  const pastDue = subscription.pastDueEvidence;
  return [
    subscription.id,
    subscription.status,
    subscription.currentPeriod.number,
    new Date(subscription.currentPeriod.startAt),
    new Date(subscription.currentPeriod.endAt),
    subscription.currentPeriod.orderId,
    subscription.currentPeriod.paymentId,
    subscription.currentPeriod.verifiedResultId,
    subscription.currentPeriod.pricing.planId,
    subscription.currentPeriod.pricing.planName,
    subscription.currentPeriod.pricing.amount.minorUnits,
    subscription.currentPeriod.pricing.amount.currency,
    subscription.currentPeriod.pricing.pricingVersion,
    new Date(subscription.currentPeriod.pricing.capturedAt),
    subscription.cancellationRequestedAt
      ? new Date(subscription.cancellationRequestedAt)
      : null,
    subscription.cancelledAt ? new Date(subscription.cancelledAt) : null,
    pastDue?.periodNumber ?? null,
    pastDue?.renewalOrderId ?? null,
    pastDue?.paymentId ?? null,
    pastDue?.verifiedResultId ?? null,
    pastDue?.kind ?? null,
    pastDue ? new Date(pastDue.occurredAt) : null,
    pastDue ? new Date(pastDue.recordedAt) : null,
    new Date(subscription.createdAt),
    new Date(subscription.updatedAt),
  ];
}

export class MySqlSubscriptionRepository implements SubscriptionRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findById(subscriptionId: SubscriptionId): Promise<Subscription | null> {
    const id = normalizeSubscriptionId(subscriptionId);
    if (!id) throw new Error("ORDERING_INVALID_SUBSCRIPTION_ID");
    const [rows] = await this.pool.execute<SubscriptionRow[]>(
      `SELECT ${SUBSCRIPTION_COLUMNS}
       FROM ordering_subscriptions
       WHERE subscription_id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] ? subscriptionFromRow(rows[0]) : null;
  }

  async save(subscription: Subscription): Promise<Subscription> {
    const normalized = normalizeSubscriptionSnapshot(subscription);
    if (!normalized) throw new Error("ORDERING_INVALID_SUBSCRIPTION");

    await this.pool.execute(
      `INSERT IGNORE INTO ordering_subscriptions (
        subscription_id, status, current_period_number,
        current_period_start_at, current_period_end_at,
        current_order_id, current_payment_id, current_verified_result_id,
        plan_id, plan_name, amount_minor, currency, pricing_version,
        pricing_captured_at, cancellation_requested_at, cancelled_at,
        past_due_period_number, past_due_order_id, past_due_payment_id,
        past_due_verified_result_id, past_due_kind, past_due_occurred_at,
        past_due_recorded_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      subscriptionParams(normalized),
    );

    let persisted = await this.findById(normalized.id);
    if (!persisted) throw new Error("ORDERING_SUBSCRIPTION_NOT_PERSISTED");
    if (sameSubscription(persisted, normalized)) return persisted;
    if (!canPersistTransition(persisted, normalized)) {
      throw new Error("ORDERING_SUBSCRIPTION_TRANSITION_CONFLICT");
    }

    const params = subscriptionParams(normalized);
    const updateParams: SqlParameter[] = [
      ...params.slice(1, 23),
      params[24]!,
      normalized.id,
      new Date(persisted.updatedAt),
    ];
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE ordering_subscriptions
       SET status = ?, current_period_number = ?,
           current_period_start_at = ?, current_period_end_at = ?,
           current_order_id = ?, current_payment_id = ?,
           current_verified_result_id = ?, plan_id = ?, plan_name = ?,
           amount_minor = ?, currency = ?, pricing_version = ?,
           pricing_captured_at = ?, cancellation_requested_at = ?,
           cancelled_at = ?, past_due_period_number = ?, past_due_order_id = ?,
           past_due_payment_id = ?, past_due_verified_result_id = ?,
           past_due_kind = ?, past_due_occurred_at = ?, past_due_recorded_at = ?,
           updated_at = ?
       WHERE subscription_id = ? AND updated_at = ?`,
      updateParams,
    );
    if (result.affectedRows !== 1) {
      throw new Error("ORDERING_CONCURRENT_SUBSCRIPTION_MODIFICATION");
    }

    persisted = await this.findById(normalized.id);
    if (!persisted || !sameSubscription(persisted, normalized)) {
      throw new Error("ORDERING_CONCURRENT_SUBSCRIPTION_MODIFICATION");
    }
    return persisted;
  }
}

export class MySqlSubscriptionRenewalIntentRepository implements SubscriptionRenewalIntentRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findByRequestKey(
    requestKey: SubscriptionRenewalRequestKey,
  ): Promise<SubscriptionRenewalIntent | null> {
    const key = normalizeSubscriptionRenewalRequestKey(requestKey);
    if (!key) throw new Error("ORDERING_INVALID_RENEWAL_REQUEST_KEY");
    const [rows] = await this.pool.execute<RenewalIntentRow[]>(
      `SELECT ${RENEWAL_INTENT_COLUMNS}
       FROM ordering_subscription_renewal_intents
       WHERE request_key = ?
       LIMIT 1`,
      [key],
    );
    return rows[0] ? renewalIntentFromRow(rows[0]) : null;
  }

  async claim(
    intent: SubscriptionRenewalIntent,
  ): Promise<SubscriptionRenewalClaim> {
    const normalized = normalizeRenewalIntent(intent);
    if (!normalized) throw new Error("ORDERING_INVALID_RENEWAL_INTENT");

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO ordering_subscription_renewal_intents (
        request_key, subscription_id, period_number, order_id, due_at,
        period_start_at, period_end_at, plan_id, plan_name, amount_minor,
        currency, pricing_version, pricing_captured_at, prepared_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.requestKey,
        normalized.subscriptionId,
        normalized.periodNumber,
        normalized.orderId,
        new Date(normalized.dueAt),
        new Date(normalized.periodStartAt),
        new Date(normalized.periodEndAt),
        normalized.pricing.planId,
        normalized.pricing.planName,
        normalized.pricing.amount.minorUnits,
        normalized.pricing.amount.currency,
        normalized.pricing.pricingVersion,
        new Date(normalized.pricing.capturedAt),
        new Date(normalized.preparedAt),
      ],
    );

    const persisted = await this.findByRequestKey(normalized.requestKey);
    if (!persisted || !sameRenewalIntent(persisted, normalized)) {
      throw new Error("ORDERING_SUBSCRIPTION_RENEWAL_CLAIM_CONFLICT");
    }
    return Object.freeze({
      claimed: result.affectedRows === 1,
      intent: persisted,
    });
  }
}
