import { pathToFileURL } from "node:url";

import { createCommerceApi } from "./commerce-api.mjs";

const contract = "MORRO-PRODUCTION-COMMERCE-RUNTIME-PREDEPLOY";

function safeDetail(value) {
  const normalized = String(value ?? "COMMERCE_RUNTIME_UNAVAILABLE")
    .trim()
    .toUpperCase();
  return /^[A-Z0-9_:-]{3,160}$/u.test(normalized)
    ? normalized
    : "COMMERCE_RUNTIME_UNAVAILABLE";
}

export async function runProductionCommerceRuntimePredeploy({
  environment = process.env,
  apiFactory = createCommerceApi,
} = {}) {
  const schemaMode = String(environment.MORRO_DATABASE_SCHEMA_MODE ?? "")
    .trim()
    .toLowerCase();
  if (schemaMode !== "external") {
    const evidence = Object.freeze({
      contract,
      contractVersion: 1,
      status: "fail",
      detail: "MORRO_DATABASE_SCHEMA_MODE_EXTERNAL_REQUIRED",
    });
    console.error(JSON.stringify(evidence));
    throw new Error(evidence.detail);
  }

  const api = apiFactory({
    authApi: Object.freeze({}),
    getEnvironmentValue: (key) => environment[key] ?? "",
  });

  try {
    const started = await api.start();
    const readiness = api.readinessCheck();
    const detail = safeDetail(readiness?.detail);
    if (!started || readiness?.status !== "pass") {
      const evidence = Object.freeze({
        contract,
        contractVersion: 1,
        status: "fail",
        detail,
      });
      console.error(JSON.stringify(evidence));
      throw new Error(`COMMERCE_RUNTIME_PREDEPLOY_${detail}`);
    }

    const evidence = Object.freeze({
      contract,
      contractVersion: 1,
      status: "pass",
      detail,
      schemaMode,
    });
    console.log(JSON.stringify(evidence));
    return evidence;
  } finally {
    await api.stop();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await runProductionCommerceRuntimePredeploy();
  } catch (error) {
    const code = safeDetail(
      error instanceof Error ? error.message : "COMMERCE_RUNTIME_UNAVAILABLE",
    );
    if (!code.startsWith("COMMERCE_RUNTIME_PREDEPLOY_")) {
      console.error(
        JSON.stringify({
          contract,
          contractVersion: 1,
          status: "fail",
          detail: code,
        }),
      );
    }
    process.exitCode = 1;
  }
}
