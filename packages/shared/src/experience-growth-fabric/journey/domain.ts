export type JourneyProfileType = "tourist" | "resident" | "visitor" | "unknown";

export type JourneyStatus = "active" | "completed" | "expired";

export type JourneyExperienceKind = "discovered" | "visited";

export interface JourneyExperienceReference {
  readonly referenceId: string;
  readonly kind: JourneyExperienceKind;
  readonly placeId: string;
  readonly occurredAt: string;
  readonly verificationType: string;
  readonly proofDigest?: string;
}

export interface DestinationJourney {
  readonly journeyId: string;
  readonly subjectId: string;
  readonly userId?: string;
  readonly destinationId: string;
  readonly profileType: JourneyProfileType;
  readonly status: JourneyStatus;
  readonly startedAt: string;
  readonly expectedEndAt?: string;
  readonly interests: readonly string[];
  readonly partyProfile?: string;
  readonly acquisitionCycleId?: string;
  readonly experiences: readonly JourneyExperienceReference[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateDestinationJourneyInput {
  readonly journeyId: string;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly profileType: JourneyProfileType;
  readonly startedAt: string;
  readonly expectedEndAt?: string;
  readonly interests?: readonly string[];
  readonly partyProfile?: string;
  readonly acquisitionCycleId?: string;
}

export interface JourneyMutationResult {
  readonly journey: DestinationJourney;
  readonly event: "JourneyStarted" | "JourneyUpdated" | "JourneyCompleted";
}

const ID = /^[A-Za-z0-9:_-]{4,180}$/;
const PROOF_DIGEST = /^[a-f0-9]{64}$/;

function parseTime(value: string): number | null {
  const timestamp = Date.parse(value);
  if (!value.endsWith("Z") || !Number.isFinite(timestamp)) return null;
  return timestamp;
}

function cleanInterests(values: readonly string[]): readonly string[] {
  if (values.length > 20) throw new Error("JOURNEY_INTEREST_LIMIT_EXCEEDED");

  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.some((value) => value.length > 80)) {
    throw new Error("JOURNEY_INTEREST_INVALID");
  }
  return Object.freeze([...new Set(normalized)]);
}

function requireActive(journey: DestinationJourney): void {
  if (journey.status !== "active") {
    throw new Error("JOURNEY_NOT_ACTIVE");
  }
}

export function createDestinationJourney(
  input: CreateDestinationJourneyInput,
): JourneyMutationResult {
  if (!ID.test(input.journeyId) || !ID.test(input.subjectId)) {
    throw new Error("JOURNEY_IDENTITY_INVALID");
  }
  if (!ID.test(input.destinationId)) {
    throw new Error("JOURNEY_DESTINATION_INVALID");
  }

  const startedAt = parseTime(input.startedAt);
  if (startedAt === null) throw new Error("JOURNEY_START_TIME_INVALID");

  if (input.expectedEndAt) {
    const expectedEndAt = parseTime(input.expectedEndAt);
    if (expectedEndAt === null || expectedEndAt <= startedAt) {
      throw new Error("JOURNEY_END_TIME_INVALID");
    }
  }

  const journey: DestinationJourney = Object.freeze({
    journeyId: input.journeyId,
    subjectId: input.subjectId,
    destinationId: input.destinationId,
    profileType: input.profileType,
    status: "active",
    startedAt: input.startedAt,
    ...(input.expectedEndAt ? { expectedEndAt: input.expectedEndAt } : {}),
    interests: cleanInterests(input.interests ?? []),
    ...(input.partyProfile ? { partyProfile: input.partyProfile } : {}),
    ...(input.acquisitionCycleId
      ? { acquisitionCycleId: input.acquisitionCycleId }
      : {}),
    experiences: Object.freeze([]),
    createdAt: input.startedAt,
    updatedAt: input.startedAt,
  });

  return { journey, event: "JourneyStarted" };
}

export function updateJourneyContext(
  journey: DestinationJourney,
  input: Readonly<{
    profileType?: JourneyProfileType;
    interests?: readonly string[];
    partyProfile?: string;
    occurredAt: string;
  }>,
): JourneyMutationResult {
  requireActive(journey);

  const occurredAt = parseTime(input.occurredAt);
  const currentUpdatedAt = parseTime(journey.updatedAt);
  if (
    occurredAt === null ||
    currentUpdatedAt === null ||
    occurredAt < currentUpdatedAt
  ) {
    throw new Error("JOURNEY_UPDATE_TIME_INVALID");
  }

  const updated: DestinationJourney = Object.freeze({
    ...journey,
    ...(input.profileType ? { profileType: input.profileType } : {}),
    ...(input.interests ? { interests: cleanInterests(input.interests) } : {}),
    ...(input.partyProfile ? { partyProfile: input.partyProfile } : {}),
    updatedAt: input.occurredAt,
  });

  return { journey: updated, event: "JourneyUpdated" };
}

export function linkJourneyIdentity(
  journey: DestinationJourney,
  input: Readonly<{
    userId: string;
    identityBridgeAuthorized: boolean;
    occurredAt: string;
  }>,
): JourneyMutationResult {
  requireActive(journey);

  if (!input.identityBridgeAuthorized) {
    throw new Error("JOURNEY_IDENTITY_LINK_NOT_AUTHORIZED");
  }
  if (!ID.test(input.userId)) {
    throw new Error("JOURNEY_USER_ID_INVALID");
  }
  if (journey.userId && journey.userId !== input.userId) {
    throw new Error("JOURNEY_IDENTITY_LINK_CONFLICT");
  }
  if (parseTime(input.occurredAt) === null) {
    throw new Error("JOURNEY_IDENTITY_LINK_TIME_INVALID");
  }

  const updated: DestinationJourney = Object.freeze({
    ...journey,
    userId: input.userId,
    updatedAt: input.occurredAt,
  });

  return { journey: updated, event: "JourneyUpdated" };
}

export function recordJourneyExperience(
  journey: DestinationJourney,
  experience: JourneyExperienceReference,
): JourneyMutationResult {
  requireActive(journey);

  if (!ID.test(experience.referenceId) || !ID.test(experience.placeId)) {
    throw new Error("JOURNEY_EXPERIENCE_ID_INVALID");
  }
  if (parseTime(experience.occurredAt) === null) {
    throw new Error("JOURNEY_EXPERIENCE_TIME_INVALID");
  }
  if (!experience.verificationType.trim()) {
    throw new Error("JOURNEY_EXPERIENCE_VERIFICATION_INVALID");
  }
  if (
    experience.kind === "visited" &&
    (!experience.proofDigest || !PROOF_DIGEST.test(experience.proofDigest))
  ) {
    throw new Error("JOURNEY_VISIT_PROOF_REQUIRED");
  }

  const replay = journey.experiences.some(
    (item) => item.referenceId === experience.referenceId,
  );
  if (replay) return { journey, event: "JourneyUpdated" };

  const updated: DestinationJourney = Object.freeze({
    ...journey,
    experiences: Object.freeze([...journey.experiences, experience]),
    updatedAt: experience.occurredAt,
  });

  return { journey: updated, event: "JourneyUpdated" };
}

export function closeJourney(
  journey: DestinationJourney,
  input: Readonly<{
    status: "completed" | "expired";
    occurredAt: string;
  }>,
): JourneyMutationResult {
  requireActive(journey);

  const occurredAt = parseTime(input.occurredAt);
  const startedAt = parseTime(journey.startedAt);
  if (occurredAt === null || startedAt === null || occurredAt < startedAt) {
    throw new Error("JOURNEY_CLOSE_TIME_INVALID");
  }

  const updated: DestinationJourney = Object.freeze({
    ...journey,
    status: input.status,
    updatedAt: input.occurredAt,
  });

  return {
    journey: updated,
    event: input.status === "completed" ? "JourneyCompleted" : "JourneyUpdated",
  };
}
