export type RewardFundingClass =
  "merchant-funded" | "platform-funded" | "access-based";

export type RewardStatus = "draft" | "published" | "retired";

export type RewardTrustClass =
  | "behavioral"
  | "session_verified"
  | "experience_verified"
  | "financial_authoritative";

export interface RewardFundingPolicy {
  readonly fundingClass: RewardFundingClass;
  readonly sponsorReference: string;
  readonly estimatedCostMinorUnits: number;
  readonly perceivedValueMinorUnits: number;
  readonly currency: string;
}

export interface RewardEligibilityRule {
  readonly eligibleProfiles: readonly (
    "tourist" | "resident" | "visitor" | "unknown"
  )[];
  readonly minimumTrustClass: RewardTrustClass;
  readonly requiredMissionIds: readonly string[];
  readonly maximumRedemptionsPerSubject: number;
}

export interface RewardDefinition {
  readonly rewardId: string;
  readonly version: number;
  readonly destinationId: string;
  readonly campaignId?: string;
  readonly label: string;
  readonly status: RewardStatus;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly funding: RewardFundingPolicy;
  readonly eligibility: RewardEligibilityRule;
  readonly publishedAt?: string;
}

export interface RewardInventory {
  readonly rewardId: string;
  readonly rewardVersion: number;
  readonly revision: number;
  readonly totalUnits: number;
  readonly reservedUnits: number;
  readonly redeemedUnits: number;
}

export interface RewardEntitlement {
  readonly entitlementId: string;
  readonly subjectId: string;
  readonly journeyId: string;
  readonly destinationId: string;
  readonly rewardId: string;
  readonly rewardVersion: number;
  readonly status: "unlocked" | "redeemed" | "expired";
  readonly policyVersion: string;
  readonly eligibilityEvidenceReference: string;
  readonly economicApprovalReference?: string;
  readonly idempotencyKey: string;
  readonly unlockedAt: string;
  readonly expiresAt: string;
  readonly redeemedAt?: string;
  readonly expiredAt?: string;
}

export interface RewardEligibilityContext {
  readonly subjectId: string;
  readonly journeyId: string;
  readonly destinationId: string;
  readonly profileType: "tourist" | "resident" | "visitor" | "unknown";
  readonly trustClass: RewardTrustClass;
  readonly completedMissionIds: readonly string[];
  readonly existingRedemptionCount: number;
  readonly eligibilityEvidenceReference: string;
  readonly economicApprovalReference?: string;
  readonly occurredAt: string;
}

export type RewardUnlockDecision =
  | Readonly<{
      kind: "unlocked";
      entitlement: RewardEntitlement;
      inventory: RewardInventory;
      event: "RewardUnlocked";
    }>
  | Readonly<{
      kind: "replayed";
      entitlement: RewardEntitlement;
      inventory: RewardInventory;
    }>
  | Readonly<{
      kind: "rejected";
      code: string;
      inventory: RewardInventory;
    }>;

export type RewardRedemptionDecision =
  | Readonly<{
      kind: "redeemed";
      entitlement: RewardEntitlement;
      inventory: RewardInventory;
      event: "RewardRedeemed";
    }>
  | Readonly<{
      kind: "replayed";
      entitlement: RewardEntitlement;
      inventory: RewardInventory;
    }>
  | Readonly<{
      kind: "rejected";
      code: string;
      inventory: RewardInventory;
    }>;

