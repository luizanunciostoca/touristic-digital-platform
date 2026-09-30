import { describe, expect, it } from "vitest";

import {
  createAffiliateAcquisitionPolicyV2,
  evaluateAcquisitionV2,
} from "../acquisition/index.js";
import {
  claimConsumerEvent,
  claimOutboxEvent,
  createOutboxEvent,
  markOutboxFailure,
} from "../event-fabric/index.js";
import { decideRecovery } from "../recovery/domain.js";
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

const retryPolicy = {
  maximumAttempts: 3,
  baseDelaySeconds: 10,
  maximumDelaySeconds: 60,
  leaseSeconds: 30,
};

function outbox() {
  return createOutboxEvent({
    eventId: "event_1",
    eventType: "MissionCompleted",
    aggregateType: "mission_progress",
    aggregateId: "progress_1",
    contractVersion: 1,
    payload: { missionId: "mission_1" },
    correlationId: "corr_1",
    causationId: null,
    availableAt: "2026-09-30T12:00:00.000Z",
  });
}

describe("W19 failure replay and recovery acceptance", () => {
  it("recovers an expired outbox lease with a new worker", () => {
    const first = claimOutboxEvent(outbox(), {
      workerId: "worker_a",
      occurredAt: "2026-09-30T12:00:00.000Z",
      policy: retryPolicy,
    });
    if (!first) throw new Error("FIRST_LEASE_FAILED");

    const second = claimOutboxEvent(first, {
      workerId: "worker_b",
      occurredAt: "2026-09-30T12:00:31.000Z",
      policy: retryPolicy,
    });

    expect(second?.status).toBe("dispatching");
    expect(second?.leasedBy).toBe("worker_b");
  });

  it("retries transient delivery failure and ends in dead letter", () => {
    let current = outbox();

    for (let attempt = 0; attempt < retryPolicy.maximumAttempts; attempt += 1) {
      const claimed = claimOutboxEvent(current, {
        workerId: "worker_a",
        occurredAt:
          attempt === 0 ? "2026-09-30T12:00:00.000Z" : current.availableAt,
        policy: retryPolicy,
      });
      if (!claimed) throw new Error("LEASE_FAILED");

      current = markOutboxFailure(claimed, {
        workerId: "worker_a",
        occurredAt:
          attempt === 0 ? "2026-09-30T12:00:00.000Z" : current.availableAt,
        errorCode: "DATABASE_TRANSIENT_FAILURE",
        policy: retryPolicy,
      });
    }

    expect(current.status).toBe("dead_letter");
    expect(current.attempts).toBe(3);
  });

  it("deduplicates delivery and detects semantic replay conflict", () => {
    const claimed = claimConsumerEvent(
      {
        consumerName: "projection",
        eventId: "event_1",
        semanticDigest: "a".repeat(64),
        claimedAt: "2026-09-30T12:00:00.000Z",
      },
      null,
    );
    expect(claimed.kind).toBe("claimed");

    expect(
      claimConsumerEvent(
        {
          consumerName: "projection",
          eventId: "event_1",
          semanticDigest: "a".repeat(64),
          claimedAt: "2026-09-30T12:01:00.000Z",
        },
        claimed.claim,
      ).kind,
    ).toBe("replayed");

    expect(
      claimConsumerEvent(
        {
          consumerName: "projection",
          eventId: "event_1",
          semanticDigest: "b".repeat(64),
          claimedAt: "2026-09-30T12:01:00.000Z",
        },
        claimed.claim,
      ).kind,
    ).toBe("conflict");
  });

  it("recovers acquisition command replay without duplicate ownership", () => {
    const policy = createAffiliateAcquisitionPolicyV2({
      attributionWindowDays: 30,
      reacquisitionInactivityDays: 14,
      minimumMeaningfulSignals: 1,
    });
    const input = {
      commandId: "command_1",
      proposedCycleId: "cycle_1",
      proposedTouchpointId: "touch_1",
      subjectId: "asub_1",
      destinationId: "morro",
      affiliateId: "aff_1",
      placementId: "plc_1",
      serverValidatedPlacement: true,
      affiliateEligible: true,
      riskAllowed: true,
      meaningfulSignalCount: 1,
      occurredAt: "2026-09-30T12:00:00.000Z",
    };

    const first = evaluateAcquisitionV2(input, policy, null);
    expect(first.kind).toBe("acquired");

    expect(
      evaluateAcquisitionV2(
        input,
        policy,
        first.kind === "acquired" ? first.cycle : null,
        new Set(["command_1"]),
      ).kind,
    ).toBe("replayed");
  });

  it("rejects concurrent reward write on stale inventory revision", () => {
    const reward = publishRewardDefinition(
      validateRewardDefinition({
        rewardId: "reward_1",
        version: 1,
        destinationId: "morro",
        label: "Access",
        status: "draft",
        validFrom: "2026-09-01T00:00:00.000Z",
        validUntil: "2026-12-31T23:59:59.000Z",
        funding: {
          fundingClass: "access-based",
          sponsorReference: "business_1",
          estimatedCostMinorUnits: 0,
          perceivedValueMinorUnits: 1000,
          currency: "BRL",
        },
        eligibility: {
          eligibleProfiles: ["tourist"],
          minimumTrustClass: "experience_verified",
          requiredMissionIds: [],
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
        totalUnits: 1,
      }),
      {
        subjectId: "asub_1",
        journeyId: "journey_1",
        destinationId: "morro",
        profileType: "tourist",
        trustClass: "experience_verified",
        completedMissionIds: [],
        existingRedemptionCount: 0,
        eligibilityEvidenceReference: "proof_1",
        occurredAt: "2026-09-30T12:00:00.000Z",
      },
      {
        entitlementId: "ent_1",
        policyVersion: "REWARD-POLICY-V1",
        idempotencyKey: "reward:1",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
      null,
    );
    if (unlocked.kind !== "unlocked") throw new Error("UNLOCK_FAILED");

    expect(
      redeemReward(unlocked.entitlement, unlocked.inventory, {
        idempotencyKey: unlocked.entitlement.idempotencyKey,
        occurredAt: "2026-09-30T12:01:00.000Z",
        expectedInventoryRevision: unlocked.inventory.revision - 1,
      }),
    ).toMatchObject({
      kind: "rejected",
      code: "REWARD_INVENTORY_REVISION_CONFLICT",
    });
  });

  it("fails closed on unknown risk policy during recovery", () => {
    const assessment = createRiskAssessment({
      assessmentId: "risk_1",
      subjectId: "asub_1",
      destinationId: "morro",
      trustLevel: "financial_authoritative",
      signals: [],
      policyVersion: "RISK-UNKNOWN",
      assessedAt: "2026-09-30T12:00:00.000Z",
    });

    expect(
      evaluateRiskDecision(assessment, "financial_value", {
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
      }),
    ).toMatchObject({
      outcome: "block",
      rationaleCodes: ["RISK_POLICY_VERSION_MISMATCH"],
    });
  });

  it("retries only after committed owner state with idempotency evidence", () => {
    expect(
      decideRecovery({
        ownerStateCommitted: true,
        downstreamAcknowledged: false,
        idempotencyEvidencePresent: true,
        attempts: 1,
        maximumAttempts: 3,
      }),
    ).toEqual({
      action: "retry_delivery",
      code: "SAFE_IDEMPOTENT_RETRY",
    });

    expect(
      decideRecovery({
        ownerStateCommitted: false,
        downstreamAcknowledged: false,
        idempotencyEvidencePresent: true,
        attempts: 1,
        maximumAttempts: 3,
      }),
    ).toEqual({
      action: "halt_for_reconciliation",
      code: "OWNER_STATE_NOT_CONFIRMED",
    });
  });
});
