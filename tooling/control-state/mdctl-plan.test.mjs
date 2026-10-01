import assert from "node:assert/strict";
import test from "node:test";
import { buildPlan } from "../mdctl/mdctl.mjs";

function state(overrides = {}) {
  return {
    observed: {
      mainSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      blockers: [],
      collectionState: "CAPTURED",
      readyCandidates: [
        {
          id: "MD-UNVERIFIED",
          dispatchAllowed: false,
          requiresFabricProof: true,
        },
      ],
      nextReadyTasks: [],
      nextActions: [],
      ...overrides.observed,
    },
    invariants: {
      criticalFailures: [],
      ...overrides.invariants,
    },
  };
}

test("declared ready candidate without trusted live plan cannot dispatch", () => {
  const plan = buildPlan(state());
  assert.equal(plan.dispatchAllowed, false);
  assert.deepEqual(plan.dispatchableCandidates, []);
  assert.deepEqual(plan.schedulerViolations, [
    { code: "LIVE_SCHEDULER_PLAN_REQUIRED" },
  ]);
});

test("observed blocker prevents dispatch even with a trusted live grant", () => {
  const plan = buildPlan(
    state({
      observed: {
        blockers: [{ code: "TEST_BLOCKER", subject: "candidate" }],
        liveSchedulerPlan: {
          grants: [{ id: "MD-READY", exactBaseSha: "a".repeat(40) }],
          blocked: [],
          violations: [],
        },
      },
    }),
  );
  assert.equal(plan.dispatchAllowed, false);
});

test("only a trusted live scheduler grant can authorize dispatch", () => {
  const plan = buildPlan(
    state({
      observed: {
        blockers: [],
        liveSchedulerPlan: {
          grants: [{ id: "MD-READY", exactBaseSha: "a".repeat(40) }],
          blocked: [],
          violations: [],
        },
      },
    }),
  );
  assert.equal(plan.dispatchAllowed, true);
  assert.equal(plan.dispatchableCandidates[0].id, "MD-READY");
});
