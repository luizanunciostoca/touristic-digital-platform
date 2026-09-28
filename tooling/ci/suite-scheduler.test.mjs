import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";
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
test("unknown paths, empty changes and critical changes select all managed suites", () => {
  for (const files of [
    ["unexpected/new-runtime.ts"],
    [],
    ["pnpm-lock.yaml"],
    [".github/workflows/quality.yml"],
  ])
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
      const report = {
        files: [file],
        domains: [],
        suites: [],
        unknownFiles: [],
        needsFullRegression: false,
        nonRuntime: false,
      };
      assert.ok(
        selectSuites(report).includes(suite.workflow),
        `${suite.workflow}: ${path}`,
      );
    }
  }
});
test("explicit dependency selection is preserved even without a direct path match", () => {
  const report = {
    files: ["docs/overview.md"],
    domains: ["docs"],
    suites: [all[0]],
    unknownFiles: [],
    needsFullRegression: false,
    nonRuntime: true,
  };
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
    "nonRuntime",
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
        all,
        "Unregistered domains require full managed coverage and keep their legacy triggers",
      );
    }
    for (const suite of suiteManifest.suites.filter((suite) =>
      suite.paths.some((path) => matchesPath(file, path)),
    ))
      assert.ok(selected.includes(suite.workflow), suite.workflow);
  }
});
test("new domain mapping cannot narrow shared auth, dependencies, migrations or schemas", () => {
  for (const file of [
    "packages/auth/src/authorization.ts",
    "services/financial/src/provider.ts",
    "packages/business/package.json",
    "packages/business/migrations/001.sql",
    "packages/business/src/schemas/offering.ts",
    "apps/control-center/src/schema.ts",
    "apps/control-center/src/contracts/permissions.ts",
    "unknown/runtime.ts",
  ]) {
    const report = analyzeFiles([file]);
    assert.equal(report.needsFullRegression, true, file);
    assert.deepEqual(selectSuites(report), all, file);
  }
});
test("workspace and observed-state tooling retains deterministic gates without browser fan-out", () => {
  for (const file of [
    "tooling/workspace/workspace.mjs",
    "tooling/control-state/status.mjs",
  ]) {
    const report = analyzeFiles([file]);
    assert.equal(report.nonRuntime, true);
    assert.equal(report.needsFullSecurity, true);
    assert.deepEqual(selectSuites(report), []);
  }
});

test("uncovered managed runtime files force full coverage even beside a covered change", () => {
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
    assert.deepEqual(selectSuites(analyzeFiles([file])), all, file);
    assert.deepEqual(
      selectSuites(
        analyzeFiles([
          file,
          "apps/morro-digital-platform/src/business-dashboard-client.ts",
        ]),
      ),
      all,
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
  assert.throws(() => verifyQualityProof(tampered), /artifact digest mismatch|expected skipped/);

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

test("inconsistent classification cannot suppress unknown or critical file coverage", () => {
  for (const file of [
    "unexpected/new-runtime.ts",
    "packages/auth/src/authorization.ts",
    "pnpm-lock.yaml",
    ".github/workflows/quality.yml",
  ]) {
    const report = analyzeFiles(["docs/overview.md"]);
    report.files = [file];
    assert.deepEqual(selectSuites(report), all, file);
  }
});
