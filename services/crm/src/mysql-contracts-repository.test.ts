import { describe, expect, it } from "vitest";

import { MySqlCrmContractAuditPort } from "./mysql-contracts-audit-port.js";
import { MySqlCrmContractRepository } from "./mysql-contracts-repository.js";
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

const contractRow = {
  id: 51,
  lead_id: 7,
  proposal_id: 41,
  title: "Contrato Morro Digital",
  content: "Cláusula 1. Objeto.",
  monthly_value: "299.00",
  status: "draft",
  share_token: "contract_token_1234567890",
  sent_at: null,
  signed_at: null,
  signature_data: null,
  signer_name: null,
  signer_ip: null,
  created_at: new Date("2026-08-12T18:30:00.000Z"),
  updated_at: new Date("2026-08-12T18:30:00.000Z"),
};

describe("CRM M80/M82 MySQL contracts persistence", () => {
  it("freezes the V1 contract schema with proposal linkage and unique token", () => {
    expect(crmM71SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS crm_contracts",
    );
    expect(crmM71SchemaSql).toContain(
      "ENUM('draft','sent','signed','cancelled')",
    );
    expect(crmM71SchemaSql).toContain(
      "UNIQUE KEY crm_contracts_share_token_uq (share_token)",
    );
    expect(crmM71SchemaSql).toContain(
      "CONSTRAINT crm_contracts_proposal_fk FOREIGN KEY (proposal_id) REFERENCES crm_proposals(id) ON DELETE SET NULL",
    );
    expect(crmM71SchemaSql).toContain(
      "created_by_subject VARCHAR(191) NOT NULL",
    );
  });

  it("lists contracts newest-first with a prepared lead filter", async () => {
    const { pool, calls } = poolFixture([[contractRow]]);
    const repository = new MySqlCrmContractRepository(pool as never);
    const contracts = await repository.list(7);
    expect(calls[0]?.sql).toContain("WHERE lead_id = ?");
    expect(calls[0]?.sql).toContain("ORDER BY created_at DESC, id DESC");
    expect(calls[0]?.values).toEqual([7]);
    expect(contracts[0]).toMatchObject({
      id: 51,
      leadId: 7,
      proposalId: 41,
      monthlyValue: "299.00",
      status: "draft",
    });
  });

  it("checks that an optional proposal belongs to the same lead", async () => {
    const { pool, calls } = poolFixture([[{ id: 41 }]]);
    const repository = new MySqlCrmContractRepository(pool as never);
    await expect(repository.proposalBelongsToLead(41, 7)).resolves.toBe(true);
    expect(calls[0]?.sql).toContain("id = ? AND lead_id = ?");
    expect(calls[0]?.values).toEqual([41, 7]);
  });

  it("creates a contract with stable subject identity and reads it back", async () => {
    const { pool, calls } = poolFixture([{ insertId: 51 }, [contractRow]]);
    const repository = new MySqlCrmContractRepository(pool as never);
    const created = await repository.create({
      leadId: 7,
      proposalId: 41,
      title: "Contrato Morro Digital",
      content: "Cláusula 1. Objeto.",
      monthlyValue: "299.00",
      status: "draft",
      shareToken: "contract_token_1234567890",
      createdBySubject: "owner-1",
    });
    expect(calls[0]?.sql).toContain("INSERT INTO crm_contracts");
    expect(calls[0]?.sql).toContain("created_by_subject");
    expect(calls[0]?.values).toContain("owner-1");
    expect(created.id).toBe(51);
  });

  it("updates only the contract boundary fields with prepared values", async () => {
    const { pool, calls } = poolFixture([
      { affectedRows: 1 },
      [{ ...contractRow, status: "signed", signature_data: "sig" }],
    ]);
    const repository = new MySqlCrmContractRepository(pool as never);
    const updated = await repository.update(51, {
      status: "signed",
      signedAt: new Date("2026-08-12T18:35:00.000Z"),
      signatureData: "sig",
    });
    expect(calls[0]?.sql).toContain(
      "UPDATE crm_contracts SET status = ?, signed_at = ?, signature_data = ? WHERE id = ?",
    );
    expect(updated.status).toBe("signed");
  });

  it("finds public contracts by prepared share-token lookup", async () => {
    const { pool, calls } = poolFixture([[contractRow]]);
    const repository = new MySqlCrmContractRepository(pool as never);
    const found = await repository.findByShareToken(
      "contract_token_1234567890",
    );
    expect(calls[0]?.sql).toContain("WHERE share_token = ? LIMIT 1");
    expect(calls[0]?.values).toEqual(["contract_token_1234567890"]);
    expect(found?.id).toBe(51);
  });

  it("atomically signs only a sent share token and reads back signer evidence", async () => {
    const signedRow = {
      ...contractRow,
      status: "signed",
      signed_at: new Date("2026-08-12T19:00:00.000Z"),
      signature_data: "signature",
      signer_name: "Cliente Morro",
      signer_ip: "203.0.113.10",
    };
    const { pool, calls } = poolFixture([
      { affectedRows: 1 },
      [signedRow],
    ]);
    const repository = new MySqlCrmContractRepository(pool as never);
    const signed = await repository.signSentByToken({
      token: "contract_token_1234567890",
      signedAt: signedRow.signed_at,
      signatureData: "signature",
      signerName: "Cliente Morro",
      signerIp: "203.0.113.10",
    });
    expect(calls[0]?.sql).toContain(
      "WHERE share_token = ? AND status = 'sent'",
    );
    expect(calls[0]?.values).toEqual([
      signedRow.signed_at,
      "signature",
      "Cliente Morro",
      "203.0.113.10",
      "contract_token_1234567890",
    ]);
    expect(signed).toMatchObject({
      status: "signed",
      signerName: "Cliente Morro",
      signerIp: "203.0.113.10",
    });
  });

  it("fails closed when the atomic public sign does not update exactly one row", async () => {
    const { pool, calls } = poolFixture([{ affectedRows: 0 }]);
    const repository = new MySqlCrmContractRepository(pool as never);
    const result = await repository.signSentByToken({
      token: "contract_token_1234567890",
      signedAt: new Date("2026-08-12T19:00:00.000Z"),
      signatureData: "signature",
      signerName: "Cliente Morro",
      signerIp: "203.0.113.10",
    });
    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("persists contract interactions, lead advancement and audit records", async () => {
    const { pool, calls } = poolFixture();
    const repository = new MySqlCrmContractRepository(pool as never);
    await repository.appendInteraction({
      leadId: 7,
      content: "Contrato enviado para assinatura",
      actorSubject: "owner-1",
      metadata: { contractId: "51", status: "sent" },
    });
    await repository.updateLeadStage(7, "contract_signed");
    const audit = new MySqlCrmContractAuditPort(pool as never);
    await audit.record({
      operation: "contract.cancel",
      allowed: false,
      reason: "read_only_role",
      actorSubject: "viewer-1",
      contractId: 51,
      leadId: 7,
    });
    expect(calls[0]?.sql).toContain("'contract'");
    expect(calls[1]?.sql).toContain("UPDATE crm_leads SET stage = ?");
    expect(calls[1]?.values).toEqual(["contract_signed", 7]);
    expect(calls[2]?.sql).toContain("INSERT INTO crm_audit_events");
    expect(calls[2]?.values).toEqual([
      "contract.cancel",
      false,
      "read_only_role",
      "viewer-1",
      7,
    ]);
  });
});
