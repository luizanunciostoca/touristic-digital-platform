import { describe, expect, it } from "vitest";

import { evaluateAcquisitionV2 } from "./engine.js";
import { createAffiliateAcquisitionPolicyV2 } from "./policy-v2.js";

const policy = createAffiliateAcquisitionPolicyV2({
  attributionWindowDays: 30,
  reacquisitionInactivityDays: 7,
  minimumMeaningfulSignals: 1,
});

const baseAttempt = {
  commandId: "cmd_00000001",
  proposedCycleId: "acy_00000001",
  proposedTouchpointId: "itp_00000001",
  subjectId: "asub_00000001",
  destinationId: "morro",
  affiliateId: "aff_00000001",
  placementId: "plc_00000001",
  serverValidatedPlacement: true,
  affiliateEligible: true,
  riskAllowed: true,
  meaningfulSignalCount: 1,
  occurredAt: "2026-09-01T12:00:00.000Z",
};

describe("Affiliate Acquisition V2", () => {
  it("establishes the first qualified acquisition", () => {
    const decision = evaluateAcquisitionV2(baseAttempt, policy, null);

    expect(decision.kind).toBe("acquired");
    if (decision.kind !== "acquired") return;

    expect(decision.cycle.ownerAffiliateId).toBe("aff_00000001");
    expect(decision.cycle.policyVersion).toBe("AFFILIATE-POLICY-V2");
    expect(decision.events).toEqual([
      "QualifiedAcquisitionEstablished",
      "AcquisitionCycleOpened",
    ]);
  });

  it("records a later affiliate as influence without stealing ownership", () => {
    const first = evaluateAcquisitionV2(baseAttempt, policy, null);
    if (first.kind !== "acquired") throw new Error("FIRST_ACQUISITION_FAILED");

    const second = evaluateAcquisitionV2(
      {
        ...baseAttempt,
        commandId: "cmd_00000002",
        proposedCycleId: "acy_00000002",
        proposedTouchpointId: "itp_00000002",
        affiliateId: "aff_00000002",
        placementId: "plc_00000002",
        occurredAt: "2026-09-05T12:00:00.000Z",
      },
      policy,
      first.cycle,
    );

    expect(second.kind).toBe("influence");
    if (second.kind !== "influence") return;

    expect(second.cycle.ownerAffiliateId).toBe("aff_00000001");
    expect(second.touchpoint.affiliateId).toBe("aff_00000002");
  });

  it("treats a replayed command as a no-op", () => {
    const decision = evaluateAcquisitionV2(
      baseAttempt,
      policy,
      null,
      new Set(["cmd_00000001"]),
    );

    expect(decision).toEqual({
      kind: "replayed",
      commandId: "cmd_00000001",
      events: [],
    });
  });

  it("rejects first acquisition without qualified server evidence", () => {
    const decision = evaluateAcquisitionV2(
      {
        ...baseAttempt,
        serverValidatedPlacement: false,
      },
      policy,
      null,
    );

    expect(decision).toEqual({
      kind: "rejected",
      code: "PLACEMENT_NOT_SERVER_VALIDATED",
      events: [],
    });
  });

  it("requires expiry plus inactivity before qualified reacquisition", () => {
    const first = evaluateAcquisitionV2(baseAttempt, policy, null);
    if (first.kind !== "acquired") throw new Error("FIRST_ACQUISITION_FAILED");

    const tooSoon = evaluateAcquisitionV2(
      {
        ...baseAttempt,
        commandId: "cmd_00000003",
        proposedCycleId: "acy_00000003",
        affiliateId: "aff_00000002",
        occurredAt: "2026-10-02T12:00:00.000Z",
        inactiveSince: "2026-09-30T12:00:00.000Z",
      },
      policy,
      first.cycle,
    );

    expect(tooSoon.kind).toBe("rejected");
    if (tooSoon.kind !== "rejected") return;
    expect(tooSoon.code).toBe("REACQUISITION_INACTIVITY_NOT_MET");

    const accepted = evaluateAcquisitionV2(
      {
        ...baseAttempt,
        commandId: "cmd_00000004",
        proposedCycleId: "acy_00000004",
        affiliateId: "aff_00000002",
        placementId: "plc_00000002",
        occurredAt: "2026-10-10T12:00:00.000Z",
        inactiveSince: "2026-10-01T12:00:00.000Z",
      },
      policy,
      first.cycle,
    );

    expect(accepted.kind).toBe("reacquired");
    if (accepted.kind !== "reacquired") return;

    expect(accepted.previousCycleId).toBe(first.cycle.cycleId);
    expect(accepted.cycle.ownerAffiliateId).toBe("aff_00000002");
    expect(accepted.events).toContain("QualifiedReacquisitionEstablished");
  });

  it("keeps risk fail-closed for acquisition and influence", () => {
    const blocked = evaluateAcquisitionV2(
      { ...baseAttempt, riskAllowed: false },
      policy,
      null,
    );
    expect(blocked.kind).toBe("rejected");

    const first = evaluateAcquisitionV2(baseAttempt, policy, null);
    if (first.kind !== "acquired") throw new Error("FIRST_ACQUISITION_FAILED");

    const influence = evaluateAcquisitionV2(
      {
        ...baseAttempt,
        commandId: "cmd_00000005",
        proposedTouchpointId: "itp_00000005",
        riskAllowed: false,
        occurredAt: "2026-09-06T12:00:00.000Z",
      },
      policy,
      first.cycle,
    );
    expect(influence.kind).toBe("rejected");
  });
});
