import type { Pool, RowDataPacket } from "mysql2/promise";

const DEVICE_ID = /^tdv_[A-Za-z0-9_-]{8,116}$/u;
const DESTINATION_ID = /^[A-Za-z0-9:_-]{2,120}$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9@._:-]{1,159}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export interface TicketOfflineDeviceRegistration {
  readonly deviceId: string;
  readonly destinationId: string;
  readonly credentialFingerprint: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly provisionedBy: string;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
  readonly lastSyncAt: string | null;
}

interface DeviceRow extends RowDataPacket {
  device_id: string;
  destination_id: string;
  credential_fingerprint: string;
  issued_at: Date | string;
  expires_at: Date | string;
  provisioned_by: string;
  revoked_at: Date | string | null;
  revoked_by: string | null;
  last_sync_at: Date | string | null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function optionalTimestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : timestamp(value);
}

function normalize(input: {
  deviceId: unknown;
  destinationId: unknown;
  credentialFingerprint: unknown;
  issuedAt: unknown;
  expiresAt: unknown;
  provisionedBy: unknown;
  revokedAt?: unknown;
  revokedBy?: unknown;
  lastSyncAt?: unknown;
}): TicketOfflineDeviceRegistration | null {
  const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
  const destinationId =
    typeof input.destinationId === "string" ? input.destinationId.trim() : "";
  const credentialFingerprint =
    typeof input.credentialFingerprint === "string"
      ? input.credentialFingerprint.trim().toLowerCase()
      : "";
  const provisionedBy =
    typeof input.provisionedBy === "string" ? input.provisionedBy.trim() : "";
  const revokedBy =
    input.revokedBy === null || input.revokedBy === undefined
      ? null
      : typeof input.revokedBy === "string"
        ? input.revokedBy.trim()
        : "";
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  const revokedAt = optionalTimestamp(input.revokedAt);
  const lastSyncAt = optionalTimestamp(input.lastSyncAt);
  if (
    !DEVICE_ID.test(deviceId) ||
    !DESTINATION_ID.test(destinationId) ||
    !SHA256.test(credentialFingerprint) ||
    !ACTOR.test(provisionedBy) ||
    !issuedAt ||
    !expiresAt ||
    Date.parse(expiresAt) <= Date.parse(issuedAt) ||
    ((revokedAt === null) !== (revokedBy === null)) ||
    (revokedBy !== null && !ACTOR.test(revokedBy))
  ) {
    return null;
  }
  return Object.freeze({
    deviceId,
    destinationId,
    credentialFingerprint,
    issuedAt,
    expiresAt,
    provisionedBy,
    revokedAt,
    revokedBy,
    lastSyncAt,
  });
}

function fromRow(row: DeviceRow): TicketOfflineDeviceRegistration {
  const registration = normalize({
    deviceId: row.device_id,
    destinationId: row.destination_id,
    credentialFingerprint: row.credential_fingerprint,
    issuedAt: new Date(row.issued_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    provisionedBy: row.provisioned_by,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    revokedBy: row.revoked_by,
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
  });
  if (!registration) throw new Error("TICKETING_OFFLINE_DEVICE_PERSISTED_INVALID");
  return registration;
}

export class MySqlTicketOfflineDeviceRegistry {
  constructor(private readonly pool: Pool) {}

  async findByDeviceId(deviceIdInput: unknown): Promise<TicketOfflineDeviceRegistration | null> {
    const deviceId = typeof deviceIdInput === "string" ? deviceIdInput.trim() : "";
    if (!DEVICE_ID.test(deviceId)) throw new Error("TICKETING_DEVICE_ID_INVALID");
    const [rows] = await this.pool.execute<DeviceRow[]>(
      `SELECT device_id, destination_id, credential_fingerprint, issued_at, expires_at,
              provisioned_by, revoked_at, revoked_by, last_sync_at
       FROM ticketing_offline_devices
       WHERE device_id = ?
       LIMIT 1`,
      [deviceId],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async provision(input: TicketOfflineDeviceRegistration): Promise<TicketOfflineDeviceRegistration> {
    const registration = normalize(input);
    if (!registration || registration.revokedAt || registration.revokedBy) {
      throw new Error("TICKETING_OFFLINE_DEVICE_INVALID");
    }
    await this.pool.execute(
      `INSERT INTO ticketing_offline_devices (
         device_id, destination_id, credential_fingerprint, issued_at, expires_at,
         provisioned_by, revoked_at, revoked_by, last_sync_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE device_id = device_id`,
      [
        registration.deviceId,
        registration.destinationId,
        registration.credentialFingerprint,
        new Date(registration.issuedAt),
        new Date(registration.expiresAt),
        registration.provisionedBy,
      ],
    );
    const persisted = await this.findByDeviceId(registration.deviceId);
    if (
      !persisted ||
      persisted.destinationId !== registration.destinationId ||
      persisted.credentialFingerprint !== registration.credentialFingerprint ||
      persisted.issuedAt !== registration.issuedAt ||
      persisted.expiresAt !== registration.expiresAt ||
      persisted.provisionedBy !== registration.provisionedBy
    ) {
      throw new Error("TICKETING_OFFLINE_DEVICE_CONFLICT");
    }
    return persisted;
  }

  async revoke(deviceIdInput: unknown, revokedByInput: unknown, revokedAtInput: unknown) {
    const deviceId = typeof deviceIdInput === "string" ? deviceIdInput.trim() : "";
    const revokedBy = typeof revokedByInput === "string" ? revokedByInput.trim() : "";
    const revokedAt = timestamp(revokedAtInput);
    if (!DEVICE_ID.test(deviceId) || !ACTOR.test(revokedBy) || !revokedAt) {
      throw new Error("TICKETING_OFFLINE_DEVICE_REVOKE_INVALID");
    }
    await this.pool.execute(
      `UPDATE ticketing_offline_devices
       SET revoked_at = COALESCE(revoked_at, ?),
           revoked_by = COALESCE(revoked_by, ?)
       WHERE device_id = ?`,
      [new Date(revokedAt), revokedBy, deviceId],
    );
    const persisted = await this.findByDeviceId(deviceId);
    if (!persisted) throw new Error("TICKETING_OFFLINE_DEVICE_NOT_FOUND");
    return persisted;
  }

  async recordSync(deviceIdInput: unknown, syncedAtInput: unknown): Promise<void> {
    const deviceId = typeof deviceIdInput === "string" ? deviceIdInput.trim() : "";
    const syncedAt = timestamp(syncedAtInput);
    if (!DEVICE_ID.test(deviceId) || !syncedAt) {
      throw new Error("TICKETING_OFFLINE_DEVICE_SYNC_INVALID");
    }
    await this.pool.execute(
      `UPDATE ticketing_offline_devices
       SET last_sync_at = CASE
         WHEN last_sync_at IS NULL OR last_sync_at < ? THEN ?
         ELSE last_sync_at
       END
       WHERE device_id = ? AND revoked_at IS NULL`,
      [new Date(syncedAt), new Date(syncedAt), deviceId],
    );
  }
}
