import {
  normalizeAssistantText,
  type AssistantNavigationDestination,
} from "@touristic/assistant";

import {
  morroAssistantDestinationCatalog,
  type AssistantDestinationCatalogEntry,
} from "./assistant-destination-resolver.js";

export type AssistantPlaceMatchType =
  | "exact"
  | "alias"
  | "partial"
  | "alias_partial"
  | "fuzzy";

export interface AssistantPlaceMatch {
  readonly destination: AssistantNavigationDestination;
  readonly matchType: AssistantPlaceMatchType;
  readonly score?: number;
}

const V1_FUZZY_THRESHOLD = 0.55;

function toDestination(
  entry: AssistantDestinationCatalogEntry,
): AssistantNavigationDestination {
  return Object.freeze({
    name: entry.name,
    latitude: entry.latitude,
    longitude: entry.longitude,
    category: entry.category ?? null,
  });
}

function diceSimilarity(left: string, right: string): number {
  const a = normalizeAssistantText(left);
  const b = normalizeAssistantText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let index = 0; index < a.length - 1; index += 1) {
    const pair = a.slice(index, index + 2);
    bigrams.set(pair, (bigrams.get(pair) ?? 0) + 1);
  }

  let matches = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const pair = b.slice(index, index + 2);
    const count = bigrams.get(pair) ?? 0;
    if (count <= 0) continue;
    bigrams.set(pair, count - 1);
    matches += 1;
  }

  return (2 * matches) / (a.length - 1 + (b.length - 1));
}

function normalizedAliases(
  entry: AssistantDestinationCatalogEntry,
): readonly string[] {
  return (entry.aliases ?? []).map(normalizeAssistantText);
}

export function matchMorroAssistantDestinationV1(
  query: string,
  catalog: readonly AssistantDestinationCatalogEntry[] =
    morroAssistantDestinationCatalog,
): AssistantPlaceMatch | null {
  const normalizedQuery = normalizeAssistantText(query);
  if (!normalizedQuery) return null;

  for (const entry of catalog) {
    if (normalizeAssistantText(entry.name) === normalizedQuery) {
      return Object.freeze({
        destination: toDestination(entry),
        matchType: "exact" as const,
      });
    }
  }

  for (const entry of catalog) {
    if (normalizedAliases(entry).includes(normalizedQuery)) {
      return Object.freeze({
        destination: toDestination(entry),
        matchType: "alias" as const,
      });
    }
  }

  for (const entry of catalog) {
    const name = normalizeAssistantText(entry.name);
    if (normalizedQuery.includes(name) || name.includes(normalizedQuery)) {
      return Object.freeze({
        destination: toDestination(entry),
        matchType: "partial" as const,
      });
    }

    for (const alias of normalizedAliases(entry)) {
      if (
        normalizedQuery.includes(alias) ||
        alias.includes(normalizedQuery)
      ) {
        return Object.freeze({
          destination: toDestination(entry),
          matchType: "alias_partial" as const,
        });
      }
    }
  }

  let bestEntry: AssistantDestinationCatalogEntry | null = null;
  let bestScore = 0;
  for (const entry of catalog) {
    const canonicalScore = diceSimilarity(normalizedQuery, entry.name);
    if (canonicalScore > bestScore) {
      bestScore = canonicalScore;
      bestEntry = entry;
    }

    for (const alias of entry.aliases ?? []) {
      const aliasScore = diceSimilarity(normalizedQuery, alias);
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
        bestEntry = entry;
      }
    }
  }

  if (bestEntry && bestScore >= V1_FUZZY_THRESHOLD) {
    return Object.freeze({
      destination: toDestination(bestEntry),
      matchType: "fuzzy" as const,
      score: bestScore,
    });
  }

  return null;
}

export function resolveMorroAssistantDestinationV1(
  query: string,
): AssistantNavigationDestination | null {
  return matchMorroAssistantDestinationV1(query)?.destination ?? null;
}

export function createMorroAssistantV1DestinationResolver() {
  return Object.freeze({
    resolveDestination: resolveMorroAssistantDestinationV1,
  });
}

export const assistantV1FuzzyThreshold = V1_FUZZY_THRESHOLD;
