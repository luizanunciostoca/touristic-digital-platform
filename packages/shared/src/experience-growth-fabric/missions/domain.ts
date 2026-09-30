export type MissionProfileType =
  | "tourist"
  | "resident"
  | "visitor"
  | "unknown";

export type MissionTrustClass =
  | "behavioral"
  | "session_verified"
  | "experience_verified"
  | "financial_authoritative";

export type MissionStatus = "draft" | "published" | "retired";

export interface MissionEvidenceRequirement {
  readonly minimumTrustClass: MissionTrustClass;
  readonly acceptedEventTypes: readonly string[];
  readonly distinctReferenceRequired: boolean;
}

export interface MissionStepDefinition {
  readonly stepId: string;
  readonly ordinal: number;
  readonly label: string;
  readonly evidence: MissionEvidenceRequirement;
}

export interface MissionDefinition {
  readonly missionId: string;
  readonly version: number;
  readonly destinationId: string;
  readonly status: MissionStatus;
  readonly eligibleProfiles: readonly MissionProfileType[];
  readonly steps: readonly MissionStepDefinition[];
  readonly publishedAt?: string;
}

export interface MissionEvidence {
  readonly evidenceId: string;
  readonly stepId: string;
  readonly subjectId: string;
  readonly journeyId: string;
  readonly destinationId: string;
  readonly eventType: string;
  readonly trustClass: MissionTrustClass;
  readonly reference: string;
  readonly occurredAt: string;
}

export interface MissionProgressState {
  readonly subjectId: string;
  readonly journeyId: string;
  readonly destinationId: string;
  readonly missionId: string;
  readonly missionVersion: number;
  readonly completedStepIds: readonly string[];
  readonly acceptedEvidenceIds: readonly string[];
  readonly acceptedReferencesByStep: Readonly<
    Record<string, readonly string[]>
  >;
  readonly completedAt?: string;
}

export type MissionProgressDecision =
  | Readonly<{
      kind: "progressed";
      state: MissionProgressState;
      event: "MissionProgressed";
    }>
  | Readonly<{
      kind: "completed";
      state: MissionProgressState;
      events: readonly ["MissionProgressed", "MissionCompleted"];
      completionKey: string;
    }>
  | Readonly<{
      kind: "replayed";
      state: MissionProgressState;
    }>
  | Readonly<{
      kind: "rejected";
      state: MissionProgressState;
      code: string;
    }>;

const TRUST_RANK: Readonly<Record<MissionTrustClass, number>> = {
  behavioral: 0,
  session_verified: 1,
  experience_verified: 2,
  financial_authoritative: 3,
};

const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

export function validateMissionDefinition(
  definition: MissionDefinition,
): MissionDefinition {
  if (!definition.missionId || !definition.destinationId) {
    throw new Error("MISSION_IDENTITY_INVALID");
  }
  if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
    throw new Error("MISSION_VERSION_INVALID");
  }
  if (definition.eligibleProfiles.length < 1) {
    throw new Error("MISSION_PROFILE_POLICY_EMPTY");
  }
  if (new Set(definition.eligibleProfiles).size !== definition.eligibleProfiles.length) {
    throw new Error("MISSION_PROFILE_POLICY_DUPLICATE");
  }
  if (definition.steps.length < 1) {
    throw new Error("MISSION_STEPS_EMPTY");
  }

  const stepIds = new Set<string>();
  for (const [index, step] of definition.steps.entries()) {
    if (!step.stepId || !step.label) {
      throw new Error("MISSION_STEP_IDENTITY_INVALID");
    }
    if (stepIds.has(step.stepId)) {
      throw new Error("MISSION_STEP_DUPLICATE");
    }
    stepIds.add(step.stepId);

    if (!Number.isSafeInteger(step.ordinal) || step.ordinal !== index + 1) {
      throw new Error("MISSION_STEP_ORDINAL_INVALID");
    }
    if (step.evidence.acceptedEventTypes.length < 1) {
      throw new Error("MISSION_EVIDENCE_EVENTS_EMPTY");
    }
  }

  if (definition.status === "published" && !definition.publishedAt) {
    throw new Error("MISSION_PUBLISHED_AT_REQUIRED");
  }
  if (definition.publishedAt && !isUtc(definition.publishedAt)) {
    throw new Error("MISSION_PUBLISHED_AT_INVALID");
  }

  return definition;
}

export function publishMissionDefinition(
  definition: MissionDefinition,
  publishedAt: string,
): MissionDefinition {
  validateMissionDefinition(definition);
  if (definition.status !== "draft") {
    throw new Error("MISSION_ONLY_DRAFT_CAN_PUBLISH");
  }
  if (!isUtc(publishedAt)) {
    throw new Error("MISSION_PUBLISHED_AT_INVALID");
  }

  return Object.freeze({
    ...definition,
    status: "published",
    publishedAt,
    eligibleProfiles: Object.freeze([...definition.eligibleProfiles]),
    steps: Object.freeze(
      definition.steps.map((step) =>
        Object.freeze({
          ...step,
          evidence: Object.freeze({
            ...step.evidence,
            acceptedEventTypes: Object.freeze([
              ...step.evidence.acceptedEventTypes,
            ]),
          }),
        }),
      ),
    ),
  });
}

