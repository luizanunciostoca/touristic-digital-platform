export interface QualifiedReferralInput {
  readonly referralId: string;
  readonly affiliateId: string;
  readonly programId: string;
  readonly placementId: string;
  readonly destinationId: string;
  readonly subjectId: string;
  readonly activePlacement: boolean;
  readonly uniqueSubjectAccepted: boolean;
  readonly selfReferral: boolean;
  readonly riskAllowed: boolean;
  readonly meaningfulSignalCount: number;
  readonly minimumMeaningfulSignals: number;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}

export interface QualifiedReferral {
  readonly referralId: string;
  readonly affiliateId: string;
  readonly programId: string;
  readonly placementId: string;
  readonly destinationId: string;
  readonly subjectId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}

export type QualifiedReferralDecision =
  | Readonly<{
      qualified: true;
      referral: QualifiedReferral;
      event: "AffiliateQualifiedReferralRecorded";
    }>
  | Readonly<{
      qualified: false;
      code: string;
    }>;

export interface AcquisitionQualityMetrics {
  readonly activationRateBps: number;
  readonly usefulEngagementRateBps: number;
  readonly retentionRateBps: number;
  readonly journeyDepthRateBps: number;
  readonly commercialQualityRateBps: number;
}

export interface AttributionIntegrityMetrics {
  readonly selfReferralRateBps: number;
  readonly velocityAnomalyRateBps: number;
  readonly replayRateBps: number;
  readonly deviceSessionAnomalyRateBps: number;
  readonly geoAnomalyRateBps: number;
}

export interface AffiliateQualityScore {
  readonly value: number;
  readonly scale: 100;
  readonly policyVersion: string;
}

export interface AffiliateXpLedgerEntry {
  readonly entryId: string;
  readonly affiliateId: string;
  readonly destinationId: string;
  readonly amountSigned: number;
  readonly reasonCode: string;
  readonly sourceReference: string;
  readonly idempotencyKey: string;
  readonly policyVersion: string;
  readonly occurredAt: string;
}

export interface AffiliateLevelDefinition {
  readonly levelId: string;
  readonly ordinal: number;
  readonly minimumLifetimeXp: number;
  readonly label: string;
}

export interface AffiliateChallengeDefinition {
  readonly challengeId: string;
  readonly seasonId: string;
  readonly targetQualifiedReferrals: number;
  readonly rewardXp: number;
}

export interface AffiliateChallengeProgress {
  readonly affiliateId: string;
  readonly challengeId: string;
  readonly seasonId: string;
  readonly qualifiedReferralCount: number;
  readonly completed: boolean;
}

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function isBps(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10000;
}

function assertBpsRecord(values: readonly number[]): void {
  if (!values.every(isBps)) {
    throw new Error("AFFILIATE_GROWTH_BPS_INVALID");
  }
}

function roundScore(weightedBasisPoints: number): number {
  return Math.max(0, Math.min(100, Math.round(weightedBasisPoints / 100)));
}

