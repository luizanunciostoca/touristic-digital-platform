import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STAGING_SERVICE = "morro-digital-v2-staging";
const SOURCE_SYSTEM = "morro-v1-search-catalog";
const EXPECTED_TOTAL = 72;

async function loadMysqlClient() {
  const module = await import("mysql2/promise");
  return module.default ?? module;
}

async function loadPlacePlatformRuntime() {
  const moduleUrl = new URL("./place-platform-runtime.mjs", import.meta.url).href;
  const module = await import(/* @vite-ignore */ moduleUrl);
  return module.createPlacePlatformRuntime;
}

function actor() {
  const now = Math.floor(Date.now() / 1000);
  return Object.freeze({
    subject: "staging-legacy-commercial-review-transition",
    email: "staging-legacy-commercial-review-transition@example.invalid",
    role: "PLATFORM_OWNER",
    businessIds: Object.freeze([]),
    issuedAt: now - 60,
    expiresAt: now + 3600,
    sessionId: "staging-legacy-commercial-review-transition",
  });
}

async function queryRows(pool) {
  const [rows] = await pool.execute(
    `SELECT m.source_system, m.source_key, m.business_id, m.place_id,
            m.destination_id, m.category_id,
            p.publication_state, p.editable_revision, p.published_revision
       FROM business_place_legacy_mappings m
       INNER JOIN business_places p ON p.place_id = m.place_id
      WHERE m.source_system = ?
      ORDER BY m.source_key ASC`,
    [SOURCE_SYSTEM],
  );
  return rows;
}

function validateScope(rows) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_REVIEW_TRANSITION_ROW_COUNT_INVALID");
  }
  const sourceKeys = new Set();
  const businesses = new Set();
  const places = new Set();
  for (const row of rows) {
    const sourceKey = String(row.source_key ?? "");
    const businessId = String(row.business_id ?? "");
    const placeId = String(row.place_id ?? "");
    const revision = Number(row.editable_revision);
    if (
      String(row.source_system) !== SOURCE_SYSTEM ||
      String(row.destination_id) !== "morro-de-sao-paulo"
    ) {
      throw new Error("LEGACY_REVIEW_TRANSITION_SCOPE_DRIFT");
    }
    if (
      !sourceKey ||
      !businessId ||
      !placeId ||
      sourceKeys.has(sourceKey) ||
      businesses.has(businessId) ||
      places.has(placeId)
    ) {
      throw new Error("LEGACY_REVIEW_TRANSITION_IDENTITY_INVALID");
    }
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new Error("LEGACY_REVIEW_TRANSITION_REVISION_INVALID");
    }
    if (row.published_revision != null) {
      throw new Error("LEGACY_REVIEW_TRANSITION_PUBLISHED_REVISION_DENIED");
    }
    if (!["draft", "review"].includes(String(row.publication_state))) {
      throw new Error("LEGACY_REVIEW_TRANSITION_STATE_INVALID");
    }
    sourceKeys.add(sourceKey);
    businesses.add(businessId);
    places.add(placeId);
  }
}

