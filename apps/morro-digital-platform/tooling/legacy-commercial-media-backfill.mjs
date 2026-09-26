import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { executeLegacyCommercialMediaBackfill } from "./legacy-commercial-media-backfill-core.mjs";

const STAGING_SERVICE = "morro-digital-v2-staging";

async function loadMysqlClient() {
  const module = await import("mysql2/promise");
  return module.default ?? module;
}

async function loadContentSchemaApplier() {
  const module = await import("@touristic/content-server");
  return module.applyContentM156Schema;
}

async function loadManifest() {
  const content = await readFile(
    new URL(
      "../src/migration/legacy-commercial-media-mappings.ndjson",
      import.meta.url,
    ),
    "utf8",
  );
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function runLegacyCommercialMediaBackfill({
  environment = process.env,
  argv = process.argv.slice(2),
  mysqlClient,
  mysqlClientLoader = loadMysqlClient,
  contentSchemaApplier,
  contentSchemaLoader = loadContentSchemaApplier,
  manifest,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("LEGACY_MEDIA_BACKFILL_SERVICE_DENIED");
  }

  const businessDatabaseUrl = String(
    environment.BUSINESS_DATABASE_URL ?? "",
  ).trim();
  const contentDatabaseUrl = String(
    environment.CONTENT_DATABASE_URL ?? "",
  ).trim();
  if (!businessDatabaseUrl) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");
  if (!contentDatabaseUrl) throw new Error("CONTENT_DATABASE_URL_REQUIRED");

  const apply = argv.includes("--apply");
  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const businessPool = resolvedMysqlClient.createPool(businessDatabaseUrl);
  const contentPool = resolvedMysqlClient.createPool(contentDatabaseUrl);

  try {
    if (apply) {
      const applyContentSchema =
        contentSchemaApplier ?? (await contentSchemaLoader());
      await applyContentSchema(contentPool);
    }

    return await executeLegacyCommercialMediaBackfill({
      businessPool,
      contentPool,
      manifest: manifest ?? (await loadManifest()),
      apply,
    });
  } finally {
    await Promise.allSettled([businessPool.end(), contentPool.end()]);
  }
}

async function runCli() {
  const apply = process.argv.slice(2).includes("--apply");
  const summary = await runLegacyCommercialMediaBackfill();
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-MEDIA-BACKFILL",
      mode: apply ? "apply" : "dry-run",
      ...summary,
    })}\n`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("LEGACY_COMMERCIAL_MEDIA_BACKFILL_FAILED\n");
    process.exitCode = 1;
  });
}
