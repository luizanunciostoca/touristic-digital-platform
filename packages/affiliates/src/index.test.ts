import { describe, expect, it } from "vitest";

import {
  AFFILIATE_POLICY_V1,
  applyRefundConsequence,
  calculateCommissionMinorUnits,
  chooseAttribution,
  createAffiliateIdempotencyKey,
  createAttribution,
  createCommissionEntitlement,
  createConversionAssociation,
  createFinancialMaterializationRequest,
  createReferralEvidence,
  disputeEntitlement,
  isActiveForAttribution,
  isEligibleForFinancialMaterialization,
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
  type ReferralEvidenceSource,
} from "./index.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const affiliateId = required(normalizeAffiliateId("aff_12345678"));
const programId = required(normalizeAffiliateProgramId("apg_12345678"));
const subjectId = required(normalizeAcquisitionSubjectId("asub_12345678"));

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

function attribution(
  suffix: string,
  source: ReferralEvidenceSource,
  observedAt: string,
  fingerprint = SHA_A,
): Attribution {
  const evidence = required(
    createReferralEvidence({
      id: required(normalizeReferralEvidenceId(`afev_${suffix}`)),
      affiliateId,
      programId,
      subjectId,
      source,
      evidenceFingerprint: fingerprint,
      serverObservedAt: observedAt,
      receivedAt: observedAt,
      validatedByServer: true,
    }),
  );
  return required(
    createAttribution(
      required(normalizeAttributionId(`attr_${suffix}`)),
      evidence,
      "2026-08-17T12:00:00Z",
    ),
  );
}

function conversion() {
  return required(
    createConversionAssociation({
      id: required(normalizeConversionAssociationId("aconv_12345678")),
      attribution: attribution(
        "12345678",
        "checkout_code",
        "2026-08-17T10:00:00Z",
      ),
      ordering: {
        orderId: "ord_12345678",
        status: "payment_confirmed",
        contractVersion: 1,
      },
      financial: {
        paymentReference: "pay_12345678",
        paymentConfirmed: true,
        confirmedAt: "2026-08-17T12:00:00Z",
        eligibleRevenueMinorUnits: 102,
        currency: "BRL",
        evidenceDigest: SHA_A,
        contractVersion: 1,
      },
      conversionKind: "initial_purchase",
      serviceOccurredAt: "2026-08-30T18:00:00Z",
      createdAt: "2026-08-17T12:00:01Z",
    }),
  );
}

function pendingEntitlement() {
  return required(
    createCommissionEntitlement({
      id: required(normalizeCommissionEntitlementId("aent_12345678")),
      conversion: conversion(),
      affiliateSuspendedAtConversion: false,
      createdAt: "2026-08-17T12:01:00Z",
    }),
  );
}

describe("AFFILIATE-POLICY-V1", () => {
  it("freezes approved commercial and eligibility boundaries", () => {
    expect(AFFILIATE_POLICY_V1.attributionWindowDays).toBe(30);
    expect(AFFILIATE_POLICY_V1.commission.rateBasisPoints).toBe(3000);
    expect(AFFILIATE_POLICY_V1.commission.capMinorUnits).toBeNull();
    expect(AFFILIATE_POLICY_V1.commission.subscriptionRenewalsEligible).toBe(
      false,
    );
    expect(AFFILIATE_POLICY_V1.retention.rawReferralEvidenceDays).toBe(90);
    expect(Object.isFrozen(AFFILIATE_POLICY_V1)).toBe(true);
    expect(isActiveForAttribution(eligibility())).toBe(true);
    expect(
      isEligibleForFinancialMaterialization(
        eligibility({ financialOnboardingStatus: "pending" }),
      ),
    ).toBe(false);
    expect(
      isActiveForAttribution(eligibility({ membershipStatus: "suspended" })),
    ).toBe(false);
  });
});

describe("attribution", () => {
  it("rejects unvalidated evidence and expires after 30 server-clock days", () => {
    expect(
      createReferralEvidence({
        id: required(normalizeReferralEvidenceId("afev_12345678")),
        affiliateId,
        programId,
        subjectId,
        source: "platform_link",
        evidenceFingerprint: SHA_A,
        serverObservedAt: "2026-08-17T10:00:00Z",
        receivedAt: "2026-08-17T10:00:00Z",
        validatedByServer: false,
      }),
    ).toBeNull();
    expect(
      attribution("12345678", "platform_link", "2026-08-17T10:00:00Z")
        .expiresAt,
    ).toBe("2026-09-16T10:00:00.000Z");
  });

  it("enforces source precedence, recency and order lock", () => {
    const link = attribution(
      "12345678",
      "platform_link",
      "2026-08-17T09:00:00Z",
    );
    const qr = attribution(
      "22345678",
      "platform_qr",
      "2026-08-17T10:00:00Z",
      SHA_B,
    );
    const server = attribution(
      "32345678",
      "server_referral",
      "2026-08-17T08:00:00Z",
      SHA_B,
    );
    const code = attribution(
      "42345678",
      "checkout_code",
      "2026-08-17T07:00:00Z",
      SHA_B,
    );

    expect(
      chooseAttribution(link, qr, "open", "2026-08-17T11:00:00Z"),
    ).toBe(qr);
    expect(
      chooseAttribution(qr, server, "open", "2026-08-17T11:00:00Z"),
    ).toBe(server);
    expect(
      chooseAttribution(server, code, "open", "2026-08-17T11:00:00Z"),
    ).toBe(code);
    expect(
      chooseAttribution(link, code, "locked", "2026-08-17T11:00:00Z"),
    ).toBe(link);
  });
});

