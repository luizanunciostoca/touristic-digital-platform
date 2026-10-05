import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";
import { buildAffectedTurboArgs } from "./affected-quality.mjs";
import { fastGatePlan } from "./local-fast-gate.mjs";

const BASE = "a".repeat(40);

test("classification block stops locally without full-everything fallback", () => {
  const report = analyzeFiles(["unexpected/file.ts"]);
  const plan = fastGatePlan(report, BASE);
  assert.equal(plan.mode, "CLASSIFICATION_BLOCK");
  assert.equal(plan.needsBrowser, false);
  assert.equal(plan.needsDatabase, false);
  assert.equal(plan.affectedQualityArgs, null);
});

test("critical known impact uses deep proof", () => {
  const report = analyzeFiles(["services/financial/src/provider.ts"]);
  const plan = fastGatePlan(report, BASE);
  assert.equal(report.qualityProfile, "DEEP_PROOF");
  assert.equal(plan.mode, "DEEP_PROOF");
});

test("proven non-runtime changes avoid runtime quality", () => {
  const report = analyzeFiles(["tooling/mdctl/reconcile.mjs"]);
  const plan = fastGatePlan(report, BASE);
  assert.equal(report.qualityProfile, "NON_RUNTIME");
  assert.equal(plan.mode, "NON_RUNTIME");
  assert.equal(plan.affectedQualityArgs, null);
});

test("runtime fast profiles reuse exact-base Turbo affected quality", () => {
  for (const file of [
    "apps/morro-digital-platform/src/navigation/router.ts",
    "packages/business/src/catalog.ts",
  ]) {
    const report = analyzeFiles([file]);
    const plan = fastGatePlan(report, BASE);
    assert.equal(plan.mode, "AFFECTED", file);
    assert.deepEqual(
      plan.affectedQualityArgs,
      buildAffectedTurboArgs(BASE),
      file,
    );
  }
});

test("fast gate rejects non-exact base identities", () => {
  const report = analyzeFiles([
    "apps/morro-digital-platform/src/navigation/router.ts",
  ]);
  assert.throws(
    () => fastGatePlan(report, "main"),
    /FAST_GATE_BASE_SHA_INVALID/u,
  );
});

test("plan-only mode cannot bypass classification blocking", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  const block = source.indexOf('if (plan.mode === "CLASSIFICATION_BLOCK")');
  const planOnly = source.indexOf('if (process.argv.includes("--plan"))');
  assert.ok(block >= 0 && planOnly >= 0 && block < planOnly);
});

test("local fast gate has no second workspace dependency graph", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.doesNotMatch(source, /affectedPackages/u);
  assert.doesNotMatch(source, /readdirSync/u);
  assert.doesNotMatch(source, /dependencies\.some/u);
  assert.match(source, /impact-analyzer\.mjs/u);
  assert.match(source, /buildAffectedTurboArgs/u);
});
