import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";
import { buildAffectedTurboArgs } from "./affected-quality.mjs";
import { readFileSync } from "node:fs";
import {
  buildQualityProof,
  isCompleteImpactReport,
  matchesPath,
  selectSuites,
  suiteManifest,
  verifyQualityProof,
  verifySuiteResults,
} from "./suite-scheduler.mjs";

const all = suiteManifest.suites.map((suite) => suite.workflow);
const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
function completeReport(overrides = {}) {
  return {
    ...analyzeFiles(["docs/overview.md"], { base: BASE, head: HEAD }),
    ...overrides,
  };
}
const expectedManagedSuites = [
  "payments-operational-ledger-contract.yml",
  "payments-persistence-integration.yml",
  "payments-sandbox-provider-contract.yml",
  "payments-settlement-contract.yml",
  "payments-subscription-recurrence-contract.yml",
];
test("managed suite registry is exact for this rollout", () => {
  assert.deepEqual([...all].sort(), expectedManagedSuites);
});
test("classification blocks avoid fan-out while critical changes select all managed suites", () => {
  for (const files of [["unexpected/new-runtime.ts"], []])
    assert.deepEqual(selectSuites(analyzeFiles(files)), []);
  for (const files of [["pnpm-lock.yaml"], [".github/workflows/quality.yml"]])
    assert.deepEqual(selectSuites(analyzeFiles(files)), all);
  for (const report of [
    null,
    {},
    { files: [] },
    { files: ["README.md"], suites: [], unknownFiles: [] },
  ])
    assert.deepEqual(selectSuites(report), all);
});
test("isolated prose does not provision managed runtime suites", () => {
  assert.deepEqual(
    selectSuites(analyzeFiles(["docs/architecture/overview.md"])),
    [],
  );
});
test("every migrated trigger path still selects its original suite", () => {
  for (const suite of suiteManifest.suites) {
    for (const path of suite.paths) {
      const file = path.replaceAll("**", "example").replaceAll("*", "example");
      const report = completeReport({
        files: [file],
        risk: "LOW",
        domains: [],
        suites: [],
        unknownFiles: [],
        needsBrowser: false,
        needsVisual: false,
        needsDatabase: false,
        needsContainer: false,
        needsDependencyAudit: false,
        needsFullSecurity: false,
        needsFullRegression: false,
        nonRuntime: false,
        failClosedReason: null,
      });
      assert.ok(
        selectSuites(report).includes(suite.workflow),
        `${suite.workflow}: ${path}`,
      );
    }
  }
});
test("explicit dependency selection is preserved even without a direct path match", () => {
  const report = completeReport({
    files: ["docs/overview.md"],
    domains: ["docs"],
    suites: [all[0]],
    unknownFiles: [],
    needsFullRegression: false,
    nonRuntime: true,
    failClosedReason: null,
  });
  assert.deepEqual(selectSuites(report), [all[0]]);
});
function results(selected) {
  return Object.fromEntries([
    ["impact", { result: "success" }],
    ["core-quality", { result: "success" }],
    ...suiteManifest.suites.map((suite) => [
      suite.jobId,
      { result: selected.includes(suite.workflow) ? "success" : "skipped" },
    ]),
  ]);
}
test("quality succeeds only when every selected suite and core actually succeeded", () => {
  assert.equal(verifySuiteResults(all, results(all)).result, "PASS");
  assert.equal(verifySuiteResults([], results([])).selected, 0);
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    const needs = results(all);
    needs[suiteManifest.suites[0].jobId] = { result };
    assert.throws(() => verifySuiteResults(all, needs), /expected success/);
  }
  for (const id of ["impact", "core-quality"]) {
    const needs = results([]);
    needs[id].result = "failure";
    assert.throws(() => verifySuiteResults([], needs), /did not succeed/);
  }
});
test("unexpected execution, missing results and tampered suite identity fail closed", () => {
  const unexpected = results([]);
  unexpected[suiteManifest.suites[0].jobId].result = "success";
  assert.throws(() => verifySuiteResults([], unexpected), /expected skipped/);
  const missing = results(all);
  delete missing[suiteManifest.suites[0].jobId];
  assert.throws(() => verifySuiteResults(all, missing), /missing/);
  assert.throws(
    () => verifySuiteResults(["forged.yml"], results([])),
    /Unknown/,
  );
  assert.throws(
    () => verifySuiteResults([all[0], all[0]], results(all)),
    /duplicate/,
  );
});

