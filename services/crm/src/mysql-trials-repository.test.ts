import { describe, expect, it } from "vitest";

import { MySqlCrmTrialAuditPort } from "./mysql-trials-audit-port.js";
import { MySqlCrmTrialRepository } from "./mysql-trials-repository.js";
import { crmM90TrialsSchemaSql } from "./trials-schema.js";

type Call = { sql: string; values: unknown[] | undefined };

function poolFixture(responses: unknown[] = []) {
  const calls: Call[] = [];
  const pool = {
    execute: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return [responses.shift() ?? [], []];
    },
  };
  return { pool, calls };
}

const trialRow = {
  id: 41,
  lead_id: 7,
  start_date: new Date("2026-08-12T00:00:00.000Z"),
  end_date: new Date("2026-09-11T00:00:00.000Z"),
  duration_days: 30,
  status: "active",
  converted_at: null,
  notified_at: null,
  schedule_cron_task_uid: null,
  created_at: new Date("2026-08-12T22:00:00.000Z"),
  updated_at: new Date("2026-08-12T22:00:00.000Z"),
};

describe("CRM M90 MySQL trials persistence", () => {
  it("freezes trial lifecycle schema with lead relation and scheduler fields", () => {
    expect(crmM90TrialsSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_trials",
    );
    expect(crmM90TrialsSchemaSql).toContain(
      "ENUM('active','expired','converted','cancelled')",
    );
    expect(crmM90TrialsSchemaSql).toContain("converted_at TIMESTAMP(3) NULL");
    expect(crmM90TrialsSchemaSql).toContain(
      "schedule_cron_task_uid VARCHAR(191) NULL",
    );
    expect(crmM90TrialsSchemaSql).toContain("CONSTRAINT crm_trials_lead_fk");
  });

  it("keeps lead filtering prepared and maps durable rows", async () => {
    const { pool, calls } = poolFixture([[trialRow]]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    const trials = await repository.list(7);
    expect(calls[0]?.sql).toContain("WHERE lead_id = ?");
    expect(calls[0]?.sql).not.toContain("lead_id = 7");
    expect(calls[0]?.values).toEqual([7]);
    expect(trials[0]).toMatchObject({
      id: 41,
      leadId: 7,
      durationDays: 30,
      status: "active",
    });
  });

  it("reads back generated trial ids after prepared inserts", async () => {
    const { pool, calls } = poolFixture([{ insertId: 41 }, [trialRow]]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    const created = await repository.create({
      leadId: 7,
      startDate: trialRow.start_date,
      endDate: trialRow.end_date,
      durationDays: 30,
      status: "active",
    });
    expect(created.id).toBe(41);
    expect(calls[0]?.sql).toContain("VALUES (?, ?, ?, ?, ?)");
    expect(calls[0]?.values).toEqual([
      7,
      trialRow.start_date,
      trialRow.end_date,
      30,
      "active",
    ]);
    expect(calls[1]?.values).toEqual([41]);
  });

  it("guards conversion with active status and persists converted timestamp", async () => {
    const convertedAt = new Date("2026-08-20T12:00:00.000Z");
    const { pool, calls } = poolFixture([
      { affectedRows: 1 },
      [{ ...trialRow, status: "converted", converted_at: convertedAt }],
    ]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    const updated = await repository.markConverted(41, convertedAt);
    expect(updated.status).toBe("converted");
    expect(calls[0]?.sql).toContain("WHERE id = ? AND status = 'active'");
    expect(calls[0]?.values).toEqual([convertedAt, 41]);
  });

  it.each([
    ["markCancelled", "cancelled"],
    ["markExpired", "expired"],
  ] as const)("guards %s with active status", async (method, status) => {
    const { pool, calls } = poolFixture([
      { affectedRows: 1 },
      [{ ...trialRow, status }],
    ]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    const updated = await repository[method](41);
    expect(updated.status).toBe(status);
    expect(calls[0]?.sql).toContain("AND status = 'active'");
    expect(calls[0]?.values).toEqual([41]);
  });

  it("fails closed when a lifecycle update loses its active-state race", async () => {
    const { pool } = poolFixture([{ affectedRows: 0 }]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    await expect(repository.markCancelled(41)).rejects.toThrow(
      "crm_trial_mark_cancelled_conflict",
    );
  });

  it("updates lead stage and conversion timestamp with prepared values", async () => {
    const convertedAt = new Date("2026-08-20T12:00:00.000Z");
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmTrialRepository(pool as never);
    await repository.updateLeadStage({
      leadId: 7,
      stage: "active_client",
      convertedAt,
    });
    expect(calls[0]?.sql).toContain("stage = ?, converted_at = ?");
    expect(calls[0]?.values).toEqual(["active_client", convertedAt, 7]);
  });

  it("persists trial interactions and denied audit events without interpolation", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmTrialRepository(pool as never);
    const audit = new MySqlCrmTrialAuditPort(pool as never);
    await repository.appendInteraction({
      leadId: 7,
      content: "Trial convertido",
      actorSubject: "owner-1",
    });
    await audit.record({
      operation: "trial.cancel",
      allowed: false,
      reason: "invalid_transition",
      actorSubject: "owner-1",
      trialId: 41,
      leadId: 7,
    });
    expect(calls[0]?.sql).toContain("VALUES (?, 'system', ?, NULL, ?)");
    expect(calls[0]?.sql).not.toContain("owner-1");
    expect(calls[0]?.values).toEqual([7, "Trial convertido", "owner-1"]);
    expect(calls[1]?.sql).toContain("crm_audit_events");
    expect(calls[1]?.values).toEqual([
      "trial.cancel",
      false,
      "invalid_transition",
      "owner-1",
      7,
    ]);
  });
});
