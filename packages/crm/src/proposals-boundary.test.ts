import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmProposal } from "./index.js";
import {
  CrmProposalServerBoundary,
  type CrmProposalAuditEvent,
  type CrmProposalBoundaryRepository,
  type CrmProposalCreateRecord,
  type CrmProposalUpdateRecord,
} from "./proposals-boundary.js";

const now = new Date("2026-08-12T14:00:00.000Z");

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
    id: 21,
    leadId: 7,
    title: "Proposta Comercial — Morro Digital",
    planName: "Plano Essencial Morro Digital",
    monthlyValue: "299.00",
    setupFee: null,
    trialDays: 0,
    features: ["Página personalizada", "Mapa interativo"],
    customMessage: null,
    pdfUrl: null,
    shareToken: "proposal_token_1234567890",
    status: "draft",
    sentAt: null,
    viewedAt: null,
    respondedAt: null,
    validUntil: new Date("2026-09-12T14:00:00.000Z"),
    createdById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(initial: CrmProposal = proposal()) {
  const audits: CrmProposalAuditEvent[] = [];
  const interactions: Array<{
    leadId: number;
    content: string;
    actorSubject: string;
    metadata?: Readonly<Record<string, string>>;
  }> = [];
  const leadStages: string[] = [];
  let current = initial;

  const repository: CrmProposalBoundaryRepository = {
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    create: async (record: CrmProposalCreateRecord) => {
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
    update: async (_id, patch: CrmProposalUpdateRecord) => {
      current = proposal({ ...current, ...patch, updatedAt: now });
      return current;
    },
    updateLeadStage: async (_leadId, stage) => {
      leadStages.push(stage);
    },
    appendInteraction: async (input) => {
      interactions.push(input);
    },
  };

  const boundary = new CrmProposalServerBoundary(
    repository,
    {
      record: async (event) => {
        audits.push(event);
      },
    },
    () => "proposal_token_1234567890",
    () => now,
  );

  return { boundary, audits, interactions, leadStages };
}

describe("CRM M76 proposals boundary", () => {
  it("lists proposals for an authenticated CRM reader", async () => {
    const { boundary } = harness();
    const result = await boundary.list(session("viewer"), 7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it("creates a draft proposal with a bounded share token and interaction", async () => {
    const { boundary, interactions } = harness();
    const result = await boundary.create(session("owner"), {
      leadId: 7,
      title: "Proposta Comercial — Morro Digital",
      planName: "Plano Essencial Morro Digital",
      monthlyValue: "299.00",
      setupFee: "99.90",
      trialDays: 14,
      features: ["Página personalizada", "Mapa interativo"],
      validUntil: "2026-09-12T14:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("draft");
      expect(result.value.shareToken).toBe("proposal_token_1234567890");
      expect(result.value.monthlyValue).toBe("299.00");
    }
    expect(interactions).toHaveLength(1);
    expect(interactions[0]?.content).toContain("299.00/mês");
  });

  it("sends only a draft proposal and timestamps the transition", async () => {
    const { boundary, interactions } = harness();
    const result = await boundary.send(session("manager"), { id: 21 });
    expect(result).toMatchObject({
      ok: true,
      value: { status: "sent", sentAt: now },
    });
    expect(interactions.at(-1)?.content).toBe("Proposta enviada ao cliente");
  });

  it("accepts a sent proposal and advances the lead to contract_sent", async () => {
    const { boundary, interactions, leadStages } = harness(
      proposal({ status: "sent", sentAt: now }),
    );
    const result = await boundary.respond(session("owner"), {
      id: 21,
      accepted: true,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { status: "accepted", respondedAt: now },
    });
    expect(leadStages).toEqual(["contract_sent"]);
    expect(interactions.at(-1)?.content).toBe("Proposta aceita pelo cliente");
  });

  it("rejects invalid, expired and repeated transitions with audit evidence", async () => {
    const invalid = harness();
    expect(
      await invalid.boundary.create(session("admin"), {
        leadId: 7,
        title: "Inválida",
        monthlyValue: "29,90",
      }),
    ).toEqual({ ok: false, reason: "invalid_input" });

    const expired = harness(
      proposal({
        status: "sent",
        validUntil: new Date("2026-08-11T14:00:00.000Z"),
      }),
    );
    expect(
      await expired.boundary.respond(session("admin"), {
        id: 21,
        accepted: false,
      }),
    ).toEqual({ ok: false, reason: "expired" });

    const final = harness(proposal({ status: "accepted" }));
    expect(
      await final.boundary.respond(session("admin"), {
        id: 21,
        accepted: false,
      }),
    ).toEqual({ ok: false, reason: "invalid_transition" });
    expect(final.audits.at(-1)?.reason).toBe("invalid_transition");
  });

  it("returns the accepted proposal for contract prefill and fails closed for viewer mutations", async () => {
    const accepted = harness(proposal({ status: "accepted" }));
    const found = await accepted.boundary.getAccepted(session("viewer"), 7);
    expect(found).toMatchObject({ ok: true, value: { id: 21, status: "accepted" } });

    const blocked = harness();
    expect(
      await blocked.boundary.send(session("viewer"), { id: 21 }),
    ).toEqual({ ok: false, reason: "read_only_role" });
    expect(blocked.audits.at(-1)?.reason).toBe("read_only_role");
  });
});
