import mysql, { type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createLedgerTransaction,
  createMoney,
  normalizeLedgerTransactionId,
  normalizePaymentId,
  normalizeReconciliationRunId,
} from "@touristic/financial";
import type {
  FinancialSettlementProviderCommand,
  FinancialSettlementProviderPort,
  FinancialSettlementProviderSnapshot,
} from "@touristic/financial/settlement";

import {
  MySqlLedgerTransactionRepository,
  MySqlPaymentRepository,
  MySqlVerifiedPaymentResultRepository,
  createFinancialMySqlPoolFromEnvironment,
} from "./index.js";
import {
  MySqlFinancialSettlementRepository,
  applyFinancialM146Schema,
  createSettlementApplicationService,
} from "./settlement.js";
import {
  checkoutRevenueAccount,
  providerClearingAccount,
} from "./verified-payment-accounting-service.js";

const databaseUrl = process.env.FINANCIAL_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

const paymentId = normalizePaymentId("pay_m146_settlement_0001")!;
const reconciliationRunId = normalizeReconciliationRunId(
  "rrn_m146_settlement_0001",
)!;
const amount = createMoney(10_000, "BRL")!;

class FakeSettlementProvider implements FinancialSettlementProviderPort {
  accepted: FinancialSettlementProviderCommand | null = null;
  status: "pending" | "paid" | "failed" | "reversed" = "pending";

  requestTransfer(command: FinancialSettlementProviderCommand) {
    this.accepted = command;
    return Promise.resolve({
      accepted: true as const,
      providerTransferReference: "transfer-m146-0001",
    });
  }

  readTransfer(input: {
    readonly settlementId: FinancialSettlementProviderCommand["settlementId"];
    readonly providerTransferReference: string;
  }): Promise<FinancialSettlementProviderSnapshot | null> {
    if (!this.accepted || input.settlementId !== this.accepted.settlementId) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      settlementId: this.accepted.settlementId,
      providerTransferReference: input.providerTransferReference,
      status: this.status,
      amount: this.accepted.amount,
      observedAt: "2026-08-15T04:31:00.000Z",
    });
  }
}

function ledgerId(seed: string) {
  const id = normalizeLedgerTransactionId(`led_${seed}`);
  if (!id) throw new Error("FIXTURE_LEDGER_ID_INVALID");
  return id;
}

