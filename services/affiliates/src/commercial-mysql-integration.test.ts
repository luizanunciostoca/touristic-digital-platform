import { createHash } from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AffiliateEligibilitySnapshot,
  AffiliateFinancialEvidencePort,
  AffiliateOrderingEvidencePort,
} from "@touristic/affiliates";
import { AffiliateApplicationService } from "./affiliate-application-service.js";
import {
  AffiliateCommercialApplicationService,
  type AffiliateFinancialAdjustmentEvidenceV1,
} from "./affiliate-commercial-application-service.js";
import { applyAffiliatesM154Schema } from "./mysql-affiliate-persistence.js";

const databaseUrl = process.env.AFFILIATES_DATABASE_URL ?? "";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

interface CommercialCountsRow extends RowDataPacket {
  conversion_count: number | string;
  entitlement_count: number | string;
  revision_count: number | string;
  audit_count: number | string;
  outbox_count: number | string;
}

const activeEligibility: AffiliateEligibilitySnapshot = {
  identityVerified: true,
  contactVerified: true,
  acceptedTermsVersion: "affiliate_terms_v1",
  membershipStatus: "approved",
  fraudBlocked: false,
  financialOnboardingStatus: "eligible",
};

describe.skipIf(!databaseUrl)("Affiliates commercial MySQL acceptance", () => {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 8,
    timezone: "Z",
  });
  const orderingEvidence = new Map<
    string,
    Awaited<ReturnType<AffiliateOrderingEvidencePort["getOrderEvidence"]>>
  >();
  const financialEvidence = new Map<
    string,
    Awaited<ReturnType<AffiliateFinancialEvidencePort["getConversionEvidence"]>>
  >();
  const adjustmentEvidence = new Map<
    string,
    AffiliateFinancialAdjustmentEvidenceV1
  >();
  const authorization = {
    authorize: async () => ({
      allowed: true,
      decisionReference: "decision:commercial:mysql",
    }),
  };
  const digest = {
    sha256: async (input: string) =>
      createHash("sha256").update(input).digest("hex"),
  };
  const referralService = new AffiliateApplicationService(
    pool,
    authorization,
    digest,
  );
  const commercialService = new AffiliateCommercialApplicationService(pool, {
    authorization,
    digest,
    ordering: {
      getOrderEvidence: async (orderId) =>
        orderingEvidence.get(orderId) ?? null,
    },
    financial: {
      getConversionEvidence: async (orderId) =>
        financialEvidence.get(orderId) ?? null,
    },
    financialAdjustments: {
      getAdjustmentEvidence: async (reference) =>
        adjustmentEvidence.get(reference) ?? null,
    },
    eligibility: {
      resolveEligibility: async () => activeEligibility,
    },
  });

  beforeAll(async () => {
    await applyAffiliatesM154Schema(pool);
    await pool.query("DELETE FROM affiliate_materialization_requests");
    await pool.query("DELETE FROM affiliate_outbox_events");
    await pool.query("DELETE FROM affiliate_audit_events");
    await pool.query("DELETE FROM affiliate_idempotency_claims");
    await pool.query("DELETE FROM affiliate_entitlement_revisions");
    await pool.query("DELETE FROM affiliate_entitlements");
    await pool.query("DELETE FROM affiliate_conversions");
    await pool.query("DELETE FROM affiliate_attributions");
    await pool.query("DELETE FROM affiliate_referral_evidence");
    await pool.query("DELETE FROM affiliate_memberships");
    await pool.query("DELETE FROM affiliate_accounts");
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seed(
    suffix: string,
    orderId: string,
    revenue = 1_000,
  ): Promise<{
    attributionId: string;
    conversionId: string;
    entitlementId: string;
  }> {
    const attributionId = `att_commercial_${suffix}`;
    const affiliateId = `aff_commercial_${suffix}`;
    const programId = `prog_commercial_${suffix}`;
    const subjectId = `subject_commercial_${suffix}`;
    await referralService.recordReferralAndEstablishAttribution({
      evidenceId: `ref_commercial_${suffix}`,
      attributionId,
      affiliateId,
      programId,
      subjectId,
      source: "checkout_code",
      evidenceFingerprint: createHash("sha256")
        .update(`commercial:${suffix}`)
        .digest("hex"),
      serverObservedAt: "2026-08-17T10:00:00.000Z",
      receivedAt: "2026-08-17T10:00:00.000Z",
      actorReference: "svc:commercial:mysql",
      correlationId: `corr:commercial:${suffix}`,
    });
    await referralService.lockAttributionToOrder(
      subjectId,
      orderId,
      "2026-08-17T10:01:00.000Z",
    );
    orderingEvidence.set(orderId, {
      orderId,
      status: "payment_confirmed",
      contractVersion: 1,
    });
    financialEvidence.set(orderId, {
      paymentReference: `pay_${suffix}`,
      paymentConfirmed: true,
      confirmedAt: "2026-08-17T12:00:00.000Z",
      eligibleRevenueMinorUnits: revenue,
      currency: "BRL",
      evidenceDigest: SHA_A,
      contractVersion: 1,
    });
    return {
      attributionId,
      conversionId: `aconv_commercial_${suffix}`,
      entitlementId: `aent_commercial_${suffix}`,
    };
  }

  it("atomically associates one logical conversion and entitlement under exact/concurrent replay", async () => {
    const orderId = "ord_commercial_exact_0001";
    const ids = await seed("exact_0001", orderId);
    const input = {
      ...ids,
      orderId,
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:exact:0001",
      occurredAt: "2026-08-17T12:00:01.000Z",
    };

    const [first, second] = await Promise.all([
      commercialService.associateConversion(input),
      commercialService.associateConversion(input),
    ]);
    const replay = await commercialService.associateConversion(input);

    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(replay.replayed).toBe(true);
    expect(first.conversion.orderId).toBe(orderId);
    expect(first.entitlement.rateBasisPoints).toBe(3000);
    expect(first.entitlement.commissionMinorUnits).toBe(300);

    const [rows] = await pool.query<CommercialCountsRow[]>(
      `SELECT
       (SELECT COUNT(*) FROM affiliate_conversions WHERE order_id = ?) conversion_count,
       (SELECT COUNT(*) FROM affiliate_entitlements WHERE conversion_id = ?) entitlement_count,
       (SELECT COUNT(*) FROM affiliate_entitlement_revisions WHERE entitlement_id = ?) revision_count,
       (SELECT COUNT(*) FROM affiliate_audit_events WHERE operation = 'affiliate.associate_conversion' AND subject_reference = ?) audit_count,
       (SELECT COUNT(*) FROM affiliate_outbox_events WHERE payload_json->>'$.conversionAssociationId' = ?) outbox_count`,
      [orderId, ids.conversionId, ids.entitlementId, orderId, ids.conversionId],
    );
    const counts = rows[0];
    if (!counts) throw new Error("COMMERCIAL_COUNTS_MISSING");
    expect(Number(counts.conversion_count)).toBe(1);
    expect(Number(counts.entitlement_count)).toBe(1);
    expect(Number(counts.revision_count)).toBe(1);
    expect(Number(counts.audit_count)).toBe(1);
    expect(Number(counts.outbox_count)).toBeGreaterThanOrEqual(1);
  });

  it("rejects nonexistent/noneligible Order evidence and divergent replay", async () => {
    const missingOrder = "ord_commercial_missing_0001";
    await expect(
      commercialService.associateConversion({
        conversionId: "aconv_commercial_missing_0001",
        entitlementId: "aent_commercial_missing_0001",
        attributionId: "att_commercial_missing_0001",
        orderId: missingOrder,
        actorReference: "svc:commercial:mysql",
        correlationId: "corr:commercial:missing:0001",
        occurredAt: "2026-08-17T12:00:01.000Z",
      }),
    ).rejects.toThrow("AFFILIATE_ATTRIBUTION_ORDER_MISMATCH");

    const orderId = "ord_commercial_divergent_0001";
    const ids = await seed("divergent_0001", orderId);
    const input = {
      ...ids,
      orderId,
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:divergent:0001",
      occurredAt: "2026-08-17T12:00:01.000Z",
    };
    await commercialService.associateConversion(input);
    await expect(
      commercialService.associateConversion({
        ...input,
        conversionId: "aconv_commercial_divergent_0002",
      }),
    ).rejects.toThrow("AFFILIATE_IDEMPOTENCY_CONFLICT");

    const pendingOrder = "ord_commercial_pending_0001";
    const pendingIds = await seed("pending_0001", pendingOrder);
    orderingEvidence.set(pendingOrder, {
      orderId: pendingOrder,
      status: "pending_payment",
      contractVersion: 1,
    });
    await expect(
      commercialService.associateConversion({
        ...pendingIds,
        orderId: pendingOrder,
        actorReference: "svc:commercial:mysql",
        correlationId: "corr:commercial:pending:0001",
        occurredAt: "2026-08-17T12:00:01.000Z",
      }),
    ).rejects.toThrow("AFFILIATE_CONVERSION_NOT_ELIGIBLE");
  });

  it("persists lifecycle transitions, exact replay, invalid transition and restart readback", async () => {
    const orderId = "ord_commercial_lifecycle_0001";
    const ids = await seed("lifecycle_0001", orderId);
    await commercialService.associateConversion({
      ...ids,
      orderId,
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:lifecycle:create",
      occurredAt: "2026-08-17T12:00:01.000Z",
    });

    const earned = await commercialService.transitionEntitlement({
      entitlementId: ids.entitlementId,
      operationId: "mature_0001",
      action: "earn",
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:lifecycle:earn",
      occurredAt: "2026-08-24T12:00:00.000Z",
    });
    const replay = await commercialService.transitionEntitlement({
      entitlementId: ids.entitlementId,
      operationId: "mature_0001",
      action: "earn",
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:lifecycle:earn",
      occurredAt: "2026-08-24T12:00:00.000Z",
    });
    expect(earned.entitlement.status).toBe("earned");
    expect(earned.entitlement.revision).toBe(2);
    expect(replay.replayed).toBe(true);

    await expect(
      commercialService.transitionEntitlement({
        entitlementId: ids.entitlementId,
        operationId: "mature_0002",
        action: "earn",
        actorReference: "svc:commercial:mysql",
        correlationId: "corr:commercial:lifecycle:invalid",
        occurredAt: "2026-08-25T12:00:00.000Z",
      }),
    ).rejects.toThrow("AFFILIATE_ENTITLEMENT_TRANSITION_INVALID");

    const afterRestart = new AffiliateCommercialApplicationService(pool, {
      authorization,
      digest,
      ordering: {
        getOrderEvidence: async (candidate) =>
          orderingEvidence.get(candidate) ?? null,
      },
      financial: {
        getConversionEvidence: async (candidate) =>
          financialEvidence.get(candidate) ?? null,
      },
      financialAdjustments: {
        getAdjustmentEvidence: async (reference) =>
          adjustmentEvidence.get(reference) ?? null,
      },
      eligibility: { resolveEligibility: async () => activeEligibility },
    });
    expect(
      (await afterRestart.readEntitlement(ids.entitlementId))?.status,
    ).toBe("earned");
  });

  it("reprices/cancels pending from Financial evidence and never accepts caller monetary input", async () => {
    const orderId = "ord_commercial_refund_pending_0001";
    const ids = await seed("refund_pending_0001", orderId);
    await commercialService.associateConversion({
      ...ids,
      orderId,
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:refund:create",
      occurredAt: "2026-08-17T12:00:01.000Z",
    });

    adjustmentEvidence.set("adj_partial_pending_0001", {
      contractVersion: 1,
      adjustmentReference: "adj_partial_pending_0001",
      orderId,
      kind: "refund",
      updatedEligibleRevenueMinorUnits: 500,
      evidenceDigest: SHA_B,
      occurredAt: "2026-08-18T12:00:00.000Z",
    });
    const partial = await commercialService.applyFinancialAdjustment({
      entitlementId: ids.entitlementId,
      adjustmentReference: "adj_partial_pending_0001",
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:refund:partial",
    });
    expect(partial.kind).toBe("pending_reprice");
    if (partial.kind === "pending_reprice") {
      expect(partial.entitlement.eligibleRevenueMinorUnits).toBe(500);
      expect(partial.entitlement.commissionMinorUnits).toBe(150);
      expect(partial.entitlement.rateBasisPoints).toBe(3000);
    }

    adjustmentEvidence.set("adj_full_pending_0001", {
      contractVersion: 1,
      adjustmentReference: "adj_full_pending_0001",
      orderId,
      kind: "cancellation",
      updatedEligibleRevenueMinorUnits: 0,
      evidenceDigest: SHA_C,
      occurredAt: "2026-08-19T12:00:00.000Z",
    });
    const full = await commercialService.applyFinancialAdjustment({
      entitlementId: ids.entitlementId,
      adjustmentReference: "adj_full_pending_0001",
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:refund:full",
    });
    expect(full.kind).toBe("pending_reprice");
    if (full.kind === "pending_reprice") {
      expect(full.entitlement.status).toBe("cancelled");
      expect(full.entitlement.commissionMinorUnits).toBe(0);
    }
  });

  it("preserves earned history and emits identity-only Financial reconciliation evidence", async () => {
    const orderId = "ord_commercial_refund_earned_0001";
    const ids = await seed("refund_earned_0001", orderId);
    await commercialService.associateConversion({
      ...ids,
      orderId,
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:earned:create",
      occurredAt: "2026-08-17T12:00:01.000Z",
    });
    const earned = await commercialService.transitionEntitlement({
      entitlementId: ids.entitlementId,
      operationId: "earn_refund_0001",
      action: "earn",
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:earned:mature",
      occurredAt: "2026-08-24T12:00:00.000Z",
    });

    adjustmentEvidence.set("adj_partial_earned_0001", {
      contractVersion: 1,
      adjustmentReference: "adj_partial_earned_0001",
      orderId,
      kind: "refund",
      updatedEligibleRevenueMinorUnits: 500,
      evidenceDigest: SHA_B,
      occurredAt: "2026-08-25T12:00:00.000Z",
    });
    const consequence = await commercialService.applyFinancialAdjustment({
      entitlementId: ids.entitlementId,
      adjustmentReference: "adj_partial_earned_0001",
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:commercial:earned:refund",
    });
    expect(consequence.kind).toBe("earned_reversal_required");
    if (consequence.kind === "earned_reversal_required") {
      expect(consequence.reversal.reversalMinorUnits).toBe(150);
      expect(consequence.reversal.remainingCommissionMinorUnits).toBe(150);
    }
    const durable = await commercialService.readEntitlement(ids.entitlementId);
    expect(durable?.status).toBe("earned");
    expect(durable?.commissionMinorUnits).toBe(
      earned.entitlement.commissionMinorUnits,
    );

    const [events] = await pool.query<RowDataPacket[]>(
      `SELECT payload_json FROM affiliate_outbox_events
       WHERE event_type = 'AffiliateFinancialReconciliationRequired'
         AND payload_json->>'$.financialAdjustmentReference' = ?`,
      ["adj_partial_earned_0001"],
    );
    expect(events).toHaveLength(1);
    const payload = events[0]?.payload_json as
      Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty("commissionMinorUnits");
    expect(payload).not.toHaveProperty("eligibleRevenueMinorUnits");
    expect(payload).not.toHaveProperty("rateBasisPoints");
    expect(payload).not.toHaveProperty("currency");
    expect(payload).not.toHaveProperty("ledger");
    expect(payload).not.toHaveProperty("wallet");
    expect(payload).not.toHaveProperty("payout");
  });
});
