import { describe, expect, it } from "vitest";

import {
  createAffiliateAcquisitionPolicyV2,
  evaluateAcquisitionV2,
} from "../acquisition/index.js";
import {
  affiliateXpBalance,
  appendAffiliateXp,
  evaluateQualifiedReferral,
} from "../affiliate-growth/index.js";
import {
  appendXpEntry,
  calculateXpBalance,
  createEmptyXpLedgerState,
  reduceXpLedger,
} from "../engagement/index.js";
import {
  claimConsumerEvent,
  claimOutboxEvent,
  createOutboxEvent,
  markOutboxDelivered,
} from "../event-fabric/index.js";
import {
  assignExperiment,
  recordExperimentExposure,
  validateExperimentDefinition,
} from "../experimentation/index.js";
import {
  evaluateGrowthRequestGuard,
  GROWTH_HTTP_ROUTES,
} from "../http/index.js";
import {
  createDestinationJourney,
  linkJourneyIdentity,
  recordJourneyExperience,
} from "../journey/index.js";
import {
  applyMissionEvidence,
  createMissionProgress,
  publishMissionDefinition,
  validateMissionDefinition,
} from "../missions/index.js";
import {
  applyGrowthProjectionEvent,
  createGrowthProjectionState,
} from "../projections/index.js";
import {
  createReferralCampaign,
  createReferralPlacement,
  issueReferralToken,
  resolveReferralToken,
} from "../referrals/index.js";
import {
  createRewardInventory,
  publishRewardDefinition,
  redeemReward,
  unlockReward,
  validateRewardDefinition,
} from "../rewards/index.js";
import {
  createRiskAssessment,
  evaluateRiskDecision,
} from "../trust-risk/index.js";

const destinationId = "morro";
const subjectId = "asub_00000001";
const affiliateId = "aff_00000001";
const journeyId = "journey_00000001";

