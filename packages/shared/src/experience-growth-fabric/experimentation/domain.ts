export type ExperimentStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed";

export interface ExperimentVariant {
  readonly variantId: string;
  readonly allocationBps: number;
  readonly isControl: boolean;
}

export interface ExperimentDefinition {
  readonly experimentId: string;
  readonly version: number;
  readonly destinationId: string;
  readonly status: ExperimentStatus;
  readonly saltVersion: string;
  readonly variants: readonly ExperimentVariant[];
  readonly startsAt: string;
  readonly endsAt?: string;
}

export interface ExperimentAssignment {
  readonly assignmentId: string;
  readonly experimentId: string;
  readonly experimentVersion: number;
  readonly subjectId: string;
  readonly destinationId: string;
  readonly variantId: string;
  readonly saltVersion: string;
  readonly bucket: number;
  readonly assignedAt: string;
}

export interface ExperimentExposure {
  readonly exposureId: string;
  readonly assignmentId: string;
  readonly experimentId: string;
  readonly subjectId: string;
  readonly variantId: string;
  readonly correlationId: string;
  readonly exposedAt: string;
}

export interface ExperimentOutcome {
  readonly outcomeId: string;
  readonly assignmentId: string;
  readonly metricCode: string;
  readonly value: number;
  readonly occurredAt: string;
}

export type AssignmentDecision =
  | Readonly<{
      assigned: true;
      assignment: ExperimentAssignment;
      event: "ExperimentAssigned";
    }>
  | Readonly<{
      assigned: false;
      code: string;
    }>;

export type ExposureDecision =
  | Readonly<{
      recorded: true;
      exposure: ExperimentExposure;
      event: "ExperimentExposureRecorded";
    }>
  | Readonly<{
      recorded: false;
      code: string;
    }>;

const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isUtc(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function validateExperimentDefinition(
  definition: ExperimentDefinition,
): ExperimentDefinition {
  if (!definition.experimentId || !definition.destinationId) {
    throw new Error("EXPERIMENT_IDENTITY_INVALID");
  }
  if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
    throw new Error("EXPERIMENT_VERSION_INVALID");
  }
  if (!definition.saltVersion) {
    throw new Error("EXPERIMENT_SALT_VERSION_REQUIRED");
  }
  if (!isUtc(definition.startsAt)) {
    throw new Error("EXPERIMENT_START_TIME_INVALID");
  }
  if (definition.endsAt) {
    if (!isUtc(definition.endsAt)) {
      throw new Error("EXPERIMENT_END_TIME_INVALID");
    }
    if (Date.parse(definition.endsAt) <= Date.parse(definition.startsAt)) {
      throw new Error("EXPERIMENT_WINDOW_INVALID");
    }
  }
  if (definition.variants.length < 2) {
    throw new Error("EXPERIMENT_VARIANTS_INSUFFICIENT");
  }

  const ids = new Set<string>();
  let totalAllocation = 0;
  let controlCount = 0;

  for (const variant of definition.variants) {
    if (!variant.variantId || ids.has(variant.variantId)) {
      throw new Error("EXPERIMENT_VARIANT_ID_INVALID");
    }
    ids.add(variant.variantId);

    if (
      !Number.isSafeInteger(variant.allocationBps) ||
      variant.allocationBps <= 0 ||
      variant.allocationBps > 10000
    ) {
      throw new Error("EXPERIMENT_ALLOCATION_INVALID");
    }
    totalAllocation += variant.allocationBps;
    if (variant.isControl) controlCount += 1;
  }

  if (totalAllocation !== 10000) {
    throw new Error("EXPERIMENT_ALLOCATION_MUST_SUM_10000");
  }
  if (controlCount !== 1) {
    throw new Error("EXPERIMENT_REQUIRES_SINGLE_CONTROL");
  }

  return definition;
}

export function deterministicExperimentBucket(
  subjectId: string,
  experimentId: string,
  saltVersion: string,
): number {
  if (!subjectId || !experimentId || !saltVersion) {
    throw new Error("EXPERIMENT_BUCKET_INPUT_INVALID");
  }
  return fnv1a32([subjectId, experimentId, saltVersion].join(":")) % 10000;
}

