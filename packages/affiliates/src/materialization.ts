import type { CommissionEntitlement } from "./commission.js";
import {
  isEligibleForFinancialMaterialization,
  type AffiliateEligibilitySnapshot,
} from "./eligibility.js";
import type {
  AffiliateId,
  CommissionEntitlementId,
  ConversionAssociationId,
  MaterializationRequestId,
} from "./ids.js";
import { isSha256 } from "./ids.js";
import type { AffiliatePolicyV1 } from "./policy.js";

export type MaterializationState =
  | "not_requested"
  | "pending"
  | "accepted"
  | "rejected";

export interface AffiliateFinancialMaterializationRequestV1 {
  readonly requestId: MaterializationRequestId;
  readonly entitlementId: CommissionEntitlementId;
  readonly entitlementRevision: number;
  readonly affiliateId: AffiliateId;
  readonly conversionAssociationId: ConversionAssociationId;
  readonly policyVersion: AffiliatePolicyV1["version"];
  readonly entitlementDigest: string;
  readonly correlationId: string;
}

export function createFinancialMaterializationRequest(
  requestId: MaterializationRequestId,
  entitlement: CommissionEntitlement,
  entitlementDigest: string,
  correlationId: string,
  eligibility: AffiliateEligibilitySnapshot,
): AffiliateFinancialMaterializationRequestV1 | null {
  if (entitlement.status !== "earned") return null;
  if (!isEligibleForFinancialMaterialization(eligibility)) return null;
  if (!isSha256(entitlementDigest)) return null;
  if (correlationId.length < 1 || correlationId.length > 160) return null;

  return Object.freeze({
    requestId,
    entitlementId: entitlement.id,
    entitlementRevision: entitlement.revision,
    affiliateId: entitlement.affiliateId,
    conversionAssociationId: entitlement.conversionAssociationId,
    policyVersion: entitlement.policyVersion,
    entitlementDigest,
    correlationId,
  });
}

export type AffiliateFinancialMaterializationResultV1 =
  | Readonly<{
      accepted: true;
      financialReference: string;
      replayed: boolean;
    }>
  | Readonly<{
      accepted: false;
      code: string;
      retryable: boolean;
      replayed: boolean;
    }>;
