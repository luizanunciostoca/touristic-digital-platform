import mysql, { type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
  type OrderStatus,
} from "@touristic/ordering";
import {
  applyVerifiedSubscriptionRenewalFailure,
  createActiveSubscription,
  normalizeSubscriptionId,
  prepareSubscriptionRenewal,
  scheduleSubscriptionCancellation,
  type Subscription,
} from "@touristic/ordering/subscription";

import {
  MySqlOrderRepository,
  MySqlSubscriptionRenewalIntentRepository,
  MySqlSubscriptionRepository,
  applyOrderingM151Schema,
  createOrderingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.ORDERING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function order(
  idValue = "ord_mysql_12345678",
  sessionId = "mysql_session_123",
  status: OrderStatus = "draft",
): Order {
  const id = normalizeOrderId(idValue);
  const requestKey = createBusinessOrderRequestKey(sessionId, "performance");
  const source = normalizeOrderSourceReference("mysql_business_123");
  const quote = createPricingQuote({
    planId: "performance",
    planName: "Performance",
    minorUnits: 49_900,
    currency: "BRL",
    pricingVersion: "plans_2026_08",
  });
  if (!id || !requestKey || !source || !quote)
    throw new Error("FIXTURE_INVALID");
  const pricing = capturePricingSnapshot(quote, "2026-08-14T19:30:00Z");
  if (!pricing) throw new Error("FIXTURE_INVALID");
  const value = createOrder({
    id,
    requestKey,
    source,
    status,
    pricing,
    createdAt: "2026-08-14T19:31:00Z",
    updatedAt: "2026-08-14T19:31:00Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

function verifiedResult(
  sourceOrder: Order,
  options: {
    readonly suffix?: string;
    readonly kind?: "approved" | "failed";
    readonly occurredAt?: string;
    readonly recordedAt?: string;
  } = {},
): VerifiedPaymentResult {
  const suffix = options.suffix ?? "initial1234";
  const paymentId = normalizePaymentId(`pay_mysql_${suffix}`);
  const resultId = normalizeFinancialEventId(`fev_mysql_${suffix}`);
  const providerEventId = normalizeProviderEventId(`pwe_mysql_${suffix}`);
  if (!paymentId || !resultId || !providerEventId)
    throw new Error("FIXTURE_INVALID");
  const kind = options.kind ?? "approved";
  return {
    resultId,
    providerEventId,
    paymentId,
    orderReference: sourceOrder.id,
    kind,
    paymentStatus: kind === "approved" ? "confirmed" : "failed",
    paymentReference: `provider_${suffix}`,
    occurredAt: options.occurredAt ?? "2026-08-14T19:32:00Z",
    recordedAt: options.recordedAt ?? "2026-08-14T19:33:00Z",
  };
}

function activeSubscription(sourceOrder: Order): Subscription {
  const id = normalizeSubscriptionId("sub_mysql_12345678");
  if (!id) throw new Error("FIXTURE_INVALID");
  const subscription = createActiveSubscription({
    id,
    order: sourceOrder,
    verifiedPayment: verifiedResult(sourceOrder),
    periodStartAt: "2026-08-16T00:00:00Z",
    periodEndAt: "2026-09-16T00:00:00Z",
    createdAt: "2026-08-16T00:00:00Z",
  });
  if (!subscription) throw new Error("FIXTURE_INVALID");
  return subscription;
}

describeMySql.sequential("M151 Ordering MySQL integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!adminUrl || !databaseUrl)
      throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
    const admin = await mysql.createConnection(adminUrl);
    try {
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS ordering_m137_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    } finally {
      await admin.end();
    }
    pool = createOrderingMySqlPoolFromEnvironment({
      ORDERING_DATABASE_URL: databaseUrl,
    });
    await applyOrderingM151Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM ordering_ticketing_reservation_bindings");
    await pool.query("DELETE FROM ordering_subscription_renewal_intents");
    await pool.query("DELETE FROM ordering_subscriptions");
    await pool.query("DELETE FROM ordering_checkout_access");
    await pool.query("DELETE FROM ordering_orders");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists immutable pricing and advances order lifecycle through compare-and-swap", async () => {
    const repository = new MySqlOrderRepository(pool);
    const initial = order();
    const saved = await repository.save(initial);

    expect(saved.createdAt).toBe("2026-08-14T19:31:00.000Z");
    expect(saved.pricing.capturedAt).toBe("2026-08-14T19:30:00.000Z");
    await expect(
      repository.findByRequestKey(initial.requestKey),
    ).resolves.toEqual(saved);

    const pending = createOrder({
      ...saved,
      status: "pending_payment",
      updatedAt: "2026-08-14T19:35:00Z",
    });
    if (!pending) throw new Error("FIXTURE_INVALID");
    await expect(repository.save(pending)).resolves.toMatchObject({
      status: "pending_payment",
      pricing: saved.pricing,
    });
  });

  it("keeps case-distinct identities separate under binary collation", async () => {
    const repository = new MySqlOrderRepository(pool);
    const upper = order("ord_mysql_Case1234", "mysql_session_Case1234");
    const lower = order("ord_mysql_case1234", "mysql_session_case1234");

    await repository.save(upper);
    await repository.save(lower);

    await expect(repository.findById(upper.id)).resolves.toMatchObject({
      id: upper.id,
    });
    await expect(repository.findById(lower.id)).resolves.toMatchObject({
      id: lower.id,
    });
  });

  it("persists a server-authoritative subscription and replays the same snapshot", async () => {
    const orders = new MySqlOrderRepository(pool);
    const subscriptions = new MySqlSubscriptionRepository(pool);
    const confirmed = order(
      "ord_mysql_sub12345",
      "mysql_session_sub12345",
      "payment_confirmed",
    );
    await orders.save(confirmed);
    const subscription = activeSubscription(confirmed);

    const first = await subscriptions.save(subscription);
    const replay = await subscriptions.save(subscription);

    expect(first).toEqual({
      ...subscription,
      currentPeriod: {
        ...subscription.currentPeriod,
        pricing: {
          ...subscription.currentPeriod.pricing,
          capturedAt: "2026-08-14T19:30:00.000Z",
        },
      },
    });
    expect(replay).toEqual(first);
    await expect(subscriptions.findById(subscription.id)).resolves.toEqual(
      first,
    );
  });

  it("claims one deterministic renewal intent and rejects semantic key conflicts", async () => {
    const orders = new MySqlOrderRepository(pool);
    const subscriptions = new MySqlSubscriptionRepository(pool);
    const renewals = new MySqlSubscriptionRenewalIntentRepository(pool);
    const confirmed = order(
      "ord_mysql_sub67890",
      "mysql_session_sub67890",
      "payment_confirmed",
    );
    const renewalOrder = order(
      "ord_mysql_renew1234",
      "mysql_session_renew1234",
      "pending_payment",
    );
    const conflictingOrder = order(
      "ord_mysql_renew5678",
      "mysql_session_renew5678",
      "pending_payment",
    );
    await orders.save(confirmed);
    await orders.save(renewalOrder);
    await orders.save(conflictingOrder);
    const subscription = await subscriptions.save(
      activeSubscription(confirmed),
    );
    const intent = prepareSubscriptionRenewal({
      subscription,
      renewalOrderId: renewalOrder.id,
      nextPeriodEndAt: "2026-10-16T00:00:00Z",
      preparedAt: "2026-09-16T00:00:00Z",
    });
    if (!intent) throw new Error("FIXTURE_INVALID");

    await expect(renewals.claim(intent)).resolves.toEqual({
      claimed: true,
      intent,
    });
    await expect(renewals.claim(intent)).resolves.toEqual({
      claimed: false,
      intent,
    });
    await expect(
      renewals.claim({ ...intent, orderId: conflictingOrder.id }),
    ).rejects.toThrow("ORDERING_SUBSCRIPTION_RENEWAL_CLAIM_CONFLICT");
  });

  it("allows only one concurrent subscription state transition to win", async () => {
    const orders = new MySqlOrderRepository(pool);
    const subscriptions = new MySqlSubscriptionRepository(pool);
    const confirmed = order(
      "ord_mysql_race1234",
      "mysql_session_race1234",
      "payment_confirmed",
    );
    const renewalOrder = order(
      "ord_mysql_race5678",
      "mysql_session_race5678",
      "pending_payment",
    );
    await orders.save(confirmed);
    await orders.save(renewalOrder);
    const active = await subscriptions.save(activeSubscription(confirmed));
    const cancellation = scheduleSubscriptionCancellation({
      subscription: active,
      requestedAt: "2026-09-01T00:00:00Z",
    });
    const intent = prepareSubscriptionRenewal({
      subscription: active,
      renewalOrderId: renewalOrder.id,
      nextPeriodEndAt: "2026-10-16T00:00:00Z",
      preparedAt: "2026-09-16T00:00:00Z",
    });
    if (!cancellation || !intent) throw new Error("FIXTURE_INVALID");
    const failure = applyVerifiedSubscriptionRenewalFailure({
      subscription: active,
      intent,
      verifiedFailure: verifiedResult(renewalOrder, {
        suffix: "racefail1234",
        kind: "failed",
        occurredAt: "2026-09-16T00:01:00Z",
        recordedAt: "2026-09-16T00:02:00Z",
      }),
      updatedAt: "2026-09-16T00:03:00Z",
    });
    if (!failure) throw new Error("FIXTURE_INVALID");

    const results = await Promise.allSettled([
      subscriptions.save(cancellation),
      subscriptions.save(failure),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
});
