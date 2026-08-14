import { describe, expect, it, vi } from "vitest";

import {
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
  type Payment,
} from "@touristic/financial";

import { MySqlPaymentIdempotencyPort } from "./mysql-payment-idempotency-port.js";
import { MySqlPaymentRepository } from "./mysql-payment-repository.js";
import { financialM137SchemaSql } from "./schema.js";

function payment(overrides: Partial<Payment> = {}): Payment {
  const id = normalizePaymentId("pay_12345678");
  const idempotencyKey = createPaymentIdempotencyKey("ord_12345678");
  const amount = createMoney(49_900, "BRL");
  if (!id || !idempotencyKey || !amount) throw new Error("TEST_FIXTURE_INVALID");
  return {
    id,
    idempotencyKey,
    subject: { kind: "order", reference: "ord_12345678" },
    amount,
    status: "pending",
    providerReference: null,
    createdAt: "2026-08-14T19:31:00Z",
    updatedAt: "2026-08-14T19:31:00Z",
    confirmedAt: null,
    refundedAt: null,
    ...overrides,
  };
}

function row(value = payment()) {
  return {
    payment_id: value.id,
    idempotency_key: value.idempotencyKey,
    subject_kind: value.subject.kind,
    subject_reference: value.subject.reference,
    amount_minor: value.amount.minorUnits,
    currency: value.amount.currency,
    status: value.status,
    provider_reference: value.providerReference,
    created_at: new Date(value.createdAt),
    updated_at: new Date(value.updatedAt),
    confirmed_at: value.confirmedAt ? new Date(value.confirmedAt) : null,
    refunded_at: value.refundedAt ? new Date(value.refundedAt) : null,
  };
}

describe("M137 Financial schema", () => {
  it("separates payment, idempotency and append-only ledger tables", () => {
    expect(financialM137SchemaSql).toContain("financial_payment_idempotency");
    expect(financialM137SchemaSql).toContain("financial_payments");
    expect(financialM137SchemaSql).toContain("financial_ledger_transactions");
    expect(financialM137SchemaSql).toContain("financial_ledger_postings");
    expect(financialM137SchemaSql).toContain("amount_minor BIGINT UNSIGNED NOT NULL");
    expect(financialM137SchemaSql).toContain("idempotency_key VARCHAR(180) COLLATE utf8mb4_bin PRIMARY KEY");
    expect(financialM137SchemaSql).toContain("external_key VARCHAR(160) COLLATE utf8mb4_bin NOT NULL UNIQUE");
    expect(financialM137SchemaSql).toContain("CHECK (amount_minor <= 9007199254740991)");
    expect(financialM137SchemaSql).not.toContain("ordering_orders");
  });
});

