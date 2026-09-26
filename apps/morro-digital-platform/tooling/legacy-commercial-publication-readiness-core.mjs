const EXPECTED_TOTAL = 72;
const SOURCE_SYSTEM = "morro-v1-search-catalog";
const DESTINATION_ID = "morro-de-sao-paulo";
const CATEGORIES = new Set(["restaurants", "nightlife", "hotels", "shops"]);
const CAPABILITIES = new Set([
  "directions",
  "photos",
  "products",
  "offers",
  "menu",
  "tickets",
  "booking",
  "whatsapp",
  "tourBooking",
  "transportBooking",
]);

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function coordinatesValid(location) {
  return (
    typeof location?.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    typeof location?.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180
  );
}

function bump(target, code) {
  target[code] = (target[code] ?? 0) + 1;
}

export function assessLegacyCommercialPublicationReadiness(rows, mediaMarkers) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_PUBLICATION_READINESS_ROW_COUNT_INVALID");
  }
  if (!Array.isArray(mediaMarkers) || mediaMarkers.length !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_PUBLICATION_READINESS_MEDIA_MARKER_COUNT_INVALID");
  }

  const markerByKey = new Map();
  for (const marker of mediaMarkers) {
    const key = String(marker.source_key ?? "");
    if (!key || markerByKey.has(key)) {
      throw new Error("LEGACY_PUBLICATION_READINESS_MEDIA_MARKER_DUPLICATE");
    }
    markerByKey.set(key, marker);
  }

  const sourceKeys = new Set();
  const placeIds = new Set();
  const businessIds = new Set();
  const requiredIssueCounts = {};
  const recommendedIssueCounts = {};
  const publicationStateCounts = {};
  let readyForReview = 0;
  let blocked = 0;
  let migrateMedia = 0;
  let intentionalNoImage = 0;
  let migratedAssetCount = 0;

  for (const row of rows) {
    const sourceKey = String(row.source_key ?? "");
    const placeId = String(row.place_id ?? "");
    const businessId = String(row.business_id ?? "");
    if (!sourceKey || sourceKeys.has(sourceKey)) {
      throw new Error("LEGACY_PUBLICATION_READINESS_SOURCE_KEY_INVALID");
    }
    if (!placeId || placeIds.has(placeId)) {
      throw new Error("LEGACY_PUBLICATION_READINESS_PLACE_ID_INVALID");
    }
    if (!businessId || businessIds.has(businessId)) {
      throw new Error("LEGACY_PUBLICATION_READINESS_BUSINESS_ID_INVALID");
    }
    sourceKeys.add(sourceKey);
    placeIds.add(placeId);
    businessIds.add(businessId);

    if (
      String(row.source_system) !== SOURCE_SYSTEM ||
      String(row.destination_id) !== DESTINATION_ID
    ) {
      throw new Error("LEGACY_PUBLICATION_READINESS_SCOPE_DRIFT");
    }

    const data = parseJson(row.editable_revision_json);
    if (!data || typeof data !== "object") {
      throw new Error("LEGACY_PUBLICATION_READINESS_REVISION_INVALID");
    }
    if (
      String(data.placeId ?? "") !== placeId ||
      String(data.businessId ?? "") !== businessId ||
      String(data.destinationId ?? "") !== DESTINATION_ID
    ) {
      throw new Error("LEGACY_PUBLICATION_READINESS_IDENTITY_DRIFT");
    }

    const required = [];
    if (!text(data.name)) required.push("NAME_REQUIRED");
    if (!text(data.categoryId)) required.push("CATEGORY_REQUIRED");
    if (!text(data.destinationId)) required.push("DESTINATION_REQUIRED");
    if (!text(data.businessId)) required.push("BUSINESS_REQUIRED");
    if (!text(data.description)) required.push("DESCRIPTION_REQUIRED");
    if (!coordinatesValid(data.location)) {
      required.push("VALID_COORDINATES_REQUIRED");
    }
    if (!CATEGORIES.has(String(data.categoryId ?? ""))) {
      required.push("CATEGORY_INVALID");
    }
    const capabilities = Array.isArray(data.capabilities?.enabled)
      ? data.capabilities.enabled.map(String)
      : [];
    for (const capability of capabilities) {
      if (!CAPABILITIES.has(capability)) {
        required.push("CAPABILITY_INVALID");
        break;
      }
    }

    const marker = markerByKey.get(sourceKey);
    if (!marker) {
      throw new Error("LEGACY_PUBLICATION_READINESS_MEDIA_MARKER_MISSING");
    }
    const disposition = String(marker.disposition ?? "");
    const assetCount = Number(marker.asset_count ?? -1);
    if (disposition === "migrate") {
      migrateMedia += 1;
      migratedAssetCount += assetCount;
      if (assetCount <= 0) {
        throw new Error(
          "LEGACY_PUBLICATION_READINESS_MEDIA_ASSET_COUNT_INVALID",
        );
      }
    } else if (disposition === "intentional_no_image") {
      intentionalNoImage += 1;
      if (assetCount !== 0) {
        throw new Error("LEGACY_PUBLICATION_READINESS_NO_IMAGE_DRIFT");
      }
    } else {
      throw new Error("LEGACY_PUBLICATION_READINESS_MEDIA_DISPOSITION_INVALID");
    }

    if (!text(data.coverMediaId))
      bump(recommendedIssueCounts, "COVER_RECOMMENDED");
    if (!data.openingHoursPresent)
      bump(recommendedIssueCounts, "HOURS_RECOMMENDED");
    if (!data.contactPresent)
      bump(recommendedIssueCounts, "CONTACT_RECOMMENDED");
    if (capabilities.includes("menu") && !data.menuPresent) {
      bump(recommendedIssueCounts, "MENU_RECOMMENDED");
    }

    const state = String(row.publication_state ?? "");
    publicationStateCounts[state] = (publicationStateCounts[state] ?? 0) + 1;
    if (row.published_revision != null) {
      throw new Error(
        "LEGACY_PUBLICATION_READINESS_UNEXPECTED_PUBLISHED_REVISION",
      );
    }

    if (required.length === 0) readyForReview += 1;
    else blocked += 1;
    for (const code of new Set(required)) bump(requiredIssueCounts, code);
  }

  if (markerByKey.size !== sourceKeys.size) {
    throw new Error("LEGACY_PUBLICATION_READINESS_MEDIA_SCOPE_DRIFT");
  }

  return Object.freeze({
    total: EXPECTED_TOTAL,
    readyForReview,
    blocked,
    publicationStateCounts: Object.freeze(publicationStateCounts),
    requiredIssueCounts: Object.freeze(requiredIssueCounts),
    recommendedIssueCounts: Object.freeze(recommendedIssueCounts),
    media: Object.freeze({
      migrate: migrateMedia,
      intentionalNoImage,
      assetCount: migratedAssetCount,
    }),
  });
}
