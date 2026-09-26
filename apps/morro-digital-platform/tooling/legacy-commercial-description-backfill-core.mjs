const EXPECTED_TOTAL = 72;
const SOURCE_SYSTEM = "morro-v1-search-catalog";
const DESTINATION_ID = "morro-de-sao-paulo";

const CATEGORY_LABELS = Object.freeze({
  hotels: "hospedagem",
  restaurants: "gastronomia",
  nightlife: "vida noturna",
  shops: "comércio",
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function bootstrapLegacyCommercialDescription({
  name,
  categoryId,
  destinationId,
}) {
  const cleanName = text(name);
  const category = text(categoryId);
  if (!cleanName) throw new Error("LEGACY_DESCRIPTION_NAME_REQUIRED");
  if (destinationId !== DESTINATION_ID) {
    throw new Error("LEGACY_DESCRIPTION_DESTINATION_INVALID");
  }
  const label = CATEGORY_LABELS[category];
  if (!label) throw new Error("LEGACY_DESCRIPTION_CATEGORY_INVALID");
  return `${cleanName} é um local de ${label} cadastrado em Morro de São Paulo.`;
}

export function assessLegacyCommercialDescriptionBackfill(rows) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_TOTAL) {
    throw new Error("LEGACY_DESCRIPTION_ROW_COUNT_INVALID");
  }

  const sourceKeys = new Set();
  const placeIds = new Set();
  const businessIds = new Set();
  let wouldUpdate = 0;
  let existingBootstrap = 0;
  let preserveCustom = 0;

  for (const row of rows) {
    const sourceKey = text(row.source_key);
    const placeId = text(row.place_id);
    const businessId = text(row.business_id);
    if (!sourceKey || sourceKeys.has(sourceKey)) {
      throw new Error("LEGACY_DESCRIPTION_SOURCE_KEY_INVALID");
    }
    if (!placeId || placeIds.has(placeId)) {
      throw new Error("LEGACY_DESCRIPTION_PLACE_ID_INVALID");
    }
    if (!businessId || businessIds.has(businessId)) {
      throw new Error("LEGACY_DESCRIPTION_BUSINESS_ID_INVALID");
    }
    sourceKeys.add(sourceKey);
    placeIds.add(placeId);
    businessIds.add(businessId);

    if (
      text(row.source_system) !== SOURCE_SYSTEM ||
      text(row.destination_id) !== DESTINATION_ID ||
      text(row.publication_state) !== "draft" ||
      row.published_revision != null
    ) {
      throw new Error("LEGACY_DESCRIPTION_SCOPE_DRIFT");
    }

    const place =
      row.editable_place_json && typeof row.editable_place_json === "object"
        ? row.editable_place_json
        : JSON.parse(String(row.editable_place_json ?? "null"));
    if (
      !place ||
      String(place.id ?? "") !== placeId ||
      String(place.businessId ?? "") !== businessId ||
      String(place.destinationId ?? "") !== DESTINATION_ID
    ) {
      throw new Error("LEGACY_DESCRIPTION_IDENTITY_DRIFT");
    }

    const target = bootstrapLegacyCommercialDescription({
      name: place.name,
      categoryId: row.category_id,
      destinationId: row.destination_id,
    });
    const current = text(place.description);
    if (!current) wouldUpdate += 1;
    else if (current === target) existingBootstrap += 1;
    else preserveCustom += 1;
  }

  return Object.freeze({
    total: EXPECTED_TOTAL,
    wouldUpdate,
    existingBootstrap,
    preserveCustom,
  });
}