test("double-star directories include zero, one or many nested levels", () => {
  for (const file of [
    "packages/test.mjs",
    "packages/a/test.mjs",
    "packages/a/b/test.mjs",
  ])
    assert.equal(matchesPath(file, "packages/**/test.mjs"), true);
  assert.equal(matchesPath("services/test.mjs", "packages/**/test.mjs"), false);
  assert.equal(matchesPath("packages/a/nested.css", "packages/*.css"), false);
});
test("malformed or unrecognized dependency suite output fails closed", () => {
  for (const suites of [[42], ["unknown-suite.yml"]]) {
    const report = analyzeFiles(["docs/overview.md"]);
    report.suites = suites;
    assert.deepEqual(selectSuites(report), all);
  }
});

test("incomplete analyzer reports cannot narrow managed suite selection", () => {
  const complete = analyzeFiles(["docs/overview.md"], {
    base: "a".repeat(40),
    head: "b".repeat(40),
  });
  assert.equal(isCompleteImpactReport(complete), true);
  for (const field of [
    "risk",
    "head",
    "needsBrowser",
    "needsVisual",
    "needsDatabase",
    "needsContainer",
    "needsDependencyAudit",
    "needsFullSecurity",
    "needsFullRegression",
    "classificationBlocked",
    "nonRuntime",
    "packageJsonChanges",
    "qualityProfile",
  ]) {
    const malformed = structuredClone(complete);
    delete malformed[field];
    assert.equal(isCompleteImpactReport(malformed), false, field);
    assert.deepEqual(selectSuites(malformed), all, field);
  }
});

test("Business and Control Center keep coverage throughout incremental registration", () => {
  for (const [file, expected] of [
    [
      "apps/morro-digital-platform/src/business-dashboard-client.ts",
      "business-dashboard-browser-contract.yml",
    ],
    [
      "apps/control-center/public/control-center-business-cms.js",
      "control-center-catalog-drafts.yml",
    ],
  ]) {
    const report = analyzeFiles([file]);
    const selected = selectSuites(report);
    assert.equal(report.risk, "HIGH");
    assert.equal(report.nonRuntime, false);
    assert.equal(report.needsFullRegression, false);
    assert.equal(report.needsFullSecurity, true);
    if (all.includes(expected)) {
      assert.ok(selected.includes(expected));
      assert.ok(selected.length > 0 && selected.length < all.length);
    } else {
      assert.deepEqual(
        selected,
        [],
        "Legacy exact-path suites must not be replaced by unrelated managed suites",
      );
    }
    for (const suite of suiteManifest.suites.filter((suite) =>
      suite.paths.some((path) => matchesPath(file, path)),
    ))
      assert.ok(selected.includes(suite.workflow), suite.workflow);
  }
});
test("known critical changes stay deep while unclassified changes block", () => {
  for (const file of [
    "services/financial/src/provider.ts",
    "pnpm-lock.yaml",
    ".github/workflows/quality.yml",
    "packages/business/migrations/001.sql",
  ]) {
    const report = analyzeFiles([file]);
    assert.equal(report.needsFullRegression, true, file);
    assert.deepEqual(selectSuites(report), all, file);
  }

  const auth = analyzeFiles(["packages/auth/src/authorization.ts"]);
  assert.equal(auth.classificationBlocked, false);
  assert.equal(auth.needsFullSecurity, true);
  assert.equal(auth.needsBrowser, false);
  assert.equal(auth.needsDatabase, false);
  assert.equal(auth.qualityProfile, "BUGFIX_FAST");
  assert.deepEqual(selectSuites(auth), [
    "payments-operational-ledger-contract.yml",
  ]);

  const unknown = analyzeFiles(["unknown/runtime.ts"]);
  assert.equal(unknown.classificationBlocked, true);
  assert.equal(unknown.needsFullRegression, false);
  assert.deepEqual(selectSuites(unknown), []);
});
test("workspace and observed-state tooling retain deterministic gates without browser fan-out", () => {
  const workspace = analyzeFiles(["tooling/workspace/workspace.mjs"]);
  assert.equal(workspace.nonRuntime, true);
  assert.equal(workspace.needsFullSecurity, true);
  assert.deepEqual(selectSuites(workspace), []);

  const controlState = analyzeFiles(["tooling/control-state/status.mjs"]);
  assert.equal(controlState.nonRuntime, true);
  assert.equal(controlState.needsFullSecurity, false);
  assert.equal(controlState.needsFullRegression, false);
  assert.deepEqual(selectSuites(controlState), []);
});

