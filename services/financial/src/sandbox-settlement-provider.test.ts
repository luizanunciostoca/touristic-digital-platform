import { describe, expect, it, vi } from "vitest";

import { createMoney } from "@touristic/financial";
import {
  createFinancialSettlementIdempotencyKey,
  normalizeFinancialPayableId,
  normalizeFinancialSettlementId,
} from "@touristic/financial/settlement";

import {
  SandboxSettlementProviderError,
  createSandboxSettlementProviderFromEnvironment,
} from "./sandbox-settlement-provider.js";

const environment = {
  NODE_ENV: "test",
  PAYMENTS_PROVIDER_MODE: "sandbox",
  PAYMENTS_SANDBOX_PROVIDER_BASE_URL: "https://sandbox.example.test/api/",
  PAYMENTS_SANDBOX_PROVIDER_API_TOKEN: "x".repeat(48),
  PAYMENTS_PROVIDER_TIMEOUT_MS: "1000",
};

function command() {
  const settlementId = normalizeFinancialSettlementId("stl_12345678");
  const payableId = normalizeFinancialPayableId("pbl_12345678");
  const amount = createMoney(9_000, "BRL");
  const idempotencyKey = createFinancialSettlementIdempotencyKey(payableId);
  if (!settlementId || !payableId || !amount || !idempotencyKey) {
    throw new Error("TEST_FIXTURE_INVALID");
  }
  return {
    settlementId,
    payableId,
    paymentId: "pay_12345678" as never,
    beneficiaryReference: "business_a",
    amount,
    idempotencyKey,
  };
}

describe("M146 sandbox settlement provider", () => {
  it("uses exact idempotency and bounded server-only transfer wire", async () => {
    const fetchMock = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe("https://sandbox.example.test/api/v1/transfers");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
        "settlement:v1:pbl_12345678",
      );
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${environment.PAYMENTS_SANDBOX_PROVIDER_API_TOKEN}`,
      );
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        version: 1,
        settlementId: "stl_12345678",
        paymentId: "pay_12345678",
        payableId: "pbl_12345678",
        amount: { minorUnits: 9_000, currency: "BRL" },
      });
      return new Response(
        JSON.stringify({
          version: 1,
          settlementId: "stl_12345678",
          accepted: true,
          transferReference: "transfer-12345678",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const provider = createSandboxSettlementProviderFromEnvironment(environment, {
      fetch: fetchMock as typeof fetch,
    });
    await expect(provider.requestTransfer(command())).resolves.toEqual({
      accepted: true,
      providerTransferReference: "transfer-12345678",
    });
  });

  it("reads an identity-matched provider settlement snapshot", async () => {
    const fetchMock = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://sandbox.example.test/api/v1/transfers/transfer-12345678",
      );
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      return new Response(
        JSON.stringify({
          version: 1,
          settlementId: "stl_12345678",
          transferReference: "transfer-12345678",
          status: "paid",
          amount: { minorUnits: 9_000, currency: "BRL" },
          observedAt: "2026-08-15T04:30:00Z",
        }),
        { status: 200 },
      );
    });
    const provider = createSandboxSettlementProviderFromEnvironment(environment, {
      fetch: fetchMock as typeof fetch,
    });
    await expect(
      provider.readTransfer({
        settlementId: command().settlementId,
        providerTransferReference: "transfer-12345678",
      }),
    ).resolves.toMatchObject({ status: "paid", amount: command().amount });
  });

  it("fails closed on substituted settlement identity", async () => {
    const provider = createSandboxSettlementProviderFromEnvironment(environment, {
      fetch: (async () =>
        new Response(
          JSON.stringify({
            version: 1,
            settlementId: "stl_substituted",
            accepted: true,
            transferReference: "transfer-12345678",
          }),
          { status: 200 },
        )) as typeof fetch,
    });
    await expect(provider.requestTransfer(command())).rejects.toMatchObject({
      code: "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
    } satisfies Partial<SandboxSettlementProviderError>);
  });

  it("refuses sandbox configuration without a server credential", () => {
    expect(() =>
      createSandboxSettlementProviderFromEnvironment({
        ...environment,
        PAYMENTS_SANDBOX_PROVIDER_API_TOKEN: "short",
      }),
    ).toThrow("PAYMENTS_SANDBOX_PROVIDER_API_TOKEN is required");
  });
});
