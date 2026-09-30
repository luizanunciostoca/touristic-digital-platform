export type RiskSignalCode =
  | "SELF_REFERRAL"
  | "VELOCITY"
  | "REPLAY"
  | "GEO_ANOMALY"
  | "REWARD_ANOMALY"
  | "DEVICE_SESSION_ANOMALY"
  | "BOT_PATTERN";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type TrustLevel =
  | "behavioral"
  | "session_verified"
  | "experience_verified"
  | "financial_authoritative";

export type RiskActionClass =
  | "guide_read"
  | "low_value_progress"
  | "experience_reward"
  | "financial_value";

export interface RiskSignal {
  readonly signalId: string;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly code: RiskSignalCode;
  readonly severity: RiskSeverity;
  readonly evidenceDigest: string;
  readonly policyVersion: string;
  readonly occurredAt: string;
}

export interface RiskAssessment {
  readonly assessmentId: string;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly trustLevel: TrustLevel;
  readonly signals: readonly RiskSignal[];
  readonly riskScore: number;
  readonly policyVersion: string;
  readonly assessedAt: string;
}

export interface RiskPolicy {
  readonly version: string;
  readonly reviewScore: number;
  readonly blockScore: number;
  readonly minimumTrustByAction: Readonly<Record<RiskActionClass, TrustLevel>>;
  readonly immediateBlockSignals: readonly RiskSignalCode[];
}

export type RiskDecision =
  | Readonly<{
      outcome: "allow";
      rationaleCodes: readonly string[];
      event: "RiskDecisionMade";
    }>
  | Readonly<{
      outcome: "observe";
      rationaleCodes: readonly string[];
      event: "RiskDecisionMade";
    }>
  | Readonly<{
      outcome: "review";
      rationaleCodes: readonly string[];
      event: "RiskDecisionMade";
    }>
  | Readonly<{
      outcome: "block";
      rationaleCodes: readonly string[];
      event: "RiskDecisionMade";
    }>;

const TRUST_RANK: Readonly<Record<TrustLevel, number>> = {
  behavioral: 0,
  session_verified: 1,
  experience_verified: 2,
  financial_authoritative: 3,
};

const SEVERITY_SCORE: Readonly<Record<RiskSeverity, number>> = {
  low: 10,
  medium: 25,
  high: 50,
  critical: 100,
};

const SHA_256 = /^[a-f0-9]{64}$/;
const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

export function createRiskSignal(signal: RiskSignal): RiskSignal {
  if (!signal.signalId || !signal.subjectId || !signal.destinationId) {
    throw new Error("RISK_SIGNAL_IDENTITY_INVALID");
  }
  if (!SHA_256.test(signal.evidenceDigest)) {
    throw new Error("RISK_SIGNAL_EVIDENCE_INVALID");
  }
  if (!signal.policyVersion || !isUtc(signal.occurredAt)) {
    throw new Error("RISK_SIGNAL_POLICY_OR_TIME_INVALID");
  }

  return Object.freeze({ ...signal });
}

export function calculateRiskScore(signals: readonly RiskSignal[]): number {
  const distinct = new Map<string, RiskSignal>();
  for (const signal of signals) {
    distinct.set(signal.signalId, signal);
  }

  return [...distinct.values()].reduce(
    (score, signal) => score + SEVERITY_SCORE[signal.severity],
    0,
  );
}

export function createRiskAssessment(
  input: Omit<RiskAssessment, "riskScore">,
): RiskAssessment {
  if (!input.assessmentId || !input.policyVersion || !isUtc(input.assessedAt)) {
    throw new Error("RISK_ASSESSMENT_IDENTITY_INVALID");
  }
  for (const signal of input.signals) {
    if (
      signal.subjectId !== input.subjectId ||
      signal.destinationId !== input.destinationId
    ) {
      throw new Error("RISK_ASSESSMENT_SCOPE_MISMATCH");
    }
  }

  return Object.freeze({
    ...input,
    signals: Object.freeze([...input.signals]),
    riskScore: calculateRiskScore(input.signals),
  });
}

