import type { ReferralEvidenceSource } from "./policy.js";
import type {
  AffiliateId,
  AttributionId,
  CommissionEntitlementId,
  ConversionAssociationId,
  ReferralEvidenceId,
} from "./ids.js";
import type { CommissionEntitlementStatus } from "./commission.js";

export interface PlatformEventEnvelopeV1<TType extends string, TPayload> {
  readonly eventId: string;
  readonly type: TType;
  readonly version: 1;
  readonly occurredAt: string;
  readonly destinationId: string;
  readonly tenantId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: TPayload;
}

export type AffiliateReferralEvidenceRecordedV1 = PlatformEventEnvelopeV1<
  "AffiliateReferralEvidenceRecorded",
  Readonly<{
    evidenceId: ReferralEvidenceId;
    affiliateId: AffiliateId;
    subjectId: string;
    source: ReferralEvidenceSource;
    evidenceFingerprint: string;
    policyVersion: "AFFILIATE-POLICY-V1";
  }>
>;

export type AffiliateAttributionEstablishedV1 = PlatformEventEnvelopeV1<
  "AffiliateAttributionEstablished",
  Readonly<{
    attributionId: AttributionId;
    affiliateId: AffiliateId;
    subjectId: string;
    evidenceId: ReferralEvidenceId;
    policyVersion: "AFFILIATE-POLICY-V1";
    expiresAt: string;
  }>
>;

export type AffiliateConversionAssociatedV1 = PlatformEventEnvelopeV1<
  "AffiliateConversionAssociated",
  Readonly<{
    conversionAssociationId: ConversionAssociationId;
    attributionId: AttributionId;
    affiliateId: AffiliateId;
    orderId: string;
    financialEvidenceDigest: string;
    policyVersion: "AFFILIATE-POLICY-V1";
  }>
>;

export type AffiliateCommissionEntitlementChangedV1 = PlatformEventEnvelopeV1<
  "AffiliateCommissionEntitlementChanged",
  Readonly<{
    entitlementId: CommissionEntitlementId;
    revision: number;
    affiliateId: AffiliateId;
    conversionAssociationId: ConversionAssociationId;
    status: CommissionEntitlementStatus;
    policyVersion: "AFFILIATE-POLICY-V1";
    entitlementDigest: string;
  }>
>;

export type AffiliateFinancialMaterializationRequestedV1 =
  PlatformEventEnvelopeV1<
    "AffiliateFinancialMaterializationRequested",
    Readonly<{
      requestId: string;
      entitlementId: CommissionEntitlementId;
      entitlementRevision: number;
      affiliateId: AffiliateId;
      conversionAssociationId: ConversionAssociationId;
      policyVersion: "AFFILIATE-POLICY-V1";
      entitlementDigest: string;
    }>
  >;
