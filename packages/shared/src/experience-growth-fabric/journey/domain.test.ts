import { describe, expect, it } from "vitest";

import {
  closeJourney,
  createDestinationJourney,
  linkJourneyIdentity,
  recordJourneyExperience,
  updateJourneyContext,
} from "./domain.js";

function createJourney() {
  const result = createDestinationJourney({
    journeyId: "journey_00000001",
    subjectId: "subject_00000001",
    destinationId: "morro",
    profileType: "unknown",
    startedAt: "2026-09-01T12:00:00.000Z",
    interests: ["praias", "gastronomia"],
  });
  return result.journey;
}

describe("destination journey", () => {
  it("starts anonymous and destination-scoped without PII", () => {
    const journey = createJourney();

    expect(journey.userId).toBeUndefined();
    expect(journey.destinationId).toBe("morro");
    expect(journey.subjectId).toBe("subject_00000001");
    expect(journey.status).toBe("active");
  });

  it("links identity only through an authorized bridge", () => {
    const journey = createJourney();

    expect(() =>
      linkJourneyIdentity(journey, {
        userId: "user_00000001",
        identityBridgeAuthorized: false,
        occurredAt: "2026-09-02T12:00:00.000Z",
      }),
    ).toThrow("JOURNEY_IDENTITY_LINK_NOT_AUTHORIZED");

    const linked = linkJourneyIdentity(journey, {
      userId: "user_00000001",
      identityBridgeAuthorized: true,
      occurredAt: "2026-09-02T12:00:00.000Z",
    });
    expect(linked.journey.userId).toBe("user_00000001");
  });

  it("fails closed on conflicting identity links", () => {
    const linked = linkJourneyIdentity(createJourney(), {
      userId: "user_00000001",
      identityBridgeAuthorized: true,
      occurredAt: "2026-09-02T12:00:00.000Z",
    });

    expect(() =>
      linkJourneyIdentity(linked.journey, {
        userId: "user_00000002",
        identityBridgeAuthorized: true,
        occurredAt: "2026-09-03T12:00:00.000Z",
      }),
    ).toThrow("JOURNEY_IDENTITY_LINK_CONFLICT");
  });

  it("updates persona and interests without changing ownership", () => {
    const journey = createJourney();
    const updated = updateJourneyContext(journey, {
      profileType: "tourist",
      interests: ["praias", "passeios", "praias"],
      partyProfile: "couple",
      occurredAt: "2026-09-02T12:00:00.000Z",
    });

    expect(updated.journey.profileType).toBe("tourist");
    expect(updated.journey.interests).toEqual(["praias", "passeios"]);
    expect(updated.journey.subjectId).toBe(journey.subjectId);
  });

  it("stores derived visit proof instead of raw geolocation", () => {
    const journey = createJourney();
    const result = recordJourneyExperience(journey, {
      referenceId: "visit_00000001",
      kind: "visited",
      placeId: "place_00000001",
      occurredAt: "2026-09-03T12:00:00.000Z",
      verificationType: "geofence_dwell_v1",
      proofDigest: "a".repeat(64),
    });

    expect(result.journey.experiences).toHaveLength(1);
    const experience = result.journey.experiences[0];
    expect(experience?.placeId).toBe("place_00000001");
    expect("latitude" in (experience ?? {})).toBe(false);
    expect("longitude" in (experience ?? {})).toBe(false);
  });

  it("requires proof for verified visits and deduplicates references", () => {
    const journey = createJourney();

    expect(() =>
      recordJourneyExperience(journey, {
        referenceId: "visit_00000001",
        kind: "visited",
        placeId: "place_00000001",
        occurredAt: "2026-09-03T12:00:00.000Z",
        verificationType: "geofence_dwell_v1",
      }),
    ).toThrow("JOURNEY_VISIT_PROOF_REQUIRED");

    const first = recordJourneyExperience(journey, {
      referenceId: "discover_00000001",
      kind: "discovered",
      placeId: "place_00000001",
      occurredAt: "2026-09-03T12:00:00.000Z",
      verificationType: "server_observed",
    });
    const replay = recordJourneyExperience(first.journey, {
      referenceId: "discover_00000001",
      kind: "discovered",
      placeId: "place_00000001",
      occurredAt: "2026-09-03T12:00:00.000Z",
      verificationType: "server_observed",
    });

    expect(replay.journey.experiences).toHaveLength(1);
  });

  it("closes a journey without affecting other domain state", () => {
    const result = closeJourney(createJourney(), {
      status: "completed",
      occurredAt: "2026-09-10T12:00:00.000Z",
    });

    expect(result.journey.status).toBe("completed");
    expect(result.event).toBe("JourneyCompleted");
  });
});
