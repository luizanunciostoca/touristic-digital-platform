import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import {
  createMoney,
  type PaymentId,
  type ReconciliationRunId,
} from "@touristic/financial";
import {
  normalizeFinancialAllocation,
  normalizeFinancialAllocationId,
  normalizeFinancialPayable,
  normalizeFinancialPayableId,
  normalizeFinancialSettlement,
  normalizeFinancialSettlementId,
  type FinancialAllocation,
  type FinancialPayable,
  type FinancialSettlement,
} from "@touristic/financial/settlement";

interface AllocationRow extends RowDataPacket {
  allocation_id: string;
  payment_id: string;
  reconciliation_run_id: string;
  gross_amount_minor: string | number;
  platform_amount_minor: string | number;
  currency: string;
  allocation_hash: Buffer;
  status: string;
  ledger_external_key: string | null;
  reversal_ledger_external_key: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  reversed_at: Date | string | null;
}

interface PayableRow extends RowDataPacket {
  payable_id: string;
  allocation_id: string;
  payment_id: string;
  beneficiary_reference: string;
  amount_minor: string | number;
  currency: string;
  status: string;
  settlement_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SettlementRow extends RowDataPacket {
  settlement_id: string;
  payable_id: string;
  payment_id: string;
  beneficiary_reference: string;
  amount_minor: string | number;
  currency: string;
  idempotency_key: string;
  status: string;
  provider_transfer_reference: string | null;
  ledger_external_key: string | null;
  reversal_ledger_external_key: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  settled_at: Date | string | null;
  reversed_at: Date | string | null;
}

function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error("FINANCIAL_INVALID_DB_TIMESTAMP");
  return parsed.toISOString();
}

function safeMinor(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("FINANCIAL_INVALID_DB_AMOUNT");
  }
  return parsed;
}

function allocationFromRow(row: AllocationRow): FinancialAllocation {
  const value = normalizeFinancialAllocation({
    id: row.allocation_id,
    paymentId: row.payment_id,
    reconciliationRunId: row.reconciliation_run_id,
    grossAmount: createMoney(safeMinor(row.gross_amount_minor), row.currency),
    platformAmount: createMoney(
      safeMinor(row.platform_amount_minor),
      row.currency,
    ),
    allocationHash: row.allocation_hash.toString("hex"),
    status: row.status,
    ledgerExternalKey: row.ledger_external_key,
    reversalLedgerExternalKey: row.reversal_ledger_external_key,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    reversedAt: timestamp(row.reversed_at),
  });
  if (!value) throw new Error("FINANCIAL_INVALID_PERSISTED_ALLOCATION");
  return value;
}

