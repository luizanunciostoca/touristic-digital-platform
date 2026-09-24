import type {
  PublicPlaceDetail,
  PublicPlaceMapItem,
  PublicPlaceMapPage,
} from "@touristic/business";

export interface PublicPlaceMapClient {
  listMap(input: {
    readonly destinationId: string;
    readonly bbox: readonly [number, number, number, number];
    readonly zoom: number;
    readonly category?: string;
    readonly cursor?: string | null;
    readonly signal?: AbortSignal;
  }): Promise<PublicPlaceMapPage>;
  getDetail(
    placeId: string,
    input?: Readonly<{ locale?: string; signal?: AbortSignal }>,
  ): Promise<PublicPlaceDetail | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMapItem(value: unknown): value is PublicPlaceMapItem {
  if (!isRecord(value)) return false;
  const presentation = value.presentation;
  return Boolean(
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng) &&
    isRecord(presentation) &&
    typeof presentation.markerKey === "string" &&
    typeof presentation.priority === "number",
  );
}

function parseMapPage(value: unknown): PublicPlaceMapPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("PUBLIC_PLACE_MAP_INVALID_RESPONSE");
  }
  if (!value.items.every(isMapItem)) {
    throw new Error("PUBLIC_PLACE_MAP_INVALID_ITEM");
  }
  if (value.nextCursor !== null && typeof value.nextCursor !== "string") {
    throw new Error("PUBLIC_PLACE_MAP_INVALID_CURSOR");
  }
  return Object.freeze({
    items: Object.freeze([...value.items]),
    nextCursor: value.nextCursor as string | null,
  });
}

function isPublicPlaceDetail(value: unknown): value is PublicPlaceDetail {
  if (!isRecord(value)) return false;
  const profile = value.profile;
  const actions = value.actions;
  const partial = value.partial;
  const revision = value.revision;
  return Boolean(
    isRecord(profile) &&
    typeof profile.id === "string" &&
    typeof profile.name === "string" &&
    typeof profile.categoryId === "string" &&
    isRecord(profile.location) &&
    typeof profile.location.latitude === "number" &&
    typeof profile.location.longitude === "number" &&
    isRecord(actions) &&
    typeof actions.placeId === "string" &&
    Array.isArray(actions.secondaryActions) &&
    isRecord(partial) &&
    isRecord(revision) &&
    typeof revision.id === "string" &&
    typeof revision.number === "number",
  );
}

export function createPublicPlaceMapClient(
  fetchImpl: typeof fetch = fetch,
): PublicPlaceMapClient {
  return Object.freeze({
    async listMap(input: Parameters<PublicPlaceMapClient["listMap"]>[0]) {
      const query = new URLSearchParams({
        destinationId: input.destinationId,
        bbox: input.bbox.join(","),
        zoom: String(input.zoom),
      });
      if (input.category) query.set("category", input.category);
      if (input.cursor) query.set("cursor", input.cursor);

      const response = await fetchImpl(
        `/api/places/v1/map?${query.toString()}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: input.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`PUBLIC_PLACE_MAP_HTTP_${response.status}`);
      }
      return parseMapPage(await response.json());
    },

    async getDetail(
      placeId: string,
      input: Readonly<{ locale?: string; signal?: AbortSignal }> = {},
    ) {
      if (!/^[a-z0-9][a-z0-9_-]*$/u.test(placeId)) {
        throw new Error("PUBLIC_PLACE_INVALID_PLACE_ID");
      }
      const locale = input.locale?.trim() || "pt-BR";
      const response = await fetchImpl(
        `/api/places/v1/${encodeURIComponent(placeId)}?locale=${encodeURIComponent(locale)}`,
        {
          method: "GET",
          headers: { Accept: "application/json", "Accept-Language": locale },
          signal: input.signal,
        },
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`PUBLIC_PLACE_DETAIL_HTTP_${response.status}`);
      }
      const body: unknown = await response.json();
      if (!isPublicPlaceDetail(body)) {
        throw new Error("PUBLIC_PLACE_DETAIL_INVALID_RESPONSE");
      }
      return body;
    },
  });
}
