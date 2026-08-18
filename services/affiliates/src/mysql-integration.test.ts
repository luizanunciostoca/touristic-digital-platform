import mysql, { type RowDataPacket } from "mysql2/promise";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { applyAffiliatesM154Schema } from "./mysql-affiliate-persistence.js";
import { AffiliateApplicationService } from "./affiliate-application-service.js";

const databaseUrl = process.env.AFFILIATES_DATABASE_URL ?? "";

interface CountsRow extends RowDataPacket {
  evidence_count: number | string;
  attribution_count: number | string;
  audit_count: number | string;
  outbox_count: number | string;
}

describe.skipIf(!databaseUrl)("Affiliates M154 MySQL persistence", () => {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 4,
    timezone: "Z",
  });
  const authorization = {
    authorize: async () => ({
      allowed: true,
      decisionReference: "decision:test",
    }),
  };
  const digest = {
    sha256: async () =>
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const service = new AffiliateApplicationService(pool, authorization, digest);

  beforeAll(async () => {
    await applyAffiliatesM154Schema(pool);
    await pool.query("DELETE FROM affiliate_outbox_events");
    await pool.query("DELETE FROM affiliate_audit_events");
    await pool.query("DELETE FROM affiliate_idempotency_claims");
    await pool.query("DELETE FROM affiliate_attributions");
    await pool.query("DELETE FROM affiliate_referral_evidence");
    await pool.query("DELETE FROM affiliate_memberships");
    await pool.query("DELETE FROM affiliate_accounts");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("commits evidence, attribution, audit and outbox atomically and replays exactly", async () => {
    const input = {
      evidenceId: "ref_m154_mysql_0001",
      attributionId: "att_m154_mysql_0001",
      affiliateId: "aff_m154_mysql_0001",
      programId: "prog_m154_mysql_0001",
      subjectId: "subject_m154_mysql_0001",
      source: "checkout_code" as const,
      evidenceFingerprint:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      serverObservedAt: "2026-08-17T12:00:00.000Z",
      receivedAt: "2026-08-17T12:00:00.000Z",
      actorReference: "svc:test",
      correlationId: "corr:m154:0001",
    };
    const first = await service.recordReferralAndEstablishAttribution(input);
    const replay = await service.recordReferralAndEstablishAttribution(input);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.attribution.id).toBe(first.attribution.id);

    const [rows] = await pool.query<CountsRow[]>(
      `SELECT
        (SELECT COUNT(*) FROM affiliate_referral_evidence) AS evidence_count,
        (SELECT COUNT(*) FROM affiliate_attributions) AS attribution_count,
        (SELECT COUNT(*) FROM affiliate_audit_events) AS audit_count,
        (SELECT COUNT(*) FROM affiliate_outbox_events) AS outbox_count`,
    );
    const counts = rows[0];
    if (!counts) throw new Error("AFFILIATE_COUNTS_MISSING");
    expect(Number(counts.evidence_count)).toBe(1);
    expect(Number(counts.attribution_count)).toBe(1);
    expect(Number(counts.audit_count)).toBe(1);
    expect(Number(counts.outbox_count)).toBe(1);
  });
});
