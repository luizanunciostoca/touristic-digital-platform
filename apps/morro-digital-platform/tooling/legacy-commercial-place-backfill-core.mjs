const DESTINATION_ID = "morro-de-sao-paulo";
const SOURCE_SYSTEM = "morro-v1-search-catalog";
const COMMERCIAL_CATEGORIES = new Set([
  "restaurants",
  "hotels",
  "shops",
  "nightlife",
]);

function migrationSlug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/&/gu, " e ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
}

export function legacyCommercialSourceKey(input) {
  return [
    migrationSlug(input.category),
    migrationSlug(input.name),
    Number(input.latitude).toFixed(7),
    Number(input.longitude).toFixed(7),
  ].join(":");
}

export function validateLegacyCommercialMappings(mappings) {
  const sourceKeys = new Set();
  const businessIds = new Set();
  const placeIds = new Set();

  for (const mapping of mappings) {
    if (mapping.sourceSystem !== SOURCE_SYSTEM) {
      throw new Error("LEGACY_COMMERCIAL_MAPPING_SOURCE_INVALID");
    }
    if (!COMMERCIAL_CATEGORIES.has(mapping.legacyCategory)) {
      throw new Error("LEGACY_COMMERCIAL_MAPPING_CATEGORY_INVALID");
    }
    if (mapping.destinationId !== DESTINATION_ID) {
      throw new Error("LEGACY_COMMERCIAL_MAPPING_DESTINATION_INVALID");
    }
    if (sourceKeys.has(mapping.sourceKey)) {
      throw new Error("LEGACY_COMMERCIAL_MAPPING_SOURCE_DUPLICATE");
    }
    if (businessIds.has(mapping.businessId)) {
      throw new Error("LEGACY_COMMERCIAL_MAPPING_BUSINESS_DUPLICATE");
    }
    if (placeIds.has(mapping.placeId)) {
      throw new Error("LEGACY_COMMERCIAL_MAPPING_PLACE_DUPLICATE");
    }
    sourceKeys.add(mapping.sourceKey);
    businessIds.add(mapping.businessId);
    placeIds.add(mapping.placeId);
  }
}

function catalogIndex(catalog) {
  const index = new Map();
  for (const item of catalog) {
    if (!COMMERCIAL_CATEGORIES.has(item.category)) continue;
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) {
      continue;
    }
    const key = legacyCommercialSourceKey({
      name: item.name,
      category: item.category,
      latitude: item.latitude,
      longitude: item.longitude,
    });
    if (index.has(key)) throw new Error("LEGACY_COMMERCIAL_SOURCE_DUPLICATE");
    index.set(key, item);
  }
  return index;
}

function assertMappingMatchesRow(mapping, row) {
  if (
    String(row.business_id) !== mapping.businessId ||
    String(row.place_id) !== mapping.placeId ||
    String(row.destination_id) !== mapping.destinationId ||
    String(row.category_id) !== mapping.categoryId
  ) {
    throw new Error("LEGACY_COMMERCIAL_MAPPING_CANONICAL_CONFLICT");
  }
}

async function currentMapping(pool, mapping) {
  const [rows] = await pool.execute(
    `SELECT source_system, source_key, business_id, place_id, destination_id, category_id
       FROM business_place_legacy_mappings
      WHERE source_system = ? AND source_key = ?
      LIMIT 1`,
    [mapping.sourceSystem, mapping.sourceKey],
  );
  return rows[0] ?? null;
}

async function canonicalRow(pool, mapping) {
  const [rows] = await pool.execute(
    `SELECT p.place_id, p.business_id, p.destination_id, p.category_id,
            JSON_UNQUOTE(JSON_EXTRACT(p.editable_place_json, '$.name')) AS place_name
       FROM business_places p
      WHERE p.place_id = ? OR p.business_id = ?
      ORDER BY p.created_at ASC
      LIMIT 2`,
    [mapping.placeId, mapping.businessId],
  );
  if (rows.length > 1) {
    throw new Error("LEGACY_COMMERCIAL_MAPPING_MULTIPLE_CANONICAL_ROWS");
  }
  return rows[0] ?? null;
}

async function saveMapping(pool, mapping, now) {
  await pool.execute(
    `INSERT INTO business_place_legacy_mappings
       (source_system, source_key, business_id, place_id, destination_id, category_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      mapping.sourceSystem,
      mapping.sourceKey,
      mapping.businessId,
      mapping.placeId,
      mapping.destinationId,
      mapping.categoryId,
      now(),
    ],
  );
}

export async function executeLegacyCommercialPlaceBackfill({
  pool,
  runtime = null,
  apply = false,
  mappings,
  catalog,
  now = () => new Date(),
}) {
  validateLegacyCommercialMappings(mappings);
  const sources = catalogIndex(catalog);
  const summary = {
    mode: apply ? "apply" : "dry-run",
    total: mappings.length,
    existingMappings: 0,
    existingCanonical: 0,
    wouldCreate: 0,
    createdDrafts: 0,
    mappingsInserted: 0,
  };

  for (const mapping of mappings) {
    const source = sources.get(mapping.sourceKey);
    if (!source) throw new Error("LEGACY_COMMERCIAL_MAPPING_SOURCE_MISSING");
    if (
      source.name !== mapping.legacyName ||
      source.category !== mapping.legacyCategory
    ) {
      throw new Error("LEGACY_COMMERCIAL_MAPPING_SOURCE_DRIFT");
    }

    const mapped = await currentMapping(pool, mapping);
    if (mapped) {
      assertMappingMatchesRow(mapping, mapped);
      summary.existingMappings += 1;
      continue;
    }

    const existing = await canonicalRow(pool, mapping);
    if (existing) {
      assertMappingMatchesRow(mapping, existing);
      if (String(existing.place_name ?? "") !== mapping.legacyName) {
        throw new Error("LEGACY_COMMERCIAL_MAPPING_NAME_CONFLICT");
      }
      summary.existingCanonical += 1;
      if (apply) {
        await saveMapping(pool, mapping, now);
        summary.mappingsInserted += 1;
      }
      continue;
    }

    if (!apply) {
      summary.wouldCreate += 1;
      continue;
    }
    if (!runtime)
      throw new Error("LEGACY_COMMERCIAL_BACKFILL_RUNTIME_REQUIRED");

    await runtime.createDraft(
      {
        subject: "staging-legacy-commercial-backfill",
        email: "staging-legacy-commercial-backfill@example.invalid",
        role: "PLATFORM_OWNER",
        businessIds: Object.freeze([]),
        issuedAt: Math.floor(Date.now() / 1000) - 60,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        sessionId: "staging-legacy-commercial-backfill",
      },
      {
        businessId: mapping.businessId,
        placeId: mapping.placeId,
        destinationId: mapping.destinationId,
        categoryId: mapping.categoryId,
        name: mapping.legacyName,
        shortDescription: "",
        capabilities: ["directions", "photos"],
      },
    );
    await runtime.updateLocation(
      {
        subject: "staging-legacy-commercial-backfill",
        email: "staging-legacy-commercial-backfill@example.invalid",
        role: "PLATFORM_OWNER",
        businessIds: Object.freeze([]),
        issuedAt: Math.floor(Date.now() / 1000) - 60,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        sessionId: "staging-legacy-commercial-backfill",
      },
      mapping.businessId,
      {
        latitude: source.latitude,
        longitude: source.longitude,
        address: "",
        area: source.area ?? "",
        source: "manual",
      },
    );
    await saveMapping(pool, mapping, now);
    summary.createdDrafts += 1;
    summary.mappingsInserted += 1;
  }

  return Object.freeze(summary);
}
