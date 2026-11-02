import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMoney, normalizePaymentId } from "@touristic/financial";
import { normalizeOrderId } from "@touristic/ordering";
import {
  applyTicketCheckIn,
  createTicket,
  createTicketCheckIn,
  createTicketOfflineEnvelope,
  createTicketOfflineEnvelopeSignature,
  createTicketQrPayload,
  normalizeTicketSigningSecret,
} from "@touristic/ticketing";

import {
  MySqlTicketCheckInRepository,
  MySqlTicketOfflineEnvelopeRepository,
  MySqlTicketRepository,
  MySqlTicketingTransactionalCommand,
  applyTicketingM147Schema,
  createTicketingMySqlPoolFromEnvironment,
  createTicketingApplicationService,
  TicketingOperatorAuthorizationError,
  type TicketingOperatorAuthority,
} from "./index.js";

const databaseUrl = process.env.TICKETING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const transactionDatabaseUrl = databaseUrl
  ? (() => {
      const url = new URL(databaseUrl);
      url.pathname = "/ticketing_m148_test";
      return url.toString();
    })()
  : undefined;
const describeMySql =
  transactionDatabaseUrl && adminUrl ? describe : describe.skip;

interface OfflineEnvelopeSyncRow extends RowDataPacket {
  synced_at: Date;
  checkin_id: string;
}

function fixture() {
  const orderId = normalizeOrderId("ord_ticketing_m148_0001");
  const paymentId = normalizePaymentId("pay_ticketing_m148_0001");
  const amount = createMoney(12_500, "BRL");
  const secret = normalizeTicketSigningSecret(
    "ticketing-m148-secret-0001-secure",
  );
  if (!orderId || !paymentId || !amount || !secret)
    throw new Error("FIXTURE_INVALID");
  const ticket = createTicket({
    id: "tck_ticketing_m148_0001",
    orderId,
    paymentId,
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "volta-a-ilha" },
    holderName: "Luiz Silva",
    quantity: 1,
    amount,
    code: "M148-TXNA-0001-TCKT",
    status: "issued",
    issuedAt: "2026-08-15T11:00:00Z",
    validUntil: "2026-08-16T02:00:00Z",
    updatedAt: "2026-08-15T11:00:00Z",
  });
  if (!ticket) throw new Error("FIXTURE_INVALID");
  return { ticket, secret };
}

