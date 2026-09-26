const EXPECTED_TOTAL = 72;
const SOURCE_SYSTEM = "morro-v1-search-catalog";
const DESTINATION_ID = "morro-de-sao-paulo";
const DESCRIPTION_SOURCE_KIND = "derived-canonical-name-category-destination";
const ALLOWED_STATES = new Set([
  "draft",
  "review",
  "published",
  "suspended",
  "archived",
]);

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function finiteCoordinate(value, minimum, maximum) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function snapshotCatalogValid(value) {
  const catalog = parseJson(value);
  if (!catalog || typeof catalog !== "object") return false;
  return ["products", "offers", "menus", "categories", "items"].every((key) =>
    Array.isArray(catalog[key]),
  );
}

function snapshotMedia(value, disposition, assetCount) {
  const media = parseJson(value);
  if (!media || typeof media !== "object" || !Array.isArray(media.gallery)) {
    throw new Error("LEGACY_CUTOVER_MEDIA_SNAPSHOT_INVALID");
  }
  if (disposition === "intentional_no_image") {
    if (
      assetCount !== 0 ||
      media.gallery.length !== 0 ||
      media.coverImage != null ||
      media.logo != null
    ) {
      throw new Error("LEGACY_CUTOVER_NO_IMAGE_SNAPSHOT_DRIFT");
    }
    return;
  }
  if (
    disposition !== "migrate" ||
    assetCount <= 0 ||
    media.gallery.length !== assetCount ||
    !media.coverImage
  ) {
    throw new Error("LEGACY_CUTOVER_MEDIA_SNAPSHOT_DRIFT");
  }
}

