import { createHash } from "node:crypto";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

export interface CrmStorageObject {
  readonly id: number;
  readonly objectKey: string;
  readonly bucket: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly metadata: Record<string, unknown> | null;
  readonly leadId: number | null;
  readonly uploadedBySubject: string;
  readonly createdAt: string;
}

export interface CrmStorageUploadInput {
  readonly objectKey: string;
  readonly bucket: string;
  readonly contentType: string;
  readonly data: Buffer;
  readonly metadata?: Record<string, unknown>;
  readonly leadId?: number;
  readonly uploadedBySubject: string;
}

export interface CrmStorageAdapterPort {
  upload(input: CrmStorageUploadInput): Promise<CrmStorageObject>;
  download(bucket: string, objectKey: string): Promise<Buffer | null>;
  delete(bucket: string, objectKey: string): Promise<boolean>;
  getMetadata(
    bucket: string,
    objectKey: string,
  ): Promise<CrmStorageObject | null>;
  listByLead(leadId: number): Promise<readonly CrmStorageObject[]>;
}

interface StorageRow extends RowDataPacket {
  id: number;
  object_key: string;
  bucket: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256: string;
  metadata: string | null;
  lead_id: number | null;
  uploaded_by_subject: string;
  created_at: string;
}

function rowToStorageObject(row: StorageRow): CrmStorageObject {
  const parsedMetadata: Record<string, unknown> | null = row.metadata
    ? (JSON.parse(row.metadata) as Record<string, unknown>)
    : null;
  return Object.freeze({
    id: row.id,
    objectKey: row.object_key,
    bucket: row.bucket,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    checksumSha256: row.checksum_sha256,
    metadata: parsedMetadata,
    leadId: row.lead_id,
    uploadedBySubject: row.uploaded_by_subject,
    createdAt: row.created_at,
  });
}

function computeChecksum(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const UPSERT_SQL = `INSERT INTO crm_storage_objects
    (object_key, bucket, content_type, size_bytes, checksum_sha256, metadata, lead_id, uploaded_by_subject)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    content_type = VALUES(content_type),
    size_bytes = VALUES(size_bytes),
    checksum_sha256 = VALUES(checksum_sha256),
    metadata = VALUES(metadata),
    lead_id = VALUES(lead_id),
    uploaded_by_subject = VALUES(uploaded_by_subject)`;

function buildUpsertParams(
  input: CrmStorageUploadInput,
  checksum: string,
): (string | number | null)[] {
  return [
    input.objectKey,
    input.bucket,
    input.contentType,
    input.data.length,
    checksum,
    input.metadata ? JSON.stringify(input.metadata) : null,
    input.leadId ?? null,
    input.uploadedBySubject,
  ];
}

export class FilesystemCrmStorageAdapter implements CrmStorageAdapterPort {
  readonly #pool: Pool;
  readonly #basePath: string;

  constructor(pool: Pool, basePath: string) {
    this.#pool = pool;
    this.#basePath = basePath;
  }

  upload = async (input: CrmStorageUploadInput): Promise<CrmStorageObject> => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const checksum = computeChecksum(input.data);
    const fullPath = path.join(this.#basePath, input.bucket, input.objectKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.data);

    await this.#pool.execute<ResultSetHeader>(
      UPSERT_SQL,
      buildUpsertParams(input, checksum),
    );

    const result = await this.getMetadata(input.bucket, input.objectKey);
    if (!result) throw new Error("CRM_STORAGE_UPLOAD_FAILED");
    return result;
  };

  download = async (
    bucket: string,
    objectKey: string,
  ): Promise<Buffer | null> => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    try {
      return await fs.readFile(path.join(this.#basePath, bucket, objectKey));
    } catch {
      return null;
    }
  };

  delete = async (bucket: string, objectKey: string): Promise<boolean> => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    try {
      await fs.unlink(path.join(this.#basePath, bucket, objectKey));
    } catch {
      // File may not exist; still remove metadata
    }

    const [result] = await this.#pool.execute<ResultSetHeader>(
      "DELETE FROM crm_storage_objects WHERE bucket = ? AND object_key = ?",
      [bucket, objectKey],
    );
    return result.affectedRows > 0;
  };

  getMetadata = async (
    bucket: string,
    objectKey: string,
  ): Promise<CrmStorageObject | null> => {
    const [rows] = await this.#pool.execute<StorageRow[]>(
      "SELECT * FROM crm_storage_objects WHERE bucket = ? AND object_key = ? LIMIT 1",
      [bucket, objectKey],
    );
    return rows.length > 0 ? rowToStorageObject(rows[0]!) : null;
  };

  listByLead = async (leadId: number): Promise<readonly CrmStorageObject[]> => {
    const [rows] = await this.#pool.execute<StorageRow[]>(
      "SELECT * FROM crm_storage_objects WHERE lead_id = ? ORDER BY created_at DESC",
      [leadId],
    );
    return rows.map(rowToStorageObject);
  };
}

