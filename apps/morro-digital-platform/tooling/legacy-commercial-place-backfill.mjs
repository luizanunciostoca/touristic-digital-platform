import { readFileSync } from "node:fs";

import mysql from "mysql2/promise";
import { morroV1SearchCatalog } from "@touristic/search";

import { executeLegacyCommercialPlaceBackfill } from "./legacy-commercial-place-backfill-core.mjs";

const STAGING_SERVICE = "morro-digital-v2-staging";

function loadMappings() {
  const parsed = JSON.parse(
    readFileSync(
      new URL(
        "../src/migration/legacy-commercial-place-mappings.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (!Array.isArray(parsed) || parsed.length !== 72) {
    throw new Error("LEGACY_COMMERCIAL_MAPPING_MANIFEST_INVALID");
  }
  return Object.freeze(parsed.map((mapping) => Object.freeze({ ...mapping })));
}

async function loadPlaceRuntimeModule() {
  const moduleUrl = new URL("./place-platform-runtime.mjs", import.meta.url)
    .href;
  return import(/* @vite-ignore */ moduleUrl);
}

export async function runLegacyCommercialPlaceBackfill({
  environment = process.env,
  apply = false,
  mysqlClient = mysql,
  mappings = loadMappings(),
  catalog = morroV1SearchCatalog,
  runtimeModuleLoader = loadPlaceRuntimeModule,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("LEGACY_COMMERCIAL_BACKFILL_SERVICE_DENIED");
  }
  const databaseUrl = String(environment.BUSINESS_DATABASE_URL ?? "").trim();
  const contentDatabaseUrl = String(
    environment.CONTENT_DATABASE_URL ?? "",
  ).trim();
  if (!databaseUrl) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");
  if (!contentDatabaseUrl) throw new Error("CONTENT_DATABASE_URL_REQUIRED");

  const pool = mysqlClient.createPool(databaseUrl);
  let runtime = null;
  try {
    if (apply) {
      const runtimeModule = await runtimeModuleLoader();
      await runtimeModule.applyPlacePlatformSchema(pool);
      runtime = runtimeModule.createPlacePlatformRuntime({
        getEnvironmentValue(key) {
          if (key === "BUSINESS_DATABASE_URL") return databaseUrl;
          if (key === "CONTENT_DATABASE_URL") return contentDatabaseUrl;
          return String(environment[key] ?? "");
        },
        platformOperations: { emit() {} },
      });
      const started = await runtime.start();
      if (!started) {
        throw new Error("LEGACY_COMMERCIAL_BACKFILL_RUNTIME_UNAVAILABLE");
      }
    }

    return await executeLegacyCommercialPlaceBackfill({
      pool,
      runtime,
      apply,
      mappings,
      catalog,
    });
  } finally {
    if (runtime) await runtime.stop().catch(() => {});
    await pool.end();
  }
}

async function runCli() {
  const apply = process.argv.includes("--apply");
  const summary = await runLegacyCommercialPlaceBackfill({ apply });
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-BACKFILL",
      ...summary,
    })}\n`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("LEGACY_COMMERCIAL_BACKFILL_FAILED\n");
    process.exitCode = 1;
  });
}
