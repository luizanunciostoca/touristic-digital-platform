import { randomUUID } from "node:crypto";

import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  createNotificationRequest,
  notificationChannels,
  notificationTemplates,
  type NotificationChannel,
  type NotificationDispatchResult,
  type NotificationTemplate,
} from "@touristic/notifications";
import type { NotificationJob } from "@touristic/notifications/event-integration";

export type NotificationOutboxStatus =
  | "pending"
  | "leased"
  | "delivered"
  | "suppressed"
  | "duplicate"
  | "dead_letter";

export interface NotificationOutboxEntry {
  readonly tenantId: string;
  readonly outboxId: string;
  readonly job: NotificationJob;
  readonly status: NotificationOutboxStatus;
  readonly attempts: number;
  readonly availableAt: string;
  readonly leaseUntil: string | null;
  readonly terminalResult: NotificationDispatchResult | null;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface NotificationOutboxLease extends NotificationOutboxEntry {
  readonly leaseToken: string;
}

export interface NotificationOutboxRepository {
  enqueue(input: {
    readonly tenantId: string;
    readonly job: NotificationJob;
    readonly enqueuedAt: string;
  }): Promise<"enqueued" | "duplicate">;
  claimDue(input: {
    readonly now: string;
    readonly leaseMs: number;
    readonly limit: number;
  }): Promise<readonly NotificationOutboxLease[]>;
  complete(input: {
    readonly tenantId: string;
    readonly outboxId: string;
    readonly leaseToken: string;
    readonly result: Exclude<NotificationDispatchResult, { status: "failed" }>;
    readonly completedAt: string;
  }): Promise<void>;
  retry(input: {
    readonly tenantId: string;
    readonly outboxId: string;
    readonly leaseToken: string;
    readonly nextAttemptAt: string;
    readonly error: string;
    readonly updatedAt: string;
  }): Promise<void>;
  deadLetter(input: {
    readonly tenantId: string;
    readonly outboxId: string;
    readonly leaseToken: string;
    readonly result: NotificationDispatchResult | null;
    readonly error: string;
    readonly completedAt: string;
  }): Promise<void>;
  listTenant(input: {
    readonly tenantId: string;
    readonly limit: number;
    readonly status?: NotificationOutboxStatus;
  }): Promise<readonly NotificationOutboxEntry[]>;
}

interface NotificationOutboxRow extends RowDataPacket {
  tenant_id: string;
  outbox_id: string;
  idempotency_key: string;
  destination_id: string;
  source_event_id: string;
  deliver_at: Date | string;
  available_at: Date | string;
  status: string;
  attempts: number;
  lease_token: string | null;
  lease_until: Date | string | null;
  request_json: unknown;
  terminal_result_json: unknown;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,159}$/u;
const OUTBOX_STATUSES = new Set<string>([
  "pending",
  "leased",
  "delivered",
  "suppressed",
  "duplicate",
  "dead_letter",
]);

function assertIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!IDENTIFIER.test(normalized)) {
    throw new Error(`NOTIFICATION_INVALID_${label}`);
  }
  return normalized;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("NOTIFICATION_INVALID_DB_TIMESTAMP");
  }
  return date.toISOString();
}

function date(value: string, label: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`NOTIFICATION_INVALID_${label}`);
  }
  return parsed;
}

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "string") {
    return jsonObject(JSON.parse(value) as unknown);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NOTIFICATION_INVALID_PERSISTED_JSON");
  }
  return value as Readonly<Record<string, unknown>>;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function isTemplate(value: unknown): value is NotificationTemplate {
  return (
    typeof value === "string" &&
    notificationTemplates.includes(value as NotificationTemplate)
  );
}

function isChannel(value: unknown): value is NotificationChannel {
  return (
    typeof value === "string" &&
    notificationChannels.includes(value as NotificationChannel)
  );
}

function persistedString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("NOTIFICATION_INVALID_PERSISTED_JOB");
  }
  return value;
}

function persistedJob(value: unknown): NotificationJob {
  const root = jsonObject(value);
  const requestValue = jsonObject(root.request);
  const template = requestValue.template;
  const channel = requestValue.channel;
  if (!isTemplate(template) || !isChannel(channel)) {
    throw new Error("NOTIFICATION_INVALID_PERSISTED_JOB");
  }

  const request = createNotificationRequest({
    id: persistedString(requestValue.id),
    idempotencyKey: persistedString(requestValue.idempotencyKey),
    destinationId: persistedString(requestValue.destinationId),
    recipientReference: persistedString(requestValue.recipientReference),
    locale: persistedString(requestValue.locale),
    template,
    channel,
    variables: jsonObject(requestValue.variables ?? {}),
    requestedAt: persistedString(requestValue.requestedAt),
  });
  if (!request) throw new Error("NOTIFICATION_INVALID_PERSISTED_JOB");

  const deliverAt = persistedString(root.deliverAt);
  const sourceEventId = assertIdentifier(
    persistedString(root.sourceEventId),
    "SOURCE_EVENT_ID",
  );
  date(deliverAt, "DELIVER_AT");

  return Object.freeze({ request, deliverAt, sourceEventId });
}

