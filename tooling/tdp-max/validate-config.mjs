#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

async function json(path) {
  return JSON.parse(await text(path));
}

function equalSet(actual, expected, code) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), code);
}

export function validateBootstrapReport(report) {
  assert.equal(report?.schemaVersion, 1, "TDP_MAX_BOOTSTRAP_SCHEMA");
  assert.match(report?.mainSha ?? "", SHA, "TDP_MAX_BOOTSTRAP_SHA");
  assert.ok(report?.checks && typeof report.checks === "object", "TDP_MAX_BOOTSTRAP_CHECKS");
  const values = Object.values(report.checks);
  assert.ok(values.length > 0, "TDP_MAX_BOOTSTRAP_CHECKS_EMPTY");
  if (report.result === "READY") {
    assert.ok(values.every((v) => ["PASS", "N/A"].includes(v)), "TDP_MAX_FALSE_READY");
  }
  if (report.result === "READY_WITH_WARNINGS") {
    assert.ok(values.every((v) => ["PASS", "WARN", "N/A"].includes(v)), "TDP_MAX_FALSE_READY_WARNING");
  }
  assert.ok(
    ["READY", "READY_WITH_WARNINGS", "BLOCKED", "NOT_PROVEN"].includes(report.result),
    "TDP_MAX_BOOTSTRAP_RESULT",
  );
  return report;
}

export function validateEvidenceManifest(manifest) {
  assert.equal(manifest?.schemaVersion, 1, "TDP_MAX_EVIDENCE_SCHEMA");
  assert.match(manifest?.initialMain ?? "", SHA, "TDP_MAX_EVIDENCE_INITIAL_SHA");
  assert.match(manifest?.finalMain ?? "", SHA, "TDP_MAX_EVIDENCE_FINAL_SHA");
  if (manifest?.candidateSha != null)
    assert.match(manifest.candidateSha, SHA, "TDP_MAX_EVIDENCE_CANDIDATE_SHA");
  if (manifest?.artifactDigest != null)
    assert.match(manifest.artifactDigest, DIGEST, "TDP_MAX_EVIDENCE_ARTIFACT_DIGEST");
  assert.ok(Array.isArray(manifest?.evidence), "TDP_MAX_EVIDENCE_ITEMS");
  for (const item of manifest.evidence) {
    if (item?.sha != null) assert.match(item.sha, SHA, "TDP_MAX_EVIDENCE_ITEM_SHA");
  }
  assert.ok(Array.isArray(manifest?.unknowns), "TDP_MAX_EVIDENCE_UNKNOWNS");
  assert.ok(Array.isArray(manifest?.conflicts), "TDP_MAX_EVIDENCE_CONFLICTS");
  assert.ok(
    ["COMPLETE", "PARTIAL", "BLOCKED", "NOT_PROVEN"].includes(manifest?.verdict),
    "TDP_MAX_EVIDENCE_VERDICT",
  );
  if (manifest.verdict === "COMPLETE") {
    assert.match(manifest.candidateSha ?? "", SHA, "TDP_MAX_COMPLETE_CANDIDATE_REQUIRED");
    assert.equal(manifest.unknowns.length, 0, "TDP_MAX_COMPLETE_UNKNOWNS");
    assert.equal(manifest.conflicts.length, 0, "TDP_MAX_COMPLETE_CONFLICTS");
    assert.ok(manifest.evidence.length > 0, "TDP_MAX_COMPLETE_EVIDENCE_REQUIRED");
    assert.ok(
      manifest.evidence.every((item) => ["VERIFIED", "N/A"].includes(item.status)),
      "TDP_MAX_COMPLETE_UNVERIFIED_EVIDENCE",
    );
  }
  return manifest;
}