test("unmigrated runtime suites never fan out to unrelated managed suites", () => {
  for (const file of [
    "apps/morro-digital-platform/src/business-location-discovery-adapter.test.ts",
    "apps/morro-digital-platform/src/business-location-discovery-adapter.ts",
    "apps/morro-digital-platform/src/business-login-entry.test.ts",
    "apps/morro-digital-platform/src/ux/control-center-entity360-dashboard-contract.test.ts",
    "apps/morro-digital-platform/tooling/business-api-catalog.invariants.mjs",
    "apps/morro-digital-platform/tooling/business-api-media.invariants.mjs",
    "apps/morro-digital-platform/tooling/business-api.test.mjs",
    "apps/morro-digital-platform/tooling/control-center-accessibility-browser-contract.mjs",
    "apps/morro-digital-platform/tooling/control-center-commerce-browser-contract.mjs",
    "apps/morro-digital-platform/tooling/control-center-ticketing-browser-contract.mjs",
    "apps/morro-digital-platform/tooling/control-center-users-browser-contract.mjs",
  ]) {
    assert.deepEqual(selectSuites(analyzeFiles([file])), [], file);
    assert.deepEqual(
      selectSuites(
        analyzeFiles([
          file,
          "apps/morro-digital-platform/src/business-dashboard-client.ts",
        ]),
      ),
      [],
      file + " mixed coverage",
    );
  }
});
test("release proof binds successful child results to exact source, tree, lockfile and artifact identity", () => {
  const sha = "a".repeat(40);
  const treeSha = "b".repeat(40);
  const lockfileDigest = "sha256:" + "c".repeat(64);
  const proof = buildQualityProof(all, results(all), sha, {
    treeSha,
    lockfileDigest,
  });
  assert.equal(proof.schemaVersion, 2);
  assert.equal(proof.sourceSha, sha);
  assert.equal(proof.treeSha, treeSha);
  assert.equal(proof.lockfileDigest, lockfileDigest);
  assert.match(proof.artifactDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(proof.selected, all);
  assert.equal(proof.result, "PASS");
  assert.equal(verifyQualityProof(proof).result, "PASS");

  for (const invalid of [undefined, "", "main", "a".repeat(39)])
    assert.throws(
      () =>
        buildQualityProof(all, results(all), invalid, {
          treeSha,
          lockfileDigest,
        }),
      /exact source SHA/,
    );
  assert.throws(
    () =>
      buildQualityProof(all, results(all), sha, {
        treeSha: "main",
        lockfileDigest,
      }),
    /source tree SHA/,
  );
  assert.throws(
    () =>
      buildQualityProof(all, results(all), sha, {
        treeSha,
        lockfileDigest: "sha256:short",
      }),
    /lockfile SHA-256/,
  );

  const tampered = structuredClone(proof);
  tampered.selected = [];
  assert.throws(
    () => verifyQualityProof(tampered),
    /artifact digest mismatch|expected skipped/,
  );

  const skipped = results(all);
  skipped[suiteManifest.suites[0].jobId].result = "skipped";
  assert.throws(
    () =>
      buildQualityProof(all, skipped, sha, {
        treeSha,
        lockfileDigest,
      }),
    /expected success/,
  );
});

test("scheduler reclassifies tampered file lists before narrowing coverage", () => {
  for (const file of [
    "services/financial/src/provider.ts",
    "pnpm-lock.yaml",
    ".github/workflows/quality.yml",
  ]) {
    const report = analyzeFiles(["docs/overview.md"]);
    report.files = [file];
    assert.deepEqual(selectSuites(report), all, file);
  }

  const auth = analyzeFiles(["docs/overview.md"]);
  auth.files = ["packages/auth/src/authorization.ts"];
  assert.deepEqual(selectSuites(auth), [
    "payments-operational-ledger-contract.yml",
  ]);

  const unknown = analyzeFiles(["docs/overview.md"]);
  unknown.files = ["unexpected/new-runtime.ts"];
  assert.deepEqual(selectSuites(unknown), []);
});

test("script-only package changes preserve semantic fast-lane selection", () => {
  const report = analyzeFiles(["package.json"], {
    packageJsonChanges: { "package.json": "scripts" },
  });
  assert.equal(report.nonRuntime, true);
  assert.equal(report.needsFullRegression, false);
  assert.deepEqual(selectSuites(report), []);
});

test("dependency package changes still select full managed coverage", () => {
  const report = analyzeFiles(["package.json"], {
    packageJsonChanges: { "package.json": "dependencies" },
  });
  assert.equal(report.needsFullRegression, true);
  assert.deepEqual(selectSuites(report), all);
});

test("control-plane tooling does not select managed runtime suites", () => {
  for (const file of [
    "tooling/ci/impact-analyzer.mjs",
    "tooling/mdctl/reconcile.mjs",
    "tooling/tdp-max/tdp-max-v2.mjs",
  ]) {
    const report = analyzeFiles([file]);
    assert.equal(report.nonRuntime, true, file);
    assert.equal(report.needsFullRegression, false, file);
    assert.deepEqual(selectSuites(report), [], file);
  }
});

test("affected quality uses exact-base Turbo dependents filter", () => {
  const base = "a".repeat(40);
  assert.deepEqual(buildAffectedTurboArgs(base), [
    "exec",
    "turbo",
    "run",
    "lint",
    "typecheck",
    "test",
    "build",
    "--filter=...[" + base + "]",
  ]);
  assert.throws(() => buildAffectedTurboArgs("main"), /BASE_SHA_INVALID/u);
});

test("Quality workflow uses affected fast profiles and conditional database", () => {
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  for (const profile of [
    "BUGFIX_FAST",
    "UI_BUGFIX_FAST",
    "DB_BUGFIX_FAST",
    "CONTRACT_BUGFIX",
  ])
    assert.ok(workflow.includes(profile), profile);
  assert.ok(
    workflow.includes('node tooling/ci/affected-quality.mjs "$CI_IMPACT_BASE"'),
  );
  assert.ok(workflow.includes("needs_database == 'true' && 'mysql:8.4'"));
  assert.ok(
    workflow.includes(
      "quality_profile == 'DEEP_PROOF' && needs.impact.outputs.needs_database == 'true'",
    ),
  );
});

test("broad Security Scanning is asynchronous to pull-request bugfixes", () => {
  const workflow = readFileSync(
    ".github/workflows/security-scanning.yml",
    "utf8",
  );
  assert.doesNotMatch(workflow, /^  pull_request:/mu);
  assert.match(workflow, /^  push:/mu);
  assert.match(workflow, /^  schedule:/mu);
  assert.match(workflow, /^  workflow_dispatch:/mu);
});