describeMySql.sequential("M148 Ticketing transactional MySQL contract", () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!adminUrl || !transactionDatabaseUrl)
      throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
    const admin = await mysql.createConnection(adminUrl);
    try {
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS ticketing_m148_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    } finally {
      await admin.end();
    }
    pool = createTicketingMySqlPoolFromEnvironment({
      TICKETING_DATABASE_URL: transactionDatabaseUrl,
    });
    await applyTicketingM147Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DROP TRIGGER IF EXISTS ticketing_m148_fail_checkin");
    await pool.query("DELETE FROM ticketing_offline_envelopes");
    await pool.query("DELETE FROM ticketing_checkins");
    await pool.query("DELETE FROM ticketing_tickets");
    await new MySqlTicketRepository(pool).save(fixture().ticket);
  });

  afterAll(async () => {
    await pool?.query("DROP TRIGGER IF EXISTS ticketing_m148_fail_checkin");
    await pool?.end();
  });

  it.each(["qr", "code"] as const)(
    "enforces current operator authority before SQL %s mutation and replay",
    async (method) => {
      const { ticket, secret } = fixture();
      const unexpectedLookup = () =>
        Promise.reject(new Error("UNEXPECTED_NON_CHECKIN_LOOKUP"));
      // This contract exercises service + SQL transactions; the composed app contract
      // separately exercises the full canonical owner chain against SQL.
      const service = createTicketingApplicationService({
        orders: {
          findById: unexpectedLookup,
          findByRequestKey: unexpectedLookup,
          save: unexpectedLookup,
        },
        payments: { findById: unexpectedLookup, save: unexpectedLookup },
        tickets: new MySqlTicketRepository(pool),
        checkIns: new MySqlTicketCheckInRepository(pool),
        offline: new MySqlTicketOfflineEnvelopeRepository(pool),
        transactions: new MySqlTicketingTransactionalCommand(pool),
        operatorAuthorization: {
          async authorize(current, authority) {
            if (
              current.orderId !== ticket.orderId ||
              current.destinationId !== ticket.destinationId ||
              authority.scope.kind !== "business" ||
              !authority.scope.businessIds.includes("business-a")
            ) {
              throw new TicketingOperatorAuthorizationError(
                "TICKETING_OPERATOR_NOT_FOUND",
              );
            }
          },
        },
        signingSecret: secret,
        clock: { now: () => "2026-08-15T11:30:01Z" },
      });
      const authority: TicketingOperatorAuthority = {
        subject: "operator_m148",
        capabilities: ["ticketing.manage"],
        scope: { kind: "business", businessIds: ["business-a"] },
      };
      const invoke = (
        operatorAuthority: TicketingOperatorAuthority,
        occurredAt = "2026-08-15T11:30:00Z",
      ) => {
        const input = { operatorAuthority, occurredAt };
        return method === "qr"
          ? service.checkInByQr({
              ...input,
              qrPayload: createTicketQrPayload(ticket.id, secret),
            })
          : service.checkInByCode({
              ...input,
              code: ticket.code,
              result: "validated",
            });
      };
      const outside: TicketingOperatorAuthority = {
        ...authority,
        scope: { kind: "business", businessIds: ["business-b"] },
      };
      async function assertStored(status: string, historyCount: number) {
        const [tickets] = await pool.execute<RowDataPacket[]>(
          "SELECT status FROM ticketing_tickets WHERE ticket_id = ?",
          [ticket.id],
        );
        const [history] = await pool.execute<RowDataPacket[]>(
          "SELECT COUNT(*) AS total FROM ticketing_checkins WHERE ticket_id = ?",
          [ticket.id],
        );
        expect(tickets[0]?.status).toBe(status);
        expect(Number(history[0]?.total)).toBe(historyCount);
      }
      await expect(invoke({ ...authority, capabilities: [] })).rejects.toThrow(
        "TICKETING_OPERATOR_FORBIDDEN",
      );
      await assertStored("issued", 0);
      await expect(invoke(outside)).rejects.toThrow(
        "TICKETING_OPERATOR_NOT_FOUND",
      );
      await assertStored("issued", 0);
      const first = await invoke(authority);
      expect(first.checkIn.operatorReference).toBe(authority.subject);
      await assertStored("validated", 1);
      await expect(invoke(outside)).rejects.toThrow(
        "TICKETING_OPERATOR_NOT_FOUND",
      );
      await assertStored("validated", 1);
      await expect(invoke(authority)).resolves.toMatchObject({
        replayed: true,
        checkIn: first.checkIn,
      });
      await assertStored("validated", 1);
      await service.checkInByCode({
        code: ticket.code,
        result: "cancelled",
        operatorAuthority: authority,
        occurredAt: "2026-08-15T11:31:00Z",
      });
      await assertStored("cancelled", 2);
      const readPersisted = async () => {
        const [current] = await pool.execute<RowDataPacket[]>(
          "SELECT * FROM ticketing_tickets WHERE ticket_id = ?",
          [ticket.id],
        );
        const [history] = await pool.execute<RowDataPacket[]>(
          "SELECT * FROM ticketing_checkins WHERE ticket_id = ? ORDER BY checkin_id",
          [ticket.id],
        );
        return { current, history };
      };
      const cancelledSnapshot = await readPersisted();
      await expect(invoke({ ...authority, capabilities: [] })).rejects.toThrow(
        "TICKETING_OPERATOR_FORBIDDEN",
      );
      await expect(invoke(outside)).rejects.toThrow(
        "TICKETING_OPERATOR_NOT_FOUND",
      );
      await expect(invoke(authority, "2026-08-15T11:32:00Z")).rejects.toThrow(
        "TICKETING_TICKET_REVOKED",
      );
      await expect(invoke(authority)).resolves.toMatchObject({
        replayed: true,
        ticket: { status: "cancelled" },
        checkIn: first.checkIn,
      });
      expect(await readPersisted()).toEqual(cancelledSnapshot);
    },
  );

  function onlineCommand() {
    const { ticket } = fixture();
    const after = applyTicketCheckIn(ticket, {
      result: "validated",
      occurredAt: "2026-08-15T11:30:00Z",
    });
    const checkIn = createTicketCheckIn({
      id: "tci_ticketing_m148_0001",
      ticketId: ticket.id,
      result: "validated",
      channel: "online",
      operatorReference: "operator_m148",
      occurredAt: "2026-08-15T11:30:00Z",
      recordedAt: "2026-08-15T11:30:01Z",
    });
    if (!checkIn) throw new Error("FIXTURE_INVALID");
    return { before: ticket, after, checkIn };
  }

  function competingCommand() {
    const { ticket } = fixture();
    const after = applyTicketCheckIn(ticket, {
      result: "cancelled",
      occurredAt: "2026-08-15T11:31:00Z",
    });
    const checkIn = createTicketCheckIn({
      id: "tci_ticketing_m148_competing_0001",
      ticketId: ticket.id,
      result: "cancelled",
      channel: "online",
      operatorReference: "operator_m148_competing",
      occurredAt: "2026-08-15T11:31:00Z",
      recordedAt: "2026-08-15T11:31:01Z",
    });
    if (!checkIn) throw new Error("FIXTURE_INVALID");
    return { before: ticket, after, checkIn };
  }

  function offlineCommand() {
    const { ticket, secret } = fixture();
    const qrPayload = createTicketQrPayload(ticket.id, secret);
    if (!qrPayload) throw new Error("FIXTURE_INVALID");
    const queuedAt = "2026-08-15T11:45:00Z";
    const signature = createTicketOfflineEnvelopeSignature(
      {
        ticketId: ticket.id,
        operation: "validate",
        payload: qrPayload,
        queuedAt,
      },
      secret,
    );
    const envelope = createTicketOfflineEnvelope({
      id: "toe_ticketing_m148_0001",
      ticketId: ticket.id,
      operation: "validate",
      payload: qrPayload,
      signature,
      queuedAt,
    });
    const checkIn = createTicketCheckIn({
      id: "tci_ticketing_m148_offline_0001",
      ticketId: ticket.id,
      result: "validated",
      channel: "offline_sync",
      operatorReference: "device_m148",
      occurredAt: queuedAt,
      recordedAt: "2026-08-15T11:46:00Z",
    });
    if (!envelope || !checkIn) throw new Error("FIXTURE_INVALID");
    const after = applyTicketCheckIn(ticket, {
      result: "validated",
      occurredAt: queuedAt,
    });
    return {
      before: ticket,
      after,
      checkIn,
      envelope,
      syncedAt: "2026-08-15T11:46:00Z",
    };
  }

  it("commits ticket transition and history atomically with exact replay", async () => {
    const tx = new MySqlTicketingTransactionalCommand(pool);
    const command = onlineCommand();
    const first = await tx.commitCheckIn(command);
    expect(first.replayed).toBe(false);
    expect(first.ticket.status).toBe("validated");

    const current = await new MySqlTicketRepository(pool).findById(
      command.before.id,
    );
    expect(current?.status).toBe("validated");
    await expect(
      new MySqlTicketCheckInRepository(pool).listByTicketId(command.before.id),
    ).resolves.toHaveLength(1);

    const replay = await tx.commitCheckIn(command);
    expect(replay.replayed).toBe(true);
    expect(replay.checkIn.id).toBe(command.checkIn.id);
    await expect(
      new MySqlTicketCheckInRepository(pool).listByTicketId(command.before.id),
    ).resolves.toHaveLength(1);
  });

  it("rejects cross-ticket command identity before mutating persistence", async () => {
    const tx = new MySqlTicketingTransactionalCommand(pool);
    const command = onlineCommand();
    const mismatched = createTicket({
      ...command.after,
      id: "tck_ticketing_m148_other_0001",
    });
    if (!mismatched) throw new Error("FIXTURE_INVALID");

    expect(() => tx.commitCheckIn({ ...command, after: mismatched })).toThrow(
      "TICKETING_TRANSACTION_IDENTITY_MISMATCH",
    );
    await expect(
      new MySqlTicketRepository(pool).findById(command.before.id),
    ).resolves.toMatchObject({ status: "issued" });
    await expect(
      new MySqlTicketCheckInRepository(pool).listByTicketId(command.before.id),
    ).resolves.toEqual([]);
  });

  it("allows exactly one of two stale concurrent transitions to commit", async () => {
    const tx = new MySqlTicketingTransactionalCommand(pool);
    const outcomes = await Promise.allSettled([
      tx.commitCheckIn(onlineCommand()),
      tx.commitCheckIn(competingCommand()),
    ]);
    expect(
      outcomes.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((entry) => entry.status === "rejected"),
    ).toHaveLength(1);
    const rejected = outcomes.find((entry) => entry.status === "rejected");
    if (!rejected || rejected.status !== "rejected") {
      throw new Error("EXPECTED_CONCURRENT_REJECTION");
    }
    expect(String(rejected.reason)).toContain(
      "TICKETING_CONCURRENT_TRANSITION",
    );

    const persisted = await new MySqlTicketRepository(pool).findById(
      fixture().ticket.id,
    );
    expect(["validated", "cancelled"]).toContain(persisted?.status);
    await expect(
      new MySqlTicketCheckInRepository(pool).listByTicketId(
        fixture().ticket.id,
      ),
    ).resolves.toHaveLength(1);
  });

  it("rolls back the ticket state when history persistence fails", async () => {
    await pool.query(`CREATE TRIGGER ticketing_m148_fail_checkin
      BEFORE INSERT ON ticketing_checkins FOR EACH ROW
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'm148 forced checkin failure'`);
    const tx = new MySqlTicketingTransactionalCommand(pool);
    await expect(tx.commitCheckIn(onlineCommand())).rejects.toThrow();
    const persisted = await new MySqlTicketRepository(pool).findById(
      fixture().ticket.id,
    );
    expect(persisted?.status).toBe("issued");
    await expect(
      new MySqlTicketCheckInRepository(pool).listByTicketId(
        fixture().ticket.id,
      ),
    ).resolves.toEqual([]);
  });

  it("commits offline envelope, state, history and sync marker in one transaction", async () => {
    const command = offlineCommand();
    const tx = new MySqlTicketingTransactionalCommand(pool);
    const first = await tx.commitOfflineSync(command);
    expect(first.replayed).toBe(false);
    expect(first.ticket.status).toBe("validated");
    await expect(
      new MySqlTicketOfflineEnvelopeRepository(pool).findById(
        command.envelope.id,
      ),
    ).resolves.toEqual(command.envelope);
    const [rows] = await pool.query<OfflineEnvelopeSyncRow[]>(
      "SELECT synced_at, checkin_id FROM ticketing_offline_envelopes WHERE envelope_id = ?",
      [command.envelope.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.checkin_id).toBe(command.checkIn.id);
    expect(rows[0]?.synced_at).toBeInstanceOf(Date);

    const replay = await tx.commitOfflineSync(command);
    expect(replay.replayed).toBe(true);
  });

  it("rolls back envelope and ticket state when offline history persistence fails", async () => {
    await pool.query(`CREATE TRIGGER ticketing_m148_fail_checkin
      BEFORE INSERT ON ticketing_checkins FOR EACH ROW
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'm148 forced offline failure'`);
    const command = offlineCommand();
    const tx = new MySqlTicketingTransactionalCommand(pool);
    await expect(tx.commitOfflineSync(command)).rejects.toThrow();
    await expect(
      new MySqlTicketRepository(pool).findById(command.before.id),
    ).resolves.toMatchObject({ status: "issued" });
    await expect(
      new MySqlTicketCheckInRepository(pool).listByTicketId(command.before.id),
    ).resolves.toEqual([]);
    await expect(
      new MySqlTicketOfflineEnvelopeRepository(pool).findById(
        command.envelope.id,
      ),
    ).resolves.toBeNull();
  });
});
