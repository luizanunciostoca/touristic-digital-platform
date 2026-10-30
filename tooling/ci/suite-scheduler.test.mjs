import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";
import { buildAffectedTurboArgs } from "./affected-quality.mjs";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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
  "control-center-browser-contract.yml",
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
      if (analyzeFiles([file]).classificationBlocked) {
        assert.deepEqual(selectSuites(report), [], file);
        continue;
      }
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

test("Business and Control Center fail closed until central or legacy coverage is proven", () => {
  for (const [file, expected] of [
    [
      "apps/morro-digital-platform/src/business-dashboard-client.ts",
      "business-dashboard-browser-contract.yml",
    ],
    [
      "apps/control-center/public/control-center-business-cms.js",
      "control-center-browser-contract.yml",
    ],
  ]) {
    const report = analyzeFiles([file]);
    assert.equal(report.risk, "HIGH");
    assert.equal(report.nonRuntime, false);
    assert.equal(report.needsFullRegression, false);
    assert.equal(report.needsFullSecurity, true);
    const selected = all.includes(expected) ? selectSuites(report) : null;
    if (all.includes(expected)) {
      assert.ok(selected.includes(expected));
      assert.ok(selected.length > 0 && selected.length < all.length);
    } else {
      assert.throws(
        () => selectSuites(report),
        /CI_SUITE_COVERAGE_UNPROVEN/u,
        "Unproven legacy coverage must block instead of selecting unrelated suites",
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
    "control-center-browser-contract.yml",
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

test("unmigrated runtime coverage fails closed without unrelated fan-out", () => {
  for (const file of [
    "apps/morro-digital-platform/src/business-location-discovery-adapter.test.ts",
    "apps/morro-digital-platform/src/business-location-discovery-adapter.ts",
    "apps/morro-digital-platform/src/business-login-entry.test.ts",
    "apps/morro-digital-platform/tooling/business-api-catalog.invariants.mjs",
    "apps/morro-digital-platform/tooling/business-api-media.invariants.mjs",
    "apps/morro-digital-platform/tooling/business-api.test.mjs",
  ]) {
    assert.throws(
      () => selectSuites(analyzeFiles([file])),
      /CI_SUITE_COVERAGE_UNPROVEN/u,
      file,
    );
    assert.throws(
      () =>
        selectSuites(
          analyzeFiles([
            file,
            "apps/morro-digital-platform/src/business-dashboard-client.ts",
          ]),
        ),
      /CI_SUITE_COVERAGE_UNPROVEN/u,
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
    "control-center-browser-contract.yml",
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

test("affected formatting excludes deleted paths", () => {
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  assert.ok(
    workflow.includes(
      'git diff --name-only --diff-filter=ACMRTUXB -z "$IMPACT_BASE_SHA...$GITHUB_SHA"',
    ),
  );
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

test("Quality selects one root CI authority and one scheduler guard per affected profile", () => {
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  const names = [
    "Validate CI scheduler governance",
    "Validate CI selection and candidate identity",
    "Run affected workspace quality",
  ];
  const commands = [
    "node --test tooling/quality/ci-scheduler-governance.test.mjs",
    "node --test tooling/ci/*.test.mjs",
    'node tooling/ci/affected-quality.mjs "$CI_IMPACT_BASE"',
  ];
  const blocks = workflow.split(/^      - /mu);
  const steps = names.map((name, index) => {
    const matches = blocks.filter((block) =>
      block.startsWith(`name: ${name}\n`),
    );
    assert.equal(matches.length, 1, name);
    const condition = /^        if: (.+)$/mu.exec(matches[0])?.[1];
    const command = /^        run: (.+)$/mu.exec(matches[0])?.[1];
    assert.ok(condition, `${name}: condition required`);
    assert.equal(command, commands[index]);
    assert.equal(
      workflow.split(`run: ${commands[index]}\n`).length - 1,
      1,
      `${name}: duplicate command`,
    );
    return condition;
  });
  const selected = (profile, domains) =>
    steps.map((condition) =>
      runInNewContext(
        `(${condition})`,
        {
          needs: {
            impact: {
              outputs: {
                quality_profile: profile,
                domains: JSON.stringify(domains),
              },
            },
          },
          contains: (collection, value) => collection.includes(value),
          fromJSON: JSON.parse,
        },
        { timeout: 100 },
      ),
    );
  for (const profile of [
    "BUGFIX_FAST",
    "UI_BUGFIX_FAST",
    "DB_BUGFIX_FAST",
    "CONTRACT_BUGFIX",
  ]) {
    for (const domain of ["ci-tooling", "cicd"]) {
      assert.deepEqual(
        selected(profile, [domain]),
        [true, false, true],
        `${profile}/${domain}`,
      );
    }
    assert.deepEqual(
      selected(profile, ["auth"]),
      [false, false, true],
      profile,
    );
  }
  for (const domains of [[], ["ci-tooling"], ["cicd"]]) {
    assert.deepEqual(selected("DEEP_PROOF", domains), [true, true, false]);
  }
  for (const domain of ["ci-tooling", "cicd"]) {
    assert.deepEqual(selected("NON_RUNTIME", [domain]), [true, true, false]);
  }
  assert.deepEqual(selected("NON_RUNTIME", []), [false, false, false]);
  assert.deepEqual(selected("CLASSIFICATION_BLOCK", []), [false, false, false]);
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

test("critical fan-out never masks an uncovered runtime file in either order", () => {
  for (const uncovered of [
    "apps/morro-digital-platform/src/business-location-discovery-adapter.ts",
    "apps/morro-digital-platform/tooling/business-api-catalog.invariants.mjs",
  ]) {
    for (const critical of [
      "pnpm-lock.yaml",
      ".github/workflows/quality.yml",
      "services/financial/src/provider.ts",
    ]) {
      for (const files of [
        [uncovered, critical],
        [critical, uncovered],
      ]) {
        const report = analyzeFiles(files);
        assert.equal(report.needsFullRegression, true, files.join(", "));
        assert.throws(
          () => selectSuites(report),
          (error) =>
            error.message === "CI_SUITE_COVERAGE_UNPROVEN:" + uncovered,
          files.join(", "),
        );
      }
    }
  }
});

test("a release-candidate flag never supplies missing per-file coverage", () => {
  const file = "apps/morro-digital-platform/src/business-dashboard-client.ts";
  const report = analyzeFiles([file], { releaseCandidate: true });
  assert.equal(report.needsFullRegression, true);
  assert.throws(
    () => selectSuites(report),
    (error) => error.message === "CI_SUITE_COVERAGE_UNPROVEN:" + file,
  );
});

test("rediscovered critical impact does not stop checking later files", () => {
  const uncovered = "apps/morro-digital-platform/tooling/business-api.test.mjs";
  const critical = "pnpm-lock.yaml";
  for (const files of [
    [uncovered, critical],
    [critical, uncovered],
  ]) {
    const report = analyzeFiles(files);
    // A complete report can carry a stale aggregate flag; per-file analysis
    // must still check every file before choosing full regression.
    report.needsFullRegression = false;
    assert.equal(isCompleteImpactReport(report), true);
    assert.throws(
      () => selectSuites(report),
      (error) => error.message === "CI_SUITE_COVERAGE_UNPROVEN:" + uncovered,
      files.join(", "),
    );
  }
});

test("critical fan-out does not conceal an unclassified file on recomputation", () => {
  for (const files of [
    ["pnpm-lock.yaml", "unknown/runtime.ts"],
    ["unknown/runtime.ts", "pnpm-lock.yaml"],
  ]) {
    assert.deepEqual(selectSuites(analyzeFiles(files)), []);
    const report = completeReport({
      files,
      risk: "CRITICAL",
      domains: ["dependencies"],
      needsFullRegression: true,
      qualityProfile: "DEEP_PROOF",
    });
    assert.equal(isCompleteImpactReport(report), true);
    assert.deepEqual(selectSuites(report), [], files.join(", "));
  }
});

test("critical candidates with proven or nonrequired coverage retain full fan-out", () => {
  for (const files of [
    ["pnpm-lock.yaml"],
    [".github/workflows/quality.yml", "tooling/ci/suite-scheduler.mjs"],
    ["services/financial/src/provider.ts", "docs/overview.md"],
    ["packages/business/migrations/001.sql"],
  ]) {
    const report = analyzeFiles(files);
    assert.equal(report.needsFullRegression, true, files.join(", "));
    assert.deepEqual(selectSuites(report), all, files.join(", "));
    report.needsFullRegression = false;
    assert.deepEqual(selectSuites(report), all, files.join(", "));
  }
});

test("Control Center runtime and acceptance tests require the browser suite", () => {
  for (const file of [
    "apps/morro-digital-platform/src/ux/control-center-entity360-dashboard-contract.test.ts",
    "apps/morro-digital-platform/tooling/control-center-accessibility-browser-contract.mjs",
    "apps/morro-digital-platform/tooling/control-center-commerce-browser-contract.mjs",
    "apps/morro-digital-platform/tooling/control-center-ticketing-browser-contract.mjs",
    "apps/morro-digital-platform/tooling/control-center-users-browser-contract.mjs",
    "apps/control-center/public/control-center-business-cms.js",
    "apps/control-center/public/control-center.js",
    "apps/morro-digital-platform/src/ux/control-center-business-cms-contract.test.ts",
    "apps/morro-digital-platform/tooling/control-center-accessibility-browser-contract.mjs",
  ]) {
    const selected = selectSuites(analyzeFiles([file]));
    assert.ok(selected.includes("control-center-browser-contract.yml"), file);
    const needs = results(selected);
    needs["suite-control-center-browser-contract"].result = "failure";
    assert.throws(() => verifySuiteResults(selected, needs));
    needs["suite-control-center-browser-contract"].result = "skipped";
    assert.throws(() => verifySuiteResults(selected, needs));
  }
});

test("business support navigation targets content rather than hidden search links", () => {
  const workflow = readFileSync(
    ".github/workflows/control-center-browser-contract.yml",
    "utf8",
  );
  assert.ok(
    workflow.includes(
      "page.locator('#content a[href=\"#businesses:toca-do-morcego\"]')",
    ),
  );
  assert.ok(
    !workflow.includes(
      "page.locator('a[href=\"#businesses:toca-do-morcego\"]')",
    ),
  );
});