async function applyMarkerSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legacy_place_review_migrations (
      source_system VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      source_key VARCHAR(320) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      editable_revision INT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (source_system, source_key),
      UNIQUE KEY uq_legacy_place_review_migration_place (place_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function loadMarkers(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT source_system, source_key, business_id, place_id, editable_revision
         FROM legacy_place_review_migrations
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
    String(marker.source_system) !== SOURCE_SYSTEM ||
    String(marker.source_key) !== String(row.source_key) ||
    String(marker.business_id) !== String(row.business_id) ||
    String(marker.place_id) !== String(row.place_id) ||
    Number(marker.editable_revision) !== Number(row.editable_revision)
  ) {
    throw new Error("LEGACY_REVIEW_TRANSITION_MARKER_DRIFT");
  }
}

async function insertMarker(pool, row) {
  await pool.execute(
    `INSERT INTO legacy_place_review_migrations
      (source_system, source_key, business_id, place_id, editable_revision, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [
      SOURCE_SYSTEM,
      String(row.source_key),
      String(row.business_id),
      String(row.place_id),
      Number(row.editable_revision),
    ],
  );
}

function summarize(rows, markers) {
  const markerByKey = new Map(markers.map((marker) => [String(marker.source_key), marker]));
  let wouldReview = 0;
  let existingReview = 0;
  for (const row of rows) {
    const marker = markerByKey.get(String(row.source_key));
    if (marker) validateMarker(marker, row);
    if (String(row.publication_state) === "draft") wouldReview += 1;
    else existingReview += 1;
  }
  return { total: rows.length, wouldReview, existingReview, existingMigrations: markers.length };
}

export async function runLegacyCommercialReviewTransition({
  environment = process.env,
  argv = process.argv.slice(2),
  mysqlClient,
  mysqlClientLoader = loadMysqlClient,
  runtimeFactory,
  runtimeLoader = loadPlacePlatformRuntime,
} = {}) {
  if (String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE) {
    throw new Error("LEGACY_REVIEW_TRANSITION_SERVICE_DENIED");
  }
  const databaseUrl = String(environment.BUSINESS_DATABASE_URL ?? "").trim();
  const contentDatabaseUrl = String(environment.CONTENT_DATABASE_URL ?? "").trim();
  if (!databaseUrl) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");
  if (!contentDatabaseUrl) throw new Error("CONTENT_DATABASE_URL_REQUIRED");

  const apply = argv.includes("--apply");
  const verify = argv.includes("--verify");
  if (apply && verify) throw new Error("LEGACY_REVIEW_TRANSITION_MODE_INVALID");

  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const pool = resolvedMysqlClient.createPool(databaseUrl);
  let runtime = null;
  try {
    const rows = await queryRows(pool);
    validateScope(rows);

    if (!apply && !verify) {
      return Object.freeze({ ...summarize(rows, []), reviewed: 0, markersInserted: 0 });
    }

    if (apply) await applyMarkerSchema(pool);
    const markers = await loadMarkers(pool);
    if (verify && markers.length !== EXPECTED_TOTAL) {
      throw new Error("LEGACY_REVIEW_TRANSITION_MARKER_COUNT_INVALID");
    }
    const markerByKey = new Map(markers.map((marker) => [String(marker.source_key), marker]));

    if (apply && rows.some((row) => String(row.publication_state) === "draft")) {
      const createRuntime = runtimeFactory ?? (await runtimeLoader());
      runtime = createRuntime({
        getEnvironmentValue: (key) => {
          if (key === "BUSINESS_DATABASE_URL") return databaseUrl;
          if (key === "CONTENT_DATABASE_URL") return contentDatabaseUrl;
          return String(environment[key] ?? "");
        },
        platformOperations: { emit() {} },
      });
      if (!(await runtime.start())) throw new Error("LEGACY_REVIEW_TRANSITION_RUNTIME_START_FAILED");
    }

    let reviewed = 0;
    let markersInserted = 0;
    const session = actor();

    for (const row of rows) {
      const key = String(row.source_key);
      let marker = markerByKey.get(key);
      const state = String(row.publication_state);

      if (marker) {
        validateMarker(marker, row);
      } else if (verify) {
        throw new Error("LEGACY_REVIEW_TRANSITION_MARKER_MISSING");
      } else if (state === "review") {
        throw new Error("LEGACY_REVIEW_TRANSITION_UNOWNED_REVIEW_STATE");
      } else {
        await insertMarker(pool, row);
        markersInserted += 1;
        marker = {
          source_system: SOURCE_SYSTEM,
          source_key: key,
          business_id: row.business_id,
          place_id: row.place_id,
          editable_revision: row.editable_revision,
        };
        markerByKey.set(key, marker);
      }

      if (state === "draft") {
        if (!runtime) throw new Error("LEGACY_REVIEW_TRANSITION_RUNTIME_UNAVAILABLE");
        await runtime.transitionPublication(
          session,
          String(row.business_id),
          "review",
          Number(row.editable_revision),
        );
        reviewed += 1;
      }
    }

    const finalRows = await queryRows(pool);
    validateScope(finalRows);
    const finalMarkers = await loadMarkers(pool);
    const final = summarize(finalRows, finalMarkers);

    if (apply && final.wouldReview !== 0) {
      throw new Error("LEGACY_REVIEW_TRANSITION_APPLY_INCOMPLETE");
    }
    if (verify && (final.wouldReview !== 0 || final.existingReview !== EXPECTED_TOTAL)) {
      throw new Error("LEGACY_REVIEW_TRANSITION_VERIFY_INCOMPLETE");
    }

    return Object.freeze({ ...final, reviewed, markersInserted });
  } finally {
    await Promise.allSettled([runtime?.stop?.() ?? Promise.resolve(), pool.end()]);
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const mode = args.includes("--apply") ? "apply" : args.includes("--verify") ? "verify" : "dry-run";
  const summary = await runLegacyCommercialReviewTransition({ argv: args });
  process.stdout.write(`${JSON.stringify({
    contract: "MORRO-STAGING-LEGACY-COMMERCIAL-REVIEW-TRANSITION",
    mode,
    ...summary,
  })}\n`);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("LEGACY_COMMERCIAL_REVIEW_TRANSITION_FAILED\n");
    process.exitCode = 1;
  });
}
