import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createFinancialReadProjectionService,
  handleFinancialReadProjectionRequest,
  normalizeFinancialProjectionRefundState,
  normalizeFinancialProjectionSettlementState,
  phase20FinancialAuthority,
  phase20FinancialReadContracts,
  type AffiliatePayoutReadRow,
  type AffiliateStatementReadRow,
  type BusinessFinancialReadRow,
  type ControlCommissionReadRow,
  type ControlRefundReadRow,
  type FinancialReadActor,
  type FinancialReadProjectionRepository,
} from "./financial-read-projections.js";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const businessA = "biz-a";
const businessB = "biz-b";
const affiliateA = "aff-a";
const affiliateB = "aff-b";

const businessRows: readonly BusinessFinancialReadRow[] = Object.freeze([
  Object.freeze({
    id: "pay-biz-a-refunded",
    tenantId: tenantA,
    businessId: businessA,
    paymentId: "pay-biz-a-refunded",
    orderReference: "ord-biz-a-refunded",
    amountMinor: 259900,
    currency: "BRL",
    paymentStatus: "refunded",
    verifiedResultKind: "refunded",
    occurredAt: "2026-09-30T14:00:00.000Z",
  }),
  Object.freeze({
    id: "pay-biz-a-confirmed",
    tenantId: tenantA,
    businessId: businessA,
    paymentId: "pay-biz-a-confirmed",
    orderReference: "ord-biz-a-confirmed",
    amountMinor: 159900,
    currency: "BRL",
    paymentStatus: "confirmed",
    verifiedResultKind: "approved",
    occurredAt: "2026-09-29T12:00:00.000Z",
  }),
]);

const affiliateStatementRows: readonly AffiliateStatementReadRow[] =
  Object.freeze([
    Object.freeze({
      id: "ent-aff-a-accepted",
      affiliateId: affiliateA,
      entitlementId: "ent-aff-a-accepted",
      conversionId: "conv-aff-a-accepted",
      commissionMinor: 4500,
      currency: "BRL",
      entitlementStatus: "earned",
      occurredAt: "2026-09-30T16:00:00.000Z",
      financial: Object.freeze({
        materializationRequestId: "mat-aff-a-accepted",
        state: "provider_accepted",
        settlementId: "stl-aff-a-accepted",
        settledMinor: null,
        currency: "BRL",
      }),
    }),
    Object.freeze({
      id: "ent-aff-a-settled",
      affiliateId: affiliateA,
      entitlementId: "ent-aff-a-settled",
      conversionId: "conv-aff-a-settled",
      commissionMinor: 3000,
      currency: "BRL",
      entitlementStatus: "earned",
      occurredAt: "2026-09-29T11:00:00.000Z",
      financial: Object.freeze({
        materializationRequestId: "mat-aff-a-settled",
        state: "settled",
        settlementId: "stl-aff-a-settled",
        settledMinor: 3000,
        currency: "BRL",
      }),
    }),
  ]);

const affiliatePayoutRows: readonly AffiliatePayoutReadRow[] = Object.freeze([
  Object.freeze({
    id: "stl-aff-a-accepted",
    affiliateId: affiliateA,
    payableId: "payable-aff-a-accepted",
    settlementId: "stl-aff-a-accepted",
    amountMinor: 4500,
    currency: "BRL",
    status: "provider_accepted",
    occurredAt: "2026-09-30T17:00:00.000Z",
    providerTransferReference: "provider-secret-never-projected",
  }),
  Object.freeze({
    id: "stl-aff-a-settled",
    affiliateId: affiliateA,
    payableId: "payable-aff-a-settled",
    settlementId: "stl-aff-a-settled",
    amountMinor: 3000,
    currency: "BRL",
    status: "settled",
    occurredAt: "2026-09-29T15:00:00.000Z",
    providerTransferReference: "provider-secret-never-projected",
  }),
]);

