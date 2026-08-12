import { describe, expect, it } from "vitest";

import type { CrmContract } from "@touristic/crm";
import {
  CrmContractPublicBoundary,
  type CrmContractPublicRepository,
} from "@touristic/crm/contracts-public-boundary";

import { CrmContractPublicHttpTransport } from "./contracts-public-http-transport.js";

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
  const repository: CrmContractPublicRepository = {
    findByShareToken: async (value) =>
      current?.shareToken === value ? current : null,
    signSentByToken: async (record) => {
      if (
        !current ||
        current.status !== "sent" ||
        current.shareToken !== record.token
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
    updateLeadStage: async () => {},
    appendInteraction: async () => {},
  };
  return new CrmContractPublicHttpTransport(
    new CrmContractPublicBoundary(repository, () => now),
  );
}

describe("CRM M82 public contract token HTTP transport", () => {
  it("serves only the public contract projection without a session", async () => {
    const result = await harness().handle({
      method: "GET",
      pathname: `/api/crm/public/contracts/${token}`,
    });
    expect(result).toEqual({
      status: 200,
      body: {
        data: {
          title: "Contrato Morro Digital",
          content: "Cláusula 1. Objeto.",
          monthlyValue: "299.00",
          status: "sent",
          sentAt: now,
          signedAt: null,
          signerName: null,
        },
      },
    });
  });

  it("signs with signer data from the body and server-derived IP only", async () => {
    const result = await harness().handle({
      method: "POST",
      pathname: `/api/crm/public/contracts/${token}/sign`,
      clientIp: "203.0.113.10",
      body: {
        signatureData: "data:image/png;base64,signature",
        signerName: "Cliente Morro",
        signerIp: "198.51.100.99",
      },
    });
    expect(result).toMatchObject({
      status: 200,
      body: {
        data: {
          status: "signed",
          signerName: "Cliente Morro",
        },
      },
    });
    expect(result.body.data).not.toHaveProperty("signatureData");
    expect(result.body.data).not.toHaveProperty("signerIp");
    expect(result.body.data).not.toHaveProperty("shareToken");
  });

  it("returns stable token, not-found and transition errors", async () => {
    expect(
      await harness().handle({
        method: "GET",
        pathname: "/api/crm/public/contracts/short",
      }),
    ).toMatchObject({ status: 400, body: { error: "INVALID_TOKEN" } });
    expect(
      await harness(null).handle({
        method: "GET",
        pathname: `/api/crm/public/contracts/${token}`,
      }),
    ).toMatchObject({ status: 404, body: { error: "NOT_FOUND" } });
    expect(
      await harness(contract({ status: "cancelled" })).handle({
        method: "POST",
        pathname: `/api/crm/public/contracts/${token}/sign`,
        clientIp: "203.0.113.10",
        body: { signatureData: "signature", signerName: "Cliente" },
      }),
    ).toMatchObject({ status: 409, body: { error: "INVALID_TRANSITION" } });
  });

  it("rejects signing when no server-derived client IP is available", async () => {
    expect(
      await harness().handle({
        method: "POST",
        pathname: `/api/crm/public/contracts/${token}/sign`,
        body: { signatureData: "signature", signerName: "Cliente" },
      }),
    ).toMatchObject({ status: 400, body: { error: "INVALID_INPUT" } });
  });

  it("keeps unsupported public token methods fail-closed", async () => {
    expect(
      await harness().handle({
        method: "DELETE",
        pathname: `/api/crm/public/contracts/${token}`,
      }),
    ).toMatchObject({ status: 405, body: { error: "METHOD_NOT_ALLOWED" } });
  });
});