describeMySql.sequential("M146 settlement MySQL integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!adminUrl || !databaseUrl)
      throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
    const admin = await mysql.createConnection(adminUrl);
    try {
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS financial_m146_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    } finally {
      await admin.end();
    }
    pool = createFinancialMySqlPoolFromEnvironment({
      FINANCIAL_DATABASE_URL: databaseUrl,
    });
    await applyFinancialM146Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM financial_settlements");
    await pool.query("DELETE FROM financial_payables");
    await pool.query("DELETE FROM financial_allocations");
    await pool.query("DELETE FROM financial_reconciliation_run_findings");
    await pool.query("DELETE FROM financial_reconciliation_findings");
    await pool.query("DELETE FROM financial_reconciliation_runs");
    await pool.query("DELETE FROM financial_refund_requests");
    await pool.query("DELETE FROM financial_payment_results");
    await pool.query("DELETE FROM financial_provider_events");
    await pool.query("DELETE FROM financial_ledger_postings");
    await pool.query("DELETE FROM financial_ledger_transactions");
    await pool.query("DELETE FROM financial_payment_idempotency");
    await pool.query("DELETE FROM financial_payments");
    await seedApprovedAuthority();
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function seedApprovedAuthority() {
    await pool.execute(
      `INSERT INTO financial_payments (
        payment_id, idempotency_key, subject_kind, subject_reference,
        amount_minor, currency, status, provider_reference,
        created_at, updated_at, confirmed_at, refunded_at
      ) VALUES (?, ?, 'order', ?, ?, 'BRL', 'confirmed', ?, ?, ?, ?, NULL)`,
      [
        paymentId,
        `payment:v1:ord_m146_settlement_0001`,
        "ord_m146_settlement_0001",
        amount.minorUnits,
        "provider-payment-m146-0001",
        new Date("2026-08-15T04:00:00Z"),
        new Date("2026-08-15T04:01:00Z"),
        new Date("2026-08-15T04:01:00Z"),
      ],
    );
    await pool.execute(
      `INSERT INTO financial_provider_events (
        provider_event_id, external_reference, provider_payment_reference,
        payment_status, occurred_at, received_at, payload_sha256, matched_payment_id
      ) VALUES (?, ?, ?, 'paid', ?, ?, UNHEX(?), ?)`,
      [
        "pwe_m146_approval_0001",
        paymentId,
        "provider-payment-m146-0001",
        new Date("2026-08-15T04:01:00Z"),
        new Date("2026-08-15T04:01:01Z"),
        "a".repeat(64),
        paymentId,
      ],
    );
    await pool.execute(
      `INSERT INTO financial_payment_results (
        result_id, provider_event_id, payment_id, order_reference,
        result_kind, payment_status, payment_reference, occurred_at, recorded_at
      ) VALUES (?, ?, ?, ?, 'approved', 'confirmed', ?, ?, ?)`,
      [
        "fev_m146_approval_0001",
        "pwe_m146_approval_0001",
        paymentId,
        "ord_m146_settlement_0001",
        "provider-payment-m146-0001",
        new Date("2026-08-15T04:01:00Z"),
        new Date("2026-08-15T04:01:01Z"),
      ],
    );
    const ledger = new MySqlLedgerTransactionRepository(pool);
    await ledger.append(
      createLedgerTransaction({
        id: ledgerId("m146approval0001"),
        externalKey: "payment_result_fev_m146_approval_0001",
        occurredAt: "2026-08-15T04:01:00Z",
        postings: [
          {
            accountReference: providerClearingAccount,
            direction: "debit",
            amount,
          },
          {
            accountReference: checkoutRevenueAccount,
            direction: "credit",
            amount,
          },
        ],
      }),
    );
    await pool.execute(
      `INSERT INTO financial_reconciliation_runs (
        reconciliation_run_id, payment_id, snapshot_hash,
        observed_at, recorded_at, finding_count
      ) VALUES (?, ?, UNHEX(?), ?, ?, 0)`,
      [
        reconciliationRunId,
        paymentId,
        "b".repeat(64),
        new Date("2026-08-15T04:05:00Z"),
        new Date("2026-08-15T04:05:01Z"),
      ],
    );
  }

  function harness(provider = new FakeSettlementProvider()) {
    return {
      provider,
      ledger: new MySqlLedgerTransactionRepository(pool),
      repository: new MySqlFinancialSettlementRepository(pool),
      application: createSettlementApplicationService({
        payments: new MySqlPaymentRepository(pool),
        results: new MySqlVerifiedPaymentResultRepository(pool),
        ledger: new MySqlLedgerTransactionRepository(pool),
        settlement: new MySqlFinancialSettlementRepository(pool),
        provider,
        clock: { now: () => "2026-08-15T04:30:00Z" },
      }),
    };
  }

  async function allocate(
    application: ReturnType<typeof createSettlementApplicationService>,
  ) {
    return application.allocate({
      paymentId,
      reconciliationRunId,
      plan: {
        platformAmount: createMoney(1_000, "BRL")!,
        beneficiaries: [
          {
            beneficiaryReference: "business_m146",
            amount: createMoney(9_000, "BRL")!,
          },
        ],
      },
    });
  }

  it("allocates only clean reconciled authority and posts a balanced split", async () => {
    const { application, ledger } = harness();
    const result = await allocate(application);
    expect(result.allocation.status).toBe("active");
    expect(result.payables).toEqual([
      expect.objectContaining({
        status: "ready",
        amount: createMoney(9_000, "BRL"),
      }),
    ]);
    const transaction = await ledger.findByExternalKey(
      `allocation_v1_${result.allocation.id}`,
    );
    expect(transaction?.postings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountReference: checkoutRevenueAccount,
          direction: "debit",
        }),
        expect.objectContaining({
          accountReference: "revenue:platform",
          direction: "credit",
        }),
        expect.objectContaining({
          accountReference: "liability:payable:business_m146",
          direction: "credit",
        }),
      ]),
    );

    const replay = await allocate(application);
    expect(replay.allocation.id).toBe(result.allocation.id);
  });

  it("does not treat provider command acceptance as a paid settlement", async () => {
    const { application, repository, ledger } = harness();
    const allocation = await allocate(application);
    const payable = allocation.payables[0]!;
    const requested = await application.requestSettlement(payable.id);
    expect(requested.settlement.status).toBe("provider_accepted");
    expect(
      await ledger.findByExternalKey(
        `settlement_v1_${requested.settlement.id}`,
      ),
    ).toBeNull();
    expect((await repository.findPayable(payable.id))?.status).toBe(
      "transfer_pending",
    );
  });

  it("settles only after verified provider read and posts payable to clearing", async () => {
    const { application, provider, ledger } = harness();
    const allocation = await allocate(application);
    const requested = await application.requestSettlement(
      allocation.payables[0]!.id,
    );
    provider.status = "paid";
    const verified = await application.verifySettlement(
      requested.settlement.id,
    );
    expect(verified.settlement.status).toBe("settled");
    const posting = await ledger.findByExternalKey(
      `settlement_v1_${requested.settlement.id}`,
    );
    expect(posting?.postings).toEqual([
      expect.objectContaining({
        accountReference: "liability:payable:business_m146",
        direction: "debit",
      }),
      expect.objectContaining({
        accountReference: providerClearingAccount,
        direction: "credit",
      }),
    ]);
  });

  it("creates beneficiary receivable when refund happens after settlement", async () => {
    const { application, provider, ledger } = harness();
    const allocation = await allocate(application);
    const requested = await application.requestSettlement(
      allocation.payables[0]!.id,
    );
    provider.status = "paid";
    await application.verifySettlement(requested.settlement.id);
    await seedRefundEvidence(ledger);

    const reversed = await application.reverseAllocationForRefund(paymentId);
    expect(reversed.allocation.status).toBe("reversed");
    const reversal = await ledger.findByExternalKey(
      `allocation_refund_reversal_v1_${allocation.allocation.id}`,
    );
    expect(reversal?.postings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountReference: "asset:beneficiary_receivable:business_m146",
          direction: "debit",
          amount: createMoney(9_000, "BRL"),
        }),
        expect.objectContaining({
          accountReference: "revenue:platform",
          direction: "debit",
          amount: createMoney(1_000, "BRL"),
        }),
        expect.objectContaining({
          accountReference: checkoutRevenueAccount,
          direction: "credit",
          amount,
        }),
      ]),
    );
  });

  it("blocks refund allocation reversal while a transfer outcome is uncertain", async () => {
    const { application, ledger } = harness();
    const allocation = await allocate(application);
    await application.requestSettlement(allocation.payables[0]!.id);
    await seedRefundEvidence(ledger);
    await expect(
      application.reverseAllocationForRefund(paymentId),
    ).rejects.toMatchObject({
      code: "FINANCIAL_SETTLEMENT_TRANSFER_UNCERTAIN",
    });
  });

  async function seedRefundEvidence(ledger: MySqlLedgerTransactionRepository) {
    await pool.execute(
      `UPDATE financial_payments SET status='refunded', refunded_at=?, updated_at=? WHERE payment_id=?`,
      [
        new Date("2026-08-15T05:10:00Z"),
        new Date("2026-08-15T05:10:00Z"),
        paymentId,
      ],
    );
    await pool.execute(
      `INSERT INTO financial_provider_events (
        provider_event_id, external_reference, provider_payment_reference,
        payment_status, occurred_at, received_at, payload_sha256, matched_payment_id
      ) VALUES (?, ?, ?, 'refunded', ?, ?, UNHEX(?), ?)`,
      [
        "pwe_m146_refund_0001",
        paymentId,
        "provider-payment-m146-0001",
        new Date("2026-08-15T05:10:00Z"),
        new Date("2026-08-15T05:10:01Z"),
        "c".repeat(64),
        paymentId,
      ],
    );
    await pool.execute(
      `INSERT INTO financial_payment_results (
        result_id, provider_event_id, payment_id, order_reference,
        result_kind, payment_status, payment_reference, occurred_at, recorded_at
      ) VALUES (?, ?, ?, ?, 'refunded', 'refunded', ?, ?, ?)`,
      [
        "fev_m146_refund_0001",
        "pwe_m146_refund_0001",
        paymentId,
        "ord_m146_settlement_0001",
        "provider-payment-m146-0001",
        new Date("2026-08-15T05:10:00Z"),
        new Date("2026-08-15T05:10:01Z"),
      ],
    );
    await ledger.append(
      createLedgerTransaction({
        id: ledgerId("m146refund000001"),
        externalKey: "payment_result_fev_m146_refund_0001",
        occurredAt: "2026-08-15T05:10:00Z",
        postings: [
          {
            accountReference: checkoutRevenueAccount,
            direction: "debit",
            amount,
          },
          {
            accountReference: providerClearingAccount,
            direction: "credit",
            amount,
          },
        ],
      }),
    );
  }
});