export async function validateTdpMaxConfig() {
  const policy = await text(".github/morro-control/tdp-max/POLICY.md");
  const authority = await json(".github/morro-control/tdp-max/authority-map.json");
  const anti = await json(".github/morro-control/tdp-max/anti-recurrence.json");
  const bootstrap = await json(".github/morro-control/tdp-max/bootstrap.schema.json");
  const evidence = await json(".github/morro-control/tdp-max/evidence.schema.json");
  const finalGate = await json(".github/morro-control/tdp-max/final-gate.json");
  const fabric = await json(".morro/fabric.json");
  const pkg = await json("package.json");

  for (const forbidden of [
    /\bpid\s*[:=]\s*\d+/iu,
    /heartbeat[_ -]?issue\s*[:=]\s*#?\d+/iu,
    /\bmain[_ -]?sha\s*[:=]\s*[0-9a-f]{40}\b/iu,
    /prefer(?:red)?\s+transport\s*[:=]/iu,
  ])
    assert.equal(
      forbidden.test(policy),
      false,
      `TDP_MAX_HARDCODE_FORBIDDEN:${forbidden}`,
    );

  for (const marker of [
    "Claim before write",
    "Every external mutation requires post-action readback",
    "CI success is not semantic proof",
    "AI != Final Authority",
    "Technically Ready != Authorized to Release",
  ])
    assert.ok(policy.includes(marker), `TDP_MAX_POLICY_MISSING:${marker}`);

  assert.equal(authority.schemaVersion, 1, "TDP_MAX_AUTHORITY_SCHEMA");
  assert.equal(authority.mode, "projection", "TDP_MAX_AUTHORITY_PARALLEL_CONTROL");
  assert.equal(authority.authorities.lifecycle?.path, ".morro/fabric.json", "TDP_MAX_FABRIC_AUTHORITY");
  assert.equal(authority.authorities.termuxOperations?.path, "CHATGPT-START-HERE.md", "TDP_MAX_TERMUX_LIVE_AUTHORITY");

  const requiredFailures = [
    "STALE_HEAD",
    "STALE_BASE",
    "DIRTY_SHARED_WORKTREE",
    "STALE_CLAIM",
    "FALSE_CI_GREEN",
    "NO_JOBS_RUN",
    "SKIPPED_AS_PASS",
    "AI_AS_AUTHORITY",
    "ASSUMED_TOOL_PERMISSION",
    "WRONG_RENDER_TARGET",
    "WRONG_ARTIFACT",
    "DEPLOY_NOT_LIVE",
    "DATABASE_OOM",
    "SCHEMA_DRIFT",
    "DUPLICATE_IMPLEMENTATION",
    "DUPLICATE_WORKFLOW",
    "MONOLITHIC_REMOTE_JOB",
    "REMOTE_TRANSPORT_MISCLASSIFIED",
    "REMOTE_RESULT_FALSE_POSITIVE",
    "STALE_DR_PROOF",
    "TECHNICALLY_READY_NOT_AUTHORIZED",
  ];
  assert.equal(anti.schemaVersion, 1, "TDP_MAX_ANTI_SCHEMA");
  const observedClasses = anti.failures?.map((item) => item.class) ?? [];
  equalSet(observedClasses, requiredFailures, "TDP_MAX_ANTI_CLASS_SET");
  assert.equal(new Set(observedClasses).size, observedClasses.length, "TDP_MAX_ANTI_DUPLICATE_CLASS");
  const ids = anti.failures.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "TDP_MAX_ANTI_DUPLICATE_ID");

  assert.deepEqual(
    bootstrap.properties.result.enum,
    ["READY", "READY_WITH_WARNINGS", "BLOCKED", "NOT_PROVEN"],
    "TDP_MAX_BOOTSTRAP_VERDICTS",
  );
  assert.equal(bootstrap.allOf?.length, 2, "TDP_MAX_BOOTSTRAP_CONSISTENCY_RULES");
  assert.deepEqual(
    evidence.properties.verdict.enum,
    ["COMPLETE", "PARTIAL", "BLOCKED", "NOT_PROVEN"],
    "TDP_MAX_EVIDENCE_VERDICTS",
  );
  assert.equal(
    evidence.properties.artifactDigest.pattern,
    "^sha256:[0-9a-f]{64}$",
    "TDP_MAX_ARTIFACT_DIGEST_PATTERN",
  );
  assert.equal(
    evidence.properties.evidence.items.properties.sha.pattern,
    "^[0-9a-f]{40}$",
    "TDP_MAX_EVIDENCE_SHA_PATTERN",
  );
  assert.equal(evidence.allOf?.length, 1, "TDP_MAX_COMPLETE_CONDITIONAL_REQUIRED");

  const requiredFinalGates = [
    "objective-satisfied",
    "semantic-ci-proven",
    "exact-head-proven",
    "external-writes-read-back",
    "critical-unknowns-zero",
    "conflicts-zero",
    "lifecycle-reconciled",
    "independent-challenge-passed",
  ];
  const requiredConditionalGates = [
    "root-cause-proven",
    "artifact-identity",
    "staging-acceptance",
    "database-readback",
    "rollback-proof",
    "dr-proof",
    "release-authorization",
    "production-verification",
  ];
  assert.equal(finalGate.lifecycleAuthority, ".morro/fabric.json", "TDP_MAX_FINAL_GATE_FABRIC");
  assert.equal(finalGate.mode, "projection", "TDP_MAX_FINAL_GATE_PARALLEL_CONTROL");
  equalSet(finalGate.requiredForComplete, requiredFinalGates, "TDP_MAX_FINAL_GATE_REQUIRED_SET");
  equalSet(finalGate.conditional?.map((item) => item.gate) ?? [], requiredConditionalGates, "TDP_MAX_FINAL_GATE_CONDITIONAL_SET");
  assert.deepEqual(
    finalGate.verdicts,
    ["COMPLETE", "PARTIAL", "BLOCKED", "NOT_PROVEN"],
    "TDP_MAX_FINAL_GATE_VERDICTS",
  );
  assert.ok(
    Array.isArray(fabric.states) && fabric.states.includes("PRODUCTION_VERIFIED"),
    "TDP_MAX_FABRIC_LIFECYCLE_INVALID",
  );

  assert.equal(typeof pkg.scripts?.["tdp-max:check"], "string", "TDP_MAX_PACKAGE_SCRIPT_MISSING");
  assert.ok(
    pkg.scripts["ci:governance:check"]?.includes("pnpm tdp-max:check"),
    "TDP_MAX_NOT_IN_GOVERNANCE_PATH",
  );

  return {
    failureClasses: anti.failures.length,
    fabricStates: fabric.states.length,
  };
}

async function main() {
  const result = await validateTdpMaxConfig();
  console.log(
    `TDP_MAX_CONFIG_VALID failures=${result.failureClasses} fabricStates=${result.fabricStates}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  });
}
