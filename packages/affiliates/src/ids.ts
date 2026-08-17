const ID_SUFFIX = "[A-Za-z0-9_-]{8,120}";
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HEX_256 = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;

export type AffiliateId = string & { readonly __brand: "AffiliateId" };
export type AffiliateProgramId = string & {
  readonly __brand: "AffiliateProgramId";
};
export type AffiliateMembershipId = string & {
  readonly __brand: "AffiliateMembershipId";
};
export type AcquisitionSubjectId = string & {
  readonly __brand: "AcquisitionSubjectId";
};
export type ReferralEvidenceId = string & {
  readonly __brand: "ReferralEvidenceId";
};
export type AttributionId = string & { readonly __brand: "AttributionId" };
export type ConversionAssociationId = string & {
  readonly __brand: "ConversionAssociationId";
};
export type CommissionEntitlementId = string & {
  readonly __brand: "CommissionEntitlementId";
};
export type MaterializationRequestId = string & {
  readonly __brand: "MaterializationRequestId";
};

function normalizePrefixedId<T extends string>(
  value: string,
  prefix: string,
): T | null {
  const pattern = new RegExp(`^${prefix}${ID_SUFFIX}$`);
  return pattern.test(value) ? (value as T) : null;
}

export function normalizeAffiliateId(value: string): AffiliateId | null {
  return normalizePrefixedId<AffiliateId>(value, "aff_");
}

export function normalizeAffiliateProgramId(
  value: string,
): AffiliateProgramId | null {
  return normalizePrefixedId<AffiliateProgramId>(value, "apg_");
}

export function normalizeAffiliateMembershipId(
  value: string,
): AffiliateMembershipId | null {
  return normalizePrefixedId<AffiliateMembershipId>(value, "afm_");
}

export function normalizeAcquisitionSubjectId(
  value: string,
): AcquisitionSubjectId | null {
  return normalizePrefixedId<AcquisitionSubjectId>(value, "asub_");
}

export function normalizeReferralEvidenceId(
  value: string,
): ReferralEvidenceId | null {
  return normalizePrefixedId<ReferralEvidenceId>(value, "afev_");
}

export function normalizeAttributionId(value: string): AttributionId | null {
  return normalizePrefixedId<AttributionId>(value, "attr_");
}

export function normalizeConversionAssociationId(
  value: string,
): ConversionAssociationId | null {
  return normalizePrefixedId<ConversionAssociationId>(value, "aconv_");
}

export function normalizeCommissionEntitlementId(
  value: string,
): CommissionEntitlementId | null {
  return normalizePrefixedId<CommissionEntitlementId>(value, "aent_");
}

export function normalizeMaterializationRequestId(
  value: string,
): MaterializationRequestId | null {
  return normalizePrefixedId<MaterializationRequestId>(value, "amreq_");
}

export function isUtcTimestamp(value: string): boolean {
  if (!UTC_TIMESTAMP.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

export function isSha256(value: string): boolean {
  return HEX_256.test(value);
}

export function isCurrencyCode(value: string): boolean {
  return CURRENCY.test(value);
}

export function isBoundedReference(value: string): boolean {
  return value.length >= 1 && value.length <= 160;
}
