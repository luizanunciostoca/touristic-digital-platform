import { describe, expect, it, vi } from "vitest";

import {
  createMoney,
  normalizeFinancialEventId,
  normalizePaymentId,
} from "@touristic/financial";
import type {
  ProviderSubscriptionBinding,
  ProviderSubscriptionSnapshot,
} from "@touristic/financial/subscription-provider";
import { normalizeOrderId } from "@touristic/ordering";
import {
  normalizeSubscriptionId,
  type Subscription,
} from "@touristic/ordering/subscription";

import { ProviderSubscriptionHttpTransport } from "./provider-subscription-http-transport.js";

const subscriptionId = normalizeSubscriptionId("sub_provider_http_0001");
const orderId = normalizeOrderId("ord_provider_http_0001");
const paymentId = normalizePaymentId("pay_provider_http_0001");
const resultId = normalizeFinancialEventId("fev_provider_http_0001");
const amount = createMoney(12_900, "BRL");
if (!subscriptionId || !orderId || !paymentId || !resultId || !amount) {
  throw new Error("TEST_FIXTURE_INVALID");
}

const activeSubscription: Subscription = Object.freeze({
  id: subscriptionId,
  status: "active",
  currentPeriod: Object.freeze({
    number: 1,
    startAt: "2026-08-01T00:00:00.000Z",
    endAt: "2026-09-01T00:00:00.000Z",
    orderId,
    paymentId,
    verifiedResultId: resultId,
    pricing: Object.freeze({
      planId: "growth",
      planName: "Plano Growth",
      amount,
      pricingVersion: "pricing_v1",
      capturedAt: "2026-08-01T00:00:00.000Z",
    }),
  }),
  cancellationRequestedAt: null,
  cancelledAt: null,
  pastDueEvidence: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

function snapshot(
  status: ProviderSubscriptionSnapshot["status"] = "authorized",
  amountMinorUnits = 12_900,
): ProviderSubscriptionSnapshot {
  const snapshotAmount = createMoney(amountMinorUnits, "BRL");
  if (!snapshotAmount) throw new Error("TEST_AMOUNT_INVALID");
  return Object.freeze({
    providerSubscriptionReference: "preapproval_provider_0001",
    externalReference: subscriptionId,
    status,
    amount: snapshotAmount,
    frequency: 1,
    frequencyType: "months",
    payerEmail: "buyer@example.com",
  });
}

function binding(
  providerSnapshot: ProviderSubscriptionSnapshot,
  observedAt = "2026-08-24T03:00:00.000Z",
): ProviderSubscriptionBinding {
  return Object.freeze({
    subscriptionId: providerSnapshot.externalReference,
    providerSubscriptionReference:
      providerSnapshot.providerSubscriptionReference,
    status: providerSnapshot.status,
    amount: providerSnapshot.amount,
    frequency: 1,
    frequencyType: "months",
    payerEmail: providerSnapshot.payerEmail,
    createdAt: observedAt,
    updatedAt: observedAt,
  });
}

function createFixture(existing: ProviderSubscriptionBinding | null = null) {
  let subscription = activeSubscription;
  let storedBinding = existing;
  const createSubscription = vi.fn(async () => snapshot());
  const readSubscription = vi.fn(async () => snapshot());
  const pauseSubscription = vi.fn(async () => snapshot("paused"));
  const resumeSubscription = vi.fn(async () => snapshot("authorized"));
  const cancelSubscription = vi.fn(async () => snapshot("cancelled"));

  const transport = new ProviderSubscriptionHttpTransport({
    subscriptions: {
      findById: async () => subscription,
      save: async (value) => {
        subscription = value;
        return value;
      },
    },
    bindings: {
      findBySubscriptionId: async () => storedBinding,
      saveReadback: async (providerSnapshot, observedAt) => {
        storedBinding = binding(providerSnapshot, observedAt);
        return storedBinding;
      },
    },
    provider: {
      createSubscription,
      readSubscription,
      pauseSubscription,
      resumeSubscription,
      cancelSubscription,
    },
    authorization: {
      authorize: async () => ({
        allowed: true,
        actorSubject: "user:test",
        actorEmail: "buyer@example.com",
        tenantId: "business_test",
      }),
    },
    audit: { record: async () => undefined },
    clock: { now: () => "2026-08-24T03:00:00.000Z" },
    backUrl: "https://morro.digital/minha-assinatura",
  });

  return {
    transport,
    createSubscription,
    readSubscription,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription,
    getSubscription: () => subscription,
    getBinding: () => storedBinding,
  };
}

function request(
  pathname: string,
  method = "POST",
  body: unknown = {
    cardToken: "card_token_subscription_0001",
    payerEmail: "attacker@example.com",
    amount: 1,
    currency: "USD",
    frequency: 99,
  },
) {
  return {
    method,
    pathname,
    correlationId: "corr_subscription_provider_0001",
    headers: {},
    body,
  } as const;
}

describe("ProviderSubscriptionHttpTransport", () => {
  it("creates the provider agreement from server-owned subscription and auth snapshots", async () => {
    const fixture = createFixture();

    const result = await fixture.transport.handle(
      request(`/api/payments/v1/subscriptions/${subscriptionId}/provider`),
    );

    expect(result.status).toBe(201);
    expect(fixture.createSubscription).toHaveBeenCalledTimes(1);
    expect(fixture.createSubscription.mock.calls[0]?.[0]).toMatchObject({
      subscriptionId,
      amount: { minorUnits: 12_900, currency: "BRL" },
      frequency: 1,
      frequencyType: "months",
      payerEmail: "buyer@example.com",
    });
    expect(fixture.getBinding()).toMatchObject({
      subscriptionId,
      providerSubscriptionReference: "preapproval_provider_0001",
      status: "authorized",
    });
  });

  it("replays an existing provider binding without reusing a new card token", async () => {
    const current = binding(snapshot());
    const fixture = createFixture(current);

    const result = await fixture.transport.handle(
      request(`/api/payments/v1/subscriptions/${subscriptionId}/provider`),
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: { replayed: true } });
    expect(fixture.createSubscription).not.toHaveBeenCalled();
    expect(fixture.readSubscription).toHaveBeenCalledWith(
      "preapproval_provider_0001",
    );
  });

  it("schedules canonical cancellation before cancelling the provider agreement", async () => {
    const fixture = createFixture(binding(snapshot()));

    const result = await fixture.transport.handle(
      request(
        `/api/payments/v1/subscriptions/${subscriptionId}/provider/cancel`,
        "POST",
        {},
      ),
    );

    expect(result.status).toBe(200);
    expect(fixture.getSubscription().status).toBe("cancel_at_period_end");
    expect(fixture.getSubscription().cancellationRequestedAt).toBe(
      "2026-08-24T03:00:00.000Z",
    );
    expect(fixture.cancelSubscription).toHaveBeenCalledTimes(1);
  });

  it("fails closed when authoritative provider money differs from Ordering", async () => {
    const fixture = createFixture();
    fixture.createSubscription.mockResolvedValueOnce(snapshot("authorized", 1));

    const result = await fixture.transport.handle(
      request(`/api/payments/v1/subscriptions/${subscriptionId}/provider`),
    );

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "SUBSCRIPTION_PROVIDER_UNAVAILABLE" });
    expect(fixture.getBinding()).toBeNull();
  });
});