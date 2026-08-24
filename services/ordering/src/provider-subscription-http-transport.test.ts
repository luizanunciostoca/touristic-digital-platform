import { describe, expect, it, vi } from "vitest";

import {
  createMoney,
  normalizeFinancialEventId,
  normalizePaymentId,
} from "@touristic/financial";
import type {
  ProviderSubscriptionBinding,
  ProviderSubscriptionRequest,
  ProviderSubscriptionSnapshot,
} from "@touristic/financial/subscription-provider";
import { normalizeOrderId } from "@touristic/ordering";
import {
  normalizeSubscriptionId,
  type Subscription,
} from "@touristic/ordering/subscription";

import { ProviderSubscriptionHttpTransport } from "./provider-subscription-http-transport.js";

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`TEST_FIXTURE_INVALID:${label}`);
  return value;
}

const subscriptionId = required(
  normalizeSubscriptionId("sub_provider_http_0001"),
  "subscriptionId",
);
const orderId = required(normalizeOrderId("ord_provider_http_0001"), "orderId");
const paymentId = required(
  normalizePaymentId("pay_provider_http_0001"),
  "paymentId",
);
const resultId = required(
  normalizeFinancialEventId("fev_provider_http_0001"),
  "resultId",
);
const amount = required(createMoney(12_900, "BRL"), "amount");

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
  const snapshotAmount = required(
    createMoney(amountMinorUnits, "BRL"),
    "snapshotAmount",
  );
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
  tenantId = "business_test",
): ProviderSubscriptionBinding {
  return Object.freeze({
    subscriptionId: providerSnapshot.externalReference,
    tenantId,
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

function createFixture(
  existing: ProviderSubscriptionBinding | null = null,
  authorizedTenantId = "business_test",
) {
  let subscription = activeSubscription;
  let storedBinding = existing;
  let capturedCreateRequest: ProviderSubscriptionRequest | null = null;

  const createSubscription = vi.fn(
    async (input: ProviderSubscriptionRequest): Promise<ProviderSubscriptionSnapshot> => {
      capturedCreateRequest = input;
      return snapshot();
    },
  );
  const readSubscription = vi.fn(
    async (_reference: string): Promise<ProviderSubscriptionSnapshot> => snapshot(),
  );
  const pauseSubscription = vi.fn(
    async (_reference: string): Promise<ProviderSubscriptionSnapshot> =>
      snapshot("paused"),
  );
  const resumeSubscription = vi.fn(
    async (_reference: string): Promise<ProviderSubscriptionSnapshot> =>
      snapshot("authorized"),
  );
  const cancelSubscription = vi.fn(
    async (_reference: string): Promise<ProviderSubscriptionSnapshot> =>
      snapshot("cancelled"),
  );

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
      saveReadback: async (providerSnapshot, observedAt, tenantId) => {
        storedBinding = binding(providerSnapshot, observedAt, tenantId);
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
        tenantId: authorizedTenantId,
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
    getCapturedCreateRequest: () => capturedCreateRequest,
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
    expect(fixture.getCapturedCreateRequest()).toMatchObject({
      subscriptionId,
      amount: { minorUnits: 12_900, currency: "BRL" },
      frequency: 1,
      frequencyType: "months",
      payerEmail: "buyer@example.com",
    });
    expect(fixture.getBinding()).toMatchObject({
      subscriptionId,
      tenantId: "business_test",
      providerSubscriptionReference: "preapproval_provider_0001",
      status: "authorized",
    });
  });

  it("replays an existing provider binding without reusing a new card token", async () => {
    const fixture = createFixture(binding(snapshot()));

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

  it("denies cross-tenant access before any provider side effect", async () => {
    const current = binding(snapshot(), undefined, "business_owner");
    const fixture = createFixture(current, "business_attacker");

    const result = await fixture.transport.handle(
      request(
        `/api/payments/v1/subscriptions/${subscriptionId}/provider/pause`,
        "POST",
        {},
      ),
    );

    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "BUSINESS_ACCESS_DENIED" });
    expect(fixture.pauseSubscription).not.toHaveBeenCalled();
  });

  it("pauses and resumes through authoritative provider readback", async () => {
    const fixture = createFixture(binding(snapshot()));

    const paused = await fixture.transport.handle(
      request(
        `/api/payments/v1/subscriptions/${subscriptionId}/provider/pause`,
        "POST",
        {},
      ),
    );
    expect(paused.status).toBe(200);
    expect(fixture.getBinding()).toMatchObject({ status: "paused" });

    const resumed = await fixture.transport.handle(
      request(
        `/api/payments/v1/subscriptions/${subscriptionId}/provider/resume`,
        "POST",
        {},
      ),
    );
    expect(resumed.status).toBe(200);
    expect(fixture.getBinding()).toMatchObject({ status: "authorized" });
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
