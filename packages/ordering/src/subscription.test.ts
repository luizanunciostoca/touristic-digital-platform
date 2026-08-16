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
import {
  applyVerifiedSubscriptionRenewal,
  applyVerifiedSubscriptionRenewalFailure,
  createActiveSubscription,
  createSubscriptionRenewalRequestKey,
  finalizeSubscriptionCancellation,
  normalizeSubscriptionId,
  prepareSubscriptionRenewal,
  scheduleSubscriptionCancellation,
} from "./subscription.js";

function mustOrderId(value: string) {
  const normalized = normalizeOrderId(value);
  if (!normalized) throw new Error("TEST_ORDER_ID_INVALID");
  return normalized;
}

function mustPaymentId(value: string) {
  const normalized = normalizePaymentId(value);
  if (!normalized) throw new Error("TEST_PAYMENT_ID_INVALID");
  return normalized;
}

function mustFinancialEventId(value: string) {
  const normalized = normalizeFinancialEventId(value);
  if (!normalized) throw new Error("TEST_FINANCIAL_EVENT_ID_INVALID");
  return normalized;
}

function mustProviderEventId(value: string) {
  const normalized = normalizeProviderEventId(value);
  if (!normalized) throw new Error("TEST_PROVIDER_EVENT_ID_INVALID");
  return normalized;
}

function mustSubscriptionId(value = "sub_12345678") {
  const normalized = normalizeSubscriptionId(value);
  if (!normalized) throw new Error("TEST_SUBSCRIPTION_ID_INVALID");
  return normalized;
}

function initialOrder(): Order {
  const quote = createPricingQuote({
    planId: "plan_pro",
    planName: "Plano Pro",
    minorUnits: 49_900,
    currency: "BRL",
    pricingVersion: "pricing_2026_08",
  });
  if (!quote) throw new Error("TEST_QUOTE_INVALID");
  const pricing = capturePricingSnapshot(quote, "2026-08-16T03:00:00Z");
  const requestKey = createBusinessOrderRequestKey(
    "session_12345678",
    "plan_pro",
  );
  const source = normalizeOrderSourceReference("session_12345678");
  if (!pricing || !requestKey || !source) {
    throw new Error("TEST_ORDER_FIXTURE_INVALID");
  }
  const order = createOrder({
    id: mustOrderId("ord_12345678"),
    requestKey,
    source,
    status: "payment_confirmed",
    pricing,
    createdAt: "2026-08-16T03:00:00Z",
    updatedAt: "2026-08-16T03:05:00Z",
  });
  if (!order) throw new Error("TEST_ORDER_INVALID");
  return order;
}

function verifiedResult(input: {
  readonly kind?: VerifiedPaymentResult["kind"];
  readonly paymentStatus?: VerifiedPaymentResult["paymentStatus"];
  readonly orderReference?: string;
  readonly paymentId?: string;
  readonly resultId?: string;
  readonly occurredAt?: string;
  readonly recordedAt?: string;
} = {}): VerifiedPaymentResult {
  const kind = input.kind ?? "approved";
  const paymentStatus = input.paymentStatus ?? "confirmed";
  return {
    resultId: mustFinancialEventId(input.resultId ?? "fev_12345678"),
    providerEventId: mustProviderEventId("pwe_12345678"),
    paymentId: mustPaymentId(input.paymentId ?? "pay_12345678"),
    orderReference: input.orderReference ?? "ord_12345678",
    kind,
    paymentStatus,
    paymentReference: "provider_payment_12345678",
    occurredAt: input.occurredAt ?? "2026-08-16T03:04:00Z",
    recordedAt: input.recordedAt ?? "2026-08-16T03:05:00Z",
  };
}

function activeSubscription() {
  const subscription = createActiveSubscription({
    id: mustSubscriptionId(),
    order: initialOrder(),
    verifiedPayment: verifiedResult(),
    periodStartAt: "2026-08-16T03:05:00Z",
    periodEndAt: "2026-09-16T03:05:00Z",
    createdAt: "2026-08-16T03:05:00Z",
  });
  if (!subscription) throw new Error("TEST_SUBSCRIPTION_INVALID");
  return subscription;
}

