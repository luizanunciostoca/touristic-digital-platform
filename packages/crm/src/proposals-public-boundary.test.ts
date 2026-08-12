import { describe, expect, it } from "vitest";

import type { CrmProposal } from "./index.js";
import {
  CrmProposalPublicBoundary,
  type CrmProposalPublicRepository,
  type CrmProposalPublicRespondRecord,
} from "./proposals-public-boundary.js";

const now = new Date("2026-08-12T20:00:00.000Z");
const token = "proposal_token_1234567890";

function proposal(overrides: Partial<CrmProposal> = {}): CrmProposal {
  return {
    id: 41,
    leadId: 7,
    title: "Proposta Comercial — Morro Digital",
    planName: "Plano Essencial",
    monthlyValue: "299.00",
    setupFee: "99.90",
    trialDays: 14,
    features: ["Página personalizada", "Mapa interativo"],
    customMessage: "Mensagem personalizada",
    pdfUrl: null,
    shareToken: token,
    status: "sent",
    sentAt: now,
    viewedAt: null,
    respondedAt: null,
    validUntil: new Date("2026-09-12T20:00:00.000Z"),
    createdById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(initial: CrmProposal | null = proposal()) {
  let current = initial;
  const stages: string[] = [];
  const interactions: Array<{
    leadId: number;
    content: string;
    actorSubject: string;
    metadata?: Readonly<Record<string, string>>;
  }> = [];
  const responses: CrmProposalPublicRespondRecord[] = [];
  const viewedAt: Date[] = [];
  const repository: CrmProposalPublicRepository = {
    findByShareToken: async (value) =>
      current?.shareToken === value ? current : null,
    markViewedByToken: async (value, timestamp) => {
      viewedAt.push(timestamp);
      if (!current || current.shareToken !== value || current.status !== "sent") {
        return current?.shareToken === value ? current : null;
      }
      current = proposal({ ...current, status: "viewed", viewedAt: timestamp });
      return current;
    },
    respondActiveByToken: async (record) => {
      responses.push(record);
      if (
        !current ||
        current.shareToken !== record.token ||
        !["sent", "viewed"].includes(current.status)
      ) {
        return null;
      }
      current = proposal({
        ...current,
        status: record.status,
        respondedAt: record.respondedAt,
      });
      return current;
    },
    updateLeadStage: async (_leadId, stage) => {
      stages.push(stage);
    },
    appendInteraction: async (input) => {
      interactions.push(input);
    },
  };
  return {
    boundary: new CrmProposalPublicBoundary(repository, () => now),
    viewedAt,
    responses,
    stages,
    interactions,
  };
}

describe("CRM M83 public proposal token boundary", () => {
  it("marks a sent proposal viewed and exposes only the public projection", async () => {
    const { boundary, viewedAt } = harness();
    const result = await boundary.view(token);
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Proposta Comercial — Morro Digital",
        planName: "Plano Essencial",
        monthlyValue: "299.00",
        setupFee: "99.90",
        trialDays: 14,
        features: ["Página personalizada", "Mapa interativo"],
        customMessage: "Mensagem personalizada",
        pdfUrl: null,
        status: "viewed",
        sentAt: now,
        viewedAt: now,
        respondedAt: null,
        validUntil: new Date("2026-09-12T20:00:00.000Z"),
      },
    });
    expect(viewedAt).toEqual([now]);
    if (result.ok) {
      expect(result.value).not.toHaveProperty("id");
      expect(result.value).not.toHaveProperty("leadId");
      expect(result.value).not.toHaveProperty("shareToken");
      expect(result.value).not.toHaveProperty("createdById");
    }
  });

  it("fails closed for malformed and unknown tokens", async () => {
    expect(await harness().boundary.view("short")).toEqual({
      ok: false,
      reason: "invalid_token",
    });
    expect(await harness(null).boundary.view(token)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("accepts an active proposal, advances the lead and records public interaction", async () => {
    const { boundary, responses, stages, interactions } = harness(
      proposal({ status: "viewed", viewedAt: now }),
    );
    const result = await boundary.respond({
      token,
      accepted: true,
      respondentName: "  Cliente   Morro  ",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { status: "accepted", respondedAt: now },
    });
    expect(responses).toEqual([{ token, status: "accepted", respondedAt: now }]);
    expect(stages).toEqual(["contract_sent"]);
    expect(interactions).toHaveLength(1);
    expect(interactions[0]).toMatchObject({
      leadId: 7,
      actorSubject: "public-proposal-token",
      metadata: {
        proposalId: "41",
        status: "accepted",
        respondentName: "Cliente Morro",
      },
    });
    expect(interactions[0]?.content).toContain("Cliente Morro");
  });

  it("rejects without advancing the lead", async () => {
    const { boundary, stages, interactions } = harness(
      proposal({ status: "viewed", viewedAt: now }),
    );
    const result = await boundary.respond({ token, accepted: false });
    expect(result).toMatchObject({
      ok: true,
      value: { status: "rejected", respondedAt: now },
    });
    expect(stages).toEqual([]);
    expect(interactions[0]?.metadata).toMatchObject({ status: "rejected" });
  });

  it("rejects draft and final proposals and expired proposals", async () => {
    for (const status of ["draft", "accepted", "rejected"] as const) {
      expect(
        await harness(proposal({ status })).boundary.respond({
          token,
          accepted: true,
        }),
      ).toEqual({ ok: false, reason: "invalid_transition" });
    }
    expect(
      await harness(
        proposal({
          status: "viewed",
          validUntil: new Date("2026-08-12T19:59:59.000Z"),
        }),
      ).boundary.respond({ token, accepted: true }),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("requires a boolean response and bounded optional respondent name", async () => {
    expect(
      await harness().boundary.respond({ token, accepted: "yes" }),
    ).toEqual({ ok: false, reason: "invalid_input" });
    expect(
      await harness().boundary.respond({
        token,
        accepted: true,
        respondentName: 42,
      }),
    ).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("fails closed when an atomic response loses a concurrent transition", async () => {
    const current = proposal({ status: "viewed", viewedAt: now });
    const repository: CrmProposalPublicRepository = {
      findByShareToken: async () => current,
      markViewedByToken: async () => current,
      respondActiveByToken: async () => null,
      updateLeadStage: async () => {},
      appendInteraction: async () => {},
    };
    const boundary = new CrmProposalPublicBoundary(repository, () => now);
    expect(await boundary.respond({ token, accepted: true })).toEqual({
      ok: false,
      reason: "invalid_transition",
    });
  });
});
