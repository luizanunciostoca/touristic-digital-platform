import { describe, expect, it } from "vitest";

import {
  createLedgerTransaction,
  createMoney,
  createPaymentIdempotencyKey,
  normalizeFinancialTimestamp,
  normalizeLedgerTransactionId,
  normalizePaymentId,
  type LedgerPosting,
  type LedgerTransactionId,
} from "./index.js";

function brl(minorUnits: number) {
  const value = createMoney(minorUnits, "BRL");
  if (!value) throw new Error("TEST_MONEY_INVALID");
  return value;
}

function ledgerId() {
  const value = normalizeLedgerTransactionId("led_12345678");
  if (!value) throw new Error("TEST_LEDGER_ID_INVALID");
  return value;
}

describe("M136 financial identity hardening", () => {
  it("rejects oversized IDs and references instead of truncating them", () => {
    expect(normalizePaymentId(`pay_${"a".repeat(200)}`)).toBeNull();
    expect(createPaymentIdempotencyKey(`ord_${"a".repeat(200)}`)).toBeNull();
    expect(
      normalizeFinancialTimestamp(`2026-08-14T19:30:00Z${"x".repeat(30)}`),
    ).toBe("");
  });

  it("rejects invalid runtime ledger IDs even if a caller bypasses TypeScript", () => {
    const invalidId = "led_bad" as LedgerTransactionId;
    expect(() =>
      createLedgerTransaction({
        id: invalidId,
        externalKey: "payment_12345678",
        occurredAt: "2026-08-14T19:30:00Z",
        postings: [
          {
            accountReference: "cash:provider",
            direction: "debit",
            amount: brl(100),
          },
          {
            accountReference: "revenue:platform",
            direction: "credit",
            amount: brl(100),
          },
        ],
      }),
    ).toThrow("FINANCIAL_INVALID_LEDGER_ID");
  });

  it("rejects oversized ledger keys/accounts and invalid runtime directions", () => {
    expect(() =>
      createLedgerTransaction({
        id: ledgerId(),
        externalKey: `payment_${"a".repeat(200)}`,
        occurredAt: "2026-08-14T19:30:00Z",
        postings: [
          {
            accountReference: "cash:provider",
            direction: "debit",
            amount: brl(100),
          },
          {
            accountReference: "revenue:platform",
            direction: "credit",
            amount: brl(100),
          },
        ],
      }),
    ).toThrow("FINANCIAL_INVALID_LEDGER_EXTERNAL_KEY");

    expect(() =>
      createLedgerTransaction({
        id: ledgerId(),
        externalKey: "payment_12345678",
        occurredAt: "2026-08-14T19:30:00Z",
        postings: [
          {
            accountReference: `cash:${"a".repeat(200)}`,
            direction: "debit",
            amount: brl(100),
          },
          {
            accountReference: "revenue:platform",
            direction: "credit",
            amount: brl(100),
          },
        ],
      }),
    ).toThrow("FINANCIAL_INVALID_LEDGER_ACCOUNT");

    const malformedPosting: LedgerPosting = {
      accountReference: "cash:provider",
      direction: "sideways" as LedgerPosting["direction"],
      amount: brl(100),
    };
    expect(() =>
      createLedgerTransaction({
        id: ledgerId(),
        externalKey: "payment_12345678",
        occurredAt: "2026-08-14T19:30:00Z",
        postings: [
          malformedPosting,
          {
            accountReference: "revenue:platform",
            direction: "credit",
            amount: brl(100),
          },
        ],
      }),
    ).toThrow("FINANCIAL_INVALID_LEDGER_DIRECTION");
  });
});
