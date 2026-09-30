import { describe, expect, it } from "vitest";

import {
  createAffiliateAcquisitionPolicyV2,
  evaluateAcquisitionV2,
} from "../acquisition/index.js";
import { deterministicExperimentBucket } from "../experimentation/index.js";
import {
  evaluateGrowthRequestGuard,
  GROWTH_HTTP_ROUTES,
} from "../http/index.js";
import {
  createReferralCampaign,
  createReferralPlacement,
  issueReferralToken,
  resolveReferralToken,
} from "../referrals/index.js";
import {
  createRiskAssessment,
  evaluateRiskDecision,
} from "../trust-risk/index.js";

interface LoadResult {
  readonly label: string;
  readonly iterations: number;
  readonly elapsedMs: number;
}

function runLoad(
  label: string,
  iterations: number,
  operation: (index: number) => void,
): LoadResult {
  const started = Date.now();
  for (let index = 0; index < iterations; index += 1) operation(index);
  return {
    label,
    iterations,
    elapsedMs: Date.now() - started,
  };
}

describe("W20 deterministic performance and load qualification", () => {
  it("keeps key pure-domain hot paths inside conservative CI budgets", () => {
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
    const acquisitionPolicy = createAffiliateAcquisitionPolicyV2({
      attributionWindowDays: 30,
      reacquisitionInactivityDays: 14,
      minimumMeaningfulSignals: 1,
    });
    const riskAssessment = createRiskAssessment({
      assessmentId: "risk_1",
      subjectId: "asub_1",
      destinationId: "morro",
      trustLevel: "experience_verified",
      signals: [],
      policyVersion: "RISK-V1",
      assessedAt: "2026-09-30T12:00:00.000Z",
    });
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
    const route = GROWTH_HTTP_ROUTES.find(
      (candidate) => candidate.operationId === "growth.rewards.redeem",
    );
    if (!route) throw new Error("PERF_ROUTE_MISSING");

    const results = [
      runLoad("referral-resolution", 2000, () => {
        const result = resolveReferralToken(
          campaign,
          placement,
          token.record,
          {
            publicCodeHash: "a".repeat(64),
            returnPath: "/explore",
            occurredAt: "2026-09-30T10:01:00.000Z",
            attemptCountInWindow: 0,
            maximumAttemptsInWindow: 100,
          },
        );
        if (!result.accepted) throw new Error("PERF_REFERRAL_REJECTED");
      }),
      runLoad("acquisition-evaluation", 2000, (index) => {
        const result = evaluateAcquisitionV2(
          {
            commandId: `command_${index}`,
            proposedCycleId: `cycle_${index}`,
            proposedTouchpointId: `touch_${index}`,
            subjectId: `asub_${index}`,
            destinationId: "morro",
            affiliateId: "aff_1",
            placementId: "plc_1",
            serverValidatedPlacement: true,
            affiliateEligible: true,
            riskAllowed: true,
            meaningfulSignalCount: 1,
            occurredAt: "2026-09-30T12:00:00.000Z",
          },
          acquisitionPolicy,
          null,
        );
        if (result.kind !== "acquired") {
          throw new Error("PERF_ACQUISITION_REJECTED");
        }
      }),
      runLoad("risk-decision", 5000, () => {
        if (
          evaluateRiskDecision(
            riskAssessment,
            "experience_reward",
            riskPolicy,
          ).outcome !== "allow"
        ) {
          throw new Error("PERF_RISK_REJECTED");
        }
      }),
      runLoad("experiment-bucket", 10000, (index) => {
        deterministicExperimentBucket(
          `asub_${index}`,
          "experiment_1",
          "salt-v1",
        );
      }),
      runLoad("http-guard", 5000, () => {
        const decision = evaluateGrowthRequestGuard(route, {
          credentialKind: "authenticated_session",
          subjectId: "asub_1",
          requestDestinationId: "morro",
          credentialDestinationIds: new Set(["morro"]),
          requestTenantId: "tenant_1",
          credentialTenantIds: new Set(["tenant_1"]),
          capabilities: new Set(["growth.write"]),
          sessionCookiePresent: true,
          csrfTokenPresent: true,
          csrfTokenMatchesSession: true,
          idempotencyKey: "idem_1",
          requestCountInWindow: 0,
          rateLimitMaximum: 100,
        });
        if (!decision.allowed) throw new Error("PERF_HTTP_GUARD_REJECTED");
      }),
    ];

    for (const result of results) {
      expect(result.elapsedMs, result.label).toBeLessThan(5000);
    }

    expect(
      results.reduce((sum, result) => sum + result.iterations, 0),
    ).toBe(24000);
  });
});
