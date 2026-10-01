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

test("declared ready candidate without accepted fabric proof cannot dispatch", () => {
  const plan = buildPlan(state());
  assert.equal(plan.dispatchAllowed, false);
  assert.deepEqual(plan.dispatchableCandidates, []);
});

test("observed blocker prevents dispatch", () => {
  const plan = buildPlan(
    state({
      observed: {
        blockers: [{ code: "TEST_BLOCKER", subject: "candidate" }],
        nextReadyTasks: [{ id: "MD-READY", dispatchAllowed: true }],
      },
    }),
  );
  assert.equal(plan.dispatchAllowed, false);
});

test("only an explicitly dispatchable next-ready task can authorize dispatch", () => {
  const plan = buildPlan(
    state({
      observed: {
        blockers: [],
        nextReadyTasks: [{ id: "MD-READY", dispatchAllowed: true }],
      },
    }),
  );
  assert.equal(plan.dispatchAllowed, true);
  assert.equal(plan.dispatchableCandidates[0].id, "MD-READY");
});
