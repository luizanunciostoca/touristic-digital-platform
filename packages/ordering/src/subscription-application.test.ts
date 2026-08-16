import { describe, expect, it } from "vitest";

import {
  normalizeFinancialEventId,
  normalizePaymentId,
  normalizeProviderEventId,
  type VerifiedPaymentResult,
} from "@touristic/financial";

import {
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
} from "./index.js";
import { createSubscriptionRecurrenceApplicationService } from "./subscription-application.js";
import {
  createActiveSubscription,
  normalizeSubscriptionId,
  scheduleSubscriptionCancellation,
  type Subscription,
  type SubscriptionId,
  type SubscriptionRenewalIntent,
  type SubscriptionRenewalRequestKey,
} from "./subscription.js";

function mustOrderId(value: string) {
  const result = normalizeOrderId(value);
  if (!result) throw new Error("FIXTURE_INVALID");
  return result;
}

function mustPaymentId(value: string) {
  const result = normalizePaymentId(value);
  if (!result) throw new Error("FIXTURE_INVALID");
  return result;
}

function mustEventId(value: string) {
  const result = normalizeFinancialEventId(value);
  if (!result) throw new Error("FIXTURE_INVALID");
  return result;
}

function mustProviderEventId(value: string) {
  const result = normalizeProviderEventId(value);
  if (!result) throw new Error("FIXTURE_INVALID");
  return result;
}

function initialOrder(): Order {
  const quote = createPricingQuote({
    planId: "plan_pro",
    planName: "Plano Pro",
    minorUnits: 49_900,
    currency: "BRL",
    pricingVersion: "pricing_2026_08",
  });
  const pricing = quote
    ? capturePricingSnapshot(quote, "2026-08-16T03:00:00Z")
    : null;
  const requestKey = createBusinessOrderRequestKey(
    "session_12345678",
    "plan_pro",
  );
  const source = normalizeOrderSourceReference("session_12345678");
  if (!pricing || !requestKey || !source) throw new Error("FIXTURE_INVALID");
  const order = createOrder({
    id: mustOrderId("ord_12345678"),
    requestKey,
    source,
    status: "payment_confirmed",
    pricing,
    createdAt: "2026-08-16T03:00:00Z",
    updatedAt: "2026-08-16T03:05:00Z",
  });
  if (!order) throw new Error("FIXTURE_INVALID");
  return order;
}

function verifiedResult(
  input: {
    readonly kind?: VerifiedPaymentResult["kind"];
    readonly paymentStatus?: VerifiedPaymentResult["paymentStatus"];
    readonly orderReference?: string;
    readonly paymentId?: string;
    readonly resultId?: string;
    readonly occurredAt?: string;
    readonly recordedAt?: string;
  } = {},
): VerifiedPaymentResult {
  return {
    resultId: mustEventId(input.resultId ?? "fev_renewal123"),
    providerEventId: mustProviderEventId("pwe_renewal123"),
    paymentId: mustPaymentId(input.paymentId ?? "pay_renewal123"),
    orderReference: input.orderReference ?? "ord_renewal01",
    kind: input.kind ?? "approved",
    paymentStatus: input.paymentStatus ?? "confirmed",
    paymentReference: "provider_renewal_123",
    occurredAt: input.occurredAt ?? "2026-09-16T03:06:00Z",
    recordedAt: input.recordedAt ?? "2026-09-16T03:07:00Z",
  };
}

function activeSubscription(): Subscription {
  const id = normalizeSubscriptionId("sub_12345678");
  if (!id) throw new Error("FIXTURE_INVALID");
  const initial = initialOrder();
  const initialResult: VerifiedPaymentResult = {
    resultId: mustEventId("fev_initial123"),
    providerEventId: mustProviderEventId("pwe_initial123"),
    paymentId: mustPaymentId("pay_initial123"),
    orderReference: initial.id,
    kind: "approved",
    paymentStatus: "confirmed",
    paymentReference: "provider_initial_123",
    occurredAt: "2026-08-16T03:04:00Z",
    recordedAt: "2026-08-16T03:05:00Z",
  };
  const subscription = createActiveSubscription({
    id,
    order: initial,
    verifiedPayment: initialResult,
    periodStartAt: "2026-08-16T03:05:00Z",
    periodEndAt: "2026-09-16T03:05:00Z",
    createdAt: "2026-08-16T03:05:00Z",
  });
  if (!subscription) throw new Error("FIXTURE_INVALID");
  return subscription;
}

