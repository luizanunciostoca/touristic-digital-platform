export const contentKinds = Object.freeze([
  "destination",
  "category",
  "place",
  "media",
  "tour",
  "event",
  "translation",
  "seo",
  "offer_reference",
] as const);

export const contentStatuses = Object.freeze([
  "draft",
  "preview",
  "published",
  "scheduled",
  "archived",
] as const);

export type ContentKind = (typeof contentKinds)[number];
export type ContentStatus = (typeof contentStatuses)[number];
export type ContentFieldValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];
export type ContentFields = Readonly<Record<string, ContentFieldValue>>;

export interface ContentDocumentInput {
  readonly id: string;
  readonly destinationId: string;
  readonly kind: ContentKind;
  readonly locale: string;
  readonly sourceReference?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface ContentDocument {
  readonly id: string;
  readonly destinationId: string;
  readonly kind: ContentKind;
  readonly locale: string;
  readonly sourceReference?: string;
  readonly status: ContentStatus;
  readonly version: number;
  readonly fields: ContentFields;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly scheduledFor?: string;
  readonly publishedAt?: string;
  readonly archivedAt?: string;
}

export interface ContentRepository {
  get(id: string): Promise<ContentDocument | null>;
  save(document: ContentDocument): Promise<void>;
}

export interface ContentTransitionInput {
  readonly status: Exclude<ContentStatus, "draft"> | "draft";
  readonly transitionedAt: string;
  readonly scheduledFor?: string;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,159}$/u;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const SOURCE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{1,239}$/u;

const OFFER_AUTHORITY_KEYS = Object.freeze([
  "price",
  "amount",
  "currency",
  "payment",
  "checkout",
  "ledger",
  "discount",
  "settlement",
]);

const allowedTransitions: Readonly<
  Record<ContentStatus, readonly ContentStatus[]>
> = Object.freeze({
  draft: ["preview", "published", "scheduled", "archived"],
  preview: ["draft", "published", "scheduled", "archived"],
  published: ["archived"],
  scheduled: ["draft", "published", "archived"],
  archived: [],
});

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function normalizeOptionalReference(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return SOURCE_REFERENCE.test(normalized) ? normalized : undefined;
}

function isSafeFieldValue(value: unknown): value is ContentFieldValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }

  if (typeof value === "string") return value.length <= 20_000;

  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (item) => typeof item === "string" && item.length > 0 && item.length <= 500,
    )
  );
}

function isOfferAuthorityKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return OFFER_AUTHORITY_KEYS.some((forbidden) =>
    normalized.includes(forbidden),
  );
}

export function sanitizeContentFields(
  kind: ContentKind,
  fields: Readonly<Record<string, unknown>> | undefined,
): ContentFields | null {
  if (!fields) return Object.freeze({});

  const sanitized: Record<string, ContentFieldValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!FIELD_KEY.test(key) || !isSafeFieldValue(value)) return null;
    if (kind === "offer_reference" && isOfferAuthorityKey(key)) return null;
    sanitized[key] = Array.isArray(value)
      ? Object.freeze([...value])
      : (value as ContentFieldValue);
  }

  return Object.freeze(sanitized);
}

export function createContentDraft(
  input: ContentDocumentInput,
): ContentDocument | null {
  const id = input.id.trim();
  const destinationId = input.destinationId.trim();
  const locale = input.locale.trim();

  if (
    !IDENTIFIER.test(id) ||
    !IDENTIFIER.test(destinationId) ||
    !LOCALE.test(locale) ||
    !isIsoTimestamp(input.createdAt)
  ) {
    return null;
  }

  const sourceReference = normalizeOptionalReference(input.sourceReference);
  if (input.sourceReference !== undefined && sourceReference === undefined) {
    return null;
  }

  const fields = sanitizeContentFields(input.kind, input.fields);
  if (!fields) return null;

  return Object.freeze({
    id,
    destinationId,
    kind: input.kind,
    locale,
    ...(sourceReference ? { sourceReference } : {}),
    status: "draft",
    version: 1,
    fields,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export function reviseContent(
  document: ContentDocument,
  fields: Readonly<Record<string, unknown>>,
  revisedAt: string,
): ContentDocument | null {
  if (
    (document.status !== "draft" && document.status !== "preview") ||
    !isIsoTimestamp(revisedAt)
  ) {
    return null;
  }

  const sanitized = sanitizeContentFields(document.kind, fields);
  if (!sanitized) return null;

  return Object.freeze({
    ...document,
    version: document.version + 1,
    fields: Object.freeze({ ...document.fields, ...sanitized }),
    updatedAt: revisedAt,
  });
}

export function transitionContent(
  document: ContentDocument,
  input: ContentTransitionInput,
): ContentDocument | null {
  if (!isIsoTimestamp(input.transitionedAt)) return null;
  if (!allowedTransitions[document.status].includes(input.status)) return null;

  if (input.status === "scheduled") {
    if (
      input.scheduledFor === undefined ||
      !isIsoTimestamp(input.scheduledFor) ||
      Date.parse(input.scheduledFor) <= Date.parse(input.transitionedAt)
    ) {
      return null;
    }

    return Object.freeze({
      ...document,
      status: "scheduled",
      scheduledFor: input.scheduledFor,
      updatedAt: input.transitionedAt,
      publishedAt: undefined,
      archivedAt: undefined,
    });
  }

  if (input.status === "published") {
    if (
      document.status === "scheduled" &&
      document.scheduledFor !== undefined &&
      Date.parse(input.transitionedAt) < Date.parse(document.scheduledFor)
    ) {
      return null;
    }

    return Object.freeze({
      ...document,
      status: "published",
      updatedAt: input.transitionedAt,
      publishedAt: input.transitionedAt,
      scheduledFor: undefined,
      archivedAt: undefined,
    });
  }

  if (input.status === "archived") {
    return Object.freeze({
      ...document,
      status: "archived",
      updatedAt: input.transitionedAt,
      archivedAt: input.transitionedAt,
      scheduledFor: undefined,
    });
  }

  return Object.freeze({
    ...document,
    status: input.status,
    updatedAt: input.transitionedAt,
    scheduledFor: undefined,
    publishedAt: undefined,
    archivedAt: undefined,
  });
}

export function publishScheduledContent(
  document: ContentDocument,
  now: string,
): ContentDocument | null {
  if (
    document.status !== "scheduled" ||
    document.scheduledFor === undefined ||
    !isIsoTimestamp(now) ||
    Date.parse(now) < Date.parse(document.scheduledFor)
  ) {
    return null;
  }

  return transitionContent(document, {
    status: "published",
    transitionedAt: now,
  });
}

export function isContentPublic(document: ContentDocument): boolean {
  return document.status === "published";
}
