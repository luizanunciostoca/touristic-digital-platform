import { createHash } from "node:crypto";

import {
  createLedgerTransaction,
  normalizeFinancialTimestamp,
  normalizeLedgerTransactionId,
  type LedgerPosting,
  type LedgerTransactionRepositoryPort,
  type PaymentRepositoryPort,
  type ReconciliationRunId,
  type VerifiedPaymentResultRepositoryPort,
} from "@touristic/financial";
import {
  allocationPlanTotal,
  createFinancialSettlementIdempotencyKey,
  createFinancialSettlementProviderCommand,
  normalizeFinancialAllocation,
  normalizeFinancialAllocationId,
  normalizeFinancialAllocationPlan,
  normalizeFinancialPayable,
  normalizeFinancialPayableId,
  normalizeFinancialSettlement,
  normalizeFinancialSettlementId,
  type FinancialAllocation,
  type FinancialAllocationPlan,
  type FinancialPayable,
  type FinancialSettlement,
  type FinancialSettlementProviderPort,
} from "@touristic/financial/settlement";

import { MySqlFinancialSettlementRepository } from "./mysql-settlement-repository.js";
import {
  checkoutRevenueAccount,
  providerClearingAccount,
  verifiedPaymentAccountingExternalKey,
} from "./verified-payment-accounting-service.js";

export type SettlementApplicationErrorCode =
  | "FINANCIAL_SETTLEMENT_PAYMENT_NOT_CONFIRMED"
  | "FINANCIAL_SETTLEMENT_APPROVAL_EVIDENCE_MISSING"
  | "FINANCIAL_SETTLEMENT_ALLOCATION_INVALID"
  | "FINANCIAL_SETTLEMENT_PAYABLE_NOT_READY"
  | "FINANCIAL_SETTLEMENT_PROVIDER_MISMATCH"
  | "FINANCIAL_SETTLEMENT_PROVIDER_FUTURE_SNAPSHOT"
  | "FINANCIAL_SETTLEMENT_REFUND_EVIDENCE_MISSING"
  | "FINANCIAL_SETTLEMENT_TRANSFER_UNCERTAIN";

export class SettlementApplicationError extends Error {
  constructor(readonly code: SettlementApplicationErrorCode) {
    super(code);
    this.name = "SettlementApplicationError";
  }
}

export interface SettlementApplicationDependencies {
  readonly payments: PaymentRepositoryPort;
  readonly results: VerifiedPaymentResultRepositoryPort;
  readonly ledger: LedgerTransactionRepositoryPort;
  readonly settlement: MySqlFinancialSettlementRepository;
  readonly provider: FinancialSettlementProviderPort;
  readonly clock: { now(): string };
}