const refundRows: readonly ControlRefundReadRow[] = Object.freeze([
  Object.freeze({
    id: "refund-a-verified",
    tenantId: tenantA,
    refundRequestId: "refund-a-verified",
    paymentId: "pay-biz-a-refunded",
    amountMinor: 259900,
    currency: "BRL",
    requestStatus: "provider_accepted",
    verifiedPaymentStatus: "refunded",
    occurredAt: "2026-09-30T14:30:00.000Z",
    providerRefundReference: "provider-secret-never-projected",
  }),
  Object.freeze({
    id: "refund-a-accepted",
    tenantId: tenantA,
    refundRequestId: "refund-a-accepted",
    paymentId: "pay-biz-a-confirmed",
    amountMinor: 5000,
    currency: "BRL",
    requestStatus: "provider_accepted",
    verifiedPaymentStatus: "confirmed",
    occurredAt: "2026-09-30T13:30:00.000Z",
    providerRefundReference: "provider-secret-never-projected",
  }),
]);

const commissionRows: readonly ControlCommissionReadRow[] = Object.freeze([
  Object.freeze({
    id: "ent-aff-a-accepted",
    tenantId: tenantA,
    affiliateId: affiliateA,
    businessId: businessA,
    entitlementId: "ent-aff-a-accepted",
    commissionMinor: 4500,
    currency: "BRL",
    entitlementStatus: "earned",
    financialState: "provider_accepted",
    occurredAt: "2026-09-30T16:00:00.000Z",
  }),
  Object.freeze({
    id: "ent-aff-a-settled",
    tenantId: tenantA,
    affiliateId: affiliateA,
    businessId: businessA,
    entitlementId: "ent-aff-a-settled",
    commissionMinor: 3000,
    currency: "BRL",
    entitlementStatus: "earned",
    financialState: "settled",
    occurredAt: "2026-09-29T11:00:00.000Z",
  }),
]);

function activeActor(
  overrides: Partial<FinancialReadActor> = {},
): FinancialReadActor {
  return Object.freeze({
    subject: "user:test",
    authState: "active",
    capabilities: Object.freeze(["financial.read"]),
    tenantIds: Object.freeze([tenantA]),
    businessIds: Object.freeze([businessA]),
    affiliateIds: Object.freeze([]),
    platformScope: false,
    ...overrides,
  });
}

function makeHarness() {
  const calls = {
    business: 0,
    affiliateStatement: 0,
    affiliatePayout: 0,
    refunds: 0,
    commissions: 0,
  };
  const repository: FinancialReadProjectionRepository = {
    async listBusinessPayments(input) {
      calls.business += 1;
      return businessRows.filter(
        (row) =>
          row.tenantId === input.tenantId &&
          row.businessId === input.businessId,
      );
    },
    async listAffiliateStatementRows(affiliateId) {
      calls.affiliateStatement += 1;
      return affiliateStatementRows.filter(
        (row) => row.affiliateId === affiliateId,
      );
    },
    async listAffiliatePayoutRows(affiliateId) {
      calls.affiliatePayout += 1;
      return affiliatePayoutRows.filter(
        (row) => row.affiliateId === affiliateId,
      );
    },
    async listRefundRows(tenantId) {
      calls.refunds += 1;
      return refundRows.filter((row) => row.tenantId === tenantId);
    },
    async listCommissionRows(tenantId) {
      calls.commissions += 1;
      return commissionRows.filter((row) => row.tenantId === tenantId);
    },
  };
  return {
    calls,
    repository,
    service: createFinancialReadProjectionService(repository),
  };
}

async function expectDenied(
  run: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({ status, code });
}