export function createMissionRevision(
  published: MissionDefinition,
  next: Omit<MissionDefinition, "version" | "status" | "publishedAt">,
): MissionDefinition {
  validateMissionDefinition(published);
  if (published.status !== "published") {
    throw new Error("MISSION_REVISION_SOURCE_NOT_PUBLISHED");
  }
  if (next.missionId !== published.missionId) {
    throw new Error("MISSION_REVISION_ID_MISMATCH");
  }

  return validateMissionDefinition({
    ...next,
    version: published.version + 1,
    status: "draft",
  });
}

export function isMissionEligibleForProfile(
  definition: MissionDefinition,
  profileType: MissionProfileType,
): boolean {
  return definition.eligibleProfiles.includes(profileType);
}

export function createMissionProgress(
  definition: MissionDefinition,
  input: Readonly<{
    subjectId: string;
    journeyId: string;
    destinationId: string;
  }>,
): MissionProgressState {
  validateMissionDefinition(definition);
  if (definition.status !== "published") {
    throw new Error("MISSION_NOT_PUBLISHED");
  }
  if (definition.destinationId !== input.destinationId) {
    throw new Error("MISSION_DESTINATION_MISMATCH");
  }
  if (!input.subjectId || !input.journeyId) {
    throw new Error("MISSION_PROGRESS_IDENTITY_INVALID");
  }

  return Object.freeze({
    subjectId: input.subjectId,
    journeyId: input.journeyId,
    destinationId: input.destinationId,
    missionId: definition.missionId,
    missionVersion: definition.version,
    completedStepIds: Object.freeze([]),
    acceptedEvidenceIds: Object.freeze([]),
    acceptedReferencesByStep: Object.freeze({}),
  });
}

function evidenceFailure(
  definition: MissionDefinition,
  state: MissionProgressState,
  evidence: MissionEvidence,
): string | null {
  if (definition.status !== "published") return "MISSION_NOT_PUBLISHED";
  if (
    state.missionId !== definition.missionId ||
    state.missionVersion !== definition.version
  ) {
    return "MISSION_PROGRESS_VERSION_MISMATCH";
  }
  if (
    evidence.subjectId !== state.subjectId ||
    evidence.journeyId !== state.journeyId
  ) {
    return "MISSION_EVIDENCE_SUBJECT_MISMATCH";
  }
  if (
    evidence.destinationId !== state.destinationId ||
    evidence.destinationId !== definition.destinationId
  ) {
    return "MISSION_EVIDENCE_DESTINATION_MISMATCH";
  }
  if (!isUtc(evidence.occurredAt)) return "MISSION_EVIDENCE_TIME_INVALID";

  const step = definition.steps.find(
    (candidate) => candidate.stepId === evidence.stepId,
  );
  if (!step) return "MISSION_STEP_UNKNOWN";

  if (!step.evidence.acceptedEventTypes.includes(evidence.eventType)) {
    return "MISSION_EVENT_NOT_ACCEPTED";
  }
  if (
    TRUST_RANK[evidence.trustClass] <
    TRUST_RANK[step.evidence.minimumTrustClass]
  ) {
    return "MISSION_TRUST_INSUFFICIENT";
  }
  if (!evidence.reference) return "MISSION_EVIDENCE_REFERENCE_REQUIRED";

  if (step.evidence.distinctReferenceRequired) {
    const prior = state.acceptedReferencesByStep[step.stepId] ?? [];
    if (prior.includes(evidence.reference)) {
      return "MISSION_REFERENCE_REPLAY";
    }
  }

  return null;
}

export function applyMissionEvidence(
  definition: MissionDefinition,
  state: MissionProgressState,
  evidence: MissionEvidence,
): MissionProgressDecision {
  if (state.acceptedEvidenceIds.includes(evidence.evidenceId)) {
    return { kind: "replayed", state };
  }
  if (state.completedAt) {
    return { kind: "replayed", state };
  }

  const failure = evidenceFailure(definition, state, evidence);
  if (failure) return { kind: "rejected", state, code: failure };

  const step = definition.steps.find(
    (candidate) => candidate.stepId === evidence.stepId,
  );
  if (!step) {
    return { kind: "rejected", state, code: "MISSION_STEP_UNKNOWN" };
  }

  const references = {
    ...state.acceptedReferencesByStep,
    [step.stepId]: unique([
      ...(state.acceptedReferencesByStep[step.stepId] ?? []),
      evidence.reference,
    ]),
  };

  const completedStepIds = state.completedStepIds.includes(step.stepId)
    ? state.completedStepIds
    : unique([...state.completedStepIds, step.stepId]);

  const completed =
    completedStepIds.length === definition.steps.length;

  const nextState = Object.freeze({
    ...state,
    completedStepIds,
    acceptedEvidenceIds: unique([
      ...state.acceptedEvidenceIds,
      evidence.evidenceId,
    ]),
    acceptedReferencesByStep: Object.freeze(references),
    ...(completed ? { completedAt: evidence.occurredAt } : {}),
  });

  if (!completed) {
    return {
      kind: "progressed",
      state: nextState,
      event: "MissionProgressed",
    };
  }

  return {
    kind: "completed",
    state: nextState,
    events: ["MissionProgressed", "MissionCompleted"],
    completionKey: [
      state.journeyId,
      definition.missionId,
      String(definition.version),
    ].join(":"),
  };
}
