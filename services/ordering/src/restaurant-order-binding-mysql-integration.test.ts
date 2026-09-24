import mysql, { type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  capturePricingSnapshot,
  createOrder,
  createPricingQuote,
  createRestaurantOrderRequestKey,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
} from "@touristic/ordering";
import { createRestaurantReservationOrderBinding } from "@touristic/ordering/restaurant-reservation";

import {
  MySqlOrderRepository,
  MySqlRestaurantReservationOrderBindingRepository,
  applyOrderingRestaurantReservationSchema,
  createOrderingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.ORDERING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

async function createAdminConnectionWithRetry(url: string) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await mysql.createConnection(url);
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 250);
      });
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("MYSQL_ADMIN_CONNECTION_FAILED");
}

function order(): Order {
  const id = normalizeOrderId("ord_restaurant_mysql_0001");
  const requestKey = createRestaurantOrderRequestKey(
    "rrv_restaurant_mysql_0001",
  );
  const source = normalizeOrderSourceReference(
    "rrv_restaurant_mysql_0001",
    "restaurant_reservation",
  );
  const quote = createPricingQuote({
    planId: "rrv_restaurant_mysql_0001",
    planName: "restaurant_deposit",
    minorUnits: 5000,
    currency: "BRL",
    pricingVersion: "rdep_mysql_0001",
  });
  if (!id || !requestKey || !source || !quote) {
    throw new Error("FIXTURE_INVALID");
  }
  const pricing = capturePricingSnapshot(quote, "2026-09-24T01:00:00.000Z");
  if (!pricing) throw new Error("FIXTURE_INVALID");
  const value = createOrder({
    id,
    requestKey,
    source,
    status: "pending_payment",
    pricing,
    createdAt: "2026-09-24T01:00:00.000Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describeMySql.sequential(
  "Restaurant Ordering binding MySQL integration",
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!adminUrl || !databaseUrl) {
        throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
      }
      const admin = await createAdminConnectionWithRetry(adminUrl);
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
      await applyOrderingRestaurantReservationSchema(pool);
    });

    beforeEach(async () => {
      await pool.query("DELETE FROM ordering_subscription_renewal_intents");
      await pool.query("DELETE FROM ordering_subscriptions");
      await pool.query(
        "DELETE FROM ordering_restaurant_reservation_bindings",
      );
      await pool.query("DELETE FROM ordering_ticketing_reservation_bindings");
      await pool.query("DELETE FROM ordering_orders");
    });

    afterAll(async () => {
      await pool?.end();
    });

    it("persists one immutable restaurant reservation binding", async () => {
      const orders = new MySqlOrderRepository(pool);
      const bindings =
        new MySqlRestaurantReservationOrderBindingRepository(pool);
      const savedOrder = await orders.save(order());
      const binding = createRestaurantReservationOrderBinding({
        reservationReference: "rrv_restaurant_mysql_0001",
        orderId: savedOrder.id,
        businessId: "business_restaurant_a",
        amount: savedOrder.pricing.amount,
        pricingVersion: savedOrder.pricing.pricingVersion,
        boundAt: savedOrder.createdAt,
      });
      if (!binding) throw new Error("FIXTURE_INVALID");

      const first = await bindings.save(binding);
      const replay = await bindings.save(binding);

      expect(replay).toEqual(first);
      await expect(
        bindings.findByReservationReference(binding.reservationReference),
      ).resolves.toEqual(first);
      await expect(bindings.findByOrderId(savedOrder.id)).resolves.toEqual(
        first,
      );
    });

    it("fails closed when business scope drifts", async () => {
      const orders = new MySqlOrderRepository(pool);
      const bindings =
        new MySqlRestaurantReservationOrderBindingRepository(pool);
      const savedOrder = await orders.save(order());
      const binding = createRestaurantReservationOrderBinding({
        reservationReference: "rrv_restaurant_mysql_0001",
        orderId: savedOrder.id,
        businessId: "business_restaurant_a",
        amount: savedOrder.pricing.amount,
        pricingVersion: savedOrder.pricing.pricingVersion,
        boundAt: savedOrder.createdAt,
      });
      if (!binding) throw new Error("FIXTURE_INVALID");
      await bindings.save(binding);
      const divergent = createRestaurantReservationOrderBinding({
        ...binding,
        businessId: "business_restaurant_b",
      });
      if (!divergent) throw new Error("FIXTURE_INVALID");

      await expect(bindings.save(divergent)).rejects.toThrow(
        "ORDERING_RESTAURANT_IMMUTABLE_BINDING_CONFLICT",
      );
    });
  },
);
