import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assessLegacyCommercialDescriptionBackfill,
  bootstrapLegacyCommercialDescription,
} from "./legacy-commercial-description-backfill-core.mjs";

const STAGING_SERVICE = "morro-digital-v2-staging";
const SOURCE_SYSTEM = "morro-v1-search-catalog";
const SOURCE_KIND = "derived-canonical-name-category-destination";

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

function parsePlace(row) {
  return row.editable_place_json && typeof row.editable_place_json === "object"
    ? row.editable_place_json
    : JSON.parse(String(row.editable_place_json ?? "null"));
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function actor() {
  return Object.freeze({
    subject: "staging-legacy-commercial-description-backfill",
    email: "staging-legacy-commercial-description-backfill@example.invalid",
    role: "PLATFORM_OWNER",
    businessIds: Object.freeze([]),
    issuedAt: Math.floor(Date.now() / 1000) - 60,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    sessionId: "staging-legacy-commercial-description-backfill",
  });
}

async function queryRows(pool) {
  const [rows] = await pool.execute(
    `SELECT m.source_system, m.source_key, m.business_id, m.place_id,
            m.destination_id, m.category_id,
            p.publication_state, p.published_revision, p.editable_place_json
       FROM business_place_legacy_mappings m
       INNER JOIN business_places p ON p.place_id = m.place_id
      WHERE m.source_system = ?
      ORDER BY m.source_key ASC`,
    [SOURCE_SYSTEM],
  );
  return rows;
}

async function applyMarkerSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legacy_place_description_migrations (
      source_system VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      source_key VARCHAR(320) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      source_kind VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      description_sha256 CHAR(64) COLLATE ascii_bin NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (source_system, source_key),
      UNIQUE KEY uq_legacy_place_description_migration_place (place_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function loadMarkers(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT source_system, source_key, business_id, place_id,
              source_kind, description_sha256
         FROM legacy_place_description_migrations
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

function validateMarker(marker, row, target) {
  if (
    String(marker.source_system) !== SOURCE_SYSTEM ||
    String(marker.source_key) !== String(row.source_key) ||
    String(marker.business_id) !== String(row.business_id) ||
    String(marker.place_id) !== String(row.place_id) ||
    String(marker.source_kind) !== SOURCE_KIND ||
    String(marker.description_sha256) !== digest(target)
  ) {
    throw new Error("LEGACY_DESCRIPTION_MIGRATION_MARKER_DRIFT");
  }
}

async function insertMarker(pool, row, target) {
  await pool.execute(
    `INSERT INTO legacy_place_description_migrations
      (source_system, source_key, business_id, place_id, source_kind,
       description_sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [
      SOURCE_SYSTEM,
      String(row.source_key),
      String(row.business_id),
      String(row.place_id),
      SOURCE_KIND,
      digest(target),
    ],
  );
}

export async function runLegacyCommercialDescriptionBackfill({
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
    throw new Error("LEGACY_DESCRIPTION_BACKFILL_SERVICE_DENIED");
  }
  const databaseUrl = String(environment.BUSINESS_DATABASE_URL ?? "").trim();
  const contentDatabaseUrl = String(
    environment.CONTENT_DATABASE_URL ?? "",
  ).trim();
  if (!databaseUrl) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");
  if (!contentDatabaseUrl) throw new Error("CONTENT_DATABASE_URL_REQUIRED");

  const apply = argv.includes("--apply");
  const verify = argv.includes("--verify");
  if (apply && verify) throw new Error("LEGACY_DESCRIPTION_MODE_INVALID");

  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const pool = resolvedMysqlClient.createPool(databaseUrl);
  let runtime = null;
  try {
    const rows = await queryRows(pool);
    const initial = assessLegacyCommercialDescriptionBackfill(rows);

    if (!apply && !verify) {
      return Object.freeze({
        ...initial,
        existingMigrations: 0,
        updated: 0,
        markersInserted: 0,
      });
    }

    if (apply) await applyMarkerSchema(pool);
    const markers = await loadMarkers(pool);
    const markerByKey = new Map(
      markers.map((marker) => [String(marker.source_key), marker]),
    );
    if (verify && markers.length !== 72) {
      throw new Error("LEGACY_DESCRIPTION_MIGRATION_MARKER_COUNT_INVALID");
    }

    if (apply && initial.wouldUpdate > 0) {
      const createRuntime = runtimeFactory ?? (await runtimeLoader());
      runtime = createRuntime({
        getEnvironmentValue: (key) => {
          if (key === "BUSINESS_DATABASE_URL") return databaseUrl;
          if (key === "CONTENT_DATABASE_URL") return contentDatabaseUrl;
          return String(environment[key] ?? "");
        },
        platformOperations: { emit() {} },
      });
      if (!(await runtime.start())) {
        throw new Error("LEGACY_DESCRIPTION_RUNTIME_START_FAILED");
      }
    }

    let updated = 0;
    let markersInserted = 0;
    let existingMigrations = 0;
    const session = actor();

    for (const row of rows) {
      const place = parsePlace(row);
      const target = bootstrapLegacyCommercialDescription({
        name: place?.name,
        categoryId: row.category_id,
        destinationId: row.destination_id,
      });
      const current = String(place?.description ?? "").trim();
      const marker = markerByKey.get(String(row.source_key));

      if (marker) {
        validateMarker(marker, row, target);
        existingMigrations += 1;
        if (!current) {
          throw new Error("LEGACY_DESCRIPTION_MIGRATION_DESCRIPTION_MISSING");
        }
        continue;
      }

      if (verify) {
        throw new Error("LEGACY_DESCRIPTION_MIGRATION_MARKER_MISSING");
      }

      if (current && current !== target) continue;

      if (!current) {
        if (!runtime) {
          throw new Error("LEGACY_DESCRIPTION_RUNTIME_UNAVAILABLE");
        }
        await runtime.updateProfile(session, String(row.business_id), {
          shortDescription: target,
          description: target,
        });
        updated += 1;
      }

      await insertMarker(pool, row, target);
      markersInserted += 1;
    }

    const finalRows = await queryRows(pool);
    const finalSummary = assessLegacyCommercialDescriptionBackfill(finalRows);
    if (apply && updated !== initial.wouldUpdate) {
      throw new Error("LEGACY_DESCRIPTION_APPLY_COUNT_MISMATCH");
    }
    if (verify && finalSummary.wouldUpdate !== 0) {
      throw new Error("LEGACY_DESCRIPTION_VERIFY_INCOMPLETE");
    }

    return Object.freeze({
      ...finalSummary,
      existingMigrations,
      updated,
      markersInserted,
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
  const summary = await runLegacyCommercialDescriptionBackfill({ argv: args });
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-DESCRIPTION-BACKFILL",
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
    process.stderr.write("LEGACY_COMMERCIAL_DESCRIPTION_BACKFILL_FAILED\n");
    process.exitCode = 1;
  });
}
