import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const sourcePath =
  "apps/morro-digital-platform/tooling/production-runtime-data-predeploy.mjs";

test("production data predeploy keeps the governed 72-place convergence sequence", () => {
  const source = readFileSync(sourcePath, "utf8");
  const orderedSteps = [
    "legacy-commercial-place-backfill-apply",
    "legacy-commercial-draft-verify",
    "legacy-commercial-media-backfill-apply",
    "legacy-commercial-media-backfill-verify",
    "legacy-commercial-description-backfill-apply",
    "legacy-commercial-description-backfill-verify",
    "legacy-commercial-review-transition-apply",
    "legacy-commercial-review-transition-verify",
    "legacy-commercial-cutover-audit-pre-publication",
    "legacy-commercial-publication-batch-apply",
    "legacy-commercial-publication-batch-verify",
    "legacy-commercial-cutover-audit-post-publication",
  ];

  let cursor = -1;
  for (const step of orderedSteps) {
    const index = source.indexOf(`"${step}"`);
    assert.ok(index > cursor, `production data step order invalid: ${step}`);
    cursor = index;
  }

  assert.match(source, /PRODUCTION_CANONICAL_PLACE_BOOTSTRAP_ENABLED/u);
  assert.match(source, /placeCount:\s*72/u);
  assert.match(source, /morro-digital-v2-production-db-bootstrap/u);
});

test("production data predeploy fails closed outside the private owner worker", () => {
  const modulePath =
    "./apps/" +
    "morro-digital-platform/tooling/production-runtime-data-predeploy.mjs";
  const program = [
    `import(${JSON.stringify(modulePath)})`,
    '.then((module) => module.runProductionRuntimeDataPredeploy({ environment: { RENDER_SERVICE_NAME: "morro-digital-v2" }, runners: {} }))',
    ".then(() => { process.exitCode = 9; })",
    ".catch((error) => { process.stderr.write(String(error?.message ?? error)); process.exitCode = 1; });",
  ].join("");

  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", program],
    {
      encoding: "utf8",
      env: process.env,
    },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /PRODUCTION_RUNTIME_DATA_PREDEPLOY_SERVICE_DENIED/u,
  );
  assert.doesNotMatch(result.stderr, /mysql:\/\//u);
});