function now(clock: { now(): string }): string {
  const value = normalizeFinancialTimestamp(clock.now());
  if (!value) throw new Error("FINANCIAL_SETTLEMENT_CLOCK_INVALID");
  return new Date(value).toISOString();
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalPlan(plan: FinancialAllocationPlan): string {
  return JSON.stringify({
    platform: [plan.platformAmount.minorUnits, plan.platformAmount.currency],
    beneficiaries: plan.beneficiaries.map((entry) => [
      entry.beneficiaryReference,
      entry.amount.minorUnits,
      entry.amount.currency,
    ]),
  });
}

function allocationIdentity(paymentId: string, planHash: string) {
  const id = normalizeFinancialAllocationId(
    `alc_${sha(`allocation:v1:${paymentId}:${planHash}`).slice(0, 32)}`,
  );
  if (!id) throw new Error("FINANCIAL_SETTLEMENT_ALLOCATION_ID_INVALID");
  return id;
}

function payableIdentity(allocationId: string, beneficiaryReference: string) {
  const id = normalizeFinancialPayableId(
    `pbl_${sha(`payable:v1:${allocationId}:${beneficiaryReference}`).slice(0, 32)}`,
  );
  if (!id) throw new Error("FINANCIAL_SETTLEMENT_PAYABLE_ID_INVALID");
  return id;
}

function settlementIdentity(payableId: string) {
  const id = normalizeFinancialSettlementId(
    `stl_${sha(`settlement:v1:${payableId}`).slice(0, 32)}`,
  );
  if (!id) throw new Error("FINANCIAL_SETTLEMENT_ID_INVALID");
  return id;
}

function ledgerIdentity(kind: string, subject: string) {
  const id = normalizeLedgerTransactionId(
    `led_${sha(`settlement-ledger:v1:${kind}:${subject}`).slice(0, 32)}`,
  );
  if (!id) throw new Error("FINANCIAL_SETTLEMENT_LEDGER_ID_INVALID");
  return id;
}

function sameMoney(
  left: { minorUnits: number; currency: string },
  right: { minorUnits: number; currency: string },
) {
  return left.minorUnits === right.minorUnits && left.currency === right.currency;
}

function allocationExternalKey(allocationId: string) {
  return `allocation_v1_${allocationId}`;
}

function settlementExternalKey(settlementId: string) {
  return `settlement_v1_${settlementId}`;
}

function settlementReversalExternalKey(settlementId: string) {
  return `settlement_reversal_v1_${settlementId}`;
}

function allocationReversalExternalKey(allocationId: string) {
  return `allocation_refund_reversal_v1_${allocationId}`;
}

function payableAccount(reference: string) {
  return `liability:payable:${reference}`;
}

function receivableAccount(reference: string) {
  return `asset:beneficiary_receivable:${reference}`;
}

async function requireApprovalEvidence(
  dependencies: SettlementApplicationDependencies,
  paymentId: Parameters<VerifiedPaymentResultRepositoryPort["findByPaymentStatus"]>[0],
) {
  const approval = await dependencies.results.findByPaymentStatus(
    paymentId,
    "confirmed",
  );
  if (!approval || approval.kind !== "approved") {
    throw new SettlementApplicationError(
      "FINANCIAL_SETTLEMENT_APPROVAL_EVIDENCE_MISSING",
    );
  }
  const approvalLedger = await dependencies.ledger.findByExternalKey(
    verifiedPaymentAccountingExternalKey(approval),
  );
  if (!approvalLedger) {
    throw new SettlementApplicationError(
      "FINANCIAL_SETTLEMENT_APPROVAL_EVIDENCE_MISSING",
    );
  }
  return approval;
}

export function createSettlementApplicationService(
  dependencies: SettlementApplicationDependencies,
) {
  return Object.freeze({
    async allocate(input: {
      paymentId: Parameters<PaymentRepositoryPort["findById"]>[0];
      reconciliationRunId: ReconciliationRunId;
      plan: FinancialAllocationPlan;
    }) {
      const payment = await dependencies.payments.findById(input.paymentId);
      if (!payment || payment.status !== "confirmed") {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PAYMENT_NOT_CONFIRMED",
        );
      }
      await requireApprovalEvidence(dependencies, payment.id);
      const plan = normalizeFinancialAllocationPlan(input.plan);
      if (!plan || !sameMoney(allocationPlanTotal(plan), payment.amount)) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_ALLOCATION_INVALID",
        );
      }
      const allocationHash = sha(canonicalPlan(plan));
      const allocationId = allocationIdentity(payment.id, allocationHash);
      const occurredAt = now(dependencies.clock);
      const allocation = normalizeFinancialAllocation({
        id: allocationId,
        paymentId: payment.id,
        reconciliationRunId: input.reconciliationRunId,
        grossAmount: payment.amount,
        platformAmount: plan.platformAmount,
        allocationHash,
        status: "claimed",
        ledgerExternalKey: null,
        reversalLedgerExternalKey: null,
        createdAt: occurredAt,
        updatedAt: occurredAt,
        reversedAt: null,
      });
      if (!allocation) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_ALLOCATION_INVALID",
        );
      }
      const payables = plan.beneficiaries.map((entry) => {
        const payable = normalizeFinancialPayable({
          id: payableIdentity(allocation.id, entry.beneficiaryReference),
          allocationId: allocation.id,
          paymentId: payment.id,
          beneficiaryReference: entry.beneficiaryReference,
          amount: entry.amount,
          status: "blocked",
          settlementId: null,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
        if (!payable) throw new Error("FINANCIAL_SETTLEMENT_PAYABLE_INVALID");
        return payable;
      });
      const claim = await dependencies.settlement.claimAllocation({
        allocation,
        payables,
      });
      if (claim.allocation.status === "active") return claim;

      const postings: LedgerPosting[] = [
        {
          accountReference: checkoutRevenueAccount,
          direction: "debit",
          amount: payment.amount,
        },
      ];
      if (plan.platformAmount.minorUnits > 0) {
        postings.push({
          accountReference: "revenue:platform",
          direction: "credit",
          amount: plan.platformAmount,
        });
      }
      for (const payable of payables) {
        postings.push({
          accountReference: payableAccount(payable.beneficiaryReference),
          direction: "credit",
          amount: payable.amount,
        });
      }
      const externalKey = allocationExternalKey(allocation.id);
      await dependencies.ledger.append(
        createLedgerTransaction({
          id: ledgerIdentity("allocation", allocation.id),
          externalKey,
          occurredAt,
          postings,
        }),
      );
      const active = await dependencies.settlement.activateAllocation(
        allocation.id,
        externalKey,
        occurredAt,
      );
      return Object.freeze({
        allocation: active,
        payables: await dependencies.settlement.listPayables(active.id),
        replayed: claim.replayed,
      });
    },

    async requestSettlement(payableIdInput: string) {
      const payable = await dependencies.settlement.findPayable(payableIdInput);
      if (!payable) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PAYABLE_NOT_READY",
        );
      }
      const existingAllocation = await dependencies.settlement.findAllocationByPaymentId(
        payable.paymentId,
      );
      if (!existingAllocation || existingAllocation.status !== "active") {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PAYABLE_NOT_READY",
        );
      }
      const settlementId = settlementIdentity(payable.id);
      const idempotencyKey = createFinancialSettlementIdempotencyKey(payable.id);
      if (!idempotencyKey) throw new Error("FINANCIAL_SETTLEMENT_KEY_INVALID");
      const createdAt = now(dependencies.clock);
      const settlement = normalizeFinancialSettlement({
        id: settlementId,
        payableId: payable.id,
        paymentId: payable.paymentId,
        beneficiaryReference: payable.beneficiaryReference,
        amount: payable.amount,
        idempotencyKey,
        status: "claimed",
        providerTransferReference: null,
        ledgerExternalKey: null,
        reversalLedgerExternalKey: null,
        createdAt,
        updatedAt: createdAt,
        settledAt: null,
        reversedAt: null,
      });
      if (!settlement) throw new Error("FINANCIAL_SETTLEMENT_INVALID");
      const claim = await dependencies.settlement.claimSettlement(settlement);
      if (claim.settlement.status !== "claimed") return claim;
      const command = createFinancialSettlementProviderCommand(claim.settlement);
      if (!command) throw new Error("FINANCIAL_SETTLEMENT_COMMAND_INVALID");
      const receipt = await dependencies.provider.requestTransfer(command);
      const accepted = await dependencies.settlement.acceptProvider(
        claim.settlement.id,
        receipt.providerTransferReference,
        now(dependencies.clock),
      );
      return Object.freeze({ settlement: accepted, replayed: claim.replayed });
    },

    async verifySettlement(settlementIdInput: string) {
      const settlement = await dependencies.settlement.findSettlement(
        settlementIdInput,
      );
      if (!settlement) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PROVIDER_MISMATCH",
        );
      }
      if (
        settlement.status === "settled" ||
        settlement.status === "failed" ||
        settlement.status === "reversed"
      ) {
        return Object.freeze({ settlement, disposition: "replayed" as const });
      }
      if (
        settlement.status !== "provider_accepted" ||
        !settlement.providerTransferReference
      ) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PROVIDER_MISMATCH",
        );
      }
      const snapshot = await dependencies.provider.readTransfer({
        settlementId: settlement.id,
        providerTransferReference: settlement.providerTransferReference,
      });
      if (
        !snapshot ||
        snapshot.settlementId !== settlement.id ||
        snapshot.providerTransferReference !== settlement.providerTransferReference ||
        !sameMoney(snapshot.amount, settlement.amount)
      ) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PROVIDER_MISMATCH",
        );
      }
      const serverNow = Date.parse(now(dependencies.clock));
      if (Date.parse(snapshot.observedAt) > serverNow + 5 * 60_000) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PROVIDER_FUTURE_SNAPSHOT",
        );
      }
      if (snapshot.status === "pending") {
        return Object.freeze({
          settlement,
          disposition: "pending" as const,
        });
      }
      if (snapshot.status === "failed") {
        const failed = await dependencies.settlement.finalizeSettlement({
          settlementId: settlement.id,
          status: "failed",
          ledgerExternalKey: null,
          reversalLedgerExternalKey: null,
          updatedAt: snapshot.observedAt,
        });
        return Object.freeze({ settlement: failed, disposition: "failed" as const });
      }
      if (snapshot.status === "paid") {
        const externalKey = settlementExternalKey(settlement.id);
        await dependencies.ledger.append(
          createLedgerTransaction({
            id: ledgerIdentity("settled", settlement.id),
            externalKey,
            occurredAt: snapshot.observedAt,
            postings: [
              {
                accountReference: payableAccount(settlement.beneficiaryReference),
                direction: "debit",
                amount: settlement.amount,
              },
              {
                accountReference: providerClearingAccount,
                direction: "credit",
                amount: settlement.amount,
              },
            ],
          }),
        );
        const settled = await dependencies.settlement.finalizeSettlement({
          settlementId: settlement.id,
          status: "settled",
          ledgerExternalKey: externalKey,
          reversalLedgerExternalKey: null,
          updatedAt: snapshot.observedAt,
        });
        return Object.freeze({ settlement: settled, disposition: "settled" as const });
      }
      throw new SettlementApplicationError(
        "FINANCIAL_SETTLEMENT_PROVIDER_MISMATCH",
      );
    },

    async verifySettlementReversal(settlementIdInput: string) {
      const settlement = await dependencies.settlement.findSettlement(
        settlementIdInput,
      );
      if (
        !settlement ||
        settlement.status !== "settled" ||
        !settlement.providerTransferReference
      ) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PROVIDER_MISMATCH",
        );
      }
      const snapshot = await dependencies.provider.readTransfer({
        settlementId: settlement.id,
        providerTransferReference: settlement.providerTransferReference,
      });
      if (
        !snapshot ||
        snapshot.status !== "reversed" ||
        snapshot.settlementId !== settlement.id ||
        snapshot.providerTransferReference !== settlement.providerTransferReference ||
        !sameMoney(snapshot.amount, settlement.amount)
      ) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_PROVIDER_MISMATCH",
        );
      }
      const externalKey = settlementReversalExternalKey(settlement.id);
      await dependencies.ledger.append(
        createLedgerTransaction({
          id: ledgerIdentity("settlement-reversal", settlement.id),
          externalKey,
          occurredAt: snapshot.observedAt,
          postings: [
            {
              accountReference: providerClearingAccount,
              direction: "debit",
              amount: settlement.amount,
            },
            {
              accountReference: payableAccount(settlement.beneficiaryReference),
              direction: "credit",
              amount: settlement.amount,
            },
          ],
        }),
      );
      const reversed = await dependencies.settlement.finalizeSettlement({
        settlementId: settlement.id,
        status: "reversed",
        ledgerExternalKey: settlement.ledgerExternalKey,
        reversalLedgerExternalKey: externalKey,
        updatedAt: snapshot.observedAt,
      });
      return Object.freeze({ settlement: reversed, disposition: "reversed" as const });
    },

    async reverseAllocationForRefund(paymentId: Parameters<PaymentRepositoryPort["findById"]>[0]) {
      const payment = await dependencies.payments.findById(paymentId);
      if (!payment || payment.status !== "refunded") {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_REFUND_EVIDENCE_MISSING",
        );
      }
      const refund = await dependencies.results.findByPaymentStatus(
        payment.id,
        "refunded",
      );
      if (!refund || refund.kind !== "refunded") {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_REFUND_EVIDENCE_MISSING",
        );
      }
      const refundLedger = await dependencies.ledger.findByExternalKey(
        verifiedPaymentAccountingExternalKey(refund),
      );
      if (!refundLedger) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_REFUND_EVIDENCE_MISSING",
        );
      }
      const allocation = await dependencies.settlement.findAllocationByPaymentId(
        payment.id,
      );
      if (!allocation) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_REFUND_EVIDENCE_MISSING",
        );
      }
      if (allocation.status === "reversed") {
        return Object.freeze({ allocation, disposition: "replayed" as const });
      }
      const payables = await dependencies.settlement.listPayables(allocation.id);
      if (payables.some((payable) => payable.status === "transfer_pending")) {
        throw new SettlementApplicationError(
          "FINANCIAL_SETTLEMENT_TRANSFER_UNCERTAIN",
        );
      }
      const postings: LedgerPosting[] = [];
      if (allocation.platformAmount.minorUnits > 0) {
        postings.push({
          accountReference: "revenue:platform",
          direction: "debit",
          amount: allocation.platformAmount,
        });
      }
      for (const payable of payables) {
        postings.push({
          accountReference:
            payable.status === "settled"
              ? receivableAccount(payable.beneficiaryReference)
              : payableAccount(payable.beneficiaryReference),
          direction: "debit",
          amount: payable.amount,
        });
      }
      postings.push({
        accountReference: checkoutRevenueAccount,
        direction: "credit",
        amount: payment.amount,
      });
      const externalKey = allocationReversalExternalKey(allocation.id);
      await dependencies.ledger.append(
        createLedgerTransaction({
          id: ledgerIdentity("allocation-refund", allocation.id),
          externalKey,
          occurredAt: refund.occurredAt,
          postings,
        }),
      );
      const reversed = await dependencies.settlement.reverseAllocation(
        allocation.id,
        externalKey,
        refund.occurredAt,
      );
      return Object.freeze({ allocation: reversed, disposition: "reversed" as const });
    },
  });
}

export type SettlementApplicationService = ReturnType<
  typeof createSettlementApplicationService
>;
