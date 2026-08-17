import type {
  AcquisitionSubjectId,
  AffiliateId,
  AffiliateProgramId,
  AttributionId,
  ReferralEvidenceId,
} from "./ids.js";
import { isSha256, isUtcTimestamp } from "./ids.js";
import {
  AFFILIATE_POLICY_V1,
  type AffiliatePolicyV1,
  type ReferralEvidenceSource,
} from "./policy.js";

const DAY_MS = 86_400_000;

export interface ReferralEvidence {
  readonly id: ReferralEvidenceId;
  readonly affiliateId: AffiliateId;
  readonly programId: AffiliateProgramId;
  readonly subjectId: AcquisitionSubjectId;
  readonly source: ReferralEvidenceSource;
  readonly evidenceFingerprint: string;
  readonly serverObservedAt: string;
  readonly receivedAt: string;
  readonly policyVersion: AffiliatePolicyV1["version"];
}

export interface CreateReferralEvidenceInput {
  readonly id: ReferralEvidenceId;
  readonly affiliateId: AffiliateId;
  readonly programId: AffiliateProgramId;
  readonly subjectId: AcquisitionSubjectId;
  readonly source: ReferralEvidenceSource;
  readonly evidenceFingerprint: string;
  readonly serverObservedAt: string;
  readonly receivedAt: string;
  readonly validatedByServer: boolean;
}

export function createReferralEvidence(
  input: CreateReferralEvidenceInput,
): ReferralEvidence | null {
  if (!input.validatedByServer) return null;
  if (!isSha256(input.evidenceFingerprint)) return null;
  if (
    !isUtcTimestamp(input.serverObservedAt) ||
    !isUtcTimestamp(input.receivedAt)
  ) {
    return null;
  }
  if (Date.parse(input.receivedAt) < Date.parse(input.serverObservedAt)) {
    return null;
  }

  return Object.freeze({
    id: input.id,
    affiliateId: input.affiliateId,
    programId: input.programId,
    subjectId: input.subjectId,
    source: input.source,
    evidenceFingerprint: input.evidenceFingerprint,
    serverObservedAt: input.serverObservedAt,
    receivedAt: input.receivedAt,
    policyVersion: AFFILIATE_POLICY_V1.version,
  });
}

export interface Attribution {
  readonly id: AttributionId;
  readonly affiliateId: AffiliateId;
  readonly programId: AffiliateProgramId;
  readonly subjectId: AcquisitionSubjectId;
  readonly evidenceId: ReferralEvidenceId;
  readonly evidenceFingerprint: string;
  readonly source: ReferralEvidenceSource;
  readonly establishedAt: string;
  readonly expiresAt: string;
  readonly policyVersion: AffiliatePolicyV1["version"];
}

function addCalendarDaysUtc(value: string, days: number): string {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

export function createAttribution(
  id: AttributionId,
  evidence: ReferralEvidence,
  now: string,
): Attribution | null {
  if (!isUtcTimestamp(now)) return null;
  const expiresAt = addCalendarDaysUtc(
    evidence.serverObservedAt,
    AFFILIATE_POLICY_V1.attributionWindowDays,
  );
  if (Date.parse(now) >= Date.parse(expiresAt)) return null;

  return Object.freeze({
    id,
    affiliateId: evidence.affiliateId,
    programId: evidence.programId,
    subjectId: evidence.subjectId,
    evidenceId: evidence.id,
    evidenceFingerprint: evidence.evidenceFingerprint,
    source: evidence.source,
    establishedAt: evidence.serverObservedAt,
    expiresAt,
    policyVersion: evidence.policyVersion,
  });
}

export type AttributionLockState = "open" | "locked";

export function chooseAttribution(
  existing: Attribution | null,
  candidate: Attribution,
  lockState: AttributionLockState,
  now: string,
): Attribution | null {
  if (!isUtcTimestamp(now)) return null;
  if (lockState === "locked") return existing;
  if (Date.parse(now) >= Date.parse(candidate.expiresAt)) return existing;
  if (!existing || Date.parse(now) >= Date.parse(existing.expiresAt)) {
    return candidate;
  }

  const existingRank = AFFILIATE_POLICY_V1.referralPrecedence[existing.source];
  const candidateRank =
    AFFILIATE_POLICY_V1.referralPrecedence[candidate.source];
  if (candidateRank > existingRank) return candidate;
  if (candidateRank < existingRank) return existing;

  return Date.parse(candidate.establishedAt) > Date.parse(existing.establishedAt)
    ? candidate
    : existing;
}
