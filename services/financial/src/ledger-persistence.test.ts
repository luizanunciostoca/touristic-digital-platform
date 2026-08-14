import { describe, expect, it, vi } from "vitest";

import {
  createLedgerTransaction,
  createMoney,
  normalizeLedgerTransactionId,
} from "@touristic/financial";

import { MySqlLedgerTransactionRepository } from "./mysql-ledger-repository.js";

function transaction() {
  const id = normalizeLedgerTransactionId("led_12345678");
  const amount = createMoney(49_900, "BRL");
  if (!id || !amount) throw new Error("TEST_FIXTURE_INVALID");
  return createLedgerTransaction({
    id,
    externalKey: "payment_12345678",
    occurredAt: "2026-08-14T19:35:00Z",
    postings: [
      {
        accountReference: "cash:provider",
        direction: "debit",
        amount,
      },
      {
        accountReference: "revenue:platform",
        direction: "credit",
        amount,
      },
    ],
  });
}

describe("M137 MySqlLedgerTransactionRepository", () => {
  it("commits transaction and postings atomically through one MySQL connection", async () => {
    const execute = vi.fn(async () => [{ affectedRows: 1 }, []]);
    const beginTransaction = vi.fn(async () => undefined);
    const commit = vi.fn(async () => undefined);
    const rollback = vi.fn(async () => undefined);
    const release = vi.fn();
    const connection = {
      execute,
      beginTransaction,
      commit,
      rollback,
      release,
    };
    const getConnection = vi.fn(async () => connection);
    const repository = new MySqlLedgerTransactionRepository({ getConnection } as never);

    await expect(repository.append(transaction())).resolves.toBeUndefined();

    expect(beginTransaction).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(String(execute.mock.calls[0]?.[0])).toContain(
      "INSERT INTO financial_ledger_transactions",
    );
    expect(String(execute.mock.calls[1]?.[0])).toContain(
      "INSERT INTO financial_ledger_postings",
    );
  });

  it("rolls back all postings if any posting insert fails", async () => {
    let calls = 0;
    const execute = vi.fn(async () => {
      calls += 1;
      if (calls === 3) throw new Error("POSTING_WRITE_FAILED");
      return [{ affectedRows: 1 }, []];
    });
    const beginTransaction = vi.fn(async () => undefined);
    const commit = vi.fn(async () => undefined);
    const rollback = vi.fn(async () => undefined);
    const release = vi.fn();
    const getConnection = vi.fn(async () => ({
      execute,
      beginTransaction,
      commit,
      rollback,
      release,
    }));
    const repository = new MySqlLedgerTransactionRepository({ getConnection } as never);

    await expect(repository.append(transaction())).rejects.toThrow(
      "POSTING_WRITE_FAILED",
    );
    expect(commit).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("treats an exact duplicate external key as idempotent after rollback", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    });
    const executeConnection = vi.fn(async () => {
      throw duplicate;
    });
    const beginTransaction = vi.fn(async () => undefined);
    const commit = vi.fn(async () => undefined);
    const rollback = vi.fn(async () => undefined);
    const release = vi.fn();
    const getConnection = vi.fn(async () => ({
      execute: executeConnection,
      beginTransaction,
      commit,
      rollback,
      release,
    }));
    const value = transaction();
    const executePool = vi.fn(async (sql: string) => {
      if (sql.includes("FROM financial_ledger_transactions")) {
        return [[{
          transaction_id: value.id,
          external_key: value.externalKey,
          occurred_at: new Date(value.occurredAt),
          currency: "BRL",
        }], []];
      }
      if (sql.includes("FROM financial_ledger_postings")) {
        return [[
          {
            posting_sequence: 0,
            account_reference: "cash:provider",
            direction: "debit",
            amount_minor: 49_900,
          },
          {
            posting_sequence: 1,
            account_reference: "revenue:platform",
            direction: "credit",
            amount_minor: 49_900,
          },
        ], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const repository = new MySqlLedgerTransactionRepository({
      getConnection,
      execute: executePool,
    } as never);

    await expect(repository.append(value)).resolves.toBeUndefined();
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(executePool).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate external keys that point to different ledger content", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    });
    const getConnection = vi.fn(async () => ({
      execute: vi.fn(async () => {
        throw duplicate;
      }),
      beginTransaction: vi.fn(async () => undefined),
      commit: vi.fn(async () => undefined),
      rollback: vi.fn(async () => undefined),
      release: vi.fn(),
    }));
    const value = transaction();
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("FROM financial_ledger_transactions")) {
        return [[{
          transaction_id: "led_87654321",
          external_key: value.externalKey,
          occurred_at: new Date(value.occurredAt),
          currency: "BRL",
        }], []];
      }
      if (sql.includes("FROM financial_ledger_postings")) {
        return [[
          {
            posting_sequence: 0,
            account_reference: "cash:provider",
            direction: "debit",
            amount_minor: 49_900,
          },
          {
            posting_sequence: 1,
            account_reference: "revenue:platform",
            direction: "credit",
            amount_minor: 49_900,
          },
        ], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const repository = new MySqlLedgerTransactionRepository({
      getConnection,
      execute,
    } as never);

    await expect(repository.append(value)).rejects.toThrow(
      "FINANCIAL_LEDGER_IDEMPOTENCY_CONFLICT",
    );
  });
  it("rejects persisted ledgers with non-contiguous posting sequences", async () => {
    const value = transaction();
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("FROM financial_ledger_transactions")) {
        return [[{
          transaction_id: value.id,
          external_key: value.externalKey,
          occurred_at: new Date(value.occurredAt),
          currency: "BRL",
        }], []];
      }
      if (sql.includes("FROM financial_ledger_postings")) {
        return [[
          {
            posting_sequence: 0,
            account_reference: "cash:provider",
            direction: "debit",
            amount_minor: 49_900,
          },
          {
            posting_sequence: 2,
            account_reference: "revenue:platform",
            direction: "credit",
            amount_minor: 49_900,
          },
        ], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const repository = new MySqlLedgerTransactionRepository({ execute } as never);

    await expect(repository.findByExternalKey(value.externalKey)).rejects.toThrow(
      "FINANCIAL_INVALID_PERSISTED_LEDGER",
    );
  });
});