function persistedResult(value: unknown): NotificationDispatchResult | null {
  if (value === null) return null;
  const result = jsonObject(value);
  const status = result.status;
  if (
    status !== "sent" &&
    status !== "suppressed" &&
    status !== "duplicate" &&
    status !== "failed"
  ) {
    throw new Error("NOTIFICATION_INVALID_PERSISTED_RESULT");
  }
  return result as unknown as NotificationDispatchResult;
}

function outboxStatus(value: string): NotificationOutboxStatus {
  if (
    value !== "pending" &&
    value !== "leased" &&
    value !== "delivered" &&
    value !== "suppressed" &&
    value !== "duplicate" &&
    value !== "dead_letter"
  ) {
    throw new Error("NOTIFICATION_INVALID_PERSISTED_STATUS");
  }
  return value;
}

function rowToEntry(row: NotificationOutboxRow): NotificationOutboxEntry {
  return Object.freeze({
    tenantId: row.tenant_id,
    outboxId: row.outbox_id,
    job: persistedJob(row.request_json),
    status: outboxStatus(row.status),
    attempts: row.attempts,
    availableAt: iso(row.available_at) as string,
    leaseUntil: iso(row.lease_until),
    terminalResult: persistedResult(row.terminal_result_json),
    lastError: row.last_error,
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
    completedAt: iso(row.completed_at),
  });
}

function terminalStatus(
  result: Exclude<NotificationDispatchResult, { status: "failed" }>,
): NotificationOutboxStatus {
  switch (result.status) {
    case "sent":
      return "delivered";
    case "suppressed":
      return "suppressed";
    case "duplicate":
      return "duplicate";
  }
}

function safeError(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "unknown";
  return normalized.slice(0, 200);
}

