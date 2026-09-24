import type { AuthCapability } from "@touristic/auth";
import type { DestinationId } from "@touristic/core";

type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type BusinessId = Brand<string, "BusinessId">;
export type PlaceId = Brand<string, "PlaceId">;
export type CategoryId = Brand<string, "CategoryId">;
export type SubcategoryId = Brand<string, "SubcategoryId">;
export type ProductId = Brand<string, "ProductId">;
export type OfferId = Brand<string, "OfferId">;

export const canonicalPlaceCategories = Object.freeze([
  "restaurants",
  "nightlife",
  "hotels",
  "tours",
  "transport",
  "shops",
  "attractions",
  "beaches",
  "emergencies",
] as const);

export type CanonicalPlaceCategory = (typeof canonicalPlaceCategories)[number];

export const placeCapabilities = Object.freeze([
  "directions",
  "photos",
  "menu",
  "tableReservation",
  "tickets",
  "booking",
  "whatsapp",
  "call",
  "website",
  "products",
  "offers",
  "tourBooking",
  "transportBooking",
] as const);

export type PlaceCapability = (typeof placeCapabilities)[number];

export type PlaceVisibility = "public" | "unlisted" | "private";
export type PlacePublicationState =
  | "draft"
  | "review"
  | "published"
  | "suspended"
  | "archived";

