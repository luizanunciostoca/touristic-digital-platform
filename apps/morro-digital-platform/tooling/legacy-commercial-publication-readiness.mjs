import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assessLegacyCommercialPublicationReadiness } from "./legacy-commercial-publication-readiness-core.mjs";

const STAGING_SERVICE = "morro-digital-v2-staging";

async function loadMysqlClient() {
  const module = await import("mysql2/promise");
  return module.default ?? module;
}

export async function runLegacyCommercialPublicationReadinessAudit({
  environment = process.env,
  mysqlClient,
  mysqlClientLoader = loadMysqlClient,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("LEGACY_PUBLICATION_READINESS_SERVICE_DENIED");
  }

  const businessDatabaseUrl = String(
    environment.BUSINESS_DATABASE_URL ?? "",
  ).trim();
  const contentDatabaseUrl = String(
    environment.CONTENT_DATABASE_URL ?? "",
  ).trim();
  if (!businessDatabaseUrl) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");
  if (!contentDatabaseUrl) throw new Error("CONTENT_DATABASE_URL_REQUIRED");

  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const businessPool = resolvedMysqlClient.createPool(businessDatabaseUrl);
  const contentPool = resolvedMysqlClient.createPool(contentDatabaseUrl);

  try {
    const [businessRows] = await businessPool.execute(
      `SELECT m.source_system, m.source_key, m.business_id, m.place_id,
              m.destination_id, m.category_id,
              p.publication_state, p.published_revision,
              p.editable_revision_json
         FROM business_place_legacy_mappings m
         INNER JOIN business_places p ON p.place_id = m.place_id
        WHERE m.source_system = ?
        ORDER BY m.source_key ASC`,
      ["morro-v1-search-catalog"],
    );

    const [mediaMarkers] = await contentPool.execute(
      `SELECT source_system, source_key, business_id, place_id,
              disposition, asset_count
         FROM legacy_place_media_migrations
        WHERE source_system = ?
        ORDER BY source_key ASC`,
      ["morro-v1-search-catalog"],
    );

    return assessLegacyCommercialPublicationReadiness(
      businessRows,
      mediaMarkers,
    );
  } finally {
    await Promise.allSettled([businessPool.end(), contentPool.end()]);
  }
}

async function runCli() {
  const summary = await runLegacyCommercialPublicationReadinessAudit();
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-PUBLICATION-READINESS",
      status: "pass",
      ...summary,
    })}\n`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("LEGACY_COMMERCIAL_PUBLICATION_READINESS_FAILED\n");
    process.exitCode = 1;
  });
}
