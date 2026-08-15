import { describe, expect, it } from "vitest";

import {
  createLedgerTransaction,
  createMoney,
  createPaymentIdempotencyKey,
  normalizeLedgerTransactionId,
  normalizePaymentId,
  normalizeReconciliationFinding,
  normalizeReconciliationFindingId,
  normalizeReconciliationRunId,
  normalizeVerifiedPaymentResult,
  type FinancialReconciliationProviderPort,
  type FinancialReconciliationRepositoryPort,
  type LedgerTransaction,
  type LedgerTransactionRepositoryPort,
  type Payment,
  type PaymentId,
  type PaymentRepositoryPort,
  type ReconciliationFinding,
  type ReconciliationFindingDraft,
  type ReconciliationFindingId,
  type ReconciliationRecordResult,
  type ReconciliationRun,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
  type VerifiedPaymentTerminalStatus,
} from "@touristic/financial";

import {
  ReconciliationApplicationError,
  createReconciliationApplicationService,
} from "./reconciliation-application-service.js";
import { verifiedPaymentAccountingExternalKey } from "./verified-payment-accounting-service.js";

function fixtures() {
  const id = normalizePaymentId("pay_reconciliation_service_0001");
  const idempotencyKey = createPaymentIdempotencyKey(
    "ord_reconciliation_service_0001",
  );
  const amount = createMoney(49_900, "BRL");
  if (!id || !idempotencyKey || !amount) throw new Error("FIXTURE_INVALID");
  const payment: Payment = {
    id,
    idempotencyKey,
    subject: { kind: "order", reference: "ord_reconciliation_service_0001" },
    amount,
    status: "confirmed",
    providerReference: "sandbox_payment_reconciliation_0001",
    createdAt: "2026-08-15T02:00:00Z",
    updatedAt: "2026-08-15T02:00:01Z",
    confirmedAt: "2026-08-15T02:00:01Z",
    refundedAt: null,
  };
  const approved = normalizeVerifiedPaymentResult({
    resultId: "fev_reconciliation_approved_0001",
    providerEventId: "pwe_reconciliation_approved_0001",
    paymentId: payment.id,
    orderReference: payment.subject.reference,
    kind: "approved",
    paymentStatus: "confirmed",
    paymentReference: payment.providerReference,
    occurredAt: "2026-08-15T02:00:01Z",
    recordedAt: "2026-08-15T02:00:02Z",
  });
  const ledgerId = normalizeLedgerTransactionId(
    "led_reconciliation_approval_0001",
  );
  if (!approved || !ledgerId) throw new Error("FIXTURE_INVALID");
  const ledger = createLedgerTransaction({
    id: ledgerId,
    externalKey: verifiedPaymentAccountingExternalKey(approved),
    occurredAt: approved.occurredAt,
    postings: [
      {
        accountReference: "asset:provider_clearing",
        direction: "debit",
        amount,
      },
      {
        accountReference: "revenue:checkout",
        direction: "credit",
        amount,
      },
    ],
  });
  return { payment, approved, ledger };
}

class MemoryPayments implements PaymentRepositoryPort {
  constructor(readonly payment: Payment | null) {}
  findById(id: PaymentId): Promise<Payment | null> {
    return Promise.resolve(this.payment?.id === id ? this.payment : null);
  }
  save(): Promise<Payment> {
    return Promise.reject(new Error("READ_ONLY_RECONCILIATION"));
  }
}

class MemoryResults implements VerifiedPaymentResultRepositoryPort {
  constructor(readonly values: readonly VerifiedPaymentResult[]) {}
  findByProviderEventId(): Promise<VerifiedPaymentResult | null> {
    return Promise.resolve(null);
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
  save(): Promise<VerifiedPaymentResult> {
    return Promise.reject(new Error("READ_ONLY_RECONCILIATION"));
  }
}

class MemoryLedger implements LedgerTransactionRepositoryPort {
  constructor(readonly values: readonly LedgerTransaction[]) {}
  append(): Promise<void> {
    return Promise.reject(new Error("READ_ONLY_RECONCILIATION"));
  }
  findByExternalKey(key: string): Promise<LedgerTransaction | null> {
    return Promise.resolve(
      this.values.find((value) => value.externalKey === key) ?? null,
    );
  }
}

class MemoryReconciliation implements FinancialReconciliationRepositoryPort {
  private readonly records = new Map<string, ReconciliationRecordResult>();
  acknowledgements: Array<{
    id: ReconciliationFindingId;
    actor: string;
    at: string;
  }> = [];

