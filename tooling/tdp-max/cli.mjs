#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { validateEvidenceManifest } from "./validate-config.mjs";
import {
  buildBootstrapReport,
  buildReconcileReport,
  buildStatusReport,
  evaluateFinalGate,
  validateExternalEvidenceBundle,
} from "./tdp-max-v2.mjs";

const execute = promisify(execFile);
const DEFAULT_REPOSITORY = "luizanunciostoca/touristic-digital-platform";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(process.cwd(), path), "utf8"));
}

function parseArgs(argv) {
  const command = argv[0];
  assert.ok(
    ["bootstrap", "status", "reconcile", "final-gate"].includes(command),
    "TDP_MAX_COMMAND_INVALID",
  );
  const options = {
    command,
    profile: "engineering",
    objective: command,
    repository: process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY,
    externalEvidence: null,
    manifest: null,
    stagingUrl: process.env.MORRO_STAGING_URL ?? null,
    productionUrl: process.env.MORRO_PRODUCTION_URL ?? null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    const value = argv[index + 1];
    assert.ok(
      value && !value.startsWith("--"),
      "TDP_MAX_ARGUMENT_VALUE_REQUIRED",
    );
    index += 1;
    if (key === "--profile") options.profile = value;
    else if (key === "--objective") options.objective = value;
    else if (key === "--repo") options.repository = value;
    else if (key === "--external-evidence") options.externalEvidence = value;
    else if (key === "--manifest") options.manifest = value;
    else if (key === "--staging-url") options.stagingUrl = value;
    else if (key === "--production-url") options.productionUrl = value;
    else throw new Error("TDP_MAX_ARGUMENT_INVALID:" + key);
  }
  return options;
}

async function runMdctl(command, options) {
  const args = [
    "tooling/mdctl/mdctl.mjs",
    command,
    "--repo",
    options.repository,
  ];
  if (command === "status") args.push("--json");
  if (["bootstrap", "status"].includes(command)) {
    if (options.stagingUrl) args.push("--staging-url", options.stagingUrl);
    if (options.productionUrl)
      args.push("--production-url", options.productionUrl);
  }
  const { stdout } = await execute(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function loadExternal(path) {
  if (!path) return null;
  return validateExternalEvidenceBundle(await readJson(path));
}

async function bootstrap(options, mdctlCommand = "bootstrap") {
  const [mdctl, authorityMap, externalEvidence] = await Promise.all([
    runMdctl(mdctlCommand, options),
    readJson(".github/morro-control/tdp-max/authority-map.json"),
    loadExternal(options.externalEvidence),
  ]);
  const report = buildBootstrapReport({
    mdctl,
    authorityMap,
    externalEvidence,
    profile: options.profile,
    objective: options.objective,
  });
  return { report, mdctl, externalEvidence };
}

async function runBootstrap(options) {
  const { report } = await bootstrap(options, "bootstrap");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (["BLOCKED", "NOT_PROVEN"].includes(report.result)) process.exitCode = 2;
}

async function runStatus(options) {
  const { report, mdctl } = await bootstrap(options, "status");
  process.stdout.write(
    JSON.stringify(buildStatusReport({ bootstrap: report, mdctl }), null, 2) +
      "\n",
  );
}

async function runReconcile(options) {
  const [projection, boot] = await Promise.all([
    runMdctl("reconcile", options),
    bootstrap(options, "status"),
  ]);
  const report = buildReconcileReport({
    projection,
    bootstrap: boot.report,
    externalEvidence: boot.externalEvidence,
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

async function runFinalGate(options) {
  assert.ok(options.manifest, "TDP_MAX_FINAL_MANIFEST_REQUIRED");
  const [manifest, finalGate, liveStatus, externalEvidence] = await Promise.all(
    [
      readJson(options.manifest),
      readJson(".github/morro-control/tdp-max/final-gate.json"),
      runMdctl("status", options),
      loadExternal(options.externalEvidence),
    ],
  );
  validateEvidenceManifest(manifest);
  const report = evaluateFinalGate({
    manifest,
    finalGate,
    liveStatus,
    externalEvidence,
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.taskVerdict !== "COMPLETE") process.exitCode = 2;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "bootstrap") return runBootstrap(options);
  if (options.command === "status") return runStatus(options);
  if (options.command === "reconcile") return runReconcile(options);
  return runFinalGate(options);
}

main().catch((error) => {
  console.error("TDP_MAX_V2_FAILED:" + String(error?.message ?? error));
  process.exitCode = 1;
});
