import { describe, expect, it } from "vitest";

import {
  addMoney,
  assertPaymentTransition,
  createLedgerTransaction,
  createMoney,
  createPaymentIdempotencyKey,
  isPaymentTransitionAllowed,
  normalizeFinancialEventId,
  normalizeFinancialTimestamp,
  normalizeLedgerTransactionId,
  normalizePaymentId,
  type LedgerPosting,
  type PaymentApprovedEvent,
  type PaymentRefundedEvent,
} from "./index.js";

function ledgerId() {
  const value = normalizeLedgerTransactionId("led_12345678");
  if (!value) throw new Error("TEST_LEDGER_ID_INVALID");
  return value;
}

function paymentId() {
  const value = normalizePaymentId("pay_12345678");
  if (!value) throw new Error("TEST_PAYMENT_ID_INVALID");
  return value;
}

function eventId() {
  const value = normalizeFinancialEventId("fev_12345678");
  if (!value) throw new Error("TEST_EVENT_ID_INVALID");
  return value;
}

function brl(minorUnits: number) {
  const value = createMoney(minorUnits, "brl");
  if (!value) throw new Error("TEST_MONEY_INVALID");
  return value;
}

describe("M136 financial money vocabulary", () => {
  it("stores money as non-negative safe integer minor units", () => {
    expect(brl(12_345)).toEqual({ minorUnits: 12_345, currency: "BRL" });
    expect(Object.isFrozen(brl(100))).toBe(true);
    expect(createMoney(10.5, "BRL")).toBeNull();
    expect(createMoney(-1, "BRL")).toBeNull();
    expect(createMoney(Number.MAX_SAFE_INTEGER + 1, "BRL")).toBeNull();
    expect(createMoney(100, "REAL")).toBeNull();
  });

  it("refuses cross-currency arithmetic and unsafe overflow", () => {
    expect(addMoney(brl(100), brl(250))).toEqual({
      minorUnits: 350,
      currency: "BRL",
    });

    const usd = createMoney(100, "USD");
    if (!usd) throw new Error("TEST_MONEY_INVALID");
    expect(() => addMoney(brl(100), usd)).toThrow(
      "FINANCIAL_CURRENCY_MISMATCH",
    );

    const max = brl(Number.MAX_SAFE_INTEGER);
    expect(() => addMoney(max, brl(1))).toThrow("FINANCIAL_AMOUNT_OVERFLOW");
  });
});

describe("M136 financial identities and timestamps", () => {
  it("requires bounded prefixed internal IDs", () => {
    expect(normalizePaymentId("pay_12345678")).toBe("pay_12345678");
    expect(normalizePaymentId("12345678")).toBeNull();
    expect(normalizePaymentId("pay_bad value")).toBeNull();
    expect(normalizeLedgerTransactionId("led_abcdefgh")).toBe("led_abcdefgh");
    expect(normalizeFinancialEventId("fev_abcdefgh")).toBe("fev_abcdefgh");
  });

  it("accepts only UTC ISO timestamps for domain/event contracts", () => {
    expect(normalizeFinancialTimestamp("2026-08-14T19:30:00Z")).toBe(
      "2026-08-14T19:30:00Z",
    );
    expect(normalizeFinancialTimestamp("2026-08-14")).toBe("");
    expect(normalizeFinancialTimestamp("not-a-date")).toBe("");
  });

  it("derives a stable server-owned payment idempotency key from the order reference", () => {
    expect(createPaymentIdempotencyKey("ord_12345678")).toBe(
      "payment:v1:ord_12345678",
    );
    expect(createPaymentIdempotencyKey("order with spaces")).toBeNull();
  });
});

describe("M136 payment lifecycle", () => {
  it("allows only explicit forward transitions plus idempotent repeats", () => {
    expect(isPaymentTransitionAllowed("pending", "confirmed")).toBe(true);
    expect(isPaymentTransitionAllowed("pending", "failed")).toBe(true);
    expect(isPaymentTransitionAllowed("confirmed", "refunded")).toBe(true);
    expect(isPaymentTransitionAllowed("confirmed", "confirmed")).toBe(true);
    expect(isPaymentTransitionAllowed("refunded", "confirmed")).toBe(false);
    expect(isPaymentTransitionAllowed("failed", "pending")).toBe(false);
  });

  it("fails closed on invalid transitions", () => {
    expect(() => assertPaymentTransition("expired", "confirmed")).toThrow(
      "FINANCIAL_INVALID_PAYMENT_TRANSITION:expired:confirmed",
    );
  });
});

describe("M136 double-entry ledger vocabulary", () => {
  it("accepts a balanced immutable transaction", () => {
    const postings: readonly LedgerPosting[] = [
      {
        accountReference: "cash:provider",
        direction: "debit",
        amount: brl(10_000),
      },
      {
        accountReference: "revenue:platform",
        direction: "credit",
        amount: brl(10_000),
      },
    ];
    const transaction = createLedgerTransaction({
      id: ledgerId(),
      externalKey: "payment_12345678",
      occurredAt: "2026-08-14T19:30:00Z",
      postings,
    });

    expect(transaction.postings).toHaveLength(2);
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.postings)).toBe(true);
    expect(Object.isFrozen(transaction.postings[0])).toBe(true);
  });

  it("rejects unbalanced, zero-value and cross-currency postings", () => {
    expect(() =>
      createLedgerTransaction({
        id: ledgerId(),
        externalKey: "unbalanced_12345678",
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
            amount: brl(99),
          },
        ],
      }),
    ).toThrow("FINANCIAL_LEDGER_UNBALANCED");

    expect(() =>
      createLedgerTransaction({
        id: ledgerId(),
        externalKey: "zero_12345678",
        occurredAt: "2026-08-14T19:30:00Z",
        postings: [
          {
            accountReference: "cash:provider",
            direction: "debit",
            amount: brl(0),
          },
          {
            accountReference: "revenue:platform",
            direction: "credit",
            amount: brl(0),
          },
        ],
      }),
    ).toThrow("FINANCIAL_INVALID_LEDGER_AMOUNT");

    const usd = createMoney(100, "USD");
    if (!usd) throw new Error("TEST_MONEY_INVALID");
    expect(() =>
      createLedgerTransaction({
        id: ledgerId(),
        externalKey: "currency_12345678",
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
            amount: usd,
          },
        ],
      }),
    ).toThrow("FINANCIAL_LEDGER_CURRENCY_MISMATCH");
  });
});

describe("M136 versioned financial events", () => {
  it("keeps approval and refund events provider-agnostic for future consumers", () => {
    const approved: PaymentApprovedEvent = Object.freeze({
      eventId: eventId(),
      type: "PaymentApproved",
      version: 1,
      occurredAt: "2026-08-14T19:30:00Z",
      paymentId: paymentId(),
      orderReference: "ord_12345678",
      amount: brl(10_000),
      paymentReference: "provider-payment-1",
    });
    const refunded: PaymentRefundedEvent = Object.freeze({
      eventId: eventId(),
      type: "PaymentRefunded",
      version: 1,
      occurredAt: "2026-08-14T19:40:00Z",
      paymentId: paymentId(),
      orderReference: "ord_12345678",
      amount: brl(10_000),
      refundReference: "provider-refund-1",
    });

    expect(approved.type).toBe("PaymentApproved");
    expect(refunded.type).toBe("PaymentRefunded");
    expect(approved).not.toHaveProperty("providerSdk");
    expect(refunded).not.toHaveProperty("businessImplementation");
  });
});
