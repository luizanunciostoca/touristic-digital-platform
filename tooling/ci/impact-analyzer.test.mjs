import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  analyzeFiles,
  classifyPackageJsonChange,
  classifyQualityProfile,
} from "./impact-analyzer.mjs";

test("documentation skips product regression without treating runnable docs as prose", () => {
  const docs = analyzeFiles(["README.md", "docs/operations/release.md"]);
  assert.equal(docs.nonRuntime, true);
  for (const key of [
    "needsFullRegression",
    "needsBrowser",
    "needsVisual",
    "needsDatabase",
  ])
    assert.equal(docs[key], false);
  const executableDocs = analyzeFiles(["docs/executable.mjs"]);
  assert.equal(executableDocs.classificationBlocked, true);
  assert.equal(executableDocs.needsFullRegression, false);
  assert.equal(executableDocs.qualityProfile, "CLASSIFICATION_BLOCK");
});

test("governance retains deterministic security validation without product browser regression", () => {
  const result = analyzeFiles([
    ".github/agents/platform-backend.agent.md",
    ".morro/changesets/MD-EXAMPLE.json",
    "tooling/fabric/claim-guard.mjs",
  ]);
  assert.equal(result.nonRuntime, true);
  assert.equal(result.needsFullSecurity, true);
  assert.equal(result.needsBrowser, false);
});

test("financial authority is classified as critical payments", () => {
  for (const file of [
    "services/financial/src/provider.ts",
    "packages/financial/src/index.ts",
    "tooling/payments/settlement.mjs",
  ]) {
    const result = analyzeFiles([file]);
    assert.ok(result.domains.includes("payments"), file);
    assert.ok(result.suites.includes("payments-browser-checkout-contract.yml"));
    assert.equal(result.needsDatabase, true);
    assert.equal(result.needsFullRegression, true);
    assert.equal(result.nonRuntime, false);
  }
});

test("nested database migrations are not missed by directory glob matching", () => {
  for (const file of [
    "packages/catalog/migrations/001.sql",
    "services/catalog/migrations/001.sql",
    "tooling/render/mysql-staging/Dockerfile",
    "apps/morro-digital-platform/tooling/payments-migrate.mjs",
  ]) {
    const result = analyzeFiles([file]);
    assert.ok(result.domains.includes("database"), file);
    assert.equal(result.needsDatabase, true);
    assert.equal(result.nonRuntime, false);
  }
});

test("unknown paths block classification without broad suite fan-out", () => {
  for (const files of [
    ["unmapped/runtime.ts"],
    ["README.md", "unmapped/runtime.ts"],
    [],
  ]) {
    const result = analyzeFiles(files);
    assert.equal(result.nonRuntime, false);
    assert.equal(result.classificationBlocked, true);
    assert.equal(result.needsFullRegression, false);
    assert.equal(result.needsBrowser, false);
    assert.equal(result.needsVisual, false);
    assert.equal(result.needsDatabase, false);
    assert.equal(result.needsDependencyAudit, false);
    assert.equal(result.needsFullSecurity, false);
    assert.equal(result.qualityProfile, "CLASSIFICATION_BLOCK");
  }
  const ci = analyzeFiles([".github/workflows/quality.yml"]);
  assert.equal(ci.classificationBlocked, false);
  assert.equal(ci.needsFullRegression, true);
  assert.equal(ci.qualityProfile, "DEEP_PROOF");
  const candidate = analyzeFiles(["README.md"], { releaseCandidate: true });
  assert.equal(candidate.nonRuntime, false);
  assert.equal(candidate.needsFullRegression, true);
  assert.equal(candidate.qualityProfile, "DEEP_PROOF");
});