class MemorySubscriptions {
  readonly values = new Map<SubscriptionId, Subscription>();

  constructor(initial: Subscription) {
    this.values.set(initial.id, initial);
  }

  findById(id: SubscriptionId): Promise<Subscription | null> {
    return Promise.resolve(this.values.get(id) ?? null);
  }

  save(subscription: Subscription): Promise<Subscription> {
    this.values.set(subscription.id, subscription);
    return Promise.resolve(subscription);
  }
}

class MemoryRenewals {
  readonly values = new Map<
    SubscriptionRenewalRequestKey,
    SubscriptionRenewalIntent
  >();

  findByRequestKey(
    key: SubscriptionRenewalRequestKey,
  ): Promise<SubscriptionRenewalIntent | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  claim(intent: SubscriptionRenewalIntent) {
    const existing = this.values.get(intent.requestKey);
    if (existing) {
      if (existing.orderId !== intent.orderId) {
        return Promise.reject(
          new Error("ORDERING_SUBSCRIPTION_RENEWAL_CLAIM_CONFLICT"),
        );
      }
      return Promise.resolve({ claimed: false, intent: existing });
    }
    this.values.set(intent.requestKey, intent);
    return Promise.resolve({ claimed: true, intent });
  }
}

function fixture(now = "2026-09-16T03:05:00Z") {
  const subscriptions = new MemorySubscriptions(activeSubscription());
  const renewals = new MemoryRenewals();
  let currentNow = now;
  const service = createSubscriptionRecurrenceApplicationService({
    subscriptions,
    renewalIntents: renewals,
    clock: { now: () => currentNow },
  });
  return {
    subscriptions,
    renewals,
    service,
    setNow(value: string) {
      currentNow = value;
    },
  };
}

