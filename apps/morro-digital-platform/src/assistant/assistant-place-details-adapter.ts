import { resolveMorroAssistantDestinationV1 } from "./assistant-v1-place-resolver.js";

export interface AssistantPlaceDetails {
  readonly name: string;
  readonly address: string | null;
  readonly category: string | null;
  readonly openNow: boolean | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly mapboxId: string | null;
}

export interface AssistantPlaceDetailsAdapterOptions {
  readonly accessToken?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly language?: string;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function coordinates(feature: UnknownRecord): readonly [number, number] | null {
  const geometry = asRecord(feature.geometry);
  const raw = geometry?.coordinates;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const longitude: unknown = raw[0];
  const latitude: unknown = raw[1];
  return typeof longitude === "number" && typeof latitude === "number"
    ? [longitude, latitude]
    : null;
}

function distanceSquared(
  feature: UnknownRecord,
  longitude: number,
  latitude: number,
): number {
  const point = coordinates(feature);
  if (!point) return Number.POSITIVE_INFINITY;
  return (point[0] - longitude) ** 2 + (point[1] - latitude) ** 2;
}

function selectNearestFeature(
  payload: unknown,
  longitude: number,
  latitude: number,
): UnknownRecord | null {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.features)) return null;
  const features = record.features
    .map(asRecord)
    .filter((feature): feature is UnknownRecord => feature !== null);
  if (features.length === 0) return null;
  return features.reduce((best, candidate) =>
    distanceSquared(candidate, longitude, latitude) <
    distanceSquared(best, longitude, latitude)
      ? candidate
      : best,
  );
}

function categoryLabel(
  properties: UnknownRecord,
  fallback: string | null,
): string | null {
  const categories = properties.poi_category;
  if (Array.isArray(categories)) {
    const first = categories.find(
      (category): category is string =>
        typeof category === "string" && Boolean(category.trim()),
    );
    if (first) return first;
  }

  const labels: Readonly<Record<string, string>> = {
    beaches: "Praia",
    restaurants: "Restaurante",
    hotels: "Hospedagem",
    shops: "Loja",
    transport: "Transporte",
    attractions: "Atração",
    nightlife: "Vida Noturna",
    emergencies: "Emergência",
    tours: "Passeio",
  };
  return fallback ? (labels[fallback] ?? fallback) : null;
}

function normalizeDetails(
  feature: UnknownRecord,
  place: string,
  fallbackCategory: string | null,
): AssistantPlaceDetails {
  const properties = asRecord(feature.properties) ?? {};
  const metadata = asRecord(properties.metadata);
  const openHours = asRecord(metadata?.open_hours);

  return Object.freeze({
    name: place,
    address:
      stringValue(properties.full_address) ??
      stringValue(properties.place_formatted) ??
      stringValue(properties.address),
    category: categoryLabel(properties, fallbackCategory),
    openNow: booleanValue(openHours?.open_now),
    phone: stringValue(metadata?.phone),
    website: stringValue(metadata?.website),
    mapboxId: stringValue(properties.mapbox_id),
  });
}

export async function fetchAssistantPlaceDetails(
  place: string,
  options: AssistantPlaceDetailsAdapterOptions = {},
): Promise<AssistantPlaceDetails | null> {
  const destination = resolveMorroAssistantDestinationV1(place);
  const token = options.accessToken?.trim();
  if (!destination || !token) return null;

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const params = new URLSearchParams({
    q: destination.name,
    access_token: token,
    language: options.language?.trim() || "pt",
    limit: "3",
    types: "poi,place,address",
    proximity: `${destination.longitude},${destination.latitude}`,
  });

  try {
    const response = await fetchImplementation(
      `https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`,
    );
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const feature = selectNearestFeature(
      payload,
      destination.longitude,
      destination.latitude,
    );
    if (!feature) return null;
    return normalizeDetails(
      feature,
      destination.name,
      destination.category ?? null,
    );
  } catch {
    return null;
  }
}
