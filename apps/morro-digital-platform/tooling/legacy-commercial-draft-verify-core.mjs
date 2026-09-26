const SOURCE_SYSTEM = "morro-v1-search-catalog";
const DESTINATION_ID = "morro-de-sao-paulo";
const EXPECTED_TOTAL = 72;

export async function verifyLegacyCommercialDraftBackfill({ pool }) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS mapping_count,
       SUM(CASE WHEN p.place_id IS NOT NULL THEN 1 ELSE 0 END) AS place_count,
       SUM(CASE WHEN b.id IS NOT NULL THEN 1 ELSE 0 END) AS business_count,
       SUM(CASE WHEN d.business_id IS NOT NULL THEN 1 ELSE 0 END) AS destination_link_count,
       SUM(CASE WHEN p.publication_state = 'draft' AND p.published_revision IS NULL THEN 1 ELSE 0 END) AS draft_count,
       SUM(CASE WHEN p.place_id IS NOT NULL AND (p.publication_state <> 'draft' OR p.published_revision IS NOT NULL) THEN 1 ELSE 0 END) AS non_draft_count,
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
  const summary = Object.freeze({
    mappingCount: Number(row.mapping_count ?? 0),
    placeCount: Number(row.place_count ?? 0),
    businessCount: Number(row.business_count ?? 0),
    destinationLinkCount: Number(row.destination_link_count ?? 0),
    draftCount: Number(row.draft_count ?? 0),
    nonDraftCount: Number(row.non_draft_count ?? 0),
    missingPlaceCount: Number(row.missing_place_count ?? 0),
    missingBusinessCount: Number(row.missing_business_count ?? 0),
    missingDestinationLinkCount: Number(
      row.missing_destination_link_count ?? 0,
    ),
    identityConflictCount: Number(row.identity_conflict_count ?? 0),
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
    summary.draftCount !== EXPECTED_TOTAL ||
    summary.nonDraftCount !== 0 ||
    summary.missingPlaceCount !== 0 ||
    summary.missingBusinessCount !== 0 ||
    summary.missingDestinationLinkCount !== 0 ||
    summary.identityConflictCount !== 0
  ) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_INVARIANT");
  }

  return summary;
}
