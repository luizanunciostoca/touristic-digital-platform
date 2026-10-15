import { morroV1SearchCatalog, searchCatalog } from "@touristic/search";
import {
  createPublicPlaceMapClient,
  type PublicPlaceMapClient,
} from "../map/public-place-map-client-v2.js";
import type { ExploreSearchResult } from "../map/explore-locations-control.js";

const BBOX = [-39.05, -13.5, -38.89, -13.35] as const;
export interface ManualSearchSnapshot {
  readonly source: "canonical" | "local";
  readonly results: readonly ExploreSearchResult[];
}

/** Searches the published map projection, not a private catalog or an AI service. */
export function createManualPlaceSearch(
  client: PublicPlaceMapClient = createPublicPlaceMapClient(),
) {
  return async (
    query: string,
    category = "",
    signal?: AbortSignal,
  ): Promise<ManualSearchSnapshot> => {
    const items = new Map<string, ExploreSearchResult>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    const filter = (rows: readonly ExploreSearchResult[]) => {
      const filtered = category
        ? rows.filter((item) => item.category === category)
        : rows;
      return query.trim()
        ? searchCatalog(filtered, query).map((match) => match.item)
        : filtered;
    };
    try {
      for (let page = 0; page < 20; page += 1) {
        signal?.throwIfAborted();
        const result = await client.listMap({
          destinationId: "morro-de-sao-paulo",
          bbox: BBOX,
          zoom: 13,
          ...(category ? { category } : {}),
          cursor,
          ...(signal ? { signal } : {}),
        });
        signal?.throwIfAborted();
        for (const item of result.items)
          items.set(item.id, {
            name: item.name,
            category: item.category,
            latitude: item.lat,
            longitude: item.lng,
            placeId: item.id,
            source: "canonical",
          });
        if (result.nextCursor === null)
          return { source: "canonical", results: filter([...items.values()]) };
        if (cursors.has(result.nextCursor))
          throw new Error("MANUAL_SEARCH_CURSOR_CYCLE");
        cursors.add(result.nextCursor);
        cursor = result.nextCursor;
      }
      throw new Error("MANUAL_SEARCH_PAGE_LIMIT");
    } catch (error) {
      if (signal?.aborted) throw error;
      // The legacy index is explicitly local, with no canonical ID or availability claim.
      const local: ExploreSearchResult[] = morroV1SearchCatalog
        .filter(
          (item) =>
            item.longitude >= BBOX[0] &&
            item.longitude <= BBOX[2] &&
            item.latitude >= BBOX[1] &&
            item.latitude <= BBOX[3],
        )
        .map((item) => ({
          name: item.name,
          category: item.category,
          latitude: item.latitude,
          longitude: item.longitude,
          source: "local",
        }));
      return { source: "local", results: filter(local) };
    }
  };
}
