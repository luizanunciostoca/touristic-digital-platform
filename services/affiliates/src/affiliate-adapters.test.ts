import {
  normalizeAffiliateId,
  normalizeCommissionEntitlementId,
  normalizeConversionAssociationId,
  normalizeMaterializationRequestId,
  type AffiliateFinancialMaterializationRequestV1,
  type AffiliateFinancialMaterializationResultV1,
} from "@touristic/affiliates";
import { describe, expect, it, vi } from "vitest";
import { DurableFinancialMaterializationAdapter } from "./affiliate-adapters.js";
import type {
  AffiliateMaterializationRequestRecord,
  MySqlAffiliateMaterializationRepository,
} from "./mysql-affiliate-persistence.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function required<T>(value: T | null): T {
  if (value === null) throw new Error("TEST_VALUE_REQUIRED");
  return value;
}

function request(
  overrides: Partial<AffiliateFinancialMaterializationRequestV1> = {},
): AffiliateFinancialMaterializationRequestV1 {
  return {
    requestId: required(normalizeMaterializationRequestId("amreq_12345678")),
    entitlementId: required(
      normalizeCommissionEntitlementId("aent_12345678"),
    ),
    entitlementRevision: 2,
    affiliateId: required(normalizeAffiliateId("aff_12345678")),
    conversionAssociationId: required(
      normalizeConversionAssociationId("aconv_12345678"),
    ),
    policyVersion: "AFFILIATE-POLICY-V1",
    entitlementDigest: SHA_A,
    correlationId: "corr_12345678",
    ...overrides,
  };
}

function memoryRepository() {
  const records = new Map<string, AffiliateMaterializationRequestRecord>();

  const repository = {
    readMaterialization: vi.fn(async (requestId: string) => {
      return records.get(requestId) ?? null;
    }),
    createPending: vi.fn(async (record: AffiliateMaterializationRequestRecord) => {
      const entitlementCollision = Array.from(records.values()).find(
        (candidate) =>
          candidate.entitlementId === record.entitlementId &&
          candidate.entitlementRevision === record.entitlementRevision,
      );
      if (!records.has(record.requestId) && !entitlementCollision) {
        records.set(record.requestId, record);
      }
      return record;
    }),
    recordResult: vi.fn(
      async (input: {
        requestId: string;
        accepted: boolean;
        financialReference?: string;
        code?: string;
        retryable?: boolean;
        occurredAt: string;
      }) => {
        const current = records.get(input.requestId);
        if (!current || current.state !== "pending") return;
        records.set(input.requestId, {
          ...current,
          state: input.accepted ? "accepted" : "rejected",
          financialReference: input.financialReference ?? null,
          rejectionCode: input.code ?? null,
          retryable: input.retryable ?? false,
          attempts: current.attempts + 1,
          updatedAt: input.occurredAt,
        });
      },
    ),
    listRetryable: vi.fn(async () => []),
    claimRetry: vi.fn(async () => false),
  };

  return {
    records,
    repository: repository as unknown as MySqlAffiliateMaterializationRepository,
  };
}

function financialDouble(
  result: AffiliateFinancialMaterializationResultV1 = {
    accepted: true,
    financialReference: "fin_affiliate_12345678",
    replayed: false,
  },
) {
  return {
    requestMaterialization: vi.fn(async () => result),
    readMaterialization: vi.fn(async () => null),
  };
}

function clock() {
  let tick = 0;
  return {
    now: () => `2026-08-30T18:00:0${Math.min(tick++, 9)}.000Z`,
  };
}

