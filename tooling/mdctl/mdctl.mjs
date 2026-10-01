#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectObservedState,
  renderSummary,
} from "../control-state/status.mjs";
import {
  collectTermuxHeartbeat,
  evaluateInvariants,
  loadInvariantContextAtMain,
  renderInvariantReport,
} from "./invariants.mjs";
import { runTaskCli } from "./task-lifecycle.mjs";
import {
  buildIntegrationQueue,
  buildSchedulerPlan,
  loadSchedulerPolicy,
} from "./scheduler.mjs";
import {
  collectLivePullWork,
  evaluateDependenciesAtMain,
} from "./scheduler-live.mjs";
import { validateChangeSetV2 } from "./changeset-v2.mjs";

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
      ["--repo", "--staging-url", "--production-url", "--local-dir"].includes(
        arg,
      )
    ) {
      const value = rest[++i];
      if (!value || value.startsWith("--"))
        throw new Error("ARGUMENT_VALUE_REQUIRED");
      if (arg === "--repo") config.repository = value;
      if (arg === "--staging-url") config.stagingUrl = value;
      if (arg === "--production-url") config.productionUrl = value;
      if (arg === "--local-dir") config.localDirectory = value;
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
    liveIntegrationQueueAuthority:
      liveWork.authority ?? "TRUSTED_PR_EXACT_HEADS",
    liveIntegrationQueueMainSha: liveWork.mainSha,
    liveSchedulerPlan,
    liveSchedulerWork: liveWork.items.map((item) => ({
      prNumber: item.prNumber ?? null,
      changeSetId: item.changeSet?.id ?? null,
      objective: item.changeSet?.objective ?? null,
      state: item.changeSet?.state ?? null,
      trustAuthority: item.trust?.authority ?? null,
      invalid: item.invalid ?? null,
    })),
  };
}

async function snapshot(config) {
  const policy = await loadSchedulerPolicy();
  const [observed, termux, liveWork] = await Promise.all([
    collectObservedState(config),
    collectTermuxHeartbeat(),
    collectLivePullWork({ repository: config.repository, policy }),
  ]);
  const observedWithLive = attachLiveSchedulerState(observed, liveWork, policy);
  const control = await loadInvariantContextAtMain({
    repository: config.repository,
    mainSha: observedWithLive.mainSha,
  });
  const invariants = evaluateInvariants({
    observed: observedWithLive,
    termux,
    ...control,
  });
  return {
    schemaVersion: 1,
    kind: "TDP_MDCTL_BOOTSTRAP",
    controlPlaneVersion: "3.2",
    observed: observedWithLive,
    termux,
    controlProjection: {
      authority: control.projectionAuthority,
      sha: control.projectionSha,
    },
    liveProjection: {
      authority: liveWork.authority ?? "TRUSTED_PR_EXACT_HEADS",
      mainSha: liveWork.mainSha,
    },
    invariants,
  };
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
  const livePlan = state.observed.liveSchedulerPlan ?? {
    grants: [],
    blocked: [],
    violations: [],
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
  if (argv[0] === "task") {
    const result = await runTaskCli(argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
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
