#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectObservedState,
  githubApi,
  localWorkspace,
  probeRuntime,
  pullRequestIdentity,
  renderSummary,
  validateRepository,
} from "../control-state/status.mjs";
import {
  collectTermuxHeartbeat,
  evaluateInvariants,
  loadInvariantContextAtMain,
  renderInvariantReport,
  validateExecutorTarget,
} from "./invariants.mjs";
import { runTaskCli } from "./task-lifecycle.mjs";
import { runClaimCli } from "./claim-lifecycle.mjs";
import {
  buildIntegrationQueue,
  buildSchedulerPlan,
  loadSchedulerPolicy,
} from "./scheduler.mjs";
import {
  collectLivePullWork,
  evaluateDependenciesAtMain,
} from "./scheduler-live.mjs";
import { canonicalJson, validateChangeSetV2 } from "./changeset-v2.mjs";
import { runReconcileCli } from "./reconcile.mjs";
import {
  buildDispatchRequest,
  verifyDispatchReadback,
} from "./dispatch-runtime.mjs";

const canonicalSnapshots = new WeakMap();
const captureOptionNames = new Set([
  "repository",
  "stagingUrl",
  "productionUrl",
  "localDirectory",
  "executorTarget",
]);
const snapshotDigest = (value) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

function freezeSnapshot(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeSnapshot(child, seen);
  return Object.freeze(value);
}

function canonicalCaptureOptions(options) {
  if (
    !options ||
    typeof options !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(options))
  )
    throw new Error("CANONICAL_CAPTURE_OPTIONS_INVALID");
  const result = Object.create(null);
  for (const name of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, name);
    if (
      !captureOptionNames.has(name) ||
      !Object.hasOwn(descriptor, "value") ||
      (descriptor.value !== undefined &&
        (typeof descriptor.value !== "string" || !descriptor.value))
    )
      throw new Error("CANONICAL_CAPTURE_OPTIONS_INVALID");
    if (descriptor.value !== undefined) result[name] = descriptor.value;
  }
  if (result.repository) validateRepository(result.repository);
  if (result.executorTarget !== undefined)
    validateExecutorTarget(result.executorTarget);
  return Object.freeze(result);
}

// No payload, caller transport, probe, workspace reader, clock or producer can
// mint this binding. Serialization and copies intentionally lose provenance.
export async function captureCanonicalSnapshot(options = {}) {
  const value = await snapshot({
    ...canonicalCaptureOptions(options),
    api: githubApi,
    probe: probeRuntime,
    workspace: localWorkspace,
    now: () => new Date().toISOString(),
  });
  canonicalSnapshots.set(value, snapshotDigest(value));
  return value;
}

export function isCanonicalLiveSnapshot(value) {
  const expected =
    value && typeof value === "object" && canonicalSnapshots.get(value);
  if (!expected || !Object.isFrozen(value)) return false;
  try {
    return snapshotDigest(value) === expected;
  } catch {
    return false;
  }
}

function parseOptions(args, env = process.env) {
  const explicit = args[0] && !args[0].startsWith("--");
  const command = explicit ? args[0] : "status";
  const rest = explicit ? args.slice(1) : args;
  const config = {
    repository:
      env.GITHUB_REPOSITORY ?? "luizanunciostoca/touristic-digital-platform",
    stagingUrl: env.MORRO_STAGING_URL,
    productionUrl: env.MORRO_PRODUCTION_URL,
    localDirectory: process.cwd(),
    executorTarget: "github",
  };
  let strict = false;
  let json = false;
  let summary = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--strict") strict = true;
    else if (arg === "--json") json = true;
    else if (arg === "--summary") summary = true;
    else if (
      [
        "--repo",
        "--staging-url",
        "--production-url",
        "--local-dir",
        "--executor",
      ].includes(arg)
    ) {
      const value = rest[++i];
      if (!value || value.startsWith("--"))
        throw new Error("ARGUMENT_VALUE_REQUIRED");
      if (arg === "--repo") config.repository = value;
      if (arg === "--staging-url") config.stagingUrl = value;
      if (arg === "--production-url") config.productionUrl = value;
      if (arg === "--local-dir") config.localDirectory = value;
      if (arg === "--executor")
        config.executorTarget = validateExecutorTarget(value);
    } else {
      throw new Error("ARGUMENT_INVALID:" + arg);
    }
  }
  return { command, config, strict, json, summary };
}

