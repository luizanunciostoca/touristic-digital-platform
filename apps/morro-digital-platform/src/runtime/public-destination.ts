import { morroDeSaoPauloDestination } from "../config/destination.js";

export type MorroPublicDestination = typeof morroDeSaoPauloDestination;
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
  return (
    candidate.id === morroDeSaoPauloDestination.id &&
    typeof candidate.name === "string" &&
    typeof candidate.timezone === "string" &&
    typeof candidate.currency === "string" &&
    Number.isFinite(candidate.center?.latitude) &&
    Number.isFinite(candidate.center?.longitude) &&
    typeof candidate.modules === "object" &&
    candidate.modules !== null
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
    if (!isValidDestination(envelope.destination) || !isValidSource(envelope.source)) {
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
