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
