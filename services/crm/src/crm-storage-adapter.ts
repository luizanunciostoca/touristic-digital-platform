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

const BUCKET_MAX_LENGTH = 120;
const OBJECT_KEY_MAX_LENGTH = 500;
const bucketPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const windowsDriveAbsolutePattern = /^[A-Za-z]:\//u;

interface ValidStorageLocation {
  readonly bucket: string;
  readonly objectKey: string;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function isMissingFilesystemPath(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { readonly code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function isPathWithinRoot(
  root: string,
  candidate: string,
  separator: string,
): boolean {
  return candidate === root || candidate.startsWith(`${root}${separator}`);
}

function validateStorageLocation(
  bucket: string,
  objectKey: string,
): ValidStorageLocation {
  if (
    !bucket ||
    bucket !== bucket.trim() ||
    bucket.length > BUCKET_MAX_LENGTH ||
    !bucketPattern.test(bucket) ||
    bucket === "." ||
    bucket === ".." ||
    containsControlCharacter(bucket)
  ) {
    throw new Error("CRM_STORAGE_BUCKET_INVALID");
  }

  if (
    !objectKey ||
    objectKey !== objectKey.trim() ||
    objectKey.length > OBJECT_KEY_MAX_LENGTH ||
    objectKey.startsWith("/") ||
    windowsDriveAbsolutePattern.test(objectKey) ||
    objectKey.includes("\\") ||
    containsControlCharacter(objectKey)
  ) {
    throw new Error("CRM_STORAGE_OBJECT_KEY_INVALID");
  }

  const segments = objectKey.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("CRM_STORAGE_OBJECT_KEY_INVALID");
  }

  return Object.freeze({ bucket, objectKey });
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

function buildS3ObjectUrl(
  endpoint: string,
  bucket: string,
  objectKey: string,
): string {
  const location = validateStorageLocation(bucket, objectKey);
  const endpointWithSlash = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  const encodedPath = [location.bucket, ...location.objectKey.split("/")]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encodedPath, endpointWithSlash).toString();
}

export class FilesystemCrmStorageAdapter implements CrmStorageAdapterPort {
  readonly #pool: Pool;
  readonly #basePath: string;

  constructor(pool: Pool, basePath: string) {
    this.#pool = pool;
    this.#basePath = basePath;
  }

  #resolvePath = async (
    bucket: string,
    objectKey: string,
    ensureParent = false,
  ): Promise<string> => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const location = validateStorageLocation(bucket, objectKey);
    const baseRoot = path.resolve(this.#basePath);
    const bucketRoot = path.resolve(baseRoot, location.bucket);
    const fullPath = path.resolve(bucketRoot, ...location.objectKey.split("/"));
    if (!isPathWithinRoot(bucketRoot, fullPath, path.sep)) {
      throw new Error("CRM_STORAGE_PATH_ESCAPE_REJECTED");
    }

    if (ensureParent) {
      await fs.mkdir(baseRoot, { recursive: true });
    }

    let realBaseRoot: string;
    try {
      realBaseRoot = await fs.realpath(baseRoot);
    } catch (error) {
      if (!ensureParent && isMissingFilesystemPath(error)) {
        return fullPath;
      }
      throw error;
    }

    const parentPath = path.dirname(fullPath);
    let ancestorPath = parentPath;
    let realExistingAncestor: string | null = null;
    while (isPathWithinRoot(baseRoot, ancestorPath, path.sep)) {
      try {
        realExistingAncestor = await fs.realpath(ancestorPath);
        break;
      } catch (error) {
        if (!isMissingFilesystemPath(error)) {
          throw error;
        }
        if (ancestorPath === baseRoot) {
          break;
        }
        ancestorPath = path.dirname(ancestorPath);
      }
    }

    if (
      realExistingAncestor !== null &&
      !isPathWithinRoot(realBaseRoot, realExistingAncestor, path.sep)
    ) {
      throw new Error("CRM_STORAGE_PATH_ESCAPE_REJECTED");
    }

    if (ensureParent) {
      await fs.mkdir(parentPath, { recursive: true });
      const realParentPath = await fs.realpath(parentPath);
      if (!isPathWithinRoot(realBaseRoot, realParentPath, path.sep)) {
        throw new Error("CRM_STORAGE_PATH_ESCAPE_REJECTED");
      }
    }

    try {
      const targetStats = await fs.lstat(fullPath);
      if (targetStats.isSymbolicLink()) {
        throw new Error("CRM_STORAGE_PATH_ESCAPE_REJECTED");
      }
    } catch (error) {
      if (!isMissingFilesystemPath(error)) {
        throw error;
      }
    }

    return fullPath;
  };

  upload = async (input: CrmStorageUploadInput): Promise<CrmStorageObject> => {
    const fs = await import("node:fs/promises");

    validateStorageLocation(input.bucket, input.objectKey);
    const checksum = computeChecksum(input.data);
    const fullPath = await this.#resolvePath(
      input.bucket,
      input.objectKey,
      true,
    );
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
    const fullPath = await this.#resolvePath(bucket, objectKey);

    try {
      return await fs.readFile(fullPath);
    } catch {
      return null;
    }
  };

  delete = async (bucket: string, objectKey: string): Promise<boolean> => {
    const fs = await import("node:fs/promises");
    const fullPath = await this.#resolvePath(bucket, objectKey);
    const location = validateStorageLocation(bucket, objectKey);

    try {
      await fs.unlink(fullPath);
    } catch {
      // File may not exist; still remove metadata
    }

    const [result] = await this.#pool.execute<ResultSetHeader>(
      "DELETE FROM crm_storage_objects WHERE bucket = ? AND object_key = ?",
      [location.bucket, location.objectKey],
    );
    return result.affectedRows > 0;
  };

  getMetadata = async (
    bucket: string,
    objectKey: string,
  ): Promise<CrmStorageObject | null> => {
    const location = validateStorageLocation(bucket, objectKey);
    const [rows] = await this.#pool.execute<StorageRow[]>(
      "SELECT * FROM crm_storage_objects WHERE bucket = ? AND object_key = ? LIMIT 1",
      [location.bucket, location.objectKey],
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
    validateStorageLocation(input.bucket, input.objectKey);
    const checksum = computeChecksum(input.data);
    const url = buildS3ObjectUrl(
      this.#s3Endpoint,
      input.bucket,
      input.objectKey,
    );

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
    const url = buildS3ObjectUrl(this.#s3Endpoint, bucket, objectKey);
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  };

  delete = async (bucket: string, objectKey: string): Promise<boolean> => {
    const location = validateStorageLocation(bucket, objectKey);
    const url = buildS3ObjectUrl(
      this.#s3Endpoint,
      location.bucket,
      location.objectKey,
    );
    const response = await fetch(url, { method: "DELETE" });

    const [result] = await this.#pool.execute<ResultSetHeader>(
      "DELETE FROM crm_storage_objects WHERE bucket = ? AND object_key = ?",
      [location.bucket, location.objectKey],
    );
    return response.ok && result.affectedRows > 0;
  };

  getMetadata = async (
    bucket: string,
    objectKey: string,
  ): Promise<CrmStorageObject | null> => {
    const location = validateStorageLocation(bucket, objectKey);
    const [rows] = await this.#pool.execute<StorageRow[]>(
      "SELECT * FROM crm_storage_objects WHERE bucket = ? AND object_key = ? LIMIT 1",
      [location.bucket, location.objectKey],
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
