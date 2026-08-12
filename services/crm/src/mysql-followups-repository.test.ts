import { describe, expect, it } from "vitest";

import { MySqlCrmFollowUpAuditPort } from "./mysql-followups-audit-port.js";
import { MySqlCrmFollowUpRepository } from "./mysql-followups-repository.js";
import { crmM71SchemaSql } from "./schema.js";

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

const settingRow = {
  id: 3,
  name: "Follow-up comercial",
  interval_days: 3,
  max_attempts: 4,
  message_template: "Olá",
  is_active: 1,
  created_at: new Date("2026-08-12T20:40:00.000Z"),
  updated_at: new Date("2026-08-12T20:40:00.000Z"),
};

const followUpRow = {
  id: 11,
  lead_id: 7,
  setting_id: 3,
  attempt_number: 1,
  status: "pending",
  generated_message: null,
  scheduled_at: new Date("2026-08-15T15:00:00.000Z"),
  sent_at: null,
  responded_at: null,
  schedule_cron_task_uid: null,
  created_at: new Date("2026-08-12T20:40:00.000Z"),
  updated_at: new Date("2026-08-12T20:40:00.000Z"),
};

describe("CRM M85 MySQL follow-ups persistence", () => {
  it("adds durable settings and follow-up tables with frozen status vocabulary", () => {
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_follow_up_settings",
    );
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_follow_ups",
    );
    expect(crmM71SchemaSql).toContain(
      "ENUM('pending','sent','responded','skipped')",
    );
    expect(crmM71SchemaSql).toContain("CONSTRAINT crm_follow_ups_lead_fk");
    expect(crmM71SchemaSql).toContain("CONSTRAINT crm_follow_ups_setting_fk");
  });

  it("upserts settings with prepared values and reads them back", async () => {
    const { pool, calls } = poolFixture([{ insertId: 3 }, [settingRow]]);
    const repository = new MySqlCrmFollowUpRepository(pool as never);
    const created = await repository.upsertSetting({
      id: null,
      name: "Follow-up comercial",
      intervalDays: 3,
      maxAttempts: 4,
      messageTemplate: "Olá",
      isActive: true,
    });
    expect(calls[0]?.sql).toContain("INSERT INTO crm_follow_up_settings");
    expect(calls[0]?.values).toEqual([
      "Follow-up comercial",
      3,
      4,
      "Olá",
      true,
    ]);
    expect(created.id).toBe(3);
  });

  it("creates and lists follow-ups using prepared lead filters", async () => {
    const { pool, calls } = poolFixture([
      { insertId: 11 },
      [followUpRow],
      [followUpRow],
    ]);
    const repository = new MySqlCrmFollowUpRepository(pool as never);
    const created = await repository.create({
      leadId: 7,
      settingId: 3,
      attemptNumber: 1,
      status: "pending",
      scheduledAt: followUpRow.scheduled_at,
    });
    const listed = await repository.list(7);
    expect(created.id).toBe(11);
    expect(listed).toHaveLength(1);
    expect(calls[2]?.sql).toContain("WHERE lead_id = ?");
    expect(calls[2]?.values).toEqual([7]);
  });

  it("selects only due pending work", async () => {
    const { pool, calls } = poolFixture([[followUpRow]]);
    const repository = new MySqlCrmFollowUpRepository(pool as never);
    const pending = await repository.listPending();
    expect(pending).toHaveLength(1);
    expect(calls[0]?.sql).toContain("status = 'pending'");
    expect(calls[0]?.sql).toContain("scheduled_at <= CURRENT_TIMESTAMP(3)");
  });

  it("uses atomic lifecycle transitions for sent and responded", async () => {
    const sentRow = { ...followUpRow, status: "sent", sent_at: new Date() };
    const respondedRow = {
      ...sentRow,
      status: "responded",
      responded_at: new Date(),
    };
    const { pool, calls } = poolFixture([
      { affectedRows: 1 },
      [sentRow],
      { affectedRows: 1 },
      [respondedRow],
    ]);
    const repository = new MySqlCrmFollowUpRepository(pool as never);
    const sent = await repository.markSent(11, sentRow.sent_at);
    const responded = await repository.markResponded(11, respondedRow.responded_at);
    expect(sent.status).toBe("sent");
    expect(responded.status).toBe("responded");
    expect(calls[0]?.sql).toContain("AND status = 'pending'");
    expect(calls[2]?.sql).toContain("AND status = 'sent'");
  });

  it("persists follow-up interactions, last-contact and audit without interpolation", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmFollowUpRepository(pool as never);
    await repository.appendInteraction({
      leadId: 7,
      content: "Follow-up enviado via WhatsApp",
      actorSubject: "owner-1",
    });
    await repository.updateLeadLastContact(
      7,
      new Date("2026-08-12T20:45:00.000Z"),
    );
    const audit = new MySqlCrmFollowUpAuditPort(pool as never);
    await audit.record({
      operation: "follow_up.create",
      allowed: false,
      reason: "read_only_role",
      actorSubject: "viewer-1",
      followUpId: null,
      leadId: 7,
    });
    expect(calls[0]?.sql).toContain("'follow_up'");
    expect(calls[0]?.sql).not.toContain("owner-1");
    expect(calls[1]?.sql).toContain("UPDATE crm_leads SET last_contact_at = ?");
    expect(calls[2]?.sql).toContain("INSERT INTO crm_audit_events");
  });
});
