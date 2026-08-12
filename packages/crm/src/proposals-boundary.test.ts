import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";

import type { CrmProposal } from "./index.js";
import {
  CrmProposalServerBoundary,
  type CrmProposalAuditEvent,
  type CrmProposalBoundaryRepository,
} from "./proposals-boundary.js";

const now = new Date("2026-08-12T14:00:00.000Z");
const token = "0123456789abcdef0123456789abcdef";

function session(role: AuthRole = "owner"): AuthSessionIdentity {
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
    id: 21,
    leadId: 7,
    title: "Proposta Comercial — Morro Digital",
    planName: "Plano Essencial Morro Digital",
    monthlyValue: "299.00",
    setupFee: "99.00",
    trialDays: 7,
    features: ["Página personalizada", "Fotos profissionais"],
    customMessage: null,
    pdfUrl: null,
    shareToken: token,
    status: "draft",
    sentAt: null,
    viewedAt: null,
    respondedAt: null,
    validUntil: new Date("2026-09-01T00:00:00.000Z"),
    createdById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(options: { role?: AuthRole; sessionPresent?: boolean } = {}) {
  let current = proposal();
  let leadStage = "proposal_sent";
  const interactions: Array<{ leadId: number; content: string }> = [];
  const audits: CrmProposalAuditEvent[] = [];
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
    updateLeadStage: async (_leadId, stage) => {
      leadStage = stage;
    },
    appendInteraction: async (input) => {
      interactions.push({ leadId: input.leadId, content: input.content });
    },
  };
  const boundary = new CrmProposalServerBoundary(
    repository,
    { record: async (event) => audits.push(event) },
    () => token,
    () => now,
  );
  const activeSession =
    options.sessionPresent === false ? null : session(options.role ?? "owner");
  return {
    boundary,
    activeSession,
    interactions,
    audits,
    getLeadStage: () => leadStage,
  };
}

describe("CRM M76 proposals lifecycle boundary", () => {
  it("requires authentication for proposal reads", async () => {
    const { boundary, audits } = harness({ sessionPresent: false });
    const result = await boundary.list(null);
    expect(result).toEqual({ ok: false, reason: "authentication_required" });
    expect(audits).toContainEqual(
      expect.objectContaining({
        operation: "proposal.list",
        allowed: false,
        reason: "authentication_required",
      }),
    );
  });

  it("lists by lead and returns the most recent accepted proposal", async () => {
    const { boundary, activeSession } = harness({ role: "viewer" });
    expect(await boundary.list(activeSession, 7)).toMatchObject({
      ok: true,
      value: [expect.objectContaining({ leadId: 7 })],
    });

    const acceptedHarness = harness({ role: "viewer" });
    await acceptedHarness.boundary.respond(
      session("manager"),
      { id: 21, accepted: true },
    );
    expect(
      await acceptedHarness.boundary.getAccepted(
        acceptedHarness.activeSession,
        7,
      ),
    ).toMatchObject({
      ok: true,
      value: { id: 21, status: "accepted" },
    });
  });

  it("creates a draft with frozen fields, share token and interaction", async () => {
    const { boundary, activeSession, interactions } = harness();
    const result = await boundary.create(activeSession, {
      leadId: 7,
      title: " Proposta Comercial — Morro Digital ",
      planName: "Plano Essencial Morro Digital",
      monthlyValue: "299.00",
      setupFee: "99.00",
      trialDays: 7,
      features: ["Página personalizada", "Fotos profissionais"],
      customMessage: "Olá, segue nossa proposta.",
      validUntil: "2026-09-01T00:00:00.000Z",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        leadId: 7,
        status: "draft",
        shareToken: token,
        monthlyValue: "299.00",
        trialDays: 7,
      },
    });
    expect(interactions[0]).toMatchObject({
      leadId: 7,
      content: 'Proposta "Proposta Comercial — Morro Digital" criada — R$ 299.00/mês',
    });
  });

  it("fails closed for invalid money, token or missing lead", async () => {
    const base = harness();
    expect(
      await base.boundary.create(base.activeSession, {
        leadId: 7,
        title: "Proposta",
        monthlyValue: "299,00",
      }),
    ).toMatchObject({ ok: false, reason: "invalid_input" });

    const badTokenBoundary = new CrmProposalServerBoundary(
      {
        list: async () => [],
        findById: async () => null,
        leadExists: async () => true,
        create: async () => proposal(),
        update: async () => proposal(),
        updateLeadStage: async () => {},
        appendInteraction: async () => {},
      },
      { record: async () => {} },
      () => "short-token",
      () => now,
    );
    expect(
      await badTokenBoundary.create(session(), {
        leadId: 7,
        title: "Proposta",
        monthlyValue: "299.00",
      }),
    ).toMatchObject({ ok: false, reason: "invalid_input" });

    const missingLead = harness();
    expect(
      await missingLead.boundary.create(missingLead.activeSession, {
        leadId: 999,
        title: "Proposta",
        monthlyValue: "299.00",
      }),
    ).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("marks a proposal as sent using the proposal-owned lead relation", async () => {
    const { boundary, activeSession, interactions } = harness();
    const result = await boundary.send(activeSession, { id: 21 });
    expect(result).toMatchObject({
      ok: true,
      value: { status: "sent", sentAt: now },
    });
    expect(interactions).toContainEqual({
      leadId: 7,
      content: "Proposta enviada ao cliente",
    });
  });

  it("accepts and rejects proposals; acceptance advances the authoritative lead", async () => {
    const accepted = harness({ role: "manager" });
    expect(
      await accepted.boundary.respond(accepted.activeSession, {
        id: 21,
        accepted: true,
      }),
    ).toMatchObject({
      ok: true,
      value: { status: "accepted", respondedAt: now },
    });
    expect(accepted.getLeadStage()).toBe("contract_sent");
    expect(accepted.interactions[0]?.content).toBe(
      "Proposta aceita pelo cliente",
    );

    const rejected = harness({ role: "owner" });
    expect(
      await rejected.boundary.respond(rejected.activeSession, {
        id: 21,
        accepted: false,
      }),
    ).toMatchObject({ ok: true, value: { status: "rejected" } });
    expect(rejected.getLeadStage()).toBe("proposal_sent");
  });

  it("denies viewer mutations through the shared CRM authorization policy", async () => {
    const { boundary, activeSession, audits } = harness({ role: "viewer" });
    expect(await boundary.send(activeSession, { id: 21 })).toEqual({
      ok: false,
      reason: "read_only_role",
    });
    expect(audits).toContainEqual(
      expect.objectContaining({
        operation: "proposal.send",
        allowed: false,
        reason: "read_only_role",
      }),
    );
  });
});
