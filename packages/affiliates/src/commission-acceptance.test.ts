import { describe, expect, it } from "vitest";
import {
  AFFILIATE_POLICY_V1,
  applyRefundConsequence,
  calculateCommissionMinorUnits,
  createAttribution,
  createCommissionEntitlement,
  createConversionAssociation,
  createFinancialMaterializationRequest,
  createReferralEvidence,
  disputeEntitlement,
  markEntitlementEarned,
  normalizeAcquisitionSubjectId,
  normalizeAffiliateId,
  normalizeAffiliateProgramId,
  normalizeAttributionId,
  normalizeCommissionEntitlementId,
  normalizeConversionAssociationId,
  normalizeMaterializationRequestId,
  normalizeReferralEvidenceId,
  resolveEntitlementDispute,
  type AffiliateEligibilitySnapshot,
  type Attribution,
  type CommissionEntitlement,
} from "./index.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function required<T>(value: T | null): T {
  if (value === null) throw new Error("TEST_VALUE_REQUIRED");
  return value;
}

function eligibility(
  overrides: Partial<AffiliateEligibilitySnapshot> = {},
): AffiliateEligibilitySnapshot {
  return {
    identityVerified: true,
    contactVerified: true,
    acceptedTermsVersion: "affiliate_terms_v1",
    membershipStatus: "approved",
    fraudBlocked: false,
    financialOnboardingStatus: "eligible",
    ...overrides,
  };
}

function canonicalAttribution(): Attribution {
  const affiliateId = required(normalizeAffiliateId("aff_acceptance_0001"));
  const programId = required(
    normalizeAffiliateProgramId("apg_acceptance_0001"),
  );
  const subjectId = required(
    normalizeAcquisitionSubjectId("asub_acceptance_0001"),
  );
  const evidence = required(
    createReferralEvidence({
      id: required(normalizeReferralEvidenceId("afev_acceptance_0001")),
      affiliateId,
      programId,
      subjectId,
      source: "checkout_code",
      evidenceFingerprint: SHA_A,
      serverObservedAt: "2026-08-17T10:00:00.000Z",
      receivedAt: "2026-08-17T10:00:00.000Z",
      validatedByServer: true,
    }),
  );
  return required(
    createAttribution(
      required(normalizeAttributionId("attr_acceptance_0001")),
      evidence,
      "2026-08-17T10:00:00.000Z",
    ),
  );
}

function canonicalConversion(
  eligibleRevenueMinorUnits = 1_000,
  serviceOccurredAt: string | undefined = undefined,
) {
  return required(
    createConversionAssociation({
      id: required(normalizeConversionAssociationId("aconv_acceptance_0001")),
      attribution: canonicalAttribution(),
      ordering: {
        orderId: "ord_acceptance_0001",
        status: "payment_confirmed",
        contractVersion: 1,
      },
      financial: {
        paymentReference: "pay_acceptance_0001",
        paymentConfirmed: true,
        confirmedAt: "2026-08-17T12:00:00.000Z",
        eligibleRevenueMinorUnits,
        currency: "BRL",
        evidenceDigest: SHA_A,
        contractVersion: 1,
      },
      conversionKind: "initial_purchase",
      serviceOccurredAt,
      createdAt: "2026-08-17T12:00:01.000Z",
    }),
  );
}

function pendingEntitlement(
  eligibleRevenueMinorUnits = 1_000,
  serviceOccurredAt: string | undefined = undefined,
): CommissionEntitlement {
  return required(
    createCommissionEntitlement({
      id: required(normalizeCommissionEntitlementId("aent_acceptance_0001")),
      conversion: canonicalConversion(
        eligibleRevenueMinorUnits,
        serviceOccurredAt,
      ),
      affiliateSuspendedAtConversion: false,
      createdAt: "2026-08-17T12:00:02.000Z",
    }),
  );
}

