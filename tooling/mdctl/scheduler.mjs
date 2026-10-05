import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { patternsOverlap } from "../fabric/claim-guard.mjs";
import { selectAuthorizedExecutor } from "../failure-learning/executor-preflight.mjs";
import { validateChangeSetV2 } from "./changeset-v2.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const OBJECTIVE = /^[a-z0-9][a-z0-9._/-]{2,159}$/u;
const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };
const RISK = { critical: 0, high: 1, medium: 2, low: 3 };

const SCHEDULER_STATES = new Set([
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "COMPOSITION_PROVEN",
  "POLICY_SATISFIED",
  "MERGE_READY",
  "MERGED",
]);

export const DEFAULT_SCHEDULER_POLICY = Object.freeze({
  globalWriterLimit: 3,
  activePrLimit: 8,
  sameObjectiveLimit: 1,
  replanBehindCommits: 20,
  hardFiles: 30,
  hardLines: 1500,
  objectiveRequiredForDispatch: true,
  writerStates: Object.freeze([
    "IMPLEMENTING",
    "LOCAL_PROVEN",
    "REMOTE_PROVEN",
    "COMPOSITION_PROVEN",
    "POLICY_SATISFIED",
  ]),
  slotReleaseStates: Object.freeze(["MERGE_READY", "MERGED"]),
});

function assertClosedObject(value, allowed, code) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    code + "_OBJECT_INVALID",
  );
  for (const key of Object.keys(value))
    assert.ok(allowed.has(key), code + "_PROPERTY_UNKNOWN:" + key);
  return value;
}

function uniquePolicyStates(values, code) {
  assert.ok(Array.isArray(values) && values.length > 0, code);
  assert.equal(new Set(values).size, values.length, code + "_DUPLICATE");
  for (const value of values)
    assert.ok(SCHEDULER_STATES.has(value), code + "_STATE_INVALID");
  return values;
}

export function validateSchedulerPolicy(policy) {
  assertClosedObject(
    policy,
    new Set([
      "version",
      "globalWriterLimit",
      "activePrLimit",
      "sameObjectiveLimit",
      "replanBehindCommits",
      "changeLimits",
      "objectiveRequiredForDispatch",
      "writerStates",
      "slotReleaseStates",
    ]),
    "SCHEDULER_POLICY",
  );
  assert.equal(policy.version, 1, "SCHEDULER_POLICY_VERSION_INVALID");
  assert.ok(
    Number.isInteger(policy.globalWriterLimit) &&
      policy.globalWriterLimit >= 1 &&
      policy.globalWriterLimit <= 3,
    "SCHEDULER_POLICY_GLOBALWRITERLIMIT_INVALID",
  );
  assert.ok(
    Number.isInteger(policy.activePrLimit) &&
      policy.activePrLimit >= policy.globalWriterLimit &&
      policy.activePrLimit <= 8,
    "SCHEDULER_POLICY_ACTIVEPRLIMIT_INVALID",
  );
  assert.equal(
    policy.sameObjectiveLimit,
    1,
    "SCHEDULER_POLICY_SAMEOBJECTIVELIMIT_INVALID",
  );
  assert.ok(
    Number.isInteger(policy.replanBehindCommits) &&
      policy.replanBehindCommits >= 1 &&
      policy.replanBehindCommits <= 20,
    "SCHEDULER_POLICY_REPLAN_INVALID",
  );
  assert.equal(
    typeof policy.objectiveRequiredForDispatch,
    "boolean",
    "SCHEDULER_POLICY_OBJECTIVE_FLAG_INVALID",
  );
  assertClosedObject(
    policy.changeLimits,
    new Set(["hardFiles", "hardLines"]),
    "SCHEDULER_POLICY_CHANGE_LIMITS",
  );
  assert.ok(
    Number.isInteger(policy.changeLimits.hardFiles) &&
      policy.changeLimits.hardFiles >= 1 &&
      policy.changeLimits.hardFiles <= 30,
    "SCHEDULER_POLICY_HARD_FILES_INVALID",
  );
  assert.ok(
    Number.isInteger(policy.changeLimits.hardLines) &&
      policy.changeLimits.hardLines >= 1 &&
      policy.changeLimits.hardLines <= 1500,
    "SCHEDULER_POLICY_HARD_LINES_INVALID",
  );
  const writerStates = uniquePolicyStates(
    policy.writerStates,
    "SCHEDULER_POLICY_WRITER_STATES_INVALID",
  );
  const slotReleaseStates = uniquePolicyStates(
    policy.slotReleaseStates,
    "SCHEDULER_POLICY_RELEASE_STATES_INVALID",
  );
  assert.deepEqual(
    writerStates,
    [...DEFAULT_SCHEDULER_POLICY.writerStates],
    "SCHEDULER_POLICY_WRITER_STATES_MISMATCH",
  );
  assert.deepEqual(
    slotReleaseStates,
    [...DEFAULT_SCHEDULER_POLICY.slotReleaseStates],
    "SCHEDULER_POLICY_RELEASE_STATES_MISMATCH",
  );
  assert.deepEqual(
    writerStates.filter((state) => slotReleaseStates.includes(state)),
    [],
    "SCHEDULER_POLICY_STATE_OVERLAP",
  );
  return {
    globalWriterLimit: policy.globalWriterLimit,
    activePrLimit: policy.activePrLimit,
    sameObjectiveLimit: policy.sameObjectiveLimit,
    replanBehindCommits: policy.replanBehindCommits,
    hardFiles: policy.changeLimits.hardFiles,
    hardLines: policy.changeLimits.hardLines,
    objectiveRequiredForDispatch: policy.objectiveRequiredForDispatch,
    writerStates: [...writerStates],
    slotReleaseStates: [...slotReleaseStates],
  };
}

