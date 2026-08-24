import type { Attribution, ReferralEvidence } from "./attribution.js";
import type { CommissionEntitlement } from "./commission.js";
import type { ConversionAssociation } from "./conversion.js";
import type { AffiliateEligibilitySnapshot } from "./eligibility.js";
import type {
  AcquisitionSubjectId,
  AffiliateId,
  AffiliateProgramId,
  CommissionEntitlementId,
  ConversionAssociationId,
} from "./ids.js";
import type {
  AffiliateFinancialMaterializationRequestV1,
  AffiliateFinancialMaterializationResultV1,
} from "./materialization.js";
import type { ReferralEvidenceSource } from "./policy.js";

export type AffiliateAuthorizationAction =
  | "affiliate.manage_identity"
  | "affiliate.manage_membership"
  | "affiliate.record_referral_evidence"
  | "affiliate.establish_attribution"
  | "affiliate.associate_conversion"
  | "affiliate.change_entitlement"
  | "affiliate.request_financial_materialization"
  | "affiliate.request_privacy_data"
  | "affiliate.anonymize_privacy_data"
  | "affiliate.execute_retention"
  | "affiliate.manage_legal_hold"
  | "affiliate.administer";

export interface AffiliateAuthorizationContext {
  readonly actorKind: "service" | "platform_admin" | "affiliate" | "public";
  readonly actorReference: string;
  readonly affiliateId?: AffiliateId;
  readonly programId?: AffiliateProgramId;
  readonly correlationId: string;
}

export interface AffiliateAuthorizationPort {
  authorize(
    action: AffiliateAuthorizationAction,
    context: AffiliateAuthorizationContext,
  ): Promise<Readonly<{ allowed: boolean; decisionReference: string }>>;
}

export interface AffiliateEligibilityPort {
  resolveEligibility(
    affiliateId: AffiliateId,
    programId: AffiliateProgramId,
  ): Promise<AffiliateEligibilitySnapshot | null>;
}

export interface AffiliateOrderingEvidencePort {
  getOrderEvidence(orderId: string): Promise<Readonly<{
    orderId: string;
    status: "draft" | "pending_payment" | "payment_confirmed" | "cancelled";
    contractVersion: number;
  }> | null>;
}

export interface AffiliateFinancialEvidencePort {
  getConversionEvidence(orderId: string): Promise<Readonly<{
    paymentReference: string;
    paymentConfirmed: boolean;
    confirmedAt: string;
    eligibleRevenueMinorUnits: number;
    currency: string;
    evidenceDigest: string;
    contractVersion: number;
  }> | null>;
}

export interface AffiliateFinancialMaterializationPort {
  requestMaterialization(
    request: AffiliateFinancialMaterializationRequestV1,
  ): Promise<AffiliateFinancialMaterializationResultV1>;

  readMaterialization(
    requestId: string,
  ): Promise<AffiliateFinancialMaterializationResultV1 | null>;
}

export type AffiliateReferralEvidenceVerificationResult =
  | Readonly<{
      accepted: true;
      canonicalEvidence: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{
      accepted: false;
      code: string;
    }>;

export interface AffiliateReferralEvidenceVerificationPort {
  verify(
    input: Readonly<{
      source: ReferralEvidenceSource;
      affiliateId: AffiliateId;
      programId: AffiliateProgramId;
      subjectId: AcquisitionSubjectId;
      evidence: unknown;
    }>,
  ): Promise<AffiliateReferralEvidenceVerificationResult>;
}

export interface ReferralEvidenceRepositoryPort {
  findByFingerprint(fingerprint: string): Promise<ReferralEvidence | null>;
  save(evidence: ReferralEvidence): Promise<ReferralEvidence>;
}

export interface AttributionRepositoryPort {
  findActiveBySubject(subjectId: string): Promise<Attribution | null>;
  save(attribution: Attribution): Promise<Attribution>;
}

export interface ConversionAssociationRepositoryPort {
  findByOrderId(orderId: string): Promise<ConversionAssociation | null>;
  save(conversion: ConversionAssociation): Promise<ConversionAssociation>;
}

export interface CommissionEntitlementRepositoryPort {
  findById(id: CommissionEntitlementId): Promise<CommissionEntitlement | null>;
  findByConversionId(
    conversionId: ConversionAssociationId,
  ): Promise<CommissionEntitlement | null>;
  saveRevision(
    entitlement: CommissionEntitlement,
  ): Promise<CommissionEntitlement>;
}

export type AffiliateIdempotencyClaim =
  | Readonly<{ status: "claimed" }>
  | Readonly<{ status: "replayed"; semanticDigest: string }>
  | Readonly<{ status: "conflict"; semanticDigest: string }>;

export interface AffiliateIdempotencyPort {
  claim(
    key: string,
    semanticDigest: string,
  ): Promise<AffiliateIdempotencyClaim>;
}

export interface AffiliateDigestPort {
  sha256(canonicalInput: string): Promise<string>;
}

export interface AffiliateAuditEntry {
  readonly auditId: string;
  readonly operation: string;
  readonly contractVersion: number;
  readonly actorKind: string;
  readonly actorReference: string;
  readonly authorizationDecisionReference: string;
  readonly affiliateId: AffiliateId | null;
  readonly subjectReference: string | null;
  readonly policyVersion: string;
  readonly beforeDigest: string | null;
  readonly afterDigest: string | null;
  readonly idempotencyDigest: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly occurredAt: string;
  readonly outcome: "accepted" | "rejected" | "replayed";
  readonly reason: string;
}

export interface AffiliateAuditPort {
  append(entry: AffiliateAuditEntry): Promise<void>;
}

export function canonicalizeAffiliateInput(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeAffiliateInput(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeAffiliateInput(record[key])}`,
      )
      .join(",")}}`;
  }
  throw new Error("AFFILIATE_CANONICAL_INPUT_UNSUPPORTED");
}

export async function createAffiliateCanonicalDigest(
  immutableInputs: unknown,
  digest: AffiliateDigestPort,
): Promise<string> {
  const hex = await digest.sha256(canonicalizeAffiliateInput(immutableInputs));
  if (!/^[a-f0-9]{64}$/.test(hex)) {
    throw new Error("AFFILIATE_IDEMPOTENCY_DIGEST_INVALID");
  }
  return hex;
}

export async function createAffiliateIdempotencyKey(
  operation: string,
  immutableInputs: Readonly<Record<string, unknown>>,
  digest: AffiliateDigestPort,
): Promise<string> {
  if (!/^[a-z0-9_:-]{1,80}$/.test(operation)) {
    throw new Error("AFFILIATE_IDEMPOTENCY_OPERATION_INVALID");
  }
  const hex = await createAffiliateCanonicalDigest(immutableInputs, digest);
  return `affiliate:v1:${operation}:${hex}`;
}
