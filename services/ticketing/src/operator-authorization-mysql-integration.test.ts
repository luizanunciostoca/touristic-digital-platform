import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTicketingOrderBinding } from "@touristic/ordering/ticketing-reservation";
import {
  createTicket,
  createTicketCode,
  createTicketQrPayload,
  normalizeTicketSigningSecret,
} from "@touristic/ticketing";
import { createTicketReservationRequestKey } from "@touristic/ticketing/reservations";

import { MySqlTicketingBusinessInventoryRepository } from "./business-inventory-repository.js";
import { MySqlTicketReservationRepository } from "./mysql-ticket-reservation-repository.js";
import type { TicketingTransactionalCommandPort } from "./mysql-ticketing-transaction.js";
import {
  createTicketingOperatorAuthorization,
  type TicketingOperatorAuthority,
} from "./operator-authorization.js";
import {
  applyTicketingPublicApiSchema,
  createTicketingApplicationService,
  createTicketingMySqlPoolFromEnvironment,
  MySqlTicketRepository,
  MySqlTicketCheckInRepository,
  MySqlTicketingTransactionalCommand,
} from "./index.js";

const databaseUrl = process.env.TICKETING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;
const tables = [
  ["ticketing_checkins", "checkin_id"],
  ["ticketing_tickets", "ticket_id"],
  ["ticketing_reservation_events", "event_id"],
  ["ticketing_reservations", "reservation_id"],
  ["ticketing_admission_profiles", "inventory_id"],
  ["ticketing_inventory_catalog_bindings", "inventory_id"],
  ["ticketing_inventory_ownership", "inventory_id"],
  ["ticketing_inventory", "inventory_id"],
] as const;

function required<T>(value: T | null): T {
  if (value === null) throw new Error("P202_FIXTURE_INVALID");
  return value;
}

