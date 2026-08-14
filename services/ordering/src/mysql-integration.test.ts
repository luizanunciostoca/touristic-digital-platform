import mysql, { type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
} from "@touristic/ordering";

import {
  MySqlOrderRepository,
  applyOrderingM137Schema,
  createOrderingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.ORDERING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function order(
  idValue = "ord_mysql_12345678",
  sessionId = "mysql_session_123",
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
  if (!id || !requestKey || !source || !quote) throw new Error("FIXTURE_INVALID");
  const pricing = capturePricingSnapshot(quote, "2026-08-14T19:30:00Z");
  if (!pricing) throw new Error("FIXTURE_INVALID");
  const value = createOrder({
    id,
    requestKey,
    source,
    status: "draft",
    pricing,
    createdAt: "2026-08-14T19:31:00Z",
    updatedAt: "2026-08-14T19:31:00Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describeMySql.sequential("M137 Ordering MySQL integration", () => {
  let pool: Pool;

  beforeAll(async () => {
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
    await applyOrderingM137Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM ordering_orders");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists immutable pricing and advances lifecycle through compare-and-swap", async () => {
    const repository = new MySqlOrderRepository(pool);
    const initial = order();
    const saved = await repository.save(initial);

    expect(saved.createdAt).toBe("2026-08-14T19:31:00.000Z");
    expect(saved.pricing.capturedAt).toBe("2026-08-14T19:30:00.000Z");
    await expect(repository.findByRequestKey(initial.requestKey)).resolves.toEqual(saved);

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

    await expect(repository.findById(upper.id)).resolves.toMatchObject({ id: upper.id });
    await expect(repository.findById(lower.id)).resolves.toMatchObject({ id: lower.id });
  });
});
