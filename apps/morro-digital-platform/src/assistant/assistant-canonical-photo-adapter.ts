import { normalizeSearchText } from "@touristic/search";

import { createPublicPlaceMapClient } from "../map/public-place-map-client-v2.js";
import {
  resolvePublicPlaceReadContext,
  type PublicPlaceReadContext,
} from "../runtime/public-place-read-context.js";

export interface AssistantCanonicalPhotoSet {
  readonly placeId: string;
  readonly place: string;
  readonly images: readonly string[];
}

function publicImageSource(reference: string): string | null {
  const value = reference.trim();
  if (!value) return null;
  if (/^https:\/\//u.test(value) || value.startsWith("/")) return value;
  return null;
}

function discoveryScore(name: string, query: string): number | null {
  const candidate = normalizeSearchText(name);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  if (candidate === normalizedQuery) return 0;
  if (candidate.startsWith(normalizedQuery)) return 1;
  if (candidate.includes(normalizedQuery)) return 2;
  const tokens = normalizedQuery.split(/\s+/u).filter(Boolean);
  if (tokens.length > 0 && tokens.every((token) => candidate.includes(token))) {
    return 3;
  }
  return null;
}

function localeFor(language: string): string {
  switch (language) {
    case "en":
      return "en-US";
    case "es":
      return "es-ES";
    case "he":
      return "he-IL";
    default:
      return "pt-BR";
  }
}

export async function resolveAssistantCanonicalPhotos(
  place: string,
  fetchImplementation: typeof globalThis.fetch,
  language: string,
  publicPlaceReadContext?: PublicPlaceReadContext,
): Promise<AssistantCanonicalPhotoSet | null> {
  const normalized = normalizeSearchText(place);
  if (!normalized) return null;
  const readContext = resolvePublicPlaceReadContext(publicPlaceReadContext);

  try {
    const client = createPublicPlaceMapClient(fetchImplementation);
    const page = await client.listMap({
      destinationId: readContext.destinationId,
      bbox: readContext.bbox,
      zoom: readContext.zoom,
    });
    const candidate = page.items
      .map((item) => ({ item, score: discoveryScore(item.name, normalized) }))
      .filter(
        (
          entry,
        ): entry is {
          item: (typeof page.items)[number];
          score: number;
        } => entry.score !== null,
      )
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.item.name.localeCompare(right.item.name),
      )[0];

    if (!candidate) return null;

    const detail = await client.getDetail(candidate.item.id, {
      locale: localeFor(language),
    });
    if (!detail || detail.profile.id !== candidate.item.id) return null;
    const canonicalDestinationId =
      typeof detail.profile.destinationId === "string"
        ? detail.profile.destinationId
        : String(detail.actions.destinationId ?? "");
    if (canonicalDestinationId !== readContext.destinationId) return null;
    if (detail.media?.placeId !== candidate.item.id) return null;

    const ordered = [detail.media.coverImage, ...detail.media.gallery];
    const images = ordered
      .map((image) => publicImageSource(image?.providerReference ?? ""))
      .filter((value): value is string => value !== null);
    const uniqueImages = Object.freeze([...new Set(images)]);
    if (uniqueImages.length === 0) return null;

    return Object.freeze({
      placeId: candidate.item.id,
      place: detail.profile.name,
      images: uniqueImages,
    });
  } catch {
    return null;
  }
}
