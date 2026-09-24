import type {
  CategoryId,
  Place,
  PlaceCapability,
  PlaceContact,
  PlaceHours,
  PlaceId,
} from "./place-domain.js";

export interface PublicPlaceMediaImage {
  readonly mediaId: string;
  readonly provider: string;
  readonly providerReference: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface PublicPlaceMediaProjection {
  readonly placeId: string;
  readonly coverImage: PublicPlaceMediaImage | null;
  readonly gallery: readonly PublicPlaceMediaImage[];
  readonly logo: PublicPlaceMediaImage | null;
}

export interface PublicOfferPrice {
  readonly minorUnits: number;
  readonly currency: string;
}

export interface PublicOfferSummary {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly description: string;
  readonly price: PublicOfferPrice | null;
  readonly salesEndsAt: string | null;
}

export interface PublicMenuItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly price: PublicOfferPrice;
  readonly mediaId: string | null;
  readonly available: boolean;
  readonly tags: readonly string[];
  readonly allergens: readonly string[];
}

export interface PublicMenuCategory {
  readonly id: string;
  readonly name: string;
  readonly items: readonly PublicMenuItem[];
}

export interface PublicMenu {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly fallbackMediaId: string | null;
  readonly fallbackDocumentUrl: string | null;
  readonly categories: readonly PublicMenuCategory[];
}

export interface PublicPlaceCommerceProjection {
  readonly offers: readonly PublicOfferSummary[];
  readonly menu: PublicMenu | null;
}

