import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STAGING_SERVICE = "morro-digital-v2-staging";
const SOURCE_SYSTEM = "morro-v1-search-catalog";
const SOURCE_KEY = "nightlife:toca-do-morcego:-13.3766787:-38.9172057";
const BUSINESS_ID = "toca-do-morcego";
const PLACE_ID = "place-toca-do-morcego";

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
    subject: "staging-legacy-commercial-publication-canary",
    email: "staging-legacy-commercial-publication-canary@example.invalid",
    role: "PLATFORM_OWNER",
    businessIds: Object.freeze([]),
    issuedAt: now - 60,
    expiresAt: now + 3600,
    sessionId: "staging-legacy-commercial-publication-canary",
  });
}

async function queryRow(pool) {
  const [rows] = await pool.execute(
    `SELECT m.source_system, m.source_key, m.business_id, m.place_id,
            m.destination_id,
            p.publication_state, p.editable_revision, p.published_revision,
            r.editable_revision AS review_marker_revision
       FROM business_place_legacy_mappings m
       INNER JOIN business_places p ON p.place_id = m.place_id
       INNER JOIN legacy_place_review_migrations r
         ON r.source_system = m.source_system AND r.source_key = m.source_key
      WHERE m.source_system = ? AND m.source_key = ?
      LIMIT 2`,
    [SOURCE_SYSTEM, SOURCE_KEY],
  );
  if (rows.length !== 1) {
    throw new Error("LEGACY_PUBLICATION_CANARY_IDENTITY_COUNT_INVALID");
  }
  return rows[0];
}

function validateRow(row) {
  if (
    String(row.source_system) !== SOURCE_SYSTEM ||
    String(row.source_key) !== SOURCE_KEY ||
    String(row.business_id) !== BUSINESS_ID ||
    String(row.place_id) !== PLACE_ID ||
    String(row.destination_id) !== "morro-de-sao-paulo"
  ) {
    throw new Error("LEGACY_PUBLICATION_CANARY_IDENTITY_DRIFT");
  }
  const editableRevision = Number(row.editable_revision);
  const reviewRevision = Number(row.review_marker_revision);
  if (
    !Number.isSafeInteger(editableRevision) ||
    editableRevision < 1 ||
    reviewRevision !== editableRevision
  ) {
    throw new Error("LEGACY_PUBLICATION_CANARY_REVIEW_REVISION_DRIFT");
  }
  const state = String(row.publication_state);
  const publishedRevision =
    row.published_revision == null ? null : Number(row.published_revision);
  if (state === "review" && publishedRevision == null) {
    return { state, editableRevision, publishedRevision };
  }
  if (
    state === "published" &&
    publishedRevision === editableRevision
  ) {
    return { state, editableRevision, publishedRevision };
  }
  throw new Error("LEGACY_PUBLICATION_CANARY_STATE_INVALID");
}

async function applyMarkerSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legacy_place_publication_migrations (
      source_system VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      source_key VARCHAR(320) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      editable_revision INT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (source_system, source_key),
      UNIQUE KEY uq_legacy_place_publication_migration_place (place_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function loadMarker(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT source_system, source_key, business_id, place_id, editable_revision
         FROM legacy_place_publication_migrations
        WHERE source_system = ? AND source_key = ?
        LIMIT 2`,
      [SOURCE_SYSTEM, SOURCE_KEY],
    );
    if (rows.length > 1) {
      throw new Error("LEGACY_PUBLICATION_CANARY_MARKER_COUNT_INVALID");
    }
    return rows[0] ?? null;
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") return null;
    throw error;
  }
}

function validateMarker(marker, row) {
  if (
    String(marker.source_system) !== SOURCE_SYSTEM ||
    String(marker.source_key) !== SOURCE_KEY ||
    String(marker.business_id) !== BUSINESS_ID ||
    String(marker.place_id) !== PLACE_ID ||
    Number(marker.editable_revision) !== Number(row.editable_revision)
  ) {
    throw new Error("LEGACY_PUBLICATION_CANARY_MARKER_DRIFT");
  }
}

async function insertMarker(pool, row) {
  await pool.execute(
    `INSERT INTO legacy_place_publication_migrations
      (source_system, source_key, business_id, place_id, editable_revision, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [
      SOURCE_SYSTEM,
      SOURCE_KEY,
      BUSINESS_ID,
      PLACE_ID,
      Number(row.editable_revision),
    ],
  );
}

export async function runLegacyCommercialPublicationCanary({
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
    throw new Error("LEGACY_PUBLICATION_CANARY_SERVICE_DENIED");
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
  if (apply && verify) throw new Error("LEGACY_PUBLICATION_CANARY_MODE_INVALID");

  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const pool = resolvedMysqlClient.createPool(businessDatabaseUrl);
  let runtime = null;
  try {
    let row = await queryRow(pool);
    let state = validateRow(row);

    if (!apply && !verify) {
      return Object.freeze({
        canary: PLACE_ID,
        wouldPublish: state.state === "review" ? 1 : 0,
        existingPublished: state.state === "published" ? 1 : 0,
        published: 0,
        markersInserted: 0,
      });
    }

    if (apply) await applyMarkerSchema(pool);
    let marker = await loadMarker(pool);

    if (marker) {
      validateMarker(marker, row);
    } else if (verify) {
      throw new Error("LEGACY_PUBLICATION_CANARY_MARKER_MISSING");
    } else if (state.state === "published") {
      throw new Error("LEGACY_PUBLICATION_CANARY_UNOWNED_PUBLISHED_STATE");
    } else {
      await insertMarker(pool, row);
      marker = {
        source_system: SOURCE_SYSTEM,
        source_key: SOURCE_KEY,
        business_id: BUSINESS_ID,
        place_id: PLACE_ID,
        editable_revision: row.editable_revision,
      };
    }

    let published = 0;
    let markersInserted = marker && state.state === "review" && apply ? 1 : 0;

    if (apply && state.state === "review") {
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
        throw new Error("LEGACY_PUBLICATION_CANARY_RUNTIME_START_FAILED");
      }
      await runtime.transitionPublication(
        actor(),
        BUSINESS_ID,
        "publish",
        Number(row.editable_revision),
      );
      published = 1;
    }

    row = await queryRow(pool);
    state = validateRow(row);
    marker = await loadMarker(pool);
    if (!marker) throw new Error("LEGACY_PUBLICATION_CANARY_MARKER_MISSING");
    validateMarker(marker, row);

    if (state.state !== "published") {
      throw new Error("LEGACY_PUBLICATION_CANARY_INCOMPLETE");
    }

    return Object.freeze({
      canary: PLACE_ID,
      wouldPublish: 0,
      existingPublished: 1,
      published,
      markersInserted,
      publishedRevision: state.publishedRevision,
    });
  } finally {
    await Promise.allSettled([
      runtime?.stop?.() ?? Promise.resolve(),
      pool.end(),
    ]);
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const mode = args.includes("--apply")
    ? "apply"
    : args.includes("--verify")
      ? "verify"
      : "dry-run";
  const summary = await runLegacyCommercialPublicationCanary({ argv: args });
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-PUBLICATION-CANARY",
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
    process.stderr.write("LEGACY_COMMERCIAL_PUBLICATION_CANARY_FAILED\n");
    process.exitCode = 1;
  });
}
