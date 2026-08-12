import { describe, expect, it } from "vitest";

import { MySqlCrmProposalAuditPort } from "./mysql-proposals-audit-port.js";
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
  setup_fee: "99.90",
  trial_days: 14,
  features: JSON.stringify(["Página personalizada", "Mapa interativo"]),
  custom_message: "Mensagem personalizada",
  pdf_url: null,
  share_token: "proposal_token_1234567890",
  status: "draft",
  sent_at: null,
  viewed_at: null,
  responded_at: null,
  valid_until: new Date("2026-09-12T14:00:00.000Z"),
  created_at: new Date("2026-08-12T16:00:00.000Z"),
  updated_at: new Date("2026-08-12T16:00:00.000Z"),
};

describe("CRM M77/M83 MySQL proposals persistence", () => {
  it("freezes V1 proposal states with unique public token and subject identity", () => {
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_proposals",
    );
    expect(crmM71SchemaSql).toContain(
      "ENUM('draft','sent','viewed','accepted','rejected')",
    );
    expect(crmM71SchemaSql).toContain(
      "UNIQUE KEY crm_proposals_share_token_uq (share_token)",
    );
    expect(crmM71SchemaSql).toContain(
      "created_by_subject VARCHAR(191) NOT NULL",
    );
    expect(crmM71SchemaSql).toContain("CONSTRAINT crm_proposals_lead_fk");
  });

  it("keeps lead filtering prepared and orders newest proposals first", async () => {
    const { pool, calls } = poolFixture([[]]);
    const repository = new MySqlCrmProposalRepository(pool as never);
    await repository.list(7);
    expect(calls[0]?.sql).toContain("WHERE lead_id = ?");
    expect(calls[0]?.sql).toContain("ORDER BY created_at DESC, id DESC");
    expect(calls[0]?.sql).not.toContain("lead_id = 7");
    expect(calls[0]?.values).toEqual([7]);
  });

  it("reads back generated proposal ids and persists JSON features and actor subject", async () => {
    const { pool, calls } = poolFixture([{ insertId: 41 }, [proposalRow]]);
    const repository = new MySqlCrmProposalRepository(pool as never);
    const created = await repository.create({
      leadId: 7,
      title: proposalRow.title,
      planName: proposalRow.plan_name,
      monthlyValue: proposalRow.monthly_value,
      setupFee: proposalRow.setup_fee,
      trialDays: proposalRow.trial_days,
      features: ["Página personalizada", "Mapa interativo"],
      customMessage: proposalRow.custom_message,
      shareToken: proposalRow.share_token,
      status: "draft",
      validUntil: proposalRow.valid_until,
      createdBySubject: "owner-1",
    });
    expect(created.id).toBe(41);
    expect(created.features).toEqual([
      "Página personalizada",
      "Mapa interativo",
    ]);
    expect(calls[0]?.sql).toContain("created_by_subject");
    expect(calls[0]?.values).toContain("owner-1");
    expect(calls[0]?.values).toContain(
      JSON.stringify(["Página personalizada", "Mapa interativo"]),
    );
    expect(calls[1]?.values).toEqual([41]);
  });

  it("uses prepared updates for lifecycle timestamps and lead stage advancement", async () => {
    const { pool, calls } = poolFixture([
      {},
      [
        {
          ...proposalRow,
          status: "sent",
          sent_at: new Date("2026-08-12T17:00:00.000Z"),
        },
      ],
      {},
    ]);
    const repository = new MySqlCrmProposalRepository(pool as never);
    const sentAt = new Date("2026-08-12T17:00:00.000Z");
    const updated = await repository.update(41, { status: "sent", sentAt });
    await repository.updateLeadStage(7, "contract_sent");
    expect(updated.status).toBe("sent");
    expect(calls[0]?.sql).toContain("status = ?");
    expect(calls[0]?.sql).toContain("sent_at = ?");
    expect(calls[0]?.sql).not.toContain("contract_sent");
    expect(calls[0]?.values).toEqual(["sent", sentAt, 41]);
    expect(calls[2]?.values).toEqual(["contract_sent", 7]);
  });

  it("finds and marks public proposals viewed with prepared token queries", async () => {
    const viewedAt = new Date("2026-08-12T20:00:00.000Z");
    const viewedRow = { ...proposalRow, status: "viewed", viewed_at: viewedAt };
    const { pool, calls } = poolFixture([
      [proposalRow],
      { affectedRows: 1 },
      [viewedRow],
    ]);
    const repository = new MySqlCrmProposalRepository(pool as never);
    const found = await repository.findByShareToken(proposalRow.share_token);
    const viewed = await repository.markViewedByToken(
      proposalRow.share_token,
      viewedAt,
    );
    expect(found?.id).toBe(41);
    expect(calls[0]?.sql).toContain("WHERE share_token = ? LIMIT 1");
    expect(calls[0]?.values).toEqual([proposalRow.share_token]);
    expect(calls[1]?.sql).toContain("status = 'viewed'");
    expect(calls[1]?.sql).toContain("AND status = 'sent'");
    expect(calls[1]?.values).toEqual([viewedAt, proposalRow.share_token]);
    expect(viewed?.status).toBe("viewed");
  });

  it("atomically responds only to active, unexpired public proposal tokens", async () => {
    const respondedAt = new Date("2026-08-12T20:00:00.000Z");
    const acceptedRow = {
      ...proposalRow,
      status: "accepted",
      responded_at: respondedAt,
    };
    const { pool, calls } = poolFixture([
      { affectedRows: 1 },
      [acceptedRow],
    ]);
    const repository = new MySqlCrmProposalRepository(pool as never);
    const updated = await repository.respondActiveByToken({
      token: proposalRow.share_token,
      status: "accepted",
      respondedAt,
    });
    expect(calls[0]?.sql).toContain("status IN ('sent','viewed')");
    expect(calls[0]?.sql).toContain(
      "valid_until IS NULL OR valid_until >= ?",
    );
    expect(calls[0]?.values).toEqual([
      "accepted",
      respondedAt,
      proposalRow.share_token,
      respondedAt,
    ]);
    expect(updated?.status).toBe("accepted");
  });

  it("fails closed when the atomic public proposal response updates no row", async () => {
    const { pool, calls } = poolFixture([{ affectedRows: 0 }]);
    const repository = new MySqlCrmProposalRepository(pool as never);
    const result = await repository.respondActiveByToken({
      token: proposalRow.share_token,
      status: "rejected",
      respondedAt: new Date("2026-08-12T20:00:00.000Z"),
    });
    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("persists proposal interactions and audit events without interpolation", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmProposalRepository(pool as never);
    const audit = new MySqlCrmProposalAuditPort(pool as never);
    await repository.appendInteraction({
      leadId: 7,
      content: "Proposta enviada ao cliente",
      actorSubject: "owner-1",
      metadata: { proposalId: "41" },
    });
    await audit.record({
      operation: "proposal.send",
      allowed: false,
      reason: "read_only_role",
      actorSubject: "viewer-1",
      proposalId: 41,
      leadId: 7,
    });
    expect(calls[0]?.sql).toContain("VALUES (?, 'proposal', ?, ?, ?)");
    expect(calls[0]?.sql).not.toContain("owner-1");
    expect(calls[0]?.values).toEqual([
      7,
      "Proposta enviada ao cliente",
      JSON.stringify({ proposalId: "41" }),
      "owner-1",
    ]);
    expect(calls[1]?.sql).toContain("crm_audit_events");
    expect(calls[1]?.sql).not.toContain("viewer-1");
    expect(calls[1]?.values).toEqual([
      "proposal.send",
      false,
      "read_only_role",
      "viewer-1",
      7,
    ]);
  });
});
