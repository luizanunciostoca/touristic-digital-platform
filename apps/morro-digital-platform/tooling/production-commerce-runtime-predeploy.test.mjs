import { describe, expect, it } from "vitest";

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

describe("Production Commerce runtime predeploy", () => {
  it("accepts a healthy Commerce runtime only in external schema mode", async () => {
    await expect(
      runProductionCommerceRuntimePredeploy({
        environment: { MORRO_DATABASE_SCHEMA_MODE: "external" },
        apiFactory: apiFactory(),
      }),
    ).resolves.toEqual({
      contract: "MORRO-PRODUCTION-COMMERCE-RUNTIME-PREDEPLOY",
      contractVersion: 1,
      status: "pass",
      detail: "COMMERCE-RUNTIME-READY",
      schemaMode: "external",
    });
  });

  it("fails closed with the classified Commerce readiness detail", async () => {
    await expect(
      runProductionCommerceRuntimePredeploy({
        environment: { MORRO_DATABASE_SCHEMA_MODE: "external" },
        apiFactory: apiFactory({
          start: false,
          detail: "COMMERCE_DATABASE_ACCESS_DENIED",
        }),
      }),
    ).rejects.toThrow(
      /COMMERCE_RUNTIME_PREDEPLOY_COMMERCE_DATABASE_ACCESS_DENIED/u,
    );
  });

  it("rejects any schema mode that could apply runtime DDL", async () => {
    await expect(
      runProductionCommerceRuntimePredeploy({
        environment: { MORRO_DATABASE_SCHEMA_MODE: "apply" },
        apiFactory: apiFactory(),
      }),
    ).rejects.toThrow(/MORRO_DATABASE_SCHEMA_MODE_EXTERNAL_REQUIRED/u);
  });
});