export function attachLiveSchedulerState(observed, liveWork, policy) {
  if (!observed?.mainSha) throw new Error("OBSERVED_MAIN_REQUIRED");
  if (liveWork?.mainSha !== observed.mainSha)
    throw new Error("MAIN_CHANGED_DURING_SCHEDULER_CAPTURE");
  if (!Array.isArray(liveWork?.items))
    throw new Error("LIVE_SCHEDULER_ITEMS_REQUIRED");
  if (liveWork?.authority !== "TRUSTED_PR_EXACT_HEADS")
    throw new Error("LIVE_SCHEDULER_AUTHORITY_INVALID");

  const liveIntegrationQueue = buildIntegrationQueue({
    mainSha: observed.mainSha,
    workItems: liveWork.items,
    policy,
  });
  const liveSchedulerPlan = buildSchedulerPlan({
    mainSha: observed.mainSha,
    workItems: liveWork.items,
    policy,
  });
  return {
    ...observed,
    liveIntegrationQueue,
    liveIntegrationQueueAuthority: liveWork.authority,
    liveIntegrationQueueMainSha: liveWork.mainSha,
    liveSchedulerPlan,
    liveSchedulerWork: liveWork.items.map((item) => ({
      prNumber: item.prNumber ?? null,
      repository: observed.repository ?? null,
      headSha: item.headSha ?? null,
      branch: item.branch ?? null,
      baseSha: item.changeSet?.baseSha ?? null,
      changeSetId: item.changeSet?.id ?? null,
      claimExpiresAt: item.claim?.expiresAt ?? null,
      objective: item.changeSet?.objective ?? null,
      state: item.changeSet?.state ?? null,
      trustAuthority: item.trust?.authority ?? null,
      trust: item.trust ?? null,
      invalid: item.invalid ?? null,
    })),
  };
}

export async function snapshot(config = {}) {
  const executor = {
    target: validateExecutorTarget(config.executorTarget ?? "github"),
  };
  const policy = await loadSchedulerPolicy();
  const api = config.api ?? githubApi;
  const repository =
    config.repository ?? "luizanunciostoca/touristic-digital-platform";
  const root = "repos/" + repository;
  const workPullLists = [];
  const workPullDetails = new Map();
  // Observe the identities actually consumed by the immutable producer. Its
  // result omits PR base/state fields; another fetch could not reconstruct them.
  const workApi = async (endpoint, options) => {
    const value = await api(endpoint, options);
    if (endpoint === root + "/pulls?state=open&base=main&per_page=100") {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.some((page) => !Array.isArray(page))
      )
        throw new Error("WORK_PULL_PAGES_INVALID");
      const pulls = value
        .flat()
        .map((pr) => pullRequestIdentity(pr, repository));
      if (
        pulls.some((pr) => pr.state !== "open" || pr.baseRef !== "main") ||
        new Set(pulls.map((pr) => pr.number)).size !== pulls.length
      )
        throw new Error("WORK_PULL_LIST_INVALID");
      workPullLists.push(pulls);
    } else if (
      endpoint.startsWith(root + "/pulls/") &&
      /^\d+$/u.test(endpoint.slice((root + "/pulls/").length))
    ) {
      const pr = pullRequestIdentity(value, repository);
      const previous = workPullDetails.get(pr.number);
      if (
        endpoint !== root + "/pulls/" + pr.number ||
        (previous && JSON.stringify(previous) !== JSON.stringify(pr))
      )
        throw new Error("WORK_PULL_DETAIL_INVALID");
      // Trust reconciliation legitimately rereads a PR. Preserve its first
      // normalized identity and reject drift on every subsequent observation.
      if (!previous) workPullDetails.set(pr.number, pr);
    }
    return value;
  };
  // Only provider transport is injectable; work/projection producers stay canonical.
  const composition = Promise.all([
    executor.target === "termux"
      ? collectTermuxHeartbeat({ api })
      : Promise.resolve({
          state: "NOT_REQUIRED",
          reason: "GITHUB_CONTROL_SELECTED",
        }),
    collectLivePullWork({ repository, policy, api: workApi }),
  ]).then(
    (values) => ({ values }),
    (error) => ({ error }),
  );
  let termux, liveWork, control;
  const observed = await collectObservedState({
    ...config,
    api,
    beforeFinalReadback: async ({ mainSha, activePrs }) => {
      const result = await composition;
      if (result.error) throw result.error;
      [termux, liveWork] = result.values;
      const expected = activePrs.filter((pr) => pr.baseRef === "main");
      const identity = (pulls) =>
        JSON.stringify([...pulls].sort((a, b) => a.number - b.number));
      const expectedIdentity = identity(expected);
      if (
        workPullLists.length < 2 ||
        workPullDetails.size !== expected.length ||
        workPullLists.some((pulls) => identity(pulls) !== expectedIdentity) ||
        identity([...workPullDetails.values()]) !== expectedIdentity ||
        liveWork.items.length !== expected.length ||
        new Set(liveWork.items.map((item) => item.prNumber)).size !==
          expected.length ||
        liveWork.items.some((item) => {
          const pr = expected.find((entry) => entry.number === item.prNumber);
          return (
            !pr ||
            item.headSha !== pr.headSha ||
            item.branch !== pr.branch ||
            item.draft !== pr.draft ||
            item.openPr !== true
          );
        })
      )
        throw new Error("COMPOSED_PULL_IDENTITY_MISMATCH");
      control = await loadInvariantContextAtMain({
        repository,
        mainSha,
        api,
      });
    },
  });
  const observedWithLive = attachLiveSchedulerState(observed, liveWork, policy);
  const invariants = evaluateInvariants({
    observed: observedWithLive,
    termux,
    executor,
    ...control,
  });
  return freezeSnapshot({
    schemaVersion: 1,
    kind: "TDP_MDCTL_BOOTSTRAP",
    controlPlaneVersion: "3.2",
    observed: observedWithLive,
    termux,
    executor,
    controlProjection: {
      authority: control.projectionAuthority,
      sha: control.projectionSha,
    },
    liveProjection: {
      authority: liveWork.authority,
      mainSha: liveWork.mainSha,
    },
    invariants,
  });
}

