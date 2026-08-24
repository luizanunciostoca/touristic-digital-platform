import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import type { AffiliateAuthorizationPort } from "@touristic/affiliates";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AffiliatePrivacyService } from "./affiliate-privacy-service.js";
import { applyAffiliatesM154Schema } from "./mysql-affiliate-persistence.js";

const databaseUrl = process.env.AFFILIATES_DATABASE_URL ?? "";
const now = "2026-08-23T12:00:00.000Z";

interface AccountReadRow extends RowDataPacket {
  identity_reference: string;
  pseudonymous_reference: string;
  status: string;
}

interface SubjectReadRow extends RowDataPacket {
  subject_id: string;
}

interface CountReadRow extends RowDataPacket {
  count_value: number | string;
}

interface HoldReadRow extends RowDataPacket {
  active: number;
}

interface CommercialReadRow extends RowDataPacket {
  order_id: string;
  payment_reference: string;
  eligible_revenue_minor: number | string;
  commission_minor: number | string;
}

const authorization: AffiliateAuthorizationPort = {
  authorize: async (_action, context) => ({
    allowed: context.actorReference !== "actor:denied",
    decisionReference:
      context.actorReference === "actor:denied"
        ? "privacy-test-denied"
        : "privacy-test-allowed",
  }),
};

const serviceActor = {
  actorKind: "service" as const,
  actorReference: "svc:privacy-retention",
  correlationId: "corr:privacy:service:0001",
};

const adminActor = {
  actorKind: "platform_admin" as const,
  actorReference: "admin:privacy",
  correlationId: "corr:privacy:admin:0001",
};

function affiliateActor(affiliateId: string) {
  return {
    actorKind: "affiliate" as const,
    actorReference: `actor:${affiliateId}`,
    affiliateId,
    correlationId: `corr:privacy:${affiliateId}:0001`,
  };
}

async function clean(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM affiliate_materialization_requests");
  await pool.query("DELETE FROM affiliate_entitlement_revisions");
  await pool.query("DELETE FROM affiliate_entitlements");
  await pool.query("DELETE FROM affiliate_conversions");
  await pool.query("DELETE FROM affiliate_attributions");
  await pool.query("DELETE FROM affiliate_referral_evidence");
  await pool.query("DELETE FROM affiliate_privacy_requests");
  await pool.query("DELETE FROM affiliate_legal_holds");
  await pool.query("DELETE FROM affiliate_outbox_events");
  await pool.query("DELETE FROM affiliate_audit_events");
  await pool.query("DELETE FROM affiliate_idempotency_claims");
  await pool.query("DELETE FROM affiliate_memberships");
  await pool.query("DELETE FROM affiliate_accounts");
}

