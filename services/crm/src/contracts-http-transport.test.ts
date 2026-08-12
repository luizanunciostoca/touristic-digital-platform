import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmContract } from "@touristic/crm";
import {
  CrmContractServerBoundary,
  type CrmContractBoundaryRepository,
} from "@touristic/crm/contracts-boundary";

import type { CrmTransportAuthPort } from "./http-transport.js";
import { CrmContractHttpTransport } from "./contracts-http-transport.js";

const now = new Date("2026-08-12T18:45:00.000Z");

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
    title: "Contrato Comercial",
    content: "Cláusula 1. Objeto.",
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

function harness(role: AuthRole = "owner", sessionPresent = true) {
  let current = contract();
  const repository: CrmContractBoundaryRepository = {
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    proposalBelongsToLead: async (proposalId, leadId) =>
      proposalId === 41 && leadId === 7,
    create: async (record) => {
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
    update: async (_id, patch) => {
      current = contract({ ...current, ...patch, updatedAt: now });
      return current;
    },
    updateLeadStage: async () => {},
    appendInteraction: async () => {},
  };
  const boundary = new CrmContractServerBoundary(
    repository,
    { record: async () => {} },
    () => "contract_token_1234567890",
    () => now,
  );
  const auth: CrmTransportAuthPort = {
    resolveSession: async () => (sessionPresent ? session(role) : null),
    authorizeMutation: async () => ({ allowed: true }),
  };
  return new CrmContractHttpTransport(boundary, auth);
}

describe("CRM M81 contracts HTTP transport", () => {
  it("requires authentication for contract reads", async () => {
    expect(
      await harness("owner", false).handle({
        method: "GET",
        pathname: "/api/crm/contracts",
      }),
    ).toMatchObject({ status: 401, body: { error: "AUTH_REQUIRED" } });
  });

  it("lists contracts with a lead filter", async () => {
    const result = await harness("viewer").handle({
      method: "GET",
      pathname: "/api/crm/contracts",
      query: { leadId: "7" },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([expect.objectContaining({ leadId: 7 })]);
  });

  it("creates and sends contracts through authenticated mutations", async () => {
    const transport = harness("owner");
    const created = await transport.handle({
      method: "POST",
      pathname: "/api/crm/contracts",
      body: {
        leadId: "7",
        proposalId: "41",
        title: "Novo contrato",
        content: "Cláusula 1.",
        monthlyValue: "349.00",
      },
    });
    expect(created).toMatchObject({
      status: 200,
      body: { data: { title: "Novo contrato", status: "draft" } },
    });
    const sent = await transport.handle({
      method: "POST",
      pathname: "/api/crm/contracts/51/send",
    });
    expect(sent).toMatchObject({
      status: 200,
      body: { data: { status: "sent" } },
    });
  });

  it("signs and cancels through explicit command routes", async () => {
    const signTransport = harness("owner");
    await signTransport.handle({
      method: "POST",
      pathname: "/api/crm/contracts/51/send",
    });
    const signed = await signTransport.handle({
      method: "POST",
      pathname: "/api/crm/contracts/51/sign",
      body: { signatureData: "assinatura-interna" },
    });
    expect(signed).toMatchObject({
      status: 200,
      body: { data: { status: "signed" } },
    });

    const cancelTransport = harness("manager");
    const cancelled = await cancelTransport.handle({
      method: "POST",
      pathname: "/api/crm/contracts/51/cancel",
      body: { reason: "Cliente pediu revisão" },
    });
    expect(cancelled).toMatchObject({
      status: 200,
      body: { data: { status: "cancelled" } },
    });
  });

  it("denies viewer mutations", async () => {
    expect(
      await harness("viewer").handle({
        method: "POST",
        pathname: "/api/crm/contracts",
        body: {
          leadId: 7,
          title: "Bloqueado",
          content: "Não persistir",
        },
      }),
    ).toMatchObject({ status: 403, body: { error: "READ_ONLY_ROLE" } });
  });
});
