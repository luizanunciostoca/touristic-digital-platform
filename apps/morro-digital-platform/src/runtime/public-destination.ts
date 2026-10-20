import { morroDeSaoPauloDestination } from "../config/destination.js";
import {
  defineDestination,
  type DestinationConfig,
  type DestinationId,
} from "@touristic/core";

/** Public destination is a validated data projection, never a source of auth. */
export interface PublicDestination {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly timezone: string;
  readonly currency: string;
  readonly center: Readonly<{ latitude: number; longitude: number }>;
  readonly radiusMeters: number;
  readonly modules: Readonly<Record<string, boolean>>;
}

// Compatibility alias for Morro-specific consumers during the migration.
export type MorroPublicDestination = PublicDestination;
export type PublicDestinationSource = "destination-owner" | "static-fallback";

export interface ResolvedPublicDestination {
  readonly destination: PublicDestination;
  readonly source: PublicDestinationSource;
}

interface PublicDestinationEnvelope {
  readonly destination?: unknown;
  readonly source?: unknown;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PREFIX = /^\/d\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/u;

function isValidDestination(value: unknown): value is PublicDestination {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Partial<PublicDestination>;
  const c = v.center;
  const modules = v.modules;
  return (
    typeof v.id === "string" &&
    v.id.length <= 120 &&
    ID.test(v.id) &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    typeof v.countryCode === "string" &&
    /^[A-Z]{2}$/u.test(v.countryCode) &&
    typeof v.timezone === "string" &&
    v.timezone.trim().length > 0 &&
    typeof v.currency === "string" &&
    /^[A-Z]{3}$/u.test(v.currency) &&
    Number.isFinite(c?.latitude) &&
    Number(c?.latitude) >= -89 &&
    Number(c?.latitude) <= 89 &&
    Number.isFinite(c?.longitude) &&
    Number(c?.longitude) >= -180 &&
    Number(c?.longitude) <= 180 &&
    Number.isSafeInteger(v.radiusMeters) &&
    Number(v.radiusMeters) >= 100 &&
    Number(v.radiusMeters) <= 100_000 &&
    typeof modules === "object" &&
    modules !== null &&
    !Array.isArray(modules) &&
    Object.values(modules).every((v) => typeof v === "boolean")
  );
}

export function toCoreDestinationConfig(
  value: PublicDestination,
): DestinationConfig {
  if (!isValidDestination(value)) throw new Error("PUBLIC_DESTINATION_INVALID");
  return defineDestination({ ...value, id: value.id as DestinationId });
}

function isValidSource(value: unknown): value is PublicDestinationSource {
  return value === "destination-owner" || value === "static-fallback";
}

export function publicDestinationRequestPath(pagePath: string): {
  readonly endpoint: string;
  readonly expectedId: string | null;
} {
  const match = PREFIX.exec(pagePath);
  if (!match) {
    if (pagePath.startsWith("/d/"))
      throw new Error("PUBLIC_DESTINATION_ROUTE_INVALID");
    return Object.freeze({
      endpoint: "/api/runtime/destination",
      expectedId: null,
    });
  }
  const id = match[1]!;
  return Object.freeze({
    endpoint: `/d/${id}/api/runtime/destination`,
    expectedId: id,
  });
}

const morroFallback = (): ResolvedPublicDestination =>
  Object.freeze({
    destination: morroDeSaoPauloDestination,
    source: "static-fallback" as const,
  });

/**
 * Keep the legacy Morro fallback only for Morro context. Itacaré and future
 * destinations fail closed on missing / malformed owner state or mismatch.
 */
export async function loadPublicDestination(
  fetcher: typeof fetch = fetch,
  pagePath = "/",
  allowMorroOfflineFallback = false,
): Promise<ResolvedPublicDestination> {
  const request = publicDestinationRequestPath(pagePath);
  const allowLegacyMorroFallback =
    allowMorroOfflineFallback &&
    (request.expectedId === null ||
      request.expectedId === morroDeSaoPauloDestination.id);
  try {
    const response = await fetcher(request.endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("PUBLIC_DESTINATION_HTTP_UNAVAILABLE");
    const envelope = (await response.json()) as PublicDestinationEnvelope;
    if (
      !isValidDestination(envelope.destination) ||
      !isValidSource(envelope.source)
    ) {
      throw new Error("PUBLIC_DESTINATION_INVALID");
    }
    if (request.expectedId && envelope.destination.id !== request.expectedId) {
      throw new Error("PUBLIC_DESTINATION_IDENTITY_MISMATCH");
    }
    if (
      envelope.destination.id !== morroDeSaoPauloDestination.id &&
      envelope.source === "static-fallback"
    ) {
      throw new Error("PUBLIC_DESTINATION_FOREIGN_FALLBACK_DENIED");
    }
    if (
      request.expectedId !== null &&
      request.expectedId !== morroDeSaoPauloDestination.id &&
      envelope.destination.id === morroDeSaoPauloDestination.id
    ) {
      throw new Error("PUBLIC_DESTINATION_CROSS_DESTINATION_DENIED");
    }
    return Object.freeze({
      destination: Object.freeze(envelope.destination),
      source: envelope.source,
    });
  } catch (error) {
    if (allowLegacyMorroFallback) return morroFallback();
    throw error;
  }
}
