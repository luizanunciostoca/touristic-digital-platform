import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createCommissionEntitlement,
  createConversionAssociation,
  createFinancialMaterializationRequest,
  normalizeCommissionEntitlementId,
  normalizeConversionAssociationId,
  normalizeMaterializationRequestId,
  type AffiliateEligibilityPort,
  type AffiliateEligibilitySnapshot,
} from "@touristic/affiliates";
import { AffiliateApplicationService } from "./affiliate-application-service.js";
import { AffiliateIdentityApplicationService } from "./affiliate-identity-application-service.js";
import { applyAffiliatesIdentityEligibilityM155 } from "./affiliate-identity-schema.js";
import { AffiliateProtectedMutationService } from "./affiliate-protected-mutation-service.js";
import {
  applyAffiliatesM154Schema,
  MySqlAffiliateConversionRepository,
  MySqlAffiliateEntitlementRepository,
} from "./mysql-affiliate-persistence.js";

const databaseUrl = process.env.AFFILIATES_DATABASE_URL ?? "";

const digest = {
  sha256: async (input: string) => {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(input).digest("hex");
  },
};

const allowAllAuthorization = {
  authorize: async () => ({
    allowed: true,
    decisionReference: "decision:suspension-acceptance",
  }),
};

const affiliateActor = {
  actorKind: "affiliate" as const,
  actorReference: "affiliate-suspension-user",
  correlationId: "corr:suspension:identity:0001",
};

const adminActor = {
  actorKind: "platform_admin" as const,
  actorReference: "admin-suspension-user",
  correlationId: "corr:suspension:admin:0001",
};

interface EligibilityRow extends RowDataPacket {
  identity_verified: number;
  contact_verified: number;
  accepted_terms_version: string | null;
  membership_status: "pending" | "approved" | "suspended" | "closed";
  fraud_blocked: number;
  financial_onboarding_status:
    "not_started" | "pending" | "eligible" | "blocked";
}

interface CountRow extends RowDataPacket {
  count: number | string;
}