export function evaluateQualifiedReferral(
  input: QualifiedReferralInput,
  existingByIdempotencyKey: QualifiedReferral | null,
): QualifiedReferralDecision {
  if (existingByIdempotencyKey) {
    if (
      existingByIdempotencyKey.idempotencyKey === input.idempotencyKey &&
      existingByIdempotencyKey.subjectId === input.subjectId &&
      existingByIdempotencyKey.affiliateId === input.affiliateId
    ) {
      return {
        qualified: true,
        referral: existingByIdempotencyKey,
        event: "AffiliateQualifiedReferralRecorded",
      };
    }
    return {
      qualified: false,
      code: "QUALIFIED_REFERRAL_IDEMPOTENCY_CONFLICT",
    };
  }
  if (!input.referralId || !input.affiliateId || !input.programId) {
    return { qualified: false, code: "QUALIFIED_REFERRAL_IDENTITY_INVALID" };
  }
  if (!input.placementId || !input.destinationId || !input.subjectId) {
    return { qualified: false, code: "QUALIFIED_REFERRAL_SCOPE_INVALID" };
  }
  if (!input.activePlacement) {
    return { qualified: false, code: "QUALIFIED_REFERRAL_PLACEMENT_INACTIVE" };
  }
  if (!input.uniqueSubjectAccepted) {
    return { qualified: false, code: "QUALIFIED_REFERRAL_SUBJECT_REJECTED" };
  }
  if (input.selfReferral) {
    return { qualified: false, code: "QUALIFIED_REFERRAL_SELF_REFERRAL" };
  }
  if (!input.riskAllowed) {
    return { qualified: false, code: "QUALIFIED_REFERRAL_RISK_BLOCKED" };
  }
  if (
    !Number.isSafeInteger(input.meaningfulSignalCount) ||
    !Number.isSafeInteger(input.minimumMeaningfulSignals) ||
    input.minimumMeaningfulSignals < 1 ||
    input.meaningfulSignalCount < input.minimumMeaningfulSignals
  ) {
    return {
      qualified: false,
      code: "QUALIFIED_REFERRAL_MEANINGFUL_ENGAGEMENT_NOT_MET",
    };
  }
  if (!input.idempotencyKey || !isUtc(input.occurredAt)) {
    return { qualified: false, code: "QUALIFIED_REFERRAL_EVIDENCE_INVALID" };
  }

  return {
    qualified: true,
    referral: Object.freeze({
      referralId: input.referralId,
      affiliateId: input.affiliateId,
      programId: input.programId,
      placementId: input.placementId,
      destinationId: input.destinationId,
      subjectId: input.subjectId,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
    }),
    event: "AffiliateQualifiedReferralRecorded",
  };
}

export function calculateAqs(
  metrics: AcquisitionQualityMetrics,
  policyVersion: string,
): AffiliateQualityScore {
  assertBpsRecord([
    metrics.activationRateBps,
    metrics.usefulEngagementRateBps,
    metrics.retentionRateBps,
    metrics.journeyDepthRateBps,
    metrics.commercialQualityRateBps,
  ]);
  if (!policyVersion) throw new Error("AQS_POLICY_VERSION_REQUIRED");

  const weighted =
    metrics.activationRateBps * 0.3 +
    metrics.usefulEngagementRateBps * 0.3 +
    metrics.retentionRateBps * 0.2 +
    metrics.journeyDepthRateBps * 0.15 +
    metrics.commercialQualityRateBps * 0.05;

  return Object.freeze({
    value: roundScore(weighted),
    scale: 100,
    policyVersion,
  });
}

export function calculateAis(
  metrics: AttributionIntegrityMetrics,
  policyVersion: string,
): AffiliateQualityScore {
  assertBpsRecord([
    metrics.selfReferralRateBps,
    metrics.velocityAnomalyRateBps,
    metrics.replayRateBps,
    metrics.deviceSessionAnomalyRateBps,
    metrics.geoAnomalyRateBps,
  ]);
  if (!policyVersion) throw new Error("AIS_POLICY_VERSION_REQUIRED");

  const weightedRisk =
    metrics.selfReferralRateBps * 0.35 +
    metrics.velocityAnomalyRateBps * 0.2 +
    metrics.replayRateBps * 0.2 +
    metrics.deviceSessionAnomalyRateBps * 0.15 +
    metrics.geoAnomalyRateBps * 0.1;

  return Object.freeze({
    value: roundScore(10000 - weightedRisk),
    scale: 100,
    policyVersion,
  });
}