  record(input: {
    readonly run: ReconciliationRun;
    readonly findings: readonly ReconciliationFindingDraft[];
  }): Promise<ReconciliationRecordResult> {
    const existing = this.records.get(input.run.id);
    if (existing) {
      if (
        existing.run.paymentId !== input.run.paymentId ||
        existing.run.snapshotHash !== input.run.snapshotHash
      ) {
        return Promise.reject(new Error("RUN_CONFLICT"));
      }
      return Promise.resolve(
        Object.freeze({ ...existing, replayed: true as const }),
      );
    }
    const findings = input.findings.map((draft) => {
      const value = normalizeReconciliationFinding({
        ...draft,
        state: "open",
        firstSeenAt: input.run.recordedAt,
        lastSeenAt: input.run.recordedAt,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
      });
      if (!value) throw new Error("FINDING_INVALID");
      return value;
    });
    const value = Object.freeze({
      run: input.run,
      findings: Object.freeze(findings),
      replayed: false,
    });
    this.records.set(input.run.id, value);
    return Promise.resolve(value);
  }

  listOpen(): Promise<readonly ReconciliationFinding[]> {
    return Promise.resolve([]);
  }

  acknowledge(
    id: ReconciliationFindingId,
    actor: string,
    at: string,
  ): Promise<ReconciliationFinding> {
    this.acknowledgements.push({ id, actor, at });
    return Promise.reject(new Error("ACK_FIXTURE_ONLY"));
  }
}

function harness(
  options: {
    payment?: Payment | null;
    results?: readonly VerifiedPaymentResult[];
    ledger?: readonly LedgerTransaction[];
    provider?: FinancialReconciliationProviderPort;
  } = {},
) {
  const fixture = fixtures();
  const reconciliation = new MemoryReconciliation();
  let tick = 0;
  const provider =
    options.provider ??
    ({
      readPayment() {
        return Promise.resolve({
          paymentId: fixture.payment.id,
          providerPaymentReference: fixture.payment.providerReference ?? "",
          status: "paid" as const,
          amount: fixture.payment.amount,
          observedAt: "2026-08-15T02:00:03Z",
        });
      },
    } satisfies FinancialReconciliationProviderPort);
  const service = createReconciliationApplicationService({
    payments: new MemoryPayments(
      options.payment === undefined ? fixture.payment : options.payment,
    ),
    results: new MemoryResults(
      options.results === undefined ? [fixture.approved] : options.results,
    ),
    ledger: new MemoryLedger(
      options.ledger === undefined ? [fixture.ledger] : options.ledger,
    ),
    provider,
    reconciliation,
    clock: {
      now: () =>
        new Date(Date.parse("2026-08-15T02:00:04Z") + tick++).toISOString(),
    },
  });
  const runId = normalizeReconciliationRunId("rrn_reconciliation_service_0001");
  if (!runId) throw new Error("RUN_FIXTURE_INVALID");
  return { service, reconciliation, fixture, runId };
}

describe("M145 read-only reconciliation application", () => {
  it("records and exactly replays a clean provider/internal snapshot", async () => {
    const { service, runId, fixture } = harness();
    await expect(
      service.reconcilePayment(fixture.payment.id, runId),
    ).resolves.toMatchObject({
      replayed: false,
      run: { findingCount: 0 },
      findings: [],
    });
    await expect(
      service.reconcilePayment(fixture.payment.id, runId),
    ).resolves.toMatchObject({
      replayed: true,
      run: { findingCount: 0 },
      findings: [],
    });
  });

  it("persists deterministic status, amount, currency and result findings", async () => {
    const fixture = fixtures();
    const mismatchedAmount = createMoney(50_000, "USD");
    if (!mismatchedAmount) throw new Error("FIXTURE_INVALID");
    const { service, runId } = harness({
      results: [],
      ledger: [],
      provider: {
        readPayment: () =>
          Promise.resolve({
            paymentId: fixture.payment.id,
            providerPaymentReference:
              fixture.payment.providerReference ?? "missing",
            status: "refunded",
            amount: mismatchedAmount,
            observedAt: "2026-08-15T02:00:03Z",
          }),
      },
    });

    const result = await service.reconcilePayment(fixture.payment.id, runId);
    expect(result.findings.map((value) => value.kind)).toEqual([
      "amount_mismatch",
      "currency_mismatch",
      "payment_status_mismatch",
      "verified_result_missing",
    ]);
    expect(result.findings.every((value) => value.state === "open")).toBe(true);
    expect(JSON.stringify(result.findings)).not.toContain(
      fixture.payment.providerReference,
    );
  });

  it("distinguishes provider absence from provider transport failure", async () => {
    const fixture = fixtures();
    const missing = harness({
      provider: { readPayment: () => Promise.resolve(null) },
    });
    await expect(
      missing.service.reconcilePayment(fixture.payment.id, missing.runId),
    ).resolves.toMatchObject({
      findings: [{ kind: "provider_payment_not_found" }],
    });

    const unavailable = harness({
      provider: {
        readPayment: () => Promise.reject(new Error("PROVIDER_UNAVAILABLE")),
      },
    });
    await expect(
      unavailable.service.reconcilePayment(
        fixture.payment.id,
        unavailable.runId,
      ),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  });

  it("fails closed on a mismatched provider identity", async () => {
    const fixture = fixtures();
    const otherPaymentId = normalizePaymentId(
      "pay_reconciliation_service_9999",
    );
    if (!otherPaymentId) throw new Error("FIXTURE_INVALID");
    const { service, runId } = harness({
      provider: {
        readPayment: () =>
          Promise.resolve({
            paymentId: otherPaymentId,
            providerPaymentReference:
              fixture.payment.providerReference ?? "missing",
            status: "paid",
            amount: fixture.payment.amount,
            observedAt: "2026-08-15T02:00:03Z",
          }),
      },
    });

    await expect(
      service.reconcilePayment(fixture.payment.id, runId),
    ).rejects.toEqual(
      new ReconciliationApplicationError(
        "RECONCILIATION_PROVIDER_INVALID_RESPONSE",
      ),
    );
  });

  it("fails closed when the provider snapshot is materially in the future", async () => {
    const fixture = fixtures();
    const { service, runId } = harness({
      provider: {
        readPayment: () =>
          Promise.resolve({
            paymentId: fixture.payment.id,
            providerPaymentReference:
              fixture.payment.providerReference ?? "missing",
            status: "paid",
            amount: fixture.payment.amount,
            observedAt: "2026-08-15T02:05:05Z",
          }),
      },
    });

    await expect(
      service.reconcilePayment(fixture.payment.id, runId),
    ).rejects.toEqual(
      new ReconciliationApplicationError(
        "RECONCILIATION_PROVIDER_INVALID_RESPONSE",
      ),
    );
  });

  it("validates acknowledgement identity before repository mutation", async () => {
    const { service, reconciliation } = harness();
    const findingId = normalizeReconciliationFindingId(
      "rcf_reconciliation_service_0001",
    );
    if (!findingId) throw new Error("FINDING_FIXTURE_INVALID");

    await expect(service.acknowledgeFinding(findingId, " ")).rejects.toEqual(
      new ReconciliationApplicationError("RECONCILIATION_FINDING_INVALID"),
    );
    expect(reconciliation.acknowledgements).toHaveLength(0);
  });
});
