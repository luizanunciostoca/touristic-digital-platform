function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function mediaImage(asset) {
  return Object.freeze({
    mediaId: asset.id,
    provider: asset.provider,
    providerReference: asset.providerReference,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    alt: asset.alt,
  });
}

async function currentMediaProjection(mediaRepository, place) {
  if (!mediaRepository) return null;

  const links = await mediaRepository.listLinks(String(place.id));
  const entries = [];
  for (const link of links) {
    const asset = await mediaRepository.getAsset(link.mediaId);
    if (
      asset &&
      asset.businessId === String(place.businessId) &&
      asset.publicationState === "published"
    ) {
      entries.push({ link, asset });
    }
  }

  const cover = entries.find(({ link }) => link.role === "cover") ?? null;
  const logo = entries.find(({ link }) => link.role === "logo") ?? null;
  const gallery = entries
    .filter(({ link }) => link.role === "gallery" || link.role === "cover")
    .sort(
      (a, b) =>
        a.link.sortOrder - b.link.sortOrder ||
        String(a.link.mediaId).localeCompare(String(b.link.mediaId)),
    )
    .map(({ asset }) => mediaImage(asset));

  return Object.freeze({
    placeId: String(place.id),
    coverImage: cover ? mediaImage(cover.asset) : null,
    gallery: Object.freeze(gallery),
    logo: logo ? mediaImage(logo.asset) : null,
  });
}

export async function applyMediaPublicationSnapshotSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS place_media_public_snapshots (
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_revision INT UNSIGNED NOT NULL,
      media_json JSON NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (place_id, place_revision),
      KEY idx_media_snapshot_business (business_id, place_id, place_revision),
      CONSTRAINT fk_media_snapshot_place
        FOREIGN KEY (place_id) REFERENCES business_places(place_id)
        ON UPDATE RESTRICT ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export function createMediaPublicationSnapshotRuntime({
  pool,
  mediaRepository,
}) {
  async function capturePublicationSnapshot({
    businessId,
    placeId,
    placeRevision,
  }) {
    if (!Number.isSafeInteger(placeRevision) || placeRevision < 1) {
      throw new Error("MEDIA_INVALID_PLACE_REVISION");
    }

    const [placeRows] = await pool.execute(
      `SELECT place_id, business_id
         FROM business_places
        WHERE place_id = ? AND business_id = ?
        LIMIT 1`,
      [String(placeId), String(businessId)],
    );
    if (!placeRows[0]) throw new Error("MEDIA_PLACE_OWNER_MISMATCH");

    const media = await currentMediaProjection(mediaRepository, {
      id: String(placeId),
      businessId: String(businessId),
    });
    const now = new Date();
    await pool.execute(
      `INSERT INTO place_media_public_snapshots
        (place_id, business_id, place_revision, media_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         business_id = VALUES(business_id),
         media_json = VALUES(media_json),
         updated_at = VALUES(updated_at)`,
      [
        String(placeId),
        String(businessId),
        placeRevision,
        media === null ? null : JSON.stringify(media),
        now,
        now,
      ],
    );
    return media;
  }

  async function getPublishedMedia(place) {
    const [rows] = await pool.execute(
      `SELECT snapshot.media_json
         FROM place_media_public_snapshots snapshot
         INNER JOIN business_places place_record
           ON place_record.place_id = snapshot.place_id
          AND place_record.business_id = snapshot.business_id
          AND place_record.published_revision = snapshot.place_revision
        WHERE snapshot.place_id = ?
          AND snapshot.business_id = ?
          AND place_record.publication_state NOT IN ('suspended', 'archived')
        LIMIT 1`,
      [String(place.id), String(place.businessId)],
    );
    return rows[0] ? parseJson(rows[0].media_json, null) : null;
  }

  async function backfillPublishedSnapshots() {
    if (!mediaRepository) return;
    const [rows] = await pool.execute(
      `SELECT place_id, business_id, published_revision
         FROM business_places
        WHERE publication_state NOT IN ('suspended', 'archived')
          AND published_revision IS NOT NULL`,
    );
    for (const row of rows) {
      const [existing] = await pool.execute(
        `SELECT 1
           FROM place_media_public_snapshots
          WHERE place_id = ? AND place_revision = ?
          LIMIT 1`,
        [String(row.place_id), Number(row.published_revision)],
      );
      if (existing[0]) continue;
      await capturePublicationSnapshot({
        businessId: String(row.business_id),
        placeId: String(row.place_id),
        placeRevision: Number(row.published_revision),
      });
    }
  }

  return Object.freeze({
    capturePublicationSnapshot,
    getPublishedMedia,
    backfillPublishedSnapshots,
  });
}