const TRUST_RANK: Readonly<Record<RewardTrustClass, number>> = {
  behavioral: 0,
  session_verified: 1,
  experience_verified: 2,
  financial_authoritative: 3,
};

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function isMinorUnits(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validateFunding(funding: RewardFundingPolicy): void {
  if (!funding.sponsorReference || !/^[A-Z]{3}$/.test(funding.currency)) {
    throw new Error("REWARD_FUNDING_IDENTITY_INVALID");
  }
  if (
    !isMinorUnits(funding.estimatedCostMinorUnits) ||
    !isMinorUnits(funding.perceivedValueMinorUnits)
  ) {
    throw new Error("REWARD_FUNDING_VALUE_INVALID");
  }
}

export function validateRewardDefinition(
  definition: RewardDefinition,
): RewardDefinition {
  if (!definition.rewardId || !definition.destinationId || !definition.label) {
    throw new Error("REWARD_IDENTITY_INVALID");
  }
  if (!isPositiveInteger(definition.version)) {
    throw new Error("REWARD_VERSION_INVALID");
  }
  if (!isUtc(definition.validFrom) || !isUtc(definition.validUntil)) {
    throw new Error("REWARD_VALIDITY_TIME_INVALID");
  }
  if (Date.parse(definition.validUntil) <= Date.parse(definition.validFrom)) {
    throw new Error("REWARD_VALIDITY_WINDOW_INVALID");
  }
  validateFunding(definition.funding);

  if (definition.eligibility.eligibleProfiles.length < 1) {
    throw new Error("REWARD_ELIGIBILITY_PROFILE_EMPTY");
  }
  if (!isPositiveInteger(definition.eligibility.maximumRedemptionsPerSubject)) {
    throw new Error("REWARD_REDEMPTION_LIMIT_INVALID");
  }
  if (definition.status === "published" && !definition.publishedAt) {
    throw new Error("REWARD_PUBLISHED_AT_REQUIRED");
  }
  if (definition.publishedAt && !isUtc(definition.publishedAt)) {
    throw new Error("REWARD_PUBLISHED_AT_INVALID");
  }

  return definition;
}

export function publishRewardDefinition(
  definition: RewardDefinition,
  publishedAt: string,
): RewardDefinition {
  validateRewardDefinition(definition);
  if (definition.status !== "draft") {
    throw new Error("REWARD_ONLY_DRAFT_CAN_PUBLISH");
  }
  if (!isUtc(publishedAt)) {
    throw new Error("REWARD_PUBLISHED_AT_INVALID");
  }

  return Object.freeze({
    ...definition,
    status: "published",
    publishedAt,
    funding: Object.freeze({ ...definition.funding }),
    eligibility: Object.freeze({
      ...definition.eligibility,
      eligibleProfiles: Object.freeze([
        ...definition.eligibility.eligibleProfiles,
      ]),
      requiredMissionIds: Object.freeze([
        ...definition.eligibility.requiredMissionIds,
      ]),
    }),
  });
}

export function createRewardInventory(
  input: Omit<RewardInventory, "revision" | "reservedUnits" | "redeemedUnits">,
): RewardInventory {
  if (!input.rewardId || !isPositiveInteger(input.rewardVersion)) {
    throw new Error("REWARD_INVENTORY_IDENTITY_INVALID");
  }
  if (!Number.isSafeInteger(input.totalUnits) || input.totalUnits < 0) {
    throw new Error("REWARD_INVENTORY_TOTAL_INVALID");
  }

  return Object.freeze({
    ...input,
    revision: 1,
    reservedUnits: 0,
    redeemedUnits: 0,
  });
}

function availableUnits(inventory: RewardInventory): number {
  return (
    inventory.totalUnits - inventory.reservedUnits - inventory.redeemedUnits
  );
}

function eligibilityFailure(
  definition: RewardDefinition,
  context: RewardEligibilityContext,
): string | null {
  if (definition.status !== "published") return "REWARD_NOT_PUBLISHED";
  if (definition.destinationId !== context.destinationId) {
    return "REWARD_DESTINATION_MISMATCH";
  }
  if (!isUtc(context.occurredAt)) return "REWARD_OCCURRED_AT_INVALID";

  const occurred = Date.parse(context.occurredAt);
  if (
    occurred < Date.parse(definition.validFrom) ||
    occurred >= Date.parse(definition.validUntil)
  ) {
    return "REWARD_OUTSIDE_VALIDITY";
  }
  if (!definition.eligibility.eligibleProfiles.includes(context.profileType)) {
    return "REWARD_PROFILE_NOT_ELIGIBLE";
  }
  if (
    TRUST_RANK[context.trustClass] <
    TRUST_RANK[definition.eligibility.minimumTrustClass]
  ) {
    return "REWARD_TRUST_INSUFFICIENT";
  }

  for (const missionId of definition.eligibility.requiredMissionIds) {
    if (!context.completedMissionIds.includes(missionId)) {
      return "REWARD_MISSION_REQUIREMENT_NOT_MET";
    }
  }

  if (
    context.existingRedemptionCount >=
    definition.eligibility.maximumRedemptionsPerSubject
  ) {
    return "REWARD_SUBJECT_LIMIT_REACHED";
  }
  if (!context.eligibilityEvidenceReference) {
    return "REWARD_ELIGIBILITY_EVIDENCE_REQUIRED";
  }
  if (
    definition.funding.fundingClass === "platform-funded" &&
    !context.economicApprovalReference
  ) {
    return "REWARD_ECONOMIC_APPROVAL_REQUIRED";
  }

  return null;
}

export function unlockReward(
  definition: RewardDefinition,
  inventory: RewardInventory,
  context: RewardEligibilityContext,
  input: Readonly<{
    entitlementId: string;
    policyVersion: string;
    idempotencyKey: string;
    expiresAt: string;
  }>,
  existingEntitlement: RewardEntitlement | null,
): RewardUnlockDecision {
  validateRewardDefinition(definition);

  if (existingEntitlement) {
    if (
      existingEntitlement.idempotencyKey === input.idempotencyKey &&
      existingEntitlement.rewardId === definition.rewardId &&
      existingEntitlement.rewardVersion === definition.version &&
      existingEntitlement.subjectId === context.subjectId
    ) {
      return {
        kind: "replayed",
        entitlement: existingEntitlement,
        inventory,
      };
    }
    return {
      kind: "rejected",
      code: "REWARD_IDEMPOTENCY_CONFLICT",
      inventory,
    };
  }

  const failure = eligibilityFailure(definition, context);
  if (failure) return { kind: "rejected", code: failure, inventory };

  if (
    inventory.rewardId !== definition.rewardId ||
    inventory.rewardVersion !== definition.version
  ) {
    return {
      kind: "rejected",
      code: "REWARD_INVENTORY_VERSION_MISMATCH",
      inventory,
    };
  }
  if (availableUnits(inventory) < 1) {
    return { kind: "rejected", code: "REWARD_INVENTORY_EXHAUSTED", inventory };
  }
  if (!input.entitlementId || !input.policyVersion || !input.idempotencyKey) {
    return {
      kind: "rejected",
      code: "REWARD_ENTITLEMENT_INPUT_INVALID",
      inventory,
    };
  }
  if (!isUtc(input.expiresAt)) {
    return {
      kind: "rejected",
      code: "REWARD_ENTITLEMENT_EXPIRY_INVALID",
      inventory,
    };
  }
  if (Date.parse(input.expiresAt) <= Date.parse(context.occurredAt)) {
    return {
      kind: "rejected",
      code: "REWARD_ENTITLEMENT_EXPIRY_INVALID",
      inventory,
    };
  }

  const entitlement: RewardEntitlement = Object.freeze({
    entitlementId: input.entitlementId,
    subjectId: context.subjectId,
    journeyId: context.journeyId,
    destinationId: context.destinationId,
    rewardId: definition.rewardId,
    rewardVersion: definition.version,
    status: "unlocked",
    policyVersion: input.policyVersion,
    eligibilityEvidenceReference: context.eligibilityEvidenceReference,
    ...(context.economicApprovalReference
      ? { economicApprovalReference: context.economicApprovalReference }
      : {}),
    idempotencyKey: input.idempotencyKey,
    unlockedAt: context.occurredAt,
    expiresAt: input.expiresAt,
  });

  const nextInventory: RewardInventory = Object.freeze({
    ...inventory,
    revision: inventory.revision + 1,
    reservedUnits: inventory.reservedUnits + 1,
  });

  return {
    kind: "unlocked",
    entitlement,
    inventory: nextInventory,
    event: "RewardUnlocked",
  };
}

export function redeemReward(
  entitlement: RewardEntitlement,
  inventory: RewardInventory,
  input: Readonly<{
    idempotencyKey: string;
    occurredAt: string;
    expectedInventoryRevision: number;
  }>,
): RewardRedemptionDecision {
  if (entitlement.status === "redeemed") {
    return { kind: "replayed", entitlement, inventory };
  }
  if (entitlement.status !== "unlocked") {
    return { kind: "rejected", code: "REWARD_NOT_REDEEMABLE", inventory };
  }
  if (!isUtc(input.occurredAt)) {
    return {
      kind: "rejected",
      code: "REWARD_REDEMPTION_TIME_INVALID",
      inventory,
    };
  }
  if (Date.parse(input.occurredAt) >= Date.parse(entitlement.expiresAt)) {
    return { kind: "rejected", code: "REWARD_ENTITLEMENT_EXPIRED", inventory };
  }
  if (input.idempotencyKey !== entitlement.idempotencyKey) {
    return { kind: "rejected", code: "REWARD_IDEMPOTENCY_CONFLICT", inventory };
  }
  if (input.expectedInventoryRevision !== inventory.revision) {
    return {
      kind: "rejected",
      code: "REWARD_INVENTORY_REVISION_CONFLICT",
      inventory,
    };
  }
  if (inventory.reservedUnits < 1) {
    return { kind: "rejected", code: "REWARD_RESERVATION_MISSING", inventory };
  }

  const redeemed: RewardEntitlement = Object.freeze({
    ...entitlement,
    status: "redeemed",
    redeemedAt: input.occurredAt,
  });
  const nextInventory: RewardInventory = Object.freeze({
    ...inventory,
    revision: inventory.revision + 1,
    reservedUnits: inventory.reservedUnits - 1,
    redeemedUnits: inventory.redeemedUnits + 1,
  });

  return {
    kind: "redeemed",
    entitlement: redeemed,
    inventory: nextInventory,
    event: "RewardRedeemed",
  };
}

export function expireRewardEntitlement(
  entitlement: RewardEntitlement,
  inventory: RewardInventory,
  occurredAt: string,
): Readonly<{
  entitlement: RewardEntitlement;
  inventory: RewardInventory;
  event?: "RewardExpired";
}> {
  if (entitlement.status !== "unlocked") {
    return { entitlement, inventory };
  }
  if (!isUtc(occurredAt)) {
    throw new Error("REWARD_EXPIRATION_TIME_INVALID");
  }
  if (Date.parse(occurredAt) < Date.parse(entitlement.expiresAt)) {
    return { entitlement, inventory };
  }
  if (inventory.reservedUnits < 1) {
    throw new Error("REWARD_RESERVATION_MISSING");
  }

  return {
    entitlement: Object.freeze({
      ...entitlement,
      status: "expired",
      expiredAt: occurredAt,
    }),
    inventory: Object.freeze({
      ...inventory,
      revision: inventory.revision + 1,
      reservedUnits: inventory.reservedUnits - 1,
    }),
    event: "RewardExpired",
  };
}