describe("Experience & Growth Fabric full isolated E2E", () => {
  it("executes referral to acquisition to journey to mission to reward safely", () => {
    const campaign = createReferralCampaign({
      campaignId: "campaign_00000001",
      affiliateId,
      programId: "apg_00000001",
      destinationId,
      status: "active",
      createdAt: "2026-09-30T10:00:00.000Z",
    });
    const placement = createReferralPlacement({
      placementId: "plc_00000001",
      affiliateId,
      campaignId: campaign.campaignId,
      programId: campaign.programId,
      destinationId,
      channel: "permanent_qr",
      status: "active",
      riskPolicyVersion: "RISK-V1",
      createdAt: "2026-09-30T10:00:00.000Z",
    });
    const token = issueReferralToken(placement, {
      tokenId: "token_00000001",
      opaqueCode: "abcdefghijklmnopqrstuvwx",
      publicCodeHash: "a".repeat(64),
      issuedAt: "2026-09-30T10:00:00.000Z",
      kind: "q",
    });
    const resolved = resolveReferralToken(
      campaign,
      placement,
      token.record,
      {
        publicCodeHash: "a".repeat(64),
        returnPath: "/explore",
        occurredAt: "2026-09-30T10:01:00.000Z",
        attemptCountInWindow: 0,
        maximumAttemptsInWindow: 20,
      },
    );
    expect(resolved.accepted).toBe(true);
    if (!resolved.accepted) throw new Error("REFERRAL_RESOLUTION_FAILED");

    const policy = createAffiliateAcquisitionPolicyV2({
      attributionWindowDays: 30,
      reacquisitionInactivityDays: 14,
      minimumMeaningfulSignals: 1,
    });
    const acquisitionInput = {
      commandId: "acq_command_00000001",
      proposedCycleId: "cycle_00000001",
      proposedTouchpointId: "touch_00000001",
      subjectId,
      destinationId,
      affiliateId,
      placementId: resolved.placementId,
      serverValidatedPlacement: true,
      affiliateEligible: true,
      riskAllowed: true,
      meaningfulSignalCount: 1,
      occurredAt: "2026-09-30T10:02:00.000Z",
    };
    const acquired = evaluateAcquisitionV2(
      acquisitionInput,
      policy,
      null,
    );
    expect(acquired.kind).toBe("acquired");
    if (acquired.kind !== "acquired") {
      throw new Error("ACQUISITION_FAILED");
    }

    const acquisitionReplay = evaluateAcquisitionV2(
      acquisitionInput,
      policy,
      acquired.cycle,
      new Set([acquisitionInput.commandId]),
    );
    expect(acquisitionReplay.kind).toBe("replayed");

    const started = createDestinationJourney({
      journeyId,
      subjectId,
      destinationId,
      profileType: "tourist",
      startedAt: "2026-09-30T10:03:00.000Z",
      interests: ["beach", "sunset"],
      acquisitionCycleId: acquired.cycle.cycleId,
    });
    expect(started.event).toBe("JourneyStarted");

    const linked = linkJourneyIdentity(started.journey, {
      userId: "user_00000001",
      identityBridgeAuthorized: true,
      occurredAt: "2026-09-30T10:04:00.000Z",
    });
    expect(linked.journey.userId).toBe("user_00000001");

    const visited = recordJourneyExperience(linked.journey, {
      referenceId: "experience_00000001",
      kind: "visited",
      placeId: "place_second_beach",
      occurredAt: "2026-09-30T10:05:00.000Z",
      verificationType: "server_verified_visit",
      proofDigest: "b".repeat(64),
    });
    expect(visited.journey.experiences).toHaveLength(1);

    const mission = publishMissionDefinition(
      validateMissionDefinition({
        missionId: "mission_beaches",
        version: 1,
        destinationId,
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
              acceptedEventTypes: ["PlaceVisitVerified"],
              distinctReferenceRequired: true,
            },
          },
        ],
      }),
      "2026-09-30T10:00:00.000Z",
    );

    const initialProgress = createMissionProgress(mission, {
      subjectId,
      journeyId,
      destinationId,
    });
    const mapProgress = applyMissionEvidence(
      mission,
      initialProgress,
      {
        evidenceId: "evidence_map_00000001",
        stepId: "step_map",
        subjectId,
        journeyId,
        destinationId,
        eventType: "MapOpened",
        trustClass: "session_verified",
        reference: "session_map_00000001",
        occurredAt: "2026-09-30T10:06:00.000Z",
      },
    );
    expect(mapProgress.kind).toBe("progressed");
    if (mapProgress.kind !== "progressed") {
      throw new Error("MISSION_MAP_PROGRESS_FAILED");
    }

    const completed = applyMissionEvidence(
      mission,
      mapProgress.state,
      {
        evidenceId: "evidence_visit_00000001",
        stepId: "step_visit",
        subjectId,
        journeyId,
        destinationId,
        eventType: "PlaceVisitVerified",
        trustClass: "experience_verified",
        reference: "place_second_beach",
        occurredAt: "2026-09-30T10:07:00.000Z",
      },
    );
    expect(completed.kind).toBe("completed");
    if (completed.kind !== "completed") {
      throw new Error("MISSION_COMPLETION_FAILED");
    }

    const missionReplay = applyMissionEvidence(
      mission,
      completed.state,
      {
        evidenceId: "evidence_visit_00000001",
        stepId: "step_visit",
        subjectId,
        journeyId,
        destinationId,
        eventType: "PlaceVisitVerified",
        trustClass: "experience_verified",
        reference: "place_second_beach",
        occurredAt: "2026-09-30T10:07:00.000Z",
      },
    );
    expect(missionReplay.kind).toBe("replayed");

    const xpEntry = {
      entryId: "xp_00000001",
      subjectId,
      journeyId,
      destinationId,
      amountSigned: 120,
      reasonCode: "MISSION_COMPLETED",
      sourceEventId: "event_mission_completed_00000001",
      evidenceReference: completed.completionKey,
      idempotencyKey: "xp:mission:00000001",
      policyVersion: "ENGAGEMENT-POLICY-V1",
      trustClass: "experience_verified" as const,
      occurredAt: "2026-09-30T10:08:00.000Z",
    };
    const xpDecision = appendXpEntry(
      createEmptyXpLedgerState(),
      xpEntry,
    );
    expect(xpDecision.kind).toBe("appended");
    const xpState = reduceXpLedger(
      createEmptyXpLedgerState(),
      xpDecision,
    );
    expect(calculateXpBalance(xpState.entries, subjectId, destinationId)).toBe(
      120,
    );
    expect(appendXpEntry(xpState, xpEntry).kind).toBe("replayed");

    const riskPolicy = {
      version: "RISK-V1",
      reviewScore: 40,
      blockScore: 80,
      minimumTrustByAction: {
        guide_read: "behavioral",
        low_value_progress: "session_verified",
        experience_reward: "experience_verified",
        financial_value: "financial_authoritative",
      },
      immediateBlockSignals: ["SELF_REFERRAL", "REPLAY"],
    } as const;
    const riskAssessment = createRiskAssessment({
      assessmentId: "risk_00000001",
      subjectId,
      destinationId,
      trustLevel: "experience_verified",
      signals: [],
      policyVersion: "RISK-V1",
      assessedAt: "2026-09-30T10:09:00.000Z",
    });
    expect(
      evaluateRiskDecision(
        riskAssessment,
        "experience_reward",
        riskPolicy,
      ).outcome,
    ).toBe("allow");

    const reward = publishRewardDefinition(
      validateRewardDefinition({
        rewardId: "reward_sunset_access",
        version: 1,
        destinationId,
        label: "Acesso antecipado",
        status: "draft",
        validFrom: "2026-09-01T00:00:00.000Z",
        validUntil: "2026-12-31T23:59:59.000Z",
        funding: {
          fundingClass: "access-based",
          sponsorReference: "business_00000001",
          estimatedCostMinorUnits: 0,
          perceivedValueMinorUnits: 2500,
          currency: "BRL",
        },
        eligibility: {
          eligibleProfiles: ["tourist", "resident"],
          minimumTrustClass: "experience_verified",
          requiredMissionIds: ["mission_beaches"],
          maximumRedemptionsPerSubject: 1,
        },
      }),
      "2026-09-01T00:00:00.000Z",
    );
    const unlocked = unlockReward(
      reward,
      createRewardInventory({
        rewardId: reward.rewardId,
        rewardVersion: reward.version,
        totalUnits: 2,
      }),
      {
        subjectId,
        journeyId,
        destinationId,
        profileType: "tourist",
        trustClass: "experience_verified",
        completedMissionIds: ["mission_beaches"],
        existingRedemptionCount: 0,
        eligibilityEvidenceReference: completed.completionKey,
        occurredAt: "2026-09-30T10:10:00.000Z",
      },
      {
        entitlementId: "entitlement_00000001",
        policyVersion: "REWARD-POLICY-V1",
        idempotencyKey: "reward:redeem:00000001",
        expiresAt: "2026-10-01T10:10:00.000Z",
      },
      null,
    );
    expect(unlocked.kind).toBe("unlocked");
    if (unlocked.kind !== "unlocked") {
      throw new Error("REWARD_UNLOCK_FAILED");
    }

    const redeemed = redeemReward(
      unlocked.entitlement,
      unlocked.inventory,
      {
        idempotencyKey: unlocked.entitlement.idempotencyKey,
        occurredAt: "2026-09-30T10:11:00.000Z",
        expectedInventoryRevision: unlocked.inventory.revision,
      },
    );
    expect(redeemed.kind).toBe("redeemed");
    if (redeemed.kind !== "redeemed") {
      throw new Error("REWARD_REDEMPTION_FAILED");
    }
    expect(
      redeemReward(redeemed.entitlement, redeemed.inventory, {
        idempotencyKey: redeemed.entitlement.idempotencyKey,
        occurredAt: "2026-09-30T10:11:01.000Z",
        expectedInventoryRevision: redeemed.inventory.revision,
      }).kind,
    ).toBe("replayed");

    const qualifiedReferral = evaluateQualifiedReferral(
      {
        referralId: "qref_00000001",
        affiliateId,
        programId: campaign.programId,
        placementId: placement.placementId,
        destinationId,
        subjectId,
        activePlacement: true,
        uniqueSubjectAccepted: true,
        selfReferral: false,
        riskAllowed: true,
        meaningfulSignalCount: 2,
        minimumMeaningfulSignals: 1,
        idempotencyKey: "qualified-referral:00000001",
        occurredAt: "2026-09-30T10:12:00.000Z",
      },
      null,
    );
    expect(qualifiedReferral.qualified).toBe(true);

    const affiliateXp = appendAffiliateXp([], {
      entryId: "affiliate_xp_00000001",
      affiliateId,
      destinationId,
      amountSigned: 25,
      reasonCode: "QUALIFIED_REFERRAL",
      sourceReference: "qref_00000001",
      idempotencyKey: "affiliate-xp:qref:00000001",
      policyVersion: "AFFILIATE-GROWTH-V1",
      occurredAt: "2026-09-30T10:13:00.000Z",
    });
    expect(affiliateXp.replayed).toBe(false);
    expect(affiliateXpBalance(affiliateXp.entries, affiliateId)).toBe(25);

    const experiment = validateExperimentDefinition({
      experimentId: "exp_morro_pass",
      version: 1,
      destinationId,
      status: "running",
      saltVersion: "salt-v1",
      variants: [
        { variantId: "control", allocationBps: 5000, isControl: true },
        {
          variantId: "treatment",
          allocationBps: 5000,
          isControl: false,
        },
      ],
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z",
    });
    const assignment = assignExperiment(
      experiment,
      {
        assignmentId: "assignment_00000001",
        subjectId,
        destinationId,
        assignedAt: "2026-09-30T10:14:00.000Z",
      },
      null,
    );
    expect(assignment.assigned).toBe(true);
    if (!assignment.assigned) {
      throw new Error("EXPERIMENT_ASSIGNMENT_FAILED");
    }
    expect(
      recordExperimentExposure(
        assignment.assignment,
        {
          exposureId: "exposure_00000001",
          correlationId: "corr_00000001",
          exposedAt: "2026-09-30T10:15:00.000Z",
          assignmentPersisted: true,
        },
        null,
      ).recorded,
    ).toBe(true);

    const outbox = createOutboxEvent({
      eventId: "event_mission_completed_00000001",
      eventType: "MissionCompleted",
      aggregateType: "mission_progress",
      aggregateId: completed.completionKey,
      contractVersion: 1,
      payload: { missionId: mission.missionId },
      correlationId: "corr_00000001",
      causationId: "evidence_visit_00000001",
      availableAt: "2026-09-30T10:16:00.000Z",
    });
    const leased = claimOutboxEvent(outbox, {
      workerId: "projection-worker",
      occurredAt: "2026-09-30T10:16:00.000Z",
      policy: {
        maximumAttempts: 3,
        baseDelaySeconds: 10,
        maximumDelaySeconds: 60,
        leaseSeconds: 30,
      },
    });
    expect(leased?.status).toBe("dispatching");
    if (!leased) throw new Error("OUTBOX_LEASE_FAILED");

    const delivered = markOutboxDelivered(
      leased,
      "projection-worker",
      "2026-09-30T10:16:01.000Z",
    );
    expect(delivered.status).toBe("delivered");

    const consumerClaim = claimConsumerEvent(
      {
        consumerName: "growth-projection",
        eventId: outbox.eventId,
        semanticDigest: "c".repeat(64),
        claimedAt: "2026-09-30T10:16:02.000Z",
      },
      null,
    );
    expect(consumerClaim.kind).toBe("claimed");
    expect(
      claimConsumerEvent(
        {
          consumerName: "growth-projection",
          eventId: outbox.eventId,
          semanticDigest: "c".repeat(64),
          claimedAt: "2026-09-30T10:16:03.000Z",
        },
        consumerClaim.claim,
      ).kind,
    ).toBe("replayed");

    let projections = createGrowthProjectionState();
    const missionProjectionEvent = {
      eventId: outbox.eventId,
      type: "MissionCompleted" as const,
      destinationId,
      journeyId,
      subjectId,
      missionId: mission.missionId,
      occurredAt: "2026-09-30T10:16:01.000Z",
    };
    projections = applyGrowthProjectionEvent(
      projections,
      missionProjectionEvent,
    );
    const replayProjection = applyGrowthProjectionEvent(
      projections,
      missionProjectionEvent,
    );
    expect(replayProjection).toBe(projections);
    expect(
      projections.missions.get("morro:mission_beaches")?.completions,
    ).toBe(1);
    expect(
      projections.journeys.get("morro:journey_00000001")?.authoritative,
    ).toBe(false);

    const redeemRoute = GROWTH_HTTP_ROUTES.find(
      (route) => route.operationId === "growth.rewards.redeem",
    );
    if (!redeemRoute) throw new Error("REDEEM_ROUTE_MISSING");
    expect(
      evaluateGrowthRequestGuard(redeemRoute, {
        credentialKind: "authenticated_session",
        subjectId,
        requestDestinationId: destinationId,
        credentialDestinationIds: new Set([destinationId]),
        requestTenantId: "tenant_00000001",
        credentialTenantIds: new Set(["tenant_00000001"]),
        capabilities: new Set(["growth.read", "growth.write"]),
        sessionCookiePresent: true,
        csrfTokenPresent: true,
        csrfTokenMatchesSession: true,
        idempotencyKey: "http:reward:00000001",
        requestCountInWindow: 0,
        rateLimitMaximum: 20,
      }).allowed,
    ).toBe(true);
  });

  it("fails closed at critical value boundaries while preserving read access", () => {
    const riskPolicy = {
      version: "RISK-V1",
      reviewScore: 40,
      blockScore: 80,
      minimumTrustByAction: {
        guide_read: "behavioral",
        low_value_progress: "session_verified",
        experience_reward: "experience_verified",
        financial_value: "financial_authoritative",
      },
      immediateBlockSignals: ["SELF_REFERRAL", "REPLAY"],
    } as const;
    const suspicious = createRiskAssessment({
      assessmentId: "risk_suspicious",
      subjectId,
      destinationId,
      trustLevel: "behavioral",
      signals: [],
      policyVersion: "RISK-UNKNOWN",
      assessedAt: "2026-09-30T11:00:00.000Z",
    });

    expect(
      evaluateRiskDecision(
        suspicious,
        "guide_read",
        riskPolicy,
      ).outcome,
    ).toBe("observe");
    expect(
      evaluateRiskDecision(
        suspicious,
        "financial_value",
        riskPolicy,
      ).outcome,
    ).toBe("block");
  });
});
