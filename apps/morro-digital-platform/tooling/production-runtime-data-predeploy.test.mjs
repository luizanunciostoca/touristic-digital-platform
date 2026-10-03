import assert from "node:assert/strict";
import test from "node:test";

import { runProductionRuntimeDataPredeploy } from "./production-runtime-data-predeploy.mjs";

function environment(overrides = {}) {
  return {
    RENDER_SERVICE_NAME: "morro-digital-v2-production-db-bootstrap",
    ...overrides,
  };
}

test("runs the canonical 72-place production bootstrap in governed order", async () => {
  const calls = [];
  const recorder =
    (name) =>
    async ({ environment: env, argv, apply }) => {
      assert.equal(env.PRODUCTION_CANONICAL_PLACE_BOOTSTRAP_ENABLED, "true");
      calls.push({ name, argv: argv ?? null, apply: apply ?? null });
      return { status: "pass", name };
    };

  const result = await runProductionRuntimeDataPredeploy({
    environment: environment(),
    runners: {
      placeBackfill: recorder("place"),
      draftVerify: recorder("draft"),
      mediaBackfill: recorder("media"),
      descriptionBackfill: recorder("description"),
      reviewTransition: recorder("review"),
      cutoverAudit: recorder("audit"),
      publicationBatch: recorder("publication"),
    },
  });

  assert.equal(result.status, "pass");
  assert.equal(result.placeCount, 72);
  assert.deepEqual(
    calls.map((entry) => entry.name),
    [
      "place",
      "draft",
      "media",
      "media",
      "description",
      "description",
      "review",
      "review",
      "audit",
      "publication",
      "publication",
      "audit",
    ],
  );
  assert.equal(calls[0].apply, true);
  assert.deepEqual(calls[2].argv, ["--apply"]);
  assert.deepEqual(calls[3].argv, []);
  assert.deepEqual(calls[6].argv, ["--apply"]);
  assert.deepEqual(calls[7].argv, ["--verify"]);
  assert.deepEqual(calls[9].argv, ["--apply"]);
  assert.deepEqual(calls[10].argv, ["--verify"]);
});

test("production data bootstrap is denied outside the private owner worker", async () => {
  await assert.rejects(
    runProductionRuntimeDataPredeploy({
      environment: environment({ RENDER_SERVICE_NAME: "morro-digital-v2" }),
      runners: {},
    }),
    /PRODUCTION_RUNTIME_DATA_PREDEPLOY_SERVICE_DENIED/u,
  );
});
