import {
  normalizeAssistantText,
  type AssistantNavigationDestination,
} from "@touristic/assistant";

import { morroAssistantV1DestinationCatalog } from "./assistant-v1-destination-catalog.js";

export interface AssistantDestinationCatalogEntry extends AssistantNavigationDestination {
  readonly aliases?: readonly string[];
}

function destinationKeys(
  entry: AssistantDestinationCatalogEntry,
): readonly string[] {
  return [entry.name, ...(entry.aliases ?? [])].map(normalizeAssistantText);
}

/**
 * Compatibility resolver retained for callers that only need exact/substring
 * matching. Browser Assistant runtime uses `assistant-v1-place-resolver`, which
 * adds the audited V1 precedence, 12 km boundary and Dice fuzzy fallback.
 */
export function resolveMorroAssistantDestination(
  query: string,
): AssistantNavigationDestination | null {
  const normalizedQuery = normalizeAssistantText(query);
  if (!normalizedQuery) return null;

  const exact = morroAssistantV1DestinationCatalog.find((entry) =>
    destinationKeys(entry).includes(normalizedQuery),
  );
  const matched =
    exact ??
    morroAssistantV1DestinationCatalog.find((entry) =>
      destinationKeys(entry).some(
        (key) => normalizedQuery.includes(key) || key.includes(normalizedQuery),
      ),
    );

  if (!matched) return null;
  return Object.freeze({
    name: matched.name,
    latitude: matched.latitude,
    longitude: matched.longitude,
    category: matched.category ?? null,
  });
}

export function createMorroAssistantDestinationResolver() {
  return Object.freeze({
    resolveDestination: resolveMorroAssistantDestination,
  });
}

export const morroAssistantDestinationCatalog =
  morroAssistantV1DestinationCatalog;
