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

describe("CRM M92 MySQL trials expiry scheduler persistence", () => {
  it("lists only unclaimed active trials whose end date is due", async () => {
    const { pool, calls } = poolFixture([[trialRow]]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    const due = await repository.listDue();
    expect(due).toHaveLength(1);
    expect(calls[0]?.sql).toContain("status = 'active'");
    expect(calls[0]?.sql).toContain("end_date <= CURRENT_TIMESTAMP(3)");
    expect(calls[0]?.sql).toContain("schedule_cron_task_uid IS NULL");
  });

  it("claims due trials atomically with a prepared task uid", async () => {
    const { pool, calls } = poolFixture([{ affectedRows: 1 }]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    await expect(repository.claimDue(41, "task-41")).resolves.toBe(true);
    expect(calls[0]?.sql).toContain("schedule_cron_task_uid = ?");
    expect(calls[0]?.sql).toContain("status = 'active'");
    expect(calls[0]?.sql).toContain("end_date <= CURRENT_TIMESTAMP(3)");
    expect(calls[0]?.values).toEqual(["task-41", 41]);
  });

  it("expires only the trial owned by the scheduler claim", async () => {
    const { pool, calls } = poolFixture([
      { affectedRows: 1 },
      [{ ...trialRow, status: "expired", schedule_cron_task_uid: "task-41" }],
    ]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    const expired = await repository.markExpiredClaimed(41, "task-41");
    expect(expired.status).toBe("expired");
    expect(calls[0]?.sql).toContain("schedule_cron_task_uid = ?");
    expect(calls[0]?.values).toEqual([41, "task-41"]);
  });

  it("releases only the matching active scheduler claim", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmTrialRepository(pool as never);
    await repository.releaseClaim(41, "task-41");
    expect(calls[0]?.sql).toContain("schedule_cron_task_uid = NULL");
    expect(calls[0]?.sql).toContain("status = 'active'");
    expect(calls[0]?.values).toEqual([41, "task-41"]);
  });
});

describe("CRM M94 MySQL trial notification claiming", () => {
  it("lists only expired, unnotified and unclaimed trials", async () => {
    const expired = { ...trialRow, status: "expired" };
    const { pool, calls } = poolFixture([[expired]]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    const pending = await repository.listExpiredUnnotified();
    expect(pending).toHaveLength(1);
    expect(calls[0]?.sql).toContain("status = 'expired'");
    expect(calls[0]?.sql).toContain("notified_at IS NULL");
    expect(calls[0]?.sql).toContain("notification_task_uid IS NULL");
  });

  it("claims an expired unnotified trial atomically", async () => {
    const { pool, calls } = poolFixture([{ affectedRows: 1 }]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    await expect(
      repository.claimExpiredUnnotified(41, "notify-41"),
    ).resolves.toBe(true);
    expect(calls[0]?.sql).toContain("notification_task_uid = ?");
    expect(calls[0]?.sql).toContain("notified_at IS NULL");
    expect(calls[0]?.values).toEqual(["notify-41", 41]);
  });

  it("releases only the matching pending notification claim", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmTrialRepository(pool as never);
    await repository.releaseNotificationClaim(41, "notify-41");
    expect(calls[0]?.sql).toContain("notification_task_uid = NULL");
    expect(calls[0]?.sql).toContain("notification_task_uid = ?");
    expect(calls[0]?.values).toEqual([41, "notify-41"]);
  });

  it("marks notified only for the owner and clears the claim", async () => {
    const at = new Date("2026-08-13T00:00:00.000Z");
    const { pool, calls } = poolFixture([
      { affectedRows: 1 },
      [{ ...trialRow, status: "expired", notified_at: at }],
    ]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    const updated = await repository.markNotifiedClaimed(41, "notify-41", at);
    expect(updated.notifiedAt).toEqual(at);
    expect(calls[0]?.sql).toContain("notified_at = ?");
    expect(calls[0]?.sql).toContain("notification_task_uid = NULL");
    expect(calls[0]?.sql).toContain("notification_task_uid = ?");
    expect(calls[0]?.values).toEqual([at, 41, "notify-41"]);
  });

  it("fails closed when notification claim ownership is lost", async () => {
    const { pool } = poolFixture([{ affectedRows: 0 }]);
    const repository = new MySqlCrmTrialRepository(pool as never);
    await expect(
      repository.markNotifiedClaimed(
        41,
        "notify-41",
        new Date("2026-08-13T00:00:00.000Z"),
      ),
    ).rejects.toThrow("crm_trial_notification_mark_notified_conflict");
  });
});
