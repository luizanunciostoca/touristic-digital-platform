import mysql, { type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTicketInventoryOffer,
  createTicketReservationRequestKey,
} from "@touristic/ticketing/reservations";

import {
  MySqlTicketReservationRepository,
  TicketingAdminService,
  applyTicketingPublicApiSchema,
  createTicketingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.TICKETING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function offer() {
  const value = createTicketInventoryOffer({
    id: "tin_admin_mysql_0001",
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "volta-a-ilha-admin" },
    label: "Volta a Ilha Admin",
    unitAmount: { minorUnits: 24_900, currency: "BRL" },
    pricingVersion: "admin-2026-v1",
    capacity: 10,
    maxPerReservation: 4,
    salesStartAt: "2026-09-20T12:00:00.000Z",
    salesEndAt: "2026-10-10T18:00:00.000Z",
    startsAt: "2026-10-11T12:00:00.000Z",
    endsAt: "2026-10-11T18:00:00.000Z",
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describeMySql.sequential("Ticketing admin owner contract", () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!adminUrl || !databaseUrl) {
      throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
    }
    const admin = await mysql.createConnection(adminUrl);
    try {
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS ticketing_m147_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    } finally {
      await admin.end();
    }
    pool = createTicketingMySqlPoolFromEnvironment({
      TICKETING_DATABASE_URL: databaseUrl,
    });
    await applyTicketingPublicApiSchema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM ticketing_reservation_events");
    await pool.query("DELETE FROM ticketing_reservations");
    await pool.query("DELETE FROM ticketing_inventory_ownership");
    await pool.query("DELETE FROM ticketing_inventory");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("projects global inventory with owner, product and availability relations", async () => {
    const reservations = new MySqlTicketReservationRepository(pool);
    const inventory = offer();
    await reservations.saveInventory(inventory);
    await pool.execute(
      `INSERT INTO ticketing_inventory_ownership
       (inventory_id, business_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        inventory.id,
        "business-admin-0001",
        "business-owner",
        new Date(inventory.createdAt),
        new Date(inventory.updatedAt),
      ],
    );

    await reservations.hold({
      reservationId: "trv_admin_mysql_0001",
      requestKey: createTicketReservationRequestKey(
        inventory.id,
        "admin_owner_contract_0001",
      ),
      inventoryId: inventory.id,
      holderReference: "holder_admin_0001",
      quantity: 2,
      heldAt: "2026-09-21T12:00:00.000Z",
      expiresAt: "2026-09-21T12:30:00.000Z",
      actorReference: "reservation_api",
    });

    const service = new TicketingAdminService(pool);
    const listed = await service.listInventory({
      query: "Volta a Ilha",
      businessId: "business-admin-0001",
      limit: 10,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      businessId: "business-admin-0001",
      committedQuantity: 2,
      availableQuantity: 8,
      reservationCount: 1,
      offer: {
        id: inventory.id,
        product: { kind: "tour", reference: "volta-a-ilha-admin" },
      },
    });

    const detail = await service.readInventory(
      inventory.id,
      "2026-09-21T12:05:00.000Z",
    );
    expect(detail).toMatchObject({
      projection: {
        businessId: "business-admin-0001",
        committedQuantity: 2,
      },
      availability: {
        remainingQuantity: 8,
      },
    });
  });

  it("searches reservation relations, returns history and only cancels held state", async () => {
    const reservations = new MySqlTicketReservationRepository(pool);
    const inventory = offer();
    await reservations.saveInventory(inventory);
    await pool.execute(
      `INSERT INTO ticketing_inventory_ownership
       (inventory_id, business_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        inventory.id,
        "business-admin-0001",
        "business-owner",
        new Date(inventory.createdAt),
        new Date(inventory.updatedAt),
      ],
    );
    const held = await reservations.hold({
      reservationId: "trv_admin_mysql_0002",
      requestKey: createTicketReservationRequestKey(
        inventory.id,
        "admin_owner_contract_0002",
      ),
      inventoryId: inventory.id,
      holderReference: "holder_admin_0002",
      quantity: 1,
      heldAt: "2026-09-21T12:00:00.000Z",
      expiresAt: "2026-09-21T12:30:00.000Z",
      actorReference: "reservation_api",
    });

    const service = new TicketingAdminService(pool);
    const listed = await service.listReservations({
      query: "holder_admin_0002",
      status: "held",
      limit: 10,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      businessId: "business-admin-0001",
      inventoryLabel: "Volta a Ilha Admin",
      reservation: {
        id: held.reservation.id,
        holderReference: "holder_admin_0002",
      },
    });

    const detail = await service.readReservation(held.reservation.id);
    expect(detail?.events.map((event) => event.eventType)).toEqual(["held"]);

    const cancelled = await service.cancelHeldReservation({
      reservationId: held.reservation.id,
      cancelledAt: "2026-09-21T12:10:00.000Z",
      actorReference: "platform_owner",
    });
    expect(cancelled).toMatchObject({
      previousState: { status: "held" },
      newState: { status: "cancelled" },
      replayed: false,
    });
    const after = await service.readReservation(held.reservation.id);
    expect(after?.events.map((event) => event.eventType)).toEqual([
      "held",
      "cancelled",
    ]);
  });
});