export interface Business {
  readonly id: BusinessId;
  readonly destinationIds: readonly DestinationId[];
  readonly legalName: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Category {
  readonly id: CategoryId;
  readonly key: string;
  readonly label: string;
  readonly active: boolean;
}

export interface Subcategory {
  readonly id: SubcategoryId;
  readonly categoryId: CategoryId;
  readonly key: string;
  readonly label: string;
  readonly active: boolean;
}

export interface PlaceLocation {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly address: string;
  readonly area: string;
  readonly source: "manual" | "catalog" | "provider" | "migration";
  readonly externalProvider: string | null;
  readonly externalPlaceId: string | null;
  readonly verifiedAt: string | null;
  readonly verifiedBy: string | null;
}

export interface PlaceContact {
  readonly phone: string | null;
  readonly whatsapp: string | null;
  readonly email: string | null;
  readonly website: string | null;
}

export interface PlaceHoursPeriod {
  readonly opensAt: string;
  readonly closesAt: string;
}

export interface PlaceHoursDay {
  readonly day:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  readonly closed: boolean;
  readonly periods: readonly PlaceHoursPeriod[];
}

export interface PlaceHours {
  readonly timezone: string;
  readonly days: readonly PlaceHoursDay[];
  readonly note: string | null;
}

export interface PlaceCapabilities {
  readonly enabled: readonly PlaceCapability[];
}

export interface Place {
  readonly id: PlaceId;
  readonly businessId: BusinessId;
  readonly destinationId: DestinationId;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: CategoryId;
  readonly subcategoryIds: readonly SubcategoryId[];
  readonly shortDescription: string;
  readonly description: string;
  readonly location: PlaceLocation;
  readonly contact: PlaceContact;
  readonly openingHours: PlaceHours | null;
  readonly amenities: readonly string[];
  readonly tags: readonly string[];
  readonly capabilities: PlaceCapabilities;
  readonly visibility: PlaceVisibility;
  readonly publicationState: PlacePublicationState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BusinessPlaceRelationship {
  readonly businessId: BusinessId;
  readonly placeId: PlaceId;
  readonly destinationId: DestinationId;
  readonly relationship: "owner";
}

export interface CanonicalProductReference {
  readonly productId: ProductId;
  readonly businessId: BusinessId;
  readonly placeId: PlaceId;
  readonly destinationId: DestinationId;
}

export interface CanonicalOfferReference {
  readonly offerId: OfferId;
  readonly productId: ProductId;
  readonly businessId: BusinessId;
  readonly placeId: PlaceId;
  readonly destinationId: DestinationId;
}

export interface PlaceDomainValidationIssue {
  readonly code: string;
  readonly field: string;
}

export interface PlaceAccessScope {
  readonly businessIds: readonly string[];
  readonly destinationIds: readonly string[];
  readonly capabilities: readonly AuthCapability[];
}

export interface PlaceAccessRequirement {
  readonly mutation?: boolean;
  readonly requiredCapability?: AuthCapability;
}

export interface LegacyPlaceCompatibility {
  readonly legacyProfileId: string | null;
  readonly legacyAliases: readonly string[];
  readonly legacyCategory: string | null;
  readonly legacyReference: string | null;
}

export interface LegacyPlaceMigrationInput {
  readonly placeId: string;
  readonly businessId: string;
  readonly destinationId: string;
  readonly categoryId: string;
  readonly subcategoryIds?: readonly string[];
  readonly now: string;
  readonly profile: {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly categoryLabel?: unknown;
    readonly specialty?: unknown;
    readonly description?: unknown;
    readonly locationLabel?: unknown;
  };
  readonly legacyAliases?: readonly string[];
  readonly legacyReference?: string | null;
}

export interface LegacyPlaceMigrationResult {
  readonly place: Place;
  readonly compatibility: LegacyPlaceCompatibility;
}

export interface LegacyCatalogPlaceMigrationInput {
  readonly placeId: string;
  readonly businessId: string;
  readonly destinationId: string;
  readonly categoryId: string;
  readonly subcategoryIds?: readonly string[];
  readonly now: string;
  readonly item: {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly category?: unknown;
    readonly description?: unknown;
    readonly latitude?: unknown;
    readonly longitude?: unknown;
    readonly aliases?: readonly string[];
  };
}

const canonicalCategorySet = new Set<string>(canonicalPlaceCategories);
const placeCapabilitySet = new Set<string>(placeCapabilities);

function canonicalToken(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function safeText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/[<>]/gu, "").trim().slice(0, 500);
}

function requiredCanonicalId<TId>(value: unknown, errorCode: string): TId {
  const normalized = canonicalToken(value);
  if (!normalized) throw new Error(errorCode);
  return normalized as TId;
}

export function asBusinessId(value: unknown): BusinessId {
  return requiredCanonicalId<BusinessId>(value, "INVALID_BUSINESS_ID");
}

export function asPlaceId(value: unknown): PlaceId {
  return requiredCanonicalId<PlaceId>(value, "INVALID_PLACE_ID");
}

export function asCategoryId(value: unknown): CategoryId {
  return requiredCanonicalId<CategoryId>(value, "INVALID_CATEGORY_ID");
}

export function asSubcategoryId(value: unknown): SubcategoryId {
  return requiredCanonicalId<SubcategoryId>(
    value,
    "INVALID_SUBCATEGORY_ID",
  );
}

export function asProductId(value: unknown): ProductId {
  return requiredCanonicalId<ProductId>(value, "INVALID_PRODUCT_ID");
}

export function asOfferId(value: unknown): OfferId {
  return requiredCanonicalId<OfferId>(value, "INVALID_OFFER_ID");
}

export function isCanonicalPlaceCategory(
  value: unknown,
): value is CanonicalPlaceCategory {
  return typeof value === "string" && canonicalCategorySet.has(value);
}

export function isPlaceCapability(value: unknown): value is PlaceCapability {
  return typeof value === "string" && placeCapabilitySet.has(value);
}

export function normalizePlaceCapabilities(
  values: readonly unknown[],
): readonly PlaceCapability[] {
  return Object.freeze(
    Array.from(
      new Set(
        values.filter((value): value is PlaceCapability =>
          isPlaceCapability(value),
        ),
      ),
    ),
  );
}

export function createBusinessPlaceRelationship(
  place: Pick<Place, "id" | "businessId" | "destinationId">,
): BusinessPlaceRelationship {
  return Object.freeze({
    businessId: place.businessId,
    placeId: place.id,
    destinationId: place.destinationId,
    relationship: "owner" as const,
  });
}

export function validateBusinessPlaceRelationship(
  business: Pick<Business, "id" | "destinationIds">,
  place: Pick<Place, "id" | "businessId" | "destinationId">,
  relationship: BusinessPlaceRelationship,
): readonly PlaceDomainValidationIssue[] {
  const issues: PlaceDomainValidationIssue[] = [];
  if (
    relationship.businessId !== business.id ||
    place.businessId !== business.id
  ) {
    issues.push({ code: "CROSS_BUSINESS_RELATION", field: "businessId" });
  }
  if (relationship.placeId !== place.id) {
    issues.push({ code: "PLACE_RELATION_MISMATCH", field: "placeId" });
  }
  if (
    relationship.destinationId !== place.destinationId ||
    !business.destinationIds.includes(place.destinationId)
  ) {
    issues.push({
      code: "CROSS_DESTINATION_RELATION",
      field: "destinationId",
    });
  }
  return Object.freeze(issues);
}

export function validatePlace(
  place: Place,
  categories: readonly Category[],
  subcategories: readonly Subcategory[],
): readonly PlaceDomainValidationIssue[] {
  const issues: PlaceDomainValidationIssue[] = [];
  const category = categories.find((entry) => entry.id === place.categoryId);
  if (!category || !category.active) {
    issues.push({ code: "UNKNOWN_CATEGORY", field: "categoryId" });
  }

  const seenSubcategories = new Set<string>();
  for (const subcategoryId of place.subcategoryIds) {
    if (seenSubcategories.has(subcategoryId)) {
      issues.push({ code: "DUPLICATE_SUBCATEGORY", field: "subcategoryIds" });
      continue;
    }
    seenSubcategories.add(subcategoryId);
    const subcategory = subcategories.find(
      (entry) => entry.id === subcategoryId,
    );
    if (
      !subcategory ||
      !subcategory.active ||
      subcategory.categoryId !== place.categoryId
    ) {
      issues.push({
        code: "INVALID_SUBCATEGORY_RELATION",
        field: "subcategoryIds",
      });
    }
  }

  if (
    place.location.latitude !== null &&
    (place.location.latitude < -90 || place.location.latitude > 90)
  ) {
    issues.push({ code: "INVALID_LATITUDE", field: "location.latitude" });
  }
  if (
    place.location.longitude !== null &&
    (place.location.longitude < -180 || place.location.longitude > 180)
  ) {
    issues.push({ code: "INVALID_LONGITUDE", field: "location.longitude" });
  }
  if (
    (place.location.latitude === null) !== (place.location.longitude === null)
  ) {
    issues.push({
      code: "INCOMPLETE_COORDINATES",
      field: "location",
    });
  }

  return Object.freeze(issues);
}

export function authorizePlaceAccess(
  place: Pick<Place, "businessId" | "destinationId">,
  scope: PlaceAccessScope,
  requirement: PlaceAccessRequirement = {},
): void {
  if (!scope.businessIds.includes(place.businessId)) {
    throw new Error("PLACE_ACCESS_BUSINESS_DENIED");
  }
  if (!scope.destinationIds.includes(place.destinationId)) {
    throw new Error("PLACE_ACCESS_DESTINATION_DENIED");
  }
  if (
    requirement.requiredCapability &&
    !scope.capabilities.includes(requirement.requiredCapability)
  ) {
    throw new Error("PLACE_ACCESS_CAPABILITY_DENIED");
  }
  if (requirement.mutation && !scope.capabilities.includes("business.update")) {
    throw new Error("PLACE_ACCESS_MUTATION_DENIED");
  }
}

export function findDuplicatePlace(
  candidate: Place,
  existing: readonly Place[],
): Place | null {
  for (const place of existing) {
    if (place.id === candidate.id) return place;
    if (
      place.businessId === candidate.businessId &&
      place.destinationId === candidate.destinationId &&
      candidate.location.externalProvider &&
      candidate.location.externalPlaceId &&
      place.location.externalProvider === candidate.location.externalProvider &&
      place.location.externalPlaceId === candidate.location.externalPlaceId
    ) {
      return place;
    }
  }
  return null;
}

const legacyCategoryAliases: Readonly<Record<string, CanonicalPlaceCategory>> =
  Object.freeze({
    restaurant: "restaurants",
    restaurants: "restaurants",
    nightlife: "nightlife",
    hotel: "hotels",
    hotels: "hotels",
    pousada: "hotels",
    pousadas: "hotels",
    tour: "tours",
    tours: "tours",
    passeio: "tours",
    passeios: "tours",
    transport: "transport",
    transporte: "transport",
    shop: "shops",
    shops: "shops",
    loja: "shops",
    lojas: "shops",
    attraction: "attractions",
    attractions: "attractions",
    atracao: "attractions",
    atracoes: "attractions",
    beach: "beaches",
    beaches: "beaches",
    praia: "beaches",
    praias: "beaches",
    emergency: "emergencies",
    emergencies: "emergencies",
  });

export function normalizeLegacyCategory(
  value: unknown,
): CanonicalPlaceCategory | null {
  const key = canonicalToken(value);
  return legacyCategoryAliases[key] ?? null;
}

export function migrateLegacyBusinessProfileToPlace(
  input: LegacyPlaceMigrationInput,
): LegacyPlaceMigrationResult {
  const businessId = asBusinessId(input.businessId);
  const placeId = asPlaceId(input.placeId);
  const destinationId = requiredCanonicalId<DestinationId>(
    input.destinationId,
    "INVALID_DESTINATION_ID",
  );
  const categoryId = asCategoryId(input.categoryId);
  const name = safeText(input.profile.name, "Negócio local");
  const legacyCategory = safeText(input.profile.categoryLabel) || null;
  const legacySpecialty = safeText(input.profile.specialty);
  const slug = canonicalToken(name) || String(placeId);
  const subcategoryIds = Object.freeze(
    (input.subcategoryIds ?? []).map(asSubcategoryId),
  );

  const place = Object.freeze<Place>({
    id: placeId,
    businessId,
    destinationId,
    name,
    slug,
    categoryId,
    subcategoryIds,
    shortDescription: legacySpecialty,
    description: safeText(input.profile.description),
    location: Object.freeze({
      latitude: null,
      longitude: null,
      address: safeText(input.profile.locationLabel),
      area: "",
      source: "migration" as const,
      externalProvider: null,
      externalPlaceId: null,
      verifiedAt: null,
      verifiedBy: null,
    }),
    contact: Object.freeze({
      phone: null,
      whatsapp: null,
      email: null,
      website: null,
    }),
    openingHours: null,
    amenities: Object.freeze([]),
    tags: Object.freeze(
      legacySpecialty ? [canonicalToken(legacySpecialty)] : [],
    ),
    capabilities: Object.freeze({
      enabled: Object.freeze([]),
    }),
    visibility: "private",
    publicationState: "draft",
    createdAt: input.now,
    updatedAt: input.now,
  });

  return Object.freeze({
    place,
    compatibility: Object.freeze({
      legacyProfileId: safeText(input.profile.id) || null,
      legacyAliases: Object.freeze(
        (input.legacyAliases ?? [])
          .map((alias) => safeText(alias))
          .filter(Boolean),
      ),
      legacyCategory,
      legacyReference: input.legacyReference ?? null,
    }),
  });
}

export function migrateLegacyCatalogItemToPlace(
  input: LegacyCatalogPlaceMigrationInput,
): LegacyPlaceMigrationResult {
  const migrated = migrateLegacyBusinessProfileToPlace({
    placeId: input.placeId,
    businessId: input.businessId,
    destinationId: input.destinationId,
    categoryId: input.categoryId,
    ...(input.subcategoryIds ? { subcategoryIds: input.subcategoryIds } : {}),
    now: input.now,
    profile: {
      id: input.item.id,
      name: input.item.name,
      categoryLabel: input.item.category,
      description: input.item.description,
    },
    legacyAliases: input.item.aliases ?? [],
    legacyReference:
      typeof input.item.id === "string" ? input.item.id : null,
  });

  const latitude =
    typeof input.item.latitude === "number" &&
    Number.isFinite(input.item.latitude) &&
    input.item.latitude >= -90 &&
    input.item.latitude <= 90
      ? input.item.latitude
      : null;
  const longitude =
    typeof input.item.longitude === "number" &&
    Number.isFinite(input.item.longitude) &&
    input.item.longitude >= -180 &&
    input.item.longitude <= 180
      ? input.item.longitude
      : null;
  const hasCoordinates = latitude !== null && longitude !== null;

  return Object.freeze({
    place: Object.freeze({
      ...migrated.place,
      location: Object.freeze({
        ...migrated.place.location,
        latitude: hasCoordinates ? latitude : null,
        longitude: hasCoordinates ? longitude : null,
        source: "catalog" as const,
      }),
    }),
    compatibility: migrated.compatibility,
  });
}
