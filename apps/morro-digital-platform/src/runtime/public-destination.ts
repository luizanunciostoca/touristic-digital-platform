import { morroDeSaoPauloDestination } from "../config/destination.js";

export type MorroPublicDestination = typeof morroDeSaoPauloDestination;

interface PublicDestinationEnvelope {
  readonly destination?: MorroPublicDestination;
  readonly source?: "destination-owner" | "static-fallback";
}

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

export async function loadPublicDestination(
  fetcher: typeof fetch = fetch,
): Promise<MorroPublicDestination> {
  try {
    const response = await fetcher("/api/runtime/destination", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return morroDeSaoPauloDestination;
    const envelope = (await response.json()) as PublicDestinationEnvelope;
    return isValidDestination(envelope.destination)
      ? Object.freeze(envelope.destination)
      : morroDeSaoPauloDestination;
  } catch {
    return morroDeSaoPauloDestination;
  }
}
