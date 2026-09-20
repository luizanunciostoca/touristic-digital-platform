import type {
  ContentDocument,
  ContentFieldValue,
  ContentFields,
  ContentKind,
  ContentRepository,
  ContentStatus,
} from "@touristic/content";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface ContentRow extends RowDataPacket {
  id: string;
  destination_id: string;
  kind: ContentKind;
  locale: string;
  source_reference: string | null;
  status: ContentStatus;
  version: number;
  fields_json: string | Record<string, ContentFieldValue>;
  created_at: Date | string;
  updated_at: Date | string;
  scheduled_for: Date | string | null;
  published_at: Date | string | null;
  archived_at: Date | string | null;
}

export interface ContentAdminListInput {
  readonly query?: string;
  readonly destinationId?: string;
  readonly kind?: ContentKind;
  readonly status?: ContentStatus;
  readonly limit?: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,159}$/u;

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("CONTENT_INVALID_TIMESTAMP");
  return date.toISOString();
}

function optionalIso(value: Date | string | null): string | undefined {
  return value === null ? undefined : iso(value);
}

function parseFields(
  value: string | Record<string, ContentFieldValue>,
): ContentFields {
  const parsed: unknown =
    typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CONTENT_INVALID_FIELDS");
  }
  return Object.freeze({ ...(parsed as Record<string, ContentFieldValue>) });
}

function documentFromRow(row: ContentRow): ContentDocument {
  const scheduledFor = optionalIso(row.scheduled_for);
  const publishedAt = optionalIso(row.published_at);
  const archivedAt = optionalIso(row.archived_at);
  return Object.freeze({
    id: row.id,
    destinationId: row.destination_id,
    kind: row.kind,
    locale: row.locale,
    ...(row.source_reference ? { sourceReference: row.source_reference } : {}),
    status: row.status,
    version: Number(row.version),
    fields: parseFields(row.fields_json),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    ...(scheduledFor ? { scheduledFor } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(archivedAt ? { archivedAt } : {}),
  });
}

function validId(value: string): string {
  const normalized = value.trim();
  if (!ID.test(normalized)) throw new Error("CONTENT_INVALID_ID");
  return normalized;
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isSafeInteger(value) || value < 1 || value > 250) {
    throw new Error("CONTENT_INVALID_LIMIT");
  }
  return value;
}

export class MySqlContentRepository implements ContentRepository {
  public constructor(private readonly pool: Pool) {}

  public async get(idInput: string): Promise<ContentDocument | null> {
    const id = validId(idInput);
    const [rows] = await this.pool.execute<ContentRow[]>(
      `SELECT id, destination_id, kind, locale, source_reference, status, version,
              fields_json, created_at, updated_at, scheduled_for, published_at, archived_at
         FROM content_documents
        WHERE id = ?
        LIMIT 1`,
      [id],
    );
    return rows[0] ? documentFromRow(rows[0]) : null;
  }

  public async save(document: ContentDocument): Promise<void> {
    const existing = await this.get(document.id);
    if (existing) {
      const replaced = await this.replace(existing, document);
      if (!replaced) throw new Error("CONTENT_CONCURRENT_UPDATE");
      return;
    }
    const created = await this.create(document);
    if (!created) throw new Error("CONTENT_ALREADY_EXISTS");
  }

  public async create(document: ContentDocument): Promise<boolean> {
    try {
      await this.pool.execute(
        `INSERT INTO content_documents
          (id, destination_id, kind, locale, source_reference, status, version,
           fields_json, created_at, updated_at, scheduled_for, published_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?)`,
        [
          document.id,
          document.destinationId,
          document.kind,
          document.locale,
          document.sourceReference ?? null,
          document.status,
          document.version,
          JSON.stringify(document.fields),
          new Date(document.createdAt),
          new Date(document.updatedAt),
          document.scheduledFor ? new Date(document.scheduledFor) : null,
          document.publishedAt ? new Date(document.publishedAt) : null,
          document.archivedAt ? new Date(document.archivedAt) : null,
        ],
      );
      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ER_DUP_ENTRY"
      ) {
        return false;
      }
      throw error;
    }
  }

  public async replace(
    expected: ContentDocument,
    next: ContentDocument,
  ): Promise<boolean> {
    if (expected.id !== next.id) throw new Error("CONTENT_ID_IMMUTABLE");
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE content_documents
          SET destination_id = ?,
              kind = ?,
              locale = ?,
              source_reference = ?,
              status = ?,
              version = ?,
              fields_json = CAST(? AS JSON),
              updated_at = ?,
              scheduled_for = ?,
              published_at = ?,
              archived_at = ?
        WHERE id = ? AND version = ? AND status = ? AND updated_at = ?`,
      [
        next.destinationId,
        next.kind,
        next.locale,
        next.sourceReference ?? null,
        next.status,
        next.version,
        JSON.stringify(next.fields),
        new Date(next.updatedAt),
        next.scheduledFor ? new Date(next.scheduledFor) : null,
        next.publishedAt ? new Date(next.publishedAt) : null,
        next.archivedAt ? new Date(next.archivedAt) : null,
        next.id,
        expected.version,
        expected.status,
        new Date(expected.updatedAt),
      ],
    );
    return result.affectedRows === 1;
  }

  public async list(
    input: ContentAdminListInput = {},
  ): Promise<readonly ContentDocument[]> {
    const query = String(input.query ?? "").trim().slice(0, 160);
    const destinationId = String(input.destinationId ?? "").trim().slice(0, 160);
    const kind = input.kind ?? "";
    const status = input.status ?? "";
    const limit = boundedLimit(input.limit);
    const pattern = `%${query}%`;
    const [rows] = await this.pool.execute<ContentRow[]>(
      `SELECT id, destination_id, kind, locale, source_reference, status, version,
              fields_json, created_at, updated_at, scheduled_for, published_at, archived_at
         FROM content_documents
        WHERE (? = '' OR id LIKE ? OR source_reference LIKE ? OR destination_id LIKE ?)
          AND (? = '' OR destination_id = ?)
          AND (? = '' OR kind = ?)
          AND (? = '' OR status = ?)
        ORDER BY updated_at DESC, id ASC
        LIMIT ${limit}`,
      [
        query,
        pattern,
        pattern,
        pattern,
        destinationId,
        destinationId,
        kind,
        kind,
        status,
        status,
      ],
    );
    return Object.freeze(rows.map(documentFromRow));
  }
}
