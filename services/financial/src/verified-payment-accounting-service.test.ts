import { describe, expect, it } from "vitest";

import {
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
  normalizeVerifiedPaymentResult,
  type LedgerTransaction,
  type LedgerTransactionRepositoryPort,
  type Payment,
  type PaymentId,
  type ProviderEventId,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
  type VerifiedPaymentTerminalStatus,
} from "@touristic/financial";

import {
  checkoutRevenueAccount,
  createVerifiedPaymentAccountingService,
  providerClearingAccount,
} from "./verified-payment-accounting-service.js";

function payment(status: Payment["status"]): Payment {
  const id = normalizePaymentId("pay_accounting_service_0001");
  const idempotencyKey = createPaymentIdempotencyKey(
    "ord_accounting_service_0001",
  );
  const amount = createMoney(49_900, "BRL");
  if (!id || !idempotencyKey || !amount) throw new Error("FIXTURE_INVALID");
  return {
    id,
    idempotencyKey,
    subject: { kind: "order", reference: "ord_accounting_service_0001" },
    amount,
    status,
    providerReference: "sandbox_accounting_service_0001",
    createdAt: "2026-08-15T00:00:00Z",
    updatedAt:
      status === "refunded"
        ? "2026-08-15T00:00:02Z"
        : "2026-08-15T00:00:01Z",
    confirmedAt:
      status === "confirmed" || status === "refunded"
        ? "2026-08-15T00:00:01Z"
        : null,
    refundedAt:
      status === "refunded" ? "2026-08-15T00:00:02Z" : null,
  };
}

function result(
  kind: "approved" | "failed" | "refunded",
): VerifiedPaymentResult {
  const value = normalizeVerifiedPaymentResult({
    resultId: "fev_accounting_" + kind + "_0001",
    providerEventId: "pwe_accounting_" + kind + "_0001",
    paymentId: "pay_accounting_service_0001",
    orderReference: "ord_accounting_service_0001",
    kind,
    paymentStatus:
      kind === "approved"
        ? "confirmed"
        : kind === "refunded"
          ? "refunded"
          : "failed",
    paymentReference: "sandbox_accounting_service_0001",
    occurredAt:
      kind === "refunded"
        ? "2026-08-15T00:00:02Z"
        : "2026-08-15T00:00:01Z",
    recordedAt: "2026-08-15T00:00:03Z",
  });
  if (!value) throw new Error("RESULT_FIXTURE_INVALID");
  return value;
}

class MemoryLedger implements LedgerTransactionRepositoryPort {
  readonly transactions = new Map<string, LedgerTransaction>();

  findByExternalKey(key: string): Promise<LedgerTransaction | null> {
    return Promise.resolve(this.transactions.get(key) ?? null);
  }

  append(transaction: LedgerTransaction): Promise<void> {
    const existing = this.transactions.get(transaction.externalKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(transaction)) {
      return Promise.reject(
        new Error("FINANCIAL_LEDGER_IDEMPOTENCY_CONFLICT"),
      );
    }
    this.transactions.set(transaction.externalKey, transaction);
    return Promise.resolve();
  }
}

class MemoryResults implements VerifiedPaymentResultRepositoryPort {
  constructor(readonly values: readonly VerifiedPaymentResult[]) {}

  findByProviderEventId(
    providerEventId: ProviderEventId,
  ): Promise<VerifiedPaymentResult | null> {
    return Promise.resolve(
      this.values.find((value) => value.providerEventId === providerEventId) ??
        null,
    );
  }

  findByPaymentStatus(
    paymentId: PaymentId,
    status: VerifiedPaymentTerminalStatus,
  ): Promise<VerifiedPaymentResult | null> {
    return Promise.resolve(
      this.values.find(
        (value) =>
          value.paymentId === paymentId && value.paymentStatus === status,
      ) ?? null,
    );
  }

  save(value: VerifiedPaymentResult): Promise<VerifiedPaymentResult> {
    return Promise.resolve(value);
  }
}

function service(values: readonly VerifiedPaymentResult[]) {
  const ledger = new MemoryLedger();
  return {
    ledger,
    accounting: createVerifiedPaymentAccountingService({
      ledger,
      results: new MemoryResults(values),
    }),
  };
}

describe("M143 verified Payment accounting", () => {
  it("posts one deterministic balanced approval and replays it exactly", async () => {
    const approved = result("approved");
    const { ledger, accounting } = service([approved]);

    await expect(
      accounting.apply(payment("confirmed"), approved),
    ).resolves.toMatchObject({
      disposition: "posted",
      transactions: [
        {
          externalKey: "payment_result_fev_accounting_approved_0001",
          postings: [
            {
              accountReference: providerClearingAccount,
              direction: "debit",
              amount: { minorUnits: 49_900, currency: "BRL" },
            },
            {
              accountReference: checkoutRevenueAccount,
              direction: "credit",
              amount: { minorUnits: 49_900, currency: "BRL" },
            },
          ],
        },
      ],
    });
    await expect(
      accounting.apply(payment("confirmed"), approved),
    ).resolves.toMatchObject({ disposition: "replayed" });
    expect(ledger.transactions.size).toBe(1);
  });

  it("recovers a missing approval posting before a refund reversal", async () => {
    const approved = result("approved");
    const refunded = result("refunded");
    const { ledger, accounting } = service([approved, refunded]);

    await expect(
      accounting.apply(payment("refunded"), refunded),
    ).resolves.toMatchObject({
      disposition: "posted",
      transactions: [
        { externalKey: "payment_result_fev_accounting_approved_0001" },
        {
          externalKey: "payment_result_fev_accounting_refunded_0001",
          postings: [
            {
              accountReference: checkoutRevenueAccount,
              direction: "debit",
            },
            {
              accountReference: providerClearingAccount,
              direction: "credit",
            },
          ],
        },
      ],
    });
    expect(ledger.transactions.size).toBe(2);
    await expect(
      accounting.apply(payment("refunded"), refunded),
    ).resolves.toMatchObject({ disposition: "replayed" });
  });

  it("does not post money for a verified failure result", async () => {
    const failed = result("failed");
    const { ledger, accounting } = service([failed]);

    await expect(accounting.apply(payment("failed"), failed)).resolves.toEqual({
      disposition: "not_applicable",
      transactions: [],
    });
    expect(ledger.transactions.size).toBe(0);
  });

  it("rejects a result/payment mismatch before touching the ledger", async () => {
    const approved = result("approved");
    const mismatched = normalizeVerifiedPaymentResult({
      ...approved,
      orderReference: "ord_other_accounting_0001",
    });
    if (!mismatched) throw new Error("RESULT_FIXTURE_INVALID");
    const { ledger, accounting } = service([approved]);

    await expect(
      accounting.apply(payment("confirmed"), mismatched),
    ).rejects.toThrow(
      "FINANCIAL_ACCOUNTING_RESULT_PAYMENT_MISMATCH",
    );
    expect(ledger.transactions).toHaveLength(0);
  });
});
