const SOURCE_SYSTEM = "morro-v1-search-catalog";
const DESTINATION_ID = "morro-de-sao-paulo";
const EXPECTED_TOTAL = 72;

async function loadReviewMarkerSummary(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT
         COUNT(*) AS review_marker_count,
         SUM(CASE WHEN
           p.publication_state = 'review' AND p.published_revision IS NULL
         THEN 1 ELSE 0 END) AS marker_review_count,
         SUM(CASE WHEN
           p.publication_state = 'draft' AND p.published_revision IS NULL
         THEN 1 ELSE 0 END) AS marker_pending_count,
         SUM(CASE WHEN p.published_revision IS NOT NULL THEN 1 ELSE 0 END)
           AS marker_published_count,
         SUM(CASE WHEN
           m.source_key IS NULL OR
           p.place_id IS NULL OR
           r.business_id <> m.business_id OR
           r.place_id <> m.place_id OR
           r.editable_revision > p.editable_revision OR
           (p.published_revision IS NULL AND
             r.editable_revision <> p.editable_revision)
         THEN 1 ELSE 0 END) AS marker_drift_count
       FROM legacy_place_review_migrations r
       LEFT JOIN business_place_legacy_mappings m
         ON m.source_system = r.source_system AND m.source_key = r.source_key
       LEFT JOIN business_places p ON p.place_id = r.place_id
       WHERE r.source_system = ?`,
      [SOURCE_SYSTEM],
    );
    const row = rows[0] ?? {};
    return Object.freeze({
      reviewMarkerCount: Number(row.review_marker_count ?? 0),
      markerReviewCount: Number(row.marker_review_count ?? 0),
      markerPendingCount: Number(row.marker_pending_count ?? 0),
      markerPublishedCount: Number(row.marker_published_count ?? 0),
      markerDriftCount: Number(row.marker_drift_count ?? 0),
    });
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") {
      return Object.freeze({
        reviewMarkerCount: 0,
        markerReviewCount: 0,
        markerPendingCount: 0,
        markerPublishedCount: 0,
        markerDriftCount: 0,
      });
    }
    throw error;
  }
}

async function loadPublicationMarkerSummary(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT
         COUNT(*) AS publication_marker_count,
         SUM(CASE WHEN
           p.published_revision IS NOT NULL AND
           pm.editable_revision = p.published_revision
         THEN 1 ELSE 0 END) AS publication_marker_published_count,
         SUM(CASE WHEN
           p.published_revision IS NULL AND
           p.publication_state IN ('draft','review') AND
           pm.editable_revision = p.editable_revision
         THEN 1 ELSE 0 END) AS publication_marker_pending_count,
         SUM(CASE WHEN
           m.source_key IS NULL OR
           p.place_id IS NULL OR
           pm.business_id <> m.business_id OR
           pm.place_id <> m.place_id OR
           (
             p.published_revision IS NOT NULL AND
             pm.editable_revision <> p.published_revision
           ) OR
           (
             p.published_revision IS NULL AND
             pm.editable_revision <> p.editable_revision
           )
         THEN 1 ELSE 0 END) AS publication_marker_drift_count
       FROM legacy_place_publication_migrations pm
       LEFT JOIN business_place_legacy_mappings m
         ON m.source_system = pm.source_system AND m.source_key = pm.source_key
       LEFT JOIN business_places p ON p.place_id = pm.place_id
       WHERE pm.source_system = ?`,
      [SOURCE_SYSTEM],
    );
    const row = rows[0] ?? {};
    return Object.freeze({
      publicationMarkerCount: Number(row.publication_marker_count ?? 0),
      publicationMarkerPublishedCount: Number(
        row.publication_marker_published_count ?? 0,
      ),
      publicationMarkerPendingCount: Number(
        row.publication_marker_pending_count ?? 0,
      ),
      publicationMarkerDriftCount: Number(
        row.publication_marker_drift_count ?? 0,
      ),
    });
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") {
      return Object.freeze({
        publicationMarkerCount: 0,
        publicationMarkerPublishedCount: 0,
        publicationMarkerPendingCount: 0,
        publicationMarkerDriftCount: 0,
      });
    }
    throw error;
  }
}

