import type { Attribution } from "./attribution.js";
import type {
  AffiliateId,
  AffiliateProgramId,
  AttributionId,
  ConversionAssociationId,
} from "./ids.js";
import {
  isBoundedReference,
  isCurrencyCode,
  isSha256,
  isUtcTimestamp,
} from "./ids.js";
import type { AffiliatePolicyV1 } from "./policy.js";

export interface OrderingConversionEvidence {
  readonly orderId: string;
  readonly status:
    "draft" | "pending_payment" | "payment_confirmed" | "cancelled";
  readonly contractVersion: number;
}

export interface FinancialConversionEvidence {
  readonly paymentReference: string;
  readonly paymentConfirmed: boolean;
  readonly confirmedAt: string;
  readonly eligibleRevenueMinorUnits: number;
  readonly currency: string;
  readonly evidenceDigest: string;
  readonly contractVersion: number;
}

export interface ConversionAssociation {
  readonly id: ConversionAssociationId;
  readonly attributionId: AttributionId;
  readonly affiliateId: AffiliateId;
  readonly programId: AffiliateProgramId;
  readonly orderId: string;
  readonly paymentReference: string;
  readonly financialEvidenceDigest: string;
  readonly eligibleRevenueMinorUnits: number;
  readonly currency: string;
  readonly paymentConfirmedAt: string;
  readonly serviceOccurredAt: string | null;
  readonly conversionKind: "initial_purchase";
  readonly policyVersion: AffiliatePolicyV1["version"];
  readonly createdAt: string;
}

export interface CreateConversionAssociationInput {
  readonly id: ConversionAssociationId;
  readonly attribution: Attribution;
  readonly ordering: OrderingConversionEvidence;
  readonly financial: FinancialConversionEvidence;
  readonly conversionKind: "initial_purchase" | "subscription_renewal";
  readonly serviceOccurredAt?: string;
  readonly createdAt: string;
}

export function createConversionAssociation(
  input: CreateConversionAssociationInput,
): ConversionAssociation | null {
  if (input.conversionKind !== "initial_purchase") return null;
  if (input.ordering.status !== "payment_confirmed") return null;
  if (!input.financial.paymentConfirmed) return null;
  if (!isBoundedReference(input.ordering.orderId)) return null;
  if (!isBoundedReference(input.financial.paymentReference)) return null;
  if (
    !Number.isInteger(input.ordering.contractVersion) ||
    input.ordering.contractVersion < 1
  ) {
    return null;
  }
  if (
    !Number.isInteger(input.financial.contractVersion) ||
    input.financial.contractVersion < 1
  ) {
    return null;
  }
  if (
    !Number.isSafeInteger(input.financial.eligibleRevenueMinorUnits) ||
    input.financial.eligibleRevenueMinorUnits < 0
  ) {
    return null;
  }
  if (!isCurrencyCode(input.financial.currency)) return null;
  if (!isSha256(input.financial.evidenceDigest)) return null;
  if (
    !isUtcTimestamp(input.financial.confirmedAt) ||
    !isUtcTimestamp(input.createdAt)
  ) {
    return null;
  }
  if (
    input.serviceOccurredAt !== undefined &&
    !isUtcTimestamp(input.serviceOccurredAt)
  ) {
    return null;
  }

  return Object.freeze({
    id: input.id,
    attributionId: input.attribution.id,
    affiliateId: input.attribution.affiliateId,
    programId: input.attribution.programId,
    orderId: input.ordering.orderId,
    paymentReference: input.financial.paymentReference,
    financialEvidenceDigest: input.financial.evidenceDigest,
    eligibleRevenueMinorUnits: input.financial.eligibleRevenueMinorUnits,
    currency: input.financial.currency,
    paymentConfirmedAt: input.financial.confirmedAt,
    serviceOccurredAt: input.serviceOccurredAt ?? null,
    conversionKind: "initial_purchase",
    policyVersion: input.attribution.policyVersion,
    createdAt: input.createdAt,
  });
}
