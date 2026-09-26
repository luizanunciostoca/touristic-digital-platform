import { createHash } from "node:crypto";

const SOURCE_SYSTEM = "morro-v1-search-catalog";
const DESTINATION_ID = "morro-de-sao-paulo";
const EXPECTED_ENTRIES = 72;
const EXPECTED_ASSETS = 18;

function digest(entry) {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

function assertManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length !== EXPECTED_ENTRIES) {
    throw new Error("LEGACY_MEDIA_MANIFEST_COUNT");
  }
  const sourceKeys = new Set();
  const placeIds = new Set();
  const mediaIds = new Set();
  let assets = 0;
  for (const entry of manifest) {
    if (
      entry.sourceSystem !== SOURCE_SYSTEM ||
      entry.destinationId !== DESTINATION_ID ||
      sourceKeys.has(entry.sourceKey) ||
      placeIds.has(entry.placeId)
    ) {
      throw new Error("LEGACY_MEDIA_MANIFEST_IDENTITY");
    }
    sourceKeys.add(entry.sourceKey);
    placeIds.add(entry.placeId);
    if (
      !["migrate", "intentional_no_image"].includes(entry.disposition) ||
      !Array.isArray(entry.assets)
    ) {
      throw new Error("LEGACY_MEDIA_MANIFEST_DISPOSITION");
    }
    if (
      (entry.disposition === "migrate" && entry.assets.length !== 3) ||
      (entry.disposition === "intentional_no_image" &&
        entry.assets.length !== 0)
    ) {
      throw new Error("LEGACY_MEDIA_MANIFEST_ASSET_SET");
    }
    for (const asset of entry.assets) {
      assets += 1;
      if (
        mediaIds.has(asset.mediaId) ||
        asset.provider !== "legacy-static" ||
        !String(asset.providerReference).startsWith("/images/fotos/") ||
        !["image/jpeg", "image/webp"].includes(asset.mimeType) ||
        asset.publicationState !== "published"
      ) {
        throw new Error("LEGACY_MEDIA_MANIFEST_ASSET_INVALID");
      }
      mediaIds.add(asset.mediaId);
    }
  }
  if (assets !== EXPECTED_ASSETS) {
    throw new Error("LEGACY_MEDIA_MANIFEST_ASSET_COUNT");
  }
}

async function canonicalIdentity(businessPool, entry) {
  const [rows] = await businessPool.execute(
    `SELECT m.business_id, m.place_id, m.destination_id, m.category_id,
            p.publication_state, p.published_revision
       FROM business_place_legacy_mappings m
       INNER JOIN business_places p ON p.place_id = m.place_id
      WHERE m.source_system = ? AND m.source_key = ?
      LIMIT 1`,
    [entry.sourceSystem, entry.sourceKey],
  );
  const row = rows[0];
  if (!row) throw new Error("LEGACY_MEDIA_CANONICAL_IDENTITY_MISSING");
  if (
    String(row.business_id) !== entry.businessId ||
    String(row.place_id) !== entry.placeId ||
    String(row.destination_id) !== entry.destinationId
  ) {
    throw new Error("LEGACY_MEDIA_CANONICAL_IDENTITY_CONFLICT");
  }
  const publicationState = String(row.publication_state ?? "");
  if (
    !["draft", "review", "published", "suspended", "archived"].includes(
      publicationState,
    )
  ) {
    throw new Error("LEGACY_MEDIA_PLACE_STATE_INVALID");
  }
  return Object.freeze({
    publicationState,
    publishedRevision:
      row.published_revision == null ? null : Number(row.published_revision),
  });
}

function missingTable(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error.code === "ER_NO_SUCH_TABLE" || error.errno === 1146),
  );
}

async function existingMigration(contentPool, entry) {
  try {
    const [rows] = await contentPool.execute(
      `SELECT business_id, place_id, disposition, asset_count, manifest_digest
         FROM legacy_place_media_migrations
        WHERE source_system = ? AND source_key = ?
        LIMIT 1`,
      [entry.sourceSystem, entry.sourceKey],
    );
    return rows[0] ?? null;
  } catch (error) {
    if (missingTable(error)) return null;
    throw error;
  }
}

async function placeLinkCount(contentPool, placeId) {
  try {
    const [rows] = await contentPool.execute(
      "SELECT COUNT(*) AS total FROM place_media WHERE place_id = ?",
      [placeId],
    );
    return Number(rows[0]?.total ?? 0);
  } catch (error) {
    if (missingTable(error)) return 0;
    throw error;
  }
}

async function assertAssetsAvailable(contentPool, entry) {
  for (const asset of entry.assets) {
    try {
      const [rows] = await contentPool.execute(
        `SELECT id, business_id, checksum_sha256
           FROM media_assets
          WHERE id = ? OR (business_id = ? AND checksum_sha256 = ?)
          LIMIT 1`,
        [asset.mediaId, entry.businessId, asset.checksumSha256],
      );
      if (rows[0]) throw new Error("LEGACY_MEDIA_EXISTING_ASSET_CONFLICT");
    } catch (error) {
      if (missingTable(error)) return;
      throw error;
    }
  }
}

function assertExistingMigration(row, entry) {
  if (
    String(row.business_id) !== entry.businessId ||
    String(row.place_id) !== entry.placeId ||
    String(row.disposition) !== entry.disposition ||
    Number(row.asset_count) !== entry.assets.length ||
    String(row.manifest_digest) !== digest(entry)
  ) {
    throw new Error("LEGACY_MEDIA_MIGRATION_DRIFT");
  }
}

