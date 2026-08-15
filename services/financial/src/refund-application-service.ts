import { createHash } from "node:crypto";

import {
  createRefundIdempotencyKey,
  createRefundProviderCommand,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  normalizeRefundProviderReceipt,
  normalizeRefundRequest,
  normalizeRefundRequestId,
  type FinancialRefundProviderPort,
  type LedgerTransactionRepositoryPort,
  type PaymentId,
  type PaymentRepositoryPort,
  type RefundRequest,
  type RefundRequestRepositoryPort,
  type VerifiedPaymentResultRepositoryPort,
} from "@touristic/financial";

import { verifiedPaymentAccountingExternalKey } from "./verified-payment-accounting-service.js";

export type RefundApplicationErrorCode =
  | "REFUND_PAYMENT_NOT_FOUND"
  | "REFUND_NOT_ALLOWED"
  | "REFUND_APPROVAL_RESULT_MISSING"
  | "REFUND_APPROVAL_LEDGER_MISSING"
  | "REFUND_PROVIDER_REFERENCE_MISSING"
  | "REFUND_REQUEST_CONFLICT"
  | "REFUND_PROVIDER_INVALID_RESPONSE";

export class RefundApplicationError extends Error {
  constructor(readonly code: RefundApplicationErrorCode) {
    super(code);
    this.name = "RefundApplicationError";
  }
}

export interface RefundApplicationResult {
  readonly request: RefundRequest;
  readonly status: "AWAITING_VERIFIED_EVENT" | "COMPLETED";
  readonly replayed: boolean;
}

export interface RefundApplicationService {
  requestFullRefund(paymentId: PaymentId): Promise<RefundApplicationResult>;
}

export interface RefundApplicationServiceDependencies {
  readonly payments: PaymentRepositoryPort;
  readonly results: VerifiedPaymentResultRepositoryPort;
  readonly ledger: LedgerTransactionRepositoryPort;
  readonly refunds: RefundRequestRepositoryPort;
  readonly provider: FinancialRefundProviderPort;
  readonly clock: { now(): string };
}

function canonicalNow(clock: { now(): string }): string {
  const value = normalizeFinancialTimestamp(clock.now());
  if (!value) throw new Error("FINANCIAL_REFUND_CLOCK_INVALID");
  return new Date(value).toISOString();
}

function deterministicRefundId(paymentId: PaymentId) {
  const digest = createHash("sha256")
    .update("refund-request:v1:" + paymentId)
    .digest("hex")
    .slice(0, 32);
  const id = normalizeRefundRequestId("rfd_" + digest);
  if (!id) throw new Error("FINANCIAL_REFUND_ID_INVALID");
  return id;
}

function sameAuthority(
  request: RefundRequest,
  paymentId: PaymentId,
  approvedResultId: string,
  amount: { readonly minorUnits: number; readonly currency: string },
  providerPaymentReference: string,
): boolean {
  return (
    request.paymentId === paymentId &&
    request.approvedResultId === approvedResultId &&
    request.amount.minorUnits === amount.minorUnits &&
    request.amount.currency === amount.currency &&
    request.providerPaymentReference === providerPaymentReference
  );
}

export function createRefundApplicationService(
  dependencies: RefundApplicationServiceDependencies,
): RefundApplicationService {
  return Object.freeze({
    async requestFullRefund(
      paymentIdInput: PaymentId,
    ): Promise<RefundApplicationResult> {
      const paymentId = normalizePaymentId(paymentIdInput);
      if (!paymentId) {
        throw new RefundApplicationError("REFUND_PAYMENT_NOT_FOUND");
      }
      const payment = await dependencies.payments.findById(paymentId);
      if (!payment) {
        throw new RefundApplicationError("REFUND_PAYMENT_NOT_FOUND");
      }
      const approved = await dependencies.results.findByPaymentStatus(
        payment.id,
        "confirmed",
      );
      if (!approved || approved.kind !== "approved") {
        throw new RefundApplicationError("REFUND_APPROVAL_RESULT_MISSING");
      }
      if (
        !(await dependencies.ledger.findByExternalKey(
          verifiedPaymentAccountingExternalKey(approved),
        ))
      ) {
        throw new RefundApplicationError("REFUND_APPROVAL_LEDGER_MISSING");
      }
      const providerReference = payment.providerReference;
      if (!providerReference) {
        throw new RefundApplicationError("REFUND_PROVIDER_REFERENCE_MISSING");
      }

      const existing = await dependencies.refunds.findByPaymentId(payment.id);
      if (
        existing &&
        !sameAuthority(
          existing,
          payment.id,
          approved.resultId,
          payment.amount,
          providerReference,
        )
      ) {
        throw new RefundApplicationError("REFUND_REQUEST_CONFLICT");
      }
      if (existing?.status === "provider_accepted") {
        if (payment.status !== "confirmed" && payment.status !== "refunded") {
          throw new RefundApplicationError("REFUND_NOT_ALLOWED");
        }
        return Object.freeze({
          request: existing,
          status:
            payment.status === "refunded"
              ? ("COMPLETED" as const)
              : ("AWAITING_VERIFIED_EVENT" as const),
          replayed: true,
        });
      }
      if (payment.status !== "confirmed") {
        throw new RefundApplicationError("REFUND_NOT_ALLOWED");
      }

      const now = canonicalNow(dependencies.clock);
      const proposed = normalizeRefundRequest({
        id: deterministicRefundId(payment.id),
        idempotencyKey: createRefundIdempotencyKey(payment.id),
        paymentId: payment.id,
        approvedResultId: approved.resultId,
        amount: payment.amount,
        providerPaymentReference: providerReference,
        status: "claimed",
        providerRefundReference: null,
        createdAt: now,
        updatedAt: now,
      });
      if (!proposed) throw new Error("FINANCIAL_REFUND_REQUEST_INVALID");
      const claim = existing
        ? Object.freeze({ claimed: false, request: existing })
        : await dependencies.refunds.claim(proposed);
      if (
        !sameAuthority(
          claim.request,
          payment.id,
          approved.resultId,
          payment.amount,
          providerReference,
        )
      ) {
        throw new RefundApplicationError("REFUND_REQUEST_CONFLICT");
      }
      const command = createRefundProviderCommand({
        refundRequestId: claim.request.id,
        paymentId: claim.request.paymentId,
        idempotencyKey: claim.request.idempotencyKey,
        amount: claim.request.amount,
        providerPaymentReference: claim.request.providerPaymentReference,
        reason: "requested_by_business",
      });
      if (!command) throw new Error("FINANCIAL_REFUND_COMMAND_INVALID");
      const receipt = normalizeRefundProviderReceipt(
        await dependencies.provider.requestRefund(command),
      );
      if (!receipt) {
        throw new RefundApplicationError("REFUND_PROVIDER_INVALID_RESPONSE");
      }
      const accepted = await dependencies.refunds.acceptProvider(
        claim.request.id,
        receipt.providerRefundReference,
        canonicalNow(dependencies.clock),
      );
      const latest = await dependencies.payments.findById(payment.id);
      return Object.freeze({
        request: accepted,
        status:
          latest?.status === "refunded"
            ? ("COMPLETED" as const)
            : ("AWAITING_VERIFIED_EVENT" as const),
        replayed: !claim.claimed,
      });
    },
  });
}
