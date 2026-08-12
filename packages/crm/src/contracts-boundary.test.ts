import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmContract } from "./index.js";
import {
  CrmContractServerBoundary,
  type CrmContractAuditEvent,
  type CrmContractBoundaryRepository,
  type CrmContractCreateRecord,
  type CrmContractUpdateRecord,
} from "./contracts-boundary.js";

const now = new Date("2026-08-12T18:00:00.000Z");

function session(role: AuthRole): AuthSessionIdentity {
  return {
    subject: `crm-${role}`,
    email: `${role}@example.com`,
    role,
    businessIds: [],
    issuedAt: 1_000,
    expiresAt: 9_999_999_999,
    sessionId: `session-${role}`,
  };
}

function contract(overrides: Partial<CrmContract> = {}): CrmContract {
  return {
    id: 51,
    leadId: 7,
    proposalId: 41,
    title: "Contrato de Prestação de Serviços",
    content: "Cláusula 1. Objeto do contrato.",
    monthlyValue: "299.00",
    status: "draft",
    shareToken: "contract_token_1234567890",
    sentAt: null,
    signedAt: null,
    signatureData: null,
    signerName: null,
    signerIp: null,
    createdById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(initial: CrmContract = contract()) {
  let current = initial;
  const audits: CrmContractAuditEvent[] = [];
  const interactions: Array<{
    leadId: number;
    content: string;
    actorSubject: string;
    metadata?: Readonly<Record<string, string>>;
  }> = [];
  const leadStages: string[] = [];

  const repository: CrmContractBoundaryRepository = {
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    proposalBelongsToLead: async (proposalId, leadId) =>
      proposalId === 41 && leadId === 7,
    create: async (record: CrmContractCreateRecord) => {
      current = contract({
        leadId: record.leadId,
        proposalId: record.proposalId,
        title: record.title,
        content: record.content,
        monthlyValue: record.monthlyValue,
        status: record.status,
        shareToken: record.shareToken,
      });
      return current;
    },
    update: async (_id, patch: CrmContractUpdateRecord) => {
      current = contract({ ...current, ...patch, updatedAt: now });
      return current;
    },
    updateLeadStage: async (_leadId, stage) => {
      leadStages.push(stage);
    },
    appendInteraction: async (input) => {
      interactions.push(input);
    },
  };

  const boundary = new CrmContractServerBoundary(
    repository,
    {
      record: async (event) => {
        audits.push(event);
      },
    },
    () => "contract_token_1234567890",
    () => now,
  );

  return { boundary, repository, audits, interactions, leadStages };
}

describe("CRM M79 contracts boundary", () => {
  it("lists contracts for an authenticated viewer", async () => {
    const { boundary } = harness();
    const result = await boundary.list(session("viewer"), 7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it("creates a draft contract linked to a proposal and appends interaction", async () => {
    const { boundary, interactions } = harness();
    const result = await boundary.create(session("owner"), {
      leadId: 7,
      proposalId: 41,
      title: "Contrato Morro Digital",
      content: "Cláusula 1. Objeto.",
      monthlyValue: "299.00",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        leadId: 7,
        proposalId: 41,
        status: "draft",
      });
    }
    expect(interactions).toEqual([
      expect.objectContaining({
        leadId: 7,
        actorSubject: "crm-owner",
        metadata: { contractId: "51", status: "draft" },
      }),
    ]);
  });

  it("rejects a proposal relation that does not belong to the lead", async () => {
    const { boundary, audits } = harness();
    const result = await boundary.create(session("owner"), {
      leadId: 7,
      proposalId: 99,
      title: "Contrato inválido",
      content: "Cláusula 1.",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(audits.at(-1)).toMatchObject({
      operation: "contract.create",
      reason: "not_found",
      leadId: 7,
    });
  });

  it("sends a draft contract and blocks duplicate sends", async () => {
    const { boundary } = harness();
    const sent = await boundary.send(session("owner"), { id: 51 });
    expect(sent).toMatchObject({
      ok: true,
      value: { status: "sent", sentAt: now },
    });
    const duplicate = await boundary.send(session("owner"), { id: 51 });
    expect(duplicate).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("signs a draft or sent contract and advances the lead", async () => {
    const { boundary, leadStages, interactions } = harness(
      contract({ status: "sent", sentAt: now }),
    );
    const result = await boundary.sign(session("owner"), {
      id: 51,
      signatureData: "assinatura-digital",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { status: "signed", signedAt: now },
    });
    expect(leadStages).toEqual(["contract_signed"]);
    expect(interactions.at(-1)?.content).toContain("assinado");
  });

  it("cancels draft or sent contracts but never signed contracts", async () => {
    const draftHarness = harness();
    const cancelled = await draftHarness.boundary.cancel(session("manager"), {
      id: 51,
      reason: "Cliente solicitou revisão",
    });
    expect(cancelled).toMatchObject({
      ok: true,
      value: { status: "cancelled" },
    });
    expect(draftHarness.interactions.at(-1)?.content).toContain(
      "Cliente solicitou revisão",
    );

    const signedHarness = harness(
      contract({ status: "signed", signedAt: now }),
    );
    expect(
      await signedHarness.boundary.cancel(session("owner"), { id: 51 }),
    ).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("denies viewer mutations and records durable-audit shaped evidence", async () => {
    const { boundary, audits } = harness();
    const result = await boundary.create(session("viewer"), {
      leadId: 7,
      title: "Bloqueado",
      content: "Não deve persistir",
    });
    expect(result).toEqual({ ok: false, reason: "read_only_role" });
    expect(audits).toContainEqual(
      expect.objectContaining({
        operation: "contract.create",
        allowed: false,
        reason: "read_only_role",
        actorSubject: "crm-viewer",
      }),
    );
  });

  it("fails closed for unauthenticated reads and invalid token factories", async () => {
    const unauthenticated = harness();
    expect(await unauthenticated.boundary.list(null)).toEqual({
      ok: false,
      reason: "authentication_required",
    });

    const repositoryHarness = harness();
    const invalidTokenBoundary = new CrmContractServerBoundary(
      repositoryHarness.repository,
      { record: async () => {} },
      () => "short",
      () => now,
    );
    const result = await invalidTokenBoundary.create(session("owner"), {
      leadId: 7,
      title: "Contrato",
      content: "Cláusula 1.",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_input" });
  });
});
