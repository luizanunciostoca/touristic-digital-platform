import { createHash } from "node:crypto";

import {
  normalizeFinancialTimestamp,
  normalizePaymentId,
  normalizeReconciliationFindingDraft,
  normalizeReconciliationFindingId,
  normalizeReconciliationProviderSnapshot,
  normalizeReconciliationRun,
  normalizeReconciliationRunId,
  type FinancialReconciliationProviderPort,
  type FinancialReconciliationRepositoryPort,
  type LedgerTransactionRepositoryPort,
  type Payment,
  type PaymentId,
  type PaymentRepositoryPort,
  type ReconciliationFinding,
  type ReconciliationFindingDraft,
  type ReconciliationFindingId,
  type ReconciliationFindingKind,
  type ReconciliationProviderSnapshot,
  type ReconciliationRecordResult,
  type ReconciliationRunId,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
  type VerifiedPaymentTerminalStatus,
} from "@touristic/financial";

import { verifiedPaymentAccountingExternalKey } from "./verified-payment-accounting-service.js";

export type ReconciliationApplicationErrorCode =
  | "RECONCILIATION_PAYMENT_NOT_FOUND"
  | "RECONCILIATION_PROVIDER_REFERENCE_MISSING"
  | "RECONCILIATION_PROVIDER_INVALID_RESPONSE"
  | "RECONCILIATION_RUN_INVALID"
  | "RECONCILIATION_FINDING_INVALID";

export class ReconciliationApplicationError extends Error {
  constructor(readonly code: ReconciliationApplicationErrorCode) {
    super(code);
    this.name = "ReconciliationApplicationError";
  }
}

export interface ReconciliationApplicationService {
  reconcilePayment(
    paymentId: PaymentId,
    runId: ReconciliationRunId,
  ): Promise<ReconciliationRecordResult>;
  listOpenFindings(
    paymentId: PaymentId,
  ): Promise<readonly ReconciliationFinding[]>;
  acknowledgeFinding(
    findingId: ReconciliationFindingId,
    actorSubject: string,
  ): Promise<ReconciliationFinding>;
}

export interface ReconciliationApplicationServiceDependencies {
  readonly payments: PaymentRepositoryPort;
  readonly results: VerifiedPaymentResultRepositoryPort;
  readonly ledger: LedgerTransactionRepositoryPort;
  readonly provider: FinancialReconciliationProviderPort;
  readonly reconciliation: FinancialReconciliationRepositoryPort;
  readonly clock: { now(): string };
}

