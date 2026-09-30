import { describe, expect, it } from "vitest";

import {
  applyGrowthProjectionEvent,
  createGrowthProjectionState,
  growthProjectionSchemaSql,
} from "./index.js";

describe("growth projections", () => {
  it("updates journey and mission read models without becoming authority", () => {
    let state = createGrowthProjectionState();

    state = applyGrowthProjectionEvent(state, {
      eventId: "event_journey_1",
      type: "JourneyStarted",
      destinationId: "morro",
      journeyId: "journey_1",
      subjectId: "asub_1",
      occurredAt: "2026-09-30T12:00:00.000Z",
    });
    state = applyGrowthProjectionEvent(state, {
      eventId: "event_mission_1",
      type: "MissionCompleted",
      destinationId: "morro",
      journeyId: "journey_1",
      subjectId: "asub_1",
      missionId: "mission_beaches",
      occurredAt: "2026-09-30T13:00:00.000Z",
    });

    const journey = state.journeys.get("morro:journey_1");
    const mission = state.missions.get("morro:mission_beaches");

    expect(journey?.missionCompletions).toBe(1);
    expect(journey?.authoritative).toBe(false);
    expect(mission?.completions).toBe(1);
    expect(mission?.authoritative).toBe(false);
  });

  it("is idempotent for duplicate event delivery", () => {
    const event = {
      eventId: "event_reward_1",
      type: "RewardRedeemed" as const,
      destinationId: "morro",
      rewardId: "reward_1",
      occurredAt: "2026-09-30T12:00:00.000Z",
    };

    const first = applyGrowthProjectionEvent(
      createGrowthProjectionState(),
      event,
    );
    const replay = applyGrowthProjectionEvent(first, event);

    expect(replay).toBe(first);
    expect(replay.rewards.get("morro:reward_1")?.redemptions).toBe(1);
  });

  it("keeps destination scopes separated", () => {
    let state = createGrowthProjectionState();
    state = applyGrowthProjectionEvent(state, {
      eventId: "event_a",
      type: "AffiliateQualifiedReferralRecorded",
      destinationId: "morro",
      affiliateId: "aff_1",
      occurredAt: "2026-09-30T12:00:00.000Z",
    });
    state = applyGrowthProjectionEvent(state, {
      eventId: "event_b",
      type: "AffiliateQualifiedReferralRecorded",
      destinationId: "itacare",
      affiliateId: "aff_1",
      occurredAt: "2026-09-30T12:00:01.000Z",
    });

    expect(
      state.affiliates.get("morro:aff_1")?.qualifiedReferrals,
    ).toBe(1);
    expect(
      state.affiliates.get("itacare:aff_1")?.qualifiedReferrals,
    ).toBe(1);
  });

  it("aggregates experiment assignment/exposure/outcomes per variant", () => {
    let state = createGrowthProjectionState();
    for (const event of [
      {
        eventId: "exp_1",
        type: "ExperimentAssigned" as const,
        destinationId: "morro",
        experimentId: "experiment_1",
        variantId: "control",
        occurredAt: "2026-09-30T12:00:00.000Z",
      },
      {
        eventId: "exp_2",
        type: "ExperimentExposureRecorded" as const,
        destinationId: "morro",
        experimentId: "experiment_1",
        variantId: "control",
        occurredAt: "2026-09-30T12:01:00.000Z",
      },
      {
        eventId: "exp_3",
        type: "ExperimentOutcomeRecorded" as const,
        destinationId: "morro",
        experimentId: "experiment_1",
        variantId: "control",
        numericValue: 1,
        occurredAt: "2026-09-30T13:00:00.000Z",
      },
    ]) {
      state = applyGrowthProjectionEvent(state, event);
    }

    const projection = state.experiments.get(
      "morro:experiment_1:control",
    );
    expect(projection).toMatchObject({
      assignments: 1,
      exposures: 1,
      outcomeCount: 1,
      outcomeTotal: 1,
      authoritative: false,
    });
  });

  it("defines additive projection tables without destructive DDL", () => {
    for (const table of [
      "journey_progress_projection",
      "affiliate_performance_projection",
      "growth_campaign_projection",
      "reward_performance_projection",
      "mission_performance_projection",
      "experiment_outcome_projection",
    ]) {
      expect(growthProjectionSchemaSql).toContain(
        `CREATE TABLE IF NOT EXISTS ${table}`,
      );
    }
    expect(growthProjectionSchemaSql).not.toContain("DROP TABLE");
    expect(growthProjectionSchemaSql).not.toContain("ALTER TABLE");
  });
});