export function assessLegacyCommercialCutover(rows, mediaRows) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_CUTOVER_ROW_COUNT_INVALID");
  }
  if (!Array.isArray(mediaRows) || mediaRows.length !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_CUTOVER_MEDIA_ROW_COUNT_INVALID");
  }

  const mediaByKey = new Map();
  let migrate = 0;
  let intentionalNoImage = 0;
  let assetCount = 0;
  let materializedAssets = 0;
  for (const media of mediaRows) {
    const key = text(media.source_key);
    if (!key || mediaByKey.has(key)) {
      throw new Error("LEGACY_CUTOVER_MEDIA_IDENTITY_INVALID");
    }
    const disposition = text(media.disposition);
    const expectedAssets = Number(media.asset_count ?? -1);
    const links = Number(media.link_count ?? -1);
    const publishedAssets = Number(media.published_asset_count ?? -1);
    if (disposition === "migrate") {
      migrate += 1;
      assetCount += expectedAssets;
      if (expectedAssets <= 0) {
        throw new Error("LEGACY_CUTOVER_MEDIA_ASSET_COUNT_INVALID");
      }
    } else if (disposition === "intentional_no_image") {
      intentionalNoImage += 1;
      if (expectedAssets !== 0) {
        throw new Error("LEGACY_CUTOVER_NO_IMAGE_MARKER_DRIFT");
      }
    } else {
      throw new Error("LEGACY_CUTOVER_MEDIA_DISPOSITION_INVALID");
    }
    if (links !== expectedAssets || publishedAssets !== expectedAssets) {
      throw new Error("LEGACY_CUTOVER_MEDIA_MATERIAL_DRIFT");
    }
    materializedAssets += publishedAssets;
    mediaByKey.set(key, media);
  }
  if (migrate !== 6 || intentionalNoImage !== 66 || assetCount !== 18) {
    throw new Error("LEGACY_CUTOVER_MEDIA_SCOPE_DRIFT");
  }

  const sourceKeys = new Set();
  const businessIds = new Set();
  const placeIds = new Set();
  const publicationStateCounts = {};
  let publishCandidates = 0;
  let publishedRevisionCount = 0;
  let currentCatalogSnapshots = 0;
  let currentMediaSnapshots = 0;

  for (const row of rows) {
    const sourceKey = text(row.source_key);
    const businessId = text(row.business_id);
    const placeId = text(row.place_id);
    const state = text(row.publication_state);
    const editableRevision = Number(row.editable_revision);
    const publishedRevision =
      row.published_revision == null ? null : Number(row.published_revision);

    if (
      text(row.source_system) !== SOURCE_SYSTEM ||
      text(row.destination_id) !== DESTINATION_ID
    ) {
      throw new Error("LEGACY_CUTOVER_SCOPE_DRIFT");
    }
    if (
      !sourceKey ||
      !businessId ||
      !placeId ||
      sourceKeys.has(sourceKey) ||
      businessIds.has(businessId) ||
      placeIds.has(placeId)
    ) {
      throw new Error("LEGACY_CUTOVER_IDENTITY_INVALID");
    }
    sourceKeys.add(sourceKey);
    businessIds.add(businessId);
    placeIds.add(placeId);

    if (!ALLOWED_STATES.has(state)) {
      throw new Error("LEGACY_CUTOVER_STATE_INVALID");
    }
    if (!Number.isSafeInteger(editableRevision) || editableRevision < 1) {
      throw new Error("LEGACY_CUTOVER_EDITABLE_REVISION_INVALID");
    }
    if (state === "draft" && publishedRevision == null) {
      throw new Error("LEGACY_CUTOVER_LIFECYCLE_REGRESSION");
    }
    if (
      ["published", "suspended", "archived"].includes(state) &&
      (!Number.isSafeInteger(publishedRevision) || publishedRevision < 1)
    ) {
      throw new Error("LEGACY_CUTOVER_PUBLISHED_REVISION_REQUIRED");
    }
    if (
      publishedRevision != null &&
      (!Number.isSafeInteger(publishedRevision) ||
        publishedRevision < 1 ||
        publishedRevision > editableRevision)
    ) {
      throw new Error("LEGACY_CUTOVER_PUBLISHED_REVISION_INVALID");
    }

    const reviewMarkerRevision = Number(row.review_marker_revision);
    if (
      text(row.review_marker_source_key) !== sourceKey ||
      text(row.review_marker_business_id) !== businessId ||
      text(row.review_marker_place_id) !== placeId ||
      !Number.isSafeInteger(reviewMarkerRevision) ||
      reviewMarkerRevision < 1 ||
      reviewMarkerRevision > editableRevision
    ) {
      throw new Error("LEGACY_CUTOVER_REVIEW_MARKER_DRIFT");
    }
    if (
      text(row.description_marker_source_key) !== sourceKey ||
      text(row.description_marker_business_id) !== businessId ||
      text(row.description_marker_place_id) !== placeId ||
      text(row.description_source_kind) !== DESCRIPTION_SOURCE_KIND
    ) {
      throw new Error("LEGACY_CUTOVER_DESCRIPTION_MARKER_DRIFT");
    }

    const media = mediaByKey.get(sourceKey);
    if (
      !media ||
      text(media.business_id) !== businessId ||
      text(media.place_id) !== placeId
    ) {
      throw new Error("LEGACY_CUTOVER_MEDIA_IDENTITY_DRIFT");
    }

    publicationStateCounts[state] = (publicationStateCounts[state] ?? 0) + 1;

    if (publishedRevision == null) {
      if (state !== "review") {
        throw new Error("LEGACY_CUTOVER_UNPUBLISHED_STATE_INVALID");
      }
      publishCandidates += 1;
      continue;
    }

    publishedRevisionCount += 1;
    const publishedPlace = parseJson(row.published_place_json);
    const publishedRevisionJson = parseJson(row.published_revision_json);
    if (
      !publishedPlace ||
      !publishedRevisionJson ||
      text(publishedPlace.id) !== placeId ||
      text(publishedPlace.businessId) !== businessId ||
      text(publishedPlace.destinationId) !== DESTINATION_ID ||
      !finiteCoordinate(Number(row.published_latitude), -90, 90) ||
      !finiteCoordinate(Number(row.published_longitude), -180, 180)
    ) {
      throw new Error("LEGACY_CUTOVER_PUBLIC_PLACE_SNAPSHOT_INVALID");
    }

    if (
      Number(row.catalog_snapshot_revision) !== publishedRevision ||
      text(row.catalog_snapshot_business_id) !== businessId ||
      !snapshotCatalogValid(row.catalog_snapshot_json)
    ) {
      throw new Error("LEGACY_CUTOVER_CATALOG_SNAPSHOT_INVALID");
    }
    currentCatalogSnapshots += 1;

    if (
      Number(row.media_snapshot_revision) !== publishedRevision ||
      text(row.media_snapshot_business_id) !== businessId
    ) {
      throw new Error("LEGACY_CUTOVER_MEDIA_SNAPSHOT_MISSING");
    }
    snapshotMedia(
      row.media_snapshot_json,
      text(media.disposition),
      Number(media.asset_count),
    );
    currentMediaSnapshots += 1;
  }

  if (mediaByKey.size !== sourceKeys.size) {
    throw new Error("LEGACY_CUTOVER_MEDIA_SCOPE_MISMATCH");
  }

  return Object.freeze({
    total: EXPECTED_TOTAL,
    publishCandidates,
    publishedRevisionCount,
    currentCatalogSnapshots,
    currentMediaSnapshots,
    publicationStateCounts: Object.freeze(publicationStateCounts),
    media: Object.freeze({
      migrate,
      intentionalNoImage,
      assetCount,
      materializedAssets,
    }),
  });
}
