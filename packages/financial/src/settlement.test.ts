import { describe, expect, it } from "vitest";

import { createMoney } from "./index.js";
import {
  allocationPlanTotal,
  createFinancialSettlementIdempotencyKey,
  createFinancialSettlementProviderCommand,
  normalizeFinancialAllocation,
  normalizeFinancialAllocationPlan,
  normalizeFinancialPayable,
  normalizeFinancialSettlement,
  normalizeFinancialSettlementProviderSnapshot,
} from "./settlement.js";

function brl(minorUnits: number) {
  const value = createMoney(minorUnits, "BRL");
  if (!value) throw new Error("TEST_MONEY_INVALID");
  return value;
}

describe("M146 settlement domain", () => {
  it("canonicalizes allocation plans and rejects duplicate beneficiaries", () => {
    const plan = normalizeFinancialAllocationPlan({
      platformAmount: brl(1_500),
      beneficiaries: [
        { beneficiaryReference: "business_b", amount: brl(3_500) },
        { beneficiaryReference: "business_a", amount: brl(5_000) },
      ],
    });
    expect(plan).toEqual({
      platformAmount: brl(1_500),
      beneficiaries: [
        { beneficiaryReference: "business_a", amount: brl(5_000) },
        { beneficiaryReference: "business_b", amount: brl(3_500) },
      ],
    });
    if (!plan) throw new Error("TEST_PLAN_INVALID");
    expect(allocationPlanTotal(plan)).toEqual(brl(10_000));
    expect(
      normalizeFinancialAllocationPlan({
        platformAmount: brl(1_000),
        beneficiaries: [
          { beneficiaryReference: "business_a", amount: brl(4_000) },
          { beneficiaryReference: "business_a", amount: brl(5_000) },
        ],
      }),
    ).toBeNull();
  });

  it("requires ledger evidence before an allocation is active", () => {
    expect(
      normalizeFinancialAllocation({
        id: "alc_12345678",
        paymentId: "pay_12345678",
        reconciliationRunId: "rrn_12345678",
        grossAmount: brl(10_000),
        platformAmount: brl(1_000),
        allocationHash: "a".repeat(64),
        status: "active",
        ledgerExternalKey: "allocation_v1_pay_12345678",
        reversalLedgerExternalKey: null,
        createdAt: "2026-08-15T04:00:00Z",
        updatedAt: "2026-08-15T04:00:01Z",
        reversedAt: null,
      }),
    ).toMatchObject({ status: "active" });
    expect(
      normalizeFinancialAllocation({
        id: "alc_12345678",
        paymentId: "pay_12345678",
        reconciliationRunId: "rrn_12345678",
        grossAmount: brl(10_000),
        platformAmount: brl(1_000),
        allocationHash: "a".repeat(64),
        status: "active",
        ledgerExternalKey: null,
        reversalLedgerExternalKey: null,
        createdAt: "2026-08-15T04:00:00Z",
        updatedAt: "2026-08-15T04:00:01Z",
        reversedAt: null,
      }),
    ).toBeNull();
  });

  it("ties transfer idempotency to one payable", () => {
    const key = createFinancialSettlementIdempotencyKey("pbl_12345678");
    expect(key).toBe("settlement:v1:pbl_12345678");
    expect(
      createFinancialSettlementProviderCommand({
        settlementId: "stl_12345678",
        payableId: "pbl_12345678",
        paymentId: "pay_12345678",
        beneficiaryReference: "business_a",
        amount: brl(9_000),
        idempotencyKey: key,
      }),
    ).toMatchObject({ idempotencyKey: key });
  });

  it("keeps provider acceptance non-authoritative", () => {
    const accepted = normalizeFinancialSettlement({
      id: "stl_12345678",
      payableId: "pbl_12345678",
      paymentId: "pay_12345678",
      beneficiaryReference: "business_a",
      amount: brl(9_000),
      idempotencyKey: "settlement:v1:pbl_12345678",
      status: "provider_accepted",
      providerTransferReference: "provider-transfer-1",
      ledgerExternalKey: null,
      reversalLedgerExternalKey: null,
      createdAt: "2026-08-15T04:00:00Z",
      updatedAt: "2026-08-15T04:00:01Z",
      settledAt: null,
      reversedAt: null,
    });
    expect(accepted?.status).toBe("provider_accepted");
    expect(accepted?.settledAt).toBeNull();
  });

  it("requires provider snapshot identity, amount and timestamp", () => {
    expect(
      normalizeFinancialSettlementProviderSnapshot({
        settlementId: "stl_12345678",
        providerTransferReference: "provider-transfer-1",
        status: "paid",
        amount: brl(9_000),
        observedAt: "2026-08-15T04:05:00Z",
      }),
    ).toMatchObject({ status: "paid", amount: brl(9_000) });
    expect(
      normalizeFinancialSettlementProviderSnapshot({
        settlementId: "bad",
        providerTransferReference: "provider-transfer-1",
        status: "paid",
        amount: brl(9_000),
        observedAt: "2026-08-15T04:05:00Z",
      }),
    ).toBeNull();
  });

  it("requires settlement identity once a payable leaves ready state", () => {
    expect(
      normalizeFinancialPayable({
        id: "pbl_12345678",
        allocationId: "alc_12345678",
        paymentId: "pay_12345678",
        beneficiaryReference: "business_a",
        amount: brl(9_000),
        status: "ready",
        settlementId: null,
        createdAt: "2026-08-15T04:00:00Z",
        updatedAt: "2026-08-15T04:00:01Z",
      }),
    ).toMatchObject({ status: "ready" });
    expect(
      normalizeFinancialPayable({
        id: "pbl_12345678",
        allocationId: "alc_12345678",
        paymentId: "pay_12345678",
        beneficiaryReference: "business_a",
        amount: brl(9_000),
        status: "settled",
        settlementId: null,
        createdAt: "2026-08-15T04:00:00Z",
        updatedAt: "2026-08-15T04:00:01Z",
      }),
    ).toBeNull();
  });
});