describe("conversion and entitlement", () => {
  it("requires canonical payment evidence and excludes renewals", () => {
    expect(conversion().currency).toBe("BRL");
    expect(
      createConversionAssociation({
        id: required(normalizeConversionAssociationId("aconv_22345678")),
        attribution: attribution(
          "12345678",
          "checkout_code",
          "2026-08-17T10:00:00Z",
        ),
        ordering: {
          orderId: "ord_2",
          status: "pending_payment",
          contractVersion: 1,
        },
        financial: {
          paymentReference: "pay_2",
          paymentConfirmed: true,
          confirmedAt: "2026-08-17T12:00:00Z",
          eligibleRevenueMinorUnits: 102,
          currency: "BRL",
          evidenceDigest: SHA_A,
          contractVersion: 1,
        },
        conversionKind: "initial_purchase",
        createdAt: "2026-08-17T12:00:01Z",
      }),
    ).toBeNull();
    expect(
      createConversionAssociation({
        id: required(normalizeConversionAssociationId("aconv_32345678")),
        attribution: attribution(
          "12345678",
          "checkout_code",
          "2026-08-17T10:00:00Z",
        ),
        ordering: {
          orderId: "ord_3",
          status: "payment_confirmed",
          contractVersion: 1,
        },
        financial: {
          paymentReference: "pay_3",
          paymentConfirmed: true,
          confirmedAt: "2026-08-17T12:00:00Z",
          eligibleRevenueMinorUnits: 102,
          currency: "BRL",
          evidenceDigest: SHA_A,
          contractVersion: 1,
        },
        conversionKind: "subscription_renewal",
        createdAt: "2026-08-17T12:00:01Z",
      }),
    ).toBeNull();
  });

  it("uses integer 3000 bps, half-up and service-aware maturity", () => {
    expect(calculateCommissionMinorUnits(100)).toBe(30);
    expect(calculateCommissionMinorUnits(102)).toBe(31);
    expect(calculateCommissionMinorUnits(5)).toBe(2);
    expect(calculateCommissionMinorUnits(10.5)).toBeNull();

    const pending = pendingEntitlement();
    expect(pending.maturityAt).toBe("2026-08-30T18:00:00Z");
    expect(
      markEntitlementEarned(
        pending,
        eligibility(),
        "2026-08-30T17:59:59Z",
      ),
    ).toBeNull();
    expect(
      markEntitlementEarned(
        pending,
        eligibility(),
        "2026-08-30T18:00:00Z",
      )?.status,
    ).toBe("earned");
  });

  it("freezes disputes and preserves refund/reversal evidence", () => {
    const pending = pendingEntitlement();
    const disputed = required(
      disputeEntitlement(pending, "2026-08-20T00:00:00Z"),
    );
    expect(
      resolveEntitlementDispute(
        disputed,
        "restore",
        eligibility({ membershipStatus: "suspended" }),
        "2026-08-21T00:00:00Z",
      ),
    ).toBeNull();
    expect(
      resolveEntitlementDispute(
        disputed,
        "cancel",
        eligibility(),
        "2026-08-21T00:00:00Z",
      )?.status,
    ).toBe("cancelled");

    const partial = required(
      applyRefundConsequence({
        entitlement: pending,
        updatedEligibleRevenueMinorUnits: 52,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-08-20T01:00:00Z",
      }),
    );
    expect(partial.kind).toBe("pending_reprice");
    if (partial.kind === "pending_reprice") {
      expect(partial.entitlement.commissionMinorUnits).toBe(16);
    }

    const earned = required(
      markEntitlementEarned(
        pending,
        eligibility(),
        "2026-08-30T18:00:00Z",
      ),
    );
    const reversal = required(
      applyRefundConsequence({
        entitlement: earned,
        updatedEligibleRevenueMinorUnits: 52,
        refundEvidenceDigest: SHA_B,
        occurredAt: "2026-09-01T01:00:00Z",
      }),
    );
    expect(reversal.kind).toBe("earned_reversal");
    if (reversal.kind === "earned_reversal") {
      expect(reversal.reversalMinorUnits).toBe(15);
      expect(reversal.remainingCommissionMinorUnits).toBe(16);
    }
  });
});

describe("Financial boundary and idempotency", () => {
  it("materializes only earned/eligible rights without monetary instructions", () => {
    const earned = required(
      markEntitlementEarned(
        pendingEntitlement(),
        eligibility(),
        "2026-08-30T18:00:00Z",
      ),
    );
    const request = required(
      createFinancialMaterializationRequest(
        required(normalizeMaterializationRequestId("amreq_12345678")),
        earned,
        SHA_B,
        "corr_12345678",
        eligibility(),
      ),
    );
    expect(request).not.toHaveProperty("commissionMinorUnits");
    expect(request).not.toHaveProperty("rateBasisPoints");
    expect(request).not.toHaveProperty("currency");
    expect(request).not.toHaveProperty("payoutDestination");
    expect(request).not.toHaveProperty("settlementInstruction");
  });

  it("canonicalizes immutable idempotency inputs", async () => {
    const digest = {
      sha256: async (canonicalInput: string) => {
        expect(canonicalInput).toBe('{"a":{"y":4,"z":3},"b":2}');
        return SHA_A;
      },
    };
    const first = await createAffiliateIdempotencyKey(
      "establish_attribution",
      { b: 2, a: { z: 3, y: 4 } },
      digest,
    );
    const second = await createAffiliateIdempotencyKey(
      "establish_attribution",
      { a: { y: 4, z: 3 }, b: 2 },
      digest,
    );
    expect(first).toBe(second);
    expect(first).toBe(`affiliate:v1:establish_attribution:${SHA_A}`);
  });
});
