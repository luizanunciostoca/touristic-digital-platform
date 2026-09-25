import type { DestinationId } from "@touristic/core";
import {
  authorizePlaceAccess,
  type BusinessId,
  type Place,
  type PlaceAccessScope,
  type PlaceId,
  type PlaceLocationSource,
} from "@touristic/business";
import {
  createMapboxSearchProvider,
  diceSearchSimilarity,
  morroV1SearchCatalog,
  normalizeSearchText,
  searchCatalog,
  type MapboxSearchResult,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

export type BusinessLocationCandidateSource = "canonical" | "legacy" | "mapbox";

export interface BusinessLocationDiscoveryDestination {
  readonly id: DestinationId;
  readonly center: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly radiusMeters: number;
}

export interface BusinessLocationDiscoveryCandidate {
  readonly candidateId: string;
  readonly source: BusinessLocationCandidateSource;
  readonly name: string;
  readonly address: string;
  readonly category: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly externalProvider: string | null;
  readonly externalPlaceId: string | null;
  readonly distanceMeters: number;
  readonly confidence: number;
  readonly eligible: boolean;
  readonly rejectionReason: "OUTSIDE_DESTINATION" | null;
}

export interface BusinessLocationDiscoveryRequest {
  readonly businessId: BusinessId;
  readonly destinationId: DestinationId;
  readonly query: string;
  readonly scope: PlaceAccessScope;
  readonly language?: string;
  readonly limit?: number;
}

export interface BusinessLocationConfirmationRequest {
  readonly placeId: PlaceId;
  readonly businessId: BusinessId;
  readonly destinationId: DestinationId;
  readonly scope: PlaceAccessScope;
  readonly selection: BusinessLocationSelection;
  readonly verifiedAt: string;
  readonly verifiedBy: string;
}

export interface BusinessLocationSelection {
  readonly source: Extract<
    PlaceLocationSource,
    "mapbox" | "manual" | "device" | "imported"
  >;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string;
  readonly area: string;
  readonly externalProvider: string | null;
  readonly externalPlaceId: string | null;
}

export interface BusinessLocationPlaceRepository {
  readonly getById: (placeId: PlaceId) => Promise<Place | null>;
  readonly listByDestination: (
    destinationId: DestinationId,
  ) => Promise<readonly Place[]>;
  readonly save: (place: Place) => Promise<Place>;
}

export interface BusinessLocationGeolocationPort {
  readonly getCurrentPosition: (
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ) => void;
}

export interface BusinessLocationDiscoveryAdapterOptions {
  readonly destination: BusinessLocationDiscoveryDestination;
  readonly repository: BusinessLocationPlaceRepository;
  readonly mapboxAccessToken?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly geolocation?: BusinessLocationGeolocationPort;
  readonly legacyCatalog?: readonly MorroV1SearchCatalogItem[];
  readonly providerTimeoutMs?: number;
}

export interface DeviceLocationResult {
  readonly status: "resolved" | "denied" | "unavailable";
  readonly selection: BusinessLocationSelection | null;
  readonly accuracy: number | null;
}

const MAX_QUERY_LENGTH = 160;
const DEFAULT_PROVIDER_TIMEOUT_MS = 4_000;
const EARTH_RADIUS_METERS = 6_371_000;

function assertFiniteCoordinate(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("INVALID_LATITUDE");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("INVALID_LONGITUDE");
  }
}

function assertSearchScope(
  request: Pick<
    BusinessLocationDiscoveryRequest,
    "businessId" | "destinationId" | "scope"
  >,
  destination: BusinessLocationDiscoveryDestination,
): void {
  if (request.destinationId !== destination.id) {
    throw new Error("LOCATION_DESTINATION_DENIED");
  }
  if (!request.scope.businessIds.includes(request.businessId)) {
    throw new Error("LOCATION_BUSINESS_DENIED");
  }
  if (!request.scope.destinationIds.includes(request.destinationId)) {
    throw new Error("LOCATION_DESTINATION_DENIED");
  }
}

function sanitizeLocationText(value: string, maxLength: number): string {
  const withoutTags = value.replace(/<[^>]*>/gu, " ").replace(/[<>]/gu, " ");
  const withoutControls = Array.from(withoutTags, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  }).join("");

  return withoutControls.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

