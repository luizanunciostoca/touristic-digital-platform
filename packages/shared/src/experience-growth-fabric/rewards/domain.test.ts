import { describe, expect, it } from "vitest";

import {
  createRewardInventory,
  expireRewardEntitlement,
  publishRewardDefinition,
  redeemReward,
  unlockReward,
  validateRewardDefinition,
} from "./domain.js";

const draft = validateRewardDefinition({
  rewardId: "reward_sunset_access",
  version: 1,
  destinationId: "morro",
  campaignId: "campaign_00000001",
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
});

const reward = publishRewardDefinition(
  draft,
  "2026-09-01T00:00:00.000Z",
);

const context = {
  subjectId: "asub_00000001",
  journeyId: "journey_00000001",
  destinationId: "morro",
  profileType: "tourist" as const,
  trustClass: "experience_verified" as const,
  completedMissionIds: ["mission_beaches"],
  existingRedemptionCount: 0,
  eligibilityEvidenceReference: "mission_completion_00000001",
  occurredAt: "2026-09-30T12:00:00.000Z",
};

function inventory() {
  return createRewardInventory({
    rewardId: reward.rewardId,
    rewardVersion: reward.version,
    totalUnits: 2,
  });
}

describe("rewards core", () => {
  it("unlocks an eligible access-based reward and reserves inventory", () => {
    const result = unlockReward(
      reward,
      inventory(),
      context,
      {
        entitlementId: "rent_00000001",
        policyVersion: "REWARD-POLICY-V1",
        idempotencyKey: "reward:unlock:00000001",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
      null,
    );

    expect(result.kind).toBe("unlocked");
    if (result.kind !== "unlocked") return;
    expect(result.inventory.reservedUnits).toBe(1);
    expect(result.event).toBe("RewardUnlocked");
  });

  it("fails closed when trust or mission evidence is insufficient", () => {
    const lowTrust = unlockReward(
      reward,
      inventory(),
      { ...context, trustClass: "behavioral" },
      {
        entitlementId: "rent_00000001",
        policyVersion: "REWARD-POLICY-V1",
        idempotencyKey: "reward:unlock:00000001",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
      null,
    );
    expect(lowTrust.kind).toBe("rejected");

    const missingMission = unlockReward(
      reward,
      inventory(),
      { ...context, completedMissionIds: [] },
      {
        entitlementId: "rent_00000001",
        policyVersion: "REWARD-POLICY-V1",
        idempotencyKey: "reward:unlock:00000001",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
      null,
    );
    expect(missingMission.kind).toBe("rejected");
  });

  it("requires economic approval for platform-funded rewards", () => {
    const platformReward = publishRewardDefinition(
      validateRewardDefinition({
        ...draft,
        rewardId: "reward_platform_credit",
        funding: {
          fundingClass: "platform-funded",
          sponsorReference: "morro-digital",
          estimatedCostMinorUnits: 1000,
          perceivedValueMinorUnits: 1000,
          currency: "BRL",
        },
        status: "draft",
        publishedAt: undefined,
      }),
      "2026-09-01T00:00:00.000Z",
    );

    const result = unlockReward(
      platformReward,
      createRewardInventory({
        rewardId: platformReward.rewardId,
        rewardVersion: platformReward.version,
        totalUnits: 10,
      }),
      context,
      {
        entitlementId: "rent_platform_0001",
        policyVersion: "REWARD-POLICY-V1",
        idempotencyKey: "reward:unlock:platform:0001",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
      null,
    );

    expect(result).toMatchObject({
      kind: "rejected",
      code: "REWARD_ECONOMIC_APPROVAL_REQUIRED",
    });
  });

  it("redeems idempotently and prevents stale inventory revision writes", () => {
    const unlocked = unlockReward(
      reward,
      inventory(),
      context,
      {
        entitlementId: "rent_00000001",
        policyVersion: "REWARD-POLICY-V1",
        idempotencyKey: "reward:unlock:00000001",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
      null,
    );
    if (unlocked.kind !== "unlocked") {
      throw new Error("REWARD_UNLOCK_FAILED");
    }

    const stale = redeemReward(unlocked.entitlement, unlocked.inventory, {
      idempotencyKey: unlocked.entitlement.idempotencyKey,
      occurredAt: "2026-09-30T13:00:00.000Z",
      expectedInventoryRevision: 1,
    });
    expect(stale).toMatchObject({
      kind: "rejected",
      code: "REWARD_INVENTORY_REVISION_CONFLICT",
    });

    const redeemed = redeemReward(
      unlocked.entitlement,
      unlocked.inventory,
      {
        idempotencyKey: unlocked.entitlement.idempotencyKey,
        occurredAt: "2026-09-30T13:00:00.000Z",
        expectedInventoryRevision: unlocked.inventory.revision,
      },
    );
    expect(redeemed.kind).toBe("redeemed");
    if (redeemed.kind !== "redeemed") return;
    expect(redeemed.inventory.reservedUnits).toBe(0);
    expect(redeemed.inventory.redeemedUnits).toBe(1);

    const replay = redeemReward(
      redeemed.entitlement,
      redeemed.inventory,
      {
        idempotencyKey: redeemed.entitlement.idempotencyKey,
        occurredAt: "2026-09-30T13:00:00.000Z",
        expectedInventoryRevision: redeemed.inventory.revision,
      },
    );
    expect(replay.kind).toBe("replayed");
  });

  it("expires an unlocked entitlement and releases reserved inventory", () => {
    const unlocked = unlockReward(
      reward,
      inventory(),
      context,
      {
        entitlementId: "rent_00000001",
        policyVersion: "REWARD-POLICY-V1",
        idempotencyKey: "reward:unlock:00000001",
        expiresAt: "2026-10-01T12:00:00.000Z",
      },
      null,
    );
    if (unlocked.kind !== "unlocked") {
      throw new Error("REWARD_UNLOCK_FAILED");
    }

    const expired = expireRewardEntitlement(
      unlocked.entitlement,
      unlocked.inventory,
      "2026-10-01T12:00:00.000Z",
    );

    expect(expired.entitlement.status).toBe("expired");
    expect(expired.inventory.reservedUnits).toBe(0);
    expect(expired.event).toBe("RewardExpired");
  });
});
