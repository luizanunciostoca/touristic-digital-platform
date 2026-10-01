import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIntegrationQueue,
  buildSchedulerPlan,
  evaluateDependenciesAtMain,
  findSemanticCollisions,
  loadSchedulerPolicy,
  normalizeObjective,
  schedulerClaimBindingError,
  semanticLocks,
  validateSchedulerPolicy,
} from "../mdctl/scheduler.mjs";

function changeSet(id, objective, overrides = {}) {
  return {
    schemaVersion: 2,
    id,
    objective,
    baseSha: "a".repeat(40),
    branch: "feat/" + id.toLowerCase(),
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: {
      paths: ["packages/" + id.toLowerCase() + "/**"],
      contracts: [],
    },
    reads: { contracts: [] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["remote-proof"],
    requiredCapabilities: ["github:read"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "unit",
          argv: ["node", "--test", "tooling/unit.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
    ...overrides,
  };
}

test("objective normalization is stable and bounded", () => {
  assert.equal(
    normalizeObjective(" Brand Family V2 Adoption "),
    "brand-family-v2-adoption",
  );
  assert.throws(() => normalizeObjective("x"), /SCHEDULER_OBJECTIVE_INVALID/u);
});

test("semantic collisions include objective and shared authorities", () => {
  const left = changeSet("MD-A", "brand-family-v2-adoption", {
    owns: { paths: ["apps/web/**"], contracts: ["BRAND"] },
    produces: { events: ["BRAND_UPDATED"], routes: ["/brand"] },
    database: { tables: ["brand_assets"] },
    auth: { capabilities: ["brand:write"] },
  });
  const right = changeSet("MD-B", "brand-family-v2-adoption", {
    owns: { paths: ["apps/web/src/**"], contracts: ["BRAND"] },
    produces: { events: ["BRAND_UPDATED"], routes: ["/brand"] },
    database: { tables: ["brand_assets"] },
    auth: { capabilities: ["brand:write"] },
  });
  const kinds = new Set(
    findSemanticCollisions(left, [right]).map((x) => x.kind),
  );
  for (const kind of [
    "objective",
    "path",
    "contract",
    "event",
    "table",
    "route",
    "auth",
  ]) {
    assert.ok(kinds.has(kind), kind);
  }
});

test("global WIP=3 blocks a fourth writer", () => {
  const active = ["MD-A", "MD-B", "MD-C"].map((id, index) => ({
    changeSet: changeSet(id, "objective-" + index),
    writerActive: true,
    openPr: true,
  }));
  const next = {
    changeSet: changeSet("MD-D", "objective-next"),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    openPr: false,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [...active, next],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked[0].code, "GLOBAL_WIP_FULL");
});

test("same objective cannot receive a second writer", () => {
  const current = {
    changeSet: changeSet("MD-A", "brand-family-v2-adoption"),
    writerActive: true,
    openPr: true,
  };
  const next = {
    changeSet: changeSet("MD-B", "brand-family-v2-adoption"),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    openPr: false,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [current, next],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked[0].code, "SEMANTIC_COLLISION");
});

test("drift over 20 commits forces replan", () => {
  const item = {
    changeSet: changeSet("MD-DRIFT", "drifted-task"),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    behindBy: 21,
    changedFiles: 2,
    changedLines: 20,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [item],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked[0].code, "REPLAN_REQUIRED");
  assert.deepEqual(plan.blocked[0].reasons, ["SUPERSEDED_BY_MAIN_DRIFT"]);
});
test("scheduler grants compatible work by priority", () => {
  const low = {
    changeSet: changeSet("MD-LOW", "low-objective", { risk: "low" }),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    priority: "P2",
  };
  const high = {
    changeSet: changeSet("MD-HIGH", "high-objective", { risk: "critical" }),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [low, high],
  });
  assert.deepEqual(
    plan.grants.map((x) => x.id),
    ["MD-HIGH", "MD-LOW"],
  );
  assert.ok(plan.grants.every((x) => x.exactBaseSha === "b".repeat(40)));
});

test("integration queue includes only MERGE_READY items", () => {
  const ready = changeSet("MD-READY", "ready-objective", {
    state: "MERGE_READY",
  });
  const implementing = changeSet("MD-WIP", "wip-objective");
  const queue = buildIntegrationQueue({
    mainSha: "b".repeat(40),
    workItems: [
      {
        changeSet: implementing,
        prNumber: 1,
        headSha: "c".repeat(40),
        priority: "P1",
      },
      {
        changeSet: ready,
        prNumber: 2,
        headSha: "d".repeat(40),
        priority: "P0",
        openPr: true,
        dependenciesSatisfied: true,
        behindBy: 0,
        baseIsAncestorOfMain: true,
        statsKnown: true,
        changedFiles: 1,
        changedLines: 10,
        invalid: null,
      },
    ],
  });
  assert.equal(queue.batches.length, 1);
  assert.deepEqual(
    queue.batches[0].items.map((x) => x.changeSetId),
    ["MD-READY"],
  );
  assert.equal(semanticLocks(ready).objective, "ready-objective");
});

test("versioned scheduler policy is executable and fail-closed", async () => {
  const policy = await loadSchedulerPolicy();
  assert.deepEqual(policy, {
    globalWriterLimit: 3,
    activePrLimit: 8,
    sameObjectiveLimit: 1,
    replanBehindCommits: 20,
    hardFiles: 30,
    hardLines: 1500,
    objectiveRequiredForDispatch: true,
    writerStates: [
      "IMPLEMENTING",
      "LOCAL_PROVEN",
      "REMOTE_PROVEN",
      "COMPOSITION_PROVEN",
      "POLICY_SATISFIED",
    ],
    slotReleaseStates: ["MERGE_READY", "MERGED"],
  });
  assert.throws(
    () =>
      validateSchedulerPolicy({
        version: 1,
        globalWriterLimit: 3,
        activePrLimit: 8,
        sameObjectiveLimit: 1,
        replanBehindCommits: 20,
        changeLimits: { hardFiles: 30, hardLines: 1500 },
        objectiveRequiredForDispatch: true,
        writerStates: [
          "IMPLEMENTING",
          "LOCAL_PROVEN",
          "REMOTE_PROVEN",
          "COMPOSITION_PROVEN",
          "POLICY_SATISFIED",
        ],
        slotReleaseStates: ["MERGE_READY", "MERGED"],
        typo: true,
      }),
    /SCHEDULER_POLICY_PROPERTY_UNKNOWN/u,
  );
});

test("dependencies are satisfied only by exact MERGED manifests on current main", async () => {
  const child = changeSet("MD-CHILD", "child-objective", {
    dependencies: ["MD-BASE"],
  });
  const merged = changeSet("MD-BASE", "base-objective", {
    state: "MERGED",
  });
  const encode = (value) => ({
    encoding: "base64",
    content: Buffer.from(JSON.stringify(value)).toString("base64"),
  });
  const api = async (endpoint) => {
    assert.match(endpoint, /MD-BASE\.json\?ref=/u);
    return encode(merged);
  };
  assert.deepEqual(
    await evaluateDependenciesAtMain({
      changeSet: child,
      repository: "example/repo",
      mainSha: "b".repeat(40),
      api,
    }),
    { satisfied: true, unresolved: [] },
  );
  assert.deepEqual(
    await evaluateDependenciesAtMain({
      changeSet: child,
      repository: "example/repo",
      mainSha: "b".repeat(40),
      api: async () => encode({ ...merged, state: "LOCAL_PROVEN" }),
    }),
    { satisfied: false, unresolved: ["MD-BASE"] },
  );
  assert.deepEqual(
    await evaluateDependenciesAtMain({
      changeSet: child,
      repository: "example/repo",
      mainSha: "b".repeat(40),
      api: async () => {
        throw new Error("missing");
      },
    }),
    { satisfied: false, unresolved: ["MD-BASE"] },
  );
});

test("legacy dependency manifests on exact main remain eligible only when MERGED", async () => {
  const child = changeSet("MD-LEGACY-CHILD", "legacy-child", {
    dependencies: ["MD-LEGACY-BASE"],
  });
  const legacy = {
    id: "MD-LEGACY-BASE",
    baseSha: "a".repeat(40),
    branch: "legacy/base",
    state: "MERGED",
  };
  const encode = (value) => ({
    encoding: "base64",
    content: Buffer.from(JSON.stringify(value)).toString("base64"),
  });
  assert.deepEqual(
    await evaluateDependenciesAtMain({
      changeSet: child,
      repository: "example/repo",
      mainSha: "b".repeat(40),
      api: async () => encode(legacy),
    }),
    { satisfied: true, unresolved: [] },
  );
  assert.deepEqual(
    await evaluateDependenciesAtMain({
      changeSet: child,
      repository: "example/repo",
      mainSha: "b".repeat(40),
      api: async () => encode({ ...legacy, state: "IMPLEMENTING" }),
    }),
    { satisfied: false, unresolved: ["MD-LEGACY-BASE"] },
  );
  assert.deepEqual(
    await evaluateDependenciesAtMain({
      changeSet: child,
      repository: "example/repo",
      mainSha: "b".repeat(40),
      api: async () => encode({ ...legacy, schemaVersion: 99 }),
    }),
    { satisfied: false, unresolved: ["MD-LEGACY-BASE"] },
  );
});

test("claim/base drift is invalid and blocks dispatch", () => {
  const candidate = changeSet("MD-CLAIM-DRIFT", "claim-drift");
  const claim = {
    status: "LOCAL_PROVEN",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: candidate.branch,
    baseSha: "c".repeat(40),
    expiresAt: "2099-01-01T00:00:00Z",
  };
  assert.equal(
    schedulerClaimBindingError(
      claim,
      candidate,
      Date.parse("2026-10-01T12:00:00Z"),
    ),
    "CLAIM_CHANGESET_BASE_MISMATCH",
  );
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [
      {
        changeSet: candidate,
        writerActive: false,
        ready: true,
        dependenciesSatisfied: true,
        openPr: false,
        priority: "P0",
        invalid: "CLAIM_CHANGESET_BASE_MISMATCH",
      },
    ],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked[0].code, "WORK_ITEM_INVALID");
});

test("invalid active writer prevents new dispatch", () => {
  const active = {
    changeSet: changeSet("MD-BAD-ACTIVE", "bad-active"),
    writerActive: true,
    openPr: true,
    invalid: "CLAIM_EXPIRED",
  };
  const next = {
    changeSet: changeSet("MD-NEXT", "next-objective"),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    openPr: false,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [active, next],
  });
  assert.ok(
    plan.violations.some((item) => item.code === "LIVE_WORK_ITEM_INVALID"),
  );
  assert.equal(plan.dispatchAllowed, false);
});