export function appendAffiliateXp(
  entries: readonly AffiliateXpLedgerEntry[],
  candidate: AffiliateXpLedgerEntry,
): Readonly<{
  entries: readonly AffiliateXpLedgerEntry[];
  replayed: boolean;
  event?: "AffiliateXpGranted";
}> {
  const existing = entries.find(
    (entry) => entry.idempotencyKey === candidate.idempotencyKey,
  );
  if (existing) {
    const same =
      existing.affiliateId === candidate.affiliateId &&
      existing.amountSigned === candidate.amountSigned &&
      existing.reasonCode === candidate.reasonCode &&
      existing.sourceReference === candidate.sourceReference;
    if (!same) throw new Error("AFFILIATE_XP_IDEMPOTENCY_CONFLICT");
    return { entries, replayed: true };
  }

  if (
    !candidate.entryId ||
    !candidate.affiliateId ||
    !candidate.destinationId ||
    !candidate.reasonCode ||
    !candidate.sourceReference ||
    !candidate.policyVersion ||
    !candidate.idempotencyKey
  ) {
    throw new Error("AFFILIATE_XP_ENTRY_INVALID");
  }
  if (
    !Number.isSafeInteger(candidate.amountSigned) ||
    candidate.amountSigned === 0
  ) {
    throw new Error("AFFILIATE_XP_AMOUNT_INVALID");
  }
  if (!isUtc(candidate.occurredAt)) {
    throw new Error("AFFILIATE_XP_TIME_INVALID");
  }

  return {
    entries: Object.freeze([...entries, Object.freeze({ ...candidate })]),
    replayed: false,
    event: "AffiliateXpGranted",
  };
}

export function affiliateXpBalance(
  entries: readonly AffiliateXpLedgerEntry[],
  affiliateId: string,
): number {
  return entries
    .filter((entry) => entry.affiliateId === affiliateId)
    .reduce((sum, entry) => sum + entry.amountSigned, 0);
}

export function resolveAffiliateLevel(
  lifetimeXp: number,
  levels: readonly AffiliateLevelDefinition[],
): AffiliateLevelDefinition {
  if (!Number.isSafeInteger(lifetimeXp) || lifetimeXp < 0) {
    throw new Error("AFFILIATE_LEVEL_XP_INVALID");
  }
  if (levels.length < 1) throw new Error("AFFILIATE_LEVELS_EMPTY");

  const ordered = [...levels].sort((a, b) => a.ordinal - b.ordinal);
  for (const [index, level] of ordered.entries()) {
    if (
      level.ordinal !== index + 1 ||
      !Number.isSafeInteger(level.minimumLifetimeXp) ||
      level.minimumLifetimeXp < 0
    ) {
      throw new Error("AFFILIATE_LEVEL_DEFINITION_INVALID");
    }
  }
  if (ordered[0]?.minimumLifetimeXp !== 0) {
    throw new Error("AFFILIATE_FIRST_LEVEL_MUST_START_AT_ZERO");
  }

  let current = ordered[0];
  for (const level of ordered) {
    if (lifetimeXp >= level.minimumLifetimeXp) current = level;
    else break;
  }
  return current;
}

export function projectAffiliateChallenge(
  definition: AffiliateChallengeDefinition,
  affiliateId: string,
  qualifiedReferralCount: number,
): AffiliateChallengeProgress {
  if (
    !definition.challengeId ||
    !definition.seasonId ||
    !Number.isSafeInteger(definition.targetQualifiedReferrals) ||
    definition.targetQualifiedReferrals < 1 ||
    !Number.isSafeInteger(definition.rewardXp) ||
    definition.rewardXp < 0
  ) {
    throw new Error("AFFILIATE_CHALLENGE_DEFINITION_INVALID");
  }
  if (
    !Number.isSafeInteger(qualifiedReferralCount) ||
    qualifiedReferralCount < 0
  ) {
    throw new Error("AFFILIATE_CHALLENGE_PROGRESS_INVALID");
  }

  return Object.freeze({
    affiliateId,
    challengeId: definition.challengeId,
    seasonId: definition.seasonId,
    qualifiedReferralCount,
    completed: qualifiedReferralCount >= definition.targetQualifiedReferrals,
  });
}
