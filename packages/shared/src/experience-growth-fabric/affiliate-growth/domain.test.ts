import { describe, expect, it } from "vitest";

import {
  affiliateXpBalance,
  appendAffiliateXp,
  calculateAis,
  calculateAqs,
  evaluateQualifiedReferral,
  projectAffiliateChallenge,
  resolveAffiliateLevel,
} from "./domain.js";

const referralInput = {
  referralId: "qref_00000001",
  affiliateId: "aff_00000001",
  programId: "apg_00000001",
  placementId: "plc_00000001",
  destinationId: "morro",
  subjectId: "asub_00000001",
  activePlacement: true,
  uniqueSubjectAccepted: true,
  selfReferral: false,
  riskAllowed: true,
  meaningfulSignalCount: 2,
  minimumMeaningfulSignals: 1,
  idempotencyKey: "qualified-referral:00000001",
  occurredAt: "2026-09-30T12:00:00.000Z",
};

describe("affiliate growth", () => {
  it("qualifies real activated referrals without requiring a purchase", () => {
    const result = evaluateQualifiedReferral(referralInput, null);
    expect(result.qualified).toBe(true);
  });

  it("rejects self-referral, blocked risk and meaningless traffic", () => {
    expect(
      evaluateQualifiedReferral({ ...referralInput, selfReferral: true }, null),
    ).toMatchObject({
      qualified: false,
      code: "QUALIFIED_REFERRAL_SELF_REFERRAL",
    });
    expect(
      evaluateQualifiedReferral({ ...referralInput, riskAllowed: false }, null),
    ).toMatchObject({
      qualified: false,
      code: "QUALIFIED_REFERRAL_RISK_BLOCKED",
    });
    expect(
      evaluateQualifiedReferral(
        { ...referralInput, meaningfulSignalCount: 0 },
        null,
      ),
    ).toMatchObject({
      qualified: false,
      code: "QUALIFIED_REFERRAL_MEANINGFUL_ENGAGEMENT_NOT_MET",
    });
  });

  it("keeps AQS quality separate from AIS integrity", () => {
    const aqs = calculateAqs(
      {
        activationRateBps: 9000,
        usefulEngagementRateBps: 8000,
        retentionRateBps: 6000,
        journeyDepthRateBps: 7000,
        commercialQualityRateBps: 1000,
      },
      "AQS-V1",
    );
    const ais = calculateAis(
      {
        selfReferralRateBps: 0,
        velocityAnomalyRateBps: 500,
        replayRateBps: 0,
        deviceSessionAnomalyRateBps: 500,
        geoAnomalyRateBps: 0,
      },
      "AIS-V1",
    );

    expect(aqs.value).toBeGreaterThan(0);
    expect(ais.value).toBeGreaterThan(aqs.value);
    expect(aqs.policyVersion).toBe("AQS-V1");
    expect(ais.policyVersion).toBe("AIS-V1");
  });

  it("maintains an append-only affiliate XP ledger", () => {
    const entry = {
      entryId: "axp_00000001",
      affiliateId: "aff_00000001",
      destinationId: "morro",
      amountSigned: 25,
      reasonCode: "QUALIFIED_REFERRAL",
      sourceReference: "qref_00000001",
      idempotencyKey: "affiliate-xp:qref:00000001",
      policyVersion: "AFFILIATE-GROWTH-V1",
      occurredAt: "2026-09-30T12:00:00.000Z",
    };

    const first = appendAffiliateXp([], entry);
    expect(first.replayed).toBe(false);
    expect(first.event).toBe("AffiliateXpGranted");
    expect(affiliateXpBalance(first.entries, "aff_00000001")).toBe(25);

    const replay = appendAffiliateXp(first.entries, entry);
    expect(replay.replayed).toBe(true);
    expect(replay.entries).toHaveLength(1);
  });

  it("separates lifetime level from seasonal challenge progress", () => {
    const level = resolveAffiliateLevel(250, [
      { levelId: "starter", ordinal: 1, minimumLifetimeXp: 0, label: "Starter" },
      { levelId: "guide", ordinal: 2, minimumLifetimeXp: 100, label: "Guide" },
      { levelId: "ambassador", ordinal: 3, minimumLifetimeXp: 500, label: "Ambassador" },
    ]);
    expect(level.levelId).toBe("guide");

    const challenge = projectAffiliateChallenge(
      {
        challengeId: "challenge_spring",
        seasonId: "2026-spring",
        targetQualifiedReferrals: 10,
        rewardXp: 100,
      },
      "aff_00000001",
      10,
    );
    expect(challenge.completed).toBe(true);
  });
});