export function normalizeLocationDiscoveryQuery(value: string): string {
  return sanitizeLocationText(value, MAX_QUERY_LENGTH);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMeters(
  latitude: number,
  longitude: number,
  centerLatitude: number,
  centerLongitude: number,
): number {
  assertFiniteCoordinate(latitude, longitude);
  assertFiniteCoordinate(centerLatitude, centerLongitude);
  const deltaLat = toRadians(latitude - centerLatitude);
  const deltaLon = toRadians(longitude - centerLongitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(centerLatitude)) *
      Math.cos(toRadians(latitude)) *
      Math.sin(deltaLon / 2) ** 2;

  return Math.round(
    EARTH_RADIUS_METERS *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

function candidateEligibility(
  latitude: number,
  longitude: number,
  destination: BusinessLocationDiscoveryDestination,
): Pick<
  BusinessLocationDiscoveryCandidate,
  "distanceMeters" | "eligible" | "rejectionReason"
> {
  const distance = distanceMeters(
    latitude,
    longitude,
    destination.center.latitude,
    destination.center.longitude,
  );
  const eligible = distance <= destination.radiusMeters;
  return {
    distanceMeters: distance,
    eligible,
    rejectionReason: eligible ? null : "OUTSIDE_DESTINATION",
  };
}

function confidenceForCanonical(query: string, name: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedName = normalizeSearchText(name);
  if (!normalizedQuery || !normalizedName) return 0;
  if (normalizedQuery === normalizedName) return 1;
  if (normalizedName.startsWith(normalizedQuery)) return 0.9;
  if (normalizedName.includes(normalizedQuery)) return 0.8;
  return Math.min(0.79, diceSearchSimilarity(normalizedQuery, normalizedName));
}

function canonicalCandidate(
  place: Place,
  query: string,
  destination: BusinessLocationDiscoveryDestination,
): BusinessLocationDiscoveryCandidate | null {
  const latitude = place.location.latitude;
  const longitude = place.location.longitude;
  if (latitude === null || longitude === null) return null;
  assertFiniteCoordinate(latitude, longitude);
  const confidence = confidenceForCanonical(query, place.name);
  if (confidence < 0.55) return null;

  return Object.freeze({
    candidateId: `canonical:${place.id}`,
    source: "canonical" as const,
    name: place.name,
    address: place.location.address,
    category: String(place.categoryId),
    latitude,
    longitude,
    externalProvider: "morro-digital",
    externalPlaceId: String(place.id),
    confidence,
    ...candidateEligibility(latitude, longitude, destination),
  });
}

function legacyConfidence(matchType: string, score: number): number {
  if (matchType === "exact") return 1;
  if (matchType === "alias") return 0.97;
  return Math.max(0.55, Math.min(0.95, score / 100));
}

function legacyCandidate(
  result: ReturnType<typeof searchCatalog<MorroV1SearchCatalogItem>>[number],
  destination: BusinessLocationDiscoveryDestination,
): BusinessLocationDiscoveryCandidate | null {
  if (
    typeof result.item.latitude !== "number" ||
    typeof result.item.longitude !== "number"
  ) {
    return null;
  }
  const latitude = result.item.latitude;
  const longitude = result.item.longitude;
  assertFiniteCoordinate(latitude, longitude);

  return Object.freeze({
    candidateId: `legacy:${normalizeSearchText(result.item.name)}:${latitude}:${longitude}`,
    source: "legacy" as const,
    name: result.item.name,
    address: result.item.area ?? "",
    category: result.item.category,
    latitude,
    longitude,
    externalProvider: "morro-v1-catalog",
    externalPlaceId: result.item.id ?? null,
    confidence: legacyConfidence(result.matchType, result.score),
    ...candidateEligibility(latitude, longitude, destination),
  });
}

function mapboxCandidate(
  result: MapboxSearchResult,
  query: string,
  destination: BusinessLocationDiscoveryDestination,
): BusinessLocationDiscoveryCandidate {
  assertFiniteCoordinate(result.lat, result.lon);
  const textScore = diceSearchSimilarity(query, result.name);
  const confidence = Math.max(0.5, Math.min(0.9, textScore));

  return Object.freeze({
    candidateId: `mapbox:${result.mapboxId || normalizeSearchText(result.name)}:${result.lat}:${result.lon}`,
    source: "mapbox" as const,
    name: result.name,
    address: result.fullAddress || result.placeFormatted || result.description,
    category: result.category,
    latitude: result.lat,
    longitude: result.lon,
    externalProvider: "mapbox",
    externalPlaceId: result.mapboxId || null,
    confidence,
    ...candidateEligibility(result.lat, result.lon, destination),
  });
}

function dedupeCandidates(
  candidates: readonly BusinessLocationDiscoveryCandidate[],
): readonly BusinessLocationDiscoveryCandidate[] {
  const seenProviderIds = new Set<string>();
  const seenLocations = new Set<string>();
  const result: BusinessLocationDiscoveryCandidate[] = [];

  for (const candidate of candidates) {
    const providerKey =
      candidate.externalProvider && candidate.externalPlaceId
        ? `${candidate.externalProvider}:${candidate.externalPlaceId}`
        : "";
    const locationKey = `${normalizeSearchText(candidate.name)}:${candidate.latitude.toFixed(5)}:${candidate.longitude.toFixed(5)}`;
    if (
      (providerKey && seenProviderIds.has(providerKey)) ||
      seenLocations.has(locationKey)
    ) {
      continue;
    }
    if (providerKey) seenProviderIds.add(providerKey);
    seenLocations.add(locationKey);
    result.push(candidate);
  }

  return Object.freeze(result);
}

function rankCandidates(
  candidates: readonly BusinessLocationDiscoveryCandidate[],
): readonly BusinessLocationDiscoveryCandidate[] {
  return Object.freeze(
    [...candidates].sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
      const confidence = right.confidence - left.confidence;
      if (Math.abs(confidence) > 0.001) return confidence;
      if (left.distanceMeters !== right.distanceMeters) {
        return left.distanceMeters - right.distanceMeters;
      }
      return left.name.localeCompare(right.name, "pt-BR");
    }),
  );
}

function createTimedFetch(
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): typeof globalThis.fetch {
  return async (input, init) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fetchImpl(input, init),
        new Promise<Response>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("MAPBOX_TIMEOUT")),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

function selectionFromCandidate(
  candidate: BusinessLocationDiscoveryCandidate,
): BusinessLocationSelection {
  if (!candidate.eligible) throw new Error("LOCATION_OUTSIDE_DESTINATION");
  return Object.freeze({
    source:
      candidate.source === "mapbox"
        ? ("mapbox" as const)
        : ("imported" as const),
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    address: candidate.address,
    area: "",
    externalProvider: candidate.externalProvider,
    externalPlaceId: candidate.externalPlaceId,
  });
}

export function createManualLocationSelection(
  latitude: number,
  longitude: number,
  input: {
    readonly address?: string;
    readonly area?: string;
    readonly source?: "manual" | "device";
  } = {},
): BusinessLocationSelection {
  assertFiniteCoordinate(latitude, longitude);
  return Object.freeze({
    source: input.source ?? "manual",
    latitude,
    longitude,
    address: sanitizeLocationText(input.address ?? "", 500),
    area: sanitizeLocationText(input.area ?? "", 160),
    externalProvider: null,
    externalPlaceId: null,
  });
}

export function createBusinessLocationDiscoveryAdapter(
  options: BusinessLocationDiscoveryAdapterOptions,
) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const externalProvider = options.mapboxAccessToken
    ? createMapboxSearchProvider({
        token: options.mapboxAccessToken,
        fetch: createTimedFetch(
          fetchImpl,
          options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
        ),
      })
    : null;
  const legacyCatalog = options.legacyCatalog ?? morroV1SearchCatalog;

  async function search(
    request: BusinessLocationDiscoveryRequest,
  ): Promise<readonly BusinessLocationDiscoveryCandidate[]> {
    assertSearchScope(request, options.destination);
    const query = normalizeLocationDiscoveryQuery(request.query);
    if (query.length < 2) return Object.freeze([]);

    const canonicalPlaces = await options.repository.listByDestination(
      request.destinationId,
    );
    const canonicalResults = canonicalPlaces
      .map((place) => canonicalCandidate(place, query, options.destination))
      .filter(
        (candidate): candidate is BusinessLocationDiscoveryCandidate =>
          candidate !== null,
      );

    const legacyResults = searchCatalog(legacyCatalog, query)
      .slice(0, 8)
      .map((result) => legacyCandidate(result, options.destination))
      .filter(
        (candidate): candidate is BusinessLocationDiscoveryCandidate =>
          candidate !== null,
      );

    let externalResults: readonly BusinessLocationDiscoveryCandidate[] =
      Object.freeze([]);
    if (externalProvider) {
      const proximity = {
        lat: options.destination.center.latitude,
        lon: options.destination.center.longitude,
      };
      externalResults = Object.freeze(
        (
          await externalProvider.search(query, {
            language: request.language ?? "pt",
            limit: Math.min(Math.max(request.limit ?? 8, 1), 10),
            types: "poi,place,address",
            proximity,
          })
        ).map((result) => mapboxCandidate(result, query, options.destination)),
      );
    }

    return rankCandidates(
      dedupeCandidates([
        ...canonicalResults,
        ...legacyResults,
        ...externalResults,
      ]),
    ).slice(0, Math.min(Math.max(request.limit ?? 8, 1), 20));
  }

  async function confirmCandidate(
    request: Omit<BusinessLocationConfirmationRequest, "selection"> & {
      readonly candidate: BusinessLocationDiscoveryCandidate;
    },
  ): Promise<Place> {
    return confirmSelection({
      ...request,
      selection: selectionFromCandidate(request.candidate),
    });
  }

  async function confirmSelection(
    request: BusinessLocationConfirmationRequest,
  ): Promise<Place> {
    if (request.destinationId !== options.destination.id) {
      throw new Error("LOCATION_DESTINATION_DENIED");
    }

    const persisted = await options.repository.getById(request.placeId);
    if (!persisted) throw new Error("PLACE_NOT_FOUND");
    if (persisted.businessId !== request.businessId) {
      throw new Error("CROSS_BUSINESS_LOCATION_MUTATION");
    }
    if (persisted.destinationId !== request.destinationId) {
      throw new Error("CROSS_DESTINATION_LOCATION_MUTATION");
    }

    authorizePlaceAccess(persisted, request.scope, { mutation: true });
    assertFiniteCoordinate(
      request.selection.latitude,
      request.selection.longitude,
    );
    const eligibility = candidateEligibility(
      request.selection.latitude,
      request.selection.longitude,
      options.destination,
    );
    if (!eligibility.eligible) {
      throw new Error("LOCATION_OUTSIDE_DESTINATION");
    }

    const updated = Object.freeze<Place>({
      ...persisted,
      location: Object.freeze({
        latitude: request.selection.latitude,
        longitude: request.selection.longitude,
        address: request.selection.address,
        area: request.selection.area,
        source: request.selection.source,
        externalProvider: request.selection.externalProvider,
        externalPlaceId: request.selection.externalPlaceId,
        verifiedAt: request.verifiedAt,
        verifiedBy: request.verifiedBy,
      }),
      updatedAt: request.verifiedAt,
    });

    const saved = await options.repository.save(updated);
    if (
      saved.id !== persisted.id ||
      saved.businessId !== persisted.businessId ||
      saved.destinationId !== persisted.destinationId
    ) {
      throw new Error("PLACE_REPOSITORY_IDENTITY_DRIFT");
    }
    return saved;
  }

  async function requestDeviceLocation(): Promise<DeviceLocationResult> {
    if (!options.geolocation) {
      return Object.freeze({
        status: "unavailable" as const,
        selection: null,
        accuracy: null,
      });
    }

    return new Promise((resolve) => {
      options.geolocation?.getCurrentPosition(
        (position) => {
          try {
            const selection = createManualLocationSelection(
              position.coords.latitude,
              position.coords.longitude,
              { source: "device" },
            );
            resolve(
              Object.freeze({
                status: "resolved" as const,
                selection,
                accuracy: position.coords.accuracy,
              }),
            );
          } catch {
            resolve(
              Object.freeze({
                status: "unavailable" as const,
                selection: null,
                accuracy: null,
              }),
            );
          }
        },
        (error) => {
          resolve(
            Object.freeze({
              status:
                error.code === error.PERMISSION_DENIED
                  ? ("denied" as const)
                  : ("unavailable" as const),
              selection: null,
              accuracy: null,
            }),
          );
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
      );
    });
  }

  return Object.freeze({
    search,
    confirmCandidate,
    confirmSelection,
    requestDeviceLocation,
    createManualSelection: createManualLocationSelection,
  });
}