async function assertExistingMediaMaterialized(contentPool, entry) {
  const linkCount = await placeLinkCount(contentPool, entry.placeId);
  if (linkCount !== entry.assets.length) {
    throw new Error("LEGACY_MEDIA_MIGRATION_MATERIAL_DRIFT");
  }
  if (entry.disposition !== "migrate") return;
  for (const asset of entry.assets) {
    const [rows] = await contentPool.execute(
      `SELECT pm.role, pm.sort_order,
              ma.business_id, ma.provider, ma.provider_reference,
              ma.mime_type, ma.width, ma.height, ma.byte_size,
              ma.checksum_sha256, ma.alt_text, ma.publication_state
         FROM place_media pm
         INNER JOIN media_assets ma ON ma.id = pm.media_id
        WHERE pm.place_id = ? AND pm.media_id = ?
        LIMIT 1`,
      [entry.placeId, asset.mediaId],
    );
    const row = rows[0];
    if (
      !row ||
      String(row.business_id) !== entry.businessId ||
      String(row.role) !== asset.role ||
      Number(row.sort_order) !== asset.sortOrder ||
      String(row.provider) !== asset.provider ||
      String(row.provider_reference) !== asset.providerReference ||
      String(row.mime_type) !== asset.mimeType ||
      Number(row.width) !== asset.width ||
      Number(row.height) !== asset.height ||
      Number(row.byte_size) !== asset.byteSize ||
      String(row.checksum_sha256) !== asset.checksumSha256 ||
      String(row.alt_text) !== asset.alt ||
      String(row.publication_state) !== asset.publicationState
    ) {
      throw new Error("LEGACY_MEDIA_MIGRATION_MATERIAL_DRIFT");
    }
  }
}

export async function applyLegacyMediaMigrationSchema(contentPool) {
  await contentPool.query(`
    CREATE TABLE IF NOT EXISTS legacy_place_media_migrations (
      source_system VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      source_key VARCHAR(320) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      disposition ENUM('migrate','intentional_no_image') NOT NULL,
      asset_count INT UNSIGNED NOT NULL,
      manifest_digest CHAR(64) COLLATE ascii_bin NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (source_system, source_key),
      UNIQUE KEY uq_legacy_place_media_migration_place (place_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function insertMarker(connection, entry, now) {
  await connection.execute(
    `INSERT INTO legacy_place_media_migrations
      (source_system, source_key, business_id, place_id, disposition,
       asset_count, manifest_digest, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.sourceSystem,
      entry.sourceKey,
      entry.businessId,
      entry.placeId,
      entry.disposition,
      entry.assets.length,
      digest(entry),
      now,
    ],
  );
}

async function applyEntry(contentPool, entry, now) {
  const connection = await contentPool.getConnection();
  try {
    await connection.beginTransaction();
    for (const asset of entry.assets) {
      await connection.execute(
        `INSERT INTO media_assets
          (id, business_id, type, provider, provider_reference, mime_type,
           width, height, byte_size, checksum_sha256, alt_text,
           publication_state, created_at, updated_at)
         VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          asset.mediaId,
          entry.businessId,
          asset.provider,
          asset.providerReference,
          asset.mimeType,
          asset.width,
          asset.height,
          asset.byteSize,
          asset.checksumSha256,
          asset.alt,
          asset.publicationState,
          now,
          now,
        ],
      );
      await connection.execute(
        `INSERT INTO place_media
          (place_id, media_id, role, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [entry.placeId, asset.mediaId, asset.role, asset.sortOrder, now, now],
      );
    }
    await insertMarker(connection, entry, now);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function executeLegacyCommercialMediaBackfill({
  businessPool,
  contentPool,
  manifest,
  apply = false,
  now = new Date(),
}) {
  assertManifest(manifest);
  const summary = {
    total: manifest.length,
    migrate: 0,
    intentionalNoImage: 0,
    existingMigrations: 0,
    wouldCreateAssets: 0,
    wouldRecordNoImage: 0,
    createdAssets: 0,
    migrationsInserted: 0,
  };

  if (apply) await applyLegacyMediaMigrationSchema(contentPool);

  for (const entry of manifest) {
    const identity = await canonicalIdentity(businessPool, entry);
    if (entry.disposition === "migrate") summary.migrate += 1;
    else summary.intentionalNoImage += 1;

    const existing = await existingMigration(contentPool, entry);
    if (existing) {
      assertExistingMigration(existing, entry);
      await assertExistingMediaMaterialized(contentPool, entry);
      summary.existingMigrations += 1;
      continue;
    }

    if (
      identity.publicationState !== "draft" ||
      identity.publishedRevision != null
    ) {
      throw new Error("LEGACY_MEDIA_LATE_MIGRATION_DENIED");
    }

    if (entry.disposition === "migrate") {
      if ((await placeLinkCount(contentPool, entry.placeId)) !== 0) {
        throw new Error("LEGACY_MEDIA_EXISTING_PLACE_MEDIA_CONFLICT");
      }
      await assertAssetsAvailable(contentPool, entry);
      summary.wouldCreateAssets += entry.assets.length;
    } else {
      summary.wouldRecordNoImage += 1;
    }

    if (!apply) continue;
    await applyEntry(contentPool, entry, now);
    summary.createdAssets += entry.assets.length;
    summary.migrationsInserted += 1;
  }

  return Object.freeze(summary);
}
