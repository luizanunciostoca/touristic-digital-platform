import { describe, expect, it } from "vitest";

import { evaluateQualifiedReferral } from "../affiliate-growth/index.js";
import { actorMayAuthorizeValue } from "../contracts/authority.js";
import {
  appendXpEntry,
  createEmptyXpLedgerState,
} from "../engagement/index.js";
import {
  evaluateGrowthRequestGuard,
  GROWTH_HTTP_ROUTES,
} from "../http/index.js";
import {
  assertPrivacySafeProjectionPayload,
  createPseudonymousAnalyticsSubject,
  isPastRetention,
  minimizeLocationEvidence,
} from "../privacy/domain.js";
import {
  createReferralCampaign,
  createReferralPlacement,
  issueReferralToken,
  resolveReferralToken,
} from "../referrals/index.js";
import {
  createRewardInventory,
  publishRewardDefinition,
  unlockReward,
  validateRewardDefinition,
} from "../rewards/index.js";
import {
  detectGeoAnomaly,
  detectSelfReferral,
  detectVelocity,
} from "../trust-risk/index.js";

const retentionPolicy = {
  version: "PRIVACY-V1",
  maximumDays: {
    journey_operational: 365,
    security_audit: 180,
    analytics_projection: 90,
  },
} as const;

describe("W18 security privacy and fraud acceptance", () => {
  it("prevents browser and LLM value authority", () => {
    expect(actorMayAuthorizeValue("browser", "experience_value")).toBe(false);
    expect(actorMayAuthorizeValue("llm", "financial_consequence")).toBe(false);
  });

  it("rejects forged XP without evidence", () => {
    const result = appendXpEntry(createEmptyXpLedgerState(), {
      entryId: "xp_forged",
      subjectId: "asub_1",
      journeyId: "journey_1",
      destinationId: "morro",
      amountSigned: 9999,
      reasonCode: "FORGED",
      sourceEventId: "event_forged",
      evidenceReference: "",
      idempotencyKey: "forged:xp",
      policyVersion: "ENGAGEMENT-POLICY-V1",
      trustClass: "behavioral",
      occurredAt: "2026-09-30T12:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "rejected",
      code: "XP_EVIDENCE_INVALID",
    });
  });

  it("rejects self-referral before affiliate growth credit", () => {
    expect(
      detectSelfReferral({
        sameVerifiedIdentity: true,
        sameAccountRelationship: false,
        sameTrustedDeviceRelationship: false,
      }),
    ).toBe(true);

    expect(
      evaluateQualifiedReferral(
        {
          referralId: "qref_1",
          affiliateId: "aff_1",
          programId: "apg_1",
          placementId: "plc_1",
          destinationId: "morro",
          subjectId: "asub_1",
          activePlacement: true,
          uniqueSubjectAccepted: true,
          selfReferral: true,
          riskAllowed: true,
          meaningfulSignalCount: 3,
          minimumMeaningfulSignals: 1,
          idempotencyKey: "qref:self",
          occurredAt: "2026-09-30T12:00:00.000Z",
        },
        null,
      ),
    ).toMatchObject({
      qualified: false,
      code: "QUALIFIED_REFERRAL_SELF_REFERRAL",
    });
  });

  it("detects velocity and geo fraud signals", () => {
    expect(
      detectVelocity({
        attemptsInWindow: 101,
        maximumAttempts: 100,
      }),
    ).toBe(true);

    expect(
      detectGeoAnomaly({
        claimedPlaceId: "place_a",
        verifiedPlaceId: "place_b",
        proofValid: true,
      }),
    ).toBe(true);
  });

  it("rejects token hash abuse and rate-limit abuse", () => {
    const campaign = createReferralCampaign({
      campaignId: "campaign_1",
      affiliateId: "aff_1",
      programId: "apg_1",
      destinationId: "morro",
      status: "active",
      createdAt: "2026-09-30T10:00:00.000Z",
    });
    const placement = createReferralPlacement({
      placementId: "plc_1",
      affiliateId: "aff_1",
      campaignId: campaign.campaignId,
      programId: campaign.programId,
      destinationId: "morro",
      channel: "permanent_qr",
      status: "active",
      riskPolicyVersion: "RISK-V1",
      createdAt: "2026-09-30T10:00:00.000Z",
    });
    const token = issueReferralToken(placement, {
      tokenId: "token_1",
      opaqueCode: "abcdefghijklmnopqrstuvwx",
      publicCodeHash: "a".repeat(64),
      issuedAt: "2026-09-30T10:00:00.000Z",
      kind: "q",
    });

    expect(
      resolveReferralToken(campaign, placement, token.record, {
        publicCodeHash: "b".repeat(64),
        returnPath: "/explore",
        occurredAt: "2026-09-30T10:01:00.000Z",
        attemptCountInWindow: 0,
        maximumAttemptsInWindow: 10,
      }),
    ).toEqual({ accepted: false, code: "TOKEN_HASH_MISMATCH" });

    expect(
      resolveReferralToken(campaign, placement, token.record, {
        publicCodeHash: "a".repeat(64),
        returnPath: "/explore",
        occurredAt: "2026-09-30T10:01:00.000Z",
        attemptCountInWindow: 10,
        maximumAttemptsInWindow: 10,
      }),
    ).toEqual({ accepted: false, code: "RATE_LIMITED" });
  });

  it("rejects cross-tenant and CSRF-invalid value requests", () => {
    const route = GROWTH_HTTP_ROUTES.find(
      (candidate) => candidate.operationId === "growth.rewards.redeem",
    );
    if (!route) throw new Error("REWARD_REDEEM_ROUTE_MISSING");

    const base = {
      credentialKind: "authenticated_session" as const,
      subjectId: "asub_1",
      requestDestinationId: "morro",
      credentialDestinationIds: new Set(["morro"]),
      requestTenantId: "tenant_a",
      credentialTenantIds: new Set(["tenant_a"]),
      capabilities: new Set(["growth.write"]),
      sessionCookiePresent: true,
      csrfTokenPresent: true,
      csrfTokenMatchesSession: true,
      idempotencyKey: "idem_1",
      requestCountInWindow: 0,
      rateLimitMaximum: 10,
    };

    expect(
      evaluateGrowthRequestGuard(route, {
        ...base,
        requestTenantId: "tenant_b",
      }),
    ).toEqual({ allowed: false, code: "TENANT_SCOPE_DENIED" });

    expect(
      evaluateGrowthRequestGuard(route, {
        ...base,
        csrfTokenMatchesSession: false,
      }),
    ).toEqual({ allowed: false, code: "CSRF_INVALID" });
  });

  it("requires explicit economic approval for platform-funded rewards", () => {
    const reward = publishRewardDefinition(
      validateRewardDefinition({
        rewardId: "reward_platform",
        version: 1,
        destinationId: "morro",
        label: "Crédito promocional",
        status: "draft",
        validFrom: "2026-09-01T00:00:00.000Z",
        validUntil: "2026-12-31T23:59:59.000Z",
        funding: {
          fundingClass: "platform-funded",
          sponsorReference: "morro-digital",
          estimatedCostMinorUnits: 1000,
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

    expect(
      unlockReward(
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
          idempotencyKey: "reward:platform:1",
          expiresAt: "2026-10-01T12:00:00.000Z",
        },
        null,
      ),
    ).toMatchObject({
      kind: "rejected",
      code: "REWARD_ECONOMIC_APPROVAL_REQUIRED",
    });
  });

  it("minimizes raw geolocation and enforces analytics privacy", () => {
    const minimized = minimizeLocationEvidence({
      destinationId: "morro",
      placeId: "place_second_beach",
      proofDigest: "c".repeat(64),
      occurredAt: "2026-09-30T12:00:00.000Z",
      rawLatitude: -13.376,
      rawLongitude: -38.913,
      accuracyMeters: 4,
    });

    expect(minimized).toEqual({
      destinationId: "morro",
      placeId: "place_second_beach",
      proofDigest: "c".repeat(64),
      occurredAt: "2026-09-30T12:00:00.000Z",
      locationGranularity: "place",
    });
    expect("rawLatitude" in minimized).toBe(false);
    expect("rawLongitude" in minimized).toBe(false);

    expect(createPseudonymousAnalyticsSubject("d".repeat(64))).toEqual({
      subjectDigest: "d".repeat(64),
      source: "server_pseudonym",
    });

    expect(() =>
      assertPrivacySafeProjectionPayload({
        destinationId: "morro",
        email: "visitor@example.com",
      }),
    ).toThrow("PRIVACY_FORBIDDEN_PERSISTED_KEY:email");
  });

  it("enforces retention deadlines", () => {
    expect(
      isPastRetention(
        "2026-01-01T00:00:00.000Z",
        "2026-04-02T00:00:00.000Z",
        "analytics_projection",
        retentionPolicy,
      ),
    ).toBe(true);

    expect(
      isPastRetention(
        "2026-01-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
        "analytics_projection",
        retentionPolicy,
      ),
    ).toBe(false);
  });
});
