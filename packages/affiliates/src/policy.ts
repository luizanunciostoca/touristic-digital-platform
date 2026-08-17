export type ReferralEvidenceSource =
  "checkout_code" | "server_referral" | "platform_link" | "platform_qr";

export type CommissionModel = "percentage";
export type CommissionBaseAuthority = "financial_net_eligible_platform_revenue";
export type CommissionRounding = "half_up_minor_unit";

export interface AffiliatePolicyV1 {
  readonly version: "AFFILIATE-POLICY-V1";
  readonly approvedAt: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: null;
  readonly attributionWindowDays: 30;
  readonly commission: Readonly<{
    model: CommissionModel;
    baseAuthority: CommissionBaseAuthority;
    rateBasisPoints: 3000;
    rounding: CommissionRounding;
    capMinorUnits: null;
    minimumMinorUnits: null;
    subscriptionRenewalsEligible: false;
  }>;
  readonly maturity: Readonly<{
    minimumDaysAfterVerifiedPayment: 7;
    notBeforeServiceOccurrence: true;
  }>;
  readonly retention: Readonly<{
    rawReferralEvidenceDays: 90;
    pseudonymousAttributionMonths: 24;
    commercialEvidenceYears: 5;
  }>;
  readonly referralPrecedence: Readonly<Record<ReferralEvidenceSource, number>>;
}

export const AFFILIATE_POLICY_V1: AffiliatePolicyV1 = Object.freeze({
  version: "AFFILIATE-POLICY-V1",
  approvedAt: "2026-08-17T21:02:00Z",
  effectiveFrom: "2026-08-17T21:02:00Z",
  effectiveUntil: null,
  attributionWindowDays: 30,
  commission: Object.freeze({
    model: "percentage",
    baseAuthority: "financial_net_eligible_platform_revenue",
    rateBasisPoints: 3000,
    rounding: "half_up_minor_unit",
    capMinorUnits: null,
    minimumMinorUnits: null,
    subscriptionRenewalsEligible: false,
  }),
  maturity: Object.freeze({
    minimumDaysAfterVerifiedPayment: 7,
    notBeforeServiceOccurrence: true,
  }),
  retention: Object.freeze({
    rawReferralEvidenceDays: 90,
    pseudonymousAttributionMonths: 24,
    commercialEvidenceYears: 5,
  }),
  referralPrecedence: Object.freeze({
    checkout_code: 300,
    server_referral: 200,
    platform_link: 100,
    platform_qr: 100,
  }),
});
