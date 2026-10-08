import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";

test("file-like literal rules are exact while directory and stem rules retain prefix semantics", () => {
  const exact = analyzeFiles([".gitignore"]);
  assert.ok(exact.domains.includes("ci-tooling"));
  assert.equal(exact.classificationBlocked, false);
  assert.equal(exact.qualityProfile, "NON_RUNTIME");

  const nearCollision = analyzeFiles([".gitignore.local"]);
  assert.equal(nearCollision.classificationBlocked, true);
  assert.deepEqual(nearCollision.unknownFiles, [".gitignore.local"]);
  assert.equal(nearCollision.qualityProfile, "CLASSIFICATION_BLOCK");

  const directoryPrefix = analyzeFiles(["tooling/ci/nested/example.mjs"]);
  assert.ok(directoryPrefix.domains.includes("ci-tooling"));
  assert.equal(directoryPrefix.classificationBlocked, false);

  const stemPrefix = analyzeFiles(["Dockerfile.production"]);
  assert.ok(stemPrefix.domains.includes("database"));
  assert.equal(stemPrefix.classificationBlocked, false);
});

test("ticketing financial API impact is CRITICAL and exact-path", () => {
  const path = "apps/morro-digital-platform/tooling/ticketing-api.mjs";
  const decision = analyzeFiles([path]);
  assert.equal(decision.classificationBlocked, false);
  assert.deepEqual(decision.unknownFiles, []);
  assert.ok(decision.domains.includes("payments"));
  assert.equal(decision.risk, "CRITICAL");
  assert.equal(decision.needsFullRegression, true);
  assert.equal(decision.qualityProfile, "DEEP_PROOF");
  assert.equal(decision.needsDatabase, true);
  assert.equal(decision.needsFullSecurity, true);
  assert.ok(decision.suites.includes("payments-browser-checkout-contract.yml"));
  const composed = analyzeFiles([path, ".github/morro-control/claims.json"]);
  assert.equal(composed.classificationBlocked, false);
  assert.ok(composed.domains.includes("governance"));
  assert.equal(composed.risk, "CRITICAL");
  for (const alias of [
    path + ".bak",
    path + "x",
    "apps/morro-digital-platform/tooling/ticketing-api-mock.mjs",
  ]) {
    const rejected = analyzeFiles([alias]);
    assert.equal(rejected.classificationBlocked, true);
    assert.ok(rejected.unknownFiles.includes(alias));
  }
});
