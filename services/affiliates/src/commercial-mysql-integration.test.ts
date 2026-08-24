import { createHash } from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  AffiliateEligibilitySnapshot,
  AffiliateFinancialEvidencePort,
  AffiliateOrderingEvidencePort,
} from "@touristic/affiliates";
import {
  AffiliateCommercialApplicationService,
  type AffiliateFinancialAdjustmentEvidenceV1,
} from "./affiliate-commercial-application-service.js";
import { applyAffiliatesIdentityEligibilityM155 } from "./affiliate-identity-schema.js";
import { applyAffiliatesM154Schema } from "./mysql-affiliate-persistence.js";

const databaseUrl = process.env.AFFILIATES_DATABASE_URL ?? "";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

interface CountRow extends RowDataPacket {
  count: number | string;
}

interface IdempotencyOutcomeRow extends RowDataPacket {
  outcome_json: unknown;
}

const activeEligibility: AffiliateEligibilitySnapshot = {
  identityVerified: true,
  contactVerified: true,
  acceptedTermsVersion: "terms-v1",
  membershipStatus: "approved",
  fraudBlocked: false,
  financialOnboardingStatus: "eligible",
};

function parseOutcome(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

describe.skipIf(!databaseUrl)("Affiliates commercial MySQL acceptance", () => {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 12,
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
    await applyAffiliatesIdentityEligibilityM155(pool);
  });

  beforeEach(async () => {
    orderingEvidence.clear();
    financialEvidence.clear();
    adjustmentEvidence.clear();
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
    await pool.query("DELETE FROM affiliate_programs");
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedAttribution(
    suffix: string,
    orderId: string,
    revenue = 1_000,
    includeOrdering = true,
  ): Promise<{
    attributionId: string;
    affiliateId: string;
    programId: string;
    conversionId: string;
    entitlementId: string;
  }> {
    const affiliateId = `aff_com_${suffix}`;
    const programId = `prog_com_${suffix}`;
    const evidenceId = `afev_com_${suffix}`;
    const attributionId = `attr_com_${suffix}`;
    const subjectId = `asub_com_${suffix}`;
    const fingerprint = createHash("sha256")
      .update(`commercial:${suffix}`)
      .digest("hex");

    await pool.execute(
      `INSERT INTO affiliate_programs
       (program_id, destination_id, status, terms_version, created_at, updated_at)
       VALUES (?, 'morro', 'active', 'terms-v1', ?, ?)`,
      [
        programId,
        new Date("2026-08-17T09:00:00.000Z"),
        new Date("2026-08-17T09:00:00.000Z"),
      ],
    );
    await pool.execute(
      `INSERT INTO affiliate_accounts
       (affiliate_id, identity_reference, pseudonymous_reference, status,
        identity_verified, contact_verified, fraud_blocked, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 1, 1, 0, ?, ?)`,
      [
        affiliateId,
        `identity:${suffix}`,
        `pseudo:${suffix}`,
        new Date("2026-08-17T09:00:00.000Z"),
        new Date("2026-08-17T09:00:00.000Z"),
      ],
    );
    await pool.execute(
      `INSERT INTO affiliate_memberships
       (membership_id, affiliate_id, program_id, status, accepted_terms_version,
        financial_onboarding_status, joined_at, ended_at, updated_at)
       VALUES (?, ?, ?, 'approved', 'terms-v1', 'eligible', ?, NULL, ?)`,
      [
        `membership:${suffix}`,
        affiliateId,
        programId,
        new Date("2026-08-17T09:00:00.000Z"),
        new Date("2026-08-17T09:00:00.000Z"),
      ],
    );
    await pool.execute(
      `INSERT INTO affiliate_referral_evidence
       (evidence_id, affiliate_id, program_id, subject_id, source, evidence_fingerprint,
        server_observed_at, received_at, policy_version, created_at)
       VALUES (?, ?, ?, ?, 'checkout_code', UNHEX(?), ?, ?, 'AFFILIATE-POLICY-V1', ?)`,
      [
        evidenceId,
        affiliateId,
        programId,
        subjectId,
        fingerprint,
        new Date("2026-08-17T10:00:00.000Z"),
        new Date("2026-08-17T10:00:00.000Z"),
        new Date("2026-08-17T10:00:00.000Z"),
      ],
    );
    await pool.execute(
      `INSERT INTO affiliate_attributions
       (attribution_id, affiliate_id, program_id, subject_id, evidence_id, evidence_fingerprint,
        source, established_at, expires_at, policy_version, order_id, order_locked_at, created_at)
       VALUES (?, ?, ?, ?, ?, UNHEX(?), 'checkout_code', ?, ?, 'AFFILIATE-POLICY-V1', ?, ?, ?)`,
      [
        attributionId,
        affiliateId,
        programId,
        subjectId,
        evidenceId,
        fingerprint,
        new Date("2026-08-17T10:00:00.000Z"),
        new Date("2026-09-16T10:00:00.000Z"),
        orderId,
        new Date("2026-08-17T10:01:00.000Z"),
        new Date("2026-08-17T10:00:00.000Z"),
      ],
    );

    if (includeOrdering) {
      orderingEvidence.set(orderId, {
        orderId,
        status: "payment_confirmed",
        contractVersion: 1,
      });
    }
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
      affiliateId,
      programId,
      conversionId: `aconv_com_${suffix}`,
      entitlementId: `aent_com_${suffix}`,
    };
  }

  function associateInput(
    ids: Awaited<ReturnType<typeof seedAttribution>>,
    orderId: string,
    overrides: Partial<Parameters<
      AffiliateCommercialApplicationService["associateConversion"]
    >[0]> = {},
  ) {
    return {
      conversionId: ids.conversionId,
      entitlementId: ids.entitlementId,
      attributionId: ids.attributionId,
      orderId,
      actorReference: "svc:commercial:mysql",
      correlationId: `corr:${orderId}`,
      occurredAt: "2026-08-17T12:00:01.000Z",
      ...overrides,
    };
  }

  async function earn(entitlementId: string, operationId: string) {
    return commercialService.transitionEntitlement({
      entitlementId,
      operationId,
      action: "earn",
      actorReference: "svc:commercial:mysql",
      correlationId: `corr:${operationId}`,
      occurredAt: "2026-08-24T12:00:00.000Z",
    });
  }

  it("atomically associates one conversion and entitlement under concurrent exact replay", async () => {
    const orderId = "ord_com_exact_0001";
    const ids = await seedAttribution("exact_0001", orderId);
    const input = associateInput(ids, orderId);

    const [first, second] = await Promise.all([
      commercialService.associateConversion(input),
      commercialService.associateConversion(input),
    ]);
    const replay = await commercialService.associateConversion(input);

    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(replay.replayed).toBe(true);
    expect(first.entitlement.rateBasisPoints).toBe(3000);
    expect(first.entitlement.commissionMinorUnits).toBe(300);

    const [rows] = await pool.execute<CountRow[]>(
      "SELECT COUNT(*) AS count FROM affiliate_conversions WHERE order_id = ?",
      [orderId],
    );
    expect(Number(rows[0]?.count ?? 0)).toBe(1);
  });

  it("reaches OrderingEvidence=null only after a valid locked attribution and fails closed", async () => {
    const orderId = "ord_com_missing_order_0001";
    const ids = await seedAttribution("missing_order_0001", orderId, 1_000, false);

    await expect(
      commercialService.associateConversion(associateInput(ids, orderId)),
    ).rejects.toThrow("AFFILIATE_ORDER_NOT_FOUND");
    const [rows] = await pool.execute<CountRow[]>(
      "SELECT COUNT(*) AS count FROM affiliate_conversions WHERE order_id = ?",
      [orderId],
    );
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  it("retains conversion evidence during suspension and freezes entitlement as disputed", async () => {
    const orderId = "ord_com_suspended_0001";
    const ids = await seedAttribution("suspended_0001", orderId);
    await pool.execute(
      `UPDATE affiliate_memberships SET status = 'suspended', updated_at = ?
       WHERE affiliate_id = ? AND program_id = ?`,
      [new Date("2026-08-17T11:00:00.000Z"), ids.affiliateId, ids.programId],
    );

    const result = await commercialService.associateConversion(
      associateInput(ids, orderId),
    );
    expect(result.conversion.orderId).toBe(orderId);
    expect(result.entitlement.status).toBe("disputed");
    expect(result.entitlement.disputedFrom).toBe("pending");

    await expect(earn(ids.entitlementId, "earn_suspended_0001")).rejects.toThrow(
      "AFFILIATE_ENTITLEMENT_TRANSITION_INVALID",
    );
  });

  it("serializes maturity x partial refund and converges on one earned 150-minor entitlement", async () => {
    const orderId = "ord_com_maturity_refund_0001";
    const ids = await seedAttribution("maturity_refund_0001", orderId);
    await commercialService.associateConversion(associateInput(ids, orderId));
    adjustmentEvidence.set("adj_maturity_refund_0001", {
      contractVersion: 1,
      adjustmentReference: "adj_maturity_refund_0001",
      orderId,
      kind: "refund",
      updatedEligibleRevenueMinorUnits: 500,
      evidenceDigest: SHA_B,
      occurredAt: "2026-08-24T12:00:00.000Z",
    });

    const results = await Promise.all([
      earn(ids.entitlementId, "earn_maturity_refund_0001"),
      commercialService.applyFinancialAdjustment({
        entitlementId: ids.entitlementId,
        adjustmentReference: "adj_maturity_refund_0001",
        actorReference: "svc:commercial:mysql",
        correlationId: "corr:maturity-refund",
      }),
    ]);
    expect(results).toHaveLength(2);

    const durable = await commercialService.readEntitlement(ids.entitlementId);
    expect(durable?.status).toBe("earned");
    expect(durable?.eligibleRevenueMinorUnits).toBe(500);
    expect(durable?.commissionMinorUnits).toBe(150);
    expect(durable?.revision).toBe(3);
  });

  it("serializes partial x full earned refunds without over-reversal", async () => {
    const orderId = "ord_com_refund_race_0001";
    const ids = await seedAttribution("refund_race_0001", orderId);
    await commercialService.associateConversion(associateInput(ids, orderId));
    await earn(ids.entitlementId, "earn_refund_race_0001");

    adjustmentEvidence.set("adj_partial_race_0001", {
      contractVersion: 1,
      adjustmentReference: "adj_partial_race_0001",
      orderId,
      kind: "refund",
      updatedEligibleRevenueMinorUnits: 500,
      evidenceDigest: SHA_B,
      occurredAt: "2026-08-25T12:00:00.000Z",
    });
    adjustmentEvidence.set("adj_full_race_0001", {
      contractVersion: 1,
      adjustmentReference: "adj_full_race_0001",
      orderId,
      kind: "refund",
      updatedEligibleRevenueMinorUnits: 0,
      evidenceDigest: SHA_C,
      occurredAt: "2026-08-25T12:00:01.000Z",
    });

    await Promise.allSettled([
      commercialService.applyFinancialAdjustment({
        entitlementId: ids.entitlementId,
        adjustmentReference: "adj_partial_race_0001",
        actorReference: "svc:commercial:mysql",
        correlationId: "corr:partial-race",
      }),
      commercialService.applyFinancialAdjustment({
        entitlementId: ids.entitlementId,
        adjustmentReference: "adj_full_race_0001",
        actorReference: "svc:commercial:mysql",
        correlationId: "corr:full-race",
      }),
    ]);

    const durable = await commercialService.readEntitlement(ids.entitlementId);
    expect(durable?.status).toBe("reversed");
    expect(durable?.eligibleRevenueMinorUnits).toBe(0);
    expect(durable?.commissionMinorUnits).toBe(0);

    const [rows] = await pool.query<IdempotencyOutcomeRow[]>(
      `SELECT outcome_json FROM affiliate_idempotency_claims
       WHERE idempotency_key LIKE 'affiliate:adjustment:%' AND outcome_json IS NOT NULL`,
    );
    const reversalTotal = rows.reduce((sum, row) => {
      const outcome = parseOutcome(row.outcome_json);
      const reversal = outcome?.reversal;
      if (!reversal || typeof reversal !== "object" || Array.isArray(reversal)) {
        return sum;
      }
      const value = (reversal as Record<string, unknown>).reversalMinorUnits;
      return sum + (typeof value === "number" ? value : 0);
    }, 0);
    expect(reversalTotal).toBe(300);
  });

  it("emits versioned evidence-only reconciliation and preserves immutable policy snapshot", async () => {
    const orderId = "ord_com_reconcile_0001";
    const ids = await seedAttribution("reconcile_0001", orderId);
    await commercialService.associateConversion(associateInput(ids, orderId));
    await earn(ids.entitlementId, "earn_reconcile_0001");
    adjustmentEvidence.set("adj_reconcile_0001", {
      contractVersion: 1,
      adjustmentReference: "adj_reconcile_0001",
      orderId,
      kind: "refund",
      updatedEligibleRevenueMinorUnits: 500,
      evidenceDigest: SHA_B,
      occurredAt: "2026-08-25T12:00:00.000Z",
    });

    const result = await commercialService.applyFinancialAdjustment({
      entitlementId: ids.entitlementId,
      adjustmentReference: "adj_reconcile_0001",
      actorReference: "svc:commercial:mysql",
      correlationId: "corr:reconcile",
    });
    expect(result.kind).toBe("earned_reversal_required");
    expect(result.entitlement.rateBasisPoints).toBe(3000);
    expect(result.entitlement.policyVersion).toBe("AFFILIATE-POLICY-V1");

    const [events] = await pool.query<RowDataPacket[]>(
      `SELECT payload_json FROM affiliate_outbox_events
       WHERE event_type = 'AffiliateFinancialReconciliationRequired'
       AND payload_json->>'$.financialAdjustmentReference' = ?`,
      ["adj_reconcile_0001"],
    );
    expect(events).toHaveLength(1);
    const payload = parseOutcome(events[0]?.payload_json);
    expect(payload?.contractVersion).toBe(1);
    expect(payload?.financialAdjustmentReference).toBe("adj_reconcile_0001");
    expect(payload).not.toHaveProperty("commissionMinorUnits");
    expect(payload).not.toHaveProperty("eligibleRevenueMinorUnits");
    expect(payload).not.toHaveProperty("rateBasisPoints");
    expect(payload).not.toHaveProperty("currency");
    expect(payload).not.toHaveProperty("ledger");
    expect(payload).not.toHaveProperty("wallet");
    expect(payload).not.toHaveProperty("payout");
  });
});