export function validateRiskPolicy(policy: RiskPolicy): RiskPolicy {
  if (!policy.version) throw new Error("RISK_POLICY_VERSION_REQUIRED");
  if (
    !Number.isSafeInteger(policy.reviewScore) ||
    !Number.isSafeInteger(policy.blockScore) ||
    policy.reviewScore < 0 ||
    policy.blockScore <= policy.reviewScore
  ) {
    throw new Error("RISK_POLICY_SCORE_INVALID");
  }
  return policy;
}

export function evaluateRiskDecision(
  assessment: RiskAssessment,
  action: RiskActionClass,
  policy: RiskPolicy,
): RiskDecision {
  validateRiskPolicy(policy);

  if (assessment.policyVersion !== policy.version) {
    if (action === "guide_read") {
      return {
        outcome: "observe",
        rationaleCodes: ["RISK_POLICY_VERSION_MISMATCH"],
        event: "RiskDecisionMade",
      };
    }
    return {
      outcome: "block",
      rationaleCodes: ["RISK_POLICY_VERSION_MISMATCH"],
      event: "RiskDecisionMade",
    };
  }

  const signalCodes = assessment.signals.map((signal) => signal.code);
  const immediate = signalCodes.filter((code) =>
    policy.immediateBlockSignals.includes(code),
  );

  if (action === "guide_read") {
    return {
      outcome: signalCodes.length > 0 ? "observe" : "allow",
      rationaleCodes:
        signalCodes.length > 0 ? [...new Set(signalCodes)] : ["NO_RISK_SIGNAL"],
      event: "RiskDecisionMade",
    };
  }

  if (immediate.length > 0) {
    return {
      outcome: "block",
      rationaleCodes: [...new Set(immediate)],
      event: "RiskDecisionMade",
    };
  }

  const minimumTrust = policy.minimumTrustByAction[action];
  if (TRUST_RANK[assessment.trustLevel] < TRUST_RANK[minimumTrust]) {
    return {
      outcome: "block",
      rationaleCodes: ["TRUST_LEVEL_INSUFFICIENT"],
      event: "RiskDecisionMade",
    };
  }

  if (assessment.riskScore >= policy.blockScore) {
    return {
      outcome: "block",
      rationaleCodes: ["RISK_SCORE_BLOCK"],
      event: "RiskDecisionMade",
    };
  }

  if (assessment.riskScore >= policy.reviewScore) {
    return {
      outcome: "review",
      rationaleCodes: ["RISK_SCORE_REVIEW"],
      event: "RiskDecisionMade",
    };
  }

  return {
    outcome: "allow",
    rationaleCodes: ["RISK_WITHIN_POLICY"],
    event: "RiskDecisionMade",
  };
}

export function detectSelfReferral(input: Readonly<{
  sameVerifiedIdentity: boolean;
  sameAccountRelationship: boolean;
  sameTrustedDeviceRelationship: boolean;
}>): boolean {
  return (
    input.sameVerifiedIdentity ||
    input.sameAccountRelationship ||
    input.sameTrustedDeviceRelationship
  );
}

export function detectVelocity(input: Readonly<{
  attemptsInWindow: number;
  maximumAttempts: number;
}>): boolean {
  if (
    !Number.isSafeInteger(input.attemptsInWindow) ||
    !Number.isSafeInteger(input.maximumAttempts) ||
    input.maximumAttempts < 1
  ) {
    throw new Error("RISK_VELOCITY_INPUT_INVALID");
  }
  return input.attemptsInWindow > input.maximumAttempts;
}

export function detectReplay(
  eventId: string,
  seenEventIds: ReadonlySet<string>,
): boolean {
  if (!eventId) throw new Error("RISK_REPLAY_EVENT_ID_INVALID");
  return seenEventIds.has(eventId);
}

export function detectGeoAnomaly(input: Readonly<{
  claimedPlaceId: string;
  verifiedPlaceId: string | null;
  proofValid: boolean;
}>): boolean {
  if (!input.claimedPlaceId) {
    throw new Error("RISK_GEO_CLAIM_INVALID");
  }
  return (
    !input.proofValid ||
    input.verifiedPlaceId === null ||
    input.claimedPlaceId !== input.verifiedPlaceId
  );
}