export async function loadSchedulerPolicy(
  path = ".morro/scheduler-policy.json",
) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return validateSchedulerPolicy(raw);
}

function clean(value, limit = 200) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function normalizeObjective(value) {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  assert.match(normalized, OBJECTIVE, "SCHEDULER_OBJECTIVE_INVALID");
  return normalized;
}

function intersects(left = [], right = []) {
  const set = new Set(left);
  return right.filter((value) => set.has(value));
}
export function semanticLocks(changeSet) {
  validateChangeSetV2(changeSet);
  const objective = changeSet.objective
    ? normalizeObjective(changeSet.objective)
    : normalizeObjective(changeSet.id);
  return {
    objective,
    paths: [...changeSet.owns.paths],
    contracts: [...changeSet.owns.contracts],
    events: [...changeSet.produces.events],
    tables: [...changeSet.database.tables],
    routes: [...changeSet.produces.routes],
    authCapabilities: [...changeSet.auth.capabilities],
  };
}

export function findSemanticCollisions(candidate, activeChangeSets = []) {
  const left = semanticLocks(candidate);
  const collisions = [];
  for (const other of activeChangeSets) {
    if (!other || other.id === candidate.id) continue;
    const right = semanticLocks(other);
    if (left.objective === right.objective) {
      collisions.push({
        otherId: other.id,
        kind: "objective",
        value: left.objective,
      });
    }
    for (const a of left.paths) {
      for (const b of right.paths) {
        if (patternsOverlap(a, b)) {
          collisions.push({
            otherId: other.id,
            kind: "path",
            value: a + " <-> " + b,
          });
        }
      }
    }
    for (const [kind, a, b] of [
      ["contract", left.contracts, right.contracts],
      ["event", left.events, right.events],
      ["table", left.tables, right.tables],
      ["route", left.routes, right.routes],
      ["auth", left.authCapabilities, right.authCapabilities],
    ]) {
      for (const value of intersects(a, b)) {
        collisions.push({ otherId: other.id, kind, value });
      }
    }
  }
  return collisions;
}
export function classifyWorkItem(item, policy = DEFAULT_SCHEDULER_POLICY) {
  const reasons = [];
  if (item.baseIsAncestorOfMain === false) {
    reasons.push("BASE_NOT_ANCESTOR_OF_MAIN");
  }
  if (item.behindBy == null && item.openPr === true) {
    reasons.push("MAIN_DRIFT_UNKNOWN");
  } else if ((item.behindBy ?? 0) > policy.replanBehindCommits) {
    reasons.push("SUPERSEDED_BY_MAIN_DRIFT");
  }
  if (item.statsKnown === false) {
    reasons.push("PR_STATS_UNKNOWN");
  }
  if ((item.changedFiles ?? 0) > policy.hardFiles) {
    reasons.push("HARD_FILE_LIMIT_EXCEEDED");
  }
  if ((item.changedLines ?? 0) > policy.hardLines) {
    reasons.push("HARD_LINE_LIMIT_EXCEEDED");
  }
  return {
    ...item,
    replanRequired: reasons.length > 0,
    replanReasons: reasons,
  };
}

function orderWork(a, b) {
  return (
    (PRIORITY[a.priority] ?? 99) - (PRIORITY[b.priority] ?? 99) ||
    (RISK[a.changeSet?.risk] ?? 99) - (RISK[b.changeSet?.risk] ?? 99) ||
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
    a.changeSet.id.localeCompare(b.changeSet.id)
  );
}