test("unresolvable Git identities fail closed at the CLI boundary", () => {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ["tooling/ci/impact-analyzer.mjs", "not-a-valid-revision", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  assert.equal(result.nonRuntime, false);
  assert.equal(result.classificationBlocked, true);
  assert.equal(result.needsFullRegression, false);
  assert.equal(result.needsDatabase, false);
  assert.equal(result.qualityProfile, "CLASSIFICATION_BLOCK");
});

test("serialized claim transitions are classified separately from ordinary governance changes", () => {
  const transition = analyzeFiles([
    ".github/morro-control/claims.json",
    ".github/morro-control/events.ndjson",
    ".morro/changesets/MD-EXAMPLE-001.json",
  ]);
  assert.equal(transition.serializedControlTransitionOnly, true);

  for (const files of [
    [
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
    ],
    [
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
      ".morro/changesets/MD-EXAMPLE-001.json",
      "tooling/mdctl/merge-gate.mjs",
    ],
    [".github/morro-control/claims.json", "README.md", "docs/x.md"],
  ]) {
    assert.equal(analyzeFiles(files).serializedControlTransitionOnly, false);
  }
});

test("control-plane and CI tooling stay non-runtime without product fan-out", () => {
  for (const file of [
    "tooling/ci/impact-analyzer.mjs",
    "tooling/control-state/status.mjs",
    "tooling/mdctl/reconcile.mjs",
    "tooling/tdp-max/tdp-max-v2.mjs",
    "tooling/failure-learning/engine.mjs",
  ]) {
    const result = analyzeFiles([file]);
    assert.equal(result.risk, "HIGH", file);
    assert.equal(result.nonRuntime, true, file);
    assert.equal(result.needsFullRegression, false, file);
    assert.equal(result.needsBrowser, false, file);
    assert.equal(result.needsVisual, false, file);
    assert.equal(result.needsDatabase, false, file);
    assert.equal(result.needsDependencyAudit, false, file);
    assert.equal(result.needsFullSecurity, false, file);
    assert.equal(result.qualityProfile, "NON_RUNTIME", file);
  }
});

test("root gitignore is non-runtime CI tooling while unknown paths remain blocked", () => {
  const gitignore = analyzeFiles([".gitignore"]);
  assert.ok(gitignore.domains.includes("ci-tooling"));
  assert.equal(gitignore.risk, "HIGH");
  assert.equal(gitignore.nonRuntime, true);
  assert.equal(gitignore.classificationBlocked, false);
  assert.equal(gitignore.needsFullRegression, false);
  assert.equal(gitignore.needsBrowser, false);
  assert.equal(gitignore.needsDatabase, false);
  assert.equal(gitignore.qualityProfile, "NON_RUNTIME");

  const unknown = analyzeFiles(["unmapped/runtime.ts"]);
  assert.equal(unknown.classificationBlocked, true);
  assert.equal(unknown.qualityProfile, "CLASSIFICATION_BLOCK");
});

test("package.json scripts do not impersonate dependency changes", () => {
  const before = {
    name: "tdp",
    private: true,
    scripts: { test: "node --test" },
    dependencies: { react: "1.0.0" },
  };
  const scriptsAfter = {
    ...before,
    scripts: {
      ...before.scripts,
      "failure-learning:check": "node tooling/check.mjs",
    },
  };
  const dependenciesAfter = {
    ...before,
    dependencies: { react: "2.0.0" },
  };
  const environmentAfter = {
    ...before,
    engines: { node: ">=22" },
  };

  assert.equal(classifyPackageJsonChange(before, scriptsAfter), "scripts");
  assert.equal(
    classifyPackageJsonChange(before, dependenciesAfter),
    "dependencies",
  );
  assert.equal(
    classifyPackageJsonChange(before, environmentAfter),
    "environment",
  );

  const scripts = analyzeFiles(["package.json"], {
    packageJsonChanges: { "package.json": "scripts" },
  });
  assert.deepEqual(scripts.domains, ["package-scripts"]);
  assert.equal(scripts.risk, "HIGH");
  assert.equal(scripts.nonRuntime, true);
  assert.equal(scripts.needsFullRegression, false);
  assert.equal(scripts.needsDependencyAudit, false);
  assert.equal(scripts.needsFullSecurity, false);
  assert.equal(scripts.qualityProfile, "NON_RUNTIME");

  const dependencies = analyzeFiles(["package.json"], {
    packageJsonChanges: { "package.json": "dependencies" },
  });
  assert.ok(dependencies.domains.includes("dependencies"));
  assert.equal(dependencies.risk, "CRITICAL");
  assert.equal(dependencies.needsFullRegression, true);
  assert.equal(dependencies.needsDependencyAudit, true);
  assert.equal(dependencies.qualityProfile, "DEEP_PROOF");

  const environment = analyzeFiles(["package.json"], {
    packageJsonChanges: { "package.json": "environment" },
  });
  assert.deepEqual(environment.domains, ["package-environment"]);
  assert.equal(environment.risk, "HIGH");
  assert.equal(environment.nonRuntime, false);
  assert.equal(environment.needsFullRegression, false);
  assert.equal(environment.qualityProfile, "BUGFIX_FAST");
});

test("Failure Learning shared triggers require a matching Failure Learning claim", () => {
  const workflow = readFileSync(
    ".github/workflows/failure-learning-independent-proof.yml",
    "utf8",
  );
  assert.ok(workflow.includes("claim_matches_failure_learning=false"));
  assert.ok(
    workflow.includes('.value.paths | any(. == "tooling/failure-learning/**")'),
  );
  assert.ok(
    workflow.includes(
      '[ "$shared_relevant" = true ] && [ "$claim_matches_failure_learning" = true ]',
    ),
  );
});

test("runtime impact resolves explicit fast profiles while unknown changes block", () => {
  const ui = analyzeFiles([
    "apps/morro-digital-platform/src/navigation/router.ts",
  ]);
  assert.equal(ui.qualityProfile, "UI_BUGFIX_FAST");
  assert.equal(ui.needsBrowser, true);
  assert.equal(ui.needsDatabase, false);
  assert.equal(ui.needsFullRegression, false);

  const db = analyzeFiles(["packages/business/src/catalog.ts"]);
  assert.equal(db.qualityProfile, "DB_BUGFIX_FAST");
  assert.equal(db.needsDatabase, true);
  assert.equal(db.needsBrowser, true);
  assert.equal(db.needsFullRegression, false);

  assert.equal(
    classifyQualityProfile({ needsContract: true }),
    "CONTRACT_BUGFIX",
  );
  assert.equal(classifyQualityProfile({}), "BUGFIX_FAST");

  const unknown = analyzeFiles(["unmapped/runtime.ts"]);
  assert.equal(unknown.qualityProfile, "CLASSIFICATION_BLOCK");
  assert.equal(unknown.classificationBlocked, true);
  assert.equal(unknown.needsFullRegression, false);
});

test("Wave 5 geospatial routing paths are classified fail-closed without broad fallback", () => {
  const result = analyzeFiles([
    "apps/morro-digital-platform/src/config/destination.test.ts",
    "packages/geospatial/src/index.ts",
    "packages/geospatial/src/routing-policy.test.ts",
    "tooling/geospatial/routing-policy-promotion.contract.mjs",
  ]);
  assert.equal(result.classificationBlocked, false);
  assert.ok(result.domains.includes("geospatial-routing"));
  assert.equal(result.risk, "HIGH");
  assert.equal(result.needsBrowser, true);
  assert.equal(result.needsDatabase, false);
  assert.equal(result.needsFullRegression, false);
  assert.ok(result.suites.includes("navigation-turn-by-turn-parity.yml"));
  assert.ok(result.suites.includes("navigation-accessibility-baseline.yml"));
});

test("Ticketing startup diagnostics require critical payments proof", () => {
  const result = analyzeFiles([
    "apps/morro-digital-platform/tooling/ticketing-api-startup.test.mjs",
  ]);
  assert.equal(result.classificationBlocked, false);
  assert.deepEqual(result.unknownFiles, []);
  assert.equal(result.risk, "CRITICAL");
  assert.equal(result.qualityProfile, "DEEP_PROOF");
  assert.ok(result.domains.includes("payments"));
  assert.ok(result.suites.includes("payments-browser-checkout-contract.yml"));
  assert.ok(result.suites.includes("commerce-browser-regression.yml"));
  for (const key of [
    "needsFullRegression",
    "needsBrowser",
    "needsDatabase",
    "needsFullSecurity",
  ])
    assert.equal(result[key], true, key);
});

test("Ticketing startup mapping stays exact", () => {
  const result = analyzeFiles([
    "apps/morro-digital-platform/tooling/ticketing-api-startup.test.mjs.unmapped",
  ]);
  assert.equal(result.classificationBlocked, true);
  assert.equal(result.qualityProfile, "CLASSIFICATION_BLOCK");
  assert.equal(result.needsFullRegression, false);
});

test("CRM HTML and browser regression files are explicitly classified without bypassing fail-closed", () => {
  const paths = [
    "apps/admin-crm/public/trials.js",
    "apps/admin-crm/public/referrals.js",
    "apps/admin-crm/public/trials.html",
    "apps/admin-crm/public/follow-ups.html",
    "tooling/crm/crm-html-access.test.mjs",
  ];
  const result = analyzeFiles(paths);
  assert.deepEqual(result.unknownFiles, []);
  assert.equal(result.classificationBlocked, false);
  assert.ok(result.domains.includes("crm-browser"));
  assert.equal(result.risk, "HIGH");
  assert.equal(result.needsBrowser, true);
  assert.equal(result.needsVisual, true);
  assert.equal(result.needsDatabase, false);
  assert.ok(result.suites.includes("crm-equivalence-browser-contract.yml"));
});

test("CRM persistence paths select database proof and staging infra selects critical proof", () => {
  const backend = analyzeFiles([
    "packages/crm/src/index.ts",
    "services/crm/src/mysql-pool.ts",
    "apps/morro-digital-platform/tooling/crm-api.mjs",
  ]);
  assert.equal(backend.classificationBlocked, false);
  assert.deepEqual(backend.unknownFiles, []);
  assert.ok(backend.domains.includes("crm-backend"));
  assert.equal(backend.needsDatabase, true);
  const infrastructure = analyzeFiles([
    "render.staging.yaml",
    "tooling/render/with-staging-mysql-env.mjs",
    "tooling/render/reconcile-staging-mysql-domains.mjs",
    "tooling/render/mysql-staging/01-init-databases.sh",
  ]);
  assert.equal(infrastructure.classificationBlocked, false);
  assert.deepEqual(infrastructure.unknownFiles, []);
  assert.equal(infrastructure.risk, "CRITICAL");
  assert.equal(infrastructure.needsFullRegression, true);
  assert.equal(infrastructure.needsDatabase, true);
});

test("HTML runtime server selects browser proof but nearby typo paths remain unknown", () => {
  const server = analyzeFiles([
    "apps/morro-digital-platform/tooling/dev-server.mjs",
  ]);
  assert.equal(server.classificationBlocked, false);
  assert.ok(server.domains.includes("platform-html-server"));
  assert.equal(server.needsBrowser, true);
  for (const path of [
    "apps/admin-crm-copy/public/trials.js",
    "render.staging.yaml.bak",
    "apps/morro-digital-platform/tooling/dev-server.mjs.bak",
    "unmapped/runtime.ts",
  ]) {
    const unknown = analyzeFiles([path]);
    assert.equal(unknown.classificationBlocked, true, path);
    assert.deepEqual(unknown.unknownFiles, [path]);
  }
});

test("CRM impact paths have verified direct browser and auth workflow triggers", () => {
  const testedPath = "tooling/crm/crm-html-access.test.mjs";
  const classified = analyzeFiles([testedPath]);
  assert.equal(classified.classificationBlocked, false);
  assert.ok(classified.domains.includes("crm-browser"));
  assert.ok(classified.suites.includes("crm-equivalence-browser-contract.yml"));

  for (const workflow of [
    "crm-equivalence-browser-contract.yml",
    "crm-lead-detail-browser-contract.yml",
    "crm-platform-auth-integration-contract.yml",
  ]) {
    const source = readFileSync(".github/workflows/" + workflow, "utf8");
    const triggerCount = source
      .split("\n")
      .filter((line) => line.trim() === '- "tooling/crm/**"').length;
    assert.equal(triggerCount, 2, workflow + " must trigger on PR and main");
    assert.ok(source.includes("pull_request:"), workflow);
    assert.ok(source.includes("push:"), workflow);
  }
  const equivalence = readFileSync(
    ".github/workflows/crm-equivalence-browser-contract.yml",
    "utf8",
  );
  assert.ok(
    equivalence.includes("node --test tooling/crm/crm-html-access.test.mjs"),
    "equivalence workflow must run the actual authenticated CRM HTML test",
  );
  assert.ok(
    equivalence.includes("CRM_BOOTSTRAP_EXCEPTION_EXACT_BASE_ONLY"),
    "pre-test missing file exception must be precisely scoped",
  );
});

test("CRM source classification is exact and does not claim untriggered browser tests", () => {
  for (const [file, domain, suite] of [
    [
      "apps/morro-digital-platform/src/crm-m141-equivalence-contract.test.ts",
      "crm-browser",
      "crm-equivalence-browser-contract.yml",
    ],
    [
      "apps/morro-digital-platform/src/crm-lead-detail-contract.test.ts",
      "crm-lead-detail-browser",
      "crm-lead-detail-browser-contract.yml",
    ],
  ]) {
    const x = analyzeFiles([file]);
    assert.equal(x.classificationBlocked, false, file);
    assert.ok(x.domains.includes(domain), file);
    assert.ok(x.suites.includes(suite), file);
  }
  for (const file of [
    "apps/morro-digital-platform/src/crm-trials-runtime-composition.test.ts",
    "apps/morro-digital-platform/src/crm-unknown.test.ts",
    "apps/morro-digital-platform/tooling/crm-fake.js",
    "tooling/render/surprise-migration.mjs",
  ]) {
    const x = analyzeFiles([file]);
    assert.equal(x.classificationBlocked, true, file);
    assert.deepEqual(x.unknownFiles, [file]);
  }
});

test("CRM HTML impact requires actual PR and push workflow path coverage", () => {
  const manifest = JSON.parse(
    readFileSync("tooling/ci/test-impact-manifest.json", "utf8"),
  );
  const cases = [
    [
      "crm-browser",
      "apps/admin-crm/public/trials.js",
      "crm-equivalence-browser-contract.yml",
      '"apps/admin-crm/public/**"',
    ],
    [
      "crm-browser",
      "tooling/crm/crm-html-access.test.mjs",
      "crm-equivalence-browser-contract.yml",
      '"tooling/crm/**"',
    ],
    [
      "crm-lead-detail-browser",
      "apps/morro-digital-platform/src/crm-lead-detail-contract.test.ts",
      "crm-lead-detail-browser-contract.yml",
      '"apps/morro-digital-platform/src/crm-lead-detail-contract.test.ts"',
    ],
    [
      "crm-browser",
      "apps/morro-digital-platform/src/crm-m141-equivalence-contract.test.ts",
      "crm-equivalence-browser-contract.yml",
      '"apps/morro-digital-platform/src/crm-m141-equivalence-contract.test.ts"',
    ],
    [
      "crm-backend",
      "apps/morro-digital-platform/tooling/crm-api.mjs",
      "crm-platform-auth-integration-contract.yml",
      '"apps/morro-digital-platform/tooling/crm-api.mjs"',
    ],
  ];
  for (const [domain, file, workflow, trigger] of cases) {
    const a = analyzeFiles([file]);
    assert.ok(a.domains.includes(domain), file);
    assert.ok(a.suites.includes(workflow), file);
    const text = readFileSync(".github/workflows/" + workflow, "utf8");
    assert.ok(text.includes("pull_request:"), workflow);
    assert.ok(text.includes("push:"), workflow);
    assert.equal(
      text.split("\n").filter((line) => line.trim() === "- " + trigger).length,
      2,
      workflow + ":" + file,
    );
  }
  assert.equal(
    manifest.domains["crm-browser"].paths.includes(
      "apps/morro-digital-platform/src/crm-",
    ),
    false,
  );
});

test("STAGING CRM exact file-to-suite coverage and triggered real proof", () => {
  const paths = [
    "tooling/render/staging-crm-credentials.mjs",
    "tooling/render/staging-crm-credentials.test.mjs",
    "tooling/render/staging-crm-migrate.mjs",
    "tooling/render/staging-crm-migrate.test.mjs",
  ];
  const workflow = readFileSync(
    ".github/workflows/render-staging-blueprint-contract.yml",
    "utf8",
  );
  for (const path of paths) {
    const report = analyzeFiles([path]);
    assert.deepEqual(report.unknownFiles, [], path);
    assert.equal(report.classificationBlocked, false, path);
    assert.equal(report.risk, "CRITICAL", path);
    assert.equal(report.needsDatabase, true, path);
    assert.equal(report.needsFullRegression, true, path);
    assert.ok(report.domains.includes("staging-infra"), path);
    assert.ok(
      report.suites.includes("render-staging-blueprint-contract.yml"),
      path,
    );
    assert.ok(
      workflow.includes("      - " + path),
      path + " missing PR trigger",
    );
  }
  assert.ok(workflow.includes("pull_request:"));
  assert.ok(
    workflow.includes(
      "node --test tooling/render/staging-crm-credentials.test.mjs tooling/render/staging-crm-migrate.test.mjs",
    ),
    "remote contract must execute actual CRM owner/migration assertions",
  );
  assert.ok(
    workflow.includes("STAGING_CRM_PERSISTENCE_INCOMPLETE"),
    "partial fixture state must fail closed",
  );
  assert.ok(
    workflow.includes("STAGING_CRM_PERSISTENCE_NOT_RUN_IMPLEMENTATION_ABSENT"),
    "no implementation must report NOT_RUN, not a silent PASS",
  );
  for (const path of [
    "tooling/render/staging-crm-unmapped.mjs",
    "tooling/render/staging-crm-migrate.mjs.bak",
    "tooling/render/staging-crm-credentials.test.mjsx",
  ]) {
    const report = analyzeFiles([path]);
    assert.equal(report.classificationBlocked, true, path);
    assert.deepEqual(report.unknownFiles, [path]);
  }
});
