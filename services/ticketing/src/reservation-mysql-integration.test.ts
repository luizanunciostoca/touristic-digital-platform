import mysql, { type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTicketInventoryOffer,
  createTicketReservationRequestKey,
} from "@touristic/ticketing/reservations";

import {
  MySqlTicketReservationRepository,
  applyTicketingM150ReservationSchema,
  createTicketReservationApplicationService,
  createTicketingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.TICKETING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function offer(
  input: {
    readonly id?: string;
    readonly amount?: number;
    readonly pricingVersion?: string;
    readonly capacity?: number;
    readonly updatedAt?: string;
  } = {},
) {
  const value = createTicketInventoryOffer({
    id: input.id ?? "tin_reservation_mysql_0001",
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "volta-a-ilha" },
    label: "Volta a Ilha",
    unitAmount: { minorUnits: input.amount ?? 19_900, currency: "BRL" },
    pricingVersion: input.pricingVersion ?? "ticket-2026-08-v1",
    capacity: input.capacity ?? 1,
    maxPerReservation: 1,
    salesStartAt: "2026-08-16T12:00:00.000Z",
    salesEndAt: "2026-08-16T19:00:00.000Z",
    startsAt: "2026-08-16T20:00:00.000Z",
    endsAt: "2026-08-17T02:00:00.000Z",
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-08-16T10:00:00.000Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

function requestKey(inventoryId: string, attempt: string) {
  const value = createTicketReservationRequestKey(inventoryId, attempt);
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describeMySql.sequential("M150 Ticketing reservation MySQL integration", () => {
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
    await applyTicketingM150ReservationSchema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM ticketing_reservation_events");
    await pool.query("DELETE FROM ticketing_reservations");
    await pool.query("DELETE FROM ticketing_inventory");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("serializes concurrent holds so capacity can never oversell", async () => {
    const reservations = new MySqlTicketReservationRepository(pool);
    const inventory = offer({ capacity: 1 });
    await reservations.saveInventory(inventory);

    const attempts = await Promise.allSettled([
      reservations.hold({
        reservationId: "trv_concurrent_mysql_0001",
        requestKey: requestKey(inventory.id, "concurrent_attempt_0001"),
        inventoryId: inventory.id,
        holderReference: "holder_concurrent_0001",
        quantity: 1,
        heldAt: "2026-08-16T18:00:00.000Z",
        expiresAt: "2026-08-16T18:10:00.000Z",
        actorReference: "reservation_api",
      }),
      reservations.hold({
        reservationId: "trv_concurrent_mysql_0002",
        requestKey: requestKey(inventory.id, "concurrent_attempt_0002"),
        inventoryId: inventory.id,
        holderReference: "holder_concurrent_0002",
        quantity: 1,
        heldAt: "2026-08-16T18:00:00.000Z",
        expiresAt: "2026-08-16T18:10:00.000Z",
        actorReference: "reservation_api",
      }),
    ]);

    const fulfilled = attempts.filter(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        Awaited<ReturnType<typeof reservations.hold>>
      > => attempt.status === "fulfilled",
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      message: "TICKETING_INVENTORY_EXHAUSTED",
    });
    await expect(
      reservations.availability(inventory.id, "2026-08-16T18:01:00.000Z"),
    ).resolves.toMatchObject({
      committedQuantity: 1,
      remainingQuantity: 0,
    });
  });

  it("replays an exact request key without duplicating capacity or audit", async () => {
    const reservations = new MySqlTicketReservationRepository(pool);
    const inventory = offer({ capacity: 1 });
    await reservations.saveInventory(inventory);
    const input = {
      reservationId: "trv_replay_mysql_0001",
      requestKey: requestKey(inventory.id, "replay_attempt_0001"),
      inventoryId: inventory.id,
      holderReference: "holder_replay_0001",
      quantity: 1,
      heldAt: "2026-08-16T18:00:00.000Z",
      expiresAt: "2026-08-16T18:10:00.000Z",
      actorReference: "reservation_api",
    } as const;

    const first = await reservations.hold(input);
    const replay = await reservations.hold(input);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.reservation).toEqual(first.reservation);
    expect(replay.availability.committedQuantity).toBe(1);
    await expect(
      reservations.listEvents(first.reservation.id),
    ).resolves.toEqual([expect.objectContaining({ eventType: "held" })]);
  });

  it("expires stale holds transactionally and releases capacity for the next buyer", async () => {
    const reservations = new MySqlTicketReservationRepository(pool);
    const inventory = offer({ capacity: 1 });
    await reservations.saveInventory(inventory);
    const first = await reservations.hold({
      reservationId: "trv_expiry_mysql_0001",
      requestKey: requestKey(inventory.id, "expiry_attempt_0001"),
      inventoryId: inventory.id,
      holderReference: "holder_expiry_0001",
      quantity: 1,
      heldAt: "2026-08-16T18:00:00.000Z",
      expiresAt: "2026-08-16T18:02:00.000Z",
      actorReference: "reservation_api",
    });

    await expect(
      reservations.availability(inventory.id, "2026-08-16T18:03:00.000Z"),
    ).resolves.toMatchObject({
      committedQuantity: 0,
      remainingQuantity: 1,
    });
    await expect(
      reservations.findReservationById(first.reservation.id),
    ).resolves.toMatchObject({ status: "expired" });
    await expect(
      reservations.listEvents(first.reservation.id),
    ).resolves.toEqual([
      expect.objectContaining({ eventType: "held" }),
      expect.objectContaining({
        eventType: "expired",
        actorReference: "system_expiry",
      }),
    ]);

    await expect(
      reservations.hold({
        reservationId: "trv_expiry_mysql_0002",
        requestKey: requestKey(inventory.id, "expiry_attempt_0002"),
        inventoryId: inventory.id,
        holderReference: "holder_expiry_0002",
        quantity: 1,
        heldAt: "2026-08-16T18:03:01.000Z",
        expiresAt: "2026-08-16T18:13:01.000Z",
        actorReference: "reservation_api",
      }),
    ).resolves.toMatchObject({ replayed: false });
  });

  it("releases cancelled holds and keeps an append-only audit trail", async () => {
    const reservations = new MySqlTicketReservationRepository(pool);
    const inventory = offer({ capacity: 1 });
    await reservations.saveInventory(inventory);
    const held = await reservations.hold({
      reservationId: "trv_cancel_mysql_0001",
      requestKey: requestKey(inventory.id, "cancel_attempt_0001"),
      inventoryId: inventory.id,
      holderReference: "holder_cancel_0001",
      quantity: 1,
      heldAt: "2026-08-16T18:00:00.000Z",
      expiresAt: "2026-08-16T18:10:00.000Z",
      actorReference: "reservation_api",
    });

    const cancelled = await reservations.cancelHold({
      reservationId: held.reservation.id,
      cancelledAt: "2026-08-16T18:01:00.000Z",
      actorReference: "holder_cancel_0001",
    });
    expect(cancelled.reservation.status).toBe("cancelled");
    await expect(
      reservations.availability(inventory.id, "2026-08-16T18:01:01.000Z"),
    ).resolves.toMatchObject({ remainingQuantity: 1 });
    await expect(reservations.listEvents(held.reservation.id)).resolves.toEqual(
      [
        expect.objectContaining({ eventType: "held" }),
        expect.objectContaining({ eventType: "cancelled" }),
      ],
    );
  });

  it("snapshots catalog pricing and confirms only through backend authority", async () => {
    const reservations = new MySqlTicketReservationRepository(pool);
    const inventory = offer({ capacity: 2 });
    await reservations.saveInventory(inventory);
    const held = await reservations.hold({
      reservationId: "trv_authority_mysql_0001",
      requestKey: requestKey(inventory.id, "authority_attempt_0001"),
      inventoryId: inventory.id,
      holderReference: "holder_authority_0001",
      quantity: 1,
      heldAt: "2026-08-16T18:00:00.000Z",
      expiresAt: "2026-08-16T18:10:00.000Z",
      actorReference: "reservation_api",
    });

    await reservations.saveInventory(
      offer({
        capacity: 2,
        amount: 24_900,
        pricingVersion: "ticket-2026-08-v2",
        updatedAt: "2026-08-16T18:01:00.000Z",
      }),
    );
    expect(held.reservation.unitAmount.minorUnits).toBe(19_900);
    expect(held.reservation.pricingVersion).toBe("ticket-2026-08-v1");

    const service = createTicketReservationApplicationService({
      reservations,
      confirmationAuthority: {
        async verify(input) {
          expect(input.reservation.unitAmount.minorUnits).toBe(19_900);
          expect(input.reservation.pricingVersion).toBe("ticket-2026-08-v1");
          return { orderId: input.orderId, paymentId: input.paymentId };
        },
      },
      clock: { now: () => "2026-08-16T18:05:00.000Z" },
    });
    const confirmed = await service.confirmReservation({
      reservationId: held.reservation.id,
      orderId: "ord_ticket_reservation_0001",
      paymentId: "pay_ticket_reservation_0001",
      actorReference: "payment_webhook",
    });
    expect(confirmed.reservation).toMatchObject({
      status: "confirmed",
      orderId: "ord_ticket_reservation_0001",
      paymentId: "pay_ticket_reservation_0001",
      pricingVersion: "ticket-2026-08-v1",
    });
    await expect(reservations.listEvents(held.reservation.id)).resolves.toEqual(
      [
        expect.objectContaining({ eventType: "held" }),
        expect.objectContaining({ eventType: "confirmed" }),
      ],
    );
  });
});
