import {
  listAssistantV1PhotoCatalogEntries,
  type AssistantV1PhotoCatalogEntry,
} from "./assistant-v1-photo-catalog.js";

export type AssistantPhotoMigrationStatus =
  "canonical_media" | "canonical_no_media" | "legacy_only" | "not_canonical";

export interface AssistantPhotoMigrationMapItem {
  readonly id: string;
  readonly name: string;
}

export interface AssistantPhotoMigrationMediaImage {
  readonly providerReference: string;
}

export interface AssistantPhotoMigrationDetail {
  readonly profile: {
    readonly id: string;
    readonly name: string;
  };
  readonly media: {
    readonly placeId: string;
    readonly coverImage: AssistantPhotoMigrationMediaImage | null;
    readonly gallery: readonly AssistantPhotoMigrationMediaImage[];
  } | null;
}

export interface AssistantPhotoMigrationRow {
  readonly legacyPlace: string;
  readonly legacyImages: readonly string[];
  readonly status: AssistantPhotoMigrationStatus;
  readonly canonicalPlaceId: string | null;
  readonly canonicalPlaceName: string | null;
  readonly canonicalImageCount: number;
}

export interface AssistantPhotoMigrationMatrix {
  readonly rows: readonly AssistantPhotoMigrationRow[];
  readonly totals: Readonly<Record<AssistantPhotoMigrationStatus, number>>;
}

export interface AssistantPhotoMigrationAuditInput {
  readonly canonicalPlaces: readonly AssistantPhotoMigrationMapItem[];
  readonly legacyPlaceNames: readonly string[];
  readonly getDetail: (
    placeId: string,
  ) => Promise<AssistantPhotoMigrationDetail | null>;
  readonly legacyEntries?: readonly AssistantV1PhotoCatalogEntry[];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\w\s]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function publicImageCount(detail: AssistantPhotoMigrationDetail): number {
  const media = detail.media;
  if (!media || media.placeId !== detail.profile.id) return 0;
  const references = [media.coverImage, ...media.gallery]
    .map((image) => image?.providerReference.trim() ?? "")
    .filter(
      (reference) =>
        reference.startsWith("/") || /^https:\/\//u.test(reference),
    );
  return new Set(references).size;
}

function canonicalScore(name: string, legacyName: string): number | null {
  const candidate = normalize(name);
  const legacy = normalize(legacyName);
  if (!candidate || !legacy) return null;
  if (candidate === legacy) return 0;
  if (candidate.startsWith(legacy) || legacy.startsWith(candidate)) return 1;
  if (candidate.includes(legacy) || legacy.includes(candidate)) return 2;
  return null;
}

function bestCanonicalMatch(
  places: readonly AssistantPhotoMigrationMapItem[],
  legacyName: string,
): AssistantPhotoMigrationMapItem | null {
  return (
    places
      .map((place) => ({
        place,
        score: canonicalScore(place.name, legacyName),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          place: AssistantPhotoMigrationMapItem;
          score: number;
        } => candidate.score !== null,
      )
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.place.name.localeCompare(right.place.name),
      )[0]?.place ?? null
  );
}

export async function auditAssistantPhotoMigrationCoverage(
  input: AssistantPhotoMigrationAuditInput,
): Promise<AssistantPhotoMigrationMatrix> {
  const legacyEntries =
    input.legacyEntries ?? listAssistantV1PhotoCatalogEntries();
  const knownLegacyPlaces = new Set(input.legacyPlaceNames.map(normalize));
  const rows: AssistantPhotoMigrationRow[] = [];

  for (const legacy of legacyEntries) {
    if (!knownLegacyPlaces.has(normalize(legacy.place))) {
      rows.push(
        Object.freeze({
          legacyPlace: legacy.place,
          legacyImages: Object.freeze([...legacy.images]),
          status: "not_canonical" as const,
          canonicalPlaceId: null,
          canonicalPlaceName: null,
          canonicalImageCount: 0,
        }),
      );
      continue;
    }

    const match = bestCanonicalMatch(input.canonicalPlaces, legacy.place);
    if (!match) {
      rows.push(
        Object.freeze({
          legacyPlace: legacy.place,
          legacyImages: Object.freeze([...legacy.images]),
          status: "legacy_only" as const,
          canonicalPlaceId: null,
          canonicalPlaceName: null,
          canonicalImageCount: 0,
        }),
      );
      continue;
    }

    const detail = await input.getDetail(match.id);
    const imageCount = detail ? publicImageCount(detail) : 0;
    rows.push(
      Object.freeze({
        legacyPlace: legacy.place,
        legacyImages: Object.freeze([...legacy.images]),
        status:
          detail && imageCount > 0
            ? ("canonical_media" as const)
            : ("canonical_no_media" as const),
        canonicalPlaceId: match.id,
        canonicalPlaceName: match.name,
        canonicalImageCount: imageCount,
      }),
    );
  }

  const totals: Record<AssistantPhotoMigrationStatus, number> = {
    canonical_media: 0,
    canonical_no_media: 0,
    legacy_only: 0,
    not_canonical: 0,
  };
  for (const row of rows) totals[row.status] += 1;

  return Object.freeze({
    rows: Object.freeze(rows),
    totals: Object.freeze(totals),
  });
}
