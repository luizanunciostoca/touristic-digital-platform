import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type {
  DestinationDocument,
  DestinationRepository,
} from "@touristic/destinations";
import { sanitizeDestinationInput } from "@touristic/destinations";

interface DestinationRow extends RowDataPacket {
  destination_id: string;
  status: string;
  locale: string;
  timezone: string;
  currency: string;
  branding_json: unknown;
  center_json: unknown;
  modules_json: unknown;
  feature_flags_json: unknown;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function json(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return JSON.parse(value) as unknown;
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("DESTINATION_INVALID_DB_TIMESTAMP");
  return date.toISOString();
}

function documentFromRow(row: DestinationRow): DestinationDocument {
  const clean = sanitizeDestinationInput({
    id: row.destination_id,
    status: row.status,
    locale: row.locale,
    timezone: row.timezone,
    currency: row.currency,
    branding: json(row.branding_json),
    center: json(row.center_json),
    modules: json(row.modules_json),
    featureFlags: json(row.feature_flags_json),
  });
  const version = Number(row.version);
  if (!clean || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("DESTINATION_INVALID_PERSISTED_DOCUMENT");
  }
  return Object.freeze({
    ...clean,
    version,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
}

const selectColumns = `
  destination_id, status, locale, timezone, currency,
  branding_json, center_json, modules_json, feature_flags_json,
  version, created_at, updated_at
`;

export class MySqlDestinationRepository implements DestinationRepository {
  public constructor(private readonly pool: Pool) {}

  public async get(id: string): Promise<DestinationDocument | null> {
    const [rows] = await this.pool.execute<DestinationRow[]>(
      `SELECT ${selectColumns} FROM destinations WHERE destination_id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? documentFromRow(rows[0]) : null;
  }

  public async list(): Promise<readonly DestinationDocument[]> {
    const [rows] = await this.pool.query<DestinationRow[]>(
      `SELECT ${selectColumns} FROM destinations ORDER BY destination_id ASC`,
    );
    return Object.freeze(rows.map(documentFromRow));
  }

  public async create(document: DestinationDocument): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO destinations (
        destination_id, status, locale, timezone, currency,
        branding_json, center_json, modules_json, feature_flags_json,
        version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        document.id,
        document.status,
        document.locale,
        document.timezone,
        document.currency,
        JSON.stringify(document.branding),
        JSON.stringify(document.center),
        JSON.stringify(document.modules),
        JSON.stringify(document.featureFlags),
        document.version,
        new Date(document.createdAt),
        new Date(document.updatedAt),
      ],
    );
    return result.affectedRows === 1;
  }

  public async replace(
    expected: DestinationDocument,
    next: DestinationDocument,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE destinations SET
        status = ?, locale = ?, timezone = ?, currency = ?,
        branding_json = ?, center_json = ?, modules_json = ?,
        feature_flags_json = ?, version = ?, updated_at = ?
       WHERE destination_id = ? AND version = ?`,
      [
        next.status,
        next.locale,
        next.timezone,
        next.currency,
        JSON.stringify(next.branding),
        JSON.stringify(next.center),
        JSON.stringify(next.modules),
        JSON.stringify(next.featureFlags),
        next.version,
        new Date(next.updatedAt),
        expected.id,
        expected.version,
      ],
    );
    return result.affectedRows === 1;
  }
}
