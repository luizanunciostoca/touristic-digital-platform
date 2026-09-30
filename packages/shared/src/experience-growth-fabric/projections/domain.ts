export type GrowthProjectionEventType =
  | "JourneyStarted"
  | "JourneyCompleted"
  | "QualifiedAcquisitionEstablished"
  | "AffiliateQualifiedReferralRecorded"
  | "GuideActivated"
  | "ExperienceConsumed"
  | "MissionProgressed"
  | "MissionCompleted"
  | "RewardUnlocked"
  | "RewardRedeemed"
  | "RewardExpired"
  | "RewardInventoryExhausted"
  | "ExperimentAssigned"
  | "ExperimentExposureRecorded"
  | "ExperimentOutcomeRecorded";

export interface GrowthProjectionEvent {
  readonly eventId: string;
  readonly type: GrowthProjectionEventType;
  readonly destinationId: string;
  readonly occurredAt: string;
  readonly journeyId?: string;
  readonly subjectId?: string;
  readonly affiliateId?: string;
  readonly campaignId?: string;
  readonly missionId?: string;
  readonly rewardId?: string;
  readonly experimentId?: string;
  readonly variantId?: string;
  readonly numericValue?: number;
}

export interface JourneyProgressProjection {
  readonly journeyId: string;
  readonly destinationId: string;
  readonly subjectId: string;
  readonly status: "active" | "completed";
  readonly missionProgressEvents: number;
  readonly missionCompletions: number;
  readonly rewardUnlocks: number;
  readonly updatedAt: string;
  readonly authoritative: false;
}

export interface AffiliatePerformanceProjection {
  readonly affiliateId: string;
  readonly destinationId: string;
  readonly qualifiedAcquisitions: number;
  readonly qualifiedReferrals: number;
  readonly guideActivations: number;
  readonly successfulExperiences: number;
  readonly updatedAt: string;
  readonly authoritative: false;
}

export interface GrowthCampaignProjection {
  readonly campaignId: string;
  readonly destinationId: string;
  readonly qualifiedAcquisitions: number;
  readonly guideActivations: number;
  readonly successfulExperiences: number;
  readonly updatedAt: string;
  readonly authoritative: false;
}

export interface RewardPerformanceProjection {
  readonly rewardId: string;
  readonly destinationId: string;
  readonly unlocks: number;
  readonly redemptions: number;
  readonly expirations: number;
  readonly inventoryExhaustions: number;
  readonly updatedAt: string;
  readonly authoritative: false;
}

export interface MissionPerformanceProjection {
  readonly missionId: string;
  readonly destinationId: string;
  readonly progressEvents: number;
  readonly completions: number;
  readonly updatedAt: string;
  readonly authoritative: false;
}

export interface ExperimentOutcomeProjection {
  readonly experimentId: string;
  readonly variantId: string;
  readonly destinationId: string;
  readonly assignments: number;
  readonly exposures: number;
  readonly outcomeCount: number;
  readonly outcomeTotal: number;
  readonly updatedAt: string;
  readonly authoritative: false;
}

export interface GrowthProjectionState {
  readonly processedEventIds: ReadonlySet<string>;
  readonly journeys: ReadonlyMap<string, JourneyProgressProjection>;
  readonly affiliates: ReadonlyMap<string, AffiliatePerformanceProjection>;
  readonly campaigns: ReadonlyMap<string, GrowthCampaignProjection>;
  readonly rewards: ReadonlyMap<string, RewardPerformanceProjection>;
  readonly missions: ReadonlyMap<string, MissionPerformanceProjection>;
  readonly experiments: ReadonlyMap<string, ExperimentOutcomeProjection>;
}

const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function key(destinationId: string, reference: string): string {
  return [destinationId, reference].join(":");
}

export function createGrowthProjectionState(): GrowthProjectionState {
  return {
    processedEventIds: new Set(),
    journeys: new Map(),
    affiliates: new Map(),
    campaigns: new Map(),
    rewards: new Map(),
    missions: new Map(),
    experiments: new Map(),
  };
}

function assertEvent(event: GrowthProjectionEvent): void {
  if (!event.eventId || !event.destinationId || !isUtc(event.occurredAt)) {
    throw new Error("GROWTH_PROJECTION_EVENT_INVALID");
  }
  if (
    event.numericValue !== undefined &&
    !Number.isFinite(event.numericValue)
  ) {
    throw new Error("GROWTH_PROJECTION_NUMERIC_VALUE_INVALID");
  }
}

