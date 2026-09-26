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

async function loadPlacePlatformRuntime() {
  const moduleUrl = new URL("./place-platform-runtime.mjs", import.meta.url)
    .href;
  const module = await import(/* @vite-ignore */ moduleUrl);
  return module.createPlacePlatformRuntime;
}

function actor() {
  const now = Math.floor(Date.now() / 1000);
  return Object.freeze({
    subject: "staging-legacy-commercial-publication-transition",
    email: "staging-legacy-commercial-publication-transition@example.invalid",
    role: "PLATFORM_OWNER",
    businessIds: Object.freeze([]),
    issuedAt: now - 60,
    expiresAt: now + 3600,
    sessionId: "staging-legacy-commercial-publication-transition",
  });
}

async function queryRows(pool) {
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
  return rows;
}

function text(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function validateScope(rows) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_PUBLICATION_TRANSITION_ROW_COUNT_INVALID");
  }

  const sourceKeys = new Set();
  const businesses = new Set();
  const places = new Set();
  for (const row of rows) {
    const sourceKey = text(row.source_key);
    const businessId = text(row.business_id);
    const placeId = text(row.place_id);
    const editableRevision = Number(row.editable_revision);
    const publishedRevision =
      row.published_revision == null ? null : Number(row.published_revision);
    const state = text(row.publication_state);

    if (
      text(row.source_system) !== SOURCE_SYSTEM ||
      text(row.destination_id) !== DESTINATION_ID
    ) {
      throw new Error("LEGACY_PUBLICATION_TRANSITION_SCOPE_DRIFT");
    }
    if (
      !sourceKey ||
      !businessId ||
      !placeId ||
      sourceKeys.has(sourceKey) ||
      businesses.has(businessId) ||
      places.has(placeId)
    ) {
      throw new Error("LEGACY_PUBLICATION_TRANSITION_IDENTITY_INVALID");
    }
    if (!Number.isSafeInteger(editableRevision) || editableRevision < 1) {
      throw new Error("LEGACY_PUBLICATION_TRANSITION_REVISION_INVALID");
    }
    if (
      publishedRevision != null &&
      (!Number.isSafeInteger(publishedRevision) ||
        publishedRevision < 1 ||
        publishedRevision > editableRevision)
    ) {
      throw new Error(
        "LEGACY_PUBLICATION_TRANSITION_PUBLISHED_REVISION_INVALID",
      );
    }
    if (!["review", "published", "suspended", "archived"].includes(state)) {
      throw new Error("LEGACY_PUBLICATION_TRANSITION_STATE_INVALID");
    }

    const reviewRevision = Number(row.review_marker_revision);
    if (
      text(row.review_marker_source_key) !== sourceKey ||
      text(row.review_marker_business_id) !== businessId ||
      text(row.review_marker_place_id) !== placeId ||
      !Number.isSafeInteger(reviewRevision) ||
      reviewRevision < 1 ||
      reviewRevision > editableRevision
    ) {
      throw new Error("LEGACY_PUBLICATION_TRANSITION_REVIEW_MARKER_DRIFT");
    }

    sourceKeys.add(sourceKey);
    businesses.add(businessId);
    places.add(placeId);
  }
}

