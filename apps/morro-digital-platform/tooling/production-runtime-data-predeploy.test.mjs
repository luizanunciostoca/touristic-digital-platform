import assert from "node:assert/strict";
import test from "node:test";

import { runProductionRuntimeDataPredeploy } from "./production-runtime-data-predeploy.mjs";

test("rejects non-production service identity", async () => {
  await assert.rejects(
    () =>
      runProductionRuntimeDataPredeploy({
        environment: { RENDER_SERVICE_NAME: "morro-digital-v2-staging" },
        steps: [],
      }),
    /PRODUCTION_RUNTIME_DATA_PREDEPLOY_SERVICE_DENIED/u,
  );
});

test("executes canonical production data convergence steps in order", async () => {
  const calls = [];
  const environment = Object.freeze({
    RENDER_SERVICE_NAME: "morro-digital-v2",
    BUSINESS_DATABASE_URL: "mysql://business",
    CONTENT_DATABASE_URL: "mysql://content",
  });
  const steps = [
    {
      name: "first",
      async run(received) {
        assert.equal(received, environment);
        calls.push("first");
      },
    },
    {
      name: "second",
      async run(received) {
        assert.equal(received, environment);
        calls.push("second");
      },
    },
  ];

  const result = await runProductionRuntimeDataPredeploy({
    environment,
    steps,
  });

  assert.deepEqual(calls, ["first", "second"]);
  assert.deepEqual(result, {
    contract: "MORRO-PRODUCTION-RUNTIME-DATA-PREDEPLOY",
    contractVersion: 1,
    status: "pass",
    steps: ["first", "second"],
  });
});
