import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createLedgerTransaction,
  createMoney,
  createPaymentIdempotencyKey,
  normalizeLedgerTransactionId,
  normalizePaymentId,
  normalizeVerifiedProviderPaymentEvent,
  type Payment,
} from "@touristic/financial";

import {
  MySqlLedgerTransactionRepository,
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  MySqlProviderWebhookEventRepository,
  MySqlVerifiedPaymentResultRepository,
  applyFinancialM142Schema,
  createFinancialMySqlPoolFromEnvironment,
  createVerifiedPaymentOutcomeService,
} from "./index.js";

const databaseUrl = process.env.FINANCIAL_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function payment(): Payment {
  const id = normalizePaymentId("pay_mysql_12345678");
  const idempotencyKey = createPaymentIdempotencyKey("ord_mysql_12345678");
  const amount = createMoney(49_900, "BRL");
  if (!id || !idempotencyKey || !amount) throw new Error("FIXTURE_INVALID");
  return {
    id,
    idempotencyKey,
    subject: { kind: "order", reference: "ord_mysql_12345678" },
    amount,
    status: "pending",
    providerReference: null,
    createdAt: "2026-08-14T19:31:00Z",
    updatedAt: "2026-08-14T19:31:00Z",
    confirmedAt: null,
    refundedAt: null,
  };
}

function ledger(
  idValue = "led_mysql_12345678",
  externalKey = "payment_mysql_12345678",
  creditAccount = "revenue:platform",
) {
  const id = normalizeLedgerTransactionId(idValue);
  const amount = createMoney(49_900, "BRL");
  if (!id || !amount) throw new Error("FIXTURE_INVALID");
  return createLedgerTransaction({
    id,
    externalKey,
    occurredAt: "2026-08-14T19:35:00Z",
    postings: [
      { accountReference: "cash:provider", direction: "debit", amount },
      { accountReference: creditAccount, direction: "credit", amount },
    ],
  });
}

