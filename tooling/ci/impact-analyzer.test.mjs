import assert from "node:assert/strict";
import test from "node:test";
import { nonRuntimeTests } from "./affected-task-proof.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  analyzeFiles,
  classifyPackageJsonChange,
  classifyQualityProfile,
} from "./impact-analyzer.mjs";

test("exact performance paths select their real startup and asset proof", () => {
  const cases = [
    [
      "apps/morro-digital-platform/src/performance/browser-startup-performance.ts",
      "startup-performance",
      ["morro-performance-budget.yml", "morro-runtime-startup-performance.yml"],
    ],
    [
      "apps/morro-digital-platform/src/performance/browser-startup-performance.test.ts",
      "startup-performance",
      ["morro-performance-budget.yml", "morro-runtime-startup-performance.yml"],
    ],
    [
      "tooling/performance/check-morro-digital-budget.mjs",
      "performance-assets",
      ["morro-performance-budget.yml"],
    ],
    [
      "tooling/performance/check-morro-digital-budget.test.mjs",
      "performance-assets",
      ["morro-performance-budget.yml"],
    ],
  ];
  for (const [path, domain, suites] of cases) {
    const result = analyzeFiles([path]);
    assert.equal(result.classificationBlocked, false);
    assert.deepEqual(result.unknownFiles, []);
    assert.deepEqual(result.domains, [domain]);
    assert.equal(result.risk, "HIGH");
    assert.equal(result.needsBrowser, true);
    assert.equal(result.nonRuntime, false);
    assert.equal(result.qualityProfile, "UI_BUGFIX_FAST");
    assert.deepEqual(result.suites, suites);
    for (const suite of suites)
      assert.ok(existsSync(`.github/workflows/${suite}`));
    for (const suffix of [".backup", "-old", "/child"]) {
      const neighbor = analyzeFiles([path + suffix]);
      assert.equal(neighbor.classificationBlocked, true);
      assert.deepEqual(neighbor.unknownFiles, [path + suffix]);
    }
  }
});

test("entry CSS compilation and guarded surfaces select real browser proofs", () => {
  const paths = [
    "tooling/ci/build-entry-css.mjs",
    "tooling/ci/build-entry-css.test.mjs",
    "tooling/ci/entry-css-manifest.json",
    "apps/morro-digital-platform/src/map/feature-styles.ts",
    "apps/morro-digital-platform/src/map/feature-styles.test.ts",
    "apps/morro-digital-platform/public/entry-css/",
    "apps/morro-digital-platform/package.json",
  ];
  const suites = [
    "morro-performance-budget.yml",
    "morro-runtime-startup-performance.yml",
    "home-first-run-browser-regression.yml",
    "home-discover-manual-conformance.yml",
    "place-explore-v2-visual-regression.yml",
    "navigation-turn-by-turn-parity.yml",
    "navigation-accessibility-baseline.yml",
    "pwa-offline-browser-contract.yml",
  ];
  for (const path of paths) {
    const file = path.endsWith("/") ? path + "home.css" : path;
    const result = analyzeFiles([file]);
    assert.equal(result.classificationBlocked, false, file);
    assert.ok(result.domains.includes("entry-css-runtime"), file);
    assert.equal(result.nonRuntime, false, file);
    assert.equal(result.needsBrowser, true, file);
    assert.equal(result.needsVisual, true, file);
    for (const suite of suites) {
      assert.ok(result.suites.includes(suite), `${file}: ${suite}`);
      assert.ok(existsSync(`.github/workflows/${suite}`));
    }
  }
  for (const path of paths.slice(0, 5))
    for (const suffix of [".backup", "-old", "/child"]) {
      const result = analyzeFiles([path + suffix]);
      assert.equal(result.classificationBlocked, true, path + suffix);
      assert.deepEqual(result.unknownFiles, [path + suffix]);
    }
  assert.equal(
    analyzeFiles(["tooling/ci/local-fast-gate.mjs"]).nonRuntime,
    true,
  );
  const scripts = analyzeFiles(["apps/morro-digital-platform/package.json"], {
    packageJsonChanges: {
      "apps/morro-digital-platform/package.json": "scripts",
    },
  });
  assert.equal(scripts.nonRuntime, false);
  assert.equal(scripts.needsBrowser, true);
  assert.ok(scripts.domains.includes("package-scripts"));
  assert.ok(scripts.domains.includes("entry-css-runtime"));
  const mixed = analyzeFiles([
    "tooling/ci/build-entry-css.mjs",
    "packages/financial/src/example.ts",
  ]);
  assert.ok(mixed.domains.includes("payments"));
  assert.equal(mixed.needsFullSecurity, true);
  assert.equal(mixed.risk, "CRITICAL");
});

const markerProofFile =
  "tooling/quality/legacy-commercial-publication-marker-contract.test.mjs";