describe("Phase20 Financial authority boundary", () => {
  it("preserves all five Phase16 classifications and keeps approvals closed", () => {
    expect(Object.keys(phase20FinancialReadContracts)).toEqual([
      "IF-BIZ-012",
      "IF-AFF-011",
      "IF-AFF-012",
      "IF-CTL-014",
      "IF-CTL-015",
    ]);
    expect(
      Object.values(phase20FinancialReadContracts).every(
        (contract) =>
          contract.ownerApproved === false &&
          contract.versionedContractApproved === false,
      ),
    ).toBe(true);
    expect(phase20FinancialReadContracts["IF-BIZ-012"].classification).toBe(
      "EXISTING_FINANCIAL_MODEL_NEEDS_ADAPTER",
    );
    expect(phase20FinancialReadContracts["IF-CTL-014"].classification).toBe(
      "EXISTING_FINANCIAL_MODEL_NEEDS_ADAPTER",
    );
    for (const id of ["IF-AFF-011", "IF-AFF-012", "IF-CTL-015"] as const) {
      expect(phase20FinancialReadContracts[id].classification).toBe(
        "VERSIONED_FINANCIAL_PROJECTION_REQUIRED",
      );
    }
  });

  it("keeps Financial as the sole monetary truth owner", () => {
    expect(phase20FinancialAuthority).toMatchObject({
      paymentTruthOwner: "Financial",
      ledgerOwner: "Financial",
      payableOwner: "Financial",
      settlementOwner: "Financial",
      payoutOwner: "Financial",
      refundFinalStateOwner: "Financial",
      reconciliationOwner: "Financial",
      moneyMovementOwner: "Financial",
      verifiedMonetaryOutcomeOwner: "Financial",
      affiliateCommissionEntitlementOwner: "Affiliate",
      clientMayCalculateAuthoritativeTotals: false,
      projectionMayWriteLedger: false,
      projectionMayCreatePayout: false,
      projectionMayCreateSettlement: false,
      projectionMayMintRefundOutcome: false,
      projectionMayCallProvider: false,
    });
  });

  it("denies anonymous, stale and revoked sessions before repository access", async () => {
    const { calls, service } = makeHarness();
    await expectDenied(
      () => service.readBusinessFinancial(null, tenantA, businessA),
      401,
      "AUTHENTICATION_REQUIRED",
    );
    await expectDenied(
      () =>
        service.readBusinessFinancial(
          activeActor({ authState: "stale" }),
          tenantA,
          businessA,
        ),
      401,
      "SESSION_STALE",
    );
    await expectDenied(
      () =>
        service.readBusinessFinancial(
          activeActor({ authState: "revoked" }),
          tenantA,
          businessA,
        ),
      401,
      "SESSION_REVOKED",
    );
    expect(calls.business).toBe(0);
  });

  it("denies wrong tenant and wrong business before Financial repository access", async () => {
    const { calls, service } = makeHarness();
    await expectDenied(
      () => service.readBusinessFinancial(activeActor(), tenantB, businessA),
      403,
      "TENANT_SCOPE_DENIED",
    );
    await expectDenied(
      () => service.readBusinessFinancial(activeActor(), tenantA, businessB),
      403,
      "BUSINESS_SCOPE_DENIED",
    );
    expect(calls.business).toBe(0);
  });

  it("denies wrong affiliate and keeps Business capability separate", async () => {
    const { calls, service } = makeHarness();
    const affiliateViewer = activeActor({
      capabilities: Object.freeze(["affiliate.read"]),
      businessIds: Object.freeze([]),
      affiliateIds: Object.freeze([affiliateA]),
    });
    await expectDenied(
      () => service.readAffiliateStatement(affiliateViewer, affiliateB),
      403,
      "AFFILIATE_SCOPE_DENIED",
    );
    await expectDenied(
      () => service.readAffiliateStatement(activeActor(), affiliateA),
      403,
      "CAPABILITY_DENIED",
    );
    expect(calls.affiliateStatement).toBe(0);
  });

  it("requires platform scope and tenant scope for Control Center projections", async () => {
    const { calls, service } = makeHarness();
    await expectDenied(
      () => service.readControlRefunds(activeActor(), tenantA),
      403,
      "PLATFORM_SCOPE_DENIED",
    );
    const platformViewer = activeActor({ platformScope: true });
    await expectDenied(
      () => service.readControlRefunds(platformViewer, tenantB),
      403,
      "TENANT_SCOPE_DENIED",
    );
    expect(calls.refunds).toBe(0);
  });

  it("requires Affiliate plus Financial capability for commission composition", async () => {
    const { calls, service } = makeHarness();
    const financialOnly = activeActor({ platformScope: true });
    await expectDenied(
      () => service.readControlCommissions(financialOnly, tenantA),
      403,
      "CAPABILITY_DENIED",
    );
    const affiliateOnly = activeActor({
      platformScope: true,
      capabilities: Object.freeze(["affiliate.read"]),
    });
    await expectDenied(
      () => service.readControlCommissions(affiliateOnly, tenantA),
      403,
      "CAPABILITY_DENIED",
    );
    expect(calls.commissions).toBe(0);
  });

  it("projects Business money only as integer minor units with explicit currency", async () => {
    const { service } = makeHarness();
    const result = await service.readBusinessFinancial(
      activeActor(),
      tenantA,
      businessA,
    );
    expect(result.contractId).toBe("IF-BIZ-012");
    expect(result.page.items).toHaveLength(2);
    for (const row of result.page.items) {
      expect(Number.isSafeInteger(row.amountMinor)).toBe(true);
      expect(row.currency).toMatch(/^[A-Z]{3}$/u);
      expect(row.authority).toBe("Financial");
    }
    expect(result.mutationAllowed).toBe(false);
    expect(result.authoritativeTotalsCalculatedByClient).toBe(false);
  });

  it("rejects malformed monetary rows instead of normalizing client values", async () => {
    const invalidRepository: FinancialReadProjectionRepository = {
      ...makeHarness().repository,
      async listBusinessPayments() {
        return [
          {
            ...businessRows[0],
            amountMinor: 1.5,
          } as BusinessFinancialReadRow,
        ];
      },
    };
    const service = createFinancialReadProjectionService(invalidRepository);
    await expect(
      service.readBusinessFinancial(activeActor(), tenantA, businessA),
    ).rejects.toThrow("FINANCIAL_PROJECTION_INVALID_MINOR_UNITS");

    const invalidCurrencyRepository: FinancialReadProjectionRepository = {
      ...makeHarness().repository,
      async listBusinessPayments() {
        return [
          {
            ...businessRows[0],
            currency: "brl",
          } as BusinessFinancialReadRow,
        ];
      },
    };
    await expect(
      createFinancialReadProjectionService(
        invalidCurrencyRepository,
      ).readBusinessFinancial(activeActor(), tenantA, businessA),
    ).rejects.toThrow("FINANCIAL_PROJECTION_INVALID_CURRENCY");
  });

  it("does not turn accepted Affiliate materialization into settlement truth", async () => {
    const { service } = makeHarness();
    const actor = activeActor({
      capabilities: Object.freeze(["affiliate.read"]),
      businessIds: Object.freeze([]),
      affiliateIds: Object.freeze([affiliateA]),
    });
    const statement = await service.readAffiliateStatement(actor, affiliateA);
    const accepted = statement.page.items.find(
      (row) => row.id === "ent-aff-a-accepted",
    );
    const settled = statement.page.items.find(
      (row) => row.id === "ent-aff-a-settled",
    );
    expect(accepted?.commercialEntitlement.authority).toBe("Affiliate");
    expect(accepted?.financial.authority).toBe("Financial");
    expect(accepted?.financial.state).toBe("accepted");
    expect(settled?.financial.state).toBe("settled");
  });

  it("redacts provider payout references and distinguishes accepted from settled", async () => {
    const { service } = makeHarness();
    const actor = activeActor({
      capabilities: Object.freeze(["affiliate.read"]),
      businessIds: Object.freeze([]),
      affiliateIds: Object.freeze([affiliateA]),
    });
    const result = await service.readAffiliatePayoutHistory(actor, affiliateA);
    expect(result.page.items[0]?.financialState).toBe("accepted");
    expect(result.page.items[1]?.financialState).toBe("settled");
    expect(JSON.stringify(result)).not.toContain("provider-secret");
    expect(
      result.page.items.every((row) => row.providerReferenceExposed === false),
    ).toBe(true);
  });

  it("mints refund final state only from verified Financial payment outcome", async () => {
    const { service } = makeHarness();
    const actor = activeActor({ platformScope: true });
    const result = await service.readControlRefunds(actor, tenantA);
    const accepted = result.page.items.find(
      (row) => row.id === "refund-a-accepted",
    );
    const refunded = result.page.items.find(
      (row) => row.id === "refund-a-verified",
    );
    expect(accepted?.requestState).toBe("accepted");
    expect(accepted?.financialState).toBe("accepted");
    expect(accepted?.verifiedRefund).toBe(false);
    expect(refunded?.financialState).toBe("refunded");
    expect(refunded?.verifiedRefund).toBe(true);
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("keeps commission entitlement and monetary result under separate owners", async () => {
    const { service } = makeHarness();
    const actor = activeActor({
      platformScope: true,
      capabilities: Object.freeze(["affiliate.read", "financial.read"]),
    });
    const result = await service.readControlCommissions(actor, tenantA);
    const accepted = result.page.items.find(
      (row) => row.id === "ent-aff-a-accepted",
    );
    const settled = result.page.items.find(
      (row) => row.id === "ent-aff-a-settled",
    );
    expect(accepted).toMatchObject({
      commercialAuthority: "Affiliate",
      financialAuthority: "Financial",
      financialMaterializationState: "accepted",
      paidOrSettled: false,
    });
    expect(settled?.paidOrSettled).toBe(true);
  });

  it("keeps accepted distinct from terminal monetary states", () => {
    expect(
      normalizeFinancialProjectionRefundState("provider_accepted", "confirmed"),
    ).toBe("accepted");
    expect(
      normalizeFinancialProjectionRefundState("provider_accepted", "refunded"),
    ).toBe("refunded");
    expect(
      normalizeFinancialProjectionSettlementState("provider_accepted"),
    ).toBe("accepted");
    expect(normalizeFinancialProjectionSettlementState("settled")).toBe(
      "settled",
    );
  });

  it("exposes only GET behavior from the candidate HTTP adapter", async () => {
    const { service } = makeHarness();
    const actor = activeActor({ platformScope: true });

    const get = await handleFinancialReadProjectionRequest(
      {
        method: "GET",
        url: `/api/financial-projections/v1/control/tenants/${tenantA}/refunds`,
        actor,
      },
      service,
    );
    expect(get?.status).toBe(200);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const mutation = await handleFinancialReadProjectionRequest(
        {
          method,
          url: `/api/financial-projections/v1/control/tenants/${tenantA}/refunds`,
          actor,
        },
        service,
      );
      expect(mutation).toEqual({
        status: 405,
        body: { error: "FINANCIAL_READ_ONLY" },
      });
    }
  });

  it("returns auth and scope failures through the GET adapter without repository reads", async () => {
    const { calls, service } = makeHarness();
    const anonymous = await handleFinancialReadProjectionRequest(
      {
        method: "GET",
        url: `/api/financial-projections/v1/tenants/${tenantA}/businesses/${businessA}/financial`,
        actor: null,
      },
      service,
    );
    expect(anonymous).toEqual({
      status: 401,
      body: { error: "AUTHENTICATION_REQUIRED" },
    });
    const wrongBusiness = await handleFinancialReadProjectionRequest(
      {
        method: "GET",
        url: `/api/financial-projections/v1/tenants/${tenantA}/businesses/${businessB}/financial`,
        actor: activeActor(),
      },
      service,
    );
    expect(wrongBusiness).toEqual({
      status: 403,
      body: { error: "BUSINESS_SCOPE_DENIED" },
    });
    expect(calls.business).toBe(0);
  });

  it("contains no Financial mutation/provider operation in the projection source", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = await readFile(
      path.join(here, "financial-read-projections.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /\b(?:append|save|requestTransfer|requestRefund|requestSettlement|claimSettlement|finalizeSettlement)\s*\(/u,
    );
    expect(source).not.toMatch(
      /MercadoPago|createSandboxCheckoutProvider|createSandboxRefundProvider/u,
    );
    expect(source).not.toMatch(/\bfetch\s*\(/u);
  });
});
