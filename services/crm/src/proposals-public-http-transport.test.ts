import { describe, expect, it } from "vitest";

import type { CrmProposal } from "@touristic/crm";
import {
  CrmProposalPublicBoundary,
  type CrmProposalPublicRepository,
} from "@touristic/crm/proposals-public-boundary";

import { CrmProposalPublicHttpTransport } from "./proposals-public-http-transport.js";

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
    features: ["Página personalizada"],
    customMessage: null,
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
  const repository: CrmProposalPublicRepository = {
    findByShareToken: async (value) =>
      current?.shareToken === value ? current : null,
    markViewedByToken: async (_value, viewedAt) => {
      if (!current) return null;
      current = proposal({ ...current, status: "viewed", viewedAt });
      return current;
    },
    respondActiveByToken: async (record) => {
      if (!current || !["sent", "viewed"].includes(current.status)) return null;
      current = proposal({
        ...current,
        status: record.status,
        respondedAt: record.respondedAt,
      });
      return current;
    },
    updateLeadStage: async () => {},
    appendInteraction: async () => {},
  };
  return new CrmProposalPublicHttpTransport(
    new CrmProposalPublicBoundary(repository, () => now),
  );
}

describe("CRM M83 public proposal token HTTP transport", () => {
  it("serves a minimized public proposal without a session", async () => {
    const result = await harness().handle({
      method: "GET",
      pathname: `/api/crm/public/proposals/${token}`,
    });
    expect(result).toMatchObject({
      status: 200,
      body: {
        data: {
          title: "Proposta Comercial — Morro Digital",
          status: "viewed",
          monthlyValue: "299.00",
        },
      },
    });
    expect(result.body.data).not.toHaveProperty("id");
    expect(result.body.data).not.toHaveProperty("leadId");
    expect(result.body.data).not.toHaveProperty("shareToken");
  });

  it("accepts or rejects through the public capability-token route", async () => {
    const transport = harness(proposal({ status: "viewed", viewedAt: now }));
    const result = await transport.handle({
      method: "POST",
      pathname: `/api/crm/public/proposals/${token}/respond`,
      body: { accepted: true, respondentName: "Cliente Morro" },
    });
    expect(result).toMatchObject({
      status: 200,
      body: { data: { status: "accepted" } },
    });
  });

  it("returns stable token, not-found, transition and expiry errors", async () => {
    expect(
      await harness().handle({
        method: "GET",
        pathname: "/api/crm/public/proposals/short",
      }),
    ).toMatchObject({ status: 400, body: { error: "INVALID_TOKEN" } });
    expect(
      await harness(null).handle({
        method: "GET",
        pathname: `/api/crm/public/proposals/${token}`,
      }),
    ).toMatchObject({ status: 404, body: { error: "NOT_FOUND" } });
    expect(
      await harness(proposal({ status: "accepted" })).handle({
        method: "POST",
        pathname: `/api/crm/public/proposals/${token}/respond`,
        body: { accepted: true },
      }),
    ).toMatchObject({ status: 409, body: { error: "INVALID_TRANSITION" } });
    expect(
      await harness(
        proposal({
          status: "viewed",
          validUntil: new Date("2026-08-12T19:59:59.000Z"),
        }),
      ).handle({
        method: "POST",
        pathname: `/api/crm/public/proposals/${token}/respond`,
        body: { accepted: true },
      }),
    ).toMatchObject({ status: 409, body: { error: "PROPOSAL_EXPIRED" } });
  });

  it("keeps unsupported public proposal methods fail-closed", async () => {
    expect(
      await harness().handle({
        method: "DELETE",
        pathname: `/api/crm/public/proposals/${token}`,
      }),
    ).toMatchObject({ status: 405, body: { error: "METHOD_NOT_ALLOWED" } });
  });
});
