import type {
  ContentDocument,
  ContentFields,
  ContentKind,
} from "./index.js";

export interface PublicContentDocument {
  readonly id: string;
  readonly destinationId: string;
  readonly kind: ContentKind;
  readonly locale: string;
  readonly sourceReference?: string;
  readonly version: number;
  readonly fields: ContentFields;
  readonly publishedAt: string;
}

export interface PublicContentQuery {
  readonly destinationId: string;
  readonly kind: ContentKind;
  readonly sourceReference?: string;
  readonly preferredLocales: readonly string[];
  readonly fallbackLocale?: string;
}

export const offlineContentKinds = Object.freeze([
  "destination",
  "category",
  "place",
  "media",
  "tour",
  "translation",
  "seo",
] as const);

export type OfflineContentKind = (typeof offlineContentKinds)[number];

export interface OfflineContentSnapshot {
  readonly schemaVersion: "1";
  readonly destinationId: string;
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly documents: readonly PublicContentDocument[];
}

const offlineKindSet = new Set<ContentKind>(offlineContentKinds);

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function normalizedLocale(value: string): string {
  return value.trim().replace(/_/gu, "-").toLowerCase();
}

function baseLanguage(value: string): string {
  return normalizedLocale(value).split("-", 1)[0] ?? "";
}

export function projectPublicContent(
  document: ContentDocument,
): PublicContentDocument | null {
  if (
    document.status !== "published" ||
    document.publishedAt === undefined ||
    !isIsoTimestamp(document.publishedAt)
  ) {
    return null;
  }

  return Object.freeze({
    id: document.id,
    destinationId: document.destinationId,
    kind: document.kind,
    locale: document.locale,
    ...(document.sourceReference
      ? { sourceReference: document.sourceReference }
      : {}),
    version: document.version,
    fields: document.fields,
    publishedAt: document.publishedAt,
  });
}

function localePriority(
  locale: string,
  preferredLocales: readonly string[],
  fallbackLocale: string,
): number {
  const normalized = normalizedLocale(locale);
  const normalizedFallback = normalizedLocale(fallbackLocale);

  for (const [index, preferred] of preferredLocales.entries()) {
    const target = normalizedLocale(preferred);
    if (normalized === target) return index * 10;
    if (baseLanguage(normalized) === baseLanguage(target)) {
      return index * 10 + 1;
    }
  }

  if (normalized === normalizedFallback) return 10_000;
  if (baseLanguage(normalized) === baseLanguage(normalizedFallback)) {
    return 10_001;
  }

  return Number.POSITIVE_INFINITY;
}

function sameSourceReference(
  document: PublicContentDocument,
  sourceReference: string | undefined,
): boolean {
  if (sourceReference === undefined) return true;
  return document.sourceReference === sourceReference;
}

export function selectLocalizedPublicContent(
  documents: readonly ContentDocument[],
  query: PublicContentQuery,
): PublicContentDocument | null {
  const fallbackLocale = query.fallbackLocale ?? "pt-BR";
  const candidates = documents
    .map(projectPublicContent)
    .filter((document): document is PublicContentDocument => document !== null)
    .filter(
      (document) =>
        document.destinationId === query.destinationId &&
        document.kind === query.kind &&
        sameSourceReference(document, query.sourceReference),
    )
    .map((document) => ({
      document,
      priority: localePriority(
        document.locale,
        query.preferredLocales,
        fallbackLocale,
      ),
    }))
    .filter(({ priority }) => Number.isFinite(priority))
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        right.document.version - left.document.version ||
        Date.parse(right.document.publishedAt) -
          Date.parse(left.document.publishedAt),
    );

  return candidates[0]?.document ?? null;
}

function publicOfflineDocument(
  document: ContentDocument,
  destinationId: string,
): PublicContentDocument | null {
  if (document.destinationId !== destinationId) return null;
  if (!offlineKindSet.has(document.kind)) return null;
  return projectPublicContent(document);
}

export function createOfflineContentSnapshot(
  documents: readonly ContentDocument[],
  input: Readonly<{
    destinationId: string;
    generatedAt: string;
    expiresAt: string;
  }>,
): OfflineContentSnapshot | null {
  if (
    !input.destinationId.trim() ||
    !isIsoTimestamp(input.generatedAt) ||
    !isIsoTimestamp(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.generatedAt)
  ) {
    return null;
  }

  const deduplicated = new Map<string, PublicContentDocument>();
  for (const source of documents) {
    const document = publicOfflineDocument(source, input.destinationId);
    if (!document) continue;

    const key = `${document.id}::${normalizedLocale(document.locale)}`;
    const current = deduplicated.get(key);
    if (
      !current ||
      document.version > current.version ||
      (document.version === current.version &&
        Date.parse(document.publishedAt) > Date.parse(current.publishedAt))
    ) {
      deduplicated.set(key, document);
    }
  }

  const projected = [...deduplicated.values()].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id) ||
      normalizedLocale(left.locale).localeCompare(normalizedLocale(right.locale)),
  );

  return Object.freeze({
    schemaVersion: "1",
    destinationId: input.destinationId.trim(),
    generatedAt: input.generatedAt,
    expiresAt: input.expiresAt,
    documents: Object.freeze(projected),
  });
}

export function isOfflineContentSnapshotFresh(
  snapshot: OfflineContentSnapshot,
  now: string,
): boolean {
  if (!isIsoTimestamp(now)) return false;
  return Date.parse(now) < Date.parse(snapshot.expiresAt);
}
