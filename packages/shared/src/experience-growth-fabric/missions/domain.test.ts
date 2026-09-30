import { describe, expect, it } from "vitest";

import {
  applyMissionEvidence,
  createMissionProgress,
  createMissionRevision,
  isMissionEligibleForProfile,
  publishMissionDefinition,
  validateMissionDefinition,
} from "./domain.js";

const draft = validateMissionDefinition({
  missionId: "mission_beaches",
  version: 1,
  destinationId: "morro",
  status: "draft",
  eligibleProfiles: ["tourist", "resident"],
  steps: [
    {
      stepId: "step_map",
      ordinal: 1,
      label: "Abra o mapa",
      evidence: {
        minimumTrustClass: "session_verified",
        acceptedEventTypes: ["MapOpened"],
        distinctReferenceRequired: false,
      },
    },
    {
      stepId: "step_visit",
      ordinal: 2,
      label: "Visite uma praia",
      evidence: {
        minimumTrustClass: "experience_verified",
        acceptedEventTypes: ["PlaceVisitVerified", "TicketCheckedIn"],
        distinctReferenceRequired: true,
      },
    },
  ],
});

const published = publishMissionDefinition(
  draft,
  "2026-09-29T12:00:00.000Z",
);

function newProgress() {
  return createMissionProgress(published, {
    subjectId: "asub_00000001",
    journeyId: "journey_00000001",
    destinationId: "morro",
  });
}

describe("mission engine", () => {
  it("publishes immutable mission versions and creates revisions", () => {
    expect(published.status).toBe("published");
    expect(Object.isFrozen(published)).toBe(true);

    const revision = createMissionRevision(published, {
      missionId: published.missionId,
      destinationId: published.destinationId,
      eligibleProfiles: published.eligibleProfiles,
      steps: published.steps,
    });

    expect(revision.version).toBe(2);
    expect(revision.status).toBe("draft");
  });

  it("enforces tourist/resident eligibility policy", () => {
    expect(isMissionEligibleForProfile(published, "tourist")).toBe(true);
    expect(isMissionEligibleForProfile(published, "resident")).toBe(true);
    expect(isMissionEligibleForProfile(published, "visitor")).toBe(false);
  });

  it("rejects low-trust evidence for verified experience steps", () => {
    const decision = applyMissionEvidence(published, newProgress(), {
      evidenceId: "evidence_00000001",
      stepId: "step_visit",
      subjectId: "asub_00000001",
      journeyId: "journey_00000001",
      destinationId: "morro",
      eventType: "PlaceVisitVerified",
      trustClass: "behavioral",
      reference: "place_second_beach",
      occurredAt: "2026-09-29T13:00:00.000Z",
    });

    expect(decision.kind).toBe("rejected");
    if (decision.kind !== "rejected") return;
    expect(decision.code).toBe("MISSION_TRUST_INSUFFICIENT");
  });

  it("progresses deterministically and completes only after all steps", () => {
    const first = applyMissionEvidence(published, newProgress(), {
      evidenceId: "evidence_00000001",
      stepId: "step_map",
      subjectId: "asub_00000001",
      journeyId: "journey_00000001",
      destinationId: "morro",
      eventType: "MapOpened",
      trustClass: "session_verified",
      reference: "session_map_00000001",
      occurredAt: "2026-09-29T13:00:00.000Z",
    });

    expect(first.kind).toBe("progressed");
    if (first.kind !== "progressed") return;

    const completed = applyMissionEvidence(published, first.state, {
      evidenceId: "evidence_00000002",
      stepId: "step_visit",
      subjectId: "asub_00000001",
      journeyId: "journey_00000001",
      destinationId: "morro",
      eventType: "PlaceVisitVerified",
      trustClass: "experience_verified",
      reference: "place_second_beach",
      occurredAt: "2026-09-29T14:00:00.000Z",
    });

    expect(completed.kind).toBe("completed");
    if (completed.kind !== "completed") return;

    expect(completed.events).toEqual([
      "MissionProgressed",
      "MissionCompleted",
    ]);
    expect(completed.completionKey).toBe(
      "journey_00000001:mission_beaches:1",
    );
  });

  it("treats duplicate evidence as replay without double completion", () => {
    const first = applyMissionEvidence(published, newProgress(), {
      evidenceId: "evidence_00000001",
      stepId: "step_map",
      subjectId: "asub_00000001",
      journeyId: "journey_00000001",
      destinationId: "morro",
      eventType: "MapOpened",
      trustClass: "session_verified",
      reference: "session_map_00000001",
      occurredAt: "2026-09-29T13:00:00.000Z",
    });
    if (first.kind !== "progressed") {
      throw new Error("MISSION_FIRST_PROGRESS_FAILED");
    }

    const replay = applyMissionEvidence(published, first.state, {
      evidenceId: "evidence_00000001",
      stepId: "step_map",
      subjectId: "asub_00000001",
      journeyId: "journey_00000001",
      destinationId: "morro",
      eventType: "MapOpened",
      trustClass: "session_verified",
      reference: "session_map_00000001",
      occurredAt: "2026-09-29T13:00:00.000Z",
    });

    expect(replay.kind).toBe("replayed");
    expect(replay.state.completedStepIds).toEqual(["step_map"]);
  });

  it("rejects duplicate references when distinct evidence is required", () => {
    const definition = publishMissionDefinition(
      validateMissionDefinition({
        missionId: "mission_three_places",
        version: 1,
        destinationId: "morro",
        status: "draft",
        eligibleProfiles: ["tourist"],
        steps: [
          {
            stepId: "step_place",
            ordinal: 1,
            label: "Explore local",
            evidence: {
              minimumTrustClass: "session_verified",
              acceptedEventTypes: ["PlaceViewed"],
              distinctReferenceRequired: true,
            },
          },
        ],
      }),
      "2026-09-29T12:00:00.000Z",
    );

    const progress = createMissionProgress(definition, {
      subjectId: "asub_00000001",
      journeyId: "journey_00000001",
      destinationId: "morro",
    });

    const first = applyMissionEvidence(definition, progress, {
      evidenceId: "evidence_1",
      stepId: "step_place",
      subjectId: "asub_00000001",
      journeyId: "journey_00000001",
      destinationId: "morro",
      eventType: "PlaceViewed",
      trustClass: "session_verified",
      reference: "place_1",
      occurredAt: "2026-09-29T13:00:00.000Z",
    });

    expect(first.kind).toBe("completed");
  });
});