async function seedAccount(
  pool: Pool,
  affiliateId: string,
  marker: string,
): Promise<void> {
  await pool.execute(
    `INSERT INTO affiliate_accounts
     (affiliate_id, identity_reference, pseudonymous_reference, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [
      affiliateId,
      `identity:secret:${marker}`,
      `pseudo:secret:${marker}`,
      new Date("2020-01-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    ],
  );
  await pool.execute(
    `INSERT INTO affiliate_memberships
     (membership_id, affiliate_id, program_id, status, joined_at, ended_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, NULL, ?)`,
    [
      `membership:${marker}`,
      affiliateId,
      `program:${marker}`,
      new Date("2020-01-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    ],
  );
}

async function seedReferral(
  pool: Pool,
  input: Readonly<{
    evidenceId: string;
    affiliateId: string;
    marker: string;
    subjectId: string;
    observedAt: string;
  }>,
): Promise<void> {
  await pool.execute(
    `INSERT INTO affiliate_referral_evidence
     (evidence_id, affiliate_id, program_id, subject_id, source, evidence_fingerprint,
      server_observed_at, received_at, policy_version, created_at)
     VALUES (?, ?, ?, ?, 'checkout_code', UNHEX(SHA2(?, 256)), ?, ?, 'AFFILIATE-POLICY-V1', ?)`,
    [
      input.evidenceId,
      input.affiliateId,
      `program:${input.marker}`,
      input.subjectId,
      input.marker.padEnd(64, "a").slice(0, 64),
      new Date(input.observedAt),
      new Date(input.observedAt),
      new Date(input.observedAt),
    ],
  );
}

async function seedAttribution(
  pool: Pool,
  input: Readonly<{
    attributionId: string;
    evidenceId: string;
    affiliateId: string;
    marker: string;
    subjectId: string;
    establishedAt: string;
    orderId?: string;
  }>,
): Promise<void> {
  const fingerprint = input.marker.padEnd(64, "a").slice(0, 64);
  const established = new Date(input.establishedAt);
  const expires = new Date(established.getTime());
  expires.setUTCDate(expires.getUTCDate() + 30);
  await pool.execute(
    `INSERT INTO affiliate_attributions
     (attribution_id, affiliate_id, program_id, subject_id, evidence_id, evidence_fingerprint,
      source, established_at, expires_at, policy_version, order_id, order_locked_at, created_at)
     VALUES (?, ?, ?, ?, ?, UNHEX(SHA2(?, 256)), 'checkout_code', ?, ?, 'AFFILIATE-POLICY-V1', ?, ?, ?)`,
    [
      input.attributionId,
      input.affiliateId,
      `program:${input.marker}`,
      input.subjectId,
      input.evidenceId,
      fingerprint,
      established,
      expires,
      input.orderId ?? null,
      input.orderId ? established : null,
      established,
    ],
  );
}

async function seedCommercialEvidence(
  pool: Pool,
  input: Readonly<{
    affiliateId: string;
    marker: string;
    attributionId: string;
    commercialAt: string;
  }>,
): Promise<void> {
  const conversionId = `conversion:${input.marker}`;
  const entitlementId = `entitlement:${input.marker}`;
  const commercialAt = new Date(input.commercialAt);
  await pool.execute(
    `INSERT INTO affiliate_conversions
     (conversion_id, attribution_id, affiliate_id, program_id, order_id, payment_reference,
      financial_evidence_digest, eligible_revenue_minor, currency, payment_confirmed_at,
      service_occurred_at, conversion_kind, policy_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, UNHEX(SHA2(?, 256)), 10000, 'BRL', ?, ?, 'initial_purchase', 'AFFILIATE-POLICY-V1', ?)`,
    [
      conversionId,
      input.attributionId,
      input.affiliateId,
      `program:${input.marker}`,
      `order:${input.marker}`,
      `financial:payment:${input.marker}`,
      "b".repeat(64),
      commercialAt,
      commercialAt,
      commercialAt,
    ],
  );
  await pool.execute(
    `INSERT INTO affiliate_entitlements
     (entitlement_id, conversion_id, affiliate_id, program_id, attribution_id, revision, status,
      disputed_from, eligible_revenue_minor, commission_minor, currency, rate_basis_points,
      policy_version, maturity_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'earned', NULL, 10000, 3000, 'BRL', 3000,
      'AFFILIATE-POLICY-V1', ?, ?, ?)`,
    [
      entitlementId,
      conversionId,
      input.affiliateId,
      `program:${input.marker}`,
      input.attributionId,
      commercialAt,
      commercialAt,
      commercialAt,
    ],
  );
  await pool.execute(
    `INSERT INTO affiliate_materialization_requests
     (request_id, entitlement_id, entitlement_revision, affiliate_id, conversion_id, policy_version,
      entitlement_digest, correlation_id, state, financial_reference, rejection_code, retryable,
      attempts, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, 'AFFILIATE-POLICY-V1', UNHEX(SHA2(?, 256)), ?, 'accepted', ?, NULL, 0, 1, ?, ?)`,
    [
      `materialization:${input.marker}`,
      entitlementId,
      input.affiliateId,
      conversionId,
      "c".repeat(64),
      `corr:materialization:${input.marker}`,
      `financial:accepted:${input.marker}`,
      commercialAt,
      commercialAt,
    ],
  );
}

describe.skipIf(!databaseUrl)(
  "Affiliates Privacy/LGPD MySQL acceptance",
  () => {
    const pool = mysql.createPool({
      uri: databaseUrl,
      connectionLimit: 8,
      timezone: "Z",
    });
    const clock = { now: () => now };
    const privacy = new AffiliatePrivacyService(pool, authorization, clock);

    beforeAll(async () => {
      await applyAffiliatesM154Schema(pool);
      await clean(pool);
    });

    afterEach(async () => {
      await clean(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    it("handles an Identity-scoped DSR without PII leakage and denies cross-affiliate or unauthorized access", async () => {
      await seedAccount(pool, "affiliate:privacy:A", "A");
      await seedAccount(pool, "affiliate:privacy:B", "B");
      await seedReferral(pool, {
        evidenceId: "evidence:privacy:A",
        affiliateId: "affiliate:privacy:A",
        marker: "a1",
        subjectId: "subject:direct-secret:A",
        observedAt: "2026-08-01T00:00:00.000Z",
      });
      await seedReferral(pool, {
        evidenceId: "evidence:privacy:B",
        affiliateId: "affiliate:privacy:B",
        marker: "b1",
        subjectId: "subject:direct-secret:B",
        observedAt: "2026-08-01T00:00:00.000Z",
      });

      const result = await privacy.handleDsrRequest({
        requestId: "privacy:dsr:A:0001",
        affiliateId: "affiliate:privacy:A",
        reason: "data subject access request",
        actor: affiliateActor("affiliate:privacy:A"),
      });
      expect(result.status).toBe("completed");
      expect(result.replayed).toBe(false);
      expect(result.inventory.affiliateId).toBe("affiliate:privacy:A");
      expect(result.inventory.referralEvidence).toBe(1);
      expect(result.inventory.memberships).toBe(1);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("identity:secret:A");
      expect(serialized).not.toContain("pseudo:secret:A");
      expect(serialized).not.toContain("subject:direct-secret:A");
      expect(serialized).not.toContain("identity:secret:B");
      expect(serialized).not.toContain("subject:direct-secret:B");

      const replay = await privacy.handleDsrRequest({
        requestId: "privacy:dsr:A:0001",
        affiliateId: "affiliate:privacy:A",
        reason: "data subject access request",
        actor: affiliateActor("affiliate:privacy:A"),
      });
      expect(replay.replayed).toBe(true);
      expect(replay.inventory).toEqual(result.inventory);

      await expect(
        privacy.handleDsrRequest({
          requestId: "privacy:dsr:B:cross",
          affiliateId: "affiliate:privacy:B",
          reason: "cross affiliate attempt",
          actor: affiliateActor("affiliate:privacy:A"),
        }),
      ).rejects.toThrow("AFFILIATE_PRIVACY_SCOPE_DENIED");

      await expect(
        privacy.handleDsrRequest({
          requestId: "privacy:dsr:A:denied",
          affiliateId: "affiliate:privacy:A",
          reason: "authorization denied request",
          actor: {
            actorKind: "service",
            actorReference: "actor:denied",
            correlationId: "corr:privacy:denied:0001",
          },
        }),
      ).rejects.toThrow("AFFILIATE_PRIVACY_AUTHORIZATION_DENIED");

      await expect(
        privacy.handleDsrRequest({
          requestId: "x",
          affiliateId: "affiliate:privacy:A",
          reason: "malformed request",
          actor: affiliateActor("affiliate:privacy:A"),
        }),
      ).rejects.toThrow("AFFILIATE_PRIVACY_REQUEST_ID_INVALID");

      const [auditRows] = await pool.execute<CountReadRow[]>(
        `SELECT COUNT(*) AS count_value FROM affiliate_audit_events
       WHERE affiliate_id = ? AND operation = 'affiliate.request_privacy_data'`,
        ["affiliate:privacy:A"],
      );
      expect(Number(auditRows[0]?.count_value ?? 0)).toBe(2);
    });

    it("anonymizes Affiliate identity links and subjects irreversibly while preserving commercial evidence across replay and restart", async () => {
      const affiliateId = "affiliate:privacy:anon";
      await seedAccount(pool, affiliateId, "anon");
      await seedReferral(pool, {
        evidenceId: "evidence:privacy:anon",
        affiliateId,
        marker: "an",
        subjectId: "subject:direct-secret:anon",
        observedAt: "2020-01-01T00:00:00.000Z",
      });
      await seedAttribution(pool, {
        attributionId: "attribution:privacy:anon",
        evidenceId: "evidence:privacy:anon",
        affiliateId,
        marker: "an",
        subjectId: "subject:direct-secret:anon",
        establishedAt: "2020-01-01T00:00:00.000Z",
        orderId: "order:an",
      });
      await seedCommercialEvidence(pool, {
        affiliateId,
        marker: "an",
        attributionId: "attribution:privacy:anon",
        commercialAt: "2020-01-10T00:00:00.000Z",
      });

      const input = {
        requestId: "privacy:anonymize:0001",
        affiliateId,
        reason: "valid data subject erasure request",
        actor: affiliateActor(affiliateId),
      };
      const first = await privacy.anonymizeAffiliateData(input);
      expect(first.status).toBe("completed");
      expect(first.identityReferencesAnonymized).toBe(true);
      expect(first.subjectsAnonymized).toBe(1);
      expect(first.commercialRecordsPreserved).toBe(3);

      const [accounts] = await pool.execute<AccountReadRow[]>(
        `SELECT identity_reference, pseudonymous_reference, status
       FROM affiliate_accounts WHERE affiliate_id = ?`,
        [affiliateId],
      );
      const account = accounts[0];
      if (!account) throw new Error("TEST_ACCOUNT_MISSING");
      expect(account.identity_reference).toMatch(/^anon:identity:/u);
      expect(account.pseudonymous_reference).toMatch(/^anon:pseudo:/u);
      expect(account.status).toBe("inactive");
      const anonymizedIdentity = account.identity_reference;
      const anonymizedPseudo = account.pseudonymous_reference;

      const [subjects] = await pool.execute<SubjectReadRow[]>(
        `SELECT subject_id FROM affiliate_referral_evidence WHERE affiliate_id = ?
       UNION SELECT subject_id FROM affiliate_attributions WHERE affiliate_id = ?`,
        [affiliateId, affiliateId],
      );
      expect(subjects).toHaveLength(1);
      expect(subjects[0]?.subject_id).toMatch(/^anon:subject:/u);
      expect(subjects[0]?.subject_id).not.toBe("subject:direct-secret:anon");

      const [commercial] = await pool.execute<CommercialReadRow[]>(
        `SELECT c.order_id, c.payment_reference, c.eligible_revenue_minor, e.commission_minor
       FROM affiliate_conversions c
       INNER JOIN affiliate_entitlements e ON e.conversion_id = c.conversion_id
       WHERE c.affiliate_id = ?`,
        [affiliateId],
      );
      expect(commercial[0]?.order_id).toBe("order:an");
      expect(commercial[0]?.payment_reference).toBe("financial:payment:an");
      expect(Number(commercial[0]?.eligible_revenue_minor)).toBe(10000);
      expect(Number(commercial[0]?.commission_minor)).toBe(3000);

      const replay = await privacy.anonymizeAffiliateData(input);
      expect(replay.replayed).toBe(true);
      expect(replay.subjectsAnonymized).toBe(first.subjectsAnonymized);

      const restarted = new AffiliatePrivacyService(pool, authorization, clock);
      const restartReplay = await restarted.anonymizeAffiliateData(input);
      expect(restartReplay.replayed).toBe(true);
      const [afterRestart] = await pool.execute<AccountReadRow[]>(
        `SELECT identity_reference, pseudonymous_reference, status
       FROM affiliate_accounts WHERE affiliate_id = ?`,
        [affiliateId],
      );
      expect(afterRestart[0]?.identity_reference).toBe(anonymizedIdentity);
      expect(afterRestart[0]?.pseudonymous_reference).toBe(anonymizedPseudo);
    });

    it("applies the approved 90-day, 24-month and 5-year policy without deleting commercial evidence whose final closure is not authoritative in Affiliate", async () => {
      const affiliateId = "affiliate:privacy:retention";
      await seedAccount(pool, affiliateId, "retention");

      await seedReferral(pool, {
        evidenceId: "evidence:raw:old:orphan",
        affiliateId,
        marker: "r1",
        subjectId: "subject:raw:old:orphan",
        observedAt: "2026-05-01T00:00:00.000Z",
      });
      await seedReferral(pool, {
        evidenceId: "evidence:raw:recent",
        affiliateId,
        marker: "r2",
        subjectId: "subject:raw:recent",
        observedAt: "2026-07-15T00:00:00.000Z",
      });
      await seedReferral(pool, {
        evidenceId: "evidence:attr:old:orphan",
        affiliateId,
        marker: "r3",
        subjectId: "subject:attr:old:orphan",
        observedAt: "2024-01-01T00:00:00.000Z",
      });
      await seedAttribution(pool, {
        attributionId: "attribution:old:orphan",
        evidenceId: "evidence:attr:old:orphan",
        affiliateId,
        marker: "r3",
        subjectId: "subject:attr:old:orphan",
        establishedAt: "2024-01-01T00:00:00.000Z",
      });
      await seedReferral(pool, {
        evidenceId: "evidence:commercial:old",
        affiliateId,
        marker: "r4",
        subjectId: "subject:commercial:old",
        observedAt: "2020-01-01T00:00:00.000Z",
      });
      await seedAttribution(pool, {
        attributionId: "attribution:commercial:old",
        evidenceId: "evidence:commercial:old",
        affiliateId,
        marker: "r4",
        subjectId: "subject:commercial:old",
        establishedAt: "2020-01-01T00:00:00.000Z",
        orderId: "order:r4",
      });
      await seedCommercialEvidence(pool, {
        affiliateId,
        marker: "r4",
        attributionId: "attribution:commercial:old",
        commercialAt: "2020-01-10T00:00:00.000Z",
      });

      const request = {
        requestId: "privacy:retention:0001",
        affiliateId,
        reason: "scheduled policy retention execution",
        actor: serviceActor,
      };
      const [first, duplicate] = await Promise.all([
        privacy.runRetentionJob(request),
        privacy.runRetentionJob(request),
      ]);
      const executed = first.replayed ? duplicate : first;
      const replay = first.replayed ? first : duplicate;
      expect(executed.status).toBe("completed");
      expect(replay.replayed).toBe(true);
      expect(executed.policy).toEqual({
        rawReferralEvidenceDays: 90,
        pseudonymousAttributionMonths: 24,
        commercialEvidenceYears: 5,
      });
      expect(executed.stats.attributionsDeleted).toBe(1);
      expect(executed.stats.attributionsPseudonymized).toBe(1);
      expect(executed.stats.rawReferralEvidenceDeleted).toBe(2);
      expect(executed.stats.rawReferralEvidencePseudonymized).toBe(1);
      expect(executed.stats.commercialEvidencePreserved).toBe(1);

      const [oldOrphanEvidence] = await pool.execute<CountReadRow[]>(
        `SELECT COUNT(*) AS count_value FROM affiliate_referral_evidence
       WHERE evidence_id IN ('evidence:raw:old:orphan', 'evidence:attr:old:orphan')`,
      );
      expect(Number(oldOrphanEvidence[0]?.count_value ?? 0)).toBe(0);
      const [recentEvidence] = await pool.execute<SubjectReadRow[]>(
        `SELECT subject_id FROM affiliate_referral_evidence
       WHERE evidence_id = 'evidence:raw:recent'`,
      );
      expect(recentEvidence[0]?.subject_id).toBe("subject:raw:recent");

      const [commercialAttribution] = await pool.execute<SubjectReadRow[]>(
        `SELECT subject_id FROM affiliate_attributions
       WHERE attribution_id = 'attribution:commercial:old'`,
      );
      expect(commercialAttribution[0]?.subject_id).toMatch(/^ret24:subject:/u);
      const [commercialReferral] = await pool.execute<SubjectReadRow[]>(
        `SELECT subject_id FROM affiliate_referral_evidence
       WHERE evidence_id = 'evidence:commercial:old'`,
      );
      expect(commercialReferral[0]?.subject_id).toMatch(/^ret90:subject:/u);

      const [commercial] = await pool.execute<CountReadRow[]>(
        `SELECT COUNT(*) AS count_value FROM affiliate_entitlements
       WHERE affiliate_id = ? AND entitlement_id = 'entitlement:r4'`,
        [affiliateId],
      );
      expect(Number(commercial[0]?.count_value ?? 0)).toBe(1);

      const restarted = new AffiliatePrivacyService(pool, authorization, clock);
      const afterRestart = await restarted.runRetentionJob(request);
      expect(afterRestart.replayed).toBe(true);
      expect(afterRestart.stats).toEqual(executed.stats);
    });

    it("blocks retention and anonymization under lawful hold, restricts hold release to authorized admin/service, and preserves tenant isolation", async () => {
      const affiliateA = "affiliate:privacy:hold:A";
      const affiliateB = "affiliate:privacy:hold:B";
      await seedAccount(pool, affiliateA, "holdA");
      await seedAccount(pool, affiliateB, "holdB");
      await seedReferral(pool, {
        evidenceId: "evidence:hold:A:old",
        affiliateId: affiliateA,
        marker: "ha",
        subjectId: "subject:hold:A",
        observedAt: "2026-01-01T00:00:00.000Z",
      });
      await seedReferral(pool, {
        evidenceId: "evidence:hold:B:old",
        affiliateId: affiliateB,
        marker: "hb",
        subjectId: "subject:hold:B",
        observedAt: "2026-01-01T00:00:00.000Z",
      });

      const holdInput = {
        holdId: "legal-hold:privacy:A:0001",
        affiliateId: affiliateA,
        reason: "lawful litigation hold",
        actor: adminActor,
      };
      const [holdFirst, holdDuplicate] = await Promise.all([
        privacy.applyLegalHold(holdInput),
        privacy.applyLegalHold(holdInput),
      ]);
      expect(holdFirst.active).toBe(true);
      expect(holdDuplicate.active).toBe(true);
      expect([holdFirst.replayed, holdDuplicate.replayed].sort()).toEqual([
        false,
        true,
      ]);

      const blockedRetention = await privacy.runRetentionJob({
        requestId: "privacy:retention:hold:A:0001",
        affiliateId: affiliateA,
        reason: "retention while lawful hold active",
        actor: serviceActor,
      });
      expect(blockedRetention.status).toBe("blocked_legal_hold");
      expect(blockedRetention.stats.rawReferralEvidenceDeleted).toBe(0);

      const blockedAnonymization = await privacy.anonymizeAffiliateData({
        requestId: "privacy:anonymize:hold:A:0001",
        affiliateId: affiliateA,
        reason: "erasure while lawful hold active",
        actor: affiliateActor(affiliateA),
      });
      expect(blockedAnonymization.status).toBe("blocked_legal_hold");

      await expect(
        privacy.releaseLegalHold({
          holdId: holdInput.holdId,
          affiliateId: affiliateA,
          actor: affiliateActor(affiliateA),
        }),
      ).rejects.toThrow("AFFILIATE_PRIVACY_AUTHORIZATION_DENIED");

      await expect(
        privacy.releaseLegalHold({
          holdId: holdInput.holdId,
          affiliateId: affiliateB,
          actor: adminActor,
        }),
      ).rejects.toThrow("AFFILIATE_LEGAL_HOLD_NOT_FOUND");

      const released = await privacy.releaseLegalHold({
        holdId: holdInput.holdId,
        affiliateId: affiliateA,
        actor: adminActor,
      });
      expect(released.active).toBe(false);
      const releaseReplay = await privacy.releaseLegalHold({
        holdId: holdInput.holdId,
        affiliateId: affiliateA,
        actor: adminActor,
      });
      expect(releaseReplay.replayed).toBe(true);

      const afterRelease = await privacy.runRetentionJob({
        requestId: "privacy:retention:hold:A:0002",
        affiliateId: affiliateA,
        reason: "retention after lawful hold release",
        actor: serviceActor,
      });
      expect(afterRelease.status).toBe("completed");
      expect(afterRelease.stats.rawReferralEvidenceDeleted).toBe(1);

      const [tenantB] = await pool.execute<CountReadRow[]>(
        `SELECT COUNT(*) AS count_value FROM affiliate_referral_evidence
       WHERE affiliate_id = ? AND evidence_id = 'evidence:hold:B:old'`,
        [affiliateB],
      );
      expect(Number(tenantB[0]?.count_value ?? 0)).toBe(1);

      const [holdRows] = await pool.execute<HoldReadRow[]>(
        `SELECT active FROM affiliate_legal_holds WHERE hold_id = ?`,
        [holdInput.holdId],
      );
      expect(holdRows[0]?.active).toBe(0);

      const [holdAudit] = await pool.execute<CountReadRow[]>(
        `SELECT COUNT(*) AS count_value FROM affiliate_audit_events
       WHERE affiliate_id = ? AND operation LIKE 'affiliate.manage_legal_hold.%'`,
        [affiliateA],
      );
      expect(Number(holdAudit[0]?.count_value ?? 0)).toBe(4);
    });
  },
);
