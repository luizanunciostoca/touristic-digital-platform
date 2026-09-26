const SOURCE_SYSTEM = "morro-v1-search-catalog";
const DESTINATION_ID = "morro-de-sao-paulo";
const EXPECTED_TOTAL = 72;

async function loadReviewMarkerSummary(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT
         COUNT(*) AS review_marker_count,
         SUM(CASE WHEN p.publication_state = 'review' THEN 1 ELSE 0 END) AS marker_review_count,
         SUM(CASE WHEN p.publication_state = 'draft' THEN 1 ELSE 0 END) AS marker_pending_count,
         SUM(CASE WHEN
           m.source_key IS NULL OR
           p.place_id IS NULL OR
           r.business_id <> m.business_id OR
           r.place_id <> m.place_id OR
           r.editable_revision <> p.editable_revision
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
      markerDriftCount: Number(row.marker_drift_count ?? 0),
    });
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") {
      return Object.freeze({
        reviewMarkerCount: 0,
        markerReviewCount: 0,
        markerPendingCount: 0,
        markerDriftCount: 0,
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
       SUM(CASE WHEN d.business_id IS NOT NULL THEN 1 ELSE 0 END) AS destination_link_count,
       SUM(CASE WHEN p.publication_state = 'draft' AND p.published_revision IS NULL THEN 1 ELSE 0 END) AS draft_count,
       SUM(CASE WHEN p.publication_state = 'review' AND p.published_revision IS NULL THEN 1 ELSE 0 END) AS review_count,
       SUM(CASE WHEN p.published_revision IS NOT NULL THEN 1 ELSE 0 END) AS published_revision_count,
       SUM(CASE WHEN p.place_id IS NOT NULL AND p.publication_state NOT IN ('draft','review') THEN 1 ELSE 0 END) AS invalid_state_count,
       SUM(CASE WHEN p.place_id IS NULL THEN 1 ELSE 0 END) AS missing_place_count,
       SUM(CASE WHEN b.id IS NULL THEN 1 ELSE 0 END) AS missing_business_count,
       SUM(CASE WHEN d.business_id IS NULL THEN 1 ELSE 0 END) AS missing_destination_link_count,
       SUM(CASE WHEN p.place_id IS NOT NULL AND (
         p.business_id <> m.business_id OR
         p.destination_id <> m.destination_id OR
         p.category_id <> m.category_id
       ) THEN 1 ELSE 0 END) AS identity_conflict_count
     FROM business_place_legacy_mappings m
     LEFT JOIN business_places p ON p.place_id = m.place_id
     LEFT JOIN business_entities b ON b.id = m.business_id
     LEFT JOIN business_destinations d
       ON d.business_id = m.business_id AND d.destination_id = m.destination_id
     WHERE m.source_system = ? AND m.destination_id = ?`,
    [SOURCE_SYSTEM, DESTINATION_ID],
  );

  const row = rows[0] ?? {};
  const markerSummary = await loadReviewMarkerSummary(pool);
  const summary = Object.freeze({
    mappingCount: Number(row.mapping_count ?? 0),
    placeCount: Number(row.place_count ?? 0),
    businessCount: Number(row.business_count ?? 0),
    destinationLinkCount: Number(row.destination_link_count ?? 0),
    draftCount: Number(row.draft_count ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    publishedRevisionCount: Number(row.published_revision_count ?? 0),
    invalidStateCount: Number(row.invalid_state_count ?? 0),
    missingPlaceCount: Number(row.missing_place_count ?? 0),
    missingBusinessCount: Number(row.missing_business_count ?? 0),
    missingDestinationLinkCount: Number(
      row.missing_destination_link_count ?? 0,
    ),
    identityConflictCount: Number(row.identity_conflict_count ?? 0),
    ...markerSummary,
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
  if (
    summary.draftCount + summary.reviewCount !== EXPECTED_TOTAL ||
    summary.publishedRevisionCount !== 0 ||
    summary.invalidStateCount !== 0 ||
    summary.missingPlaceCount !== 0 ||
    summary.missingBusinessCount !== 0 ||
    summary.missingDestinationLinkCount !== 0 ||
    summary.identityConflictCount !== 0
  ) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_INVARIANT");
  }
  if (
    summary.reviewMarkerCount < summary.reviewCount ||
    summary.reviewMarkerCount > EXPECTED_TOTAL ||
    summary.markerReviewCount !== summary.reviewCount ||
    summary.markerReviewCount + summary.markerPendingCount !==
      summary.reviewMarkerCount ||
    summary.markerDriftCount !== 0
  ) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_REVIEW_MARKER_INVARIANT");
  }

  return summary;
}
