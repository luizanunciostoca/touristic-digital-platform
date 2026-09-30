import { describe, expect, it } from "vitest";

import {
  calculateGrowthEconomics,
  evaluateGrowthBudgetGuard,
} from "./budget-guard.js";

const evidenceDigest = "a".repeat(64);

const base = {
  commerceReference: "order_00000001",
  currency: "BRL",
  platformNetRevenueMinorUnits: 10000,
  affiliateCommissionMinorUnits: 3000,
  platformRewardCostMinorUnits: 1000,
  paymentCostMinorUnits: 500,
  refundCostMinorUnits: 0,
  promotionalSubsidyMinorUnits: 0,
  financialEvidenceDigest: evidenceDigest,
};

const policy = {
  version: "GROWTH-BUDGET-V1",
  currency: "BRL",
  minimumNetGrowthValueMinorUnits: 1000,
  allowApprovedSubsidizedAcquisition: false,
  maximumApprovedSubsidyMinorUnits: 0,
};

describe("growth budget guard", () => {
  it("calculates NET_GROWTH_VALUE deterministically from minor units", () => {
    const result = calculateGrowthEconomics(base);

    expect(result.costMinorUnits).toBe(4500);
    expect(result.netGrowthValueMinorUnits).toBe(5500);
    expect(result.evidenceDigest).toBe(evidenceDigest);
  });

  it("allows profitable growth when the configured threshold is met", () => {
    const decision = evaluateGrowthBudgetGuard(base, policy, null);

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.mode).toBe("profitable");
    expect(decision.economics.netGrowthValueMinorUnits).toBe(5500);
  });

  it("fails closed when costs reduce value below threshold", () => {
    const decision = evaluateGrowthBudgetGuard(
      {
        ...base,
        platformRewardCostMinorUnits: 7000,
      },
      policy,
      null,
    );

    expect(decision).toMatchObject({
      allowed: false,
      code: "GROWTH_BUDGET_THRESHOLD_NOT_MET",
    });
  });

  it("requires explicit policy and approval for subsidized acquisition", () => {
    const subsidizedPolicy = {
      ...policy,
      allowApprovedSubsidizedAcquisition: true,
      maximumApprovedSubsidyMinorUnits: 4000,
    };
    const expensive = {
      ...base,
      platformRewardCostMinorUnits: 7000,
    };

    const withoutApproval = evaluateGrowthBudgetGuard(
      expensive,
      subsidizedPolicy,
      null,
    );
    expect(withoutApproval).toMatchObject({
      allowed: false,
      code: "GROWTH_BUDGET_SUBSIDY_APPROVAL_REQUIRED",
    });

    const approved = evaluateGrowthBudgetGuard(
      expensive,
      subsidizedPolicy,
      {
        approvalReference: "approval_00000001",
        policyVersion: subsidizedPolicy.version,
        maximumSubsidyMinorUnits: 3500,
        approvedByReference: "growth_control_plane_0001",
      },
    );

    expect(approved.allowed).toBe(true);
    if (!approved.allowed) return;
    expect(approved.mode).toBe("approved_subsidized_acquisition");
    expect(approved.approvalReference).toBe("approval_00000001");
  });

  it("rejects currency mismatch and approval above policy cap", () => {
    const mismatch = evaluateGrowthBudgetGuard(
      { ...base, currency: "USD" },
      policy,
      null,
    );
    expect(mismatch).toMatchObject({
      allowed: false,
      code: "GROWTH_BUDGET_CURRENCY_MISMATCH",
    });

    const subsidizedPolicy = {
      ...policy,
      allowApprovedSubsidizedAcquisition: true,
      maximumApprovedSubsidyMinorUnits: 2000,
    };
    const tooLarge = evaluateGrowthBudgetGuard(
      { ...base, platformRewardCostMinorUnits: 7000 },
      subsidizedPolicy,
      {
        approvalReference: "approval_00000002",
        policyVersion: subsidizedPolicy.version,
        maximumSubsidyMinorUnits: 3000,
        approvedByReference: "growth_control_plane_0001",
      },
    );

    expect(tooLarge).toMatchObject({
      allowed: false,
      code: "GROWTH_BUDGET_SUBSIDY_APPROVAL_EXCEEDS_POLICY",
    });
  });

  it("rejects floating-point monetary inputs", () => {
    expect(() =>
      calculateGrowthEconomics({
        ...base,
        paymentCostMinorUnits: 12.5,
      }),
    ).toThrow("GROWTH_ECONOMICS_MINOR_UNITS_INVALID");
  });
});
