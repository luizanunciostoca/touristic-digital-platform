import { createHash } from "node:crypto";

import {
  createLedgerTransaction,
  normalizeLedgerTransactionId,
  normalizeVerifiedPaymentResult,
  type LedgerTransaction,
  type LedgerTransactionRepositoryPort,
  type Payment,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
} from "@touristic/financial";

import { normalizePaymentForPersistence } from "./payment-validation.js";

export const providerClearingAccount = "asset:provider_clearing";
export const checkoutRevenueAccount = "revenue:checkout";

export type VerifiedPaymentAccountingDisposition =
  "posted" | "replayed" | "not_applicable";

export interface VerifiedPaymentAccountingOutcome {
  readonly disposition: VerifiedPaymentAccountingDisposition;
  readonly transactions: readonly LedgerTransaction[];
}

export interface VerifiedPaymentAccountingApplicationPort {
  apply(
    payment: Payment,
    result: VerifiedPaymentResult,
  ): Promise<VerifiedPaymentAccountingOutcome>;
}

export interface VerifiedPaymentAccountingServiceDependencies {
  readonly ledger: LedgerTransactionRepositoryPort;
  readonly results: VerifiedPaymentResultRepositoryPort;
}

function assertResultMatchesPayment(
  payment: Payment,
  result: VerifiedPaymentResult,
): void {
  if (
    result.paymentId !== payment.id ||
    result.orderReference !== payment.subject.reference ||
    (result.paymentReference !== null &&
      payment.providerReference !== null &&
      result.paymentReference !== payment.providerReference)
  ) {
    throw new Error("FINANCIAL_ACCOUNTING_RESULT_PAYMENT_MISMATCH");
  }
  if (
    (result.kind === "approved" &&
      payment.status !== "confirmed" &&
      payment.status !== "refunded") ||
    (result.kind === "refunded" && payment.status !== "refunded") ||
    (result.kind !== "approved" &&
      result.kind !== "refunded" &&
      payment.status !== result.paymentStatus)
  ) {
    throw new Error("FINANCIAL_ACCOUNTING_PAYMENT_STATE_MISMATCH");
  }
}

export function verifiedPaymentAccountingExternalKey(
  resultInput: VerifiedPaymentResult,
): string {
  const result = normalizeVerifiedPaymentResult(resultInput);
  if (!result) throw new Error("FINANCIAL_ACCOUNTING_RESULT_INVALID");
  return "payment_result_" + result.resultId;
}

function ledgerIdentity(result: VerifiedPaymentResult) {
  const digest = createHash("sha256")
    .update("payment-accounting:v1:" + result.resultId)
    .digest("hex")
    .slice(0, 32);
  const id = normalizeLedgerTransactionId("led_" + digest);
  if (!id) throw new Error("FINANCIAL_ACCOUNTING_LEDGER_ID_INVALID");
  return Object.freeze({
    id,
    externalKey: verifiedPaymentAccountingExternalKey(result),
  });
}

function transactionFor(
  payment: Payment,
  result: VerifiedPaymentResult,
): LedgerTransaction {
  const identity = ledgerIdentity(result);
  const approval = result.kind === "approved";
  if (!approval && result.kind !== "refunded") {
    throw new Error("FINANCIAL_ACCOUNTING_RESULT_NOT_APPLICABLE");
  }
  return createLedgerTransaction({
    ...identity,
    occurredAt: result.occurredAt,
    postings: approval
      ? [
          {
            accountReference: providerClearingAccount,
            direction: "debit",
            amount: payment.amount,
          },
          {
            accountReference: checkoutRevenueAccount,
            direction: "credit",
            amount: payment.amount,
          },
        ]
      : [
          {
            accountReference: checkoutRevenueAccount,
            direction: "debit",
            amount: payment.amount,
          },
          {
            accountReference: providerClearingAccount,
            direction: "credit",
            amount: payment.amount,
          },
        ],
  });
}

async function appendOne(
  repository: LedgerTransactionRepositoryPort,
  payment: Payment,
  result: VerifiedPaymentResult,
): Promise<{
  readonly transaction: LedgerTransaction;
  readonly replayed: boolean;
}> {
  const transaction = transactionFor(payment, result);
  const existing = await repository.findByExternalKey(transaction.externalKey);
  await repository.append(transaction);
  return Object.freeze({
    transaction,
    replayed: existing !== null,
  });
}

export function createVerifiedPaymentAccountingService(
  dependencies: VerifiedPaymentAccountingServiceDependencies,
): VerifiedPaymentAccountingApplicationPort {
  return Object.freeze({
    async apply(
      paymentInput: Payment,
      resultInput: VerifiedPaymentResult,
    ): Promise<VerifiedPaymentAccountingOutcome> {
      const payment = normalizePaymentForPersistence(paymentInput);
      const result = normalizeVerifiedPaymentResult(resultInput);
      if (!result) throw new Error("FINANCIAL_ACCOUNTING_RESULT_INVALID");
      assertResultMatchesPayment(payment, result);

      if (result.kind !== "approved" && result.kind !== "refunded") {
        return Object.freeze({
          disposition: "not_applicable" as const,
          transactions: Object.freeze([]),
        });
      }

      const entries: {
        readonly transaction: LedgerTransaction;
        readonly replayed: boolean;
      }[] = [];
      if (result.kind === "refunded") {
        const approval = await dependencies.results.findByPaymentStatus(
          payment.id,
          "confirmed",
        );
        if (!approval || approval.kind !== "approved") {
          throw new Error("FINANCIAL_REFUND_APPROVAL_RESULT_MISSING");
        }
        assertResultMatchesPayment(payment, approval);
        entries.push(await appendOne(dependencies.ledger, payment, approval));
      }
      entries.push(await appendOne(dependencies.ledger, payment, result));

      return Object.freeze({
        disposition: entries.every((entry) => entry.replayed)
          ? ("replayed" as const)
          : ("posted" as const),
        transactions: Object.freeze(entries.map((entry) => entry.transaction)),
      });
    },
  });
}