describe("M150 subscription activation contract", () => {
  it("activates only from a confirmed Order plus identity-matched verified Financial approval", () => {
    const subscription = activeSubscription();

    expect(subscription.status).toBe("active");
    expect(subscription.currentPeriod).toMatchObject({
      number: 1,
      orderId: "ord_12345678",
      paymentId: "pay_12345678",
      verifiedResultId: "fev_12345678",
      startAt: "2026-08-16T03:05:00.000Z",
      endAt: "2026-09-16T03:05:00.000Z",
    });
    expect(subscription.currentPeriod.pricing).toEqual(
      initialOrder().pricing,
    );
    expect(Object.isFrozen(subscription)).toBe(true);
    expect(Object.isFrozen(subscription.currentPeriod)).toBe(true);
  });

  it("fails closed on browser-like claims, failed results or an unrelated order", () => {
    const order = initialOrder();

    expect(
      createActiveSubscription({
        id: mustSubscriptionId(),
        order,
        verifiedPayment: verifiedResult({
          kind: "failed",
          paymentStatus: "failed",
        }),
        periodStartAt: "2026-08-16T03:05:00Z",
        periodEndAt: "2026-09-16T03:05:00Z",
        createdAt: "2026-08-16T03:05:00Z",
      }),
    ).toBeNull();

    expect(
      createActiveSubscription({
        id: mustSubscriptionId(),
        order,
        verifiedPayment: verifiedResult({
          orderReference: "ord_unrelated1",
        }),
        periodStartAt: "2026-08-16T03:05:00Z",
        periodEndAt: "2026-09-16T03:05:00Z",
        createdAt: "2026-08-16T03:05:00Z",
      }),
    ).toBeNull();
  });
});

