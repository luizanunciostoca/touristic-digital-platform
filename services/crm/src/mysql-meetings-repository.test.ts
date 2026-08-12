import { describe, expect, it } from "vitest";

import { MySqlCrmMeetingRepository } from "./mysql-meetings-repository.js";
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

const meetingRow = {
  id: 31,
  lead_id: 7,
  title: "Reunião comercial",
  scheduled_at: new Date("2026-08-25T17:30:00.000Z"),
  modality: "online",
  meeting_link: "https://meet.example/31",
  location: null,
  status: "scheduled",
  notes: null,
  created_at: new Date("2026-08-12T02:00:00.000Z"),
  updated_at: new Date("2026-08-12T02:00:00.000Z"),
};

describe("CRM M74 MySQL meetings persistence", () => {
  it("freezes the V1 meeting vocabulary with relational and subject identity constraints", () => {
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_meetings",
    );
    expect(crmM71SchemaSql).toContain("ENUM('in_person','online')");
    expect(crmM71SchemaSql).toContain(
      "ENUM('scheduled','done','cancelled','no_show')",
    );
    expect(crmM71SchemaSql).toContain(
      "created_by_subject VARCHAR(191) NOT NULL",
    );
    expect(crmM71SchemaSql).toContain("CONSTRAINT crm_meetings_lead_fk");
  });

  it("keeps lead filtering prepared", async () => {
    const { pool, calls } = poolFixture([[]]);
    const repository = new MySqlCrmMeetingRepository(pool as never);
    await repository.list(7);
    expect(calls[0]?.sql).toContain("WHERE lead_id = ?");
    expect(calls[0]?.sql).not.toContain("lead_id = 7");
    expect(calls[0]?.values).toEqual([7]);
  });

  it("reads back generated meeting ids and persists stable actor subject", async () => {
    const { pool, calls } = poolFixture([{ insertId: 31 }, [meetingRow]]);
    const repository = new MySqlCrmMeetingRepository(pool as never);
    const created = await repository.create({
      leadId: 7,
      title: "Reunião comercial",
      scheduledAt: meetingRow.scheduled_at,
      modality: "online",
      meetingLink: meetingRow.meeting_link,
      location: null,
      status: "scheduled",
      notes: null,
      createdBySubject: "owner-1",
    });
    expect(created.id).toBe(31);
    expect(calls[0]?.sql).toContain("created_by_subject");
    expect(calls[0]?.values).toContain("owner-1");
    expect(calls[1]?.values).toEqual([31]);
  });

  it("uses prepared updates for lifecycle transitions", async () => {
    const { pool, calls } = poolFixture([
      {},
      [{ ...meetingRow, status: "no_show" }],
    ]);
    const repository = new MySqlCrmMeetingRepository(pool as never);
    const updated = await repository.update(31, { status: "no_show" });
    expect(updated.status).toBe("no_show");
    expect(calls[0]?.sql).toContain("status = ?");
    expect(calls[0]?.sql).not.toContain("no_show");
    expect(calls[0]?.values).toEqual(["no_show", 31]);
  });

  it("persists meeting interactions without interpolating actor or content", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmMeetingRepository(pool as never);
    await repository.appendInteraction({
      leadId: 7,
      content: "Reunião agendada",
      actorSubject: "owner-1",
      metadata: { meetingId: "31" },
    });
    expect(calls[0]?.sql).toContain("VALUES (?, 'meeting', ?, ?, ?)");
    expect(calls[0]?.sql).not.toContain("owner-1");
    expect(calls[0]?.values).toEqual([
      7,
      "Reunião agendada",
      JSON.stringify({ meetingId: "31" }),
      "owner-1",
    ]);
  });
});
