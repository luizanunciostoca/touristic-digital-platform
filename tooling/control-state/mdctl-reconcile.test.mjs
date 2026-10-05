import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProjectionSchedulable,
  reconcileBacklogProjection,
} from "../mdctl/reconcile.mjs";

test("reconcile derives canonical merged lifecycle without trusting stale backlog fields", () => {
  const backlog = {
    items: [
      {
        id: "MD-FASTFIX-001",
        state: "READY",
        implementation: "MISSING",
        integration: "MISSING",
        proof: "MISSING",
        dependencies: [],
      },
    ],
  };
  const result = reconcileBacklogProjection({
    backlog,
    changeSets: {
      "MD-FASTFIX-001": { id: "MD-FASTFIX-001", state: "MERGED" },
    },
    registry: { claims: {} },
    liveWork: { items: [] },
  });
  assert.equal(result.schedulingSafe, true);
  assert.equal(result.drift.length, 1);
  assert.equal(result.drift[0].reconciled, true);
  assert.deepEqual(result.drift[0].unresolved, []);
  assert.deepEqual(result.derivedItems[0].effective, {
    state: "MERGED",
    implementation: "COMPLETE",
    integration: "COMPLETE",
    proof: "COMPLETE",
  });
  assert.ok(
    result.drift[0].contradictions.includes("MERGED_BUT_PROOF_MISSING"),
  );
  assert.ok(
    result.drift[0].contradictions.includes("MERGED_BUT_BACKLOG_NONTERMINAL"),
  );
  assert.doesNotThrow(() =>
    assertProjectionSchedulable({
      backlog: { schedulingSafe: result.schedulingSafe },
    }),
  );
});

test("dependency projection is rederived when closed dependencies are still marked blocked", () => {
  const result = reconcileBacklogProjection({
    backlog: {
      items: [
        {
          id: "MD-CHILD",
          state: "BLOCKED",
          implementation: "MISSING",
          integration: "MISSING",
          proof: "MISSING",
          dependencies: ["MD-PARENT"],
        },
      ],
    },
    changeSets: {
      "MD-PARENT": { id: "MD-PARENT", state: "MERGED" },
      "MD-CHILD": { id: "MD-CHILD", state: "IMPLEMENTING" },
    },
    registry: { claims: { "MD-CHILD": { status: "IMPLEMENTING" } } },
    liveWork: { items: [] },
  });
  assert.ok(
    result.drift[0].contradictions.includes(
      "DEPENDENCIES_MERGED_BUT_BACKLOG_BLOCKED",
    ),
  );
  assert.equal(result.schedulingSafe, true);
  assert.equal(result.derivedItems[0].effective.state, "IMPLEMENTING");
});

test("reconcile fails closed only when canonical authorities conflict", () => {
  const result = reconcileBacklogProjection({
    backlog: {
      items: [
        {
          id: "MD-X",
          state: "BLOCKED",
          implementation: "COMPLETE",
          integration: "COMPLETE",
          proof: "COMPLETE",
          dependencies: [],
        },
      ],
    },
    changeSets: { "MD-X": { id: "MD-X", state: "MERGED" } },
    registry: { claims: { "MD-X": { status: "IMPLEMENTING" } } },
    liveWork: { items: [] },
  });
  assert.equal(result.schedulingSafe, false);
  assert.deepEqual(result.unresolvedDrift[0].unresolved, [
    "MERGED_CHANGESET_HAS_ACTIVE_CLAIM",
  ]);
  assert.throws(
    () =>
      assertProjectionSchedulable({
        backlog: { schedulingSafe: result.schedulingSafe },
      }),
    /CONTROL_PROJECTION_DRIFT/u,
  );
});