export async function assertCurrentMainUnchanged({
  repository,
  expectedMainSha,
  api = githubApi,
}) {
  const latest = await api("repos/" + repository + "/commits/main");
  if (latest?.sha !== expectedMainSha) {
    throw new Error("MAIN_CHANGED_AFTER_DEPENDENCY_READ");
  }
  return latest.sha;
}

export async function buildScheduleCandidateItem({
  manifest,
  repository,
  mainSha,
  dependencyEvaluator = evaluateDependenciesAtMain,
}) {
  validateChangeSetV2(manifest);
  const dependencies = await dependencyEvaluator({
    changeSet: manifest,
    repository,
    mainSha,
  });
  const exactBase = manifest.baseSha === mainSha;
  return {
    changeSet: manifest,
    openPr: false,
    writerActive: false,
    ready: true,
    dependenciesSatisfied: dependencies.satisfied,
    unresolvedDependencies: dependencies.unresolved,
    priority: "P1",
    behindBy: exactBase ? 0 : null,
    baseIsAncestorOfMain: exactBase,
    statsKnown: true,
    changedFiles: 0,
    changedLines: 0,
    invalid: exactBase ? null : "CANDIDATE_EXACT_BASE_MISMATCH",
  };
}

export function buildPlan(state) {
  const hasLivePlan =
    state.observed.liveSchedulerPlan &&
    Array.isArray(state.observed.liveSchedulerPlan.grants) &&
    Array.isArray(state.observed.liveSchedulerPlan.blocked) &&
    Array.isArray(state.observed.liveSchedulerPlan.violations);
  const livePlan = hasLivePlan
    ? state.observed.liveSchedulerPlan
    : {
        grants: [],
        blocked: [],
        violations: [{ code: "LIVE_SCHEDULER_PLAN_REQUIRED" }],
      };
  const dispatchableCandidates = livePlan.grants;
  return {
    schemaVersion: 1,
    kind: "TDP_MDCTL_PLAN",
    mainSha: state.observed.mainSha,
    blockers: state.observed.blockers,
    criticalInvariantFailures: state.invariants.criticalFailures,
    readyCandidates: state.observed.readyCandidates,
    dispatchableCandidates,
    schedulerBlocked: livePlan.blocked,
    schedulerViolations: livePlan.violations,
    nextActions: state.observed.nextActions,
    dispatchAllowed:
      state.observed.collectionState === "CAPTURED" &&
      state.observed.blockers.length === 0 &&
      state.invariants.criticalFailures.length === 0 &&
      livePlan.violations.length === 0 &&
      dispatchableCandidates.length > 0,
  };
}

