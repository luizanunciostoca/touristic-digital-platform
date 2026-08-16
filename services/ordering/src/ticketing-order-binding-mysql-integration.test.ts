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
import { createTicketingOrderBinding } from "@touristic/ordering/ticketing-reservation";

import {
  MySqlOrderRepository,
  MySqlTicketingOrderBindingRepository,
  applyOrderingTicketingReservationSchema,
  createOrderingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.ORDERING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function order(): Order {
  const id = normalizeOrderId("ord_ticketing_mysql_0001");
  const requestKey = createBusinessOrderRequestKey(
    "ticketing_mysql_session_0001",
    "ticketing_mysql_plan_0001",
  );
  const source = normalizeOrderSourceReference("ticketing_mysql_source_0001");
  const quote = createPricingQuote({
    planId: "ticketing_mysql_plan_0001",
    planName: "Ticketing MySQL",
    minorUnits: 39_800,
    currency: "BRL",
    pricingVersion: "ticket-2026-08",
  });
  if (!id || !requestKey || !source || !quote)
    throw new Error("FIXTURE_INVALID");
  const pricing = capturePricingSnapshot(quote, "2026-08-16T18:01:00.000Z");
  if (!pricing) throw new Error("FIXTURE_INVALID");
  const value = createOrder({
    id,
    requestKey,
    source,
    status: "payment_confirmed",
    pricing,
    createdAt: "2026-08-16T18:01:00.000Z",
    updatedAt: "2026-08-16T18:03:00.000Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describeMySql.sequential("Ticketing Ordering binding MySQL integration", () => {
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
    await applyOrderingTicketingReservationSchema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM ordering_ticketing_reservation_bindings");
    await pool.query("DELETE FROM ordering_orders");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists one immutable reservation to canonical Order binding and replays exactly", async () => {
    const orders = new MySqlOrderRepository(pool);
    const bindings = new MySqlTicketingOrderBindingRepository(pool);
    const savedOrder = await orders.save(order());
    const binding = createTicketingOrderBinding({
      reservationReference: "trv_ticketing_mysql_0001",
      orderId: savedOrder.id,
      productReference: "tour:volta-a-ilha",
      quantity: 2,
      amount: savedOrder.pricing.amount,
      pricingVersion: savedOrder.pricing.pricingVersion,
      boundAt: "2026-08-16T18:01:30.000Z",
    });
    if (!binding) throw new Error("FIXTURE_INVALID");

    const first = await bindings.save(binding);
    const replay = await bindings.save(binding);

    expect(replay).toEqual(first);
    await expect(
      bindings.findByReservationReference(binding.reservationReference),
    ).resolves.toEqual(first);
    await expect(bindings.findByOrderId(savedOrder.id)).resolves.toEqual(first);
  });

  it("fails closed when the same reservation is rebound to another product snapshot", async () => {
    const orders = new MySqlOrderRepository(pool);
    const bindings = new MySqlTicketingOrderBindingRepository(pool);
    const savedOrder = await orders.save(order());
    const binding = createTicketingOrderBinding({
      reservationReference: "trv_ticketing_mysql_0001",
      orderId: savedOrder.id,
      productReference: "tour:volta-a-ilha",
      quantity: 2,
      amount: savedOrder.pricing.amount,
      pricingVersion: savedOrder.pricing.pricingVersion,
      boundAt: "2026-08-16T18:01:30.000Z",
    });
    if (!binding) throw new Error("FIXTURE_INVALID");
    await bindings.save(binding);
    const divergent = createTicketingOrderBinding({
      ...binding,
      productReference: "tour:garapua",
    });
    if (!divergent) throw new Error("FIXTURE_INVALID");

    await expect(bindings.save(divergent)).rejects.toThrow(
      "ORDERING_TICKETING_IMMUTABLE_BINDING_CONFLICT",
    );
  });
});
