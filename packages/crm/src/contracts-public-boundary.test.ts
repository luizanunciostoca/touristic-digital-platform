import { describe, expect, it } from "vitest";

import type { CrmContract } from "./index.js";
import {
  CrmContractPublicBoundary,
  type CrmContractPublicRepository,
  type CrmContractPublicSignRecord,
} from "./contracts-public-boundary.js";

const now = new Date("2026-08-12T19:00:00.000Z");
const token = "contract_token_1234567890";

function contract(overrides: Partial<CrmContract> = {}): CrmContract {
  return {
    id: 51,
    leadId: 7,
    proposalId: 41,
    title: "Contrato Morro Digital",
    content: "Cláusula 1. Objeto.",
    monthlyValue: "299.00",
    status: "sent",
    shareToken: token,
    sentAt: now,
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

function harness(initial: CrmContract | null = contract()) {
  let current = initial;
  const stages: string[] = [];
  const interactions: Array<{
    leadId: number;
    content: string;
    actorSubject: string;
    metadata?: Readonly<Record<string, string>>;
  }> = [];
  const signatures: CrmContractPublicSignRecord[] = [];
  const repository: CrmContractPublicRepository = {
    findByShareToken: async (value) =>
      current?.shareToken === value ? current : null,
    signSentByToken: async (record) => {
      signatures.push(record);
      if (
        !current ||
        current.shareToken !== record.token ||
        current.status !== "sent"
      ) {
        return null;
      }
      current = contract({
        ...current,
        status: "signed",
        signedAt: record.signedAt,
        signatureData: record.signatureData,
        signerName: record.signerName,
        signerIp: record.signerIp,
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
    boundary: new CrmContractPublicBoundary(repository, () => now),
    signatures,
    stages,
    interactions,
  };
}

describe("CRM M82 public contract token boundary", () => {
  it("returns only the public contract projection for a valid token", async () => {
    const result = await harness().boundary.view(token);
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Contrato Morro Digital",
        content: "Cláusula 1. Objeto.",
        monthlyValue: "299.00",
        status: "sent",
        sentAt: now,
        signedAt: null,
        signerName: null,
      },
    });
    if (result.ok) {
      expect(result.value).not.toHaveProperty("id");
      expect(result.value).not.toHaveProperty("leadId");
      expect(result.value).not.toHaveProperty("proposalId");
      expect(result.value).not.toHaveProperty("shareToken");
      expect(result.value).not.toHaveProperty("signatureData");
      expect(result.value).not.toHaveProperty("signerIp");
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

  it("signs only sent contracts and records signer evidence", async () => {
    const { boundary, signatures, stages, interactions } = harness();
    const result = await boundary.sign({
      token,
      signatureData: "data:image/png;base64,signature",
      signerName: "  Cliente   Morro  ",
      signerIp: "203.0.113.10",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Contrato Morro Digital",
        content: "Cláusula 1. Objeto.",
        monthlyValue: "299.00",
        status: "signed",
        sentAt: now,
        signedAt: now,
        signerName: "Cliente Morro",
      },
    });
    expect(signatures).toEqual([
      expect.objectContaining({
        token,
        signerName: "Cliente Morro",
        signerIp: "203.0.113.10",
        signedAt: now,
      }),
    ]);
    expect(stages).toEqual(["contract_signed"]);
    expect(interactions).toEqual([
      expect.objectContaining({
        leadId: 7,
        actorSubject: "public-contract-token",
        metadata: expect.objectContaining({
          contractId: "51",
          status: "signed",
          signerName: "Cliente Morro",
          signerIp: "203.0.113.10",
        }),
      }),
    ]);
  });

  it("rejects draft, signed and cancelled contracts", async () => {
    for (const status of ["draft", "signed", "cancelled"] as const) {
      const result = await harness(contract({ status })).boundary.sign({
        token,
        signatureData: "data:image/png;base64,signature",
        signerName: "Cliente",
        signerIp: "203.0.113.10",
      });
      expect(result).toEqual({ ok: false, reason: "invalid_transition" });
    }
  });

  it("requires bounded signature, signer name and server-derived IP", async () => {
    expect(
      await harness().boundary.sign({
        token,
        signatureData: "",
        signerName: "Cliente",
        signerIp: "203.0.113.10",
      }),
    ).toEqual({ ok: false, reason: "invalid_input" });
    expect(
      await harness().boundary.sign({
        token,
        signatureData: "signature",
        signerName: "",
        signerIp: "203.0.113.10",
      }),
    ).toEqual({ ok: false, reason: "invalid_input" });
    expect(
      await harness().boundary.sign({
        token,
        signatureData: "signature",
        signerName: "Cliente",
        signerIp: "",
      }),
    ).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("fails closed when an atomic sign loses a concurrent transition", async () => {
    const current = contract();
    const repository: CrmContractPublicRepository = {
      findByShareToken: async () => current,
      signSentByToken: async () => null,
      updateLeadStage: async () => {},
      appendInteraction: async () => {},
    };
    const boundary = new CrmContractPublicBoundary(repository, () => now);
    expect(
      await boundary.sign({
        token,
        signatureData: "signature",
        signerName: "Cliente",
        signerIp: "203.0.113.10",
      }),
    ).toEqual({ ok: false, reason: "invalid_transition" });
  });
});