test("integration queue excludes invalid, stale, or dependency-blocked candidates", () => {
  const ready = changeSet("MD-QUEUE-GOOD", "queue-good", {
    state: "MERGE_READY",
  });
  const item = (id, overrides = {}) => ({
    changeSet: { ...ready, id, objective: id.toLowerCase() },
    prNumber: 10,
    headSha: "d".repeat(40),
    priority: "P1",
    openPr: true,
    dependenciesSatisfied: true,
    behindBy: 0,
    baseIsAncestorOfMain: true,
    statsKnown: true,
    changedFiles: 1,
    changedLines: 10,
    invalid: null,
    ...overrides,
  });
  const queue = buildIntegrationQueue({
    mainSha: "b".repeat(40),
    workItems: [
      item("MD-GOOD"),
      item("MD-INVALID", { invalid: "CLAIM_EXPIRED" }),
      item("MD-DEPS", { dependenciesSatisfied: false }),
      item("MD-DRIFT", { behindBy: 21 }),
    ],
  });
  assert.deepEqual(
    queue.batches[0].items.map((entry) => entry.changeSetId),
    ["MD-GOOD"],
  );
});

test("claim expiry and review authority fail closed", () => {
  const candidate = changeSet("MD-CLAIM-AUTH", "claim-auth");
  const base = {
    status: "LOCAL_PROVEN",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: candidate.branch,
    baseSha: candidate.baseSha,
    expiresAt: "2026-10-01T13:00:00Z",
  };
  assert.equal(
    schedulerClaimBindingError(
      base,
      candidate,
      Date.parse("2026-10-01T14:00:00Z"),
    ),
    "CLAIM_EXPIRED",
  );
  assert.equal(
    schedulerClaimBindingError(
      {
        ...base,
        expiresAt: "2099-01-01T00:00:00Z",
        reviewer: "HUMAN",
      },
      candidate,
      Date.parse("2026-10-01T14:00:00Z"),
    ),
    "CLAIM_REVIEW_AUTHORITY_INVALID",
  );
});

test("merge-ready live PRs belong to integration queue, not writer dispatch", () => {
  const ready = {
    changeSet: changeSet("MD-INTEGRATE", "integrate-objective", {
      state: "MERGE_READY",
    }),
    writerActive: false,
    ready: true,
    openPr: true,
    headSha: "d".repeat(40),
    dependenciesSatisfied: true,
    behindBy: 0,
    baseIsAncestorOfMain: true,
    statsKnown: true,
    changedFiles: 1,
    changedLines: 10,
    invalid: null,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [ready],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked.length, 0);
});