async function main(argv) {
  if (argv[0] === "claim") {
    const result = await runClaimCli(argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (argv[0] === "task") {
    const result = await runTaskCli(argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (argv[0] === "reconcile") {
    const result = await runReconcileCli(argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (argv[0] === "mission") {
    const result = await runReconcileCli(argv.slice(1));
    console.log(JSON.stringify(result.missionState, null, 2));
    return;
  }

  if (argv[0] === "dispatch-request") {
    const inputPath = argv[1];
    if (!inputPath || argv.length !== 2)
      throw new Error("DISPATCH_REQUEST_INPUT_REQUIRED");
    const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
    console.log(JSON.stringify(buildDispatchRequest(input), null, 2));
    return;
  }

  if (argv[0] === "dispatch-readback") {
    const requestPath = argv[1];
    const readbackPath = argv[2];
    if (!requestPath || !readbackPath || argv.length !== 3)
      throw new Error("DISPATCH_READBACK_INPUT_REQUIRED");
    const [request, readback] = await Promise.all([
      readFile(resolve(requestPath), "utf8").then(JSON.parse),
      readFile(resolve(readbackPath), "utf8").then(JSON.parse),
    ]);
    console.log(
      JSON.stringify(verifyDispatchReadback(request, readback), null, 2),
    );
    return;
  }

  if (argv[0] === "queue" || argv[0] === "schedule") {
    const repository =
      process.env.GITHUB_REPOSITORY ??
      "luizanunciostoca/touristic-digital-platform";
    const policy = await loadSchedulerPolicy();
    const live = await collectLivePullWork({ repository, policy });
    const workItems = [...live.items];

    if (argv[0] === "schedule") {
      const manifestPath = argv[1];
      if (!manifestPath || argv.length !== 2)
        throw new Error("SCHEDULE_CHANGESET_PATH_REQUIRED");
      const manifest = JSON.parse(
        await readFile(resolve(manifestPath), "utf8"),
      );
      workItems.push(
        await buildScheduleCandidateItem({
          manifest,
          repository,
          mainSha: live.mainSha,
        }),
      );
      await assertCurrentMainUnchanged({
        repository,
        expectedMainSha: live.mainSha,
      });
    } else if (argv.length !== 1) {
      throw new Error("QUEUE_ARGUMENTS_INVALID");
    }

    const result =
      argv[0] === "queue"
        ? buildIntegrationQueue({
            mainSha: live.mainSha,
            workItems,
            policy,
          })
        : buildSchedulerPlan({
            mainSha: live.mainSha,
            workItems,
            policy,
          });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const parsed = parseOptions(argv);
  if (!["bootstrap", "status", "invariants", "plan"].includes(parsed.command)) {
    throw new Error("COMMAND_NOT_IMPLEMENTED_FAIL_CLOSED:" + parsed.command);
  }

  const state = await snapshot(parsed.config);

  if (parsed.command === "bootstrap") {
    console.log(
      parsed.summary
        ? renderSummary(state.observed) +
            "\n" +
            renderInvariantReport(state.invariants)
        : JSON.stringify(state, null, 2),
    );
  } else if (parsed.command === "status") {
    console.log(
      parsed.json
        ? JSON.stringify(state, null, 2)
        : renderSummary(state.observed) +
            "\n" +
            renderInvariantReport(state.invariants),
    );
  } else if (parsed.command === "invariants") {
    console.log(
      parsed.json
        ? JSON.stringify(state.invariants, null, 2)
        : renderInvariantReport(state.invariants),
    );
  } else if (parsed.command === "plan") {
    console.log(JSON.stringify(buildPlan(state), null, 2));
  }

  if (
    parsed.strict &&
    (state.observed.blockers.length > 0 ||
      state.observed.collectionState !== "CAPTURED" ||
      state.invariants.criticalFailures.length > 0)
  ) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).catch(() => {
    console.error("MDCTL_FAILED");
    process.exitCode = 2;
  });
}
