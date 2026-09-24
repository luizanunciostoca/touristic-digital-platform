import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  MySqlTicketingBusinessInventoryRepository,
  MySqlTicketingPublicReadRepository,
  applyTicketingPublicApiSchema,
  createTicketingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.TICKETING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function offer(overrides: Record<string, unknown> = {}) {
  return {
    productKind: "business_experience",
    productReference: "the-party-2026-09-26",
    label: "The Party · Pista · 1º lote",
    unitAmountMinor: 8000,
    currency: "BRL",
    pricingVersion: "party-20260926-v1",
    capacity: 200,
    maxPerReservation: 8,
    salesStartAt: "2026-09-20T12:00:00.000Z",
    salesEndAt: "2026-09-26T23:00:00.000Z",
    startsAt: "2026-09-27T02:59:00.000Z",
    endsAt: "2026-09-27T09:00:00.000Z",
    admission: {
      offeringId: "event_the_party_20260926",
      placeId: "place_toca_do_morcego",
      subtype: "party",
      ticketType: "Pista",
      tierLabel: "1º lote",
      displayOrder: 10,
    },
    ...overrides,
  };
}

describeMySql.sequential("Ticketing admission profile MySQL integration", () => {
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
    await pool.query("DELETE FROM ticketing_admission_profiles");
    await pool.query("DELETE FROM ticketing_inventory_ownership");
    await pool.query("DELETE FROM ticketing_inventory");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists admission metadata without duplicating ticketing price or capacity", async () => {
    const inventory = new MySqlTicketingBusinessInventoryRepository(pool);
    const created = await inventory.createForBusiness({
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
      requestKey: "party_20260926_001",
      actorSubject: "owner:business-a",
      offer: offer(),
      recordedAt: "2026-09-23T20:00:00.000Z",
    });

    expect(created.replayed).toBe(false);
    expect(created.offer).toMatchObject({
      businessId: "business-a",
      unitAmountMinor: 8000,
      capacity: 200,
      admission: {
        offeringId: "event_the_party_20260926",
        placeId: "place_toca_do_morcego",
        subtype: "party",
        ticketType: "Pista",
        tierLabel: "1º lote",
        displayOrder: 10,
      },
    });

    const [profileRows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM ticketing_admission_profiles WHERE inventory_id = ?",
      [created.offer.id],
    );
    expect(profileRows).toHaveLength(1);
    expect(profileRows[0]).not.toHaveProperty("unit_amount_minor");
    expect(profileRows[0]).not.toHaveProperty("capacity");

    await expect(inventory.listByBusiness("business-a")).resolves.toEqual([
      created.offer,
    ]);

    const publicInventory = new MySqlTicketingPublicReadRepository(pool);
    await expect(publicInventory.listInventory()).resolves.toEqual([
      expect.objectContaining({
        id: created.offer.id,
        admission: created.offer.admission,
      }),
    ]);
  });

  it("rejects admission metadata on a non-admission product kind", async () => {
    const inventory = new MySqlTicketingBusinessInventoryRepository(pool);

    await expect(
      inventory.createForBusiness({
        businessId: "business-a",
        destinationId: "morro-de-sao-paulo",
        requestKey: "tour_20260926_001",
        actorSubject: "owner:business-a",
        offer: offer({
          productKind: "tour",
          productReference: "volta-a-ilha",
        }),
        recordedAt: "2026-09-23T20:00:00.000Z",
      }),
    ).rejects.toThrow("MORRO_PRO_ADMISSION_PRODUCT_KIND_INVALID");
  });
});