describe.skipIf(!databaseUrl)(
  "Affiliates suspension + replay MySQL acceptance",
  () => {
    const pool = mysql.createPool({
      uri: databaseUrl,
      connectionLimit: 6,
      timezone: "Z",
    });

    const eligibility: AffiliateEligibilityPort = {
      resolveEligibility: async (affiliateId, programId) => {
        const [rows] = await pool.execute<EligibilityRow[]>(
          `SELECT
             a.identity_verified,
             a.contact_verified,
             m.accepted_terms_version,
             m.status AS membership_status,
             a.fraud_blocked,
             m.financial_onboarding_status
           FROM affiliate_accounts a
           JOIN affiliate_memberships m ON m.affiliate_id = a.affiliate_id
           WHERE a.affiliate_id = ? AND m.program_id = ?
           LIMIT 1`,
          [affiliateId, programId],
        );
        const row = rows[0];
        if (!row) return null;
        return {
          identityVerified: row.identity_verified === 1,
          contactVerified: row.contact_verified === 1,
          acceptedTermsVersion: row.accepted_terms_version,
          membershipStatus: row.membership_status,
          fraudBlocked: row.fraud_blocked === 1,
          financialOnboardingStatus: row.financial_onboarding_status,
        } satisfies AffiliateEligibilitySnapshot;
      },
    };

    beforeAll(async () => {
      await applyAffiliatesM154Schema(pool);
      await applyAffiliatesIdentityEligibilityM155(pool);
    });

    beforeEach(async () => {
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

    async function approvedFixture() {
      await pool.execute(
        `INSERT INTO affiliate_programs
         (program_id, destination_id, status, terms_version, created_at, updated_at)
         VALUES ('prog_suspension_0001', 'morro', 'active', 'terms-v1', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      );
      const identity = new AffiliateIdentityApplicationService(
        pool,
        allowAllAuthorization,
      );
      await identity.createAffiliate({
        actor: affiliateActor,
        affiliateId: "aff_suspension_0001",
        identityReference: "affiliate-suspension-user",
        pseudonymousReference: "pseudo-suspension-user",
        accountType: "person",
        roleCategory: "creator",
        occurredAt: "2026-08-23T22:20:00.000Z",
      });
      await identity.createMembership({
        actor: {
          ...affiliateActor,
          correlationId: "corr:suspension:membership:create",
        },
        membershipId: "mem_suspension_0001",
        affiliateId: "aff_suspension_0001",
        programId: "prog_suspension_0001",
        destinationId: "morro",
        acceptedTermsVersion: "terms-v1",
        occurredAt: "2026-08-23T22:21:00.000Z",
      });
      await identity.changeMembershipStatus({
        actor: {
          ...adminActor,
          correlationId: "corr:suspension:membership:approve",
        },
        affiliateId: "aff_suspension_0001",
        programId: "prog_suspension_0001",
        destinationId: "morro",
        status: "approved",
        occurredAt: "2026-08-23T22:22:00.000Z",
      });
      await pool.execute(
        `UPDATE affiliate_accounts
         SET identity_verified = 1, contact_verified = 1
         WHERE affiliate_id = 'aff_suspension_0001'`,
      );
      await pool.execute(
        `UPDATE affiliate_memberships
         SET financial_onboarding_status = 'eligible'
         WHERE affiliate_id = 'aff_suspension_0001'
           AND program_id = 'prog_suspension_0001'`,
      );
      return {
        identity,
        application: new AffiliateApplicationService(
          pool,
          allowAllAuthorization,
          digest,
        ),
      };
    }

    const referralInput = {
      evidenceId: "ref_suspension_0001",
      attributionId: "att_suspension_0001",
      affiliateId: "aff_suspension_0001",
      programId: "prog_suspension_0001",
      destinationId: "morro",
      subjectId: "subject_suspension_0001",
      source: "checkout_code" as const,
      evidenceFingerprint:
        "1111111111111111111111111111111111111111111111111111111111111111",
      serverObservedAt: "2026-08-23T22:23:00.000Z",
      receivedAt: "2026-08-23T22:23:00.000Z",
      actorReference: "svc:suspension-test",
      correlationId: "corr:suspension:referral:0001",
    };

    it("retains conversion evidence, freezes entitlement as disputed and blocks new materialization while suspended", async () => {
      const { identity, application } = await approvedFixture();
      const established =
        await application.recordReferralAndEstablishAttribution(referralInput);
      expect(established.replayed).toBe(false);

      await identity.changeMembershipStatus({
        actor: {
          ...adminActor,
          correlationId: "corr:suspension:membership:suspend",
        },
        affiliateId: "aff_suspension_0001",
        programId: "prog_suspension_0001",
        destinationId: "morro",
        status: "suspended",
        occurredAt: "2026-08-23T22:24:00.000Z",
      });

      const exactReplay =
        await application.recordReferralAndEstablishAttribution(referralInput);
      expect(exactReplay.replayed).toBe(true);
      expect(exactReplay.attribution.id).toBe(established.attribution.id);

      await expect(
        application.recordReferralAndEstablishAttribution({
          ...referralInput,
          evidenceId: "ref_suspension_0002",
          attributionId: "att_suspension_0002",
          subjectId: "subject_suspension_0002",
          evidenceFingerprint:
            "2222222222222222222222222222222222222222222222222222222222222222",
          correlationId: "corr:suspension:referral:new",
        }),
      ).rejects.toThrow("AFFILIATE_NOT_ELIGIBLE");

      const conversionId = normalizeConversionAssociationId(
        "aconv_suspension_0001",
      );
      if (!conversionId) throw new Error("TEST_CONVERSION_ID_INVALID");
      const conversion = createConversionAssociation({
        id: conversionId,
        attribution: established.attribution,
        ordering: {
          orderId: "order-suspension-0001",
          status: "payment_confirmed",
          contractVersion: 1,
        },
        financial: {
          paymentReference: "payment-suspension-0001",
          paymentConfirmed: true,
          confirmedAt: "2026-08-23T22:25:00.000Z",
          eligibleRevenueMinorUnits: 10000,
          currency: "BRL",
          evidenceDigest:
            "3333333333333333333333333333333333333333333333333333333333333333",
          contractVersion: 1,
        },
        conversionKind: "initial_purchase",
        serviceOccurredAt: "2026-08-23T22:26:00.000Z",
        createdAt: "2026-08-23T22:25:00.000Z",
      });
      if (!conversion) throw new Error("TEST_CONVERSION_INVALID");

      const conversionRepository = new MySqlAffiliateConversionRepository(pool);
      const entitlementRepository = new MySqlAffiliateEntitlementRepository(
        pool,
      );
      const protectedMutations = new AffiliateProtectedMutationService(
        allowAllAuthorization,
        eligibility,
        conversionRepository,
        entitlementRepository,
      );

      await expect(
        protectedMutations.persistConversion(conversion, {
          actorKind: "service",
          actorReference: "svc:suspension-test",
          correlationId: "corr:suspension:conversion:retain",
        }),
      ).resolves.toEqual(conversion);
      expect(
        await conversionRepository.findByOrderId("order-suspension-0001"),
      ).toEqual(conversion);

      const entitlementId = normalizeCommissionEntitlementId(
        "aent_suspension_0001",
      );
      if (!entitlementId) throw new Error("TEST_ENTITLEMENT_ID_INVALID");
      const entitlement = createCommissionEntitlement({
        id: entitlementId,
        conversion,
        affiliateSuspendedAtConversion: true,
        createdAt: "2026-08-23T22:27:00.000Z",
      });
      if (!entitlement) throw new Error("TEST_ENTITLEMENT_INVALID");
      expect(entitlement.status).toBe("disputed");
      expect(entitlement.disputedFrom).toBe("pending");

      await expect(
        protectedMutations.persistNewEntitlement(entitlement, {
          actorKind: "service",
          actorReference: "svc:suspension-test",
          correlationId: "corr:suspension:entitlement:disputed",
        }),
      ).resolves.toEqual(entitlement);
      const entitlementReadback = await entitlementRepository.findById(
        entitlement.id,
      );
      expect(entitlementReadback?.status).toBe("disputed");
      expect(entitlementReadback?.disputedFrom).toBe("pending");

      const suspendedSnapshot = await eligibility.resolveEligibility(
        entitlement.affiliateId,
        entitlement.programId,
      );
      if (!suspendedSnapshot) {
        throw new Error("TEST_SUSPENDED_SNAPSHOT_MISSING");
      }
      expect(suspendedSnapshot.membershipStatus).toBe("suspended");

      const requestId = normalizeMaterializationRequestId(
        "amreq_suspension_0001",
      );
      if (!requestId) throw new Error("TEST_MATERIALIZATION_ID_INVALID");
      const historicalEarned = {
        ...entitlement,
        status: "earned" as const,
        disputedFrom: null,
      };
      expect(
        createFinancialMaterializationRequest(
          requestId,
          historicalEarned,
          "4444444444444444444444444444444444444444444444444444444444444444",
          "corr:suspension:materialization:blocked",
          suspendedSnapshot,
        ),
      ).toBeNull();

      const [materializationRows] = await pool.query<CountRow[]>(
        "SELECT COUNT(*) AS count FROM affiliate_materialization_requests",
      );
      expect(Number(materializationRows[0]?.count ?? 0)).toBe(0);
    });

    it("fails closed on divergent replay and destination/program mismatch", async () => {
      const { application } = await approvedFixture();
      const first =
        await application.recordReferralAndEstablishAttribution(referralInput);
      expect(first.replayed).toBe(false);

      await pool.execute(
        `UPDATE affiliate_idempotency_claims
         SET semantic_digest = UNHEX(?)
         WHERE idempotency_key = ?`,
        [
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          first.idempotencyKey,
        ],
      );
      await expect(
        application.recordReferralAndEstablishAttribution(referralInput),
      ).rejects.toThrow("AFFILIATE_IDEMPOTENCY_CONFLICT");

      await expect(
        application.recordReferralAndEstablishAttribution({
          ...referralInput,
          evidenceId: "ref_wrong_destination_0001",
          attributionId: "att_wrong_destination_0001",
          subjectId: "subject_wrong_destination_0001",
          destinationId: "other-tenant",
          evidenceFingerprint:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          correlationId: "corr:suspension:wrong-destination",
        }),
      ).rejects.toThrow("AFFILIATE_NOT_ELIGIBLE");

      const [evidenceRows] = await pool.query<CountRow[]>(
        "SELECT COUNT(*) AS count FROM affiliate_referral_evidence",
      );
      const [attributionRows] = await pool.query<CountRow[]>(
        "SELECT COUNT(*) AS count FROM affiliate_attributions",
      );
      expect(Number(evidenceRows[0]?.count ?? 0)).toBe(1);
      expect(Number(attributionRows[0]?.count ?? 0)).toBe(1);
    });
  },
);
