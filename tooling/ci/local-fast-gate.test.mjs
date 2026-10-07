import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";
import { buildAffectedTurboArgs } from "./affected-quality.mjs";
import {
  assertOwnershipCoverage,
  chooseCanonicalBase,
  fastGatePlan,
  nonRuntimeTests,
} from "./local-fast-gate.mjs";

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

test("deletion-only impact remains visible to the Fast Gate", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.match(source, /--diff-filter=ACDMRTUXB/u);
});

test("non-runtime control-plane and governance coverage includes canonical test trees", () => {
  const control = nonRuntimeTests(["control-plane"]);
  assert.ok(control.some((file) => file.startsWith("tooling/tdp-max/")));
  assert.ok(
    control.some((file) => file.startsWith("tooling/failure-learning/")),
  );

  const governance = nonRuntimeTests(["governance"]);
  assert.ok(governance.some((file) => file.startsWith("tooling/workspace/")));
});

test("local fast gate has no second workspace dependency graph", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.doesNotMatch(source, /affectedPackages/u);
  assert.doesNotMatch(source, /readdirSync/u);
  assert.doesNotMatch(source, /dependencies\.some/u);
  assert.match(source, /impact-analyzer\.mjs/u);
  assert.match(source, /buildAffectedTurboArgs/u);
});

test("prepare includes dirty and untracked candidate paths before commit", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.match(source, /workingCandidateFiles/u);
  assert.match(
    source,
    /"diff", "--name-only", "--diff-filter=ACDMRTUXB", "-z", baseSha/u,
  );
  assert.match(source, /"ls-files", "--others", "--exclude-standard", "-z"/u);
  assert.ok(
    source.indexOf("if (prepare)") <
      source.indexOf("analyzeExactHead(baseSha, headSha)"),
  );
});

test("canonical main selection rejects stale-only local refs", () => {
  const live = "b".repeat(40);
  assert.equal(
    chooseCanonicalBase(live, [
      { ref: "refs/remotes/origin/main", sha: "a".repeat(40) },
      { ref: "refs/heads/main", sha: live },
    ]),
    live,
  );
  assert.throws(
    () =>
      chooseCanonicalBase(live, [
        { ref: "refs/remotes/origin/main", sha: "a".repeat(40) },
      ]),
    /FAST_GATE_LOCAL_MAIN_STALE/u,
  );
});

test("admission is distinct, exact-head, claim-aware and pre-proof", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.match(source, /--admission/u);
  assert.match(source, /ADMISSION_PASS/u);
  assert.match(source, /validateClaimContext/u);
  assert.match(source, /assertOwnershipCoverage/u);
  assert.doesNotMatch(source, /: "origin\/main"/u);
  assert.ok(
    source.indexOf("validateAdmission(baseSha, headSha, files)") <
      source.indexOf('if (plan.mode === "DEEP_PROOF")'),
  );
});

test("canonical ownership covers Wave 5 geospatial routing paths", () => {
  const ownership = JSON.parse(readFileSync(".morro/ownership.json", "utf8"));
  assert.deepEqual(
    assertOwnershipCoverage(
      [
        "apps/morro-digital-platform/src/config/destination.test.ts",
        "docs/adr/0003-geospatial-provider-strategy.md",
        "packages/geospatial/src/index.ts",
        "packages/geospatial/src/routing-policy.test.ts",
        "tooling/geospatial/routing-policy-promotion.contract.mjs",
      ],
      ownership,
    ),
    { covered: 5 },
  );
});

test("ownership admission fails closed for uncovered paths", () => {
  const ownership = {
    domains: [{ id: "ci", pathPrefixes: ["tooling/ci/", "package.json"] }],
  };
  assert.deepEqual(
    assertOwnershipCoverage(["tooling/ci/x.mjs", "package.json"], ownership),
    { covered: 2 },
  );
  assert.throws(
    () => assertOwnershipCoverage(["tooling/mdctl/x.mjs"], ownership),
    /FAST_GATE_OWNERSHIP_UNCOVERED/u,
  );
});

test("prepare admission and certify modes are explicit and certification is clean", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  for (const flag of ["--prepare", "--admission", "--certify"])
    assert.match(source, new RegExp(flag));
  assert.match(source, /FAST_GATE_CERTIFY_DIRTY_AFTER_PROOF/u);
  assert.match(source, /"diff", "--check"/u);
  assert.match(source, /treeSha/u);
});

test("quality starts heavy work only after successful impact classification", () => {
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  assert.match(
    workflow,
    /core-quality:\n\s+needs: impact\n\s+if: needs\.impact\.result == 'success'/u,
  );
  assert.match(workflow, /quality:\n\s+name: quality\n\s+if: always\(\)/u);
});

test("certify uses executable workspace runtime fallback", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.match(source, /probeWorkspaceRuntime/u);
  assert.match(source, /chooseWorkspaceRuntime/u);
  assert.match(source, /workspaceFallbackUsed/u);
  assert.match(source, /debian-proot/u);
  assert.match(source, /execute\("pnpm", \["check"\], workspace\.runtime\)/u);
});
