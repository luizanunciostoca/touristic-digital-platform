#!/usr/bin/env node
import {
  collectObservedState,
  renderSummary,
} from "../control-state/status.mjs";
import {
  collectTermuxHeartbeat,
  evaluateInvariants,
  loadInvariantContext,
  renderInvariantReport,
} from "./invariants.mjs";

function parseOptions(args, env = process.env) {
  const explicit = args[0] && !args[0].startsWith("--");
  const command = explicit ? args[0] : "status";
  const rest = explicit ? args.slice(1) : args;
  const config = {
    repository:
      env.GITHUB_REPOSITORY ??
      "luizanunciostoca/touristic-digital-platform",
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
      [
        "--repo",
        "--staging-url",
        "--production-url",
        "--local-dir",
      ].includes(arg)
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

async function snapshot(config) {
  const [observed, termux, local] = await Promise.all([
    collectObservedState(config),
    collectTermuxHeartbeat(),
    loadInvariantContext(config.localDirectory),
  ]);
  const invariants = evaluateInvariants({
    observed,
    termux,
    ...local,
  });
  return {
    schemaVersion: 1,
    kind: "TDP_MDCTL_BOOTSTRAP",
    controlPlaneVersion: "3.2",
    observed,
    termux,
    invariants,
  };
}

function plan(state) {
  return {
    schemaVersion: 1,
    kind: "TDP_MDCTL_PLAN",
    mainSha: state.observed.mainSha,
    blockers: state.observed.blockers,
    criticalInvariantFailures: state.invariants.criticalFailures,
    readyCandidates: state.observed.readyCandidates,
    nextActions: state.observed.nextActions,
    dispatchAllowed:
      state.observed.collectionState === "CAPTURED" &&
      state.invariants.criticalFailures.length === 0,
  };
}

async function main(argv) {
  const parsed = parseOptions(argv);
  if (
    !["bootstrap", "status", "invariants", "plan"].includes(
      parsed.command,
    )
  ) {
    throw new Error(
      "COMMAND_NOT_IMPLEMENTED_FAIL_CLOSED:" + parsed.command,
    );
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
    console.log(JSON.stringify(plan(state), null, 2));
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

main(process.argv.slice(2)).catch((error) => {
  console.error(
    "MDCTL_FAILED:" +
      (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 2;
});
