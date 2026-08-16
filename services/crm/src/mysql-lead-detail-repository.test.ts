import { describe, expect, it } from "vitest";

import { MySqlCrmLeadDetailRepository } from "./mysql-lead-detail-repository.js";
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

const checklistRow = {
  id: 11,
  lead_id: 7,
  step: "first_contact",
  completed: 1,
  completed_at: new Date("2026-08-16T04:10:00Z"),
  completed_by_subject: "crm-manager",
  notes: null,
  created_at: new Date("2026-08-16T04:00:00Z"),
};

describe("CRM M140 lead detail MySQL persistence", () => {
  it("uses the existing checklist and interaction schema without a migration", () => {
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_checklist_items",
    );
    expect(crmM71SchemaSql).toContain("completed_by_subject VARCHAR(191) NULL");
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_interactions",
    );
    expect(crmM71SchemaSql).toContain("actor_subject VARCHAR(191) NOT NULL");
  });

  it("reads checklist items through prepared lead ownership filters", async () => {
    const { pool, calls } = poolFixture([[checklistRow]]);
    const repository = new MySqlCrmLeadDetailRepository(pool as never);
    const items = await repository.listChecklist(7);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: 11,
        leadId: 7,
        completed: true,
        completedBySubject: "crm-manager",
      }),
    );
    expect(calls[0]?.sql).toContain("WHERE lead_id = ?");
    expect(calls[0]?.values).toEqual([7]);
  });

  it("binds checklist updates to both item and lead before readback", async () => {
    const { pool, calls } = poolFixture([[], [checklistRow]]);
    const repository = new MySqlCrmLeadDetailRepository(pool as never);
    const completedAt = new Date("2026-08-16T04:10:00Z");
    const updated = await repository.setChecklistCompletion({
      id: 11,
      leadId: 7,
      completed: true,
      completedAt,
      completedBySubject: "crm-manager",
    });
    expect(updated?.completed).toBe(true);
    expect(calls[0]?.sql).toContain("WHERE id = ? AND lead_id = ?");
    expect(calls[0]?.values).toEqual([true, completedAt, "crm-manager", 11, 7]);
    expect(calls[1]?.values).toEqual([11]);
  });

  it("returns a bounded newest-first activity history", async () => {
    const interaction = {
      id: 21,
      lead_id: 7,
      type: "note",
      content: "Retornar amanhã",
      metadata: null,
      actor_subject: "crm-admin",
      created_at: new Date("2026-08-16T04:11:00Z"),
    };
    const { pool, calls } = poolFixture([[interaction]]);
    const repository = new MySqlCrmLeadDetailRepository(pool as never);
    const rows = await repository.listInteractions(7);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: 21,
        leadId: 7,
        type: "note",
        actorSubject: "crm-admin",
      }),
    );
    expect(calls[0]?.sql).toContain(
      "ORDER BY created_at DESC, id DESC LIMIT 200",
    );
    expect(calls[0]?.values).toEqual([7]);
  });

  it("persists manual activity and last-contact timestamps as prepared data", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmLeadDetailRepository(pool as never);
    await repository.appendInteraction({
      leadId: 7,
      type: "note",
      content: "Cliente pediu retorno",
      actorSubject: "crm-admin",
    });
    const timestamp = new Date("2026-08-16T04:12:00Z");
    await repository.touchLeadLastContactAt(7, timestamp);
    expect(calls[0]?.sql).toContain("VALUES (?, ?, ?, ?, ?)");
    expect(calls[0]?.sql).not.toContain("Cliente pediu retorno");
    expect(calls[0]?.values).toEqual([
      7,
      "note",
      "Cliente pediu retorno",
      null,
      "crm-admin",
    ]);
    expect(calls[1]?.values).toEqual([timestamp, 7]);
  });
});
