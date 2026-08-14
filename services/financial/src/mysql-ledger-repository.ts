import type {
  Pool,
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";

import {
  createLedgerTransaction,
  createMoney,
  normalizeLedgerTransactionId,
  type LedgerDirection,
  type LedgerTransaction,
  type LedgerTransactionRepositoryPort,
} from "@touristic/financial";

interface LedgerTransactionRow extends RowDataPacket {
  transaction_id: string;
  external_key: string;
  occurred_at: Date | string;
  currency: string;
}

interface LedgerPostingRow extends RowDataPacket {
  posting_sequence: number;
  account_reference: string;
  direction: string;
  amount_minor: number | string;
}

const LEDGER_EXTERNAL_KEY = /^[A-Za-z0-9_-]+$/u;
const MAX_LEDGER_POSTINGS = 256;

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("FINANCIAL_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function isDirection(value: string): value is LedgerDirection {
  return value === "debit" || value === "credit";
}

function isDuplicateKey(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
}

function sameLedger(left: LedgerTransaction, right: LedgerTransaction): boolean {
  if (
    left.id !== right.id ||
    left.externalKey !== right.externalKey ||
    left.occurredAt !== right.occurredAt ||
    left.postings.length !== right.postings.length
  ) {
    return false;
  }
  return left.postings.every((posting, index) => {
    const other = right.postings[index];
    return (
      other !== undefined &&
      posting.accountReference === other.accountReference &&
      posting.direction === other.direction &&
      posting.amount.minorUnits === other.amount.minorUnits &&
      posting.amount.currency === other.amount.currency
    );
  });
}

async function insertLedger(
  connection: PoolConnection,
  transaction: LedgerTransaction,
): Promise<void> {
  const currency = transaction.postings[0]?.amount.currency;
  if (!currency) throw new Error("FINANCIAL_LEDGER_MISSING_CURRENCY");

  await connection.execute(
    `INSERT INTO financial_ledger_transactions (
      transaction_id, external_key, occurred_at, currency, created_at
    ) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [
      transaction.id,
      transaction.externalKey,
      new Date(transaction.occurredAt),
      currency,
    ],
  );

  for (const [index, posting] of transaction.postings.entries()) {
    await connection.execute(
      `INSERT INTO financial_ledger_postings (
        transaction_id, posting_sequence, account_reference,
        direction, amount_minor, created_at
      ) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [
        transaction.id,
        index,
        posting.accountReference,
        posting.direction,
        posting.amount.minorUnits,
      ],
    );
  }
}

export class MySqlLedgerTransactionRepository
  implements LedgerTransactionRepositoryPort
{
  constructor(private readonly pool: Pool) {}

  async append(transaction: LedgerTransaction): Promise<void> {
    if (transaction.postings.length > MAX_LEDGER_POSTINGS) {
      throw new Error("FINANCIAL_LEDGER_TOO_MANY_POSTINGS");
    }
    const normalized = createLedgerTransaction({
      ...transaction,
      occurredAt: timestamp(transaction.occurredAt),
    });
    const connection = await this.pool.getConnection();
    let duplicate = false;

    try {
      await connection.beginTransaction();
      try {
        await insertLedger(connection, normalized);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        if (isDuplicateKey(error)) duplicate = true;
        else throw error;
      }
    } finally {
      connection.release();
    }

    if (!duplicate) return;
    const existing = await this.findByExternalKey(normalized.externalKey);
    if (existing && sameLedger(existing, normalized)) return;
    throw new Error("FINANCIAL_LEDGER_IDEMPOTENCY_CONFLICT");
  }

  async findByExternalKey(
    externalKey: string,
  ): Promise<LedgerTransaction | null> {
    if (typeof externalKey !== "string") {
      throw new Error("FINANCIAL_INVALID_LEDGER_EXTERNAL_KEY");
    }
    const normalizedExternalKey = externalKey.trim();
    if (
      !normalizedExternalKey ||
      normalizedExternalKey.length > 160 ||
      !LEDGER_EXTERNAL_KEY.test(normalizedExternalKey)
    ) {
      throw new Error("FINANCIAL_INVALID_LEDGER_EXTERNAL_KEY");
    }
    const [transactions] = await this.pool.execute<LedgerTransactionRow[]>(
      `SELECT transaction_id, external_key, occurred_at, currency
       FROM financial_ledger_transactions
       WHERE external_key = ?
       LIMIT 1`,
      [normalizedExternalKey],
    );
    const row = transactions[0];
    if (!row) return null;

    const id = normalizeLedgerTransactionId(row.transaction_id);
    if (!id || row.external_key !== normalizedExternalKey) {
      throw new Error("FINANCIAL_INVALID_PERSISTED_LEDGER");
    }
    const [postingRows] = await this.pool.execute<LedgerPostingRow[]>(
      `SELECT posting_sequence, account_reference, direction, amount_minor
       FROM financial_ledger_postings
       WHERE transaction_id = ?
       ORDER BY posting_sequence ASC`,
      [id],
    );

    const postings = postingRows.map((posting, index) => {
      if (posting.posting_sequence !== index) {
        throw new Error("FINANCIAL_INVALID_PERSISTED_LEDGER");
      }
      if (!isDirection(posting.direction)) {
        throw new Error("FINANCIAL_INVALID_PERSISTED_LEDGER");
      }
      const amount = createMoney(Number(posting.amount_minor), row.currency);
      if (!amount) throw new Error("FINANCIAL_INVALID_PERSISTED_LEDGER");
      return {
        accountReference: posting.account_reference,
        direction: posting.direction,
        amount,
      } as const;
    });

    try {
      return createLedgerTransaction({
        id,
        externalKey: row.external_key,
        occurredAt: timestamp(row.occurred_at),
        postings,
      });
    } catch {
      throw new Error("FINANCIAL_INVALID_PERSISTED_LEDGER");
    }
  }
}