function runLegacyMarkerProof({
  root = process.cwd(),
  markerProof = markerProofFile,
} = {}) {
  if (!existsSync(join(root, markerProof))) {
    const historicalSha = execFileSync(
      "git",
      ["-C", root, "log", "--format=%H", "-1", "HEAD", "--", markerProof],
      { encoding: "utf8" },
    ).trim();
    assert.equal(historicalSha, "", "LEGACY_PUBLICATION_MARKER_TEST_DELETED");
    console.log("LEGACY_MARKER_PROOF_NOT_RUN_IMPLEMENTATION_ABSENT");
    return "NOT_RUN";
  }
  // Node's parent test runner sets NODE_TEST_CONTEXT; an inherited value
  // causes a nested --test invocation to skip tests while exiting zero.
  const independentEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT"),
  );
  const proof = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", markerProof],
    {
      cwd: root,
      encoding: "utf8",
      env: independentEnv,
      timeout: 45000,
    },
  );
  assert.equal(
    proof.status,
    0,
    "LEGACY_PUBLICATION_MARKER_REGRESSION: " +
      String(proof.stdout || "") +
      String(proof.stderr || ""),
  );
  assert.match(
    String(proof.stdout || ""),
    /# tests 1(?:\r?\n|$)/u,
    "LEGACY_MARKER_PROOF_NO_EXECUTED_TEST",
  );
  assert.match(
    String(proof.stdout || ""),
    /# pass 1(?:\r?\n|$)/u,
    "LEGACY_MARKER_PROOF_NO_PASSING_ASSERTION",
  );
  assert.match(
    String(proof.stdout || ""),
    /# fail 0(?:\r?\n|$)/u,
    "LEGACY_MARKER_PROOF_HAS_FAILURE",
  );
  console.log("LEGACY_MARKER_PROOF_RECURRENT_PASS");
  return "PASS";
}

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

test("staging legacy publication batch scripts select critical database and release proof", () => {
  for (const file of [
    "apps/morro-digital-platform/tooling/legacy-commercial-publication-batch.mjs",
    "apps/morro-digital-platform/tooling/legacy-commercial-publication-batch.test.mjs",
  ]) {
    const result = analyzeFiles([file]);
    assert.equal(result.classificationBlocked, false, file);
    assert.equal(result.risk, "CRITICAL", file);
    assert.ok(result.domains.includes("staging-infra"), file);
    assert.ok(
      result.suites.includes("render-staging-blueprint-contract.yml"),
      file,
    );
    assert.equal(result.needsDatabase, true, file);
    assert.equal(result.needsFullRegression, true, file);
    const unknown = analyzeFiles([file + "x"]);
    assert.equal(
      unknown.classificationBlocked,
      true,
      "unmapped sibling must remain fail closed",
    );
  }
});

test("legacy staging verifier selects critical DB and recurrent marker proof", () => {
  const core =
    "apps/morro-digital-platform/tooling/legacy-commercial-draft-verify-core.mjs";
  const result = analyzeFiles([core]);
  assert.equal(result.classificationBlocked, false);
  assert.equal(result.risk, "CRITICAL");
  assert.ok(result.domains.includes("staging-infra"));
  assert.ok(result.suites.includes("render-staging-blueprint-contract.yml"));
  assert.equal(result.needsDatabase, true);
  assert.equal(result.needsFullRegression, true);
  const unrelated = analyzeFiles([core + "x"]);
  assert.equal(unrelated.classificationBlocked, true);

  assert.ok(["PASS", "NOT_RUN"].includes(runLegacyMarkerProof()));
});

