import mysql, { type RowDataPacket } from "mysql2/promise";
import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import { applyAffiliatesM154Schema } from "./mysql-affiliate-persistence.js";
import { applyAffiliatesIdentityEligibilityM155 } from "./affiliate-identity-schema.js";
import { AffiliateApplicationService } from "./affiliate-application-service.js";
import { AffiliateIdentityApplicationService } from "./affiliate-identity-application-service.js";

const databaseUrl = process.env.AFFILIATES_DATABASE_URL ?? "";

interface CountsRow extends RowDataPacket {
  evidence_count: number | string;
  attribution_count: number | string;
  audit_count: number | string;
  outbox_count: number | string;
}

const digest = {
  sha256: async (input: string) => {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(input).digest("hex");
  },
};

const allowAllAuthorization = {
  authorize: async () => ({
    allowed: true,
    decisionReference: "decision:test",
  }),
};

const affiliateActor = {
  actorKind: "affiliate" as const,
  actorReference: "affiliate-user",
  correlationId: "corr:identity:create:0001",
};

const adminActor = {
  actorKind: "platform_admin" as const,
  actorReference: "admin-user",
  correlationId: "corr:identity:admin:0001",
};

describe.skipIf(!databaseUrl)(
  "Affiliates identity + eligibility MySQL acceptance",
  () => {
    const pool = mysql.createPool({
      uri: databaseUrl,
      connectionLimit: 6,
      timezone: "Z",
    });

    beforeAll(async () => {
      await applyAffiliatesM154Schema(pool);
      await applyAffiliatesIdentityEligibilityM155(pool);
    });

    beforeEach(async () => {
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

    async function createProgram(
      programId = "prog_m155_mysql_0001",
      destinationId = "morro",
    ): Promise<void> {
      await pool.execute(
        `INSERT INTO affiliate_programs
       (program_id, destination_id, status, terms_version, created_at, updated_at)
       VALUES (?, ?, 'active', 'terms-v1', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [programId, destinationId],
      );
    }

    async function createApprovedAffiliate(): Promise<{
      identity: AffiliateIdentityApplicationService;
      application: AffiliateApplicationService;
    }> {
      await createProgram();
      const identity = new AffiliateIdentityApplicationService(
        pool,
        allowAllAuthorization,
      );
      await identity.createAffiliate({
        actor: affiliateActor,
        affiliateId: "aff_m155_mysql_0001",
        identityReference: "affiliate-user",
        pseudonymousReference: "pseudo-affiliate-user",
        accountType: "person",
        roleCategory: "creator",
        occurredAt: "2026-08-23T22:00:00.000Z",
      });
      await identity.createMembership({
        actor: {
          ...affiliateActor,
          correlationId: "corr:membership:create:0001",
        },
        membershipId: "mem_m155_mysql_0001",
        affiliateId: "aff_m155_mysql_0001",
        programId: "prog_m155_mysql_0001",
        destinationId: "morro",
        acceptedTermsVersion: "terms-v1",
        occurredAt: "2026-08-23T22:01:00.000Z",
      });
      await identity.changeMembershipStatus({
        actor: {
          ...adminActor,
          correlationId: "corr:membership:approve:0001",
        },
        affiliateId: "aff_m155_mysql_0001",
        programId: "prog_m155_mysql_0001",
        destinationId: "morro",
        status: "approved",
        occurredAt: "2026-08-23T22:02:00.000Z",
      });
      await pool.execute(
        `UPDATE affiliate_accounts
       SET identity_verified = 1, contact_verified = 1
       WHERE affiliate_id = ?`,
        ["aff_m155_mysql_0001"],
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

    it("persists identity, allowed profile updates and membership lifecycle across service restart", async () => {
      await createProgram();
      const first = new AffiliateIdentityApplicationService(
        pool,
        allowAllAuthorization,
      );
      const created = await first.createAffiliate({
        actor: affiliateActor,
        affiliateId: "aff_identity_0001",
        identityReference: "affiliate-user",
        pseudonymousReference: "pseudo-identity-0001",
        accountType: "person",
        roleCategory: "creator",
        occurredAt: "2026-08-23T22:10:00.000Z",
      });
      expect(created.roleCategory).toBe("creator");

      const updated = await first.updateAllowedProfileFields({
        actor: {
          ...affiliateActor,
          correlationId: "corr:identity:update:0001",
        },
        affiliateId: "aff_identity_0001",
        roleCategory: "business",
        occurredAt: "2026-08-23T22:11:00.000Z",
      });
      expect(updated.roleCategory).toBe("business");
      expect(updated.identityVerified).toBe(false);

      const membership = await first.createMembership({
        actor: {
          ...affiliateActor,
          correlationId: "corr:membership:create:identity",
        },
        membershipId: "mem_identity_0001",
        affiliateId: "aff_identity_0001",
        programId: "prog_m155_mysql_0001",
        destinationId: "morro",
        acceptedTermsVersion: "terms-v1",
        occurredAt: "2026-08-23T22:12:00.000Z",
      });
      expect(membership.status).toBe("pending");

      await expect(
        first.createMembership({
          actor: {
            ...affiliateActor,
            correlationId: "corr:membership:duplicate:identity",
          },
          membershipId: "mem_identity_duplicate",
          affiliateId: "aff_identity_0001",
          programId: "prog_m155_mysql_0001",
          destinationId: "morro",
          acceptedTermsVersion: "terms-v1",
          occurredAt: "2026-08-23T22:13:00.000Z",
        }),
      ).rejects.toThrow("AFFILIATE_MEMBERSHIP_DUPLICATE");

      await expect(
        first.createMembership({
          actor: {
            ...affiliateActor,
            correlationId: "corr:membership:missing-program",
          },
          membershipId: "mem_missing_program",
          affiliateId: "aff_identity_0001",
          programId: "program_missing",
          destinationId: "morro",
          acceptedTermsVersion: null,
          occurredAt: "2026-08-23T22:14:00.000Z",
        }),
      ).rejects.toThrow("AFFILIATE_PROGRAM_NOT_FOUND");

      const approved = await first.changeMembershipStatus({
        actor: {
          ...adminActor,
          correlationId: "corr:membership:approve:identity",
        },
        affiliateId: "aff_identity_0001",
        programId: "prog_m155_mysql_0001",
        destinationId: "morro",
        status: "approved",
        occurredAt: "2026-08-23T22:15:00.000Z",
      });
      expect(approved.status).toBe("approved");

      await expect(
        first.changeMembershipStatus({
          actor: {
            ...adminActor,
            correlationId: "corr:membership:invalid:identity",
          },
          affiliateId: "aff_identity_0001",
          programId: "prog_m155_mysql_0001",
          destinationId: "morro",
          status: "pending",
          occurredAt: "2026-08-23T22:16:00.000Z",
        }),
      ).rejects.toThrow("AFFILIATE_MEMBERSHIP_TRANSITION_INVALID");

      const restarted = new AffiliateIdentityApplicationService(
        pool,
        allowAllAuthorization,
      );
      const readback = await restarted.readAffiliate({
        actor: affiliateActor,
        affiliateId: "aff_identity_0001",
      });
      const membershipReadback = await restarted.readMembership({
        actor: affiliateActor,
        affiliateId: "aff_identity_0001",
        programId: "prog_m155_mysql_0001",
        destinationId: "morro",
      });
      expect(readback?.roleCategory).toBe("business");
      expect(membershipReadback?.status).toBe("approved");
      expect(
        await restarted.readMembership({
          actor: affiliateActor,
          affiliateId: "aff_identity_0001",
          programId: "prog_m155_mysql_0001",
          destinationId: "other-tenant",
        }),
      ).toBeNull();
      await expect(
        restarted.readAffiliate({
          actor: {
            actorKind: "affiliate",
            actorReference: "different-affiliate",
            correlationId: "corr:affiliate:mismatch:0001",
          },
          affiliateId: "aff_identity_0001",
        }),
      ).rejects.toThrow("AFFILIATE_MISMATCH");

      const [auditRows] = await pool.query<RowDataPacket[]>(
        "SELECT reason FROM affiliate_audit_events ORDER BY occurred_at",
      );
      expect(auditRows.map((row) => String(row.reason))).toEqual(
        expect.arrayContaining([
          "affiliate_created",
          "affiliate_profile_updated",
          "affiliate_membership_created",
          "affiliate_membership_approved",
        ]),
      );
    });

    it("allows eligible referral then blocks referral/attribution after suspension", async () => {
      const { identity, application } = await createApprovedAffiliate();
      const input = {
        evidenceId: "ref_m155_mysql_0001",
        attributionId: "att_m155_mysql_0001",
        affiliateId: "aff_m155_mysql_0001",
        programId: "prog_m155_mysql_0001",
        destinationId: "morro",
        subjectId: "subject_m155_mysql_0001",
        source: "checkout_code" as const,
        evidenceFingerprint:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        serverObservedAt: "2026-08-23T22:20:00.000Z",
        receivedAt: "2026-08-23T22:20:00.000Z",
        actorReference: "svc:test",
        correlationId: "corr:m155:eligible:0001",
      };
      const first =
        await application.recordReferralAndEstablishAttribution(input);
      const replay =
        await application.recordReferralAndEstablishAttribution(input);
      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);

      await identity.changeMembershipStatus({
        actor: {
          ...adminActor,
          correlationId: "corr:membership:suspend:0001",
        },
        affiliateId: "aff_m155_mysql_0001",
        programId: "prog_m155_mysql_0001",
        destinationId: "morro",
        status: "suspended",
        occurredAt: "2026-08-23T22:21:00.000Z",
      });

      await expect(
        application.recordReferralAndEstablishAttribution({
          ...input,
          evidenceId: "ref_m155_mysql_0002",
          attributionId: "att_m155_mysql_0002",
          subjectId: "subject_m155_mysql_0002",
          evidenceFingerprint:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          correlationId: "corr:m155:suspended:0002",
        }),
      ).rejects.toThrow("AFFILIATE_NOT_ELIGIBLE");

      const [rows] = await pool.query<CountsRow[]>(
        `SELECT
        (SELECT COUNT(*) FROM affiliate_referral_evidence) AS evidence_count,
        (SELECT COUNT(*) FROM affiliate_attributions) AS attribution_count,
        (SELECT COUNT(*) FROM affiliate_audit_events WHERE operation = 'affiliate.establish_attribution') AS audit_count,
        (SELECT COUNT(*) FROM affiliate_outbox_events) AS outbox_count`,
      );
      const counts = rows[0];
      if (!counts) throw new Error("AFFILIATE_COUNTS_MISSING");
      expect(Number(counts.evidence_count)).toBe(1);
      expect(Number(counts.attribution_count)).toBe(1);
      expect(Number(counts.audit_count)).toBe(1);
      expect(Number(counts.outbox_count)).toBe(1);
    });

    it("serializes a concurrent suspension ahead of protected referral persistence", async () => {
      const { application } = await createApprovedAffiliate();
      const suspension = await pool.getConnection();
      try {
        await suspension.beginTransaction();
        await suspension.execute(
          `SELECT membership_id FROM affiliate_memberships
         WHERE affiliate_id = ? AND program_id = ? FOR UPDATE`,
          ["aff_m155_mysql_0001", "prog_m155_mysql_0001"],
        );
        await suspension.execute(
          `UPDATE affiliate_memberships
         SET status = 'suspended', updated_at = UTC_TIMESTAMP(3)
         WHERE affiliate_id = ? AND program_id = ?`,
          ["aff_m155_mysql_0001", "prog_m155_mysql_0001"],
        );

        const referral = application.recordReferralAndEstablishAttribution({
          evidenceId: "ref_m155_race_0001",
          attributionId: "att_m155_race_0001",
          affiliateId: "aff_m155_mysql_0001",
          programId: "prog_m155_mysql_0001",
          destinationId: "morro",
          subjectId: "subject_m155_race_0001",
          source: "server_referral",
          evidenceFingerprint:
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          serverObservedAt: "2026-08-23T22:30:00.000Z",
          receivedAt: "2026-08-23T22:30:00.000Z",
          actorReference: "svc:test",
          correlationId: "corr:m155:race:0001",
        });

        await new Promise((resolve) => setTimeout(resolve, 25));
        await suspension.commit();
        await expect(referral).rejects.toThrow("AFFILIATE_NOT_ELIGIBLE");
      } finally {
        suspension.release();
      }

      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS count FROM affiliate_referral_evidence WHERE evidence_id = 'ref_m155_race_0001'",
      );
      expect(Number(rows[0]?.count ?? 0)).toBe(0);
    });
  },
);
