import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { analyzeFiles } from "./impact-analyzer.mjs";

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
  assert.equal(analyzeFiles(["docs/executable.mjs"]).needsFullRegression, true);
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

test("unknown paths, mixed product changes, CI changes and release candidates cannot use the fast lane", () => {
  for (const files of [
    ["unmapped/runtime.ts"],
    ["README.md", "unmapped/runtime.ts"],
    [".github/workflows/quality.yml"],
    [],
  ]) {
    const result = analyzeFiles(files);
    assert.equal(result.nonRuntime, false);
    assert.equal(result.needsFullRegression, true);
    assert.equal(result.needsVisual, true);
  }
  const candidate = analyzeFiles(["README.md"], { releaseCandidate: true });
  assert.equal(candidate.nonRuntime, false);
  assert.equal(candidate.needsFullRegression, true);
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
  assert.equal(result.needsFullRegression, true);
  assert.equal(result.needsDatabase, true);
});
