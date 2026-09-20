import {
  defineDestination,
  type Coordinates,
  type DestinationConfig,
  type DestinationId,
} from "@touristic/core";

export const destinationStatuses = Object.freeze([
  "draft",
  "active",
  "suspended",
  "archived",
] as const);

export type DestinationStatus = (typeof destinationStatuses)[number];

export interface DestinationBranding {
  readonly displayName: string;
  readonly shortName?: string;
  readonly logoUrl?: string;
}

export interface DestinationRecord {
  readonly id: DestinationId;
  readonly slug: string;
  readonly name: string;
  readonly countryCode: string;
  readonly timezone: string;
  readonly currency: string;
  readonly defaultLocale: string;
  readonly locales: readonly string[];
  readonly domains: readonly string[];
  readonly center: Coordinates;
  readonly radiusMeters: number;
  readonly branding: DestinationBranding;
  readonly modules: Readonly<Record<string, boolean>>;
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly status: DestinationStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activatedAt?: string;
  readonly suspendedAt?: string;
  readonly archivedAt?: string;
}

export interface CreateDestinationInput {
  readonly id: string;
  readonly slug?: string;
  readonly name: string;
  readonly countryCode: string;
  readonly timezone: string;
  readonly currency: string;
  readonly defaultLocale: string;
  readonly locales: readonly string[];
  readonly domains?: readonly string[];
  readonly center: Coordinates;
  readonly radiusMeters: number;
  readonly branding?: Partial<DestinationBranding>;
  readonly modules?: Readonly<Record<string, boolean>>;
  readonly featureFlags?: Readonly<Record<string, boolean>>;
  readonly createdAt: string;
}

export interface ReviseDestinationInput {
  readonly name?: string;
  readonly countryCode?: string;
  readonly timezone?: string;
  readonly currency?: string;
  readonly defaultLocale?: string;
  readonly locales?: readonly string[];
  readonly domains?: readonly string[];
  readonly center?: Coordinates;
  readonly radiusMeters?: number;
  readonly branding?: Partial<DestinationBranding>;
  readonly modules?: Readonly<Record<string, boolean>>;
  readonly featureFlags?: Readonly<Record<string, boolean>>;
}

export interface DestinationTransitionInput {
  readonly status: DestinationStatus;
  readonly transitionedAt: string;
}

const destinationIdPattern = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/u;
const flagKeyPattern = /^[a-z][a-z0-9_.-]{0,79}$/u;
const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function timestamp(value: string): string | null {
  const normalized = value.trim();
  const date = new Date(normalized);
  if (!normalized || !Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function boundedText(
  value: string,
  minimum: number,
  maximum: number,
): string | null {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) return null;
  return normalized;
}

function countryCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : null;
}

function currency(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(normalized) ? normalized : null;
}

function timezone(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > 80) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: normalized }).format(0);
    return normalized;
  } catch {
    return null;
  }
}

function locale(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > 40) return null;
  try {
    return Intl.getCanonicalLocales(normalized)[0] ?? null;
  } catch {
    return null;
  }
}

function locales(
  values: readonly string[],
  defaultLocale: string,
): readonly string[] | null {
  const normalized = [
    ...new Set(
      values.map(locale).filter((value): value is string => Boolean(value)),
    ),
  ];
  if (normalized.length === 0 || normalized.length > 20) return null;
  if (!normalized.includes(defaultLocale)) return null;
  return Object.freeze(normalized);
}

function domains(values: readonly string[] = []): readonly string[] | null {
  const normalized = [
    ...new Set(
      values.map((value) => value.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  if (normalized.length > 20) return null;
  if (normalized.some((value) => !hostnamePattern.test(value))) return null;
  return Object.freeze(normalized);
}

function coordinates(value: Coordinates): Coordinates | null {
  if (
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  ) {
    return null;
  }
  return Object.freeze({
    latitude: value.latitude,
    longitude: value.longitude,
  });
}

function radiusMeters(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 100 && value <= 500_000
    ? value
    : null;
}

function flags(
  value: Readonly<Record<string, boolean>> = {},
): Readonly<Record<string, boolean>> | null {
  const entries = Object.entries(value);
  if (entries.length > 100) return null;
  if (
    entries.some(
      ([key, enabled]) =>
        !flagKeyPattern.test(key) || typeof enabled !== "boolean",
    )
  ) {
    return null;
  }
  return Object.freeze(
    Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))),
  );
}

