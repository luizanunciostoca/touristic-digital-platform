import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createLedgerTransaction,
  createMoney,
  createPaymentIdempotencyKey,
  normalizeLedgerTransactionId,
  normalizePaymentId,
  normalizeReconciliationRunId,
  normalizeVerifiedProviderPaymentEvent,
  type Payment,
  type RefundProviderCommand,
} from "@touristic/financial";

import {
  MySqlFinancialReconciliationRepository,
  MySqlLedgerTransactionRepository,
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  MySqlProviderWebhookEventRepository,
  MySqlRefundRequestRepository,
  MySqlVerifiedPaymentResultRepository,
  applyFinancialM145Schema,
  createFinancialMySqlPoolFromEnvironment,
  createReconciliationApplicationService,
  createRefundApplicationService,
  createVerifiedPaymentAccountingService,
  createVerifiedPaymentOutcomeService,
} from "./index.js";

const databaseUrl = process.env.FINANCIAL_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

interface AccountBalanceRow extends RowDataPacket {
  account_reference: string;
  balance: number | string;
}

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

describeMySql.sequential("M137/M143 Financial MySQL integration", () => {
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
    await applyFinancialM145Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DROP TRIGGER IF EXISTS financial_test_fail_posting");
    await pool.query("DELETE FROM financial_reconciliation_run_findings");
    await pool.query("DELETE FROM financial_reconciliation_runs");
    await pool.query("DELETE FROM financial_reconciliation_findings");
    await pool.query("DELETE FROM financial_refund_requests");
    await pool.query("DELETE FROM financial_payment_results");
    await pool.query("DELETE FROM financial_provider_events");
    await pool.query("DELETE FROM financial_ledger_postings");
    await pool.query("DELETE FROM financial_ledger_transactions");
    await pool.query("DELETE FROM financial_payment_idempotency");
    await pool.query("DELETE FROM financial_payments");
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

  it("posts approval and immutable refund reversal exactly once", async () => {
    const payments = new MySqlPaymentRepository(pool);
    const saved = await payments.save(payment());
    const events = new MySqlProviderWebhookEventRepository(pool);
    const results = new MySqlVerifiedPaymentResultRepository(pool);
    const ledger = new MySqlLedgerTransactionRepository(pool);
    const outcomes = createVerifiedPaymentOutcomeService({
      payments,
      results,
      clock: { now: () => "2026-08-14T19:34:05Z" },
    });
    const accounting = createVerifiedPaymentAccountingService({
      ledger,
      results,
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

    const approval = await outcomes.apply(claim.receipt.event);
    expect(approval).toMatchObject({
      disposition: "applied",
      payment: { status: "confirmed" },
      result: {
        kind: "approved",
        paymentStatus: "confirmed",
        providerEventId: verified.providerEventId,
      },
    });
    if (!approval.payment || !approval.result) {
      throw new Error("APPROVAL_OUTCOME_INVALID");
    }
    await expect(
      accounting.apply(approval.payment, approval.result),
    ).resolves.toMatchObject({ disposition: "posted" });
    await expect(
      accounting.apply(approval.payment, approval.result),
    ).resolves.toMatchObject({ disposition: "replayed" });

    const refundCalls: RefundProviderCommand[] = [];
    const refunds = new MySqlRefundRequestRepository(pool);
    const refundApplication = createRefundApplicationService({
      payments,
      results,
      ledger,
      refunds,
      provider: {
        requestRefund(command) {
          refundCalls.push(command);
          return Promise.resolve({
            accepted: true as const,
            providerRefundReference: "sandbox_mysql_refund_0001",
          });
        },
      },
      clock: { now: () => "2026-08-14T19:34:06Z" },
    });
    await expect(
      refundApplication.requestFullRefund(saved.id),
    ).resolves.toMatchObject({
      status: "AWAITING_VERIFIED_EVENT",
      replayed: false,
      request: {
        paymentId: saved.id,
        status: "provider_accepted",
        idempotencyKey: "refund:v1:" + saved.id,
      },
    });
    await expect(
      refundApplication.requestFullRefund(saved.id),
    ).resolves.toMatchObject({
      status: "AWAITING_VERIFIED_EVENT",
      replayed: true,
    });
    expect(refundCalls).toHaveLength(1);
    await expect(payments.findById(saved.id)).resolves.toMatchObject({
      status: "confirmed",
    });
    const [refundRequestRows] = await pool.query<RowDataPacket[]>(
      "SELECT status, provider_refund_reference FROM financial_refund_requests WHERE payment_id = ?",
      [saved.id],
    );
    expect(refundRequestRows).toEqual([
      expect.objectContaining({
        status: "provider_accepted",
        provider_refund_reference: "sandbox_mysql_refund_0001",
      }),
    ]);

    const refundEvent = normalizeVerifiedProviderPaymentEvent({
      providerEventId: "pwe_mysql_refund_0001",
      externalReference: saved.id,
      providerPaymentReference: "sandbox_mysql_outcome_0001",
      status: "refunded",
      occurredAt: "2026-08-14T19:34:03Z",
    });
    if (!refundEvent) throw new Error("EVENT_FIXTURE_INVALID");
    const refundClaim = await events.claim({
      event: refundEvent,
      payloadSha256: "d".repeat(64),
      receivedAt: "2026-08-14T19:34:04Z",
      matchedPaymentId: saved.id,
    });
    const refund = await outcomes.apply(refundClaim.receipt.event);
    expect(refund).toMatchObject({
      disposition: "applied",
      payment: { status: "refunded" },
      result: { kind: "refunded", paymentStatus: "refunded" },
    });
    if (!refund.payment || !refund.result) {
      throw new Error("REFUND_OUTCOME_INVALID");
    }
    const refundedPayment = refund.payment;
    const reversal = await accounting.apply(refundedPayment, refund.result);
    expect(reversal).toMatchObject({
      disposition: "posted",
      transactions: [
        {
          postings: [
            {
              accountReference: "asset:provider_clearing",
              direction: "debit",
            },
            {
              accountReference: "revenue:checkout",
              direction: "credit",
            },
          ],
        },
        {
          postings: [
            {
              accountReference: "revenue:checkout",
              direction: "debit",
            },
            {
              accountReference: "asset:provider_clearing",
              direction: "credit",
            },
          ],
        },
      ],
    });
    for (const transaction of reversal.transactions) {
      expect(transaction.externalKey).toMatch(/^payment_result_fev_/u);
    }
    await expect(
      accounting.apply(refundedPayment, refund.result),
    ).resolves.toMatchObject({ disposition: "replayed" });
    await expect(
      refundApplication.requestFullRefund(saved.id),
    ).resolves.toMatchObject({
      status: "COMPLETED",
      replayed: true,
    });
    expect(refundCalls).toHaveLength(1);

    await expect(payments.findById(saved.id)).resolves.toMatchObject({
      status: "refunded",
      providerReference: "sandbox_mysql_outcome_0001",
    });
    const [resultRows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM financial_payment_results WHERE payment_id = ?",
      [saved.id],
    );
    expect(Number(resultRows[0]?.total)).toBe(2);
    const [transactionRows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM financial_ledger_transactions WHERE external_key LIKE 'payment_result_%'",
    );
    expect(Number(transactionRows[0]?.total)).toBe(2);
    const [balances] = await pool.query<AccountBalanceRow[]>(
      `SELECT account_reference,
              SUM(CASE direction WHEN 'debit' THEN CAST(amount_minor AS SIGNED) ELSE -CAST(amount_minor AS SIGNED) END) AS balance
       FROM financial_ledger_postings
       GROUP BY account_reference
       ORDER BY account_reference`,
    );
    expect(balances.map((row) => row.account_reference)).toEqual([
      "asset:provider_clearing",
      "revenue:checkout",
    ]);
    expect(balances.map((row) => Number(row.balance))).toEqual([0, 0]);

    const reconciliationRepository = new MySqlFinancialReconciliationRepository(
      pool,
    );
    let providerStatus: "paid" | "refunded" = "paid";
    let reconciliationTick = 0;
    const reconciliation = createReconciliationApplicationService({
      payments,
      results,
      ledger,
      reconciliation: reconciliationRepository,
      provider: {
        readPayment() {
          return Promise.resolve({
            paymentId: refundedPayment.id,
            providerPaymentReference:
              refundedPayment.providerReference ?? "missing",
            status: providerStatus,
            amount: refundedPayment.amount,
            observedAt:
              providerStatus === "paid"
                ? "2026-08-14T19:34:07Z"
                : "2026-08-14T19:34:08Z",
          });
        },
      },
      clock: {
        now: () =>
          new Date(
            Date.parse("2026-08-14T19:34:09Z") + reconciliationTick++,
          ).toISOString(),
      },
    });
    const mismatchRun = normalizeReconciliationRunId(
      "rrn_mysql_reconciliation_mismatch_0001",
    );
    const cleanRun = normalizeReconciliationRunId(
      "rrn_mysql_reconciliation_clean_0001",
    );
    if (!mismatchRun || !cleanRun) throw new Error("RUN_FIXTURE_INVALID");

    const mismatch = await reconciliation.reconcilePayment(
      refundedPayment.id,
      mismatchRun,
    );
    expect(mismatch).toMatchObject({
      replayed: false,
      run: { findingCount: 1 },
      findings: [{ kind: "payment_status_mismatch", state: "open" }],
    });
    const mismatchFinding = mismatch.findings[0];
    if (!mismatchFinding) throw new Error("FINDING_FIXTURE_INVALID");
    await expect(
      reconciliation.acknowledgeFinding(
        mismatchFinding.id,
        "operator:mysql-reconciliation",
      ),
    ).resolves.toMatchObject({
      id: mismatchFinding.id,
      state: "acknowledged",
      acknowledgedBy: "operator:mysql-reconciliation",
    });

    providerStatus = "refunded";
    await expect(
      reconciliation.reconcilePayment(refundedPayment.id, cleanRun),
    ).resolves.toMatchObject({
      replayed: false,
      run: { findingCount: 0 },
      findings: [],
    });
    await expect(
      reconciliation.reconcilePayment(refundedPayment.id, cleanRun),
    ).resolves.toMatchObject({
      replayed: true,
      run: { findingCount: 0 },
      findings: [],
    });

    providerStatus = "paid";
    await expect(
      reconciliation.reconcilePayment(refundedPayment.id, cleanRun),
    ).rejects.toThrow("FINANCIAL_RECONCILIATION_RUN_CONFLICT");
    providerStatus = "refunded";

    await expect(
      reconciliationRepository.listOpen(refundedPayment.id),
    ).resolves.toEqual([]);
    const [findingRows] = await pool.query<RowDataPacket[]>(
      `SELECT state, acknowledged_by, resolved_at
       FROM financial_reconciliation_findings
       WHERE reconciliation_finding_id = ?`,
      [mismatchFinding.id],
    );
    expect(findingRows).toEqual([
      expect.objectContaining({
        state: "resolved",
        acknowledged_by: "operator:mysql-reconciliation",
      }),
    ]);
    expect(findingRows[0]?.resolved_at).not.toBeNull();
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
