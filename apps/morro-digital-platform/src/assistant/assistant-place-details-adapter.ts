import { normalizeSearchText } from "@touristic/search";

import { createPublicPlaceMapClient } from "../map/public-place-map-client-v2.js";
import { resolveMorroAssistantDestinationV1 } from "./assistant-v1-place-resolver.js";

const CANONICAL_DESTINATION_ID = "morro-de-sao-paulo";
const CANONICAL_DESTINATION_BBOX = Object.freeze([
  -39.05, -13.5, -38.89, -13.35,
] as const);
const CANONICAL_DESTINATION_ZOOM = 13;

export interface AssistantPlaceDetails {
  readonly name: string;
  readonly address: string | null;
  readonly category: string | null;
  readonly openNow: boolean | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly mapboxId: string | null;
  readonly source?: "canonical";
  readonly placeId?: string;
}

export interface AssistantPlaceDetailsAdapterOptions {
  readonly accessToken?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly language?: string;
  readonly now?: Date;
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

function canonicalScore(name: string, query: string): number | null {
  const candidate = normalizeSearchText(name);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  if (candidate === normalizedQuery) return 0;
  if (candidate.startsWith(normalizedQuery)) return 1;
  if (candidate.includes(normalizedQuery)) return 2;
  const tokens = normalizedQuery.split(/\s+/u).filter(Boolean);
  if (tokens.length > 0 && tokens.every((token) => candidate.includes(token))) {
    return 3;
  }
  return null;
}

function localeFor(language: string | undefined): string {
  switch (language?.slice(0, 2)) {
    case "en":
      return "en-US";
    case "es":
      return "es-ES";
    case "he":
      return "he-IL";
    default:
      return "pt-BR";
  }
}

function parseMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function canonicalOpenNow(
  openingHours: {
    readonly timezone: string;
    readonly days: readonly {
      readonly day: string;
      readonly closed: boolean;
      readonly periods: readonly {
        readonly opensAt: string;
        readonly closesAt: string;
      }[];
    }[];
  } | null,
  now: Date,
): boolean | null {
  if (!openingHours) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: openingHours.timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const weekday = parts
      .find((part) => part.type === "weekday")
      ?.value.toLowerCase();
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    const current = hour * 60 + minute;
    const dayIndex = openingHours.days.findIndex(
      (day) => day.day === weekday,
    );
    if (dayIndex < 0) return null;

    const currentDay = openingHours.days[dayIndex];
    if (!currentDay.closed) {
      for (const period of currentDay.periods) {
        const opens = parseMinutes(period.opensAt);
        const closes = parseMinutes(period.closesAt);
        if (opens === null || closes === null) continue;
        if (closes > opens && current >= opens && current < closes) return true;
        if (closes <= opens && current >= opens) return true;
      }
    }

    const previous =
      openingHours.days[
        (dayIndex - 1 + openingHours.days.length) % openingHours.days.length
      ];
    if (!previous.closed) {
      for (const period of previous.periods) {
        const opens = parseMinutes(period.opensAt);
        const closes = parseMinutes(period.closesAt);
        if (
          opens !== null &&
          closes !== null &&
          closes <= opens &&
          current < closes
        ) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return null;
  }
}

async function fetchCanonicalPlaceDetails(
  place: string,
  options: AssistantPlaceDetailsAdapterOptions,
): Promise<AssistantPlaceDetails | null> {
  const normalized = normalizeSearchText(place);
  if (!normalized) return null;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  try {
    const client = createPublicPlaceMapClient(fetchImplementation);
    const page = await client.listMap({
      destinationId: CANONICAL_DESTINATION_ID,
      bbox: CANONICAL_DESTINATION_BBOX,
      zoom: CANONICAL_DESTINATION_ZOOM,
    });
    const candidate = page.items
      .map((item) => ({ item, score: canonicalScore(item.name, normalized) }))
      .filter(
        (
          entry,
        ): entry is {
          item: (typeof page.items)[number];
          score: number;
        } => entry.score !== null,
      )
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.item.name.localeCompare(right.item.name),
      )[0];
    if (!candidate) return null;

    const detail = await client.getDetail(candidate.item.id, {
      locale: localeFor(options.language),
    });
    if (!detail || detail.profile.id !== candidate.item.id) return null;

    const address =
      detail.profile.location.address.trim() ||
      detail.profile.location.area.trim() ||
      null;
    return Object.freeze({
      name: detail.profile.name,
      address,
      category: categoryLabel({}, String(detail.profile.categoryId)),
      openNow: canonicalOpenNow(
        detail.profile.openingHours,
        options.now ?? new Date(),
      ),
      phone:
        detail.profile.contact.phone ?? detail.profile.contact.whatsapp ?? null,
      website: detail.profile.contact.website ?? null,
      mapboxId: null,
      source: "canonical" as const,
      placeId: String(detail.profile.id),
    });
  } catch {
    return null;
  }
}

export async function fetchAssistantPlaceDetails(
  place: string,
  options: AssistantPlaceDetailsAdapterOptions = {},
): Promise<AssistantPlaceDetails | null> {
  const canonical = await fetchCanonicalPlaceDetails(place, options);
  if (canonical) return canonical;

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
