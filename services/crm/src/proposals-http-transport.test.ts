import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmProposal } from "@touristic/crm";
import {
  CrmProposalServerBoundary,
  type CrmProposalBoundaryRepository,
} from "@touristic/crm/proposals-boundary";

import type { CrmTransportAuthPort } from "./http-transport.js";
import { CrmProposalHttpTransport } from "./proposals-http-transport.js";

const now = new Date("2026-08-12T17:30:00.000Z");

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

function proposal(overrides: Partial<CrmProposal> = {}): CrmProposal {
  return {
    id: 41,
    leadId: 7,
    title: "Proposta Comercial",
    planName: "Plano Essencial",
    monthlyValue: "299.00",
    setupFee: null,
    trialDays: 0,
    features: null,
    customMessage: null,
    pdfUrl: null,
    shareToken: "proposal_token_1234567890",
    status: "draft",
    sentAt: null,
    viewedAt: null,
    respondedAt: null,
    validUntil: new Date("2026-09-12T17:30:00.000Z"),
    createdById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(role: AuthRole = "owner", sessionPresent = true) {
  let current = proposal();
  const repository: CrmProposalBoundaryRepository = {
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    create: async (record) => {
      current = proposal({
        leadId: record.leadId,
        title: record.title,
        planName: record.planName,
        monthlyValue: record.monthlyValue,
        setupFee: record.setupFee,
        trialDays: record.trialDays,
        features: record.features,
        customMessage: record.customMessage,
        shareToken: record.shareToken,
        status: record.status,
        validUntil: record.validUntil,
      });
      return current;
    },
    update: async (_id, patch) => {
      current = proposal({ ...current, ...patch, updatedAt: now });
      return current;
    },
    updateLeadStage: async () => {},
    appendInteraction: async () => {},
  };
  const boundary = new CrmProposalServerBoundary(
    repository,
    { record: async () => {} },
    () => "proposal_token_1234567890",
    () => now,
  );
  const auth: CrmTransportAuthPort = {
    resolveSession: async () => (sessionPresent ? session(role) : null),
    authorizeMutation: async () => ({ allowed: true }),
  };
  return new CrmProposalHttpTransport(boundary, auth);
}

describe("CRM M78 proposals HTTP transport", () => {
  it("requires authentication for proposal reads", async () => {
    expect(
      await harness("owner", false).handle({
        method: "GET",
        pathname: "/api/crm/proposals",
      }),
    ).toMatchObject({ status: 401, body: { error: "AUTH_REQUIRED" } });
  });

  it("lists proposals with a lead filter", async () => {
    const result = await harness("viewer").handle({
      method: "GET",
      pathname: "/api/crm/proposals",
      query: { leadId: "7" },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([expect.objectContaining({ leadId: 7 })]);
  });

  it("creates and sends proposals through authenticated mutations", async () => {
    const transport = harness("owner");
    const created = await transport.handle({
      method: "POST",
      pathname: "/api/crm/proposals",
      body: {
        leadId: 7,
        title: "Nova proposta",
        monthlyValue: "349.00",
      },
    });
    expect(created).toMatchObject({
      status: 200,
      body: { data: { title: "Nova proposta", status: "draft" } },
    });
    const sent = await transport.handle({
      method: "POST",
      pathname: "/api/crm/proposals/41/send",
    });
    expect(sent).toMatchObject({
      status: 200,
      body: { data: { status: "sent" } },
    });
  });

  it("returns the accepted proposal for a lead", async () => {
    const transport = harness("owner");
    await transport.handle({
      method: "POST",
      pathname: "/api/crm/proposals/41/send",
    });
    await transport.handle({
      method: "POST",
      pathname: "/api/crm/proposals/41/respond",
      body: { accepted: true },
    });
    const accepted = await transport.handle({
      method: "GET",
      pathname: "/api/crm/proposals/accepted",
      query: { leadId: "7" },
    });
    expect(accepted).toMatchObject({
      status: 200,
      body: { data: { id: 41, status: "accepted" } },
    });
  });

  it("denies viewer mutations", async () => {
    expect(
      await harness("viewer").handle({
        method: "POST",
        pathname: "/api/crm/proposals",
        body: {
          leadId: 7,
          title: "Bloqueada",
          monthlyValue: "10.00",
        },
      }),
    ).toMatchObject({ status: 403, body: { error: "READ_ONLY_ROLE" } });
  });
});
