import type { AffiliateAcquisitionPolicyV2 } from "./policy-v2.js";

export interface AcquisitionCycle {
  readonly cycleId: string;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly ownerAffiliateId: string;
  readonly sourcePlacementId: string;
  readonly policyVersion: "AFFILIATE-POLICY-V2";
  readonly openedAt: string;
  readonly expiresAt: string;
}

export interface AcquisitionAttempt {
  readonly commandId: string;
  readonly proposedCycleId: string;
  readonly proposedTouchpointId: string;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly affiliateId: string;
  readonly placementId: string;
  readonly serverValidatedPlacement: boolean;
  readonly affiliateEligible: boolean;
  readonly riskAllowed: boolean;
  readonly meaningfulSignalCount: number;
  readonly occurredAt: string;
  readonly inactiveSince?: string;
}

export interface InfluenceTouchpoint {
  readonly touchpointId: string;
  readonly cycleId: string;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly affiliateId: string;
  readonly placementId: string;
  readonly occurredAt: string;
  readonly policyVersion: "AFFILIATE-POLICY-V2";
}

export type AcquisitionDecision =
  | Readonly<{
      kind: "acquired";
      cycle: AcquisitionCycle;
      events: readonly [
        "QualifiedAcquisitionEstablished",
        "AcquisitionCycleOpened",
      ];
    }>
  | Readonly<{
      kind: "influence";
      cycle: AcquisitionCycle;
      touchpoint: InfluenceTouchpoint;
      events: readonly ["InfluenceTouchpointRecorded"];
    }>
  | Readonly<{
      kind: "reacquired";
      previousCycleId: string;
      cycle: AcquisitionCycle;
      events: readonly [
        "AcquisitionCycleExpired",
        "QualifiedReacquisitionEstablished",
        "AcquisitionCycleOpened",
      ];
    }>
  | Readonly<{
      kind: "replayed";
      commandId: string;
      events: readonly [];
    }>
  | Readonly<{
      kind: "rejected";
      code: string;
      events: readonly [];
    }>;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseUtc(value: string): number | null {
  const timestamp = Date.parse(value);
  if (!value.endsWith("Z") || !Number.isFinite(timestamp)) return null;
  return timestamp;
}

function addDays(value: string, days: number): string {
  const timestamp = parseUtc(value);
  if (timestamp === null) {
    throw new Error("ACQUISITION_V2_TIMESTAMP_INVALID");
  }
  return new Date(timestamp + days * DAY_MS).toISOString();
}

function qualificationFailure(
  input: AcquisitionAttempt,
  policy: AffiliateAcquisitionPolicyV2,
): string | null {
  if (!input.serverValidatedPlacement) {
    return "PLACEMENT_NOT_SERVER_VALIDATED";
  }
  if (!input.affiliateEligible) return "AFFILIATE_NOT_ELIGIBLE";
  if (!input.riskAllowed) return "RISK_REJECTED";
  if (input.meaningfulSignalCount < policy.minimumMeaningfulSignals) {
    return "QUALIFICATION_SIGNAL_THRESHOLD_NOT_MET";
  }
  return null;
}

function createCycle(
  input: AcquisitionAttempt,
  policy: AffiliateAcquisitionPolicyV2,
): AcquisitionCycle {
  return Object.freeze({
    cycleId: input.proposedCycleId,
    subjectId: input.subjectId,
    destinationId: input.destinationId,
    ownerAffiliateId: input.affiliateId,
    sourcePlacementId: input.placementId,
    policyVersion: policy.version,
    openedAt: input.occurredAt,
    expiresAt: addDays(input.occurredAt, policy.attributionWindowDays),
  });
}

function createTouchpoint(
  cycle: AcquisitionCycle,
  input: AcquisitionAttempt,
): InfluenceTouchpoint {
  return Object.freeze({
    touchpointId: input.proposedTouchpointId,
    cycleId: cycle.cycleId,
    subjectId: input.subjectId,
    destinationId: input.destinationId,
    affiliateId: input.affiliateId,
    placementId: input.placementId,
    occurredAt: input.occurredAt,
    policyVersion: cycle.policyVersion,
  });
}

function inactivitySatisfied(
  input: AcquisitionAttempt,
  policy: AffiliateAcquisitionPolicyV2,
): boolean {
  if (!input.inactiveSince) return false;
  const inactiveSince = parseUtc(input.inactiveSince);
  const occurredAt = parseUtc(input.occurredAt);
  if (inactiveSince === null || occurredAt === null) return false;
  const requiredMs = policy.reacquisitionInactivityDays * DAY_MS;
  return occurredAt - inactiveSince >= requiredMs;
}

export function evaluateAcquisitionV2(
  input: AcquisitionAttempt,
  policy: AffiliateAcquisitionPolicyV2,
  activeOrPreviousCycle: AcquisitionCycle | null,
  seenCommandIds: ReadonlySet<string> = new Set(),
): AcquisitionDecision {
  if (seenCommandIds.has(input.commandId)) {
    return { kind: "replayed", commandId: input.commandId, events: [] };
  }

  const occurredAt = parseUtc(input.occurredAt);
  if (occurredAt === null) {
    return { kind: "rejected", code: "OCCURRED_AT_INVALID", events: [] };
  }

  if (
    activeOrPreviousCycle &&
    activeOrPreviousCycle.subjectId !== input.subjectId
  ) {
    return { kind: "rejected", code: "SUBJECT_CYCLE_MISMATCH", events: [] };
  }

  if (
    activeOrPreviousCycle &&
    activeOrPreviousCycle.destinationId !== input.destinationId
  ) {
    return {
      kind: "rejected",
      code: "DESTINATION_CYCLE_MISMATCH",
      events: [],
    };
  }

  if (!activeOrPreviousCycle) {
    const failure = qualificationFailure(input, policy);
    if (failure) return { kind: "rejected", code: failure, events: [] };

    return {
      kind: "acquired",
      cycle: createCycle(input, policy),
      events: ["QualifiedAcquisitionEstablished", "AcquisitionCycleOpened"],
    };
  }

  const expiresAt = parseUtc(activeOrPreviousCycle.expiresAt);
  if (expiresAt === null) {
    return { kind: "rejected", code: "CYCLE_EXPIRY_INVALID", events: [] };
  }

  if (occurredAt < expiresAt) {
    if (!input.serverValidatedPlacement || !input.affiliateEligible) {
      return {
        kind: "rejected",
        code: "INFLUENCE_EVIDENCE_INVALID",
        events: [],
      };
    }
    if (!input.riskAllowed) {
      return { kind: "rejected", code: "RISK_REJECTED", events: [] };
    }

    return {
      kind: "influence",
      cycle: activeOrPreviousCycle,
      touchpoint: createTouchpoint(activeOrPreviousCycle, input),
      events: ["InfluenceTouchpointRecorded"],
    };
  }

  const failure = qualificationFailure(input, policy);
  if (failure) return { kind: "rejected", code: failure, events: [] };

  if (!inactivitySatisfied(input, policy)) {
    return {
      kind: "rejected",
      code: "REACQUISITION_INACTIVITY_NOT_MET",
      events: [],
    };
  }

  return {
    kind: "reacquired",
    previousCycleId: activeOrPreviousCycle.cycleId,
    cycle: createCycle(input, policy),
    events: [
      "AcquisitionCycleExpired",
      "QualifiedReacquisitionEstablished",
      "AcquisitionCycleOpened",
    ],
  };
}
