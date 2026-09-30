import { describe, expect, it } from "vitest";

import {
  assignExperiment,
  deterministicExperimentBucket,
  recordExperimentExposure,
  treatmentMayExecuteValueAction,
  validateExperimentDefinition,
} from "./domain.js";

const definition = validateExperimentDefinition({
  experimentId: "exp_morro_pass_message",
  version: 1,
  destinationId: "morro",
  status: "running",
  saltVersion: "salt-v1",
  variants: [
    { variantId: "control", allocationBps: 5000, isControl: true },
    { variantId: "treatment", allocationBps: 5000, isControl: false },
  ],
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-12-01T00:00:00.000Z",
});

describe("experimentation", () => {
  it("assigns a subject deterministically from subject+experiment+salt", () => {
    const first = deterministicExperimentBucket(
      "asub_00000001",
      definition.experimentId,
      definition.saltVersion,
    );
    const second = deterministicExperimentBucket(
      "asub_00000001",
      definition.experimentId,
      definition.saltVersion,
    );

    expect(first).toBe(second);

    const assignment = assignExperiment(
      definition,
      {
        assignmentId: "assignment_00000001",
        subjectId: "asub_00000001",
        destinationId: "morro",
        assignedAt: "2026-09-30T12:00:00.000Z",
      },
      null,
    );
    expect(assignment.assigned).toBe(true);
    if (!assignment.assigned) return;
    expect(assignment.assignment.bucket).toBe(first);
  });

  it("replays an existing stable assignment instead of moving variants", () => {
    const first = assignExperiment(
      definition,
      {
        assignmentId: "assignment_00000001",
        subjectId: "asub_00000001",
        destinationId: "morro",
        assignedAt: "2026-09-30T12:00:00.000Z",
      },
      null,
    );
    if (!first.assigned) throw new Error("EXPERIMENT_ASSIGNMENT_FAILED");

    const replay = assignExperiment(
      definition,
      {
        assignmentId: "assignment_new",
        subjectId: "asub_00000001",
        destinationId: "morro",
        assignedAt: "2026-10-01T12:00:00.000Z",
      },
      first.assignment,
    );

    expect(replay.assigned).toBe(true);
    if (!replay.assigned) return;
    expect(replay.assignment.assignmentId).toBe("assignment_00000001");
    expect(replay.assignment.variantId).toBe(first.assignment.variantId);
  });

  it("requires assignment persistence before exposure", () => {
    const assigned = assignExperiment(
      definition,
      {
        assignmentId: "assignment_00000001",
        subjectId: "asub_00000001",
        destinationId: "morro",
        assignedAt: "2026-09-30T12:00:00.000Z",
      },
      null,
    );
    if (!assigned.assigned) throw new Error("EXPERIMENT_ASSIGNMENT_FAILED");

    const rejected = recordExperimentExposure(
      assigned.assignment,
      {
        exposureId: "exposure_00000001",
        correlationId: "corr_00000001",
        exposedAt: "2026-09-30T12:01:00.000Z",
        assignmentPersisted: false,
      },
      null,
    );
    expect(rejected).toEqual({
      recorded: false,
      code: "EXPERIMENT_ASSIGNMENT_NOT_PERSISTED",
    });

    const exposure = recordExperimentExposure(
      assigned.assignment,
      {
        exposureId: "exposure_00000001",
        correlationId: "corr_00000001",
        exposedAt: "2026-09-30T12:01:00.000Z",
        assignmentPersisted: true,
      },
      null,
    );
    expect(exposure.recorded).toBe(true);
  });

  it("never lets treatment assignment bypass domain/risk/financial policies", () => {
    expect(treatmentMayExecuteValueAction(true, true, true, true)).toBe(true);
    expect(treatmentMayExecuteValueAction(true, false, true, true)).toBe(false);
    expect(treatmentMayExecuteValueAction(true, true, false, true)).toBe(false);
    expect(treatmentMayExecuteValueAction(true, true, true, false)).toBe(false);
  });

  it("rejects invalid allocation and missing control groups", () => {
    expect(() =>
      validateExperimentDefinition({
        ...definition,
        variants: [
          { variantId: "a", allocationBps: 8000, isControl: false },
          { variantId: "b", allocationBps: 2000, isControl: false },
        ],
      }),
    ).toThrow("EXPERIMENT_REQUIRES_SINGLE_CONTROL");
  });
});