async function applyMarkerSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legacy_place_publication_migrations (
      source_system VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      source_key VARCHAR(320) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      published_revision INT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (source_system, source_key),
      UNIQUE KEY uq_legacy_place_publication_migration_place (place_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function loadMarkers(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT
         source_system, source_key, business_id, place_id, published_revision
       FROM legacy_place_publication_migrations
       WHERE source_system = ?
       ORDER BY source_key ASC`,
      [SOURCE_SYSTEM],
    );
    return rows;
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

function validateMarker(marker, row) {
  if (
    text(marker.source_system) !== SOURCE_SYSTEM ||
    text(marker.source_key) !== text(row.source_key) ||
    text(marker.business_id) !== text(row.business_id) ||
    text(marker.place_id) !== text(row.place_id) ||
    !Number.isSafeInteger(Number(marker.published_revision)) ||
    Number(marker.published_revision) < 1
  ) {
    throw new Error("LEGACY_PUBLICATION_TRANSITION_MARKER_DRIFT");
  }

  const markerRevision = Number(marker.published_revision);
  const state = text(row.publication_state);
  const publishedRevision =
    row.published_revision == null ? null : Number(row.published_revision);

  if (publishedRevision != null && publishedRevision !== markerRevision) {
    throw new Error("LEGACY_PUBLICATION_TRANSITION_MARKER_REVISION_DRIFT");
  }
  if (
    publishedRevision == null &&
    (state !== "review" || Number(row.editable_revision) !== markerRevision)
  ) {
    throw new Error("LEGACY_PUBLICATION_TRANSITION_RECOVERY_REVISION_DRIFT");
  }
}

async function insertMarker(pool, row) {
  await pool.execute(
    `INSERT INTO legacy_place_publication_migrations
      (source_system, source_key, business_id, place_id, published_revision, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [
      SOURCE_SYSTEM,
      text(row.source_key),
      text(row.business_id),
      text(row.place_id),
      Number(row.editable_revision),
    ],
  );
}

function summarize(rows, markers) {
  const markerByKey = new Map(
    markers.map((marker) => [text(marker.source_key), marker]),
  );
  let wouldPublish = 0;
  let migratedPublicationCount = 0;
  const publicationStateCounts = {};

  for (const row of rows) {
    const state = text(row.publication_state);
    const marker = markerByKey.get(text(row.source_key));
    if (marker) {
      validateMarker(marker, row);
      if (row.published_revision != null) migratedPublicationCount += 1;
    }
    if (!marker && state === "review" && row.published_revision == null) {
      wouldPublish += 1;
    }
    publicationStateCounts[state] = (publicationStateCounts[state] ?? 0) + 1;
  }

  return Object.freeze({
    total: rows.length,
    wouldPublish,
    migratedPublicationCount,
    existingMigrations: markers.length,
    publicationStateCounts: Object.freeze(publicationStateCounts),
  });
}

export async function runLegacyCommercialPublicationTransition({
  environment = process.env,
  argv = process.argv.slice(2),
  mysqlClient,
  mysqlClientLoader = loadMysqlClient,
  runtimeFactory,
  runtimeLoader = loadPlacePlatformRuntime,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("LEGACY_PUBLICATION_TRANSITION_SERVICE_DENIED");
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
  const verify = argv.includes("--verify");
  if (apply === verify) {
    throw new Error("LEGACY_PUBLICATION_TRANSITION_MODE_INVALID");
  }

  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const pool = resolvedMysqlClient.createPool(businessDatabaseUrl);
  let runtime = null;

  try {
    const rows = await queryRows(pool);
    validateScope(rows);

    if (apply) await applyMarkerSchema(pool);
    const markers = await loadMarkers(pool);
    if (verify && markers.length !== EXPECTED_TOTAL) {
      throw new Error("LEGACY_PUBLICATION_TRANSITION_MARKER_COUNT_INVALID");
    }

    const markerByKey = new Map(
      markers.map((marker) => [text(marker.source_key), marker]),
    );

    const needsRuntime =
      apply &&
      rows.some((row) => {
        const marker = markerByKey.get(text(row.source_key));
        return (
          text(row.publication_state) === "review" &&
          row.published_revision == null &&
          (!marker ||
            Number(marker.published_revision) === Number(row.editable_revision))
        );
      });

    if (needsRuntime) {
      const createRuntime = runtimeFactory ?? (await runtimeLoader());
      runtime = createRuntime({
        getEnvironmentValue: (key) => {
          if (key === "BUSINESS_DATABASE_URL") return businessDatabaseUrl;
          if (key === "CONTENT_DATABASE_URL") return contentDatabaseUrl;
          return String(environment[key] ?? "");
        },
        platformOperations: { emit() {} },
      });
      if (!(await runtime.start())) {
        throw new Error("LEGACY_PUBLICATION_TRANSITION_RUNTIME_START_FAILED");
      }
    }

    let published = 0;
    let markersInserted = 0;
    const session = actor();

    for (const row of rows) {
      const key = text(row.source_key);
      const state = text(row.publication_state);
      let marker = markerByKey.get(key);

      if (marker) {
        validateMarker(marker, row);
      } else if (verify) {
        throw new Error("LEGACY_PUBLICATION_TRANSITION_MARKER_MISSING");
      } else if (state !== "review" || row.published_revision != null) {
        throw new Error("LEGACY_PUBLICATION_TRANSITION_UNOWNED_STATE");
      } else if (
        Number(row.review_marker_revision) !== Number(row.editable_revision)
      ) {
        throw new Error("LEGACY_PUBLICATION_TRANSITION_REVIEW_REVISION_DRIFT");
      } else {
        await insertMarker(pool, row);
        markersInserted += 1;
        marker = {
          source_system: SOURCE_SYSTEM,
          source_key: key,
          business_id: row.business_id,
          place_id: row.place_id,
          published_revision: row.editable_revision,
        };
        markerByKey.set(key, marker);
      }

      if (state === "review" && row.published_revision == null) {
        if (!runtime) {
          throw new Error("LEGACY_PUBLICATION_TRANSITION_RUNTIME_UNAVAILABLE");
        }
        await runtime.transitionPublication(
          session,
          text(row.business_id),
          "publish",
          Number(marker.published_revision),
        );
        published += 1;
      }
    }

    const finalRows = await queryRows(pool);
    validateScope(finalRows);
    const finalMarkers = await loadMarkers(pool);
    const final = summarize(finalRows, finalMarkers);

    if (
      apply &&
      (final.wouldPublish !== 0 ||
        final.migratedPublicationCount !== EXPECTED_TOTAL ||
        final.existingMigrations !== EXPECTED_TOTAL)
    ) {
      throw new Error("LEGACY_PUBLICATION_TRANSITION_APPLY_INCOMPLETE");
    }
    if (
      verify &&
      (final.migratedPublicationCount !== EXPECTED_TOTAL ||
        final.existingMigrations !== EXPECTED_TOTAL)
    ) {
      throw new Error("LEGACY_PUBLICATION_TRANSITION_VERIFY_INCOMPLETE");
    }

    return Object.freeze({ ...final, published, markersInserted });
  } finally {
    await Promise.allSettled([
      runtime?.stop?.() ?? Promise.resolve(),
      pool.end(),
    ]);
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const mode = args.includes("--apply") ? "apply" : "verify";
  const summary = await runLegacyCommercialPublicationTransition({ argv: args });
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-PUBLICATION-TRANSITION",
      mode,
      ...summary,
    })}\n`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("LEGACY_COMMERCIAL_PUBLICATION_TRANSITION_FAILED\\n");
    process.exitCode = 1;
  });
}
