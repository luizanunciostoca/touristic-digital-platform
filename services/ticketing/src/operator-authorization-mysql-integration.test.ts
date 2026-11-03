import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MySqlTicketingBusinessInventoryRepository } from "./business-inventory-repository.js";
import { MySqlTicketReservationRepository } from "./mysql-ticket-reservation-repository.js";
import {
  applyTicketingPublicApiSchema,
  createTicketingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.TICKETING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;
const tables = [
  "ticketing_admission_profiles",
  "ticketing_inventory_catalog_bindings",
  "ticketing_inventory_ownership",
  "ticketing_inventory",
] as const;

describeMySql.sequential("Ticketing ownership exact MySQL reads", () => {
  let pool: Pool;
  let repository: MySqlTicketingBusinessInventoryRepository;
  let reservations: MySqlTicketReservationRepository;

  beforeAll(async () => {
    if (!databaseUrl || !adminUrl)
      throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
    const admin = await mysql.createConnection(adminUrl);
    try {
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS ticketing_operator_ownership_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    } finally {
      await admin.end();
    }
    const isolated = new URL(databaseUrl);
    isolated.pathname = "/ticketing_operator_ownership_test";
    pool = createTicketingMySqlPoolFromEnvironment({
      TICKETING_DATABASE_URL: isolated.href,
    });
    await applyTicketingPublicApiSchema(pool);
    repository = new MySqlTicketingBusinessInventoryRepository(pool);
    reservations = new MySqlTicketReservationRepository(pool);
  });

  beforeEach(async () => {
    for (const table of tables) await pool.query(`DELETE FROM ${table}`);
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function create(
    businessId = "business-a",
    binding = true,
    admission = true,
  ) {
    return repository.createForBusiness({
      businessId,
      destinationId: "morro-de-sao-paulo",
      requestKey: "p201_ownership_" + businessId,
      actorSubject: "p201_fixture",
      recordedAt: "2026-11-03T00:00:00Z",
      offer: {
        productKind: "business_experience",
        productReference: "show_" + businessId,
        label: "Ownership fixture",
        unitAmountMinor: 12500,
        currency: "BRL",
        pricingVersion: "p201-v1",
        capacity: 20,
        maxPerReservation: 2,
        salesStartAt: "2026-11-03T01:00:00Z",
        salesEndAt: "2026-11-04T01:00:00Z",
        startsAt: "2026-11-04T02:00:00Z",
        endsAt: "2026-11-04T03:00:00Z",
        ...(binding ? { canonicalOfferId: "offer_" + businessId } : {}),
        ...(admission
          ? {
              admission: {
                placeId: "place_" + businessId,
                subtype: "event",
                ticketType: "standard",
                tierLabel: null,
                displayOrder: 0,
              },
            }
          : {}),
      },
    });
  }

  async function readFacts(id: string) {
    return {
      ownership: await repository.findOwnershipByInventoryId(id),
      catalog: await repository.findCatalogBindingByInventoryId(id),
      admission: await repository.findAdmissionProfileByInventoryId(id),
    };
  }

  async function snapshot() {
    return Promise.all(
      tables.map(async (table) => {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT * FROM ${table} ORDER BY inventory_id`,
        );
        return rows;
      }),
    );
  }

  it("reads exact ownership, catalog and admission records without effects", async () => {
    const a = await create();
    const b = await create("business-b");
    const before = await snapshot();
    for (const item of [a, b]) {
      const { id, businessId, admission } = item.offer;
      expect(await readFacts(id)).toEqual({
        ownership: { inventoryId: id, businessId },
        catalog: {
          inventoryId: id,
          businessId,
          offerId: "offer_" + businessId,
        },
        admission: { inventoryId: id, admission },
      });
    }
    expect(await snapshot()).toEqual(before);
    // The existing raw inventory reader does not load the separate profile table.
    expect(await reservations.findInventoryById(a.offer.id)).not.toHaveProperty(
      "admission",
    );
  });

  it("preserves a modern inventory with no optional catalog or admission record", async () => {
    const { offer } = await create("business-a", false, false);
    expect(await readFacts(offer.id)).toEqual({
      ownership: { inventoryId: offer.id, businessId: "business-a" },
      catalog: null,
      admission: null,
    });
    await repository.disableForBusiness({
      businessId: "business-a",
      inventoryId: offer.id,
      actorSubject: "p201_fixture",
      recordedAt: "2026-11-03T00:01:00Z",
    });
    await expect(
      repository.findOwnershipByInventoryId(offer.id),
    ).resolves.toEqual({ inventoryId: offer.id, businessId: "business-a" });
  });

  it("distinguishes an existing inventory without ownership from a missing inventory", async () => {
    const { offer } = await create();
    await pool.execute(
      "DELETE FROM ticketing_inventory_ownership WHERE inventory_id = ?",
      [offer.id],
    );
    await expect(
      reservations.findInventoryById(offer.id),
    ).resolves.not.toBeNull();
    const facts = await readFacts(offer.id);
    expect(facts.ownership).toBeNull();
    expect(facts.catalog).toMatchObject({ inventoryId: offer.id });
    expect(facts.admission).toMatchObject({ inventoryId: offer.id });
    const absent = "tin_p201_absent_0001";
    expect(await reservations.findInventoryById(absent)).toBeNull();
    expect(await readFacts(absent)).toEqual({
      ownership: null,
      catalog: null,
      admission: null,
    });
  });

  it("exposes a contradictory catalog owner as a fact for the resolver to deny", async () => {
    const { offer } = await create();
    await pool.execute(
      "UPDATE ticketing_inventory_catalog_bindings SET business_id = ? WHERE inventory_id = ?",
      ["business-b", offer.id],
    );
    await expect(
      repository.findOwnershipByInventoryId(offer.id),
    ).resolves.toMatchObject({ businessId: "business-a" });
    await expect(
      repository.findCatalogBindingByInventoryId(offer.id),
    ).resolves.toMatchObject({
      businessId: "business-b",
      inventoryId: offer.id,
    });
  });

  it.each(["invalid place", " place_business-a "])(
    "rejects malformed persisted admission identity %s",
    async (placeId) => {
      const { offer } = await create();
      await pool.execute(
        "UPDATE ticketing_admission_profiles SET place_id = ? WHERE inventory_id = ?",
        [placeId, offer.id],
      );
      await expect(
        repository.findAdmissionProfileByInventoryId(offer.id),
      ).rejects.toThrow("TICKETING_ADMISSION_PROFILE_PERSISTED_INVALID");
      await pool.execute(
        "DELETE FROM ticketing_admission_profiles WHERE inventory_id = ?",
        [offer.id],
      );
      await expect(
        repository.findAdmissionProfileByInventoryId(offer.id),
      ).resolves.toBeNull();
    },
  );

  it("rejects altered IDs without normalizing them into an existing inventory", async () => {
    const { offer } = await create();
    const before = await snapshot();
    for (const id of [
      " " + offer.id,
      offer.id + " ",
      "tin_p201_probe_0001' OR 1=1 --",
    ]) {
      for (const method of [
        "findOwnershipByInventoryId",
        "findCatalogBindingByInventoryId",
        "findAdmissionProfileByInventoryId",
      ] as const) {
        await expect(repository[method](id)).rejects.toThrow(
          "TICKETING_INVENTORY_ID_INVALID",
        );
      }
    }
    expect(await snapshot()).toEqual(before);
  });
});