export interface PublicPlaceAction {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly href?: string | null;
  readonly method?: "GET" | "POST";
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PublicPlacePublishedRecord {
  readonly place: Place;
  /**
   * Exact public revision identifier owned by the publication authority.
   * Never derive public state from an editable draft.
   */
  readonly publishedRevisionId: string;
  readonly publishedRevision: number;
}

export interface PublicPlaceRepository {
  listPublished(input: {
    readonly destinationId: string;
    readonly bbox: PublicPlaceBoundingBox;
    readonly categoryId?: string;
    readonly limit: number;
    readonly cursor?: string | null;
  }): Promise<{
    readonly items: readonly PublicPlacePublishedRecord[];
    readonly nextCursor: string | null;
  }>;
  getPublished(placeId: PlaceId): Promise<PublicPlacePublishedRecord | null>;
}

export interface PublicPlaceMediaPort {
  getPublishedMedia(place: Pick<Place, "id" | "businessId">): Promise<PublicPlaceMediaProjection | null>;
}

export interface PublicPlaceCommercePort {
  getPublicCommerce(place: Pick<Place, "id" | "businessId" | "destinationId">): Promise<PublicPlaceCommerceProjection | null>;
}

export interface PublicPlaceActionPort {
  resolvePublicActions(input: {
    readonly place: PublicPlaceProfile;
    readonly media: PublicPlaceMediaProjection | null;
    readonly commerce: PublicPlaceCommerceProjection | null;
    readonly locale: string;
  }): Promise<readonly PublicPlaceAction[]>;
}

export interface PublicPlaceMarkerPresentation {
  readonly markerKey: string;
  readonly priority: number;
}

export interface PublicPlaceMapItem {
  readonly id: PlaceId;
  readonly name: string;
  readonly categoryId: CategoryId;
  readonly latitude: number;
  readonly longitude: number;
  readonly presentation: PublicPlaceMarkerPresentation;
}

export interface PublicPlaceProfile {
  readonly id: PlaceId;
  readonly destinationId: string;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: CategoryId;
  readonly subcategoryIds: readonly string[];
  readonly shortDescription: string;
  readonly description: string;
  readonly location: {
    readonly latitude: number;
    readonly longitude: number;
    readonly address: string;
    readonly area: string;
  };
  readonly contact: PlaceContact;
  readonly openingHours: PlaceHours | null;
  readonly amenities: readonly string[];
  readonly tags: readonly string[];
  readonly capabilities: readonly PlaceCapability[];
}

export interface PublicPlaceDetail {
  readonly profile: PublicPlaceProfile;
  readonly media: PublicPlaceMediaProjection | null;
  readonly commerce: PublicPlaceCommerceProjection | null;
  readonly actions: readonly PublicPlaceAction[];
  readonly revision: {
    readonly id: string;
    readonly number: number;
  };
}

export interface PublicPlaceBoundingBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

export interface PublicPlaceMapQuery {
  readonly destinationId: string;
  readonly bbox: PublicPlaceBoundingBox;
  readonly categoryId?: string;
  readonly zoom: number;
  readonly limit: number;
  readonly cursor?: string | null;
}

export interface PublicPlaceMapPage {
  readonly items: readonly PublicPlaceMapItem[];
  readonly nextCursor: string | null;
}

export interface PublicPlaceCacheMetadata {
  readonly etag: string;
  readonly cacheControl: string;
}

export interface PublicPlaceReadModelOptions {
  readonly repository: PublicPlaceRepository;
  readonly media: PublicPlaceMediaPort;
  readonly commerce: PublicPlaceCommercePort;
  readonly actions: PublicPlaceActionPort;
  readonly markerPresentation?: (
    place: PublicPlaceProfile,
    zoom: number,
  ) => PublicPlaceMarkerPresentation;
  readonly mapCacheSeconds?: number;
  readonly detailCacheSeconds?: number;
}

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 1000;
const DEFAULT_MAP_CACHE_SECONDS = 30;
const DEFAULT_DETAIL_CACHE_SECONDS = 60;

function finiteNumber(value: unknown, code: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function assertCoordinate(value: number, min: number, max: number, code: string): number {
  if (value < min || value > max) throw new Error(code);
  return value;
}

export function parsePublicPlaceMapQuery(input: {
  readonly destinationId?: unknown;
  readonly bbox?: unknown;
  readonly categoryId?: unknown;
  readonly zoom?: unknown;
  readonly limit?: unknown;
  readonly cursor?: unknown;
}): PublicPlaceMapQuery {
  const destinationId =
    typeof input.destinationId === "string" ? input.destinationId.trim() : "";
  if (!destinationId) throw new Error("PUBLIC_PLACE_DESTINATION_REQUIRED");

  const bboxParts =
    typeof input.bbox === "string"
      ? input.bbox.split(",").map((part) => part.trim())
      : Array.isArray(input.bbox)
        ? input.bbox
        : [];
  if (bboxParts.length !== 4) throw new Error("PUBLIC_PLACE_INVALID_BBOX");

  const west = assertCoordinate(
    finiteNumber(bboxParts[0], "PUBLIC_PLACE_INVALID_BBOX"),
    -180,
    180,
    "PUBLIC_PLACE_INVALID_BBOX",
  );
  const south = assertCoordinate(
    finiteNumber(bboxParts[1], "PUBLIC_PLACE_INVALID_BBOX"),
    -90,
    90,
    "PUBLIC_PLACE_INVALID_BBOX",
  );
  const east = assertCoordinate(
    finiteNumber(bboxParts[2], "PUBLIC_PLACE_INVALID_BBOX"),
    -180,
    180,
    "PUBLIC_PLACE_INVALID_BBOX",
  );
  const north = assertCoordinate(
    finiteNumber(bboxParts[3], "PUBLIC_PLACE_INVALID_BBOX"),
    -90,
    90,
    "PUBLIC_PLACE_INVALID_BBOX",
  );
  if (west >= east || south >= north) {
    throw new Error("PUBLIC_PLACE_INVALID_BBOX");
  }

  const zoom = finiteNumber(input.zoom ?? 14, "PUBLIC_PLACE_INVALID_ZOOM");
  if (zoom < 0 || zoom > 24) throw new Error("PUBLIC_PLACE_INVALID_ZOOM");

  const requestedLimit = finiteNumber(
    input.limit ?? DEFAULT_LIMIT,
    "PUBLIC_PLACE_INVALID_LIMIT",
  );
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new Error("PUBLIC_PLACE_INVALID_LIMIT");
  }

  const categoryId =
    typeof input.categoryId === "string" && input.categoryId.trim()
      ? input.categoryId.trim()
      : undefined;
  const cursor =
    typeof input.cursor === "string" && input.cursor.trim()
      ? input.cursor.trim()
      : null;

  return Object.freeze({
    destinationId,
    bbox: Object.freeze({ west, south, east, north }),
    ...(categoryId ? { categoryId } : {}),
    zoom,
    limit: Math.min(requestedLimit, MAX_LIMIT),
    ...(cursor ? { cursor } : {}),
  });
}

function hasPublicCoordinates(place: Place): boolean {
  return (
    typeof place.location.latitude === "number" &&
    Number.isFinite(place.location.latitude) &&
    typeof place.location.longitude === "number" &&
    Number.isFinite(place.location.longitude)
  );
}

function toPublicProfile(place: Place): PublicPlaceProfile | null {
  if (!hasPublicCoordinates(place)) return null;
  if (place.visibility !== "public") return null;

  return Object.freeze({
    id: place.id,
    destinationId: String(place.destinationId),
    name: place.name,
    slug: place.slug,
    categoryId: place.categoryId,
    subcategoryIds: Object.freeze([...place.subcategoryIds]),
    shortDescription: place.shortDescription,
    description: place.description,
    location: Object.freeze({
      latitude: place.location.latitude as number,
      longitude: place.location.longitude as number,
      address: place.location.address,
      area: place.location.area,
    }),
    contact: Object.freeze({ ...place.contact }),
    openingHours: place.openingHours
      ? Object.freeze({
          ...place.openingHours,
          days: Object.freeze(
            place.openingHours.days.map((day) =>
              Object.freeze({
                ...day,
                periods: Object.freeze(
                  day.periods.map((period) => Object.freeze({ ...period })),
                ),
              }),
            ),
          ),
        })
      : null,
    amenities: Object.freeze([...place.amenities]),
    tags: Object.freeze([...place.tags]),
    capabilities: Object.freeze([...place.capabilities.enabled]),
  });
}

function defaultMarkerPresentation(
  place: PublicPlaceProfile,
): PublicPlaceMarkerPresentation {
  return Object.freeze({
    markerKey: String(place.categoryId),
    priority: 0,
  });
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function publicPlaceCacheMetadata(
  scope: "map" | "detail",
  revisionIdentity: string,
  cacheSeconds: number,
): PublicPlaceCacheMetadata {
  const safeSeconds = Number.isSafeInteger(cacheSeconds) && cacheSeconds >= 0
    ? cacheSeconds
    : 0;
  return Object.freeze({
    etag: `W/"places-${scope}-${stableHash(revisionIdentity)}"`,
    cacheControl: `public, max-age=${safeSeconds}, stale-while-revalidate=${safeSeconds * 2}`,
  });
}

function assertRecordScope(
  record: PublicPlacePublishedRecord,
  destinationId?: string,
): PublicPlaceProfile | null {
  const profile = toPublicProfile(record.place);
  if (!profile) return null;
  if (destinationId && profile.destinationId !== destinationId) return null;
  return profile;
}

export function createPublicPlaceReadModel(options: PublicPlaceReadModelOptions) {
  const markerPresentation =
    options.markerPresentation ?? defaultMarkerPresentation;
  const mapCacheSeconds =
    options.mapCacheSeconds ?? DEFAULT_MAP_CACHE_SECONDS;
  const detailCacheSeconds =
    options.detailCacheSeconds ?? DEFAULT_DETAIL_CACHE_SECONDS;

  return Object.freeze({
    async listMap(
      queryInput: Parameters<typeof parsePublicPlaceMapQuery>[0],
    ): Promise<{
      readonly page: PublicPlaceMapPage;
      readonly cache: PublicPlaceCacheMetadata;
    }> {
      const query = parsePublicPlaceMapQuery(queryInput);
      const page = await options.repository.listPublished({
        destinationId: query.destinationId,
        bbox: query.bbox,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        limit: query.limit,
        cursor: query.cursor ?? null,
      });

      const items: PublicPlaceMapItem[] = [];
      const revisionTokens: string[] = [];
      for (const record of page.items) {
        const profile = assertRecordScope(record, query.destinationId);
        if (!profile) continue;
        if (query.categoryId && String(profile.categoryId) !== query.categoryId) {
          continue;
        }
        if (
          profile.location.longitude < query.bbox.west ||
          profile.location.longitude > query.bbox.east ||
          profile.location.latitude < query.bbox.south ||
          profile.location.latitude > query.bbox.north
        ) {
          continue;
        }
        items.push(
          Object.freeze({
            id: profile.id,
            name: profile.name,
            categoryId: profile.categoryId,
            latitude: profile.location.latitude,
            longitude: profile.location.longitude,
            presentation: markerPresentation(profile, query.zoom),
          }),
        );
        revisionTokens.push(
          `${record.publishedRevisionId}:${record.publishedRevision}`,
        );
      }

      const frozenPage = Object.freeze({
        items: Object.freeze(items),
        nextCursor: page.nextCursor,
      });
      return Object.freeze({
        page: frozenPage,
        cache: publicPlaceCacheMetadata(
          "map",
          [
            query.destinationId,
            query.categoryId ?? "*",
            query.zoom,
            query.bbox.west,
            query.bbox.south,
            query.bbox.east,
            query.bbox.north,
            query.cursor ?? "",
            ...revisionTokens,
          ].join("|"),
          mapCacheSeconds,
        ),
      });
    },

    async getDetail(
      placeId: PlaceId,
      locale = "pt-BR",
    ): Promise<{
      readonly detail: PublicPlaceDetail | null;
      readonly cache: PublicPlaceCacheMetadata | null;
    }> {
      const record = await options.repository.getPublished(placeId);
      if (!record) return Object.freeze({ detail: null, cache: null });
      const profile = assertRecordScope(record);
      if (!profile) return Object.freeze({ detail: null, cache: null });

      const [media, commerce] = await Promise.all([
        options.media.getPublishedMedia(record.place),
        options.commerce.getPublicCommerce(record.place),
      ]);
      const actions = await options.actions.resolvePublicActions({
        place: profile,
        media,
        commerce,
        locale,
      });

      const detail = Object.freeze<PublicPlaceDetail>({
        profile,
        media,
        commerce,
        actions: Object.freeze([...actions]),
        revision: Object.freeze({
          id: record.publishedRevisionId,
          number: record.publishedRevision,
        }),
      });
      return Object.freeze({
        detail,
        cache: publicPlaceCacheMetadata(
          "detail",
          `${record.publishedRevisionId}:${record.publishedRevision}`,
          detailCacheSeconds,
        ),
      });
    },
  });
}