function payableFromRow(row: PayableRow): FinancialPayable {
  const value = normalizeFinancialPayable({
    id: row.payable_id,
    allocationId: row.allocation_id,
    paymentId: row.payment_id,
    beneficiaryReference: row.beneficiary_reference,
    amount: createMoney(safeMinor(row.amount_minor), row.currency),
    status: row.status,
    settlementId: row.settlement_id,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
  if (!value) throw new Error("FINANCIAL_INVALID_PERSISTED_PAYABLE");
  return value;
}

function settlementFromRow(row: SettlementRow): FinancialSettlement {
  const value = normalizeFinancialSettlement({
    id: row.settlement_id,
    payableId: row.payable_id,
    paymentId: row.payment_id,
    beneficiaryReference: row.beneficiary_reference,
    amount: createMoney(safeMinor(row.amount_minor), row.currency),
    idempotencyKey: row.idempotency_key,
    status: row.status,
    providerTransferReference: row.provider_transfer_reference,
    ledgerExternalKey: row.ledger_external_key,
    reversalLedgerExternalKey: row.reversal_ledger_external_key,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    settledAt: timestamp(row.settled_at),
    reversedAt: timestamp(row.reversed_at),
  });
  if (!value) throw new Error("FINANCIAL_INVALID_PERSISTED_SETTLEMENT");
  return value;
}

async function allocationByPayment(
  db: Pool | PoolConnection,
  paymentId: PaymentId,
): Promise<FinancialAllocation | null> {
  const [rows] = await db.execute<AllocationRow[]>(
    `SELECT * FROM financial_allocations WHERE payment_id = ? LIMIT 1`,
    [paymentId],
  );
  return rows[0] ? allocationFromRow(rows[0]) : null;
}

async function payablesByAllocation(
  db: Pool | PoolConnection,
  allocationId: string,
): Promise<readonly FinancialPayable[]> {
  const [rows] = await db.execute<PayableRow[]>(
    `SELECT * FROM financial_payables WHERE allocation_id = ? ORDER BY beneficiary_reference ASC`,
    [allocationId],
  );
  return rows.map(payableFromRow);
}

export class MySqlFinancialSettlementRepository {
  constructor(private readonly pool: Pool) {}

  async findAllocationByPaymentId(paymentId: PaymentId) {
    return allocationByPayment(this.pool, paymentId);
  }

  async listPayables(allocationIdInput: string) {
    const allocationId = normalizeFinancialAllocationId(allocationIdInput);
    if (!allocationId) throw new Error("FINANCIAL_INVALID_ALLOCATION_ID");
    return payablesByAllocation(this.pool, allocationId);
  }

  async findPayable(payableIdInput: string) {
    const payableId = normalizeFinancialPayableId(payableIdInput);
    if (!payableId) throw new Error("FINANCIAL_INVALID_PAYABLE_ID");
    const [rows] = await this.pool.execute<PayableRow[]>(
      `SELECT * FROM financial_payables WHERE payable_id = ? LIMIT 1`,
      [payableId],
    );
    return rows[0] ? payableFromRow(rows[0]) : null;
  }

  async findSettlement(settlementIdInput: string) {
    const settlementId = normalizeFinancialSettlementId(settlementIdInput);
    if (!settlementId) throw new Error("FINANCIAL_INVALID_SETTLEMENT_ID");
    const [rows] = await this.pool.execute<SettlementRow[]>(
      `SELECT * FROM financial_settlements WHERE settlement_id = ? LIMIT 1`,
      [settlementId],
    );
    return rows[0] ? settlementFromRow(rows[0]) : null;
  }

  async claimAllocation(input: {
    allocation: FinancialAllocation;
    payables: readonly FinancialPayable[];
  }): Promise<{
    allocation: FinancialAllocation;
    payables: readonly FinancialPayable[];
    replayed: boolean;
  }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [latestRuns] = await connection.execute<RowDataPacket[]>(
        `SELECT reconciliation_run_id, finding_count
         FROM financial_reconciliation_runs
         WHERE payment_id = ?
         ORDER BY recorded_at DESC, reconciliation_run_id DESC
         LIMIT 1 FOR UPDATE`,
        [input.allocation.paymentId],
      );
      const latest = latestRuns[0] as
        { reconciliation_run_id: string; finding_count: number } | undefined;
      const [openFindings] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM financial_reconciliation_findings
         WHERE payment_id = ? AND state <> 'resolved'`,
        [input.allocation.paymentId],
      );
      const openCount = Number(
        (openFindings[0] as { total?: number })?.total ?? 0,
      );
      if (
        !latest ||
        latest.reconciliation_run_id !== input.allocation.reconciliationRunId ||
        Number(latest.finding_count) !== 0 ||
        openCount !== 0
      ) {
        throw new Error("FINANCIAL_SETTLEMENT_RECONCILIATION_REQUIRED");
      }

      const existing = await allocationByPayment(
        connection,
        input.allocation.paymentId,
      );
      if (existing) {
        const existingPayables = await payablesByAllocation(
          connection,
          existing.id,
        );
        if (
          existing.allocationHash !== input.allocation.allocationHash ||
          existing.reconciliationRunId !==
            input.allocation.reconciliationRunId ||
          existingPayables.length !== input.payables.length ||
          existingPayables.some((value, index) => {
            const expected = input.payables[index];
            return (
              !expected ||
              value.beneficiaryReference !== expected.beneficiaryReference ||
              value.amount.minorUnits !== expected.amount.minorUnits ||
              value.amount.currency !== expected.amount.currency
            );
          })
        ) {
          throw new Error("FINANCIAL_SETTLEMENT_ALLOCATION_CONFLICT");
        }
        await connection.commit();
        return {
          allocation: existing,
          payables: existingPayables,
          replayed: true,
        };
      }

      await connection.execute(
        `INSERT INTO financial_allocations (
          allocation_id, payment_id, reconciliation_run_id, gross_amount_minor,
          platform_amount_minor, currency, allocation_hash, status,
          ledger_external_key, reversal_ledger_external_key,
          created_at, updated_at, reversed_at
        ) VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), ?, NULL, NULL, ?, ?, NULL)`,
        [
          input.allocation.id,
          input.allocation.paymentId,
          input.allocation.reconciliationRunId,
          input.allocation.grossAmount.minorUnits,
          input.allocation.platformAmount.minorUnits,
          input.allocation.grossAmount.currency,
          input.allocation.allocationHash,
          input.allocation.status,
          new Date(input.allocation.createdAt),
          new Date(input.allocation.updatedAt),
        ],
      );
      for (const payable of input.payables) {
        await connection.execute(
          `INSERT INTO financial_payables (
            payable_id, allocation_id, payment_id, beneficiary_reference,
            amount_minor, currency, status, settlement_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          [
            payable.id,
            payable.allocationId,
            payable.paymentId,
            payable.beneficiaryReference,
            payable.amount.minorUnits,
            payable.amount.currency,
            payable.status,
            new Date(payable.createdAt),
            new Date(payable.updatedAt),
          ],
        );
      }
      await connection.commit();
      return {
        allocation: input.allocation,
        payables: input.payables,
        replayed: false,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async activateAllocation(
    allocationIdInput: string,
    ledgerExternalKey: string,
    updatedAt: string,
  ): Promise<FinancialAllocation> {
    const allocationId = normalizeFinancialAllocationId(allocationIdInput);
    if (!allocationId || !ledgerExternalKey)
      throw new Error("FINANCIAL_INVALID_ALLOCATION_ACTIVATION");
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<AllocationRow[]>(
        `SELECT * FROM financial_allocations WHERE allocation_id = ? FOR UPDATE`,
        [allocationId],
      );
      const current = rows[0] ? allocationFromRow(rows[0]) : null;
      if (!current) throw new Error("FINANCIAL_ALLOCATION_NOT_FOUND");
      if (current.status === "active") {
        if (current.ledgerExternalKey !== ledgerExternalKey)
          throw new Error("FINANCIAL_ALLOCATION_LEDGER_CONFLICT");
        await connection.commit();
        return current;
      }
      if (current.status !== "claimed")
        throw new Error("FINANCIAL_ALLOCATION_NOT_ACTIVATABLE");
      await connection.execute(
        `UPDATE financial_allocations SET status='active', ledger_external_key=?, updated_at=? WHERE allocation_id=?`,
        [ledgerExternalKey, new Date(updatedAt), allocationId],
      );
      await connection.execute(
        `UPDATE financial_payables SET status='ready', updated_at=? WHERE allocation_id=? AND status='blocked'`,
        [new Date(updatedAt), allocationId],
      );
      await connection.commit();
      const refreshed = await this.findAllocationByPaymentId(current.paymentId);
      if (!refreshed) throw new Error("FINANCIAL_ALLOCATION_NOT_FOUND");
      return refreshed;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async claimSettlement(
    settlement: FinancialSettlement,
  ): Promise<{ settlement: FinancialSettlement; replayed: boolean }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [payableRows] = await connection.execute<PayableRow[]>(
        `SELECT * FROM financial_payables WHERE payable_id = ? FOR UPDATE`,
        [settlement.payableId],
      );
      const payable = payableRows[0] ? payableFromRow(payableRows[0]) : null;
      if (!payable) throw new Error("FINANCIAL_PAYABLE_NOT_FOUND");
      const [existingRows] = await connection.execute<SettlementRow[]>(
        `SELECT * FROM financial_settlements WHERE payable_id = ? LIMIT 1`,
        [settlement.payableId],
      );
      if (existingRows[0]) {
        const existing = settlementFromRow(existingRows[0]);
        if (
          existing.id !== settlement.id ||
          existing.idempotencyKey !== settlement.idempotencyKey ||
          existing.amount.minorUnits !== settlement.amount.minorUnits
        ) {
          throw new Error("FINANCIAL_SETTLEMENT_CONFLICT");
        }
        await connection.commit();
        return { settlement: existing, replayed: true };
      }
      if (payable.status !== "ready" || payable.settlementId !== null) {
        throw new Error("FINANCIAL_PAYABLE_NOT_READY");
      }
      await connection.execute(
        `INSERT INTO financial_settlements (
          settlement_id, payable_id, payment_id, beneficiary_reference,
          amount_minor, currency, idempotency_key, status,
          provider_transfer_reference, ledger_external_key,
          reversal_ledger_external_key, created_at, updated_at, settled_at, reversed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed', NULL, NULL, NULL, ?, ?, NULL, NULL)`,
        [
          settlement.id,
          settlement.payableId,
          settlement.paymentId,
          settlement.beneficiaryReference,
          settlement.amount.minorUnits,
          settlement.amount.currency,
          settlement.idempotencyKey,
          new Date(settlement.createdAt),
          new Date(settlement.updatedAt),
        ],
      );
      await connection.execute(
        `UPDATE financial_payables SET status='transfer_pending', settlement_id=?, updated_at=? WHERE payable_id=?`,
        [settlement.id, new Date(settlement.updatedAt), settlement.payableId],
      );
      await connection.commit();
      return { settlement, replayed: false };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async acceptProvider(
    settlementIdInput: string,
    providerTransferReference: string,
    updatedAt: string,
  ): Promise<FinancialSettlement> {
    const settlementId = normalizeFinancialSettlementId(settlementIdInput);
    if (!settlementId || !providerTransferReference)
      throw new Error("FINANCIAL_INVALID_SETTLEMENT_ACCEPTANCE");
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<SettlementRow[]>(
        `SELECT * FROM financial_settlements WHERE settlement_id=? FOR UPDATE`,
        [settlementId],
      );
      const current = rows[0] ? settlementFromRow(rows[0]) : null;
      if (!current) throw new Error("FINANCIAL_SETTLEMENT_NOT_FOUND");
      if (current.status === "provider_accepted") {
        if (current.providerTransferReference !== providerTransferReference)
          throw new Error("FINANCIAL_SETTLEMENT_PROVIDER_CONFLICT");
        await connection.commit();
        return current;
      }
      if (current.status !== "claimed")
        throw new Error("FINANCIAL_SETTLEMENT_NOT_ACCEPTABLE");
      await connection.execute(
        `UPDATE financial_settlements SET status='provider_accepted', provider_transfer_reference=?, updated_at=? WHERE settlement_id=?`,
        [providerTransferReference, new Date(updatedAt), settlementId],
      );
      await connection.commit();
      const refreshed = await this.findSettlement(settlementId);
      if (!refreshed) throw new Error("FINANCIAL_SETTLEMENT_NOT_FOUND");
      return refreshed;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async finalizeSettlement(input: {
    settlementId: string;
    status: "settled" | "failed" | "reversed";
    ledgerExternalKey: string | null;
    reversalLedgerExternalKey: string | null;
    updatedAt: string;
  }): Promise<FinancialSettlement> {
    const settlementId = normalizeFinancialSettlementId(input.settlementId);
    if (!settlementId) throw new Error("FINANCIAL_INVALID_SETTLEMENT_ID");
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<SettlementRow[]>(
        `SELECT * FROM financial_settlements WHERE settlement_id=? FOR UPDATE`,
        [settlementId],
      );
      const current = rows[0] ? settlementFromRow(rows[0]) : null;
      if (!current) throw new Error("FINANCIAL_SETTLEMENT_NOT_FOUND");
      if (current.status === input.status) {
        await connection.commit();
        return current;
      }
      if (input.status === "settled" && current.status !== "provider_accepted")
        throw new Error("FINANCIAL_SETTLEMENT_INVALID_TRANSITION");
      if (input.status === "failed" && current.status !== "provider_accepted")
        throw new Error("FINANCIAL_SETTLEMENT_INVALID_TRANSITION");
      if (input.status === "reversed" && current.status !== "settled")
        throw new Error("FINANCIAL_SETTLEMENT_INVALID_TRANSITION");
      await connection.execute(
        `UPDATE financial_settlements
         SET status=?, ledger_external_key=COALESCE(?, ledger_external_key),
             reversal_ledger_external_key=COALESCE(?, reversal_ledger_external_key),
             settled_at=CASE WHEN ?='settled' THEN ? ELSE settled_at END,
             reversed_at=CASE WHEN ?='reversed' THEN ? ELSE reversed_at END,
             updated_at=?
         WHERE settlement_id=?`,
        [
          input.status,
          input.ledgerExternalKey,
          input.reversalLedgerExternalKey,
          input.status,
          new Date(input.updatedAt),
          input.status,
          new Date(input.updatedAt),
          new Date(input.updatedAt),
          settlementId,
        ],
      );
      await connection.execute(
        `UPDATE financial_payables SET status=?, updated_at=? WHERE payable_id=?`,
        [input.status, new Date(input.updatedAt), current.payableId],
      );
      await connection.commit();
      const refreshed = await this.findSettlement(settlementId);
      if (!refreshed) throw new Error("FINANCIAL_SETTLEMENT_NOT_FOUND");
      return refreshed;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async reverseAllocation(
    allocationIdInput: string,
    reversalLedgerExternalKey: string,
    updatedAt: string,
  ): Promise<FinancialAllocation> {
    const allocationId = normalizeFinancialAllocationId(allocationIdInput);
    if (!allocationId || !reversalLedgerExternalKey)
      throw new Error("FINANCIAL_INVALID_ALLOCATION_REVERSAL");
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<AllocationRow[]>(
        `SELECT * FROM financial_allocations WHERE allocation_id=? FOR UPDATE`,
        [allocationId],
      );
      const current = rows[0] ? allocationFromRow(rows[0]) : null;
      if (!current) throw new Error("FINANCIAL_ALLOCATION_NOT_FOUND");
      if (current.status === "reversed") {
        if (current.reversalLedgerExternalKey !== reversalLedgerExternalKey)
          throw new Error("FINANCIAL_ALLOCATION_REVERSAL_CONFLICT");
        await connection.commit();
        return current;
      }
      if (current.status !== "active")
        throw new Error("FINANCIAL_ALLOCATION_NOT_REVERSIBLE");
      const [pending] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM financial_payables WHERE allocation_id=? AND status='transfer_pending'`,
        [allocationId],
      );
      if (Number((pending[0] as { total?: number })?.total ?? 0) !== 0) {
        throw new Error("FINANCIAL_ALLOCATION_TRANSFER_UNCERTAIN");
      }
      await connection.execute(
        `UPDATE financial_allocations SET status='reversed', reversal_ledger_external_key=?, reversed_at=?, updated_at=? WHERE allocation_id=?`,
        [
          reversalLedgerExternalKey,
          new Date(updatedAt),
          new Date(updatedAt),
          allocationId,
        ],
      );
      await connection.execute(
        `UPDATE financial_payables SET status='reversed', updated_at=? WHERE allocation_id=? AND status<>'reversed'`,
        [new Date(updatedAt), allocationId],
      );
      await connection.commit();
      const refreshed = await this.findAllocationByPaymentId(current.paymentId);
      if (!refreshed) throw new Error("FINANCIAL_ALLOCATION_NOT_FOUND");
      return refreshed;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