describe("Durable Affiliate -> Financial materialization acceptance", () => {
  it("converges exact replay through durable readback without a second Financial mutation", async () => {
    const memory = memoryRepository();
    const financial = financialDouble();
    const firstAdapter = new DurableFinancialMaterializationAdapter(
      memory.repository,
      financial,
      clock(),
    );

    const first = await firstAdapter.requestMaterialization(request());
    const afterRestart = new DurableFinancialMaterializationAdapter(
      memory.repository,
      financial,
      clock(),
    );
    const replay = await afterRestart.requestMaterialization(request());

    expect(first).toEqual({
      accepted: true,
      financialReference: "fin_affiliate_12345678",
      replayed: false,
    });
    expect(replay).toEqual({
      accepted: true,
      financialReference: "fin_affiliate_12345678",
      replayed: true,
    });
    expect(financial.requestMaterialization).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a divergent requestId replay before contacting Financial", async () => {
    const memory = memoryRepository();
    const financial = financialDouble();
    const adapter = new DurableFinancialMaterializationAdapter(
      memory.repository,
      financial,
      clock(),
    );

    await adapter.requestMaterialization(request());

    await expect(
      adapter.requestMaterialization(
        request({ entitlementDigest: SHA_B }),
      ),
    ).rejects.toThrow("AFFILIATE_MATERIALIZATION_CONFLICT");
    expect(financial.requestMaterialization).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a different requestId collides with the same entitlement revision", async () => {
    const memory = memoryRepository();
    const financial = financialDouble();
    const adapter = new DurableFinancialMaterializationAdapter(
      memory.repository,
      financial,
      clock(),
    );

    await adapter.requestMaterialization(request());

    await expect(
      adapter.requestMaterialization(
        request({
          requestId: required(
            normalizeMaterializationRequestId("amreq_22345678"),
          ),
        }),
      ),
    ).rejects.toThrow("AFFILIATE_MATERIALIZATION_CONFLICT");
    expect(financial.requestMaterialization).toHaveBeenCalledTimes(1);
  });

  it("preserves pending state across a transient failure and safely retries", async () => {
    const memory = memoryRepository();
    const accepted: AffiliateFinancialMaterializationResultV1 = {
      accepted: true,
      financialReference: "fin_affiliate_12345678",
      replayed: false,
    };
    const financial = {
      requestMaterialization: vi
        .fn()
        .mockRejectedValueOnce(new Error("FINANCIAL_TRANSIENT_FAILURE"))
        .mockResolvedValueOnce(accepted),
      readMaterialization: vi.fn(async () => null),
    };
    const adapter = new DurableFinancialMaterializationAdapter(
      memory.repository,
      financial,
      clock(),
    );

    await expect(adapter.requestMaterialization(request())).rejects.toThrow(
      "FINANCIAL_TRANSIENT_FAILURE",
    );
    expect(memory.records.get(request().requestId)?.state).toBe("pending");

    const result = await new DurableFinancialMaterializationAdapter(
      memory.repository,
      financial,
      clock(),
    ).requestMaterialization(request());

    expect(result).toEqual(accepted);
    expect(financial.requestMaterialization).toHaveBeenCalledTimes(2);
    expect(memory.records.get(request().requestId)?.state).toBe("accepted");
  });

  it("uses authoritative Financial readback before retrying an uncertain delivery", async () => {
    const memory = memoryRepository();
    const pending = request();
    memory.records.set(pending.requestId, {
      requestId: pending.requestId,
      entitlementId: pending.entitlementId,
      entitlementRevision: pending.entitlementRevision,
      affiliateId: pending.affiliateId,
      conversionId: pending.conversionAssociationId,
      policyVersion: pending.policyVersion,
      entitlementDigest: pending.entitlementDigest,
      correlationId: pending.correlationId,
      state: "pending",
      financialReference: null,
      rejectionCode: null,
      retryable: false,
      attempts: 0,
      createdAt: "2026-08-30T18:00:00.000Z",
      updatedAt: "2026-08-30T18:00:00.000Z",
    });
    const financial = financialDouble();
    financial.readMaterialization.mockResolvedValueOnce({
      accepted: true,
      financialReference: "fin_readback_12345678",
      replayed: true,
    });
    const adapter = new DurableFinancialMaterializationAdapter(
      memory.repository,
      financial,
      clock(),
    );

    const result = await adapter.requestMaterialization(pending);

    expect(result).toEqual({
      accepted: true,
      financialReference: "fin_readback_12345678",
      replayed: true,
    });
    expect(financial.requestMaterialization).not.toHaveBeenCalled();
    expect(memory.records.get(pending.requestId)?.financialReference).toBe(
      "fin_readback_12345678",
    );
  });

  it("detects divergent concurrent Financial outcomes instead of returning a conflicting result", async () => {
    const memory = memoryRepository();
    const financial = financialDouble({
      accepted: true,
      financialReference: "fin_second_12345678",
      replayed: true,
    });
    memory.records.set(request().requestId, {
      requestId: request().requestId,
      entitlementId: request().entitlementId,
      entitlementRevision: request().entitlementRevision,
      affiliateId: request().affiliateId,
      conversionId: request().conversionAssociationId,
      policyVersion: request().policyVersion,
      entitlementDigest: request().entitlementDigest,
      correlationId: request().correlationId,
      state: "pending",
      financialReference: null,
      rejectionCode: null,
      retryable: false,
      attempts: 0,
      createdAt: "2026-08-30T18:00:00.000Z",
      updatedAt: "2026-08-30T18:00:00.000Z",
    });
    financial.readMaterialization.mockImplementationOnce(async () => {
      memory.records.set(request().requestId, {
        ...memory.records.get(request().requestId)!,
        state: "accepted",
        financialReference: "fin_first_12345678",
        attempts: 1,
      });
      return {
        accepted: true as const,
        financialReference: "fin_second_12345678",
        replayed: true,
      };
    });
    const adapter = new DurableFinancialMaterializationAdapter(
      memory.repository,
      financial,
      clock(),
    );

    await expect(adapter.requestMaterialization(request())).rejects.toThrow(
      "AFFILIATE_MATERIALIZATION_RESULT_CONFLICT",
    );
  });
});