export function buildSchedulerPlan({
  mainSha,
  workItems,
  policy = DEFAULT_SCHEDULER_POLICY,
}) {
  assert.match(mainSha ?? "", SHA, "SCHEDULER_MAIN_SHA_INVALID");
  assert.ok(Array.isArray(workItems), "SCHEDULER_WORK_ITEMS_INVALID");
  const classified = workItems.map((item) => classifyWorkItem(item, policy));
  const active = classified.filter((item) => item.writerActive === true);
  const violations = classified
    .filter((item) => item.invalid)
    .map((item) => ({
      code: "LIVE_WORK_ITEM_INVALID",
      prNumber: item.prNumber ?? null,
      reason: item.invalid,
    }));
  const staleActive = active.filter((item) => item.replanRequired);
  if (staleActive.length) {
    violations.push({
      code: "ACTIVE_WRITER_REPLAN_REQUIRED",
      ids: staleActive.map((item) => item.changeSet.id),
    });
  }
  if (active.length > policy.globalWriterLimit) {
    violations.push({
      code: "GLOBAL_WIP_LIMIT_EXCEEDED",
      observed: active.length,
      allowed: policy.globalWriterLimit,
    });
  }
  if (
    classified.filter((item) => item.openPr === true).length >
    policy.activePrLimit
  ) {
    violations.push({ code: "ACTIVE_PR_LIMIT_EXCEEDED" });
  }
  const activeChangeSets = active.map((item) => item.changeSet);
  const objectiveCounts = new Map();
  for (const changeSet of activeChangeSets) {
    const key = semanticLocks(changeSet).objective;
    objectiveCounts.set(key, (objectiveCounts.get(key) ?? 0) + 1);
  }
  for (const [objective, count] of objectiveCounts) {
    if (count > policy.sameObjectiveLimit) {
      violations.push({
        code: "DUPLICATE_ACTIVE_OBJECTIVE",
        objective,
        observed: count,
        allowed: policy.sameObjectiveLimit,
      });
    }
  }

  let slots = staleActive.length
    ? 0
    : Math.max(0, policy.globalWriterLimit - active.length);
  const granted = [];
  const blocked = [];
  const pending = classified
    .filter(
      (item) =>
        item.ready === true &&
        item.writerActive !== true &&
        item.openPr !== true,
    )
    .sort(orderWork);

  for (const item of pending) {
    if (item.invalid) {
      blocked.push({
        id: item.changeSet.id,
        code: "WORK_ITEM_INVALID",
        reason: item.invalid,
      });
      continue;
    }
    if (item.changeSet.state !== "IMPLEMENTING") {
      blocked.push({
        id: item.changeSet.id,
        code: "DISPATCH_STATE_INVALID",
        state: item.changeSet.state,
      });
      continue;
    }
    const objective = item.changeSet.objective
      ? normalizeObjective(item.changeSet.objective)
      : null;
    if (policy.objectiveRequiredForDispatch && !objective) {
      blocked.push({ id: item.changeSet.id, code: "OBJECTIVE_REQUIRED" });
      continue;
    }
    if (item.replanRequired) {
      blocked.push({
        id: item.changeSet.id,
        code: "REPLAN_REQUIRED",
        reasons: item.replanReasons,
      });
      continue;
    }
    if (item.dependenciesSatisfied !== true) {
      blocked.push({
        id: item.changeSet.id,
        code: "DEPENDENCIES_UNRESOLVED",
        dependencies: item.unresolvedDependencies ?? [],
      });
      continue;
    }
    const collisions = findSemanticCollisions(item.changeSet, [
      ...activeChangeSets,
      ...granted.map((grant) => grant.changeSet),
    ]);
    if (collisions.length) {
      blocked.push({
        id: item.changeSet.id,
        code: "SEMANTIC_COLLISION",
        collisions,
      });
      continue;
    }
    if (slots <= 0) {
      blocked.push({ id: item.changeSet.id, code: "GLOBAL_WIP_FULL" });
      continue;
    }
    granted.push({
      id: item.changeSet.id,
      objective,
      exactBaseSha: mainSha,
      changeSet: item.changeSet,
      priority: item.priority ?? null,
      risk: item.changeSet.risk,
    });
    slots -= 1;
  }

  return {
    schemaVersion: 1,
    kind: "TDP_SCHEDULER_PLAN",
    exactMainSha: mainSha,
    policy: {
      globalWriterLimit: policy.globalWriterLimit,
      activePrLimit: policy.activePrLimit,
      sameObjectiveLimit: policy.sameObjectiveLimit,
      replanBehindCommits: policy.replanBehindCommits,
    },
    activeWriters: active.map((item) => item.changeSet.id),
    grants: granted.map(({ changeSet, ...grant }) => grant),
    blocked,
    violations,
    dispatchAllowed: violations.length === 0 && granted.length > 0,
  };
}

