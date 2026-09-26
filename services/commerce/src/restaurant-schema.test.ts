import { describe, expect, it } from "vitest";

import {
  commerceRestaurantReservationRollbackSql,
  commerceRestaurantReservationSchemaSql,
} from "./restaurant-schema.js";

describe("commerce restaurant reservation schema", () => {
  it("owns slots, reservations and immutable reservation events", () => {
    expect(commerceRestaurantReservationSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS commerce_restaurant_slots",
    );
    expect(commerceRestaurantReservationSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS commerce_restaurant_reservations",
    );
    expect(commerceRestaurantReservationSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS commerce_restaurant_reservation_events",
    );
  });

  it("preserves identity, capacity and deposit invariants", () => {
    expect(commerceRestaurantReservationSchemaSql).toContain(
      "destination_id VARCHAR(120)",
    );
    expect(commerceRestaurantReservationSchemaSql).toContain(
      "chk_commerce_restaurant_slot_capacity",
    );
    expect(commerceRestaurantReservationSchemaSql).toContain(
      "chk_commerce_restaurant_reservation_deposit",
    );
    expect(commerceRestaurantReservationSchemaSql).toContain(
      "request_key VARCHAR(160) COLLATE utf8mb4_bin NOT NULL UNIQUE",
    );
  });

  it("rolls back dependents before their parents", () => {
    const events = commerceRestaurantReservationRollbackSql.indexOf(
      "commerce_restaurant_reservation_events",
    );
    const reservations = commerceRestaurantReservationRollbackSql.indexOf(
      "commerce_restaurant_reservations",
    );
    const slots = commerceRestaurantReservationRollbackSql.indexOf(
      "commerce_restaurant_slots",
    );
    expect(events).toBeGreaterThanOrEqual(0);
    expect(reservations).toBeGreaterThan(events);
    expect(slots).toBeGreaterThan(reservations);
  });
});
