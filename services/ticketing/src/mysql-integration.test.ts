import mysql, { type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMoney, normalizePaymentId } from "@touristic/financial";
import { normalizeOrderId } from "@touristic/ordering";
import {
  createTicket,
  createTicketCheckIn,
  createTicketOfflineEnvelope,
  createTicketOfflineEnvelopeSignature,
  normalizeTicketSigningSecret,
} from "@touristic/ticketing";

import {
  MySqlTicketCheckInRepository,
  MySqlTicketOfflineEnvelopeRepository,
  MySqlTicketRepository,
  applyTicketingM147Schema,
  createTicketingMySqlPoolFromEnvironment,
} from "./index.js";

const databaseUrl = process.env.TICKETING_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function ticketFixture() {
  const orderId = normalizeOrderId("ord_ticketing_mysql_0001");
  const paymentId = normalizePaymentId("pay_ticketing_mysql_0001");
  const amount = createMoney(9_900, "BRL");
  if (!orderId || !paymentId || !amount) throw new Error("FIXTURE_INVALID");
  const ticket = createTicket({
    id: "tck_ticketing_mysql_0001",
    orderId,
    paymentId,
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "volta-a-ilha" },
    holderName: "Luiz Silva",
    quantity: 2,
    amount,
    code: "MYSQ-TEST-0001-TCKT",
    status: "issued",
    issuedAt: "2026-08-15T10:00:00Z",
    updatedAt: "2026-08-15T10:00:00Z",
  });
  if (!ticket) throw new Error("FIXTURE_INVALID");
  return ticket;
}

describeMySql.sequential("M147 Ticketing MySQL integration", () => {
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
    await applyTicketingM147Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM ticketing_offline_envelopes");
    await pool.query("DELETE FROM ticketing_checkins");
    await pool.query("DELETE FROM ticketing_tickets");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists a ticket lifecycle and its check-in history", async () => {
    const tickets = new MySqlTicketRepository(pool);
    const checkIns = new MySqlTicketCheckInRepository(pool);
    const ticket = ticketFixture();

    await expect(tickets.save(ticket)).resolves.toMatchObject({
      id: ticket.id,
      status: "issued",
      code: "MYSQ-TEST-0001-TCKT",
    });

    const validated = createTicket({
      ...ticket,
      status: "validated",
      validatedAt: "2026-08-15T10:30:00Z",
      updatedAt: "2026-08-15T10:30:00Z",
    });
    if (!validated) throw new Error("FIXTURE_INVALID");
    await expect(tickets.save(validated)).resolves.toMatchObject({
      status: "validated",
      validatedAt: "2026-08-15T10:30:00.000Z",
    });

    const checkIn = createTicketCheckIn({
      id: "tci_ticketing_mysql_0001",
      ticketId: ticket.id,
      result: "validated",
      channel: "online",
      operatorReference: "operator_mysql_001",
      occurredAt: "2026-08-15T10:30:00Z",
      recordedAt: "2026-08-15T10:30:01Z",
    });
    if (!checkIn) throw new Error("FIXTURE_INVALID");
    await checkIns.append(checkIn);
    await expect(checkIns.listByTicketId(ticket.id)).resolves.toEqual([
      expect.objectContaining({
        id: checkIn.id,
        result: "validated",
        channel: "online",
      }),
    ]);
  });

  it("queues and marks an offline envelope as synced", async () => {
    const tickets = new MySqlTicketRepository(pool);
    const checkIns = new MySqlTicketCheckInRepository(pool);
    const offline = new MySqlTicketOfflineEnvelopeRepository(pool);
    const ticket = ticketFixture();
    await tickets.save(ticket);

    const secret = normalizeTicketSigningSecret(
      "ticketing-mysql-signing-secret-0001",
    );
    if (!secret) throw new Error("FIXTURE_INVALID");
    const signature = createTicketOfflineEnvelopeSignature(
      {
        ticketId: ticket.id,
        operation: "validate",
        payload: "tck.v1." + ticket.id + "." + "a".repeat(64),
        queuedAt: "2026-08-15T10:45:00Z",
      },
      secret,
    );
    const envelope = createTicketOfflineEnvelope({
      id: "toe_ticketing_mysql_0001",
      ticketId: ticket.id,
      operation: "validate",
      payload: "tck.v1." + ticket.id + "." + "a".repeat(64),
      signature,
      queuedAt: "2026-08-15T10:45:00Z",
    });
    if (!envelope) throw new Error("FIXTURE_INVALID");

    await offline.enqueue(envelope);
    await expect(offline.findById(envelope.id)).resolves.toEqual(envelope);

    const checkIn = createTicketCheckIn({
      id: "tci_ticketing_mysql_0002",
      ticketId: ticket.id,
      result: "validated",
      channel: "offline_sync",
      operatorReference: "operator_mysql_002",
      occurredAt: "2026-08-15T10:45:00Z",
      recordedAt: "2026-08-15T10:46:00Z",
    });
    if (!checkIn) throw new Error("FIXTURE_INVALID");
    await checkIns.append(checkIn);
    await offline.markSynced(envelope.id, checkIn.id, "2026-08-15T10:46:00Z");

    const [rows] = await pool.query(
      "SELECT synced_at, checkin_id FROM ticketing_offline_envelopes WHERE envelope_id = ?",
      [envelope.id],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        checkin_id: checkIn.id,
      }),
    ]);
  });
});