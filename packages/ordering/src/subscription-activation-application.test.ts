import { describe, expect, it, vi } from "vitest";

import {
  createMoney,
  normalizeFinancialEventId,
  normalizePaymentId,
  normalizeProviderEventId,
  type VerifiedPaymentResult,
} from "@touristic/financial";
import {
  createBusinessOrderRequestKey,
  createOrder,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
} from "./index.js";
import { normalizeSubscriptionId, type Subscription } from "./subscription.js";
import {
  SubscriptionActivationError,
  createSubscriptionActivationApplicationService,
} from "./subscription-activation-application.js";

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`TEST_FIXTURE_INVALID:${label}`);
  return value;
}

const orderId = required(
  normalizeOrderId("ord_subscription_activation_0001"),
  "orderId",
);
const paymentId = required(
  normalizePaymentId("pay_subscription_activation_0001"),
  "paymentId",
);
const resultId = required(
  normalizeFinancialEventId("fev_subscription_activation_0001"),
  "resultId",
);
const providerEventId = required(
  normalizeProviderEventId("pwe_subscription_activation_0001"),
  "providerEventId",
);

function order(
  status: Order["status"] = "payment_confirmed",
  kind: Order["source"]["kind"] = "business_onboarding",
): Order {
  return required(
    createOrder({
      id: orderId,
      requestKey: required(
        createBusinessOrderRequestKey("activation_session_0001", "growth"),
        "requestKey",
      ),
      source: required(
        normalizeOrderSourceReference("activation_session_0001", kind),
        "source",
      ),
      status,
      pricing: {
        planId: "growth",
        planName: "Plano Growth",
        amount: required(createMoney(12_900, "BRL"), "amount"),
        pricingVersion: "pricing_v1",
        capturedAt: "2027-01-01T00:00:00.000Z",
      },
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-31T10:00:02.000Z",
    }),
    "order",
  );
}

function verified(
  overrides: Partial<VerifiedPaymentResult> = {},
): VerifiedPaymentResult {
  return Object.freeze({
    resultId,
    providerEventId,
    paymentId,
    orderReference: orderId,
    kind: "approved" as const,
    paymentStatus: "confirmed" as const,
    paymentReference: "1327954194",
    occurredAt: "2027-01-31T10:00:00.000Z",
    recordedAt: "2027-01-31T10:00:01.000Z",
    ...overrides,
  });
}

function fixture(
  initialOrder: Order = order(),
  verifiedPayment: VerifiedPaymentResult | null = verified(),
) {
  const subscriptions = new Map<string, Subscription>();
  const save = vi.fn(async (subscription: Subscription) => {
    subscriptions.set(subscription.id, subscription);
    return subscription;
  });
  const service = createSubscriptionActivationApplicationService({
    orders: {
      findById: async () => initialOrder,
      findByRequestKey: async () => null,
      save: async (value) => value,
    },
    subscriptions: {
      findById: async (id) => subscriptions.get(id) ?? null,
      save,
    },
    verifiedPayments: {
      findByProviderEventId: async () => null,
      findByPaymentStatus: async () => verifiedPayment,
      save: async (value) => value,
    },
    clock: { now: () => "2027-01-31T10:00:03.000Z" },
  });
  return { service, subscriptions, save };
}

describe("subscription initial activation", () => {
  it("materializes period one only from a paid business order and verified approval", async () => {
    const { service } = fixture();

    const result = await service.activate({ orderId, paymentId });

    expect(result.disposition).toBe("created");
    expect(result.subscription).toMatchObject({
      id: "sub_subscription_activation_0001",
      status: "active",
      currentPeriod: {
        number: 1,
        orderId,
        paymentId,
        verifiedResultId: resultId,
        startAt: "2027-01-31T10:00:00.000Z",
        endAt: "2027-02-28T10:00:00.000Z",
        pricing: {
          planId: "growth",
          amount: { minorUnits: 12_900, currency: "BRL" },
        },
      },
    });
  });

  it("replays the deterministic subscription without a duplicate write", async () => {
    const { service, save } = fixture();
    const first = await service.activate({ orderId, paymentId });
    const second = await service.activate({ orderId, paymentId });

    expect(first.disposition).toBe("created");
    expect(second.disposition).toBe("replayed");
    expect(second.subscription.id).toBe(first.subscription.id);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("rejects an order that is not payment_confirmed", async () => {
    const { service } = fixture(order("pending_payment"));

    await expect(service.activate({ orderId, paymentId })).rejects.toMatchObject({
      code: "SUBSCRIPTION_ACTIVATION_ORDER_NOT_ELIGIBLE",
    } satisfies Partial<SubscriptionActivationError>);
  });

  it("rejects ticketing orders even when paid", async () => {
    const ticketingOrder = required(
      createOrder({
        ...order(),
        source: required(
          normalizeOrderSourceReference(
            "ticketing_subscription_0001",
            "ticketing_reservation",
          ),
          "ticketingSource",
        ),
      }),
      "ticketingOrder",
    );
    const { service } = fixture(ticketingOrder);

    await expect(service.activate({ orderId, paymentId })).rejects.toMatchObject({
      code: "SUBSCRIPTION_ACTIVATION_ORDER_NOT_ELIGIBLE",
    });
  });

  it("fails closed when the confirmed verified payment is absent", async () => {
    const { service } = fixture(order(), null);

    await expect(service.activate({ orderId, paymentId })).rejects.toMatchObject({
      code: "SUBSCRIPTION_ACTIVATION_PAYMENT_NOT_VERIFIED",
    });
  });

  it("uses a deterministic valid subscription identity derived from the order", async () => {
    const { service } = fixture();
    const result = await service.activate({ orderId, paymentId });

    expect(normalizeSubscriptionId(result.subscription.id)).toBe(
      result.subscription.id,
    );
  });
});