export function assignExperiment(
  definition: ExperimentDefinition,
  input: Readonly<{
    assignmentId: string;
    subjectId: string;
    destinationId: string;
    assignedAt: string;
  }>,
  existingAssignment: ExperimentAssignment | null,
): AssignmentDecision {
  validateExperimentDefinition(definition);

  if (existingAssignment) {
    if (
      existingAssignment.experimentId === definition.experimentId &&
      existingAssignment.experimentVersion === definition.version &&
      existingAssignment.subjectId === input.subjectId &&
      existingAssignment.saltVersion === definition.saltVersion
    ) {
      return {
        assigned: true,
        assignment: existingAssignment,
        event: "ExperimentAssigned",
      };
    }
    return {
      assigned: false,
      code: "EXPERIMENT_ASSIGNMENT_CONFLICT",
    };
  }

  if (definition.status !== "running") {
    return { assigned: false, code: "EXPERIMENT_NOT_RUNNING" };
  }
  if (!input.assignmentId || !input.subjectId) {
    return { assigned: false, code: "EXPERIMENT_ASSIGNMENT_IDENTITY_INVALID" };
  }
  if (input.destinationId !== definition.destinationId) {
    return { assigned: false, code: "EXPERIMENT_DESTINATION_MISMATCH" };
  }
  if (!isUtc(input.assignedAt)) {
    return { assigned: false, code: "EXPERIMENT_ASSIGNMENT_TIME_INVALID" };
  }

  const assignedAt = Date.parse(input.assignedAt);
  if (assignedAt < Date.parse(definition.startsAt)) {
    return { assigned: false, code: "EXPERIMENT_NOT_STARTED" };
  }
  if (definition.endsAt && assignedAt >= Date.parse(definition.endsAt)) {
    return { assigned: false, code: "EXPERIMENT_ENDED" };
  }

  const bucket = deterministicExperimentBucket(
    input.subjectId,
    definition.experimentId,
    definition.saltVersion,
  );

  let boundary = 0;
  let selected = definition.variants[definition.variants.length - 1];
  for (const variant of definition.variants) {
    boundary += variant.allocationBps;
    if (bucket < boundary) {
      selected = variant;
      break;
    }
  }
  if (!selected) {
    return { assigned: false, code: "EXPERIMENT_VARIANT_SELECTION_FAILED" };
  }

  const assignment: ExperimentAssignment = Object.freeze({
    assignmentId: input.assignmentId,
    experimentId: definition.experimentId,
    experimentVersion: definition.version,
    subjectId: input.subjectId,
    destinationId: input.destinationId,
    variantId: selected.variantId,
    saltVersion: definition.saltVersion,
    bucket,
    assignedAt: input.assignedAt,
  });

  return {
    assigned: true,
    assignment,
    event: "ExperimentAssigned",
  };
}

export function recordExperimentExposure(
  assignment: ExperimentAssignment,
  input: Readonly<{
    exposureId: string;
    correlationId: string;
    exposedAt: string;
    assignmentPersisted: boolean;
  }>,
  existingExposure: ExperimentExposure | null,
): ExposureDecision {
  if (existingExposure) {
    if (existingExposure.assignmentId === assignment.assignmentId) {
      return {
        recorded: true,
        exposure: existingExposure,
        event: "ExperimentExposureRecorded",
      };
    }
    return { recorded: false, code: "EXPERIMENT_EXPOSURE_CONFLICT" };
  }

  if (!input.assignmentPersisted) {
    return {
      recorded: false,
      code: "EXPERIMENT_ASSIGNMENT_NOT_PERSISTED",
    };
  }
  if (!input.exposureId || !input.correlationId || !isUtc(input.exposedAt)) {
    return { recorded: false, code: "EXPERIMENT_EXPOSURE_INPUT_INVALID" };
  }

  return {
    recorded: true,
    exposure: Object.freeze({
      exposureId: input.exposureId,
      assignmentId: assignment.assignmentId,
      experimentId: assignment.experimentId,
      subjectId: assignment.subjectId,
      variantId: assignment.variantId,
      correlationId: input.correlationId,
      exposedAt: input.exposedAt,
    }),
    event: "ExperimentExposureRecorded",
  };
}

export function treatmentMayExecuteValueAction(
  experimentAssigned: boolean,
  domainEligibilityAllowed: boolean,
  riskAllowed: boolean,
  financialAuthorityAllowed: boolean,
): boolean {
  return (
    experimentAssigned &&
    domainEligibilityAllowed &&
    riskAllowed &&
    financialAuthorityAllowed
  );
}

export function recordExperimentOutcome(
  outcome: ExperimentOutcome,
): ExperimentOutcome {
  if (
    !outcome.outcomeId ||
    !outcome.assignmentId ||
    !outcome.metricCode ||
    !Number.isFinite(outcome.value) ||
    !isUtc(outcome.occurredAt)
  ) {
    throw new Error("EXPERIMENT_OUTCOME_INVALID");
  }
  return Object.freeze({ ...outcome });
}
