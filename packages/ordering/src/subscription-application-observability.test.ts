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
} from "./index.js";
import { createSubscriptionRecurrenceApplicationService } from "./subscription-application.js";
import {
  createActiveSubscription,
  normalizeSubscriptionId,
  type Subscription,
  type SubscriptionId,
  type SubscriptionRenewalIntent,
  type SubscriptionRenewalRequestKey,
} from "./subscription.js";

function required<T>(value: T | null): T {
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

function activeSubscription(): Subscription {
  const quote = required(
    createPricingQuote({
      planId: "plan_pro",
      planName: "Plano Pro",
      minorUnits: 49_900,
      currency: "BRL",
      pricingVersion: "pricing_2026_08",
    }),
  );
  const pricing = required(
    capturePricingSnapshot(quote, "2026-08-16T03:00:00Z"),
  );
  const requestKey = required(
    createBusinessOrderRequestKey("session_12345678", "plan_pro"),
  );
  const source = required(normalizeOrderSourceReference("session_12345678"));
  const order = required(
    createOrder({
      id: required(normalizeOrderId("ord_12345678")),
      requestKey,
      source,
      status: "payment_confirmed",
      pricing,
      createdAt: "2026-08-16T03:00:00Z",
      updatedAt: "2026-08-16T03:05:00Z",
    }),
  );
  const verified: VerifiedPaymentResult = {
    resultId: required(normalizeFinancialEventId("fev_initial123")),
    providerEventId: required(normalizeProviderEventId("pwe_initial123")),
    paymentId: required(normalizePaymentId("pay_initial123")),
    orderReference: order.id,
    kind: "approved",
    paymentStatus: "confirmed",
    paymentReference: "provider_initial_123",
    occurredAt: "2026-08-16T03:04:00Z",
    recordedAt: "2026-08-16T03:05:00Z",
  };
  return required(
    createActiveSubscription({
      id: required(normalizeSubscriptionId("sub_12345678")),
      order,
      verifiedPayment: verified,
      periodStartAt: "2026-08-16T03:05:00Z",
      periodEndAt: "2026-09-16T03:05:00Z",
      createdAt: "2026-08-16T03:05:00Z",
    }),
  );
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

  findByRequestKey(key: SubscriptionRenewalRequestKey) {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  claim(intent: SubscriptionRenewalIntent) {
    const existing = this.values.get(intent.requestKey);
    if (existing) return Promise.resolve({ claimed: false, intent: existing });
    this.values.set(intent.requestKey, intent);
    return Promise.resolve({ claimed: true, intent });
  }
}

function renewalResult(): VerifiedPaymentResult {
  return {
    resultId: required(normalizeFinancialEventId("fev_renewal123")),
    providerEventId: required(normalizeProviderEventId("pwe_renewal123")),
    paymentId: required(normalizePaymentId("pay_renewal123")),
    orderReference: "ord_renewal01",
    kind: "approved",
    paymentStatus: "confirmed",
    paymentReference: "provider_renewal_123",
    occurredAt: "2026-09-16T03:06:00Z",
    recordedAt: "2026-09-16T03:07:00Z",
  };
}

describe("FEATURE-0009 subscription recurrence observations", () => {
  it("records prepare and verified renewal transitions with correlation IDs", async () => {
    const subscriptions = new MemorySubscriptions(activeSubscription());
    const renewals = new MemoryRenewals();
    const events: unknown[] = [];
    let now = "2026-09-16T03:05:00Z";
    const service = createSubscriptionRecurrenceApplicationService({
      subscriptions,
      renewalIntents: renewals,
      clock: { now: () => now },
      observations: { record: (event) => events.push(event) },
    });

    await service.prepareDueRenewal({
      subscriptionId: "sub_12345678",
      renewalOrderId: "ord_renewal01",
      nextPeriodEndAt: "2026-10-16T03:05:00Z",
      correlationId: "corr_recurrence_prepare_123",
    });
    now = "2026-09-16T03:08:00Z";
    await service.applyVerifiedOutcome({
      subscriptionId: "sub_12345678",
      verifiedOutcome: renewalResult(),
      correlationId: "corr_recurrence_outcome_123",
    });

    expect(events).toMatchObject([
      {
        action: "renewal.prepare",
        disposition: "renewal_claimed",
        periodNumber: 2,
        correlationId: "corr_recurrence_prepare_123",
      },
      {
        action: "renewal.apply_verified_outcome",
        disposition: "advanced",
        periodNumber: 2,
        correlationId: "corr_recurrence_outcome_123",
        verifiedResultId: "fev_renewal123",
      },
    ]);
  });

  it("keeps recurrence outcome authoritative when observation delivery fails", async () => {
    const service = createSubscriptionRecurrenceApplicationService({
      subscriptions: new MemorySubscriptions(activeSubscription()),
      renewalIntents: new MemoryRenewals(),
      clock: { now: () => "2026-09-16T03:04:59Z" },
      observations: {
        record() {
          throw new Error("collector unavailable");
        },
      },
    });

    await expect(
      service.prepareDueRenewal({
        subscriptionId: "sub_12345678",
        renewalOrderId: "ord_renewal01",
        nextPeriodEndAt: "2026-10-16T03:05:00Z",
      }),
    ).resolves.toMatchObject({ disposition: "not_due" });
  });
});