describe("M153 subscription recurrence application", () => {
  it("does not prepare before due and claims exactly one deterministic due renewal", async () => {
    const early = fixture("2026-09-16T03:04:59Z");
    await expect(
      early.service.prepareDueRenewal({
        subscriptionId: "sub_12345678",
        renewalOrderId: "ord_renewal01",
        nextPeriodEndAt: "2026-10-16T03:05:00Z",
      }),
    ).resolves.toMatchObject({ disposition: "not_due", intent: null });
    expect(early.renewals.values.size).toBe(0);

    const due = fixture();
    const first = await due.service.prepareDueRenewal({
      subscriptionId: "sub_12345678",
      renewalOrderId: "ord_renewal01",
      nextPeriodEndAt: "2026-10-16T03:05:00Z",
    });
    expect(first).toMatchObject({
      disposition: "renewal_claimed",
      intent: {
        requestKey: "sub_12345678:period:2",
        orderId: "ord_renewal01",
        periodNumber: 2,
      },
    });
    expect(first.intent?.pricing).toEqual(
      first.subscription.currentPeriod.pricing,
    );

    await expect(
      due.service.prepareDueRenewal({
        subscriptionId: "sub_12345678",
        renewalOrderId: "ord_different1",
        nextPeriodEndAt: "2026-11-16T03:05:00Z",
      }),
    ).resolves.toMatchObject({
      disposition: "renewal_replayed",
      intent: { orderId: "ord_renewal01" },
    });
    expect(due.renewals.values.size).toBe(1);
  });

  it("advances only from an identity-matched verified Financial approval and replays it", async () => {
    const { service, setNow } = fixture();
    await service.prepareDueRenewal({
      subscriptionId: "sub_12345678",
      renewalOrderId: "ord_renewal01",
      nextPeriodEndAt: "2026-10-16T03:05:00Z",
    });
    setNow("2026-09-16T03:08:00Z");
    const outcome = verifiedResult();

    const applied = await service.applyVerifiedOutcome({
      subscriptionId: "sub_12345678",
      verifiedOutcome: outcome,
    });
    expect(applied).toMatchObject({
      disposition: "advanced",
      subscription: {
        status: "active",
        currentPeriod: {
          number: 2,
          orderId: "ord_renewal01",
          paymentId: "pay_renewal123",
          verifiedResultId: "fev_renewal123",
        },
      },
    });

    await expect(
      service.applyVerifiedOutcome({
        subscriptionId: "sub_12345678",
        verifiedOutcome: outcome,
      }),
    ).resolves.toMatchObject({ disposition: "replayed" });
  });

  it("persists verified terminal failure as past_due and refuses a blind new renewal", async () => {
    const { service, renewals, setNow } = fixture();
    await service.prepareDueRenewal({
      subscriptionId: "sub_12345678",
      renewalOrderId: "ord_renewal01",
      nextPeriodEndAt: "2026-10-16T03:05:00Z",
    });
    setNow("2026-09-16T03:08:00Z");
    const failed = verifiedResult({
      kind: "failed",
      paymentStatus: "failed",
      resultId: "fev_failed1234",
      paymentId: "pay_failed1234",
    });
    const applied = await service.applyVerifiedOutcome({
      subscriptionId: "sub_12345678",
      verifiedOutcome: failed,
    });
    expect(applied).toMatchObject({
      disposition: "past_due",
      subscription: {
        status: "past_due",
        pastDueEvidence: {
          periodNumber: 2,
          renewalOrderId: "ord_renewal01",
          kind: "failed",
        },
      },
    });

    await expect(
      service.prepareDueRenewal({
        subscriptionId: "sub_12345678",
        renewalOrderId: "ord_blindretry",
        nextPeriodEndAt: "2026-11-16T03:05:00Z",
      }),
    ).resolves.toMatchObject({
      disposition: "blocked_past_due",
      intent: null,
    });
    expect(renewals.values.size).toBe(1);
  });

  it("finalizes cancel-at-period-end instead of creating a renewal claim", async () => {
    const { subscriptions, renewals } = fixture();
    const current = activeSubscription();
    const cancelling = scheduleSubscriptionCancellation({
      subscription: current,
      requestedAt: "2026-09-01T03:05:00Z",
    });
    if (!cancelling) throw new Error("FIXTURE_INVALID");
    await subscriptions.save(cancelling);
    const service = createSubscriptionRecurrenceApplicationService({
      subscriptions,
      renewalIntents: renewals,
      clock: { now: () => "2026-09-16T03:05:00Z" },
    });

    await expect(
      service.prepareDueRenewal({
        subscriptionId: "sub_12345678",
        renewalOrderId: "ord_shouldnot1",
        nextPeriodEndAt: "2026-10-16T03:05:00Z",
      }),
    ).resolves.toMatchObject({
      disposition: "cancelled",
      subscription: { status: "cancelled" },
      intent: null,
    });
    expect(renewals.values.size).toBe(0);
  });

  it("fails closed on an unclaimed or unrelated verified outcome", async () => {
    const { service, setNow } = fixture();
    await expect(
      service.applyVerifiedOutcome({
        subscriptionId: "sub_12345678",
        verifiedOutcome: verifiedResult(),
      }),
    ).rejects.toMatchObject({
      code: "SUBSCRIPTION_RECURRENCE_OUTCOME_NOT_CLAIMED",
    });

    await service.prepareDueRenewal({
      subscriptionId: "sub_12345678",
      renewalOrderId: "ord_renewal01",
      nextPeriodEndAt: "2026-10-16T03:05:00Z",
    });
    setNow("2026-09-16T03:08:00Z");
    await expect(
      service.applyVerifiedOutcome({
        subscriptionId: "sub_12345678",
        verifiedOutcome: verifiedResult({ orderReference: "ord_unrelated1" }),
      }),
    ).rejects.toMatchObject({
      code: "SUBSCRIPTION_RECURRENCE_INVALID_VERIFIED_OUTCOME",
    });
  });
});