export const LEGACY_COMMERCIAL_SOURCE_SYSTEM = "morro-v1-search-catalog";

export interface LegacyCommercialPlaceMapping {
  readonly sourceSystem: typeof LEGACY_COMMERCIAL_SOURCE_SYSTEM;
  readonly sourceKey: string;
  readonly legacyName: string;
  readonly legacyCategory: "restaurants" | "hotels" | "shops" | "nightlife";
  readonly destinationId: "morro-de-sao-paulo";
  readonly businessId: string;
  readonly placeId: string;
  readonly categoryId: string;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/&/gu, " e ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
}

export function legacyCommercialSourceKey(input: {
  readonly name: string;
  readonly category: string;
  readonly latitude: number;
  readonly longitude: number;
}): string {
  const name = slug(input.name);
  const category = slug(input.category);
  const latitude = Number(input.latitude).toFixed(7);
  const longitude = Number(input.longitude).toFixed(7);
  return `${category}:${name}:${latitude}:${longitude}`;
}

export function proposedLegacyCommercialMapping(input: {
  readonly name: string;
  readonly category: "restaurants" | "hotels" | "shops" | "nightlife";
  readonly latitude: number;
  readonly longitude: number;
}): LegacyCommercialPlaceMapping {
  const base = slug(input.name);
  if (!base) throw new Error("LEGACY_COMMERCIAL_MAPPING_NAME_REQUIRED");
  const toca = base === "toca-do-morcego";

  return Object.freeze({
    sourceSystem: LEGACY_COMMERCIAL_SOURCE_SYSTEM,
    sourceKey: legacyCommercialSourceKey(input),
    legacyName: input.name,
    legacyCategory: input.category,
    destinationId: "morro-de-sao-paulo",
    businessId: toca ? "toca-do-morcego" : `business-${base}`,
    placeId: toca ? "place-toca-do-morcego" : `place-${base}`,
    categoryId: input.category,
  });
}

export function validateLegacyCommercialMappings(
  mappings: readonly LegacyCommercialPlaceMapping[],
): void {
  const sourceKeys = new Set<string>();
  const businessIds = new Set<string>();
  const placeIds = new Set<string>();

  for (const mapping of mappings) {
    if (mapping.sourceSystem !== LEGACY_COMMERCIAL_SOURCE_SYSTEM) {
      throw new Error("LEGACY_COMMERCIAL_MAPPING_SOURCE_INVALID");
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