describe("M150 subscription renewal contract", () => {
  it("prepares a deterministic due-period request without repricing from caller/browser data", () => {
    const subscription = activeSubscription();
    const intent = prepareSubscriptionRenewal({
      subscription,
      renewalOrderId: mustOrderId("ord_renewal01"),
      nextPeriodEndAt: "2026-10-16T03:05:00Z",
      preparedAt: "2026-09-16T03:05:00Z",
    });

    expect(intent).toMatchObject({
      subscriptionId: "sub_12345678",
      periodNumber: 2,
      requestKey: "sub_12345678:period:2",
      orderId: "ord_renewal01",
      dueAt: "2026-09-16T03:05:00.000Z",
      periodStartAt: "2026-09-16T03:05:00.000Z",
      periodEndAt: "2026-10-16T03:05:00.000Z",
    });
    expect(intent?.pricing).toEqual(subscription.currentPeriod.pricing);
    expect(
      createSubscriptionRenewalRequestKey(subscription.id, 2),
    ).toBe("sub_12345678:period:2");
    expect(
      prepareSubscriptionRenewal({
        subscription,
        renewalOrderId: mustOrderId("ord_renewal01"),
        nextPeriodEndAt: "2026-10-16T03:05:00Z",
        preparedAt: "2026-09-15T03:05:00Z",
      }),
    ).toBeNull();
  });

  it("advances the period only after an identity-matched verified Financial approval and replays exactly", () => {
    const subscription = activeSubscription();
    const intent = prepareSubscriptionRenewal({
      subscription,
      renewalOrderId: mustOrderId("ord_renewal01"),
      nextPeriodEndAt: "2026-10-16T03:05:00Z",
      preparedAt: "2026-09-16T03:05:00Z",
    });
    if (!intent) throw new Error("TEST_RENEWAL_INTENT_INVALID");
    const result = verifiedResult({
      orderReference: "ord_renewal01",
      paymentId: "pay_renewal01",
      resultId: "fev_renewal01",
      occurredAt: "2026-09-16T03:06:00Z",
      recordedAt: "2026-09-16T03:07:00Z",
    });

    const renewed = applyVerifiedSubscriptionRenewal({
      subscription,
      intent,
      verifiedPayment: result,
      updatedAt: "2026-09-16T03:07:00Z",
    });
    expect(renewed?.currentPeriod).toMatchObject({
      number: 2,
      orderId: "ord_renewal01",
      paymentId: "pay_renewal01",
      verifiedResultId: "fev_renewal01",
      startAt: "2026-09-16T03:05:00.000Z",
      endAt: "2026-10-16T03:05:00.000Z",
    });
    if (!renewed) throw new Error("TEST_RENEWED_SUBSCRIPTION_INVALID");
    expect(
      applyVerifiedSubscriptionRenewal({
        subscription: renewed,
        intent,
        verifiedPayment: result,
        updatedAt: "2026-09-16T03:07:00Z",
      }),
    ).toBe(renewed);

    expect(
      applyVerifiedSubscriptionRenewal({
        subscription,
        intent,
        verifiedPayment: verifiedResult({
          orderReference: "ord_other0001",
          paymentId: "pay_other0001",
          resultId: "fev_other0001",
          occurredAt: "2026-09-16T03:06:00Z",
          recordedAt: "2026-09-16T03:07:00Z",
        }),
        updatedAt: "2026-09-16T03:07:00Z",
      }),
    ).toBeNull();
  });

  it("records a verified terminal renewal failure as past-due without fabricating another charge", () => {
    const subscription = activeSubscription();
    const intent = prepareSubscriptionRenewal({
      subscription,
      renewalOrderId: mustOrderId("ord_renewal01"),
      nextPeriodEndAt: "2026-10-16T03:05:00Z",
      preparedAt: "2026-09-16T03:05:00Z",
    });
    if (!intent) throw new Error("TEST_RENEWAL_INTENT_INVALID");
    const failure = verifiedResult({
      kind: "failed",
      paymentStatus: "failed",
      orderReference: "ord_renewal01",
      paymentId: "pay_renewal01",
      resultId: "fev_failure01",
      occurredAt: "2026-09-16T03:06:00Z",
      recordedAt: "2026-09-16T03:07:00Z",
    });

    const pastDue = applyVerifiedSubscriptionRenewalFailure({
      subscription,
      intent,
      verifiedFailure: failure,
      updatedAt: "2026-09-16T03:07:00Z",
    });
    expect(pastDue).toMatchObject({
      status: "past_due",
      currentPeriod: { number: 1 },
      pastDueEvidence: {
        periodNumber: 2,
        renewalOrderId: "ord_renewal01",
        paymentId: "pay_renewal01",
        verifiedResultId: "fev_failure01",
        kind: "failed",
      },
    });
    if (!pastDue) throw new Error("TEST_PAST_DUE_INVALID");
    expect(
      prepareSubscriptionRenewal({
        subscription: pastDue,
        renewalOrderId: mustOrderId("ord_retry0001"),
        nextPeriodEndAt: "2026-10-16T03:05:00Z",
        preparedAt: "2026-09-16T03:08:00Z",
      }),
    ).toBeNull();
    expect(
      applyVerifiedSubscriptionRenewalFailure({
        subscription: pastDue,
        intent,
        verifiedFailure: failure,
        updatedAt: "2026-09-16T03:07:00Z",
      }),
    ).toBe(pastDue);
  });
});

describe("M150 subscription cancellation contract", () => {
  it("schedules cancellation at the paid-period boundary and blocks renewal", () => {
    const subscription = activeSubscription();
    const cancelling = scheduleSubscriptionCancellation({
      subscription,
      requestedAt: "2026-09-01T12:00:00Z",
    });
    expect(cancelling?.status).toBe("cancel_at_period_end");
    if (!cancelling) throw new Error("TEST_CANCELLING_INVALID");

    expect(
      prepareSubscriptionRenewal({
        subscription: cancelling,
        renewalOrderId: mustOrderId("ord_renewal01"),
        nextPeriodEndAt: "2026-10-16T03:05:00Z",
        preparedAt: "2026-09-16T03:05:00Z",
      }),
    ).toBeNull();
    expect(
      finalizeSubscriptionCancellation({
        subscription: cancelling,
        effectiveAt: "2026-09-16T03:04:59Z",
      }),
    ).toBeNull();

    const cancelled = finalizeSubscriptionCancellation({
      subscription: cancelling,
      effectiveAt: "2026-09-16T03:05:00Z",
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelledAt: "2026-09-16T03:05:00.000Z",
      currentPeriod: { number: 1 },
    });
  });
});
