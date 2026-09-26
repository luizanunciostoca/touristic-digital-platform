import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assessLegacyCommercialDescriptionBackfill } from "./legacy-commercial-description-backfill-core.mjs";

const STAGING_SERVICE = "morro-digital-v2-staging";

async function loadMysqlClient() {
  const module = await import("mysql2/promise");
  return module.default ?? module;
}

export async function runLegacyCommercialDescriptionBackfill({
  environment = process.env,
  mysqlClient,
  mysqlClientLoader = loadMysqlClient,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("LEGACY_DESCRIPTION_BACKFILL_SERVICE_DENIED");
  }
  const databaseUrl = String(environment.BUSINESS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");

  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const pool = resolvedMysqlClient.createPool(databaseUrl);
  try {
    const [rows] = await pool.execute(
      `SELECT m.source_system, m.source_key, m.business_id, m.place_id,
              m.destination_id, m.category_id,
              p.publication_state, p.published_revision, p.editable_place_json
         FROM business_place_legacy_mappings m
         INNER JOIN business_places p ON p.place_id = m.place_id
        WHERE m.source_system = ?
        ORDER BY m.source_key ASC`,
      ["morro-v1-search-catalog"],
    );
    return assessLegacyCommercialDescriptionBackfill(rows);
  } finally {
    await pool.end();
  }
}

async function runCli() {
  const summary = await runLegacyCommercialDescriptionBackfill();
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-DESCRIPTION-BACKFILL",
      mode: "dry-run",
      ...summary,
    })}\n`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("LEGACY_COMMERCIAL_DESCRIPTION_BACKFILL_FAILED\n");
    process.exitCode = 1;
  });
}