export class MySqlNotificationOutboxRepository implements NotificationOutboxRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(input: {
    readonly tenantId: string;
    readonly job: NotificationJob;
    readonly enqueuedAt: string;
  }): Promise<"enqueued" | "duplicate"> {
    const tenantId = assertIdentifier(input.tenantId, "TENANT_ID");
    const enqueuedAt = date(input.enqueuedAt, "ENQUEUED_AT");
    const deliverAt = date(input.job.deliverAt, "DELIVER_AT");
    const requestJson = stableJson(input.job);

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO notification_outbox (
        tenant_id, outbox_id, idempotency_key, destination_id, source_event_id,
        deliver_at, available_at, status, attempts, request_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
      [
        tenantId,
        input.job.request.id,
        input.job.request.idempotencyKey,
        input.job.request.destinationId,
        input.job.sourceEventId,
        deliverAt,
        deliverAt,
        requestJson,
        enqueuedAt,
        enqueuedAt,
      ],
    );
    if (result.affectedRows === 1) return "enqueued";

    const [rows] = await this.pool.execute<NotificationOutboxRow[]>(
      `SELECT * FROM notification_outbox
       WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
      [tenantId, input.job.request.idempotencyKey],
    );
    const persisted = rows[0];
    if (
      !persisted ||
      persisted.outbox_id !== input.job.request.id ||
      stableJson(persistedJob(persisted.request_json)) !== stableJson(input.job)
    ) {
      throw new Error("NOTIFICATION_IDEMPOTENCY_CONFLICT");
    }
    return "duplicate";
  }

  async claimDue(input: {
    readonly now: string;
    readonly leaseMs: number;
    readonly limit: number;
  }): Promise<readonly NotificationOutboxLease[]> {
    const now = date(input.now, "CLAIM_NOW");
    if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1_000) {
      throw new Error("NOTIFICATION_INVALID_LEASE_MS");
    }
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      throw new Error("NOTIFICATION_INVALID_CLAIM_LIMIT");
    }

    const leaseToken = randomUUID();
    const leaseUntil = new Date(now.getTime() + input.leaseMs);
    const [update] = await this.pool.execute<ResultSetHeader>(
      `UPDATE notification_outbox
       SET status = 'leased', lease_token = ?, lease_until = ?,
           attempts = attempts + 1, updated_at = ?
       WHERE (
         status = 'pending'
         OR (status = 'leased' AND lease_until IS NOT NULL AND lease_until <= ?)
       )
         AND available_at <= ?
       ORDER BY available_at ASC, created_at ASC
       LIMIT ?`,
      [leaseToken, leaseUntil, now, now, now, input.limit],
    );
    if (update.affectedRows === 0) return Object.freeze([]);

    const [rows] = await this.pool.execute<NotificationOutboxRow[]>(
      `SELECT * FROM notification_outbox
       WHERE lease_token = ?
       ORDER BY available_at ASC, created_at ASC`,
      [leaseToken],
    );
    return Object.freeze(
      rows.map((row) => Object.freeze({ ...rowToEntry(row), leaseToken })),
    );
  }

  async complete(input: {
    readonly tenantId: string;
    readonly outboxId: string;
    readonly leaseToken: string;
    readonly result: Exclude<NotificationDispatchResult, { status: "failed" }>;
    readonly completedAt: string;
  }): Promise<void> {
    const completedAt = date(input.completedAt, "COMPLETED_AT");
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE notification_outbox
       SET status = ?, terminal_result_json = ?, last_error = NULL,
           lease_token = NULL, lease_until = NULL, completed_at = ?,
           updated_at = ?
       WHERE tenant_id = ? AND outbox_id = ?
         AND status = 'leased' AND lease_token = ?`,
      [
        terminalStatus(input.result),
        JSON.stringify(input.result),
        completedAt,
        completedAt,
        assertIdentifier(input.tenantId, "TENANT_ID"),
        assertIdentifier(input.outboxId, "OUTBOX_ID"),
        input.leaseToken,
      ],
    );
    this.assertLeaseUpdated(result);
  }

  async retry(input: {
    readonly tenantId: string;
    readonly outboxId: string;
    readonly leaseToken: string;
    readonly nextAttemptAt: string;
    readonly error: string;
    readonly updatedAt: string;
  }): Promise<void> {
    const nextAttemptAt = date(input.nextAttemptAt, "NEXT_ATTEMPT_AT");
    const updatedAt = date(input.updatedAt, "UPDATED_AT");
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE notification_outbox
       SET status = 'pending', available_at = ?, lease_token = NULL,
           lease_until = NULL, last_error = ?, updated_at = ?
       WHERE tenant_id = ? AND outbox_id = ?
         AND status = 'leased' AND lease_token = ?`,
      [
        nextAttemptAt,
        safeError(input.error),
        updatedAt,
        assertIdentifier(input.tenantId, "TENANT_ID"),
        assertIdentifier(input.outboxId, "OUTBOX_ID"),
        input.leaseToken,
      ],
    );
    this.assertLeaseUpdated(result);
  }

  async deadLetter(input: {
    readonly tenantId: string;
    readonly outboxId: string;
    readonly leaseToken: string;
    readonly result: NotificationDispatchResult | null;
    readonly error: string;
    readonly completedAt: string;
  }): Promise<void> {
    const completedAt = date(input.completedAt, "COMPLETED_AT");
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE notification_outbox
       SET status = 'dead_letter', terminal_result_json = ?, last_error = ?,
           lease_token = NULL, lease_until = NULL, completed_at = ?,
           updated_at = ?
       WHERE tenant_id = ? AND outbox_id = ?
         AND status = 'leased' AND lease_token = ?`,
      [
        input.result ? JSON.stringify(input.result) : null,
        safeError(input.error),
        completedAt,
        completedAt,
        assertIdentifier(input.tenantId, "TENANT_ID"),
        assertIdentifier(input.outboxId, "OUTBOX_ID"),
        input.leaseToken,
      ],
    );
    this.assertLeaseUpdated(result);
  }

  async listTenant(input: {
    readonly tenantId: string;
    readonly limit: number;
    readonly status?: NotificationOutboxStatus;
  }): Promise<readonly NotificationOutboxEntry[]> {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      throw new Error("NOTIFICATION_INVALID_LIST_LIMIT");
    }
    if (input.status !== undefined && !OUTBOX_STATUSES.has(input.status)) {
      throw new Error("NOTIFICATION_INVALID_LIST_STATUS");
    }

    const tenantId = assertIdentifier(input.tenantId, "TENANT_ID");
    const parameters: Array<string | number> = [tenantId];
    let where = "tenant_id = ?";
    if (input.status) {
      where += " AND status = ?";
      parameters.push(input.status);
    }
    parameters.push(input.limit);

    const [rows] = await this.pool.execute<NotificationOutboxRow[]>(
      `SELECT * FROM notification_outbox
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
      parameters,
    );
    return Object.freeze(rows.map(rowToEntry));
  }

  private assertLeaseUpdated(result: ResultSetHeader): void {
    if (result.affectedRows !== 1) {
      throw new Error("NOTIFICATION_OUTBOX_LEASE_LOST");
    }
  }
}

export function createTenantNotificationJobPort(
  repository: NotificationOutboxRepository,
  tenantId: string,
  now: () => Date = () => new Date(),
): Readonly<{ enqueue(job: NotificationJob): Promise<void> }> {
  const scopedTenantId = assertIdentifier(tenantId, "TENANT_ID");
  return Object.freeze({
    async enqueue(job: NotificationJob): Promise<void> {
      await repository.enqueue({
        tenantId: scopedTenantId,
        job,
        enqueuedAt: now().toISOString(),
      });
    },
  });
}