function branding(
  value: Partial<DestinationBranding> | undefined,
  fallbackName: string,
): DestinationBranding | null {
  const displayName = boundedText(value?.displayName ?? fallbackName, 2, 120);
  if (!displayName) return null;
  const shortName =
    value?.shortName === undefined
      ? undefined
      : boundedText(value.shortName, 2, 60);
  if (value?.shortName !== undefined && !shortName) return null;
  const logoUrl = value?.logoUrl?.trim();
  if (logoUrl && (logoUrl.length > 500 || !/^https:\/\//u.test(logoUrl))) {
    return null;
  }
  return Object.freeze({
    displayName,
    ...(shortName ? { shortName } : {}),
    ...(logoUrl ? { logoUrl } : {}),
  });
}

function validateRecordInput(input: {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly countryCode: string;
  readonly timezone: string;
  readonly currency: string;
  readonly defaultLocale: string;
  readonly locales: readonly string[];
  readonly domains: readonly string[];
  readonly center: Coordinates;
  readonly radiusMeters: number;
  readonly branding?: Partial<DestinationBranding>;
  readonly modules: Readonly<Record<string, boolean>>;
  readonly featureFlags: Readonly<Record<string, boolean>>;
}) {
  const id = input.id.trim();
  const slug = input.slug.trim();
  const name = boundedText(input.name, 2, 120);
  const normalizedCountry = countryCode(input.countryCode);
  const normalizedTimezone = timezone(input.timezone);
  const normalizedCurrency = currency(input.currency);
  const normalizedDefaultLocale = locale(input.defaultLocale);
  const normalizedCenter = coordinates(input.center);
  const normalizedRadius = radiusMeters(input.radiusMeters);
  const normalizedModules = flags(input.modules);
  const normalizedFeatureFlags = flags(input.featureFlags);
  const normalizedDomains = domains(input.domains);
  if (
    !destinationIdPattern.test(id) ||
    !destinationIdPattern.test(slug) ||
    !name ||
    !normalizedCountry ||
    !normalizedTimezone ||
    !normalizedCurrency ||
    !normalizedDefaultLocale ||
    !normalizedCenter ||
    !normalizedRadius ||
    !normalizedModules ||
    !normalizedFeatureFlags ||
    !normalizedDomains
  ) {
    return null;
  }
  const normalizedLocales = locales(input.locales, normalizedDefaultLocale);
  const normalizedBranding = branding(input.branding, name);
  if (!normalizedLocales || !normalizedBranding) return null;

  return Object.freeze({
    id: id as DestinationId,
    slug,
    name,
    countryCode: normalizedCountry,
    timezone: normalizedTimezone,
    currency: normalizedCurrency,
    defaultLocale: normalizedDefaultLocale,
    locales: normalizedLocales,
    domains: normalizedDomains,
    center: normalizedCenter,
    radiusMeters: normalizedRadius,
    branding: normalizedBranding,
    modules: normalizedModules,
    featureFlags: normalizedFeatureFlags,
  });
}

export function createDestination(
  input: CreateDestinationInput,
): DestinationRecord | null {
  const createdAt = timestamp(input.createdAt);
  if (!createdAt) return null;
  const normalized = validateRecordInput({
    id: input.id,
    slug: input.slug ?? input.id,
    name: input.name,
    countryCode: input.countryCode,
    timezone: input.timezone,
    currency: input.currency,
    defaultLocale: input.defaultLocale,
    locales: input.locales,
    domains: input.domains ?? [],
    center: input.center,
    radiusMeters: input.radiusMeters,
    ...(input.branding === undefined ? {} : { branding: input.branding }),
    modules: input.modules ?? {},
    featureFlags: input.featureFlags ?? {},
  });
  if (!normalized) return null;
  return Object.freeze({
    ...normalized,
    status: "draft" as const,
    version: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

export function reviseDestination(
  current: DestinationRecord,
  patch: ReviseDestinationInput,
  revisedAtInput: string,
): DestinationRecord | null {
  if (current.status === "archived") return null;
  const revisedAt = timestamp(revisedAtInput);
  if (!revisedAt) return null;
  const normalized = validateRecordInput({
    id: current.id,
    slug: current.slug,
    name: patch.name ?? current.name,
    countryCode: patch.countryCode ?? current.countryCode,
    timezone: patch.timezone ?? current.timezone,
    currency: patch.currency ?? current.currency,
    defaultLocale: patch.defaultLocale ?? current.defaultLocale,
    locales: patch.locales ?? current.locales,
    domains: patch.domains ?? current.domains,
    center: patch.center ?? current.center,
    radiusMeters: patch.radiusMeters ?? current.radiusMeters,
    branding: patch.branding
      ? { ...current.branding, ...patch.branding }
      : current.branding,
    modules: patch.modules ?? current.modules,
    featureFlags: patch.featureFlags ?? current.featureFlags,
  });
  if (!normalized) return null;
  return Object.freeze({
    ...current,
    ...normalized,
    version: current.version + 1,
    updatedAt: revisedAt,
  });
}

const transitions: Readonly<
  Record<DestinationStatus, readonly DestinationStatus[]>
> = Object.freeze({
  draft: Object.freeze<DestinationStatus[]>(["active", "archived"]),
  active: Object.freeze<DestinationStatus[]>(["suspended", "archived"]),
  suspended: Object.freeze<DestinationStatus[]>(["active", "archived"]),
  archived: Object.freeze<DestinationStatus[]>([]),
});

export function transitionDestination(
  current: DestinationRecord,
  input: DestinationTransitionInput,
): DestinationRecord | null {
  if (input.status === current.status) return null;
  if (!transitions[current.status].includes(input.status)) return null;
  const transitionedAt = timestamp(input.transitionedAt);
  if (!transitionedAt) return null;

  return Object.freeze({
    ...current,
    status: input.status,
    version: current.version + 1,
    updatedAt: transitionedAt,
    ...(input.status === "active" ? { activatedAt: transitionedAt } : {}),
    ...(input.status === "suspended" ? { suspendedAt: transitionedAt } : {}),
    ...(input.status === "archived" ? { archivedAt: transitionedAt } : {}),
  });
}

export function toCoreDestinationConfig(
  record: DestinationRecord,
): DestinationConfig {
  return defineDestination({
    id: record.id,
    name: record.name,
    countryCode: record.countryCode,
    timezone: record.timezone,
    currency: record.currency,
    center: record.center,
    radiusMeters: record.radiusMeters,
    modules: record.modules,
  });
}
