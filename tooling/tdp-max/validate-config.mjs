#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const control = resolve(root, ".github/morro-control/tdp-max");

async function text(path) { return readFile(resolve(root, path), "utf8"); }
async function json(path) { return JSON.parse(await text(path)); }

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
  ]) assert.equal(forbidden.test(policy), false, `TDP_MAX_HARDCODE_FORBIDDEN:${forbidden}`);

  for (const marker of [
    "Claim before write",
    "Every external mutation requires post-action readback",
    "CI success is not semantic proof",
    "AI != Final Authority",
    "Technically Ready != Authorized to Release",
  ]) assert.ok(policy.includes(marker), `TDP_MAX_POLICY_MISSING:${marker}`);

  assert.equal(authority.schemaVersion, 1, "TDP_MAX_AUTHORITY_SCHEMA");
  assert.equal(authority.mode, "projection", "TDP_MAX_AUTHORITY_PARALLEL_CONTROL");
  assert.equal(authority.authorities.lifecycle?.path, ".morro/fabric.json", "TDP_MAX_FABRIC_AUTHORITY");
  assert.equal(authority.authorities.termuxOperations?.path, "CHATGPT-START-HERE.md", "TDP_MAX_TERMUX_LIVE_AUTHORITY");

  const requiredFailures = new Set([
    "STALE_HEAD", "FALSE_CI_GREEN", "NO_JOBS_RUN", "AI_AS_AUTHORITY",
    "WRONG_RENDER_TARGET", "WRONG_ARTIFACT", "REMOTE_TRANSPORT_MISCLASSIFIED",
    "REMOTE_RESULT_FALSE_POSITIVE", "STALE_DR_PROOF", "TECHNICALLY_READY_NOT_AUTHORIZED",
  ]);
  assert.equal(anti.schemaVersion, 1, "TDP_MAX_ANTI_SCHEMA");
  const observedClasses = new Set(anti.failures?.map((item) => item.class));
  for (const failure of requiredFailures)
    assert.ok(observedClasses.has(failure), `TDP_MAX_ANTI_MISSING:${failure}`);
  const ids = anti.failures.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "TDP_MAX_ANTI_DUPLICATE_ID");

  assert.deepEqual(bootstrap.properties.result.enum,
    ["READY", "READY_WITH_WARNINGS", "BLOCKED", "NOT_PROVEN"],
    "TDP_MAX_BOOTSTRAP_VERDICTS");
  assert.deepEqual(evidence.properties.verdict.enum,
    ["COMPLETE", "PARTIAL", "BLOCKED", "NOT_PROVEN"],
    "TDP_MAX_EVIDENCE_VERDICTS");
  assert.equal(finalGate.lifecycleAuthority, ".morro/fabric.json", "TDP_MAX_FINAL_GATE_FABRIC");
  assert.equal(finalGate.mode, "projection", "TDP_MAX_FINAL_GATE_PARALLEL_CONTROL");
  assert.ok(Array.isArray(fabric.states) && fabric.states.includes("PRODUCTION_VERIFIED"),
    "TDP_MAX_FABRIC_LIFECYCLE_INVALID");

  assert.equal(typeof pkg.scripts?.["tdp-max:check"], "string", "TDP_MAX_PACKAGE_SCRIPT_MISSING");
  assert.ok(pkg.scripts["ci:governance:check"]?.includes("pnpm tdp-max:check"),
    "TDP_MAX_NOT_IN_GOVERNANCE_PATH");

  return { failureClasses: anti.failures.length, fabricStates: fabric.states.length };
}

async function main() {
  const result = await validateTdpMaxConfig();
  console.log(`TDP_MAX_CONFIG_VALID failures=${result.failureClasses} fabricStates=${result.fabricStates}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  });
}
