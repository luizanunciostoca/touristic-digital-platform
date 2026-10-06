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
