import type { ConversionAssociation } from "./conversion.js";
import {
  isActiveForAttribution,
  type AffiliateEligibilitySnapshot,
} from "./eligibility.js";
import type {
  AffiliateId,
  AffiliateProgramId,
  AttributionId,
  CommissionEntitlementId,
  ConversionAssociationId,
} from "./ids.js";
import { isSha256, isUtcTimestamp } from "./ids.js";
import { AFFILIATE_POLICY_V1, type AffiliatePolicyV1 } from "./policy.js";

const DAY_MS = 86_400_000;

function addCalendarDaysUtc(value: string, days: number): string {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

export function calculateCommissionMinorUnits(
  eligibleRevenueMinorUnits: number,
  rateBasisPoints = AFFILIATE_POLICY_V1.commission.rateBasisPoints,
): number | null {
  if (
    !Number.isSafeInteger(eligibleRevenueMinorUnits) ||
    eligibleRevenueMinorUnits < 0 ||
    !Number.isSafeInteger(rateBasisPoints) ||
    rateBasisPoints < 0 ||
    rateBasisPoints > 10_000
  ) {
    return null;
  }

  const denominator = 10_000n;
  const numerator = BigInt(eligibleRevenueMinorUnits) * BigInt(rateBasisPoints);
  let result = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) result += 1n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(result);
}

export type CommissionEntitlementStatus =
  "pending" | "earned" | "cancelled" | "reversed" | "disputed";

