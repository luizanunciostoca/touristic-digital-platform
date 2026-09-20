import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export interface ControlCenterAuditEntry {
  readonly actorUserId: string | null;
  readonly actorRole: string | null;
  readonly actorCapabilities: readonly string[];
  readonly effectiveUserId: string | null;
  readonly destinationId: string | null;
  readonly tenantId: string | null;
  readonly action: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly reason: string | null;
  readonly previousState: unknown;
  readonly newState: unknown;
  readonly correlationId: string | null;
  readonly causationId: string | null;
  readonly requestId: string | null;
  readonly timestamp: string;
  readonly result: string;
}

export interface PersistedControlCenterAuditEntry extends ControlCenterAuditEntry {
  readonly id: string;
}

interface ControlCenterAuditRow extends RowDataPacket {
  id: number | string;
  actor_user_id: string | null;
  actor_role: string | null;
  actor_capabilities_json: unknown;
  effective_user_id: string | null;
  destination_id: string | null;
  tenant_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  reason: string | null;
  previous_state_json: unknown;
  new_state_json: unknown;
  correlation_id: string | null;
  causation_id: string | null;
  request_id: string | null;
  occurred_at: Date | string;
  result: string;
}

export const controlCenterAuditSchemaSql = `
CREATE TABLE IF NOT EXISTS control_center_audit_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id VARCHAR(191) COLLATE utf8mb4_bin NULL,
  actor_role VARCHAR(80) COLLATE utf8mb4_bin NULL,
  actor_capabilities_json JSON NOT NULL,
  effective_user_id VARCHAR(191) COLLATE utf8mb4_bin NULL,
  destination_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  tenant_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  action VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
  entity_type VARCHAR(80) COLLATE utf8mb4_bin NULL,
  entity_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  reason VARCHAR(240) NULL,
  previous_state_json JSON NULL,
  new_state_json JSON NULL,
  correlation_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  causation_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  request_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  occurred_at DATETIME(3) NOT NULL,
  result VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_control_center_audit_actor_time (actor_user_id, occurred_at),
  INDEX idx_control_center_audit_tenant_time (tenant_id, occurred_at),
  INDEX idx_control_center_audit_action_time (action, occurred_at),
  INDEX idx_control_center_audit_entity_time (entity_type, entity_id, occurred_at),
  INDEX idx_control_center_audit_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

function jsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error("CONTROL_CENTER_AUDIT_INVALID_JSON");
    }
  }
  return value;
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("CONTROL_CENTER_AUDIT_INVALID_TIMESTAMP");
  }
  return date.toISOString();
}

function mapRow(row: ControlCenterAuditRow): PersistedControlCenterAuditEntry {
  const capabilities = jsonValue(row.actor_capabilities_json);
  if (
    !Array.isArray(capabilities) ||
    !capabilities.every((value) => typeof value === "string")
  ) {
    throw new Error("CONTROL_CENTER_AUDIT_INVALID_CAPABILITIES");
  }

  return Object.freeze({
    id: String(row.id),
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    actorCapabilities: Object.freeze([...capabilities]),
    effectiveUserId: row.effective_user_id,
    destinationId: row.destination_id,
    tenantId: row.tenant_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    reason: row.reason,
    previousState: jsonValue(row.previous_state_json),
    newState: jsonValue(row.new_state_json),
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    requestId: row.request_id,
    timestamp: timestamp(row.occurred_at),
    result: row.result,
  });
}

export class MySqlControlCenterAuditStore {
  constructor(private readonly pool: Pool) {}

  async append(entry: ControlCenterAuditEntry): Promise<void> {
    const occurredAt = new Date(entry.timestamp);
    if (!Number.isFinite(occurredAt.getTime())) {
      throw new Error("CONTROL_CENTER_AUDIT_INVALID_TIMESTAMP");
    }

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO control_center_audit_entries (
        actor_user_id,
        actor_role,
        actor_capabilities_json,
        effective_user_id,
        destination_id,
        tenant_id,
        action,
        entity_type,
        entity_id,
        reason,
        previous_state_json,
        new_state_json,
        correlation_id,
        causation_id,
        request_id,
        occurred_at,
        result
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.actorUserId,
        entry.actorRole,
        JSON.stringify(entry.actorCapabilities),
        entry.effectiveUserId,
        entry.destinationId,
        entry.tenantId,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.reason,
        entry.previousState === null
          ? null
          : JSON.stringify(entry.previousState),
        entry.newState === null ? null : JSON.stringify(entry.newState),
        entry.correlationId,
        entry.causationId,
        entry.requestId,
        occurredAt,
        entry.result,
      ],
    );

    if (result.affectedRows !== 1) {
      throw new Error("CONTROL_CENTER_AUDIT_APPEND_FAILED");
    }
  }

  async list(
    limit = 100,
  ): Promise<readonly PersistedControlCenterAuditEntry[]> {
    const count = Math.max(1, Math.min(250, Math.floor(Number(limit) || 100)));
    const [rows] = await this.pool.query<ControlCenterAuditRow[]>(
      `SELECT
        id,
        actor_user_id,
        actor_role,
        actor_capabilities_json,
        effective_user_id,
        destination_id,
        tenant_id,
        action,
        entity_type,
        entity_id,
        reason,
        previous_state_json,
        new_state_json,
        correlation_id,
        causation_id,
        request_id,
        occurred_at,
        result
       FROM control_center_audit_entries
       ORDER BY id DESC
       LIMIT ${count}`,
    );

    return Object.freeze(rows.map(mapRow));
  }
}

export async function applyControlCenterAuditSchema(pool: Pool): Promise<void> {
  await pool.query(controlCenterAuditSchemaSql);
}
