import { describe, expect, it } from "vitest";

import { MySqlCrmProposalRepository } from "./mysql-proposals-repository.js";
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

const proposalRow = {
  id: 41,
  lead_id: 7,
  title: "Proposta Comercial — Morro Digital",
  plan_name: "Plano Essencial Morro Digital",
  monthly_value: "299.00",
  setup_fee: "99.00",
  trial_days: 7,
  features: JSON.stringify(["Página personalizada"]),
  custom_message: null,
  pdf_url: null,
  share_token: "0123456789abcdef0123456789abcdef",
  status: "draft",
  sent_at: null,
  viewed_at: null,
  responded_at: null,
  valid_until: new Date("2026-09-01T00:00:00.000Z"),
  created_at: new Date("2026-08-12T14:00:00.000Z"),
  updated_at: new Date("2026-08-12T14:00:00.000Z"),
};

describe("CRM M76 MySQL proposals persistence", () => {
  it("freezes proposal states, token and lead relation in schema", () => {
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_proposals",
    );
    expect(crmM71SchemaSql).toContain(
      "ENUM('draft','sent','viewed','accepted','rejected')",
    );
    expect(crmM71SchemaSql).toContain("share_token VARCHAR(64)");
    expect(crmM71SchemaSql).toContain(
      "created_by_subject VARCHAR(191) NOT NULL",
    );
    expect(crmM71SchemaSql).toContain("CONSTRAINT crm_proposals_lead_fk");
  });

  it("keeps lead filtering prepared and ordered newest-first", async () => {
    const { pool, calls } = poolFixture([[]]);
    const repository = new MySqlCrmProposalRepository(pool as never);
    await repository.list(7);
    expect(calls[0]?.sql).toContain("WHERE lead_id = ?");
    expect(calls[0]?.sql).toContain("ORDER BY created_at DESC");
    expect(calls[0]?.sql).not.toContain("lead_id = 7");
    expect(calls[0]?.values).toEqual([7]);
  });

  it(
    "persists stable actor subject, JSON features and reads back insert id",
    async () => {
      const { pool, calls } = poolFixture([{ insertId: 41 }, [proposalRow]]);
      const repository = new MySqlCrmProposalRepository(pool as never);
      const created = await repository.create({
        leadId: 7,
        title: proposalRow.title,
        planName: proposalRow.plan_name,
        monthlyValue: proposalRow.monthly_value,
        setupFee: proposalRow.setup_fee,
        trialDays: proposalRow.trial_days,
        features: ["Página personalizada"],
        customMessage: null,
        shareToken: proposalRow.share_token,
        status: "draft",
        validUntil: proposalRow.valid_until,
        createdBySubject: "owner-1",
      });
      expect(created).toMatchObject({
        id: 41,
        features: ["Página personalizada"],
      });
      expect(calls[0]?.sql).toContain("created_by_subject");
      expect(calls[0]?.values).toContain("owner-1");
      expect(calls[0]?.values).toContain(
        JSON.stringify(["Página personalizada"]),
      );
      expect(calls[1]?.values).toEqual([41]);
    },
  );

  it("uses prepared proposal and authoritative lead lifecycle updates", async () => {
    const { pool, calls } = poolFixture([
      {},
      [
        {
          ...proposalRow,
          status: "accepted",
          responded_at: proposalRow.updated_at,
        },
      ],
      {},
    ]);
    const repository = new MySqlCrmProposalRepository(pool as never);
    const updated = await repository.update(41, {
      status: "accepted",
      respondedAt: proposalRow.updated_at,
    });
    expect(updated.status).toBe("accepted");
    expect(calls[0]?.sql).toContain("status = ?");
    expect(calls[0]?.sql).not.toContain("accepted");
    expect(calls[0]?.values).toEqual([
      "accepted",
      proposalRow.updated_at,
      41,
    ]);

    await repository.updateLeadStage(7, "contract_sent");
    expect(calls[2]?.sql).toContain("stage = ?");
    expect(calls[2]?.values).toEqual(["contract_sent", 7]);
  });

  it(
    "persists proposal interactions without interpolating content or actor",
    async () => {
      const { pool, calls } = poolFixture();
      const repository = new MySqlCrmProposalRepository(pool as never);
      await repository.appendInteraction({
        leadId: 7,
        content: "Proposta enviada ao cliente",
        actorSubject: "owner-1",
        metadata: { proposalId: "41" },
      });
      expect(calls[0]?.sql).toContain("VALUES (?, 'proposal', ?, ?, ?)");
      expect(calls[0]?.sql).not.toContain("owner-1");
      expect(calls[0]?.values).toEqual([
        7,
        "Proposta enviada ao cliente",
        JSON.stringify({ proposalId: "41" }),
        "owner-1",
      ]);
    },
  );
});