export interface CommissionEntitlement {
  readonly id: CommissionEntitlementId;
  readonly revision: number;
  readonly affiliateId: AffiliateId;
  readonly programId: AffiliateProgramId;
  readonly conversionAssociationId: ConversionAssociationId;
  readonly attributionId: AttributionId;
  readonly status: CommissionEntitlementStatus;
  readonly disputedFrom: "pending" | "earned" | null;
  readonly eligibleRevenueMinorUnits: number;
  readonly commissionMinorUnits: number;
  readonly currency: string;
  readonly rateBasisPoints: 3000;
  readonly policyVersion: AffiliatePolicyV1["version"];
  readonly maturityAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function laterTimestamp(first: string, second: string | null): string {
  if (!second) return first;
  return Date.parse(second) > Date.parse(first) ? second : first;
}

export interface CreateCommissionEntitlementInput {
  readonly id: CommissionEntitlementId;
  readonly conversion: ConversionAssociation;
  readonly affiliateSuspendedAtConversion: boolean;
  readonly createdAt: string;
}

export function createCommissionEntitlement(
  input: CreateCommissionEntitlementInput,
): CommissionEntitlement | null {
  if (!isUtcTimestamp(input.createdAt)) return null;
  const commissionMinorUnits = calculateCommissionMinorUnits(
    input.conversion.eligibleRevenueMinorUnits,
  );
  if (commissionMinorUnits === null || commissionMinorUnits === 0) return null;

  const paymentMaturity = addCalendarDaysUtc(
    input.conversion.paymentConfirmedAt,
    AFFILIATE_POLICY_V1.maturity.minimumDaysAfterVerifiedPayment,
  );
  const maturityAt = laterTimestamp(
    paymentMaturity,
    input.conversion.serviceOccurredAt,
  );
  const status: CommissionEntitlementStatus =
    input.affiliateSuspendedAtConversion ? "disputed" : "pending";

  return Object.freeze({
    id: input.id,
    revision: 1,
    affiliateId: input.conversion.affiliateId,
    programId: input.conversion.programId,
    conversionAssociationId: input.conversion.id,
    attributionId: input.conversion.attributionId,
    status,
    disputedFrom: input.affiliateSuspendedAtConversion ? "pending" : null,
    eligibleRevenueMinorUnits: input.conversion.eligibleRevenueMinorUnits,
    commissionMinorUnits,
    currency: input.conversion.currency,
    rateBasisPoints: AFFILIATE_POLICY_V1.commission.rateBasisPoints,
    policyVersion: input.conversion.policyVersion,
    maturityAt,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export function canMarkEntitlementEarned(
  entitlement: CommissionEntitlement,
  eligibility: AffiliateEligibilitySnapshot,
  now: string,
): boolean {
  return (
    entitlement.status === "pending" &&
    isUtcTimestamp(now) &&
    isActiveForAttribution(eligibility) &&
    Date.parse(now) >= Date.parse(entitlement.maturityAt)
  );
}

function reviseEntitlement(
  entitlement: CommissionEntitlement,
  status: CommissionEntitlementStatus,
  disputedFrom: "pending" | "earned" | null,
  updatedAt: string,
): CommissionEntitlement | null {
  if (!isUtcTimestamp(updatedAt)) return null;
  return Object.freeze({
    ...entitlement,
    revision: entitlement.revision + 1,
    status,
    disputedFrom,
    updatedAt,
  });
}

export function markEntitlementEarned(
  entitlement: CommissionEntitlement,
  eligibility: AffiliateEligibilitySnapshot,
  now: string,
): CommissionEntitlement | null {
  if (!canMarkEntitlementEarned(entitlement, eligibility, now)) return null;
  return reviseEntitlement(entitlement, "earned", null, now);
}

export function disputeEntitlement(
  entitlement: CommissionEntitlement,
  now: string,
): CommissionEntitlement | null {
  if (entitlement.status !== "pending" && entitlement.status !== "earned") {
    return null;
  }
  return reviseEntitlement(entitlement, "disputed", entitlement.status, now);
}

export function resolveEntitlementDispute(
  entitlement: CommissionEntitlement,
  resolution: "restore" | "cancel" | "reverse",
  eligibility: AffiliateEligibilitySnapshot,
  now: string,
): CommissionEntitlement | null {
  if (entitlement.status !== "disputed" || entitlement.disputedFrom === null) {
    return null;
  }
  if (resolution === "restore") {
    if (entitlement.disputedFrom === "earned") {
      return reviseEntitlement(entitlement, "earned", null, now);
    }
    if (!isActiveForAttribution(eligibility)) return null;
    return reviseEntitlement(entitlement, "pending", null, now);
  }
  if (resolution === "cancel" && entitlement.disputedFrom === "pending") {
    return reviseEntitlement(entitlement, "cancelled", null, now);
  }
  if (resolution === "reverse" && entitlement.disputedFrom === "earned") {
    return reviseEntitlement(entitlement, "reversed", null, now);
  }
  return null;
}

export interface PendingRefundReprice {
  readonly kind: "pending_reprice";
  readonly entitlement: CommissionEntitlement;
}

export interface EarnedReversal {
  readonly kind: "earned_reversal";
  readonly entitlementId: CommissionEntitlementId;
  readonly entitlementRevision: number;
  readonly previousCommissionMinorUnits: number;
  readonly remainingCommissionMinorUnits: number;
  readonly reversalMinorUnits: number;
  readonly currency: string;
  readonly full: boolean;
  readonly refundEvidenceDigest: string;
  readonly occurredAt: string;
}

export type RefundConsequence = PendingRefundReprice | EarnedReversal;

export interface ApplyRefundInput {
  readonly entitlement: CommissionEntitlement;
  readonly updatedEligibleRevenueMinorUnits: number;
  readonly refundEvidenceDigest: string;
  readonly occurredAt: string;
}

export function applyRefundConsequence(
  input: ApplyRefundInput,
): RefundConsequence | null {
  if (
    !isSha256(input.refundEvidenceDigest) ||
    !isUtcTimestamp(input.occurredAt)
  ) {
    return null;
  }
  if (
    !Number.isSafeInteger(input.updatedEligibleRevenueMinorUnits) ||
    input.updatedEligibleRevenueMinorUnits < 0 ||
    input.updatedEligibleRevenueMinorUnits >
      input.entitlement.eligibleRevenueMinorUnits
  ) {
    return null;
  }
  const revisedCommission = calculateCommissionMinorUnits(
    input.updatedEligibleRevenueMinorUnits,
    input.entitlement.rateBasisPoints,
  );
  if (revisedCommission === null) return null;
  const delta = input.entitlement.commissionMinorUnits - revisedCommission;
  if (delta <= 0) return null;

  if (
    input.entitlement.status === "pending" ||
    (input.entitlement.status === "disputed" &&
      input.entitlement.disputedFrom === "pending")
  ) {
    const nextStatus: CommissionEntitlementStatus =
      revisedCommission === 0 ? "cancelled" : input.entitlement.status;
    const next: CommissionEntitlement = Object.freeze({
      ...input.entitlement,
      revision: input.entitlement.revision + 1,
      status: nextStatus,
      disputedFrom: nextStatus === "disputed" ? "pending" : null,
      eligibleRevenueMinorUnits: input.updatedEligibleRevenueMinorUnits,
      commissionMinorUnits: revisedCommission,
      updatedAt: input.occurredAt,
    });
    return Object.freeze({ kind: "pending_reprice", entitlement: next });
  }

  if (
    input.entitlement.status === "earned" ||
    (input.entitlement.status === "disputed" &&
      input.entitlement.disputedFrom === "earned")
  ) {
    return Object.freeze({
      kind: "earned_reversal",
      entitlementId: input.entitlement.id,
      entitlementRevision: input.entitlement.revision,
      previousCommissionMinorUnits: input.entitlement.commissionMinorUnits,
      remainingCommissionMinorUnits: revisedCommission,
      reversalMinorUnits: delta,
      currency: input.entitlement.currency,
      full: revisedCommission === 0,
      refundEvidenceDigest: input.refundEvidenceDigest,
      occurredAt: input.occurredAt,
    });
  }

  return null;
}