export async function verifyLegacyCommercialDraftBackfill({ pool }) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS mapping_count,
       SUM(CASE WHEN p.place_id IS NOT NULL THEN 1 ELSE 0 END) AS place_count,
       SUM(CASE WHEN b.id IS NOT NULL THEN 1 ELSE 0 END) AS business_count,
       SUM(CASE WHEN d.business_id IS NOT NULL THEN 1 ELSE 0 END)
         AS destination_link_count,
       SUM(CASE WHEN
         p.publication_state = 'draft' AND p.published_revision IS NULL
       THEN 1 ELSE 0 END) AS draft_count,
       SUM(CASE WHEN
         p.publication_state = 'review' AND p.published_revision IS NULL
       THEN 1 ELSE 0 END) AS review_count,
       SUM(CASE WHEN p.publication_state = 'published' THEN 1 ELSE 0 END)
         AS published_state_count,
       SUM(CASE WHEN p.publication_state = 'suspended' THEN 1 ELSE 0 END)
         AS suspended_state_count,
       SUM(CASE WHEN p.publication_state = 'archived' THEN 1 ELSE 0 END)
         AS archived_state_count,
       SUM(CASE WHEN
         p.publication_state IN ('draft','review') AND
         p.published_revision IS NOT NULL
       THEN 1 ELSE 0 END) AS post_publish_edit_state_count,
       SUM(CASE WHEN p.published_revision IS NOT NULL THEN 1 ELSE 0 END)
         AS published_revision_count,
       SUM(CASE WHEN
         p.publication_state IN ('published','suspended','archived') AND
         p.published_revision IS NULL
       THEN 1 ELSE 0 END) AS published_state_missing_revision_count,
       SUM(CASE WHEN
         p.place_id IS NOT NULL AND
         p.publication_state NOT IN (
           'draft','review','published','suspended','archived'
         )
       THEN 1 ELSE 0 END) AS invalid_state_count,
       SUM(CASE WHEN p.place_id IS NULL THEN 1 ELSE 0 END)
         AS missing_place_count,
       SUM(CASE WHEN b.id IS NULL THEN 1 ELSE 0 END)
         AS missing_business_count,
       SUM(CASE WHEN d.business_id IS NULL THEN 1 ELSE 0 END)
         AS missing_destination_link_count,
       SUM(CASE WHEN p.place_id IS NOT NULL AND (
         p.business_id <> m.business_id OR
         p.destination_id <> m.destination_id OR
         p.category_id <> m.category_id
       ) THEN 1 ELSE 0 END) AS identity_conflict_count,
       SUM(CASE WHEN
         p.published_revision IS NOT NULL AND c.place_id IS NOT NULL
       THEN 1 ELSE 0 END) AS published_catalog_snapshot_count,
       SUM(CASE WHEN
         p.published_revision IS NOT NULL AND s.place_id IS NOT NULL
       THEN 1 ELSE 0 END) AS published_media_snapshot_count
     FROM business_place_legacy_mappings m
     LEFT JOIN business_places p ON p.place_id = m.place_id
     LEFT JOIN business_entities b ON b.id = m.business_id
     LEFT JOIN business_destinations d
       ON d.business_id = m.business_id
      AND d.destination_id = m.destination_id
     LEFT JOIN catalog_public_snapshots c
       ON c.place_id = p.place_id
      AND c.place_revision = p.published_revision
     LEFT JOIN place_media_public_snapshots s
       ON s.place_id = p.place_id
      AND s.place_revision = p.published_revision
     WHERE m.source_system = ? AND m.destination_id = ?`,
    [SOURCE_SYSTEM, DESTINATION_ID],
  );

  const row = rows[0] ?? {};
  const reviewMarkerSummary = await loadReviewMarkerSummary(pool);
  const publicationMarkerSummary = await loadPublicationMarkerSummary(pool);
  const summary = Object.freeze({
    mappingCount: Number(row.mapping_count ?? 0),
    placeCount: Number(row.place_count ?? 0),
    businessCount: Number(row.business_count ?? 0),
    destinationLinkCount: Number(row.destination_link_count ?? 0),
    draftCount: Number(row.draft_count ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    publishedStateCount: Number(row.published_state_count ?? 0),
    suspendedStateCount: Number(row.suspended_state_count ?? 0),
    archivedStateCount: Number(row.archived_state_count ?? 0),
    postPublishEditStateCount: Number(row.post_publish_edit_state_count ?? 0),
    publishedRevisionCount: Number(row.published_revision_count ?? 0),
    publishedStateMissingRevisionCount: Number(
      row.published_state_missing_revision_count ?? 0,
    ),
    invalidStateCount: Number(row.invalid_state_count ?? 0),
    missingPlaceCount: Number(row.missing_place_count ?? 0),
    missingBusinessCount: Number(row.missing_business_count ?? 0),
    missingDestinationLinkCount: Number(
      row.missing_destination_link_count ?? 0,
    ),
    identityConflictCount: Number(row.identity_conflict_count ?? 0),
    publishedCatalogSnapshotCount: Number(
      row.published_catalog_snapshot_count ?? 0,
    ),
    publishedMediaSnapshotCount: Number(
      row.published_media_snapshot_count ?? 0,
    ),
    ...reviewMarkerSummary,
    ...publicationMarkerSummary,
  });

  if (summary.mappingCount !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_MAPPING_COUNT");
  }
  if (
    summary.placeCount !== EXPECTED_TOTAL ||
    summary.businessCount !== EXPECTED_TOTAL ||
    summary.destinationLinkCount !== EXPECTED_TOTAL
  ) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_CANONICAL_COUNT");
  }

  const lifecycleCount =
    summary.draftCount +
    summary.reviewCount +
    summary.publishedStateCount +
    summary.suspendedStateCount +
    summary.archivedStateCount +
    summary.postPublishEditStateCount;

  if (
    lifecycleCount !== EXPECTED_TOTAL ||
    summary.publishedStateMissingRevisionCount !== 0 ||
    summary.invalidStateCount !== 0 ||
    summary.missingPlaceCount !== 0 ||
    summary.missingBusinessCount !== 0 ||
    summary.missingDestinationLinkCount !== 0 ||
    summary.identityConflictCount !== 0
  ) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_INVARIANT");
  }

  if (
    summary.publishedCatalogSnapshotCount !== summary.publishedRevisionCount ||
    summary.publishedMediaSnapshotCount !== summary.publishedRevisionCount
  ) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_SNAPSHOT_INVARIANT");
  }

  if (
    summary.reviewMarkerCount <
      summary.reviewCount + summary.publishedRevisionCount ||
    summary.reviewMarkerCount > EXPECTED_TOTAL ||
    summary.markerReviewCount !== summary.reviewCount ||
    summary.markerReviewCount +
      summary.markerPendingCount +
      summary.markerPublishedCount !==
      summary.reviewMarkerCount ||
    summary.markerPublishedCount !== summary.publishedRevisionCount ||
    summary.markerDriftCount !== 0
  ) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_REVIEW_MARKER_INVARIANT");
  }

  if (
    summary.publicationMarkerPublishedCount !== summary.publishedRevisionCount ||
    summary.publicationMarkerPublishedCount +
      summary.publicationMarkerPendingCount !==
      summary.publicationMarkerCount ||
    summary.publicationMarkerCount > EXPECTED_TOTAL ||
    summary.publicationMarkerDriftCount !== 0
  ) {
    throw new Error(
      "LEGACY_COMMERCIAL_DRAFT_VERIFY_PUBLICATION_MARKER_INVARIANT",
    );
  }

  return summary;
}