describe("M137 MySqlPaymentIdempotencyPort", () => {
  it("atomically claims a stable payment id once and replays the same mapping", async () => {
    const key = payment().idempotencyKey;
    const id = payment().id;
    let first = true;
    const execute = vi.fn(async (sql: string, params?: readonly unknown[]) => {
      expect(params?.[0]).toBe(key);
      if (sql.includes("INSERT IGNORE")) {
        const affectedRows = first ? 1 : 0;
        first = false;
        return [{ affectedRows }, []];
      }
      if (sql.includes("SELECT idempotency_key")) {
        return [[{ idempotency_key: key, payment_id: id }], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const port = new MySqlPaymentIdempotencyPort({ execute } as never);

    await expect(port.claim(key, id)).resolves.toEqual({ claimed: true, paymentId: id });
    await expect(port.claim(key, id)).resolves.toEqual({ claimed: false, paymentId: id });
  });

  it("fails closed if the proposed PaymentId is already owned by another key", async () => {
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT IGNORE")) return [{ affectedRows: 0 }, []];
      if (sql.includes("SELECT idempotency_key")) return [[], []];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const port = new MySqlPaymentIdempotencyPort({ execute } as never);

    await expect(port.claim(payment().idempotencyKey, payment().id)).rejects.toThrow(
      "FINANCIAL_IDEMPOTENCY_PAYMENT_ID_CONFLICT",
    );
  });
});

describe("M137 MySqlPaymentRepository", () => {
  it("updates only mutable payment lifecycle fields after immutable identity is confirmed", async () => {
    const initial = payment();
    const confirmed = payment({
      status: "confirmed",
      providerReference: "provider-payment-123",
      updatedAt: "2026-08-14T19:35:00Z",
      confirmedAt: "2026-08-14T19:35:00Z",
    });
    let selected = row(initial);
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT IGNORE")) return [{ affectedRows: 0 }, []];
      if (sql.includes("UPDATE financial_payments")) {
        expect(sql).not.toContain("amount_minor =");
        expect(sql).not.toContain("subject_reference =");
        expect(sql).toContain("AND status = ? AND updated_at = ?");
        selected = row(confirmed);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes("WHERE payment_id = ?")) return [[selected], []];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const repository = new MySqlPaymentRepository({ execute } as never);

    await expect(repository.save(confirmed)).resolves.toMatchObject({
      id: initial.id,
      status: "confirmed",
      amount: initial.amount,
      subject: initial.subject,
      createdAt: "2026-08-14T19:31:00.000Z",
      updatedAt: "2026-08-14T19:35:00.000Z",
      confirmedAt: "2026-08-14T19:35:00.000Z",
    });
  });

  it("does not mutate an existing payment when the idempotency key belongs to another PaymentId", async () => {
    const incoming = payment();
    const conflictingRow = {
      ...row(incoming),
      payment_id: "pay_87654321",
    };
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT IGNORE")) return [{ affectedRows: 0 }, []];
      if (sql.includes("WHERE payment_id = ?")) return [[], []];
      if (sql.includes("WHERE idempotency_key = ?")) return [[conflictingRow], []];
      if (sql.includes("UPDATE financial_payments")) throw new Error("UPDATE_MUST_NOT_RUN");
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const repository = new MySqlPaymentRepository({ execute } as never);

    await expect(repository.save(incoming)).rejects.toThrow(
      "FINANCIAL_PAYMENT_IDEMPOTENCY_CONFLICT",
    );
    expect(execute.mock.calls.some(([sql]) => String(sql).includes("UPDATE financial_payments"))).toBe(false);
  });

  it("rejects forged optional values instead of silently erasing them", async () => {
    const execute = vi.fn();
    const repository = new MySqlPaymentRepository({ execute } as never);

    await expect(repository.save(payment({ providerReference: "\n" }))).rejects.toThrow(
      "FINANCIAL_INVALID_PROVIDER_REFERENCE",
    );
    await expect(repository.save(payment({ confirmedAt: "not-a-time" }))).rejects.toThrow(
      "FINANCIAL_INVALID_PAYMENT_TIMESTAMP",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a lost payment update when compare-and-swap affects no row", async () => {
    const initial = payment();
    const confirmed = payment({
      status: "confirmed",
      providerReference: "provider-payment-123",
      updatedAt: "2026-08-14T19:35:00Z",
      confirmedAt: "2026-08-14T19:35:00Z",
    });
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT IGNORE")) return [{ affectedRows: 0 }, []];
      if (sql.includes("WHERE payment_id = ?")) return [[row(initial)], []];
      if (sql.includes("UPDATE financial_payments")) return [{ affectedRows: 0 }, []];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const repository = new MySqlPaymentRepository({ execute } as never);

    await expect(repository.save(confirmed)).rejects.toThrow(
      "FINANCIAL_CONCURRENT_PAYMENT_MODIFICATION",
    );
  });

  it("rejects persisted amounts outside JavaScript safe-integer authority", async () => {
    const corrupted = { ...row(), amount_minor: "9007199254740992" };
    const execute = vi.fn(async () => [[corrupted], []]);
    const repository = new MySqlPaymentRepository({ execute } as never);

    await expect(repository.findById(payment().id)).rejects.toThrow(
      "FINANCIAL_INVALID_PERSISTED_PAYMENT",
    );
  });
});
