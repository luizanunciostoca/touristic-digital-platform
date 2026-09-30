import { describe, expect, it } from "vitest";

import {
  flattenCandidateSources,
  nextBestActionMayAuthorizeValue,
  orchestrateNextBestActions,
} from "./domain.js";

const context = {
  journeyId: "journey_00000001",
  subjectId: "asub_00000001",
  destinationId: "morro",
  profileType: "tourist" as const,
  locale: "pt-BR",
  interests: ["beach", "sunset"],
  occurredAt: "2026-09-30T16:00:00.000Z",
};

const signals = {
  activeMissionTargets: new Set(["place_second_beach"]),
  availableRewardTargets: new Set(["place_sunset"]),
  validTargetReferences: new Set([
    "place_second_beach",
    "place_sunset",
    "place_invalid_expired",
  ]),
};

describe("journey orchestrator", () => {
  it("ranks deterministic advisory actions from valid target references", () => {
    const actions = orchestrateNextBestActions(
      context,
      [
        {
          actionType: "navigate",
          targetReference: "place_second_beach",
          source: "map",
          baseScore: 50,
          tags: ["beach"],
          distanceMeters: 300,
          expiresAt: null,
        },
        {
          actionType: "view_place",
          targetReference: "place_sunset",
          source: "search",
          baseScore: 55,
          tags: ["sunset"],
          distanceMeters: 1200,
          expiresAt: null,
        },
      ],
      signals,
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]?.targetReference).toBe("place_second_beach");
    expect(actions[0]?.rationaleCode).toBe("NEARBY");
    expect(actions.every((action) => action.authority === "advisory")).toBe(
      true,
    );
  });

  it("rejects unknown and expired targets before recommendation", () => {
    const actions = orchestrateNextBestActions(
      context,
      [
        {
          actionType: "view_place",
          targetReference: "not_in_owner_catalog",
          source: "search",
          baseScore: 99,
          tags: ["beach"],
          distanceMeters: 10,
          expiresAt: null,
        },
        {
          actionType: "reward",
          targetReference: "place_invalid_expired",
          source: "reward",
          baseScore: 99,
          tags: ["sunset"],
          distanceMeters: 10,
          expiresAt: "2026-09-30T15:00:00.000Z",
        },
      ],
      signals,
    );

    expect(actions).toEqual([]);
  });

  it("degrades gracefully when optional candidate sources are unavailable", () => {
    const candidates = flattenCandidateSources([
      {
        status: "unavailable",
        code: "SEARCH_UNAVAILABLE",
      },
      {
        status: "available",
        candidates: [
          {
            actionType: "open_map",
            targetReference: "place_second_beach",
            source: "map",
            baseScore: 50,
            tags: ["beach"],
            distanceMeters: 400,
            expiresAt: null,
          },
        ],
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(
      orchestrateNextBestActions(context, candidates, signals),
    ).toHaveLength(1);
  });

  it("deduplicates the same action and keeps the highest score", () => {
    const actions = orchestrateNextBestActions(
      context,
      [
        {
          actionType: "view_place",
          targetReference: "place_sunset",
          source: "search",
          baseScore: 20,
          tags: [],
          distanceMeters: null,
          expiresAt: null,
        },
        {
          actionType: "view_place",
          targetReference: "place_sunset",
          source: "catalog",
          baseScore: 80,
          tags: ["sunset"],
          distanceMeters: 100,
          expiresAt: null,
        },
      ],
      signals,
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]?.relevanceScore).toBe(100);
  });

  it("never authorizes XP, reward, commission or money", () => {
    expect(nextBestActionMayAuthorizeValue()).toBe(false);
  });
});
