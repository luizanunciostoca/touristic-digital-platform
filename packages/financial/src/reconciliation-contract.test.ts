import { describe, expect, it } from "vitest";

import {
  createMoney,
  normalizePaymentId,
  normalizeReconciliationFinding,
  normalizeReconciliationFindingDraft,
  normalizeReconciliationProviderSnapshot,
  normalizeReconciliationRun,
} from "./index.js";

describe("M145 reconciliation contracts", () => {
  it("normalizes a bounded read-only provider snapshot", () => {
    const paymentId = normalizePaymentId("pay_reconcile_contract_0001");
    const amount = createMoney(49_900, "BRL");

    expect(
      normalizeReconciliationProviderSnapshot({
        paymentId,
        providerPaymentReference: "sandbox_payment_reconcile_0001",
        status: "paid",
        amount,
        observedAt: "2026-08-15T02:00:00.120Z",
      }),
    ).toEqual({
      paymentId,
      providerPaymentReference: "sandbox_payment_reconcile_0001",
      status: "paid",
      amount: { minorUnits: 49_900, currency: "BRL" },
      observedAt: "2026-08-15T02:00:00.120Z",
    });
  });

  it("requires deterministic hashes and bounded non-PII evidence values", () => {
    const paymentId = normalizePaymentId("pay_reconcile_contract_0001");
    const draft = normalizeReconciliationFindingDraft({
      id: "rcf_reconcile_contract_0001",
      paymentId,
      kind: "payment_status_mismatch",
      severity: "critical",
      evidenceHash: "a".repeat(64),
      expected: "confirmed",
      observed: "refunded",
    });

    expect(draft).toEqual({
      id: "rcf_reconcile_contract_0001",
      paymentId,
      kind: "payment_status_mismatch",
      severity: "critical",
      evidenceHash: "a".repeat(64),
      expected: "confirmed",
      observed: "refunded",
    });
    expect(
      normalizeReconciliationFindingDraft({
        ...draft,
        expected: "customer@example.com",
      }),
    ).toBeNull();
    expect(
      normalizeReconciliationFindingDraft({
        ...draft,
        evidenceHash: "not-a-hash",
      }),
    ).toBeNull();
  });

  it("keeps evidence immutable while validating operational state", () => {
    const paymentId = normalizePaymentId("pay_reconcile_contract_0001");
    const base = {
      id: "rcf_reconcile_contract_0001",
      paymentId,
      kind: "amount_mismatch" as const,
      severity: "critical" as const,
      evidenceHash: "b".repeat(64),
      expected: "49900:BRL",
      observed: "50000:BRL",
      firstSeenAt: "2026-08-15T02:00:00Z",
      lastSeenAt: "2026-08-15T02:01:00Z",
    };

    expect(
      normalizeReconciliationFinding({
        ...base,
        state: "acknowledged",
        acknowledgedAt: "2026-08-15T02:02:00Z",
        acknowledgedBy: "operator-123",
        resolvedAt: null,
      }),
    ).toMatchObject({
      state: "acknowledged",
      acknowledgedBy: "operator-123",
    });
    expect(
      normalizeReconciliationFinding({
        ...base,
        state: "open",
        acknowledgedAt: "2026-08-15T02:02:00Z",
        acknowledgedBy: "operator-123",
        resolvedAt: null,
      }),
    ).toBeNull();
  });

  it("normalizes an idempotent reconciliation run", () => {
    const paymentId = normalizePaymentId("pay_reconcile_contract_0001");
    expect(
      normalizeReconciliationRun({
        id: "rrn_reconcile_contract_0001",
        paymentId,
        snapshotHash: "c".repeat(64),
        observedAt: "2026-08-15T02:00:00Z",
        recordedAt: "2026-08-15T02:00:01Z",
        findingCount: 2,
      }),
    ).toEqual({
      id: "rrn_reconcile_contract_0001",
      paymentId,
      snapshotHash: "c".repeat(64),
      observedAt: "2026-08-15T02:00:00.000Z",
      recordedAt: "2026-08-15T02:00:01.000Z",
      findingCount: 2,
    });
  });
});