describe("AFFILIATE-POLICY-V1 commission formula acceptance", () => {
  it("calculates deterministic integer minor units with final half-up rounding", () => {
    expect(AFFILIATE_POLICY_V1.commission.rateBasisPoints).toBe(3000);
    expect(calculateCommissionMinorUnits(0)).toBe(0);
    expect(calculateCommissionMinorUnits(1)).toBe(0);
    expect(calculateCommissionMinorUnits(2)).toBe(1);
    expect(calculateCommissionMinorUnits(5)).toBe(2);
    expect(calculateCommissionMinorUnits(100)).toBe(30);
    expect(calculateCommissionMinorUnits(102)).toBe(31);

    const large = Number.MAX_SAFE_INTEGER;
    const expectedLarge = Number(
      (BigInt(large) * 3000n + 5000n) / 10_000n,
    );
    expect(calculateCommissionMinorUnits(large)).toBe(expectedLarge);
    expect(calculateCommissionMinorUnits(large)).toBe(expectedLarge);

    expect(calculateCommissionMinorUnits(-1)).toBeNull();
    expect(calculateCommissionMinorUnits(10.5)).toBeNull();
    expect(calculateCommissionMinorUnits(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });

  it("uses the immutable entitlement snapshot even if a hypothetical future rate differs", () => {
    const pending = pendingEntitlement();
    expect(Object.isFrozen(pending)).toBe(true);
    expect(pending.policyVersion).toBe("AFFILIATE-POLICY-V1");
    expect(pending.rateBasisPoints).toBe(3000);
    expect(pending.commissionMinorUnits).toBe(300);

    expect(calculateCommissionMinorUnits(500, 4000)).toBe(200);
    const repriced = required(
      applyRefundConsequence({
        entitlement: pending,
        updatedEligibleRevenueMinorUnits: 500,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-08-20T12:00:00.000Z",
      }),
    );
    expect(repriced.kind).toBe("pending_reprice");
    if (repriced.kind === "pending_reprice") {
      expect(repriced.entitlement.rateBasisPoints).toBe(3000);
      expect(repriced.entitlement.policyVersion).toBe("AFFILIATE-POLICY-V1");
      expect(repriced.entitlement.commissionMinorUnits).toBe(150);
    }
  });
});

describe("conversion association acceptance", () => {
  it("accepts only canonical confirmed Order plus verified Financial evidence", () => {
    const attribution = canonicalAttribution();
    const base = {
      id: required(normalizeConversionAssociationId("aconv_acceptance_0002")),
      attribution,
      ordering: {
        orderId: "ord_acceptance_0002",
        status: "payment_confirmed" as const,
        contractVersion: 1,
      },
      financial: {
        paymentReference: "pay_acceptance_0002",
        paymentConfirmed: true,
        confirmedAt: "2026-08-17T12:00:00.000Z",
        eligibleRevenueMinorUnits: 1_000,
        currency: "BRL",
        evidenceDigest: SHA_A,
        contractVersion: 1,
      },
      conversionKind: "initial_purchase" as const,
      createdAt: "2026-08-17T12:00:01.000Z",
    };

    const accepted = required(createConversionAssociation(base));
    expect(accepted.attributionId).toBe(attribution.id);
    expect(accepted.affiliateId).toBe(attribution.affiliateId);
    expect(accepted.programId).toBe(attribution.programId);
    expect(accepted.orderId).toBe("ord_acceptance_0002");
    expect(accepted.eligibleRevenueMinorUnits).toBe(1_000);

    expect(
      createConversionAssociation({
        ...base,
        ordering: { ...base.ordering, status: "pending_payment" },
      }),
    ).toBeNull();
    expect(
      createConversionAssociation({
        ...base,
        financial: { ...base.financial, paymentConfirmed: false },
      }),
    ).toBeNull();
    expect(
      createConversionAssociation({
        ...base,
        financial: { ...base.financial, contractVersion: 0 },
      }),
    ).toBeNull();
    expect(
      createConversionAssociation({
        ...base,
        conversionKind: "subscription_renewal",
      }),
    ).toBeNull();
  });
});

describe("commission lifecycle and refund acceptance", () => {
  it("enforces maturity and all approved dispute transition families", () => {
    const pending = pendingEntitlement(
      1_000,
      "2026-08-30T18:00:00.000Z",
    );
    expect(pending.status).toBe("pending");
    expect(pending.maturityAt).toBe("2026-08-30T18:00:00.000Z");
    expect(
      markEntitlementEarned(
        pending,
        eligibility(),
        "2026-08-30T17:59:59.999Z",
      ),
    ).toBeNull();
    expect(
      markEntitlementEarned(
        pending,
        eligibility({ membershipStatus: "suspended" }),
        "2026-08-30T18:00:00.000Z",
      ),
    ).toBeNull();

    const earned = required(
      markEntitlementEarned(
        pending,
        eligibility(),
        "2026-08-30T18:00:00.000Z",
      ),
    );
    expect(earned.status).toBe("earned");
    expect(
      markEntitlementEarned(
        earned,
        eligibility(),
        "2026-08-31T18:00:00.000Z",
      ),
    ).toBeNull();

    const pendingDispute = required(
      disputeEntitlement(pending, "2026-08-20T00:00:00.000Z"),
    );
    expect(pendingDispute.disputedFrom).toBe("pending");
    expect(
      resolveEntitlementDispute(
        pendingDispute,
        "restore",
        eligibility(),
        "2026-08-21T00:00:00.000Z",
      )?.status,
    ).toBe("pending");
    expect(
      resolveEntitlementDispute(
        pendingDispute,
        "cancel",
        eligibility(),
        "2026-08-21T00:00:00.000Z",
      )?.status,
    ).toBe("cancelled");
    expect(
      resolveEntitlementDispute(
        pendingDispute,
        "reverse",
        eligibility(),
        "2026-08-21T00:00:00.000Z",
      ),
    ).toBeNull();

    const earnedDispute = required(
      disputeEntitlement(earned, "2026-09-01T00:00:00.000Z"),
    );
    expect(earnedDispute.disputedFrom).toBe("earned");
    expect(
      resolveEntitlementDispute(
        earnedDispute,
        "restore",
        eligibility(),
        "2026-09-02T00:00:00.000Z",
      )?.status,
    ).toBe("earned");
    expect(
      resolveEntitlementDispute(
        earnedDispute,
        "reverse",
        eligibility(),
        "2026-09-02T00:00:00.000Z",
      )?.status,
    ).toBe("reversed");
    expect(
      resolveEntitlementDispute(
        earnedDispute,
        "cancel",
        eligibility(),
        "2026-09-02T00:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("reprices/cancels before earned and emits explicit reversal evidence after earned", () => {
    const pending = pendingEntitlement();
    const partialBefore = required(
      applyRefundConsequence({
        entitlement: pending,
        updatedEligibleRevenueMinorUnits: 500,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-08-20T12:00:00.000Z",
      }),
    );
    expect(partialBefore.kind).toBe("pending_reprice");
    if (partialBefore.kind !== "pending_reprice") return;
    expect(partialBefore.entitlement.status).toBe("pending");
    expect(partialBefore.entitlement.eligibleRevenueMinorUnits).toBe(500);
    expect(partialBefore.entitlement.commissionMinorUnits).toBe(150);
    expect(
      applyRefundConsequence({
        entitlement: partialBefore.entitlement,
        updatedEligibleRevenueMinorUnits: 500,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-08-20T12:00:01.000Z",
      }),
    ).toBeNull();
    expect(
      applyRefundConsequence({
        entitlement: partialBefore.entitlement,
        updatedEligibleRevenueMinorUnits: 750,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-08-20T12:00:02.000Z",
      }),
    ).toBeNull();

    const fullBefore = required(
      applyRefundConsequence({
        entitlement: pending,
        updatedEligibleRevenueMinorUnits: 0,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-08-20T13:00:00.000Z",
      }),
    );
    expect(fullBefore.kind).toBe("pending_reprice");
    if (fullBefore.kind === "pending_reprice") {
      expect(fullBefore.entitlement.status).toBe("cancelled");
      expect(fullBefore.entitlement.commissionMinorUnits).toBe(0);
    }

    const earned = required(
      markEntitlementEarned(
        pending,
        eligibility(),
        "2026-08-24T12:00:00.000Z",
      ),
    );
    const partialAfter = required(
      applyRefundConsequence({
        entitlement: earned,
        updatedEligibleRevenueMinorUnits: 500,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-09-01T12:00:00.000Z",
      }),
    );
    expect(partialAfter.kind).toBe("earned_reversal");
    if (partialAfter.kind === "earned_reversal") {
      expect(partialAfter.previousCommissionMinorUnits).toBe(300);
      expect(partialAfter.remainingCommissionMinorUnits).toBe(150);
      expect(partialAfter.reversalMinorUnits).toBe(150);
      expect(partialAfter.full).toBe(false);
      expect(partialAfter.refundEvidenceDigest).toBe(SHA_B);
    }
    expect(earned.status).toBe("earned");
    expect(earned.commissionMinorUnits).toBe(300);

    const fullAfter = required(
      applyRefundConsequence({
        entitlement: earned,
        updatedEligibleRevenueMinorUnits: 0,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-09-01T13:00:00.000Z",
      }),
    );
    expect(fullAfter.kind).toBe("earned_reversal");
    if (fullAfter.kind === "earned_reversal") {
      expect(fullAfter.reversalMinorUnits).toBe(300);
      expect(fullAfter.remainingCommissionMinorUnits).toBe(0);
      expect(fullAfter.full).toBe(true);
    }
  });

  it("keeps Financial materialization identity-only and free of monetary mutation instructions", () => {
    const earned = required(
      markEntitlementEarned(
        pendingEntitlement(),
        eligibility(),
        "2026-08-24T12:00:00.000Z",
      ),
    );
    const materialization = required(
      createFinancialMaterializationRequest(
        required(normalizeMaterializationRequestId("amreq_acceptance_0001")),
        earned,
        SHA_B,
        "corr_acceptance_0001",
        eligibility(),
      ),
    );

    expect(materialization.policyVersion).toBe("AFFILIATE-POLICY-V1");
    expect(materialization.entitlementRevision).toBe(earned.revision);
    expect(materialization).not.toHaveProperty("commissionMinorUnits");
    expect(materialization).not.toHaveProperty("eligibleRevenueMinorUnits");
    expect(materialization).not.toHaveProperty("rateBasisPoints");
    expect(materialization).not.toHaveProperty("currency");
    expect(materialization).not.toHaveProperty("ledger");
    expect(materialization).not.toHaveProperty("wallet");
    expect(materialization).not.toHaveProperty("payout");
    expect(materialization).not.toHaveProperty("settlement");
  });
});
