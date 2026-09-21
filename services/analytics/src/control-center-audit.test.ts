import { describe, expect, it, vi } from "vitest";

import {
  MySqlControlCenterAuditStore,
  controlCenterAuditSchemaSql,
} from "./control-center-audit.js";

const entry = Object.freeze({
  actorUserId: "platform-owner",
  actorRole: "PLATFORM_OWNER",
  actorCapabilities: Object.freeze(["platform.read", "audit.read"]),
  effectiveUserId: "business-owner",
  destinationId: "morro-de-sao-paulo",
  tenantId: "toca-do-morcego",
  action: "support.session.start",
  entityType: "user",
  entityId: "business-owner",
  reason: "Reproduzir falha do painel",
  previousState: null,
  newState: Object.freeze({ support: true }),
  correlationId: "corr_test",
  causationId: "cause_test",
  requestId: "request_test",
  timestamp: "2026-09-20T19:30:00.000Z",
  result: "success",
});

describe("MySqlControlCenterAuditStore", () => {
  it("persists an append-only administrative audit entry", async () => {
    const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    const store = new MySqlControlCenterAuditStore({
      execute,
    } as never);

    await store.append(entry);

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO control_center_audit_entries");
    expect(sql).not.toContain("UPDATE ");
    expect(sql).not.toContain("DELETE ");
    expect(params).toContain("PLATFORM_OWNER");
    expect(params).toContain(JSON.stringify(entry.actorCapabilities));
  });

  it("reads persisted entries newest-first with bounded limit", async () => {
    const query = vi.fn().mockResolvedValue([
      [
        {
          id: 7,
          actor_user_id: entry.actorUserId,
          actor_role: entry.actorRole,
          actor_capabilities_json: JSON.stringify(entry.actorCapabilities),
          effective_user_id: entry.effectiveUserId,
          destination_id: entry.destinationId,
          tenant_id: entry.tenantId,
          action: entry.action,
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          reason: entry.reason,
          previous_state_json: entry.previousState,
          new_state_json: JSON.stringify(entry.newState),
          correlation_id: entry.correlationId,
          causation_id: entry.causationId,
          request_id: entry.requestId,
          occurred_at: new Date(entry.timestamp),
          result: entry.result,
        },
      ],
    ]);
    const store = new MySqlControlCenterAuditStore({
      query,
    } as never);

    const records = await store.list(999);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("LIMIT 250");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "7",
      actorUserId: "platform-owner",
      effectiveUserId: "business-owner",
      result: "success",
      timestamp: entry.timestamp,
    });
  });

  it("defines only additive table creation in the schema contract", () => {
    expect(controlCenterAuditSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS control_center_audit_entries",
    );
    expect(controlCenterAuditSchemaSql).not.toMatch(/\bUPDATE\b/u);
    expect(controlCenterAuditSchemaSql).not.toMatch(/\bDELETE\b/u);
    expect(controlCenterAuditSchemaSql).not.toMatch(/\bDROP\b/u);
  });
});