function canonicalNow(clock: { now(): string }): string {
  const value = normalizeFinancialTimestamp(clock.now());
  if (!value) throw new Error("FINANCIAL_RECONCILIATION_CLOCK_INVALID");
  return new Date(value).toISOString();
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function findingId(
  paymentId: PaymentId,
  kind: ReconciliationFindingKind,
  evidenceHash: string,
): ReconciliationFindingId {
  const id = normalizeReconciliationFindingId(
    "rcf_" +
      hash(["reconciliation-finding:v1", paymentId, kind, evidenceHash]).slice(
        0,
        32,
      ),
  );
  if (!id) throw new Error("FINANCIAL_RECONCILIATION_FINDING_ID_INVALID");
  return id;
}

function finding(
  paymentId: PaymentId,
  kind: ReconciliationFindingKind,
  expected: string,
  observed: string,
  severity: "warning" | "critical" = "critical",
): ReconciliationFindingDraft {
  const evidenceHash = hash([paymentId, kind, expected, observed]);
  const value = normalizeReconciliationFindingDraft({
    id: findingId(paymentId, kind, evidenceHash),
    paymentId,
    kind,
    severity,
    evidenceHash,
    expected,
    observed,
  });
  if (!value) {
    throw new ReconciliationApplicationError("RECONCILIATION_FINDING_INVALID");
  }
  return value;
}

function expectedProviderStatus(payment: Payment): string {
  if (payment.status === "confirmed") return "paid";
  return payment.status;
}

function expectedResultStatuses(
  payment: Payment,
): readonly VerifiedPaymentTerminalStatus[] {
  if (payment.status === "pending") return [];
  return payment.status === "refunded"
    ? (["confirmed", "refunded"] as const)
    : [payment.status];
}

async function resultEvidence(
  repository: VerifiedPaymentResultRepositoryPort,
  payment: Payment,
): Promise<{
  readonly expected: readonly VerifiedPaymentTerminalStatus[];
  readonly present: readonly VerifiedPaymentResult[];
  readonly missing: readonly VerifiedPaymentTerminalStatus[];
}> {
  const expected = expectedResultStatuses(payment);
  const loaded = await Promise.all(
    expected.map((status) =>
      repository.findByPaymentStatus(payment.id, status),
    ),
  );
  const present = loaded.filter(
    (value): value is VerifiedPaymentResult => value !== null,
  );
  const missing = expected.filter(
    (status) => !present.some((value) => value.paymentStatus === status),
  );
  return Object.freeze({ expected, present, missing });
}

function snapshotValue(snapshot: ReconciliationProviderSnapshot | null) {
  return snapshot
    ? {
        status: snapshot.status,
        minorUnits: snapshot.amount.minorUnits,
        currency: snapshot.amount.currency,
        observedAt: snapshot.observedAt,
      }
    : { status: "provider_payment_not_found" };
}

export function createReconciliationApplicationService(
  dependencies: ReconciliationApplicationServiceDependencies,
): ReconciliationApplicationService {
  return Object.freeze({
    async reconcilePayment(
      paymentIdInput: PaymentId,
      runIdInput: ReconciliationRunId,
    ): Promise<ReconciliationRecordResult> {
      const paymentId = normalizePaymentId(paymentIdInput);
      const runId = normalizeReconciliationRunId(runIdInput);
      if (!runId) {
        throw new ReconciliationApplicationError("RECONCILIATION_RUN_INVALID");
      }
      if (!paymentId) {
        throw new ReconciliationApplicationError(
          "RECONCILIATION_PAYMENT_NOT_FOUND",
        );
      }
      const payment = await dependencies.payments.findById(paymentId);
      if (!payment) {
        throw new ReconciliationApplicationError(
          "RECONCILIATION_PAYMENT_NOT_FOUND",
        );
      }
      if (!payment.providerReference) {
        throw new ReconciliationApplicationError(
          "RECONCILIATION_PROVIDER_REFERENCE_MISSING",
        );
      }

      const recordedAt = canonicalNow(dependencies.clock);
      const rawSnapshot = await dependencies.provider.readPayment({
        paymentId: payment.id,
        providerPaymentReference: payment.providerReference,
      });
      const snapshot =
        rawSnapshot === null
          ? null
          : normalizeReconciliationProviderSnapshot(rawSnapshot);
      if (
        rawSnapshot !== null &&
        (!snapshot ||
          snapshot.paymentId !== payment.id ||
          snapshot.providerPaymentReference !== payment.providerReference ||
          Date.parse(snapshot.observedAt) > Date.parse(recordedAt) + 5 * 60_000)
      ) {
        throw new ReconciliationApplicationError(
          "RECONCILIATION_PROVIDER_INVALID_RESPONSE",
        );
      }

      const evidence = await resultEvidence(dependencies.results, payment);
      const ledgerPresence = new Map<string, boolean>();
      for (const result of evidence.present) {
        if (result.kind !== "approved" && result.kind !== "refunded") continue;
        ledgerPresence.set(
          result.resultId,
          Boolean(
            await dependencies.ledger.findByExternalKey(
              verifiedPaymentAccountingExternalKey(result),
            ),
          ),
        );
      }

      const findings: ReconciliationFindingDraft[] = [];
      if (!snapshot) {
        findings.push(
          finding(
            payment.id,
            "provider_payment_not_found",
            "provider:present",
            "provider:missing",
          ),
        );
      } else {
        const expectedStatus = expectedProviderStatus(payment);
        if (snapshot.status !== expectedStatus) {
          findings.push(
            finding(
              payment.id,
              "payment_status_mismatch",
              "status:" + expectedStatus,
              "status:" + snapshot.status,
            ),
          );
        }
        if (snapshot.amount.minorUnits !== payment.amount.minorUnits) {
          findings.push(
            finding(
              payment.id,
              "amount_mismatch",
              "minor:" + payment.amount.minorUnits,
              "minor:" + snapshot.amount.minorUnits,
            ),
          );
        }
        if (snapshot.amount.currency !== payment.amount.currency) {
          findings.push(
            finding(
              payment.id,
              "currency_mismatch",
              "currency:" + payment.amount.currency,
              "currency:" + snapshot.amount.currency,
            ),
          );
        }
      }

      if (evidence.missing.length > 0) {
        findings.push(
          finding(
            payment.id,
            "verified_result_missing",
            "results:" + evidence.expected.join("."),
            "missing:" + evidence.missing.join("."),
          ),
        );
      }
      const approval = evidence.present.find(
        (value) => value.kind === "approved",
      );
      if (approval && ledgerPresence.get(approval.resultId) === false) {
        findings.push(
          finding(
            payment.id,
            "approval_ledger_missing",
            "approval-ledger:present",
            "approval-ledger:missing",
          ),
        );
      }
      const refund = evidence.present.find(
        (value) => value.kind === "refunded",
      );
      if (refund && ledgerPresence.get(refund.resultId) === false) {
        findings.push(
          finding(
            payment.id,
            "refund_ledger_missing",
            "refund-ledger:present",
            "refund-ledger:missing",
          ),
        );
      }

      findings.sort((left, right) => left.kind.localeCompare(right.kind));
      const observedAt = snapshot?.observedAt ?? recordedAt;
      const snapshotHash = hash({
        payment: {
          id: payment.id,
          status: payment.status,
          amount: payment.amount,
        },
        provider: snapshotValue(snapshot),
        results: evidence.present.map((value) => ({
          id: value.resultId,
          kind: value.kind,
          status: value.paymentStatus,
          ledger: ledgerPresence.get(value.resultId) ?? null,
        })),
        missing: evidence.missing,
      });
      const run = normalizeReconciliationRun({
        id: runId,
        paymentId: payment.id,
        snapshotHash,
        observedAt,
        recordedAt,
        findingCount: findings.length,
      });
      if (!run) {
        throw new ReconciliationApplicationError("RECONCILIATION_RUN_INVALID");
      }
      return dependencies.reconciliation.record({ run, findings });
    },

    async listOpenFindings(
      paymentIdInput: PaymentId,
    ): Promise<readonly ReconciliationFinding[]> {
      const paymentId = normalizePaymentId(paymentIdInput);
      if (!paymentId) {
        throw new ReconciliationApplicationError(
          "RECONCILIATION_PAYMENT_NOT_FOUND",
        );
      }
      if (!(await dependencies.payments.findById(paymentId))) {
        throw new ReconciliationApplicationError(
          "RECONCILIATION_PAYMENT_NOT_FOUND",
        );
      }
      return dependencies.reconciliation.listOpen(paymentId);
    },

    async acknowledgeFinding(
      findingIdInput: ReconciliationFindingId,
      actorSubject: string,
    ): Promise<ReconciliationFinding> {
      const findingId = normalizeReconciliationFindingId(findingIdInput);
      const actor = actorSubject.trim();
      if (!findingId || !actor || actor.length > 200) {
        throw new ReconciliationApplicationError(
          "RECONCILIATION_FINDING_INVALID",
        );
      }
      return dependencies.reconciliation.acknowledge(
        findingId,
        actor,
        canonicalNow(dependencies.clock),
      );
    },
  });
}
