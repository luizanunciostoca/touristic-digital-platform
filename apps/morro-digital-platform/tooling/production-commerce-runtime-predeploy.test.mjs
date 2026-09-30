import assert from "node:assert/strict";
import test from "node:test";

import { runProductionCommerceRuntimePredeploy } from "./production-commerce-runtime-predeploy.mjs";

function apiFactory({ start = true, detail = "commerce-runtime-ready" } = {}) {
  return () => ({
    async start() {
      return start;
    },
    readinessCheck() {
      return {
        status: start ? "pass" : "fail",
        critical: false,
        detail,
      };
    },
    async stop() {},
  });
}

test("accepts a healthy Commerce runtime only in external schema mode", async () => {
  const evidence = await runProductionCommerceRuntimePredeploy({
    environment: { MORRO_DATABASE_SCHEMA_MODE: "external" },
    apiFactory: apiFactory(),
  });
  assert.deepEqual(evidence, {
    contract: "MORRO-PRODUCTION-COMMERCE-RUNTIME-PREDEPLOY",
    contractVersion: 1,
    status: "pass",
    detail: "COMMERCE-RUNTIME-READY",
    schemaMode: "external",
  });
});

test("fails closed with the classified Commerce readiness detail", async () => {
  await assert.rejects(
    runProductionCommerceRuntimePredeploy({
      environment: { MORRO_DATABASE_SCHEMA_MODE: "external" },
      apiFactory: apiFactory({
        start: false,
        detail: "COMMERCE_DATABASE_ACCESS_DENIED",
      }),
    }),
    /COMMERCE_RUNTIME_PREDEPLOY_COMMERCE_DATABASE_ACCESS_DENIED/u,
  );
});

test("rejects any schema mode that could apply runtime DDL", async () => {
  await assert.rejects(
    runProductionCommerceRuntimePredeploy({
      environment: { MORRO_DATABASE_SCHEMA_MODE: "apply" },
      apiFactory: apiFactory(),
    }),
    /MORRO_DATABASE_SCHEMA_MODE_EXTERNAL_REQUIRED/u,
  );
});