export function buildWorkerDispatchPlan({
  schedulerPlan,
  workspaceByChangeSet = {},
  executorsByChangeSet = {},
  projectionSafe = true,
}) {
  assert.equal(
    schedulerPlan?.kind,
    "TDP_SCHEDULER_PLAN",
    "DISPATCH_SCHEDULER_PLAN_INVALID",
  );
  assert.match(
    schedulerPlan.exactMainSha ?? "",
    SHA,
    "DISPATCH_EXACT_MAIN_INVALID",
  );
  const dispatches = [];
  const blocked = [...(schedulerPlan.blocked ?? [])];

  if (projectionSafe !== true) {
    return {
      schemaVersion: 1,
      kind: "TDP_WORKER_DISPATCH_PLAN",
      exactMainSha: schedulerPlan.exactMainSha,
      dispatches,
      blocked: [...blocked, { id: null, code: "CONTROL_PROJECTION_DRIFT" }],
      violations: [...(schedulerPlan.violations ?? [])],
      dispatchAllowed: false,
    };
  }

  if ((schedulerPlan.violations ?? []).length > 0) {
    return {
      schemaVersion: 1,
      kind: "TDP_WORKER_DISPATCH_PLAN",
      exactMainSha: schedulerPlan.exactMainSha,
      dispatches,
      blocked,
      violations: schedulerPlan.violations,
      dispatchAllowed: false,
    };
  }

  for (const grant of schedulerPlan.grants ?? []) {
    const workspace = workspaceByChangeSet[grant.id];
    if (
      workspace?.ready !== true ||
      workspace?.exactBaseSha !== grant.exactBaseSha ||
      typeof workspace?.path !== "string" ||
      !workspace.path
    ) {
      blocked.push({
        id: grant.id,
        code: "WORKSPACE_BOOTSTRAP_INCOMPLETE",
      });
      continue;
    }
    const selection = selectAuthorizedExecutor(
      executorsByChangeSet[grant.id] ?? [],
    );
    if (selection.result !== "PASS") {
      blocked.push({
        id: grant.id,
        code: "EXECUTOR_UNAVAILABLE",
        rootCause: selection.rootCause,
        attempts: selection.attempts,
      });
      continue;
    }
    dispatches.push({
      changeSetId: grant.id,
      objective: grant.objective,
      exactBaseSha: grant.exactBaseSha,
      workspace: {
        path: workspace.path,
        runtime: workspace.runtime ?? null,
      },
      executor: selection.executor,
      fallbackUsed: selection.fallbackUsed,
    });
  }

  return {
    schemaVersion: 1,
    kind: "TDP_WORKER_DISPATCH_PLAN",
    exactMainSha: schedulerPlan.exactMainSha,
    dispatches,
    blocked,
    violations: [],
    dispatchAllowed: dispatches.length > 0,
  };
}

export function buildIntegrationQueue({
  mainSha,
  workItems,
  policy = DEFAULT_SCHEDULER_POLICY,
}) {
  assert.match(mainSha ?? "", SHA, "QUEUE_MAIN_SHA_INVALID");
  const candidates = workItems
    .map((item) => classifyWorkItem(item, policy))
    .filter(
      (item) =>
        item?.changeSet?.state === "MERGE_READY" &&
        item.openPr === true &&
        item.invalid == null &&
        item.dependenciesSatisfied === true &&
        item.replanRequired === false &&
        item.changeSet.baseSha === mainSha &&
        SHA.test(item.headSha ?? "") &&
        (!policy.objectiveRequiredForDispatch ||
          Boolean(item.changeSet.objective)),
    )
    .sort(orderWork)
    .map((item) => ({
      changeSetId: item.changeSet.id,
      objective: item.changeSet.objective
        ? normalizeObjective(item.changeSet.objective)
        : normalizeObjective(item.changeSet.id),
      prNumber: item.prNumber,
      headSha: item.headSha,
      risk: item.changeSet.risk,
    }));
  return {
    version: 2,
    generatedFromMainSha: mainSha,
    batches: candidates.length
      ? [
          {
            id: "train-" + mainSha.slice(0, 12),
            state: "ACTIVE",
            items: candidates,
          },
        ]
      : [],
  };
}
