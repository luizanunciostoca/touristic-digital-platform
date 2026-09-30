import type { EventTrustClass } from "./authority.js";
import { isUtcTimestamp } from "./ids.js";

export type BehavioralEventType =
  "AssistantUsed" | "MapOpened" | "PlaceViewed" | "NavigationStarted";

export type VerifiedExperienceEventType =
  "PlaceVisitVerified" | "TicketCheckedIn" | "BookingConsumed";

export type FinancialAuthorityEventType =
  "PaymentApproved" | "PaymentRefunded" | "SettlementCompleted";

export type GrowthDomainEventType =
  | "JourneyStarted"
  | "JourneyUpdated"
  | "JourneyCompleted"
  | "QualifiedAcquisitionEstablished"
  | "AcquisitionCycleOpened"
  | "AcquisitionCycleExpired"
  | "InfluenceTouchpointRecorded"
  | "QualifiedReacquisitionEstablished"
  | "MissionProgressed"
  | "MissionCompleted"
  | "XpGranted"
  | "LevelAdvanced"
  | "BadgeGranted"
  | "CollectionProgressed"
  | "RewardUnlocked"
  | "RewardRedeemed"
  | "RewardExpired"
  | "AffiliateQualifiedReferralRecorded"
  | "AffiliateXpGranted"
  | "AffiliateLevelAdvanced"
  | "AffiliateChallengeCompleted"
  | "RiskSignalRecorded"
  | "RiskDecisionMade"
  | "ExperimentAssigned"
  | "ExperimentExposureRecorded";

export type PlatformEventType =
  | BehavioralEventType
  | VerifiedExperienceEventType
  | FinancialAuthorityEventType
  | GrowthDomainEventType;

export interface PlatformEventEnvelopeV1 {
  readonly eventId: string;
  readonly type: PlatformEventType;
  readonly version: 1;
  readonly occurredAt: string;
  readonly destinationId: string;
  readonly tenantId?: string;
  readonly subjectId?: string;
  readonly userId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

const BEHAVIORAL = new Set<PlatformEventType>([
  "AssistantUsed",
  "MapOpened",
  "PlaceViewed",
  "NavigationStarted",
]);

const VERIFIED = new Set<PlatformEventType>([
  "PlaceVisitVerified",
  "TicketCheckedIn",
  "BookingConsumed",
  "MissionCompleted",
]);

const FINANCIAL = new Set<PlatformEventType>([
  "PaymentApproved",
  "PaymentRefunded",
  "SettlementCompleted",
]);

export const PLATFORM_EVENT_TYPES = new Set<PlatformEventType>([
  ...BEHAVIORAL,
  ...VERIFIED,
  ...FINANCIAL,
  "JourneyStarted",
  "JourneyUpdated",
  "JourneyCompleted",
  "QualifiedAcquisitionEstablished",
  "AcquisitionCycleOpened",
  "AcquisitionCycleExpired",
  "InfluenceTouchpointRecorded",
  "QualifiedReacquisitionEstablished",
  "MissionProgressed",
  "XpGranted",
  "LevelAdvanced",
  "BadgeGranted",
  "CollectionProgressed",
  "RewardUnlocked",
  "RewardRedeemed",
  "RewardExpired",
  "AffiliateQualifiedReferralRecorded",
  "AffiliateXpGranted",
  "AffiliateLevelAdvanced",
  "AffiliateChallengeCompleted",
  "RiskSignalRecorded",
  "RiskDecisionMade",
  "ExperimentAssigned",
  "ExperimentExposureRecorded",
]);

export function isPlatformEventType(value: string): boolean {
  return PLATFORM_EVENT_TYPES.has(value as PlatformEventType);
}

export function eventTrustClass(type: PlatformEventType): EventTrustClass {
  if (FINANCIAL.has(type)) return "financial_authoritative";
  if (VERIFIED.has(type)) return "experience_verified";
  if (BEHAVIORAL.has(type)) return "behavioral";
  return "session_verified";
}

export type EventValidationResult =
  Readonly<{ valid: true }> | Readonly<{ valid: false; code: string }>;

export function validateEventV1(input: unknown): EventValidationResult {
  if (!input || typeof input !== "object") {
    return { valid: false, code: "EVENT_ENVELOPE_INVALID" };
  }

  const value = input as Record<string, unknown>;
  if (value.version !== 1) {
    return { valid: false, code: "EVENT_VERSION_UNSUPPORTED" };
  }

  const eventType = value.type;
  if (typeof eventType !== "string" || !isPlatformEventType(eventType)) {
    return { valid: false, code: "EVENT_TYPE_UNKNOWN" };
  }

  const required = ["eventId", "destinationId", "correlationId"] as const;
  for (const field of required) {
    const fieldValue = value[field];
    if (typeof fieldValue !== "string" || fieldValue.length < 1) {
      return {
        valid: false,
        code: `EVENT_${field.toUpperCase()}_INVALID`,
      };
    }
  }

  const occurredAt = value.occurredAt;
  if (typeof occurredAt !== "string" || !isUtcTimestamp(occurredAt)) {
    return { valid: false, code: "EVENT_OCCURRED_AT_INVALID" };
  }

  const payload = value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, code: "EVENT_PAYLOAD_INVALID" };
  }

  return { valid: true };
}
