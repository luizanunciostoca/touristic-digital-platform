export const DESTINATION_STATUSES = ["active", "suspended"] as const;

export type DestinationStatus = (typeof DESTINATION_STATUSES)[number];

export interface DestinationCenter {
  readonly lat: number;
  readonly lng: number;
  readonly zoom: number;
}

export interface DestinationBranding {
  readonly name: string;
  readonly shortName: string;
  readonly tagline: string;
}

export interface DestinationDocument {
  readonly id: string;
  readonly status: DestinationStatus;
  readonly locale: string;
  readonly timezone: string;
  readonly currency: string;
  readonly branding: DestinationBranding;
  readonly center: DestinationCenter;
  readonly modules: readonly string[];
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DestinationRepository {
  get(id: string): Promise<DestinationDocument | null>;
  list(): Promise<readonly DestinationDocument[]>;
  create(document: DestinationDocument): Promise<boolean>;
  replace(
    expected: DestinationDocument,
    next: DestinationDocument,
  ): Promise<boolean>;
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  return clean && clean.length <= max ? clean : null;
}

export function sanitizeDestinationId(value: unknown): string | null {
  const clean = cleanText(value, 120);
  return clean && ID_PATTERN.test(clean) ? clean : null;
}

export function sanitizeDestinationInput(
  value: Readonly<Record<string, unknown>>,
): Omit<DestinationDocument, "version" | "createdAt" | "updatedAt"> | null {
  const id = sanitizeDestinationId(value.id);
  const status = DESTINATION_STATUSES.includes(value.status as DestinationStatus)
    ? (value.status as DestinationStatus)
    : null;
  const locale = cleanText(value.locale, 20);
  const timezone = cleanText(value.timezone, 80);
  const currency = cleanText(value.currency, 3);
  const brandingValue = value.branding;
  const centerValue = value.center;
  const modulesValue = value.modules;
  const flagsValue = value.featureFlags;

  if (
    !id ||
    !status ||
    !locale ||
    !LOCALE_PATTERN.test(locale) ||
    !timezone ||
    !currency ||
    !CURRENCY_PATTERN.test(currency) ||
    !brandingValue ||
    typeof brandingValue !== "object" ||
    Array.isArray(brandingValue) ||
    !centerValue ||
    typeof centerValue !== "object" ||
    Array.isArray(centerValue) ||
    !Array.isArray(modulesValue) ||
    !flagsValue ||
    typeof flagsValue !== "object" ||
    Array.isArray(flagsValue)
  ) {
    return null;
  }

  const branding = brandingValue as Readonly<Record<string, unknown>>;
  const name = cleanText(branding.name, 160);
  const shortName = cleanText(branding.shortName, 80);
  const tagline = cleanText(branding.tagline, 240);
  const center = centerValue as Readonly<Record<string, unknown>>;
  const lat = Number(center.lat);
  const lng = Number(center.lng);
  const zoom = Number(center.zoom);

  if (
    !name ||
    !shortName ||
    !tagline ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180 ||
    !Number.isFinite(zoom) ||
    zoom < 0 ||
    zoom > 24
  ) {
    return null;
  }

  const modules = modulesValue
    .map((item) => cleanText(item, 80))
    .filter((item): item is string => Boolean(item));
  if (modules.length !== modulesValue.length || new Set(modules).size !== modules.length) {
    return null;
  }

  const featureFlags: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(flagsValue)) {
    const cleanKey = cleanText(key, 80);
    if (!cleanKey || typeof flag !== "boolean") return null;
    featureFlags[cleanKey] = flag;
  }

  return Object.freeze({
    id,
    status,
    locale,
    timezone,
    currency,
    branding: Object.freeze({ name, shortName, tagline }),
    center: Object.freeze({ lat, lng, zoom }),
    modules: Object.freeze(modules),
    featureFlags: Object.freeze(featureFlags),
  });
}
