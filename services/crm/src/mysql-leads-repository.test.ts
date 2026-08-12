import { describe, expect, it } from "vitest";

import { MySqlCrmLeadRepository } from "./mysql-leads-repository.js";
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

describe("CRM M71 MySQL persistence", () => {
  it("freezes server-only identity and relational constraints in the schema", () => {
    expect(crmM71SchemaSql).toContain(
      "assigned_to_subject VARCHAR(191) NOT NULL",
    );
    expect(crmM71SchemaSql).toContain("UNIQUE KEY crm_checklist_lead_step_uq");
    expect(crmM71SchemaSql).toContain("ON DELETE CASCADE");
    expect(crmM71SchemaSql).not.toContain("assignedToId");
  });

  it("keeps filters prepared while using bounded pagination literals", async () => {
    const { pool, calls } = poolFixture([[]]);
    const repository = new MySqlCrmLeadRepository(pool as never);
    await repository.list({
      stage: "new_lead",
      status: "active",
      search: "Toca",
      limit: 25,
      offset: 5,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("stage = ?");
    expect(calls[0]?.sql).toContain("LIMIT 25 OFFSET 5");
    expect(calls[0]?.sql).not.toContain("Toca");
    expect(calls[0]?.values).toEqual([
      "new_lead",
      "active",
      "%Toca%",
      "%Toca%",
      "%Toca%",
    ]);
  });

  it("falls back to safe pagination bounds for invalid direct repository input", async () => {
    const { pool, calls } = poolFixture([[]]);
    const repository = new MySqlCrmLeadRepository(pool as never);
    await repository.list({ limit: 0, offset: -1 } as never);
    expect(calls[0]?.sql).toContain("LIMIT 50 OFFSET 0");
  });

  it("reads back the generated id before returning a created lead", async () => {
    const now = new Date("2026-08-12T00:00:00Z");
    const row = {
      id: 42,
      company_name: "Toca",
      segment: null,
      contact_name: null,
      phone: null,
      whatsapp: null,
      email: null,
      address: null,
      website: null,
      notes: null,
      stage: "new_lead",
      status: "active",
      source: null,
      referred_by_id: null,
      monthly_value: null,
      created_at: now,
      updated_at: now,
      last_contact_at: null,
      converted_at: null,
    };
    const { pool, calls } = poolFixture([{ insertId: 42 }, [row]]);
    const repository = new MySqlCrmLeadRepository(pool as never);
    const created = await repository.create({
      companyName: "Toca",
      assignedToSubject: "auth0|owner",
      stage: "new_lead",
      status: "active",
    });
    expect(created.id).toBe(42);
    expect(calls[0]?.sql).toContain("assigned_to_subject");
    expect(calls[0]?.values).toContain("auth0|owner");
    expect(calls[1]?.values).toEqual([42]);
  });

  it("initializes the frozen checklist idempotently with the real lead id", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmLeadRepository(pool as never);
    await repository.initializeChecklist(77);
    expect(calls).toHaveLength(16);
    expect(calls.every((call) => call.sql.includes("INSERT IGNORE"))).toBe(
      true,
    );
    expect(calls.every((call) => call.values?.[0] === 77)).toBe(true);
  });

  it("persists interaction metadata as data, never interpolated SQL", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmLeadRepository(pool as never);
    await repository.appendInteraction({
      leadId: 9,
      type: "stage_change",
      content: "Moved",
      actorSubject: "subject-1",
      metadata: { from: "new_lead", to: "first_contact" },
    });
    expect(calls[0]?.sql).toContain("VALUES (?, ?, ?, ?, ?)");
    expect(calls[0]?.sql).not.toContain("subject-1");
    expect(calls[0]?.values?.[0]).toBe(9);
    expect(calls[0]?.values?.[4]).toBe("subject-1");
  });
});
