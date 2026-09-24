import mysql, { type Pool } from "mysql2/promise";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  createRestaurantReservationSlot,
} from "@touristic/commerce/restaurant-availability";
import {
  createRestaurantReservationRequestKey,
} from "@touristic/commerce/restaurant-reservations";

import {
  MySqlRestaurantReservationRepository,
  applyCommerceRestaurantReservationSchema,
  createCommerceMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.COMMERCE_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function slot(overrides: Record<string, unknown> = {}) {
  const value = createRestaurantReservationSlot({
    id: "rsl_mysql_dinner_0001",
    businessId: "business_restaurant_a",
    placeId: "place_restaurant_a",
    destinationId: "morro-de-sao-paulo",
    serviceDate: "2026-10-10",
    startsAt: "2026-10-10T22:00:00.000Z",
    endsAt: "2026-10-11T00:00:00.000Z",
    seatingArea: "varanda",
    capacity: 4,
    minPartySize: 1,
    maxPartySize: 4,
    minimumLeadMinutes: 60,
    maximumAdvanceDays: 90,
    holdDurationSeconds: 600,
    depositPolicy: { kind: "none" },
    enabled: true,
    createdAt: "2026-09-23T20:00:00.000Z",
    ...overrides,
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

function requestKey(slotId: string, attempt: string): string {
  const value = createRestaurantReservationRequestKey(slotId, attempt);
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describeMySql.sequential(
  "Morro Commerce restaurant reservation MySQL integration",
  () => {
    let pool: Pool;

    beforeAll(async () => {
      if (!adminUrl || !databaseUrl) {
        throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
      }
      const admin = await mysql.createConnection(adminUrl);
      try {
        await admin.query(
          "CREATE DATABASE IF NOT EXISTS commerce_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        );
      } finally {
        await admin.end();
      }
      pool = createCommerceMySqlPoolFromEnvironment({
        COMMERCE_DATABASE_URL: databaseUrl,
      });
      await applyCommerceRestaurantReservationSchema(pool);
    });

    beforeEach(async () => {
      await pool.query("DELETE FROM commerce_restaurant_reservation_events");
      await pool.query("DELETE FROM commerce_restaurant_reservations");
      await pool.query("DELETE FROM commerce_restaurant_slots");
    });

    afterAll(async () => {
      await pool?.end();
    });

    it(
      "serializes concurrent holds and prevents restaurant overbooking",
      async () => {
        const repository = new MySqlRestaurantReservationRepository(pool);
        const resource = slot({ capacity: 4, maxPartySize: 4 });
        await repository.saveSlot(resource);

        const attempts = await Promise.allSettled([
          repository.hold({
            reservationId: "rrv_mysql_concurrent_0001",
            requestKey: requestKey(resource.id, "concurrent_0001"),
            slotId: resource.id,
            businessId: resource.businessId,
            holderReference: "guest_concurrent_0001",
            partySize: 3,
            heldAt: "2026-10-10T20:00:00.000Z",
            actorReference: "reservation_api",
          }),
          repository.hold({
            reservationId: "rrv_mysql_concurrent_0002",
            requestKey: requestKey(resource.id, "concurrent_0002"),
            slotId: resource.id,
            businessId: resource.businessId,
            holderReference: "guest_concurrent_0002",
            partySize: 3,
            heldAt: "2026-10-10T20:00:00.000Z",
            actorReference: "reservation_api",
          }),
        ]);

        expect(
          attempts.filter(({ status }) => status === "fulfilled"),
        ).toHaveLength(1);
        const rejected = attempts.filter(
          (attempt): attempt is PromiseRejectedResult =>
            attempt.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toMatchObject({
          message: "COMMERCE_RESTAURANT_CAPACITY_EXHAUSTED",
        });
      },
    );

    it("replays the same request without consuming capacity twice", async () => {
      const repository = new MySqlRestaurantReservationRepository(pool);
      const resource = slot();
      await repository.saveSlot(resource);
      const input = {
        reservationId: "rrv_mysql_replay_0001",
        requestKey: requestKey(resource.id, "replay_0001"),
        slotId: resource.id,
        businessId: resource.businessId,
        holderReference: "guest_replay_0001",
        partySize: 2,
        heldAt: "2026-10-10T20:00:00.000Z",
        actorReference: "reservation_api",
      } as const;

      const first = await repository.hold(input);
      const replay = await repository.hold(input);
      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(replay.reservation.id).toBe(first.reservation.id);
      await expect(
        repository.availability(
          resource.id,
          resource.businessId,
          "2026-10-10T20:01:00.000Z",
        ),
      ).resolves.toMatchObject({
        committedGuests: 2,
        remainingGuests: 2,
      });
    });

    it(
      "prevents cross-business reads through the availability boundary",
      async () => {
        const repository = new MySqlRestaurantReservationRepository(pool);
        const resource = slot();
        await repository.saveSlot(resource);

        await expect(
          repository.availability(
            resource.id,
            "business_restaurant_b",
            "2026-10-10T20:00:00.000Z",
          ),
        ).rejects.toThrow("COMMERCE_RESTAURANT_SLOT_NOT_FOUND");
      },
    );

    it(
      "confirms no-deposit reservations without creating fake payment identities",
      async () => {
        const repository = new MySqlRestaurantReservationRepository(pool);
        const resource = slot();
        await repository.saveSlot(resource);
        const held = await repository.hold({
          reservationId: "rrv_mysql_confirm_0001",
          requestKey: requestKey(resource.id, "confirm_0001"),
          slotId: resource.id,
          businessId: resource.businessId,
          holderReference: "guest_confirm_0001",
          partySize: 2,
          heldAt: "2026-10-10T20:00:00.000Z",
          actorReference: "reservation_api",
        });

        const confirmed = await repository.confirmWithoutDeposit({
          reservationId: held.reservation.id,
          businessId: resource.businessId,
          confirmedAt: "2026-10-10T20:01:00.000Z",
          actorReference: "reservation_api",
        });

        expect(confirmed.reservation).toMatchObject({
          status: "confirmed",
          orderId: null,
          paymentId: null,
          depositPolicy: { kind: "none" },
        });
      },
    );

    it(
      "blocks direct confirmation when a server-owned deposit is required",
      async () => {
        const repository = new MySqlRestaurantReservationRepository(pool);
        const resource = slot({
          id: "rsl_mysql_deposit_0001",
          depositPolicy: {
            kind: "required",
            amount: { minorUnits: 5000, currency: "BRL" },
          },
        });
        await repository.saveSlot(resource);
        const held = await repository.hold({
          reservationId: "rrv_mysql_deposit_0001",
          requestKey: requestKey(resource.id, "deposit_0001"),
          slotId: resource.id,
          businessId: resource.businessId,
          holderReference: "guest_deposit_0001",
          partySize: 2,
          heldAt: "2026-10-10T20:00:00.000Z",
          actorReference: "reservation_api",
        });

        expect(held.reservation.depositPolicy).toEqual({
          kind: "required",
          amount: { minorUnits: 5000, currency: "BRL" },
        });
        await expect(
          repository.confirmWithoutDeposit({
            reservationId: held.reservation.id,
            businessId: resource.businessId,
            confirmedAt: "2026-10-10T20:01:00.000Z",
            actorReference: "reservation_api",
          }),
        ).rejects.toThrow("COMMERCE_RESTAURANT_VERIFIED_PAYMENT_REQUIRED");
      },
    );
  },
);