export class S3CrmStorageAdapter implements CrmStorageAdapterPort {
  readonly #pool: Pool;
  readonly #s3Endpoint: string;

  constructor(
    pool: Pool,
    s3Endpoint: string,
    _s3AccessKey: string,
    _s3SecretKey: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _s3Region: string = "us-east-1",
  ) {
    this.#pool = pool;
    this.#s3Endpoint = s3Endpoint;
  }

  upload = async (input: CrmStorageUploadInput): Promise<CrmStorageObject> => {
    const checksum = computeChecksum(input.data);
    const url = `${this.#s3Endpoint}/${input.bucket}/${input.objectKey}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(input.data.length),
        "x-amz-content-sha256": checksum,
        "x-amz-meta-lead-id": input.leadId ? String(input.leadId) : "",
        "x-amz-meta-uploaded-by": input.uploadedBySubject,
      },
      body: new Uint8Array(input.data),
    });

    if (!response.ok) {
      throw new Error(`CRM_STORAGE_S3_UPLOAD_FAILED: ${response.status}`);
    }

    await this.#pool.execute<ResultSetHeader>(
      UPSERT_SQL,
      buildUpsertParams(input, checksum),
    );

    const result = await this.getMetadata(input.bucket, input.objectKey);
    if (!result) throw new Error("CRM_STORAGE_UPLOAD_FAILED");
    return result;
  };

  download = async (
    bucket: string,
    objectKey: string,
  ): Promise<Buffer | null> => {
    const url = `${this.#s3Endpoint}/${bucket}/${objectKey}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  };

  delete = async (bucket: string, objectKey: string): Promise<boolean> => {
    const url = `${this.#s3Endpoint}/${bucket}/${objectKey}`;
    const response = await fetch(url, { method: "DELETE" });

    const [result] = await this.#pool.execute<ResultSetHeader>(
      "DELETE FROM crm_storage_objects WHERE bucket = ? AND object_key = ?",
      [bucket, objectKey],
    );
    return response.ok && result.affectedRows > 0;
  };

  getMetadata = async (
    bucket: string,
    objectKey: string,
  ): Promise<CrmStorageObject | null> => {
    const [rows] = await this.#pool.execute<StorageRow[]>(
      "SELECT * FROM crm_storage_objects WHERE bucket = ? AND object_key = ? LIMIT 1",
      [bucket, objectKey],
    );
    return rows.length > 0 ? rowToStorageObject(rows[0]!) : null;
  };

  listByLead = async (leadId: number): Promise<readonly CrmStorageObject[]> => {
    const [rows] = await this.#pool.execute<StorageRow[]>(
      "SELECT * FROM crm_storage_objects WHERE lead_id = ? ORDER BY created_at DESC",
      [leadId],
    );
    return rows.map(rowToStorageObject);
  };
}

export function createCrmStorageAdapterFromEnvironment(
  pool: Pool,
  env: Record<string, string | undefined>,
): CrmStorageAdapterPort {
  const storageType = env.CRM_STORAGE_TYPE ?? "filesystem";

  if (storageType === "s3") {
    const endpoint = env.CRM_STORAGE_S3_ENDPOINT;
    const accessKey = env.CRM_STORAGE_S3_ACCESS_KEY;
    const secretKey = env.CRM_STORAGE_S3_SECRET_KEY;
    if (!endpoint || !accessKey || !secretKey) {
      throw new Error("CRM_STORAGE_S3_CREDENTIALS_REQUIRED");
    }
    return new S3CrmStorageAdapter(
      pool,
      endpoint,
      accessKey,
      secretKey,
      env.CRM_STORAGE_S3_REGION,
    );
  }

  const basePath = env.CRM_STORAGE_BASE_PATH ?? "/var/crm-storage";
  return new FilesystemCrmStorageAdapter(pool, basePath);
}