export function applyGrowthProjectionEvent(
  state: GrowthProjectionState,
  event: GrowthProjectionEvent,
): GrowthProjectionState {
  assertEvent(event);
  if (state.processedEventIds.has(event.eventId)) return state;

  const processedEventIds = new Set(state.processedEventIds);
  processedEventIds.add(event.eventId);

  const journeys = new Map(state.journeys);
  const affiliates = new Map(state.affiliates);
  const campaigns = new Map(state.campaigns);
  const rewards = new Map(state.rewards);
  const missions = new Map(state.missions);
  const experiments = new Map(state.experiments);

  if (event.journeyId && event.subjectId) {
    const projectionKey = key(event.destinationId, event.journeyId);
    const previous =
      journeys.get(projectionKey) ??
      ({
        journeyId: event.journeyId,
        destinationId: event.destinationId,
        subjectId: event.subjectId,
        status: "active",
        missionProgressEvents: 0,
        missionCompletions: 0,
        rewardUnlocks: 0,
        updatedAt: event.occurredAt,
        authoritative: false,
      } satisfies JourneyProgressProjection);

    journeys.set(projectionKey, {
      ...previous,
      status: event.type === "JourneyCompleted" ? "completed" : previous.status,
      missionProgressEvents:
        previous.missionProgressEvents +
        (event.type === "MissionProgressed" ? 1 : 0),
      missionCompletions:
        previous.missionCompletions +
        (event.type === "MissionCompleted" ? 1 : 0),
      rewardUnlocks:
        previous.rewardUnlocks + (event.type === "RewardUnlocked" ? 1 : 0),
      updatedAt: event.occurredAt,
    });
  }

  if (event.affiliateId) {
    const projectionKey = key(event.destinationId, event.affiliateId);
    const previous =
      affiliates.get(projectionKey) ??
      ({
        affiliateId: event.affiliateId,
        destinationId: event.destinationId,
        qualifiedAcquisitions: 0,
        qualifiedReferrals: 0,
        guideActivations: 0,
        successfulExperiences: 0,
        updatedAt: event.occurredAt,
        authoritative: false,
      } satisfies AffiliatePerformanceProjection);

    affiliates.set(projectionKey, {
      ...previous,
      qualifiedAcquisitions:
        previous.qualifiedAcquisitions +
        (event.type === "QualifiedAcquisitionEstablished" ? 1 : 0),
      qualifiedReferrals:
        previous.qualifiedReferrals +
        (event.type === "AffiliateQualifiedReferralRecorded" ? 1 : 0),
      guideActivations:
        previous.guideActivations + (event.type === "GuideActivated" ? 1 : 0),
      successfulExperiences:
        previous.successfulExperiences +
        (event.type === "ExperienceConsumed" ? 1 : 0),
      updatedAt: event.occurredAt,
    });
  }

  if (event.campaignId) {
    const projectionKey = key(event.destinationId, event.campaignId);
    const previous =
      campaigns.get(projectionKey) ??
      ({
        campaignId: event.campaignId,
        destinationId: event.destinationId,
        qualifiedAcquisitions: 0,
        guideActivations: 0,
        successfulExperiences: 0,
        updatedAt: event.occurredAt,
        authoritative: false,
      } satisfies GrowthCampaignProjection);

    campaigns.set(projectionKey, {
      ...previous,
      qualifiedAcquisitions:
        previous.qualifiedAcquisitions +
        (event.type === "QualifiedAcquisitionEstablished" ? 1 : 0),
      guideActivations:
        previous.guideActivations + (event.type === "GuideActivated" ? 1 : 0),
      successfulExperiences:
        previous.successfulExperiences +
        (event.type === "ExperienceConsumed" ? 1 : 0),
      updatedAt: event.occurredAt,
    });
  }

  if (event.rewardId) {
    const projectionKey = key(event.destinationId, event.rewardId);
    const previous =
      rewards.get(projectionKey) ??
      ({
        rewardId: event.rewardId,
        destinationId: event.destinationId,
        unlocks: 0,
        redemptions: 0,
        expirations: 0,
        inventoryExhaustions: 0,
        updatedAt: event.occurredAt,
        authoritative: false,
      } satisfies RewardPerformanceProjection);

    rewards.set(projectionKey, {
      ...previous,
      unlocks: previous.unlocks + (event.type === "RewardUnlocked" ? 1 : 0),
      redemptions:
        previous.redemptions + (event.type === "RewardRedeemed" ? 1 : 0),
      expirations:
        previous.expirations + (event.type === "RewardExpired" ? 1 : 0),
      inventoryExhaustions:
        previous.inventoryExhaustions +
        (event.type === "RewardInventoryExhausted" ? 1 : 0),
      updatedAt: event.occurredAt,
    });
  }

  if (event.missionId) {
    const projectionKey = key(event.destinationId, event.missionId);
    const previous =
      missions.get(projectionKey) ??
      ({
        missionId: event.missionId,
        destinationId: event.destinationId,
        progressEvents: 0,
        completions: 0,
        updatedAt: event.occurredAt,
        authoritative: false,
      } satisfies MissionPerformanceProjection);

    missions.set(projectionKey, {
      ...previous,
      progressEvents:
        previous.progressEvents + (event.type === "MissionProgressed" ? 1 : 0),
      completions:
        previous.completions + (event.type === "MissionCompleted" ? 1 : 0),
      updatedAt: event.occurredAt,
    });
  }

  if (event.experimentId && event.variantId) {
    const projectionKey = key(
      event.destinationId,
      [event.experimentId, event.variantId].join(":"),
    );
    const previous =
      experiments.get(projectionKey) ??
      ({
        experimentId: event.experimentId,
        variantId: event.variantId,
        destinationId: event.destinationId,
        assignments: 0,
        exposures: 0,
        outcomeCount: 0,
        outcomeTotal: 0,
        updatedAt: event.occurredAt,
        authoritative: false,
      } satisfies ExperimentOutcomeProjection);

    experiments.set(projectionKey, {
      ...previous,
      assignments:
        previous.assignments + (event.type === "ExperimentAssigned" ? 1 : 0),
      exposures:
        previous.exposures +
        (event.type === "ExperimentExposureRecorded" ? 1 : 0),
      outcomeCount:
        previous.outcomeCount +
        (event.type === "ExperimentOutcomeRecorded" ? 1 : 0),
      outcomeTotal:
        previous.outcomeTotal +
        (event.type === "ExperimentOutcomeRecorded"
          ? (event.numericValue ?? 0)
          : 0),
      updatedAt: event.occurredAt,
    });
  }

  return {
    processedEventIds,
    journeys,
    affiliates,
    campaigns,
    rewards,
    missions,
    experiments,
  };
}