describeMySql.sequential("Ticketing ownership and online SQL", () => {
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
    for (const [table] of tables) await pool.query(`DELETE FROM ${table}`);
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
      tables.map(async ([table, key]) => {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT * FROM ${table} ORDER BY ${key}`,
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

  // Ticketing stores/transactions are real SQL; Ordering, Business and Destination
  // are controlled owner ports. This fixture makes no financial-provider claim.
  async function onlineFixture(
    transactions: TicketingTransactionalCommandPort = new MySqlTicketingTransactionalCommand(
      pool,
    ),
  ) {
    const { offer } = await create("business-a", false, false);
    const inventory = required(await reservations.findInventoryById(offer.id));
    await reservations.hold({
      reservationId: "trv_p202_0001",
      requestKey: required(
        createTicketReservationRequestKey(offer.id, "p202_attempt_0001"),
      ),
      inventoryId: offer.id,
      holderReference: "p202_holder",
      quantity: 1,
      heldAt: "2026-11-03T01:10:00Z",
      expiresAt: "2026-11-03T01:20:00Z",
      actorReference: "p202_fixture",
    });
    const { reservation } = await reservations.confirmAuthoritative({
      reservationId: "trv_p202_0001",
      orderId: "ord_p202_0001",
      paymentId: "pay_p202_0001",
      confirmedAt: "2026-11-03T01:11:00Z",
      actorReference: "p202_fixture",
    });
    const ticket = required(
      createTicket({
        id: "tck_p202_00000001",
        orderId: reservation.orderId,
        paymentId: reservation.paymentId,
        destinationId: reservation.destinationId,
        product: reservation.product,
        holderName: "P202 fixture",
        quantity: reservation.quantity,
        amount: {
          minorUnits: reservation.unitAmount.minorUnits * reservation.quantity,
          currency: reservation.unitAmount.currency,
        },
        code: createTicketCode("B".repeat(64)),
        status: "issued",
        issuedAt: reservation.confirmedAt,
        validUntil: inventory.endsAt,
        updatedAt: reservation.confirmedAt,
      }),
    );
    const tickets = new MySqlTicketRepository(pool);
    await tickets.save(ticket);
    const binding = required(
      createTicketingOrderBinding({
        reservationReference: reservation.id,
        orderId: ticket.orderId,
        productReference: ticket.product.kind + ":" + ticket.product.reference,
        quantity: ticket.quantity,
        amount: ticket.amount,
        pricingVersion: reservation.pricingVersion,
        boundAt: "2026-11-03T01:10:00Z",
      }),
    );
    const destination = {
      id: ticket.destinationId,
      status: "active" as "active" | "suspended",
    };
    const operatorAuthorization = createTicketingOperatorAuthorization({
      bindings: {
        findByOrderId: async (id) => (id === binding.orderId ? binding : null),
      },
      reservations,
      businessInventory: repository,
      owner: {
        findBusiness: async (businessId, destinationId) =>
          businessId === "business-a" &&
          destinationId === inventory.destinationId
            ? { businessId, destinationId }
            : null,
        findPlace: async () => null,
        findOffer: async () => null,
        findProduct: async () => null,
      },
      destinations: {
        findDestination: async (id) =>
          id === destination.id ? destination : null,
      },
    });
    const signingSecret = required(
      normalizeTicketSigningSecret("p202_fixture_signing_secret_0123456789"),
    );
    const unused = async (): Promise<never> => {
      throw new Error("P202_UNEXPECTED_PORT");
    };
    const service = createTicketingApplicationService({
      orders: { findById: unused, findByRequestKey: unused, save: unused },
      payments: { findById: unused, save: unused },
      tickets,
      checkIns: new MySqlTicketCheckInRepository(pool),
      offline: { findById: unused },
      transactions,
      operatorAuthorization,
      signingSecret,
      clock: { now: () => "2026-11-03T02:05:00.000Z" },
    });
    const authority: TicketingOperatorAuthority = {
      subject: "p202_operator_a",
      capabilities: ["ticketing.manage"],
      scope: { kind: "business", businessIds: ["business-a"] },
    };
    const request = {
      qrPayload: required(createTicketQrPayload(ticket.id, signingSecret)),
      operatorReference: authority.subject,
      operatorAuthority: authority,
      occurredAt: "2026-11-03T02:00:00.000Z",
    };
    return { service, ticket, inventory, authority, destination, request };
  }

  it.each(["qr", "code"] as const)(
    "enforces fresh scope, suspension and exact %s replay without SQL side effects",
    async (channel) => {
      const f = await onlineFixture();
      const run = (
        occurredAt = f.request.occurredAt,
        operatorAuthority = f.authority,
        result = "validated",
      ) => {
        const actor = {
          operatorReference: operatorAuthority.subject,
          operatorAuthority,
          occurredAt,
        };
        return channel === "qr"
          ? f.service.checkInByQr({
              qrPayload: f.request.qrPayload,
              ...actor,
            })
          : f.service.checkInByCode({
              code: f.ticket.code,
              result,
              ...actor,
            });
      };
      const foreign: TicketingOperatorAuthority = {
        ...f.authority,
        scope: { kind: "business", businessIds: ["business-b"] },
      };
      let before = await snapshot();
      await expect(run(undefined, foreign)).rejects.toMatchObject({
        code: "TICKETING_OPERATOR_FORBIDDEN",
      });
      expect(await snapshot()).toEqual(before);
      const first = await run();
      expect(first).toMatchObject({
        ticket: { status: "validated" },
        replayed: false,
      });
      f.destination.status = "suspended";
      before = await snapshot();
      await expect(
        run("2026-11-03T02:01:00.000Z", f.authority, "used"),
      ).rejects.toMatchObject({ code: "TICKETING_DESTINATION_SUSPENDED" });
      await expect(run()).resolves.toMatchObject({
        checkIn: first.checkIn,
        replayed: true,
      });
      expect(await snapshot()).toEqual(before);
      await expect(
        f.service.checkInByCode({
          code: f.ticket.code,
          result: "cancelled",
          operatorReference: f.authority.subject,
          operatorAuthority: f.authority,
          occurredAt: "2026-11-03T02:02:00.000Z",
        }),
      ).resolves.toMatchObject({
        ticket: { status: "cancelled" },
        replayed: false,
      });
      before = await snapshot();
      await expect(run()).resolves.toMatchObject({
        ticket: { status: "cancelled" },
        checkIn: first.checkIn,
        replayed: true,
      });
      await expect(run(undefined, foreign)).rejects.toMatchObject({
        code: "TICKETING_OPERATOR_FORBIDDEN",
      });
      await expect(
        run(undefined, { ...f.authority, subject: "p202_operator_b" }),
      ).rejects.toMatchObject({ code: "TICKETING_CHECKIN_REPLAY_CONFLICT" });
      expect(await snapshot()).toEqual(before);
      expect(await reservations.listEvents("trv_p202_0001")).toEqual([
        expect.objectContaining({ eventType: "held" }),
        expect.objectContaining({ eventType: "confirmed" }),
      ]);
    },
  );

  it.each(["missing ownership", "contradictory inventory"] as const)(
    "denies historical replay after %s without repairing SQL facts",
    async (corruption) => {
      const f = await onlineFixture();
      await f.service.checkInByQr(f.request);
      if (corruption === "missing ownership")
        await pool.execute(
          "DELETE FROM ticketing_inventory_ownership WHERE inventory_id = ?",
          [f.inventory.id],
        );
      else
        await pool.execute(
          "UPDATE ticketing_inventory SET destination_id = ? WHERE inventory_id = ?",
          ["itacare", f.inventory.id],
        );
      const before = await snapshot();
      await expect(f.service.checkInByQr(f.request)).rejects.toMatchObject({
        code:
          corruption === "missing ownership"
            ? "TICKETING_OPERATOR_NOT_FOUND"
            : "TICKETING_OPERATOR_FORBIDDEN",
        reason:
          corruption === "missing ownership"
            ? "INVENTORY_OWNERSHIP_MISSING"
            : "CONTRADICTORY_FACTS",
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(["same", "different"] as const)(
    "serializes a real SQL QR replay race with %s currently authorized operators",
    async (actors) => {
      const actual = new MySqlTicketingTransactionalCommand(pool);
      type Command = Parameters<
        TicketingTransactionalCommandPort["commitCheckIn"]
      >[0];
      const entered: Command[] = [];
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const f = await onlineFixture({
        async commitCheckIn(command) {
          entered.push(command);
          if (entered.length === 2) release();
          await barrier;
          return actual.commitCheckIn(command);
        },
        commitOfflineSync: (command) => actual.commitOfflineSync(command),
      });
      const before = await snapshot();
      const inputs = [
        "p202_operator_a",
        actors === "same" ? "p202_operator_a" : "p202_operator_b",
      ].map((subject) => ({
        ...f.request,
        operatorReference: subject,
        operatorAuthority: { ...f.authority, subject },
      }));
      const outcomes = await Promise.allSettled(
        inputs.map((input) => f.service.checkInByQr(input).finally(release)),
      );
      expect(entered).toHaveLength(2);
      expect(entered.map((command) => command.before.status)).toEqual([
        "issued",
        "issued",
      ]);
      expect(entered[0]!.checkIn.id).toBe(entered[1]!.checkIn.id);
      const fulfilled = outcomes.flatMap((outcome) =>
        outcome.status === "fulfilled" ? [outcome.value] : [],
      );
      const rejected = outcomes.flatMap((outcome) =>
        outcome.status === "rejected" ? [outcome.reason as unknown] : [],
      );
      expect(fulfilled).toHaveLength(actors === "same" ? 2 : 1);
      expect(rejected).toEqual(
        actors === "same"
          ? []
          : [
              expect.objectContaining({
                message: "TICKETING_CHECKIN_REPLAY_CONFLICT",
              }),
            ],
      );
      if (actors === "same")
        expect(fulfilled.map((result) => result.replayed).sort()).toEqual([
          false,
          true,
        ]);
      const after = await snapshot();
      expect(after[0]).toHaveLength(1);
      expect(after[1]).toEqual([
        expect.objectContaining({ status: "validated" }),
      ]);
      expect(after.slice(2)).toEqual(before.slice(2));
      const winner = fulfilled[0]!.checkIn.operatorReference;
      expect(after[0]).toEqual([
        expect.objectContaining({ operator_reference: winner }),
      ]);
      await expect(
        f.service.checkInByQr(
          inputs.find((input) => input.operatorReference === winner)!,
        ),
      ).resolves.toMatchObject({ replayed: true });
      if (actors === "different")
        await expect(
          f.service.checkInByQr(
            inputs.find((input) => input.operatorReference !== winner)!,
          ),
        ).rejects.toMatchObject({
          code: "TICKETING_CHECKIN_REPLAY_CONFLICT",
        });
      expect(await snapshot()).toEqual(after);
      expect(entered).toHaveLength(2);
    },
  );
});
