import { describe, expect, it } from "vitest";

import {
  createRiskAssessment,
  createRiskSignal,
  detectGeoAnomaly,
  detectReplay,
  detectSelfReferral,
  detectVelocity,
  evaluateRiskDecision,
} from "./domain.js";

const policy = {
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

function signal(
  code: "SELF_REFERRAL" | "VELOCITY" | "GEO_ANOMALY" | "REPLAY",
  severity: "low" | "medium" | "high" | "critical",
  id: string,
) {
  return createRiskSignal({
    signalId: id,
    subjectId: "asub_00000001",
    destinationId: "morro",
    code,
    severity,
    evidenceDigest: "a".repeat(64),
    policyVersion: "RISK-V1",
    occurredAt: "2026-09-30T12:00:00.000Z",
  });
}

describe("trust and risk", () => {
  it("allows the guide while observing suspicious activity", () => {
    const assessment = createRiskAssessment({
      assessmentId: "risk_00000001",
      subjectId: "asub_00000001",
      destinationId: "morro",
      trustLevel: "behavioral",
      signals: [signal("VELOCITY", "high", "signal_1")],
      policyVersion: "RISK-V1",
      assessedAt: "2026-09-30T12:01:00.000Z",
    });

    expect(evaluateRiskDecision(assessment, "guide_read", policy)).toMatchObject({
      outcome: "observe",
    });
  });

  it("blocks self-referral and replay for value actions", () => {
    for (const code of ["SELF_REFERRAL", "REPLAY"] as const) {
      const assessment = createRiskAssessment({
        assessmentId: `risk_${code}`,
        subjectId: "asub_00000001",
        destinationId: "morro",
        trustLevel: "experience_verified",
        signals: [signal(code, "high", `signal_${code}`)],
        policyVersion: "RISK-V1",
        assessedAt: "2026-09-30T12:01:00.000Z",
      });

      expect(
        evaluateRiskDecision(assessment, "experience_reward", policy),
      ).toMatchObject({
        outcome: "block",
        rationaleCodes: [code],
      });
    }
  });

  it("fails closed when trust is below the action requirement", () => {
    const assessment = createRiskAssessment({
      assessmentId: "risk_00000002",
      subjectId: "asub_00000001",
      destinationId: "morro",
      trustLevel: "session_verified",
      signals: [],
      policyVersion: "RISK-V1",
      assessedAt: "2026-09-30T12:01:00.000Z",
    });

    expect(
      evaluateRiskDecision(assessment, "experience_reward", policy),
    ).toMatchObject({
      outcome: "block",
      rationaleCodes: ["TRUST_LEVEL_INSUFFICIENT"],
    });
  });

  it("routes medium aggregate risk to review before blocking", () => {
    const assessment = createRiskAssessment({
      assessmentId: "risk_00000003",
      subjectId: "asub_00000001",
      destinationId: "morro",
      trustLevel: "experience_verified",
      signals: [signal("GEO_ANOMALY", "high", "signal_geo")],
      policyVersion: "RISK-V1",
      assessedAt: "2026-09-30T12:01:00.000Z",
    });

    expect(
      evaluateRiskDecision(assessment, "experience_reward", policy),
    ).toMatchObject({
      outcome: "review",
      rationaleCodes: ["RISK_SCORE_REVIEW"],
    });
  });

  it("detects self-referral, velocity, replay and geo anomalies", () => {
    expect(
      detectSelfReferral({
        sameVerifiedIdentity: true,
        sameAccountRelationship: false,
        sameTrustedDeviceRelationship: false,
      }),
    ).toBe(true);

    expect(
      detectVelocity({
        attemptsInWindow: 11,
        maximumAttempts: 10,
      }),
    ).toBe(true);

    expect(detectReplay("event_1", new Set(["event_1"]))).toBe(true);

    expect(
      detectGeoAnomaly({
        claimedPlaceId: "place_1",
        verifiedPlaceId: "place_2",
        proofValid: true,
      }),
    ).toBe(true);
  });

  it("blocks value mutations when policy version is unknown", () => {
    const assessment = createRiskAssessment({
      assessmentId: "risk_00000004",
      subjectId: "asub_00000001",
      destinationId: "morro",
      trustLevel: "financial_authoritative",
      signals: [],
      policyVersion: "RISK-UNKNOWN",
      assessedAt: "2026-09-30T12:01:00.000Z",
    });

    expect(
      evaluateRiskDecision(assessment, "financial_value", policy),
    ).toMatchObject({
      outcome: "block",
      rationaleCodes: ["RISK_POLICY_VERSION_MISMATCH"],
    });
  });
});
