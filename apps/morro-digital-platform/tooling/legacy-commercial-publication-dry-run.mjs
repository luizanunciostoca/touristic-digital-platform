import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STAGING_SERVICE = "morro-digital-v2-staging";
const SOURCE_SYSTEM = "morro-v1-search-catalog";
const DESTINATION_ID = "morro-de-sao-paulo";
const EXPECTED_TOTAL = 72;

async function loadMysqlClient() {
  const module = await import("mysql2/promise");
  return module.default ?? module;
}

function text(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function assessLegacyCommercialPublicationDryRun(rows) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_PUBLICATION_DRY_RUN_ROW_COUNT_INVALID");
  }

  const sourceKeys = new Set();
  const businesses = new Set();
  const places = new Set();
  let wouldPublish = 0;

  for (const row of rows) {
    const sourceKey = text(row.source_key);
    const businessId = text(row.business_id);
    const placeId = text(row.place_id);
    const editableRevision = Number(row.editable_revision);
    const reviewRevision = Number(row.review_marker_revision);

    if (
      text(row.source_system) !== SOURCE_SYSTEM ||
      text(row.destination_id) !== DESTINATION_ID
    ) {
      throw new Error("LEGACY_PUBLICATION_DRY_RUN_SCOPE_DRIFT");
    }
    if (
      !sourceKey ||
      !businessId ||
      !placeId ||
      sourceKeys.has(sourceKey) ||
      businesses.has(businessId) ||
      places.has(placeId)
    ) {
      throw new Error("LEGACY_PUBLICATION_DRY_RUN_IDENTITY_INVALID");
    }
    if (
      text(row.publication_state) !== "review" ||
      row.published_revision != null
    ) {
      throw new Error("LEGACY_PUBLICATION_DRY_RUN_STATE_INVALID");
    }
    if (
      !Number.isSafeInteger(editableRevision) ||
      editableRevision < 1 ||
      !Number.isSafeInteger(reviewRevision) ||
      reviewRevision !== editableRevision
    ) {
      throw new Error("LEGACY_PUBLICATION_DRY_RUN_REVIEW_REVISION_DRIFT");
    }
    if (
      text(row.review_marker_source_key) !== sourceKey ||
      text(row.review_marker_business_id) !== businessId ||
      text(row.review_marker_place_id) !== placeId
    ) {
      throw new Error("LEGACY_PUBLICATION_DRY_RUN_REVIEW_MARKER_DRIFT");
    }

    sourceKeys.add(sourceKey);
    businesses.add(businessId);
    places.add(placeId);
    wouldPublish += 1;
  }

  return Object.freeze({
    total: EXPECTED_TOTAL,
    wouldPublish,
    existingPublished: 0,
    publicationStateCounts: Object.freeze({ review: EXPECTED_TOTAL }),
  });
}

export async function runLegacyCommercialPublicationDryRun({
  environment = process.env,
  mysqlClient,
  mysqlClientLoader = loadMysqlClient,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("LEGACY_PUBLICATION_DRY_RUN_SERVICE_DENIED");
  }
  const databaseUrl = String(environment.BUSINESS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");

  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const pool = resolvedMysqlClient.createPool(databaseUrl);
  try {
    const [rows] = await pool.execute(
      `SELECT
         m.source_system, m.source_key, m.business_id, m.place_id,
         m.destination_id,
         p.publication_state, p.editable_revision, p.published_revision,
         r.source_key AS review_marker_source_key,
         r.business_id AS review_marker_business_id,
         r.place_id AS review_marker_place_id,
         r.editable_revision AS review_marker_revision
       FROM business_place_legacy_mappings m
       INNER JOIN business_places p ON p.place_id = m.place_id
       LEFT JOIN legacy_place_review_migrations r
         ON r.source_system = m.source_system AND r.source_key = m.source_key
       WHERE m.source_system = ?
       ORDER BY m.source_key ASC`,
      [SOURCE_SYSTEM],
    );
    return assessLegacyCommercialPublicationDryRun(rows);
  } finally {
    await pool.end();
  }
}

async function runCli() {
  const summary = await runLegacyCommercialPublicationDryRun();
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-PUBLICATION-DRY-RUN",
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
    process.stderr.write("LEGACY_COMMERCIAL_PUBLICATION_DRY_RUN_FAILED\\n");
    process.exitCode = 1;
  });
}
