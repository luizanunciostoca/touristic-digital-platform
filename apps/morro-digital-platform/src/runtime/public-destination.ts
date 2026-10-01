import type { DestinationConfig } from "@touristic/core";
import { morroDeSaoPauloDestination } from "../config/destination.js";

export type MorroPublicDestination = DestinationConfig;
export type PublicDestinationSource = "destination-owner" | "static-fallback";

export interface ResolvedPublicDestination {
  readonly destination: MorroPublicDestination;
  readonly source: PublicDestinationSource;
}

interface PublicDestinationEnvelope {
  readonly destination?: MorroPublicDestination;
  readonly source?: PublicDestinationSource;
}

const staticFallback = (): ResolvedPublicDestination =>
  Object.freeze({
    destination: morroDeSaoPauloDestination,
    source: "static-fallback" as const,
  });

function isValidDestination(value: unknown): value is MorroPublicDestination {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MorroPublicDestination>;
  const modules = candidate.modules;
  return (
    typeof candidate.id === "string" &&
    /^[a-z0-9][a-z0-9_-]{0,159}$/u.test(candidate.id) &&
    typeof candidate.name === "string" &&
    Boolean(candidate.name.trim()) &&
    typeof candidate.countryCode === "string" &&
    Boolean(candidate.countryCode.trim()) &&
    typeof candidate.timezone === "string" &&
    Boolean(candidate.timezone.trim()) &&
    typeof candidate.currency === "string" &&
    Boolean(candidate.currency.trim()) &&
    Number.isFinite(candidate.center?.latitude) &&
    Number.isFinite(candidate.center?.longitude) &&
    Number.isFinite(candidate.radiusMeters) &&
    Number(candidate.radiusMeters) > 0 &&
    typeof modules === "object" &&
    modules !== null &&
    Object.values(modules).every((enabled) => typeof enabled === "boolean")
  );
}

function isValidSource(value: unknown): value is PublicDestinationSource {
  return value === "destination-owner" || value === "static-fallback";
}

export async function loadPublicDestination(
  fetcher: typeof fetch = fetch,
): Promise<ResolvedPublicDestination> {
  try {
    const response = await fetcher("/api/runtime/destination", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return staticFallback();

    const envelope = (await response.json()) as PublicDestinationEnvelope;
    if (
      !isValidDestination(envelope.destination) ||
      !isValidSource(envelope.source)
    ) {
      return staticFallback();
    }

    return Object.freeze({
      destination: Object.freeze(envelope.destination),
      source: envelope.source,
    });
  } catch {
    return staticFallback();
  }
}