describeMySql.sequential("M137/M142 Financial MySQL integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!adminUrl || !databaseUrl)
      throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
    const admin = await mysql.createConnection(adminUrl);
    try {
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS financial_m137_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    } finally {
      await admin.end();
    }
    pool = createFinancialMySqlPoolFromEnvironment({
      FINANCIAL_DATABASE_URL: databaseUrl,
    });
    await applyFinancialM142Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DROP TRIGGER IF EXISTS financial_test_fail_posting");
    await pool.query("DELETE FROM financial_payment_results");
    await pool.query("DELETE FROM financial_provider_events");
    await pool.query("DELETE FROM financial_ledger_postings");
    await pool.query("DELETE FROM financial_ledger_transactions");
    await pool.query("DELETE FROM financial_payments");
    await pool.query("DELETE FROM financial_payment_idempotency");
  });

  afterAll(async () => {
    await pool?.query("DROP TRIGGER IF EXISTS financial_test_fail_posting");
    await pool?.end();
  });

  it("claims idempotency and persists a canonical Payment lifecycle", async () => {
    const value = payment();
    const claims = new MySqlPaymentIdempotencyPort(pool);
    const payments = new MySqlPaymentRepository(pool);

    await expect(claims.claim(value.idempotencyKey, value.id)).resolves.toEqual(
      {
        claimed: true,
        paymentId: value.id,
      },
    );
    await expect(claims.claim(value.idempotencyKey, value.id)).resolves.toEqual(
      {
        claimed: false,
        paymentId: value.id,
      },
    );

    const saved = await payments.save(value);
    expect(saved.createdAt).toBe("2026-08-14T19:31:00.000Z");
    const confirmed: Payment = {
      ...saved,
      status: "confirmed",
      providerReference: "provider_mysql_123",
      updatedAt: "2026-08-14T19:35:00Z",
      confirmedAt: "2026-08-14T19:35:00Z",
    };
    await expect(payments.save(confirmed)).resolves.toMatchObject({
      status: "confirmed",
      providerReference: "provider_mysql_123",
      confirmedAt: "2026-08-14T19:35:00.000Z",
    });
  });

  it("claims exact provider replay and rejects a divergent event ID", async () => {
    const payments = new MySqlPaymentRepository(pool);
    const saved = await payments.save(payment());
    const events = new MySqlProviderWebhookEventRepository(pool);
    const verified = normalizeVerifiedProviderPaymentEvent({
      providerEventId: "pwe_mysql_webhook_0001",
      externalReference: saved.id,
      providerPaymentReference: "sandbox_mysql_payment_0001",
      status: "paid",
      occurredAt: "2026-08-14T19:34:00Z",
    });
    if (!verified) throw new Error("EVENT_FIXTURE_INVALID");
    const receipt = {
      event: verified,
      payloadSha256: "a".repeat(64),
      receivedAt: "2026-08-14T19:34:01Z",
      matchedPaymentId: saved.id,
    };

    await expect(events.claim(receipt)).resolves.toMatchObject({
      claimed: true,
      receipt: {
        matchedPaymentId: saved.id,
        receivedAt: "2026-08-14T19:34:01.000Z",
      },
    });
    await expect(
      events.claim({
        ...receipt,
        receivedAt: "2026-08-14T19:35:00Z",
        matchedPaymentId: null,
      }),
    ).resolves.toMatchObject({
      claimed: false,
      receipt: {
        matchedPaymentId: saved.id,
        receivedAt: "2026-08-14T19:34:01.000Z",
      },
    });

    const divergent = normalizeVerifiedProviderPaymentEvent({
      ...verified,
      status: "failed",
    });
    if (!divergent) throw new Error("EVENT_FIXTURE_INVALID");
    await expect(
      events.claim({
        ...receipt,
        event: divergent,
        payloadSha256: "b".repeat(64),
      }),
    ).rejects.toThrow("FINANCIAL_PROVIDER_EVENT_COLLISION");

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT payment_status, LOWER(HEX(payload_sha256)) AS payload_hash FROM financial_provider_events WHERE provider_event_id = ?",
      [verified.providerEventId],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        payment_status: "paid",
        payload_hash: "a".repeat(64),
      }),
    ]);
  });

  it("applies a verified provider outcome and persists one authoritative result", async () => {
    const payments = new MySqlPaymentRepository(pool);
    const saved = await payments.save(payment());
    const events = new MySqlProviderWebhookEventRepository(pool);
    const results = new MySqlVerifiedPaymentResultRepository(pool);
    const outcomes = createVerifiedPaymentOutcomeService({
      payments,
      results,
      clock: { now: () => "2026-08-14T19:34:02Z" },
    });
    const verified = normalizeVerifiedProviderPaymentEvent({
      providerEventId: "pwe_mysql_outcome_0001",
      externalReference: saved.id,
      providerPaymentReference: "sandbox_mysql_outcome_0001",
      status: "paid",
      occurredAt: "2026-08-14T19:34:01Z",
    });
    if (!verified) throw new Error("EVENT_FIXTURE_INVALID");
    const claim = await events.claim({
      event: verified,
      payloadSha256: "c".repeat(64),
      receivedAt: "2026-08-14T19:34:02Z",
      matchedPaymentId: saved.id,
    });

    await expect(outcomes.apply(claim.receipt.event)).resolves.toMatchObject({
      disposition: "applied",
      payment: { status: "confirmed" },
      result: {
        kind: "approved",
        paymentStatus: "confirmed",
        providerEventId: verified.providerEventId,
      },
    });
    await expect(outcomes.apply(claim.receipt.event)).resolves.toMatchObject({
      disposition: "replayed",
    });
    await expect(payments.findById(saved.id)).resolves.toMatchObject({
      status: "confirmed",
      providerReference: "sandbox_mysql_outcome_0001",
    });
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM financial_payment_results WHERE payment_id = ?",
      [saved.id],
    );
    expect(Number(rows[0]?.total)).toBe(1);
  });

  it("replays an exact Ledger append and rejects divergent content", async () => {
    const repository = new MySqlLedgerTransactionRepository(pool);
    const value = ledger();

    await expect(repository.append(value)).resolves.toBeUndefined();
    await expect(repository.append(value)).resolves.toBeUndefined();

    const divergent = ledger(
      "led_mysql_87654321",
      value.externalKey,
      "revenue:other",
    );
    await expect(repository.append(divergent)).rejects.toThrow(
      "FINANCIAL_LEDGER_IDEMPOTENCY_CONFLICT",
    );
  });

  it("rolls back the transaction header when a later posting fails", async () => {
    await pool.query(
      `CREATE TRIGGER financial_test_fail_posting
       BEFORE INSERT ON financial_ledger_postings
       FOR EACH ROW
       SET NEW.amount_minor = IF(
         NEW.account_reference = 'revenue:fail',
         NULL,
         NEW.amount_minor
       )`,
    );
    const repository = new MySqlLedgerTransactionRepository(pool);
    const value = ledger(
      "led_mysql_rollback1",
      "payment_mysql_rollback1",
      "revenue:fail",
    );

    await expect(repository.append(value)).rejects.toThrow();
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT transaction_id FROM financial_ledger_transactions WHERE external_key = ?",
      [value.externalKey],
    );
    expect(rows).toHaveLength(0);
  });
});
