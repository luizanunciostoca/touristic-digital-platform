import type {
  MediaAsset,
  PlaceMedia,
  PlaceMediaRepository,
  PlaceMediaRole,
} from "@touristic/content";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface MediaAssetRow extends RowDataPacket {
  id: string;
  business_id: string;
  type: "image";
  provider: string;
  provider_reference: string;
  mime_type: string;
  width: number;
  height: number;
  byte_size: number;
  checksum_sha256: string;
  alt_text: string;
  publication_state: "draft" | "published";
  created_at: Date | string;
  updated_at: Date | string;
}

interface PlaceMediaRow extends RowDataPacket {
  place_id: string;
  media_id: string;
  role: PlaceMediaRole;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("MEDIA_INVALID_TIMESTAMP");
  return date.toISOString();
}

function assetFromRow(row: MediaAssetRow): MediaAsset {
  return Object.freeze({
    id: row.id,
    businessId: row.business_id,
    type: row.type,
    provider: row.provider,
    providerReference: row.provider_reference,
    mimeType: row.mime_type,
    width: Number(row.width),
    height: Number(row.height),
    byteSize: Number(row.byte_size),
    checksumSha256: row.checksum_sha256,
    alt: row.alt_text,
    publicationState: row.publication_state,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function linkFromRow(row: PlaceMediaRow): PlaceMedia {
  return Object.freeze({
    placeId: row.place_id,
    mediaId: row.media_id,
    role: row.role,
    sortOrder: Number(row.sort_order),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

export class MySqlPlaceMediaRepository implements PlaceMediaRepository {
  public constructor(private readonly pool: Pool) {}

  public async getAsset(mediaId: string): Promise<MediaAsset | null> {
    const [rows] = await this.pool.execute<MediaAssetRow[]>(
      `SELECT id, business_id, type, provider, provider_reference, mime_type,
              width, height, byte_size, checksum_sha256, alt_text,
              publication_state, created_at, updated_at
         FROM media_assets
        WHERE id = ?
        LIMIT 1`,
      [mediaId],
    );
    return rows[0] ? assetFromRow(rows[0]) : null;
  }

  public async getAssetByChecksum(
    businessId: string,
    checksumSha256: string,
  ): Promise<MediaAsset | null> {
    const [rows] = await this.pool.execute<MediaAssetRow[]>(
      `SELECT id, business_id, type, provider, provider_reference, mime_type,
              width, height, byte_size, checksum_sha256, alt_text,
              publication_state, created_at, updated_at
         FROM media_assets
        WHERE business_id = ? AND checksum_sha256 = ?
        LIMIT 1`,
      [businessId, checksumSha256],
    );
    return rows[0] ? assetFromRow(rows[0]) : null;
  }

  public async saveAsset(asset: MediaAsset): Promise<void> {
    const existing = await this.getAsset(asset.id);
    if (existing && existing.businessId !== asset.businessId) {
      throw new Error("MEDIA_ASSET_BUSINESS_IMMUTABLE");
    }
    await this.pool.execute(
      `INSERT INTO media_assets
        (id, business_id, type, provider, provider_reference, mime_type,
         width, height, byte_size, checksum_sha256, alt_text,
         publication_state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         type = VALUES(type),
         provider = VALUES(provider),
         provider_reference = VALUES(provider_reference),
         mime_type = VALUES(mime_type),
         width = VALUES(width),
         height = VALUES(height),
         byte_size = VALUES(byte_size),
         checksum_sha256 = VALUES(checksum_sha256),
         alt_text = VALUES(alt_text),
         publication_state = VALUES(publication_state),
         updated_at = VALUES(updated_at)`,
      [
        asset.id,
        asset.businessId,
        asset.type,
        asset.provider,
        asset.providerReference,
        asset.mimeType,
        asset.width,
        asset.height,
        asset.byteSize,
        asset.checksumSha256,
        asset.alt,
        asset.publicationState,
        new Date(asset.createdAt),
        new Date(asset.updatedAt),
      ],
    );
  }

  public async deleteAsset(mediaId: string): Promise<void> {
    await this.pool.execute("DELETE FROM media_assets WHERE id = ?", [mediaId]);
  }

  public async listLinks(placeId: string): Promise<readonly PlaceMedia[]> {
    const [rows] = await this.pool.execute<PlaceMediaRow[]>(
      `SELECT place_id, media_id, role, sort_order, created_at, updated_at
         FROM place_media
        WHERE place_id = ?
        ORDER BY sort_order ASC, media_id ASC`,
      [placeId],
    );
    return Object.freeze(rows.map(linkFromRow));
  }

  public async listLinksByMedia(
    mediaId: string,
  ): Promise<readonly PlaceMedia[]> {
    const [rows] = await this.pool.execute<PlaceMediaRow[]>(
      `SELECT place_id, media_id, role, sort_order, created_at, updated_at
         FROM place_media
        WHERE media_id = ?
        ORDER BY place_id ASC, sort_order ASC`,
      [mediaId],
    );
    return Object.freeze(rows.map(linkFromRow));
  }

  public async saveLink(link: PlaceMedia): Promise<void> {
    await this.pool.execute(
      `INSERT INTO place_media
        (place_id, media_id, role, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         role = VALUES(role),
         sort_order = VALUES(sort_order),
         updated_at = VALUES(updated_at)`,
      [
        link.placeId,
        link.mediaId,
        link.role,
        link.sortOrder,
        new Date(link.createdAt),
        new Date(link.updatedAt),
      ],
    );
  }

  public async deleteLink(placeId: string, mediaId: string): Promise<void> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM place_media WHERE place_id = ? AND media_id = ?",
      [placeId, mediaId],
    );
    if (result.affectedRows > 1)
      throw new Error("MEDIA_RELATION_INTEGRITY_ERROR");
  }
}
