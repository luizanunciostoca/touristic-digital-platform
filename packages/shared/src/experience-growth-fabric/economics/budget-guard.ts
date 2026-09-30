export interface GrowthEconomicsInputV1 {
  readonly commerceReference: string;
  readonly currency: string;
  readonly platformNetRevenueMinorUnits: number;
  readonly affiliateCommissionMinorUnits: number;
  readonly platformRewardCostMinorUnits: number;
  readonly paymentCostMinorUnits: number;
  readonly refundCostMinorUnits: number;
  readonly promotionalSubsidyMinorUnits: number;
  readonly financialEvidenceDigest: string;
}

export interface GrowthBudgetPolicyV1 {
  readonly version: string;
  readonly currency: string;
  readonly minimumNetGrowthValueMinorUnits: number;
  readonly allowApprovedSubsidizedAcquisition: boolean;
  readonly maximumApprovedSubsidyMinorUnits: number;
}

export interface SubsidizedAcquisitionApproval {
  readonly approvalReference: string;
  readonly policyVersion: string;
  readonly maximumSubsidyMinorUnits: number;
  readonly approvedByReference: string;
}

export interface GrowthEconomicsResult {
  readonly currency: string;
  readonly netGrowthValueMinorUnits: number;
  readonly costMinorUnits: number;
  readonly evidenceDigest: string;
}

export type BudgetGuardDecision =
  | Readonly<{
      allowed: true;
      mode: "profitable" | "approved_subsidized_acquisition";
      economics: GrowthEconomicsResult;
      policyVersion: string;
      approvalReference?: string;
    }>
  | Readonly<{
      allowed: false;
      code: string;
      economics?: GrowthEconomicsResult;
      policyVersion: string;
    }>;

const SHA_256 = /^[a-f0-9]{64}$/;

function isMinorUnits(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertEconomicsInput(input: GrowthEconomicsInputV1): void {
  if (!input.commerceReference || !/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error("GROWTH_ECONOMICS_IDENTITY_INVALID");
  }
  if (!SHA_256.test(input.financialEvidenceDigest)) {
    throw new Error("GROWTH_ECONOMICS_EVIDENCE_DIGEST_INVALID");
  }

  const values = [
    input.platformNetRevenueMinorUnits,
    input.affiliateCommissionMinorUnits,
    input.platformRewardCostMinorUnits,
    input.paymentCostMinorUnits,
    input.refundCostMinorUnits,
    input.promotionalSubsidyMinorUnits,
  ];
  if (!values.every(isMinorUnits)) {
    throw new Error("GROWTH_ECONOMICS_MINOR_UNITS_INVALID");
  }
}

export function calculateGrowthEconomics(
  input: GrowthEconomicsInputV1,
): GrowthEconomicsResult {
  assertEconomicsInput(input);

  const costMinorUnits =
    input.affiliateCommissionMinorUnits +
    input.platformRewardCostMinorUnits +
    input.paymentCostMinorUnits +
    input.refundCostMinorUnits +
    input.promotionalSubsidyMinorUnits;

  if (!Number.isSafeInteger(costMinorUnits)) {
    throw new Error("GROWTH_ECONOMICS_OVERFLOW");
  }

  const netGrowthValueMinorUnits =
    input.platformNetRevenueMinorUnits - costMinorUnits;

  if (!Number.isSafeInteger(netGrowthValueMinorUnits)) {
    throw new Error("GROWTH_ECONOMICS_OVERFLOW");
  }

  return Object.freeze({
    currency: input.currency,
    netGrowthValueMinorUnits,
    costMinorUnits,
    evidenceDigest: input.financialEvidenceDigest,
  });
}

export function validateGrowthBudgetPolicy(
  policy: GrowthBudgetPolicyV1,
): GrowthBudgetPolicyV1 {
  if (!policy.version || !/^[A-Z]{3}$/.test(policy.currency)) {
    throw new Error("GROWTH_BUDGET_POLICY_IDENTITY_INVALID");
  }
  if (!Number.isSafeInteger(policy.minimumNetGrowthValueMinorUnits)) {
    throw new Error("GROWTH_BUDGET_THRESHOLD_INVALID");
  }
  if (!isMinorUnits(policy.maximumApprovedSubsidyMinorUnits)) {
    throw new Error("GROWTH_BUDGET_SUBSIDY_LIMIT_INVALID");
  }
  return policy;
}

export function evaluateGrowthBudgetGuard(
  input: GrowthEconomicsInputV1,
  policy: GrowthBudgetPolicyV1,
  approval: SubsidizedAcquisitionApproval | null,
): BudgetGuardDecision {
  validateGrowthBudgetPolicy(policy);

  if (input.currency !== policy.currency) {
    return {
      allowed: false,
      code: "GROWTH_BUDGET_CURRENCY_MISMATCH",
      policyVersion: policy.version,
    };
  }

  const economics = calculateGrowthEconomics(input);

  if (
    economics.netGrowthValueMinorUnits >=
    policy.minimumNetGrowthValueMinorUnits
  ) {
    return {
      allowed: true,
      mode: "profitable",
      economics,
      policyVersion: policy.version,
    };
  }

  if (!policy.allowApprovedSubsidizedAcquisition) {
    return {
      allowed: false,
      code: "GROWTH_BUDGET_THRESHOLD_NOT_MET",
      economics,
      policyVersion: policy.version,
    };
  }

  if (!approval) {
    return {
      allowed: false,
      code: "GROWTH_BUDGET_SUBSIDY_APPROVAL_REQUIRED",
      economics,
      policyVersion: policy.version,
    };
  }

  if (
    approval.policyVersion !== policy.version ||
    !approval.approvalReference ||
    !approval.approvedByReference
  ) {
    return {
      allowed: false,
      code: "GROWTH_BUDGET_SUBSIDY_APPROVAL_INVALID",
      economics,
      policyVersion: policy.version,
    };
  }

  if (
    !isMinorUnits(approval.maximumSubsidyMinorUnits) ||
    approval.maximumSubsidyMinorUnits >
      policy.maximumApprovedSubsidyMinorUnits
  ) {
    return {
      allowed: false,
      code: "GROWTH_BUDGET_SUBSIDY_APPROVAL_EXCEEDS_POLICY",
      economics,
      policyVersion: policy.version,
    };
  }

  const deficit =
    policy.minimumNetGrowthValueMinorUnits -
    economics.netGrowthValueMinorUnits;

  if (deficit > approval.maximumSubsidyMinorUnits) {
    return {
      allowed: false,
      code: "GROWTH_BUDGET_SUBSIDY_APPROVAL_INSUFFICIENT",
      economics,
      policyVersion: policy.version,
    };
  }

  return {
    allowed: true,
    mode: "approved_subsidized_acquisition",
    economics,
    policyVersion: policy.version,
    approvalReference: approval.approvalReference,
  };
}
