#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateEvidenceManifest } from "./validate-config.mjs";
import {
  buildBootstrapReport,
  buildReconcileReport,
  buildStatusReport,
  evaluateFinalGate,
  validateExternalEvidenceBundle,
} from "./tdp-max-v2.mjs";

const DEFAULT_REPOSITORY = "luizanunciostoca/touristic-digital-platform";
const COMMANDS = new Set(["bootstrap", "status", "reconcile", "final-gate"]);
const FLAGS = {
  "--profile": "profile",
  "--objective": "objective",
  "--repo": "repository",
  "--external-evidence": "externalEvidence",
  "--manifest": "manifest",
  "--staging-url": "stagingUrl",
  "--production-url": "productionUrl",
};

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function parseArgs(argv) {
  const command = argv[0];
  assert.ok(COMMANDS.has(command), "TDP_MAX_COMMAND_INVALID");
  const options = {
    command,
    profile: command === "final-gate" ? null : "engineering",
    objective: command,
    repository: process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY,
    externalEvidence: null,
    manifest: null,
    stagingUrl: process.env.MORRO_STAGING_URL ?? null,
    productionUrl: process.env.MORRO_PRODUCTION_URL ?? null,
  };
  for (let i = 1; i < argv.length; i += 2) {
    if (argv[i] === "--") {
      i -= 1;
      continue;
    }
    const field = FLAGS[argv[i]];
    const value = argv[i + 1];
    assert.ok(field, "TDP_MAX_ARGUMENT_INVALID:" + argv[i]);
    assert.ok(
      value && !value.startsWith("--"),
      "TDP_MAX_ARGUMENT_VALUE_REQUIRED",
    );
    options[field] = value;
  }
  return options;
}

function execute(file, args, timeout = 120000) {
  return execFileSync(file, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function runGit(...args) {
  return execute("git", args, 30000);
}

function runMdctl(command, options) {
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
  return JSON.parse(execute(process.execPath, args));
}

function loadExternal(path) {
  return path ? validateExternalEvidenceBundle(readJson(path)) : null;
}

function bootstrap(options, command = "bootstrap") {
  const mdctl = runMdctl(command, options);
  const externalEvidence = loadExternal(options.externalEvidence);
  return {
    mdctl,
    externalEvidence,
    report: buildBootstrapReport({
      mdctl,
      externalEvidence,
      authorityMap: readJson(
        ".github/morro-control/tdp-max/authority-map.json",
      ),
      profile: options.profile,
      objective: options.objective,
    }),
  };
}

function emit(value, failed = false) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  if (failed) process.exitCode = 2;
}

function run(options) {
  if (options.command === "bootstrap") {
    const { report } = bootstrap(options);
    return emit(report, ["BLOCKED", "NOT_PROVEN"].includes(report.result));
  }
  if (options.command === "status") {
    const { report, mdctl } = bootstrap(options, "status");
    return emit(buildStatusReport({ bootstrap: report, mdctl }));
  }
  if (options.command === "reconcile") {
    const boot = bootstrap(options, "status");
    return emit(
      buildReconcileReport({
        projection: runMdctl("reconcile", options),
        bootstrap: boot.report,
        externalEvidence: boot.externalEvidence,
      }),
    );
  }

  assert.ok(options.manifest, "TDP_MAX_FINAL_MANIFEST_REQUIRED");
  const manifest = readJson(options.manifest);
  const expectedCandidateSha = runGit("rev-parse", "HEAD");
  const expectedBranch = runGit("branch", "--show-current");
  assert.match(
    expectedCandidateSha,
    /^[0-9a-f]{40}$/u,
    "TDP_MAX_GIT_HEAD_INVALID",
  );
  assert.ok(expectedBranch, "TDP_MAX_GIT_BRANCH_REQUIRED");
  const originUrl = runGit("remote", "get-url", "origin");
  const expectedRepository = originUrl
    .replace(/^.*github\.com[:/]/u, "")
    .replace(/\.git$/u, "");
  assert.equal(
    options.repository,
    expectedRepository,
    "TDP_MAX_REPOSITORY_OVERRIDE",
  );
  validateEvidenceManifest(manifest);
  const report = evaluateFinalGate({
    manifest,
    liveStatus: runMdctl("status", options),
    finalGate: readJson(".github/morro-control/tdp-max/final-gate.json"),
    externalEvidence: loadExternal(options.externalEvidence),
    requestedProfile: options.profile,
    expectedRepository,
    expectedCandidateSha,
    expectedBranch,
  });
  return emit(report, report.taskVerdict !== "COMPLETE");
}

try {
  run(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error("TDP_MAX_V2_FAILED:" + String(error?.message ?? error));
  process.exitCode = 1;
}