test("legacy marker proof fixture rejects failed tests and historical deletion", () => {
  const root = mkdtempSync(join(tmpdir(), "tdp-marker-proof-"));
  const file =
    "tooling/quality/legacy-commercial-publication-marker-contract.test.mjs";
  const full = join(root, file);
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.name", "Morro Fixture");
    git("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(root, "README.md"), "first commit\n");
    git("add", ".");
    git("commit", "-qm", "first");
    assert.equal(runLegacyMarkerProof({ root, markerProof: file }), "NOT_RUN");

    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(
      full,
      'import test from "node:test"; import assert from "node:assert/strict"; test("positive", () => assert.equal(2, 2));\n',
    );
    git("add", ".");
    git("commit", "-qm", "add regression");
    assert.equal(runLegacyMarkerProof({ root, markerProof: file }), "PASS");

    writeFileSync(
      full,
      'import test from "node:test"; import assert from "node:assert/strict"; test("negative", () => assert.fail("fixture failure"));\n',
    );
    assert.throws(
      () => runLegacyMarkerProof({ root, markerProof: file }),
      /LEGACY_PUBLICATION_MARKER_REGRESSION/u,
    );

    git("checkout", "--", file);
    git("rm", "-q", "--", file);
    git("commit", "-qm", "delete regression");
    assert.throws(
      () => runLegacyMarkerProof({ root, markerProof: file }),
      /LEGACY_PUBLICATION_MARKER_TEST_DELETED/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
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

test("STAGING CRM historical deletion cannot be accepted as NOT_RUN", () => {
  const yaml = readFileSync(
    ".github/workflows/render-staging-blueprint-contract.yml",
    "utf8",
  );
  assert.match(yaml, /fetch-depth: 0/);
  const start = yaml.indexOf(
    "      - name: Validate staging CRM owner isolation and schema migration when implemented",
  );
  const end = yaml.indexOf(
    "      - name: Validate bounded staging MySQL readiness wait",
    start,
  );
  assert.ok(start >= 0 && end > start);
  const segment = yaml.slice(start, end).split("        run: |\n")[1];
  assert.ok(segment);
  const script = segment
    .trimEnd()
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
  assert.match(script, /git log --format=%H -1 HEAD/);
  const paths = [
    "tooling/render/staging-crm-credentials.mjs",
    "tooling/render/staging-crm-credentials.test.mjs",
    "tooling/render/staging-crm-migrate.mjs",
    "tooling/render/staging-crm-migrate.test.mjs",
  ];
  const dir = mkdtempSync(join(tmpdir(), "tdp-crm-deletion-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const check = () =>
    spawnSync("bash", ["-c", script], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10000,
    });
  try {
    git("init", "-q");
    git("config", "user.name", "TDP Test");
    git("config", "user.email", "tdp-test@example.invalid");
    writeFileSync(join(dir, "README.md"), "bootstrap\n");
    git("add", ".");
    git("commit", "-qm", "bootstrap");
    const absent = check();
    assert.equal(absent.status, 0, absent.stderr);
    assert.match(
      absent.stdout,
      /STAGING_CRM_PERSISTENCE_NOT_RUN_IMPLEMENTATION_ABSENT/,
    );
    for (const path of paths) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), "implemented\n");
    }
    git("add", ".");
    git("commit", "-qm", "implement");
    for (const path of paths) rmSync(join(dir, path));
    git("add", "-u");
    git("commit", "-qm", "delete");
    const deleted = check();
    assert.notEqual(deleted.status, 0);
    assert.match(
      deleted.stdout + deleted.stderr,
      /STAGING_CRM_PERSISTENCE_DELETED/,
    );
    writeFileSync(join(dir, paths[0]), "partial\n");
    git("add", ".");
    git("commit", "-qm", "partial");
    const partial = check();
    assert.notEqual(partial.status, 0);
    assert.match(
      partial.stdout + partial.stderr,
      /STAGING_CRM_PERSISTENCE_INCOMPLETE/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("administrative auth regression uses exact auth impact and preserves security", () => {
  const adminTest = "apps/morro-digital-platform/tooling/admin-api.test.mjs";
  for (const files of [
    [adminTest],
    [
      adminTest,
      "packages/auth/src/index.ts",
      "packages/auth/src/index.test.ts",
    ],
  ]) {
    const result = analyzeFiles(files);
    assert.equal(result.classificationBlocked, false);
    assert.deepEqual(result.unknownFiles, []);
    assert.deepEqual(result.domains, ["auth"]);
    assert.equal(result.risk, "HIGH");
    assert.equal(result.needsFullSecurity, true);
    assert.equal(result.qualityProfile, "BUGFIX_FAST");
    assert.deepEqual(result.suites, []);
  }
  for (const file of [
    "apps/morro-digital-platform/tooling/admin-api.test.mjs.backup",
    "apps/morro-digital-platform/tooling/admin-api-other.test.mjs",
    "apps/morro-digital-platform/tooling/admin-api.mjs.backup",
  ]) {
    const result = analyzeFiles([file]);
    assert.equal(result.classificationBlocked, true);
    assert.deepEqual(result.unknownFiles, [file]);
    assert.equal(result.qualityProfile, "CLASSIFICATION_BLOCK");
  }
});

test("projected exact admin host mapping retains auth proof and rejects neighbors", async () => {
  const root = mkdtempSync(join(tmpdir(), "tdp-admin-impact-projection-"));
  const analyzerBytes = readFileSync("tooling/ci/impact-analyzer.mjs");
  const manifestBytes = readFileSync("tooling/ci/test-impact-manifest.json");
  const host = "apps/morro-digital-platform/tooling/admin-api.mjs";
  try {
    // Project only the authorized future literal; production classification is unchanged.
    const projectedManifest = JSON.parse(manifestBytes.toString("utf8"));
    projectedManifest.domains.auth.paths = [
      ...new Set([...projectedManifest.domains.auth.paths, host]),
    ];
    writeFileSync(join(root, "impact-analyzer.mjs"), analyzerBytes);
    writeFileSync(
      join(root, "test-impact-manifest.json"),
      JSON.stringify(projectedManifest),
    );
    const { analyzeFiles: analyzeProjectedFiles } = await import(
      pathToFileURL(join(root, "impact-analyzer.mjs")).href
    );
    const result = analyzeProjectedFiles([host]);
    assert.equal(result.classificationBlocked, false);
    assert.deepEqual(result.unknownFiles, []);
    assert.deepEqual(result.domains, ["auth"]);
    assert.equal(result.risk, "HIGH");
    assert.equal(result.needsFullSecurity, true);
    assert.equal(result.nonRuntime, false);
    assert.equal(result.qualityProfile, "BUGFIX_FAST");
    assert.deepEqual(result.suites, []);
    for (const neighbor of [
      `${host}.backup`,
      "apps/morro-digital-platform/tooling/admin-api-other.mjs",
      "apps/morro-digital-platform/tooling/admin-api-other.test.mjs",
    ]) {
      const denied = analyzeProjectedFiles([neighbor]);
      assert.equal(denied.classificationBlocked, true);
      assert.deepEqual(denied.unknownFiles, [neighbor]);
      assert.equal(denied.qualityProfile, "CLASSIFICATION_BLOCK");
    }
    assert.deepEqual(
      readFileSync(join(root, "impact-analyzer.mjs")),
      analyzerBytes,
    );
    assert.deepEqual(
      readFileSync("tooling/ci/test-impact-manifest.json"),
      manifestBytes,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("browser entry retains routing browser proof with exact path matching", () => {
  const entry = "apps/morro-digital-platform/src/browser-entry.ts";
  const result = analyzeFiles([entry]);
  assert.equal(result.classificationBlocked, false);
  assert.deepEqual(result.unknownFiles, []);
  assert.deepEqual(result.domains, ["geospatial-routing"]);
  assert.equal(result.risk, "HIGH");
  assert.equal(result.needsBrowser, true);
  assert.equal(result.qualityProfile, "UI_BUGFIX_FAST");
  assert.deepEqual(result.suites, [
    "navigation-accessibility-baseline.yml",
    "navigation-turn-by-turn-parity.yml",
  ]);
  for (const suite of result.suites) {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows", suite),
      "utf8",
    );
    const prPaths = workflow
      .split("  pull_request:")[1]
      ?.split("\npermissions:")[0];
    assert.ok(
      prPaths?.includes("- " + entry),
      `${suite} must directly trigger for ${entry}`,
    );
  }
  for (const file of [
    entry + ".backup",
    "apps/morro-digital-platform/src/browser-entry-other.ts",
  ]) {
    const unknown = analyzeFiles([file]);
    assert.equal(unknown.classificationBlocked, true);
    assert.deepEqual(unknown.unknownFiles, [file]);
  }
});

test("text and voice UX literals retain direct browser and visual coverage", () => {
  const files = [
    "apps/morro-digital-platform/src/layouts/app-shell.ts",
    "apps/morro-digital-platform/public/tourist-shell-v2.css",
    "apps/morro-digital-platform/src/ux/home-discover-manual-conformance.test.ts",
    "apps/morro-digital-platform/tooling/home-discover-manual-conformance.mjs",
  ];
  const workflow = readFileSync(
    ".github/workflows/home-discover-manual-conformance.yml",
    "utf8",
  );
  const prPaths = workflow
    .split("  pull_request:")[1]
    ?.split("\npermissions:")[0];
  assert.ok(prPaths);
  for (const file of files) {
    const result = analyzeFiles([file]);
    assert.equal(result.classificationBlocked, false, file);
    assert.deepEqual(result.unknownFiles, []);
    assert.deepEqual(result.domains, ["ux-text-voice"]);
    assert.equal(result.risk, "HIGH");
    assert.equal(result.needsBrowser, true);
    assert.equal(result.needsVisual, true);
    assert.equal(result.qualityProfile, "UI_BUGFIX_FAST");
    assert.deepEqual(result.suites, ["home-discover-manual-conformance.yml"]);
    const trigger = file.endsWith("/home-discover-manual-conformance.test.ts")
      ? "apps/morro-digital-platform/src/ux/home-*.test.ts"
      : file;
    assert.ok(
      prPaths.includes("- " + trigger),
      `direct workflow trigger missing: ${file}`,
    );
    const alias = file + ".backup";
    const unknown = analyzeFiles([alias]);
    assert.equal(unknown.classificationBlocked, true, alias);
    assert.deepEqual(unknown.unknownFiles, [alias]);
  }
  const composed = analyzeFiles(files);
  assert.equal(composed.classificationBlocked, false);
  assert.deepEqual(composed.domains, ["ux-text-voice"]);
  assert.equal(composed.needsBrowser, true);
  assert.equal(composed.needsVisual, true);
});

test("assistant shell state literals select only directly triggered browser suites", () => {
  for (const name of [
    "assistant-ui-state.ts",
    "assistant-shell-ui.ts",
    "assistant-shell-ui.test.ts",
  ]) {
    const file = "apps/morro-digital-platform/src/assistant/" + name;
    const result = analyzeFiles([file]);
    assert.equal(result.classificationBlocked, false);
    assert.deepEqual(result.domains, ["assistant-shell-state"]);
    assert.equal(result.risk, "HIGH");
    assert.equal(result.needsBrowser, true);
    assert.equal(result.needsVisual, true);
    assert.deepEqual(result.suites, [
      "assistant-conversation-continuity-browser-contract.yml",
      "assistant-input-menu-flow-v1-parity.yml",
      "navigation-turn-by-turn-parity.yml",
    ]);
    for (const suite of result.suites) {
      const workflow = readFileSync(".github/workflows/" + suite, "utf8");
      const prPaths = workflow
        .split("  pull_request:")[1]
        ?.split("\npermissions:")[0];
      assert.ok(
        prPaths?.includes("- apps/morro-digital-platform/src/assistant/**"),
        suite,
      );
    }
    assert.equal(analyzeFiles([file + ".backup"]).classificationBlocked, true);
  }
});

const pendingSurfaceDomains = {
  "ux-manual-visual-authority": {
    paths: [
      "apps/morro-digital-platform/src/ux/manual-visual-conformance-authority.test.ts",
    ],
    risk: "HIGH",
    dependsOn: [],
    suites: [
      "ux-v2-manual-golden-conformance.yml",
      "place-explore-v2-visual-regression.yml",
    ],
    needsBrowser: true,
    needsVisual: true,
    needsDatabase: false,
    needsDependencyAudit: false,
    needsFullSecurity: false,
  },
  "manual-home-navigation": {
    paths: [
      "apps/morro-digital-platform/src/home/home-discover-navigation.ts",
      "apps/morro-digital-platform/src/home/manual-place-search.ts",
      "apps/morro-digital-platform/src/home/manual-place-search.test.ts",
    ],
    risk: "HIGH",
    dependsOn: [],
    suites: ["home-discover-manual-conformance.yml"],
    needsBrowser: true,
    needsVisual: true,
    needsDatabase: false,
    needsDependencyAudit: false,
    needsFullSecurity: false,
  },
  "explore-marker-rendering": {
    paths: [
      "apps/morro-digital-platform/src/map/explore-marker-grouping.ts",
      "apps/morro-digital-platform/src/map/explore-marker-grouping.test.ts",
      "apps/morro-digital-platform/src/map/explore-marker-selection.ts",
      "apps/morro-digital-platform/src/map/explore-marker-selection.test.ts",
      "apps/morro-digital-platform/src/map/explore-marker-element.ts",
      "apps/morro-digital-platform/src/map/explore-marker-element.test.ts",
      "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      "apps/morro-digital-platform/src/map/explore-locations-control.test.ts",
      "apps/morro-digital-platform/public/explore-locations.css",
      "packages/geospatial/src/infrastructure/mapbox-gl-driver.ts",
      "packages/geospatial/src/infrastructure/mapbox-gl-driver.test.ts",
    ],
    risk: "HIGH",
    dependsOn: [],
    suites: ["place-explore-v2-visual-regression.yml"],
    needsBrowser: true,
    needsVisual: true,
    needsDatabase: false,
    needsDependencyAudit: false,
    needsFullSecurity: false,
  },
  "explore-marker-contract": {
    paths: ["apps/morro-digital-platform/src/ux/tour-wave-d-contract.test.ts"],
    risk: "HIGH",
    dependsOn: [],
    suites: ["quality.yml"],
    needsBrowser: false,
    needsVisual: false,
    needsDatabase: false,
    needsDependencyAudit: false,
    needsFullSecurity: false,
  },
  "affiliate-runtime": {
    paths: [
      "apps/morro-digital-platform/tooling/affiliates-api.mjs",
      "apps/morro-digital-platform/tooling/affiliates-api.test.mjs",
      "apps/morro-digital-platform/tooling/affiliate-portal-runtime-wiring.test.mjs",
    ],
    risk: "HIGH",
    dependsOn: [],
    suites: ["quality.yml"],
    needsBrowser: false,
    needsVisual: false,
    needsDatabase: false,
    needsDependencyAudit: false,
    needsFullSecurity: true,
  },
  "wave-a-gesture-harness": {
    paths: [
      "apps/morro-digital-platform/tooling/wave-a-discover-convergence.mjs",
      "apps/morro-digital-platform/tooling/wave-a-pan-gesture.mjs",
      "apps/morro-digital-platform/tooling/wave-a-pan-gesture.test.mjs",
    ],
    risk: "HIGH",
    dependsOn: [],
    suites: ["quality.yml"],
    needsBrowser: true,
    needsVisual: true,
    needsDatabase: false,
    needsDependencyAudit: false,
    needsFullSecurity: false,
  },
};

for (const [domain, definition] of Object.entries(pendingSurfaceDomains))
  test(`pending surface ${domain} keeps literal boundaries and proof requirements`, () => {
    for (const file of definition.paths) {
      const result = analyzeFiles([file]);
      assert.equal(result.classificationBlocked, false, file);
      assert.deepEqual(result.unknownFiles, []);
      assert.deepEqual(result.domains, [domain]);
      assert.equal(result.risk, "HIGH");
      for (const flag of ["needsBrowser", "needsVisual", "needsFullSecurity"])
        assert.equal(result[flag], definition[flag], file + ":" + flag);
      assert.deepEqual(result.suites, [...definition.suites].sort());
      for (const alias of [
        file + ".backup",
        file + "/nested.ts",
        file.replace(/\.(mjs|ts|css)$/u, "-other.$1"),
      ]) {
        const unknown = analyzeFiles([alias]);
        assert.equal(unknown.classificationBlocked, true, alias);
        assert.deepEqual(unknown.unknownFiles, [alias]);
      }
    }
    const combined = analyzeFiles(definition.paths);
    assert.equal(combined.classificationBlocked, false);
    assert.deepEqual(combined.domains, [domain]);
    for (const suite of definition.suites) {
      const workflow = readFileSync(".github/workflows/" + suite, "utf8");
      const pr = workflow
        .split("  pull_request:")[1]
        ?.split(
          /\n  (?:push|workflow_dispatch|merge_group):|\npermissions:/u,
        )[0];
      assert.ok(pr, suite);
      if (suite === "quality.yml") {
        assert.ok(!pr.includes("paths:"), "quality must remain unconditional");
        continue;
      }
      for (const file of definition.paths) {
        const trigger =
          domain === "manual-home-navigation"
            ? "apps/morro-digital-platform/src/home/**"
            : domain === "explore-marker-rendering"
              ? file.includes("/src/map/")
                ? "apps/morro-digital-platform/src/map/**"
                : file.includes("packages/geospatial/")
                  ? "packages/geospatial/src/**"
                  : file
              : file;
        assert.ok(
          pr.includes(trigger),
          suite + ":" + file + " direct trigger missing",
        );
      }
    }
  });

test("structural gesture selection does not waive browser proof or change existing security floors", () => {
  const wave = analyzeFiles(
    pendingSurfaceDomains["wave-a-gesture-harness"].paths,
  );
  assert.equal(wave.needsBrowser, true);
  assert.equal(wave.needsVisual, true);
  assert.deepEqual(wave.suites, ["quality.yml"]);
  const workflow = analyzeFiles([
    ".github/workflows/home-discover-manual-conformance.yml",
  ]);
  assert.equal(workflow.risk, "CRITICAL");
  const crm = analyzeFiles(["packages/crm/src/trials-boundary.test.ts"]);
  assert.deepEqual(crm.domains, ["crm-backend"]);
  assert.equal(crm.needsDatabase, true);
  const auth = analyzeFiles([
    "apps/morro-digital-platform/tooling/admin-api.test.mjs",
  ]);
  assert.equal(auth.needsFullSecurity, true);
});

const confirmedUxImpactPaths = [
  "apps/morro-digital-platform/src/map/device-saved-itineraries.ts",
  "apps/morro-digital-platform/src/map/device-saved-itineraries.test.ts",
  "apps/morro-digital-platform/src/map/saved-itinerary-ui.ts",
  "apps/morro-digital-platform/src/map/saved-itinerary-ui.test.ts",
  "apps/morro-digital-platform/src/map/immersive-tour-v1-controller.ts",
  "apps/morro-digital-platform/src/map/immersive-tour-v1-i18n.ts",
  "apps/morro-digital-platform/src/map/immersive-tour-v1-i18n.test.ts",
  "apps/morro-digital-platform/src/map/immersive-tour-v1-controller.test.ts",
  "apps/morro-digital-platform/src/home/home-discover-navigation.test.ts",
  "apps/morro-digital-platform/tooling/device-saved-itineraries-browser-contract.cjs",
  "apps/morro-digital-platform/src/map/explore-flow-bottom-sheet.ts",
  "apps/morro-digital-platform/src/map/explore-flow-bottom-sheet.test.ts",
  "apps/morro-digital-platform/src/ux/navigation-tour-manual-conformance.test.ts",
  ".github/workflows/home-discover-manual-conformance.yml",
  "apps/morro-digital-platform/src/map/discover-map-controls.ts",
  "apps/morro-digital-platform/src/map/discover-map-controls.test.ts",
  "apps/morro-digital-platform/src/map/explore-v1-i18n.ts",
  "apps/morro-digital-platform/src/map/explore-v1-i18n.test.ts",
  "apps/morro-digital-platform/src/map/explore-locations-v1-flow.ts",
  "apps/morro-digital-platform/src/map/explore-locations-v1-flow.test.ts",
  "apps/morro-digital-platform/src/weather/weather-widget.ts",
  "apps/morro-digital-platform/src/weather/weather-widget.test.ts",
  "apps/morro-digital-platform/src/weather/weather-i18n.ts",
  "apps/morro-digital-platform/src/weather/weather-i18n.test.ts",
  "apps/morro-digital-platform/src/weather/weather-forecast-modal.ts",
  "apps/morro-digital-platform/tooling/weather-v1-i18n-browser-parity.mjs",
  "apps/morro-digital-platform/public/v1-weather-runtime-parity.css",
  "apps/morro-digital-platform/public/offline.html",
  "apps/morro-digital-platform/public/service-worker.js",
  "apps/morro-digital-platform/src/pwa/pwa-contract.test.ts",
  ".github/workflows/weather-v1-i18n-browser-parity.yml",
  ".github/workflows/pwa-offline-browser-contract.yml",
];
test("confirmed UX literals retain browser/visual proof and reject sibling aliases", () => {
  for (const path of confirmedUxImpactPaths) {
    const report = analyzeFiles([path]);
    assert.equal(report.classificationBlocked, false);
    assert.equal(
      report.risk,
      path.startsWith(".github/") ? "CRITICAL" : "HIGH",
    );
    assert.equal(report.needsBrowser, true);
    assert.equal(report.needsVisual, true);
    if (!path.startsWith(".github/"))
      assert.equal(analyzeFiles([path + ".bak"]).classificationBlocked, true);
  }
});

test("offline external script keeps exact PWA coverage and security floors", () => {
  const path = "apps/morro-digital-platform/public/offline.js";
  const report = analyzeFiles([path]);
  assert.equal(report.classificationBlocked, false);
  assert.deepEqual(report.unknownFiles, []);
  assert.deepEqual(report.domains, ["pwa-offline-ui"]);
  assert.deepEqual(report.suites, ["pwa-offline-browser-contract.yml"]);
  assert.equal(report.risk, "HIGH");
  assert.equal(report.needsBrowser, true);
  assert.equal(report.needsVisual, true);
  assert.equal(report.needsFullSecurity, true);
  for (const sibling of [
    path + ".bak",
    path.replace("offline.js", "offline-other.js"),
  ]) {
    assert.equal(analyzeFiles([sibling]).classificationBlocked, true);
  }
});

test("menu command semantic consumer retains assistant proof floors", () => {
  for (const path of [
    "apps/morro-digital-platform/src/assistant/assistant-menu-command-router.ts",
    "apps/morro-digital-platform/src/assistant/assistant-menu-command-router.test.ts",
  ]) {
    const report = analyzeFiles([path]);
    assert.equal(report.classificationBlocked, false);
    assert.equal(report.risk, "MEDIUM");
    assert.equal(report.needsBrowser, true);
    assert.equal(report.needsVisual, true);
    assert.equal(report.needsFullSecurity, false);
    assert.ok(
      report.suites.includes(
        "assistant-conversation-continuity-browser-contract.yml",
      ),
    );
    assert.ok(
      report.suites.includes("assistant-input-menu-flow-v1-parity.yml"),
    );
    for (const suffix of [".bak", "-other", "/child"])
      assert.equal(analyzeFiles([path + suffix]).classificationBlocked, true);
  }
});

test("Place menu recovery contract test keeps exact visual proof", () => {
  const path =
    "apps/morro-digital-platform/src/ux/place-search-explore-v2-contract.test.ts";
  const report = analyzeFiles([path]);
  assert.equal(report.classificationBlocked, false);
  assert.equal(report.risk, "HIGH");
  assert.equal(report.needsBrowser, true);
  assert.equal(report.needsVisual, true);
  assert.ok(report.suites.includes("place-explore-v2-visual-regression.yml"));
  for (const suffix of [".bak", "-other", "/child"])
    assert.equal(analyzeFiles([path + suffix]).classificationBlocked, true);
});

test("semantic viewport and analytics have exact impact and retained proof floors", () => {
  for (const group of [
    "map/explore-map-viewport-v1",
    "analytics/browser-analytics",
  ])
    for (const suffix of [".ts", ".test.ts"]) {
      const path = "apps/morro-digital-platform/src/" + group + suffix;
      const report = analyzeFiles([path]);
      assert.equal(report.classificationBlocked, false);
      assert.equal(report.risk, "HIGH");
      assert.equal(report.needsBrowser, group.startsWith("map/"));
      assert.equal(report.needsVisual, group.startsWith("map/"));
      assert.equal(report.needsFullSecurity, false);
      assert.ok(
        report.suites.includes(
          group.startsWith("map/")
            ? "v1-assistant-single-message-poi-markers.yml"
            : "quality.yml",
        ),
      );
      for (const alias of [".bak", "-other", "/child"])
        assert.equal(analyzeFiles([path + alias]).classificationBlocked, true);
    }
  const governance = analyzeFiles([
    ".morro/ownership.json",
    "tooling/ci/test-impact-manifest.json",
  ]);
  assert.equal(governance.risk, "HIGH");
  assert.equal(
    analyzeFiles([
      ".morro/ownership.json",
      ".github/workflows/assistant-input-menu-flow-v1-parity.yml",
    ]).risk,
    "CRITICAL",
  );
});

const initialCssExactRuntimePaths = [
  "apps/morro-digital-platform/public/index.html",
  "apps/morro-digital-platform/src/onboarding/public-interactive-tour.ts",
  "apps/morro-digital-platform/src/onboarding/public-onboarding.test.ts",
  "apps/morro-digital-platform/src/accessibility/ux-p0-foundations.test.ts",
  "apps/morro-digital-platform/src/ux/assistant-modal-v2-contract.test.ts",
  "apps/morro-digital-platform/src/ux/home-shell-v2-contract.test.ts",
  "apps/morro-digital-platform/src/ux/legacy-css-bundle-v2-contract.test.ts",
  "apps/morro-digital-platform/src/ux/stylelint-governance-v2-contract.test.ts",
  "apps/morro-digital-platform/src/onboarding/public-onboarding.ts",
  "apps/morro-digital-platform/src/assistant/assistant-voice-settings.ts",
  "apps/morro-digital-platform/src/assistant/assistant-voice-settings.test.ts",
];
test("initial CSS exact runtime paths select required suites without broadening neighbors", () => {
  for (const path of initialCssExactRuntimePaths) {
    const report = analyzeFiles([path]);
    assert.equal(report.classificationBlocked, false, path);
    assert.deepEqual(report.unknownFiles, []);
    assert.equal(report.risk, "HIGH");
    assert.equal(report.nonRuntime, false);
    assert.equal(report.needsBrowser, true);
    assert.equal(report.needsVisual, true);
    assert.equal(report.needsDatabase, false);
    for (const suite of [
      "morro-performance-budget.yml",
      "morro-runtime-startup-performance.yml",
      "home-first-run-browser-regression.yml",
      "home-discover-manual-conformance.yml",
      "place-explore-v2-visual-regression.yml",
      "navigation-turn-by-turn-parity.yml",
      "navigation-accessibility-baseline.yml",
      "pwa-offline-browser-contract.yml",
    ])
      assert.ok(report.suites.includes(suite), suite + " for " + path);
    for (const suffix of [".bak", "-old", "/child"]) {
      const unknown = analyzeFiles([path + suffix]);
      assert.equal(unknown.classificationBlocked, true, path + suffix);
      assert.deepEqual(unknown.unknownFiles, [path + suffix]);
    }
  }
});

test("constitution has exact governance classification with security preserved", () => {
  const result = analyzeFiles(["CONSTITUTION.md"]);
  assert.equal(result.classificationBlocked, false);
  assert.deepEqual(result.unknownFiles, []);
  assert.deepEqual(result.domains, ["governance"]);
  assert.equal(result.risk, "HIGH");
  assert.equal(result.needsFullSecurity, true);
  assert.equal(result.nonRuntime, true);
  assert.equal(result.qualityProfile, "NON_RUNTIME");
});

test("constitution mapping does not classify adjacent or unknown root paths", () => {
  for (const file of [
    "CONSTITUTION.md.backup",
    "CONSTITUTION.md-old",
    "CONSTITUTION.md/child",
    "UNKNOWN_ROOT.md",
  ]) {
    const result = analyzeFiles([file]);
    assert.equal(result.classificationBlocked, true, file);
    assert.equal(result.qualityProfile, "CLASSIFICATION_BLOCK");
    assert.deepEqual(result.unknownFiles, [file]);
  }
});

test("constitution PR1240 complete diff remains governance high and fail-closed on unknown extras", () => {
  const files = [
    ".github/hooks/morro-pretool-guard.mjs",
    "AGENTS.md",
    "CONSTITUTION.md",
    "tooling/ci/local-fast-gate.mjs",
    "tooling/fabric/ordinary-pr-policy.mjs",
    "tooling/fabric/ordinary-pr-policy.test.mjs",
    "tooling/ci/test-impact-manifest.json",
    "tooling/ci/impact-analyzer.test.mjs",
  ];
  const result = analyzeFiles(files);
  assert.equal(result.classificationBlocked, false);
  assert.deepEqual(result.unknownFiles, []);
  assert.equal(result.risk, "HIGH");
  assert.equal(result.needsFullSecurity, true);
  assert.equal(result.nonRuntime, true);
  const unknown = analyzeFiles([...files, "UNKNOWN_ROOT.md"]);
  assert.equal(unknown.classificationBlocked, true);
  assert.deepEqual(unknown.unknownFiles, ["UNKNOWN_ROOT.md"]);
});

test("constitution does not downgrade production or financial changes", () => {
  for (const path of [
    ".github/workflows/production-oci-promotion.yml",
    "packages/financial/src/example.ts",
  ]) {
    const result = analyzeFiles(["CONSTITUTION.md", path]);
    assert.equal(result.classificationBlocked, false);
    assert.equal(result.risk, "CRITICAL");
    assert.equal(result.needsFullSecurity, true);
    assert.equal(result.nonRuntime, false);
  }
});

test("exact Turbo CSS cache paths require full quality and the actual cache regression", () => {
  const regression = "tooling/ci/turbo-entry-css-cache.test.mjs";
  for (const file of ["turbo.json", regression]) {
    const result = analyzeFiles([file]);
    assert.equal(result.classificationBlocked, false, file);
    assert.deepEqual(result.unknownFiles, [], file);
    assert.equal(result.risk, "CRITICAL", file);
    assert.equal(result.qualityProfile, "DEEP_PROOF", file);
    assert.equal(result.nonRuntime, false, file);
    assert.equal(result.needsBrowser, true, file);
    assert.equal(result.needsVisual, true, file);
    assert.equal(result.needsFullSecurity, true, file);
    assert.ok(result.domains.includes("cicd"), file);
    assert.ok(result.domains.includes("entry-css-runtime"), file);
    assert.ok(nonRuntimeTests(result.domains).includes(regression), file);
    for (const suffix of [".backup", "-old", "/child"]) {
      const neighbor = analyzeFiles([file + suffix]);
      assert.equal(neighbor.classificationBlocked, true, file + suffix);
      assert.deepEqual(neighbor.unknownFiles, [file + suffix]);
    }
  }
});
