export interface SearchCatalogItem {
  readonly id?: string;
  readonly name: string;
  readonly category: string;
  readonly aliases?: readonly string[];
  readonly tags?: readonly string[];
  readonly area?: string | null;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface SearchFilters {
  readonly categories?: readonly string[];
  readonly tags?: readonly string[];
  readonly areas?: readonly string[];
}

export type SearchMatchType =
  | "exact"
  | "alias"
  | "name_prefix"
  | "alias_prefix"
  | "name_contains"
  | "alias_contains"
  | "tag"
  | "area"
  | "fuzzy";

export interface SearchResult<T extends SearchCatalogItem = SearchCatalogItem> {
  readonly item: T;
  readonly matchType: SearchMatchType;
  readonly score: number;
}

const MATCH_SCORE: Readonly<Record<Exclude<SearchMatchType, "fuzzy">, number>> =
  Object.freeze({
    exact: 100,
    alias: 95,
    name_prefix: 85,
    alias_prefix: 80,
    name_contains: 70,
    alias_contains: 65,
    tag: 55,
    area: 45,
  });

const V1_FUZZY_THRESHOLD = 0.55;

const ACCENTS_MAP: Readonly<Record<string, string>> = Object.freeze({
  á: "a",
  à: "a",
  ã: "a",
  â: "a",
  ä: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ó: "o",
  ò: "o",
  õ: "o",
  ô: "o",
  ö: "o",
  ú: "u",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
  ñ: "n",
});

export function normalizeSearchText(value: string): string {
  if (!value) return "";

  return value
    .toLowerCase()
    .replace(
      /[áàãâäéèêëíìîïóòõôöúùûüçñ]/g,
      (character) => ACCENTS_MAP[character] ?? character,
    )
    .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function diceSearchSimilarity(left: string, right: string): number {
  const a = normalizeSearchText(left);
  const b = normalizeSearchText(right);
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

function normalizedValues(
  values: readonly string[] | undefined,
): readonly string[] {
  if (!values) return [];
  return values.map(normalizeSearchText).filter(Boolean);
}

function matchesAllFilters(
  item: SearchCatalogItem,
  filters: SearchFilters,
): boolean {
  const categories = normalizedValues(filters.categories);
  const tags = normalizedValues(filters.tags);
  const areas = normalizedValues(filters.areas);

  if (
    categories.length > 0 &&
    !categories.includes(normalizeSearchText(item.category))
  ) {
    return false;
  }

  const itemTags = normalizedValues(item.tags);
  if (tags.length > 0 && !tags.every((tag) => itemTags.includes(tag))) {
    return false;
  }

  if (
    areas.length > 0 &&
    !areas.includes(normalizeSearchText(item.area ?? ""))
  ) {
    return false;
  }

  return true;
}

export function filterSearchCatalog<T extends SearchCatalogItem>(
  catalog: readonly T[],
  filters: SearchFilters = {},
): readonly T[] {
  return Object.freeze(
    catalog.filter((item) => matchesAllFilters(item, filters)),
  );
}

function classifyMatch(
  item: SearchCatalogItem,
  query: string,
): Exclude<SearchMatchType, "fuzzy"> | null {
  const name = normalizeSearchText(item.name);
  const aliases = normalizedValues(item.aliases);
  const tags = normalizedValues(item.tags);
  const area = normalizeSearchText(item.area ?? "");

  if (name === query) return "exact";
  if (aliases.includes(query)) return "alias";
  if (name.startsWith(query)) return "name_prefix";
  if (aliases.some((alias) => alias.startsWith(query))) return "alias_prefix";
  if (name.includes(query)) return "name_contains";
  if (aliases.some((alias) => alias.includes(query))) return "alias_contains";
  if (tags.includes(query)) return "tag";
  if (area === query) return "area";
  return null;
}

function stableNameCompare(
  left: SearchCatalogItem,
  right: SearchCatalogItem,
): number {
  return normalizeSearchText(left.name).localeCompare(
    normalizeSearchText(right.name),
    "en",
  );
}

function findBestFuzzyResult<T extends SearchCatalogItem>(
  catalog: readonly T[],
  query: string,
): SearchResult<T> | null {
  let bestItem: T | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const canonicalScore = diceSearchSimilarity(query, item.name);
    if (canonicalScore > bestScore) {
      bestScore = canonicalScore;
      bestItem = item;
    }

    for (const alias of item.aliases ?? []) {
      const aliasScore = diceSearchSimilarity(query, alias);
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
        bestItem = item;
      }
    }
  }

  if (!bestItem || bestScore < V1_FUZZY_THRESHOLD) return null;

  return Object.freeze({
    item: bestItem,
    matchType: "fuzzy" as const,
    score: bestScore,
  });
}

export function searchCatalog<T extends SearchCatalogItem>(
  catalog: readonly T[],
  query: string,
  filters: SearchFilters = {},
): readonly SearchResult<T>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return Object.freeze([]);

  const filteredCatalog = filterSearchCatalog(catalog, filters);
  const deterministicResults = filteredCatalog
    .flatMap((item): SearchResult<T>[] => {
      const matchType = classifyMatch(item, normalizedQuery);
      if (!matchType) return [];
      return [
        Object.freeze({
          item,
          matchType,
          score: MATCH_SCORE[matchType],
        }),
      ];
    })
    .sort((left, right) => {
      const byScore = right.score - left.score;
      return byScore !== 0 ? byScore : stableNameCompare(left.item, right.item);
    });

  if (deterministicResults.length > 0) {
    return Object.freeze(deterministicResults);
  }

  const fuzzyResult = findBestFuzzyResult(filteredCatalog, normalizedQuery);
  return fuzzyResult ? Object.freeze([fuzzyResult]) : Object.freeze([]);
}

export function createSearchIndex<T extends SearchCatalogItem>(
  catalog: readonly T[],
) {
  const snapshot = Object.freeze([...catalog]);

  return Object.freeze({
    size: snapshot.length,
    all: (): readonly T[] => snapshot,
    filter: (filters: SearchFilters = {}): readonly T[] =>
      filterSearchCatalog(snapshot, filters),
    search: (
      query: string,
      filters: SearchFilters = {},
    ): readonly SearchResult<T>[] => searchCatalog(snapshot, query, filters),
  });
}

export const searchV1FuzzyThreshold = V1_FUZZY_THRESHOLD;

export {
  morroV1SearchCatalog,
  type MorroV1SearchCatalogItem,
} from "./morro-v1-search-catalog.js";

export {
  createMapboxSearchProvider,
  normalizeMapboxFeature,
  type MapboxSearchOptions,
  type MapboxSearchProviderConfig,
  type MapboxSearchProximity,
  type MapboxSearchResult,
} from "./mapbox-search-provider.js";

export {
  createSearchApplication,
  filterV1RegionalMapboxResults,
  isLikelyV1PlaceQuery,
  isWithinV1SearchRegion,
  type SearchApplicationConfig,
  type SearchApplicationOptions,
  type SearchApplicationResult,
  type SearchExternalProvider,
} from "./search-application.js";

export {
  createSearchPresentationRows,
  formatSearchResultText,
  getSearchCategoryIcon,
  getSearchPresentationCopy,
  resolveSearchPresentationLocale,
  type SearchPresentationCopy,
  type SearchPresentationItem,
  type SearchPresentationLocale,
  type SearchPresentationRow,
} from "./search-presentation.js";
