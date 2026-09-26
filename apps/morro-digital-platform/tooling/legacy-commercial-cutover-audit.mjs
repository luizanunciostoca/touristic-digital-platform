import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assessLegacyCommercialCutover } from "./legacy-commercial-cutover-audit-core.mjs";

const STAGING_SERVICE = "morro-digital-v2-staging";
const SOURCE_SYSTEM = "morro-v1-search-catalog";

async function loadMysqlClient() {
  const module = await import("mysql2/promise");
  return module.default ?? module;
}

export async function runLegacyCommercialCutoverAudit({
  environment = process.env,
  mysqlClient,
  mysqlClientLoader = loadMysqlClient,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("LEGACY_CUTOVER_AUDIT_SERVICE_DENIED");
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
    const [rows] = await businessPool.execute(
      `SELECT
         m.source_system, m.source_key, m.business_id, m.place_id,
         m.destination_id, m.category_id,
         p.publication_state, p.editable_revision, p.published_revision,
         p.published_revision_id, p.published_place_json,
         p.published_revision_json, p.published_latitude,
         p.published_longitude,
         r.source_key AS review_marker_source_key,
         r.business_id AS review_marker_business_id,
         r.place_id AS review_marker_place_id,
         r.editable_revision AS review_marker_revision,
         d.source_key AS description_marker_source_key,
         d.business_id AS description_marker_business_id,
         d.place_id AS description_marker_place_id,
         d.source_kind AS description_source_kind,
         c.business_id AS catalog_snapshot_business_id,
         c.place_revision AS catalog_snapshot_revision,
         c.catalog_json AS catalog_snapshot_json,
         s.business_id AS media_snapshot_business_id,
         s.place_revision AS media_snapshot_revision,
         s.media_json AS media_snapshot_json
       FROM business_place_legacy_mappings m
       INNER JOIN business_places p ON p.place_id = m.place_id
       LEFT JOIN legacy_place_review_migrations r
         ON r.source_system = m.source_system AND r.source_key = m.source_key
       LEFT JOIN legacy_place_description_migrations d
         ON d.source_system = m.source_system AND d.source_key = m.source_key
       LEFT JOIN catalog_public_snapshots c
         ON c.place_id = p.place_id
        AND c.place_revision = p.published_revision
       LEFT JOIN place_media_public_snapshots s
         ON s.place_id = p.place_id
        AND s.place_revision = p.published_revision
       WHERE m.source_system = ?
       ORDER BY m.source_key ASC`,
      [SOURCE_SYSTEM],
    );

    const [mediaRows] = await contentPool.execute(
      `SELECT
         lm.source_system, lm.source_key, lm.business_id, lm.place_id,
         lm.disposition, lm.asset_count,
         COALESCE(material.link_count, 0) AS link_count,
         COALESCE(material.published_asset_count, 0) AS published_asset_count
       FROM legacy_place_media_migrations lm
       LEFT JOIN (
         SELECT pm.place_id,
                COUNT(*) AS link_count,
                SUM(CASE WHEN ma.publication_state = 'published' THEN 1 ELSE 0 END)
                  AS published_asset_count
           FROM place_media pm
           INNER JOIN media_assets ma ON ma.id = pm.media_id
          GROUP BY pm.place_id
       ) material ON material.place_id = lm.place_id
       WHERE lm.source_system = ?
       ORDER BY lm.source_key ASC`,
      [SOURCE_SYSTEM],
    );

    return assessLegacyCommercialCutover(rows, mediaRows);
  } finally {
    await Promise.allSettled([businessPool.end(), contentPool.end()]);
  }
}

async function runCli() {
  const summary = await runLegacyCommercialCutoverAudit();
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-CUTOVER-AUDIT",
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
    process.stderr.write("LEGACY_COMMERCIAL_CUTOVER_AUDIT_FAILED\\n");
    process.exitCode = 1;
  });
}
