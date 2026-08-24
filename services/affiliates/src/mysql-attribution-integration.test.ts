import { createHash } from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  canonicalizeAffiliateInput,
  type AffiliateOrderingEvidencePort,
  type ReferralEvidenceSource,
} from "@touristic/affiliates";
import { ReferralEvidenceVerificationAdapter } from "./affiliate-adapters.js";
import { AffiliateApplicationService } from "./affiliate-application-service.js";
import { applyAffiliatesIdentityEligibilityM155 } from "./affiliate-identity-schema.js";
import { applyAffiliatesM154Schema } from "./mysql-affiliate-persistence.js";

const databaseUrl = process.env.AFFILIATES_DATABASE_URL ?? "";

interface CountRow extends RowDataPacket {
  count: number | string;
}

interface AttributionRow extends RowDataPacket {
  attribution_id: string;
  affiliate_id: string;
  program_id: string;
  subject_id: string;
  evidence_id: string;
  evidence_fingerprint: string;
  source: string;
  established_at: Date;
  expires_at: Date;
  order_id: string | null;
  order_locked_at: Date | null;
}

interface AuditRow extends RowDataPacket {
  outcome: string;
  reason: string;
}

interface EventRow extends RowDataPacket {
  event_type: string;
  aggregate_id: string;
}

const digest = {
  sha256: async (input: string) =>
    createHash("sha256").update(input).digest("hex"),
};

const authorization = {
  authorize: async () => ({
    allowed: true,
    decisionReference: "decision:attribution-mysql-acceptance",
  }),
};

function canonicalEvidence(
  source: ReferralEvidenceSource,
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  if (record.tampered === true || typeof record.token !== "string") return null;
  if (
    source === "server_referral" &&
    (record.authenticated !== true || record.version !== 1)
  ) {
    return null;
  }
  return source === "server_referral"
    ? { token: record.token, version: 1 }
    : { token: record.token };
}

describe.skipIf(!databaseUrl)(
  "Affiliates attribution engine MySQL 8.4 acceptance",
  () => {
    const pool = mysql.createPool({
      uri: databaseUrl,
      connectionLimit: 12,
      timezone: "Z",
    });
    const now = { value: "2026-08-01T00:00:00.000Z" };
    const orderStatuses = new Map<
      string,
      "draft" | "pending_payment" | "payment_confirmed" | "cancelled"
    >();
    const orderingEvidence: AffiliateOrderingEvidencePort = {
      getOrderEvidence: async (orderId) => {
        const status = orderStatuses.get(orderId);
        return status ? { orderId, status, contractVersion: 1 } : null;
      },
    };
    const verification = new ReferralEvidenceVerificationAdapter(
      async ({ source, evidence }) => {
        const canonical = canonicalEvidence(source, evidence);
        return canonical
          ? { accepted: true as const, canonicalEvidence: canonical }
          : {
              accepted: false as const,
              code: "EVIDENCE_INVALID_OR_TAMPERED",
            };
      },
    );
    const service = new AffiliateApplicationService(
      pool,
      authorization,
      digest,
      verification,
      { now: () => now.value },
      orderingEvidence,
    );

    beforeAll(async () => {
      await applyAffiliatesM154Schema(pool);
      await applyAffiliatesIdentityEligibilityM155(pool);
    });

    beforeEach(async () => {
      now.value = "2026-08-01T00:00:00.000Z";
      orderStatuses.clear();
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
      await createProgram("prog_attr_0001", "morro");
      await createEligibleAffiliate("aff_attr_0001", "prog_attr_0001");
      await createEligibleAffiliate("aff_attr_0002", "prog_attr_0001");
    });

    afterAll(async () => {
      await pool.end();
    });

    async function createProgram(
      programId: string,
      destinationId: string,
    ): Promise<void> {
      await pool.execute(
        `INSERT INTO affiliate_programs
         (program_id, destination_id, status, terms_version, created_at, updated_at)
         VALUES (?, ?, 'active', 'terms-v1', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [programId, destinationId],
      );
    }

    async function createEligibleAffiliate(
      affiliateId: string,
      programId: string,
    ): Promise<void> {
      await pool.execute(
        `INSERT INTO affiliate_accounts
         (affiliate_id, identity_reference, pseudonymous_reference, status,
          identity_verified, contact_verified, fraud_blocked, created_at, updated_at)
         VALUES (?, ?, ?, 'active', 1, 1, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [affiliateId, `identity:${affiliateId}`, `pseudo:${affiliateId}`],
      );
      await pool.execute(
        `INSERT INTO affiliate_memberships
         (membership_id, affiliate_id, program_id, status, accepted_terms_version,
          financial_onboarding_status, joined_at, ended_at, updated_at)
         VALUES (?, ?, ?, 'approved', 'terms-v1', 'eligible', UTC_TIMESTAMP(3), NULL, UTC_TIMESTAMP(3))`,
        [`membership:${affiliateId}:${programId}`, affiliateId, programId],
      );
    }

    function input(
      suffix: string,
      overrides: Partial<
        Parameters<
          AffiliateApplicationService["recordReferralAndEstablishAttribution"]
        >[0]
      > = {},
    ) {
      return {
        requestId: `request:${suffix.padEnd(8, "0")}`,
        affiliateId: "aff_attr_0001",
        programId: "prog_attr_0001",
        destinationId: "morro",
        subjectId: `browser-subject:${suffix.padEnd(8, "0")}`,
        source: "platform_link" as const,
        evidence: { token: `token:${suffix}` },
        actorReference: "svc:affiliate-attribution-test",
        correlationId: `corr:${suffix.padEnd(8, "0")}`,
        ...overrides,
      };
    }

    async function count(table: string): Promise<number> {
      const [rows] = await pool.query<CountRow[]>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      );
      return Number(rows[0]?.count ?? 0);
    }

    async function readAttribution(subjectId: string): Promise<AttributionRow> {
      const [rows] = await pool.execute<AttributionRow[]>(
        `SELECT attribution_id, affiliate_id, program_id, subject_id, evidence_id,
                HEX(evidence_fingerprint) AS evidence_fingerprint, source,
                established_at, expires_at, order_id, order_locked_at
         FROM affiliate_attributions WHERE subject_id = ?`,
        [subjectId],
      );
      const row = rows[0];
      if (!row) throw new Error("ATTRIBUTION_READBACK_MISSING");
      return row;
    }

    it("persists canonical server-owned SHA-256 evidence, durable outbox/audit and exact original replay", async () => {
      const request = input("persist01", {
        source: "checkout_code",
        evidence: { token: "canonical-checkout", ignored: "noise" },
      });
      const first =
        await service.recordReferralAndEstablishAttribution(request);

      const expectedSubjectDigest = createHash("sha256")
        .update(
          canonicalizeAffiliateInput({
            destinationId: "morro",
            subjectReference: request.subjectId,
          }),
        )
        .digest("hex");
      const expectedSubjectId = `asub_${expectedSubjectDigest}`;
      const expectedFingerprint = createHash("sha256")
        .update(
          canonicalizeAffiliateInput({
            affiliateId: "aff_attr_0001",
            programId: "prog_attr_0001",
            destinationId: "morro",
            subjectId: expectedSubjectId,
            source: "checkout_code",
            evidence: { token: "canonical-checkout" },
          }),
        )
        .digest("hex");

      expect(first.replayed).toBe(false);
      expect(first.attribution.subjectId).toBe(expectedSubjectId);
      expect(first.attribution.evidenceFingerprint).toBe(expectedFingerprint);
      expect(first.attribution.id).toBe(`attr_${expectedFingerprint}`);
      expect(first.attribution.evidenceId).toBe(`afev_${expectedFingerprint}`);
      expect(first.attribution.establishedAt).toBe("2026-08-01T00:00:00.000Z");
      expect(first.attribution.expiresAt).toBe("2026-08-31T00:00:00.000Z");

      const persisted = await readAttribution(first.attribution.subjectId);
      expect(persisted.evidence_fingerprint.toLowerCase()).toBe(
        expectedFingerprint,
      );

      now.value = "2026-09-15T00:00:00.000Z";
      const replay =
        await service.recordReferralAndEstablishAttribution(request);
      expect(replay.replayed).toBe(true);
      expect(replay.attribution).toEqual(first.attribution);

      expect(await count("affiliate_referral_evidence")).toBe(1);
      expect(await count("affiliate_attributions")).toBe(1);
      expect(await count("affiliate_idempotency_claims")).toBe(1);
      expect(await count("affiliate_outbox_events")).toBe(2);

      const [events] = await pool.query<EventRow[]>(
        "SELECT event_type, aggregate_id FROM affiliate_outbox_events ORDER BY event_type",
      );
      expect(events.map((row) => row.event_type).sort()).toEqual([
        "AffiliateAttributionEstablished",
        "AffiliateReferralEvidenceRecorded",
      ]);
      const [audits] = await pool.query<AuditRow[]>(
        "SELECT outcome, reason FROM affiliate_audit_events ORDER BY occurred_at",
      );
      expect(audits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            outcome: "accepted",
            reason: "attribution_established",
          }),
          expect.objectContaining({
            outcome: "replayed",
            reason: "exact_replay",
          }),
        ]),
      );
    });

    it("fails closed on divergent replay, cross-destination replay and tampered evidence", async () => {
      const original = input("replay01", {
        subjectId: "shared-subject-replay",
        evidence: { token: "original" },
      });
      await service.recordReferralAndEstablishAttribution(original);

      await expect(
        service.recordReferralAndEstablishAttribution({
          ...original,
          evidence: { token: "divergent" },
        }),
      ).rejects.toThrow("AFFILIATE_IDEMPOTENCY_CONFLICT");

      await expect(
        service.recordReferralAndEstablishAttribution({
          ...original,
          destinationId: "other-destination",
        }),
      ).rejects.toThrow("AFFILIATE_IDEMPOTENCY_CONFLICT");

      await expect(
        service.recordReferralAndEstablishAttribution(
          input("tamper01", {
            evidence: { token: "looks-valid", tampered: true },
          }),
        ),
      ).rejects.toThrow("AFFILIATE_REFERRAL_EVIDENCE_REJECTED");

      await expect(
        service.recordReferralAndEstablishAttribution({
          ...input("unknown01"),
          source: "unknown_source" as never,
        }),
      ).rejects.toThrow("AFFILIATE_REFERRAL_REQUEST_INVALID");

      expect(await count("affiliate_referral_evidence")).toBe(1);
      expect(await count("affiliate_attributions")).toBe(1);
    });

    it("requires authenticated versioned evidence for server_referral", async () => {
      await expect(
        service.recordReferralAndEstablishAttribution(
          input("s2sdeny1", {
            source: "server_referral",
            evidence: { token: "s2s", authenticated: false, version: 1 },
          }),
        ),
      ).rejects.toThrow("AFFILIATE_REFERRAL_EVIDENCE_REJECTED");

      const accepted = await service.recordReferralAndEstablishAttribution(
        input("s2sallow", {
          source: "server_referral",
          evidence: { token: "s2s", authenticated: true, version: 1 },
        }),
      );
      expect(accepted.attribution.source).toBe("server_referral");
    });

    it("applies precedence in normal and reverse order and latest server-observed evidence within a tier", async () => {
      const shared = "shared-precedence-subject";
      const link = await service.recordReferralAndEstablishAttribution(
        input("prec-link", {
          subjectId: shared,
          source: "platform_link",
          evidence: { token: "link" },
        }),
      );
      now.value = "2026-08-01T00:00:00.001Z";
      await service.recordReferralAndEstablishAttribution(
        input("prec-srv1", {
          subjectId: shared,
          source: "server_referral",
          evidence: { token: "server", authenticated: true, version: 1 },
        }),
      );
      now.value = "2026-08-01T00:00:00.002Z";
      const checkout = await service.recordReferralAndEstablishAttribution(
        input("prec-code", {
          subjectId: shared,
          source: "checkout_code",
          evidence: { token: "checkout" },
        }),
      );
      const persisted = await readAttribution(checkout.attribution.subjectId);
      expect(persisted.source).toBe("checkout_code");
      expect(persisted.attribution_id).toBe(checkout.attribution.id);
      expect(persisted.attribution_id).not.toBe(link.attribution.id);

      const reverseSubject = "shared-reverse-subject";
      now.value = "2026-08-01T00:00:01.000Z";
      const reverseCheckout =
        await service.recordReferralAndEstablishAttribution(
          input("rev-code", {
            subjectId: reverseSubject,
            source: "checkout_code",
            evidence: { token: "checkout-reverse" },
          }),
        );
      now.value = "2026-08-01T00:00:01.001Z";
      await service.recordReferralAndEstablishAttribution(
        input("rev-link", {
          subjectId: reverseSubject,
          source: "platform_link",
          evidence: { token: "link-reverse" },
        }),
      );
      expect(
        (await readAttribution(reverseCheckout.attribution.subjectId)).source,
      ).toBe("checkout_code");

      const sameTierSubject = "shared-same-tier-subject";
      now.value = "2026-08-01T00:01:00.000Z";
      const older = await service.recordReferralAndEstablishAttribution(
        input("tier-old", {
          subjectId: sameTierSubject,
          source: "platform_link",
          evidence: { token: "older" },
        }),
      );
      now.value = "2026-08-01T00:01:00.001Z";
      const newer = await service.recordReferralAndEstablishAttribution(
        input("tier-new", {
          subjectId: sameTierSubject,
          source: "platform_qr",
          evidence: { token: "newer" },
        }),
      );
      const sameTier = await readAttribution(newer.attribution.subjectId);
      expect(sameTier.attribution_id).toBe(newer.attribution.id);
      expect(sameTier.attribution_id).not.toBe(older.attribution.id);
    });

    it("fails closed unless Ordering authoritatively reports pending_payment", async () => {
      const first = await service.recordReferralAndEstablishAttribution(
        input("lock-state", {
          subjectId: "order-state-guard-subject",
          source: "platform_link",
          evidence: { token: "lock-state-guard" },
        }),
      );

      const invalidCases = [
        ["order-missing-0001", null],
        ["order-draft-000001", "draft"],
        ["order-confirmed-001", "payment_confirmed"],
        ["order-cancelled-001", "cancelled"],
      ] as const;
      for (const [orderId, status] of invalidCases) {
        if (status) orderStatuses.set(orderId, status);
        await expect(
          service.lockAttributionToOrder(first.attribution.subjectId, orderId),
        ).rejects.toThrow("AFFILIATE_ORDER_NOT_PENDING_PAYMENT");
      }

      const persisted = await readAttribution(first.attribution.subjectId);
      expect(persisted.order_id).toBeNull();
      expect(persisted.order_locked_at).toBeNull();
    });

    it("locks attribution using server time and never lets later evidence replace a pending-payment order attribution", async () => {
      const first = await service.recordReferralAndEstablishAttribution(
        input("lock-link", {
          subjectId: "shared-order-lock-subject",
          source: "platform_link",
          evidence: { token: "link-before-lock" },
        }),
      );
      now.value = "2026-08-01T00:05:00.000Z";
      orderStatuses.set("order-attribution-0001", "pending_payment");
      await service.lockAttributionToOrder(
        first.attribution.subjectId,
        "order-attribution-0001",
        "2099-12-31T23:59:59.999Z",
      );
      let persisted = await readAttribution(first.attribution.subjectId);
      expect(persisted.order_id).toBe("order-attribution-0001");
      expect(persisted.order_locked_at?.toISOString()).toBe(
        "2026-08-01T00:05:00.000Z",
      );

      now.value = "2026-08-01T00:06:00.000Z";
      const late = await service.recordReferralAndEstablishAttribution(
        input("lock-code", {
          subjectId: "shared-order-lock-subject",
          source: "checkout_code",
          evidence: { token: "checkout-after-lock" },
        }),
      );
      persisted = await readAttribution(first.attribution.subjectId);
      expect(late.attribution.id).toBe(first.attribution.id);
      expect(persisted.attribution_id).toBe(first.attribution.id);
    });

    it("enforces the exact 30-day boundary without duplicate evidence extending the window and preserves replay after expiry", async () => {
      const request = input("window01", {
        subjectId: "window-boundary-subject",
        source: "platform_link",
        evidence: { token: "fixed-window-evidence" },
      });
      const first =
        await service.recordReferralAndEstablishAttribution(request);
      expect(first.attribution.expiresAt).toBe("2026-08-31T00:00:00.000Z");

      now.value = "2026-08-30T23:59:59.999Z";
      const beforeBoundary =
        await service.recordReferralAndEstablishAttribution({
          ...request,
          requestId: "request:window-before-boundary",
          correlationId: "corr:window-before-boundary",
        });
      expect(beforeBoundary.attribution.expiresAt).toBe(
        first.attribution.expiresAt,
      );

      now.value = "2026-08-31T00:00:00.000Z";
      await expect(
        service.recordReferralAndEstablishAttribution({
          ...request,
          requestId: "request:window-exact-boundary",
          correlationId: "corr:window-exact-boundary",
        }),
      ).rejects.toThrow("AFFILIATE_ATTRIBUTION_INVALID");

      now.value = "2026-08-31T00:00:00.001Z";
      await expect(
        service.recordReferralAndEstablishAttribution({
          ...request,
          requestId: "request:window-after-boundary",
          correlationId: "corr:window-after-boundary",
        }),
      ).rejects.toThrow("AFFILIATE_ATTRIBUTION_INVALID");

      const exactReplay =
        await service.recordReferralAndEstablishAttribution(request);
      expect(exactReplay.replayed).toBe(true);
      expect(exactReplay.attribution).toEqual(first.attribution);
    });

    it("isolates request semantics across program and destination contexts", async () => {
      const request = input("isolate1", {
        subjectId: "isolation-subject",
        evidence: { token: "isolation" },
      });
      await service.recordReferralAndEstablishAttribution(request);
      await createProgram("prog_attr_0002", "morro");
      await createEligibleAffiliate("aff_attr_0003", "prog_attr_0002");

      await expect(
        service.recordReferralAndEstablishAttribution({
          ...request,
          affiliateId: "aff_attr_0003",
          programId: "prog_attr_0002",
        }),
      ).rejects.toThrow("AFFILIATE_IDEMPOTENCY_CONFLICT");
      await expect(
        service.recordReferralAndEstablishAttribution({
          ...request,
          destinationId: "other",
        }),
      ).rejects.toThrow("AFFILIATE_IDEMPOTENCY_CONFLICT");
    });

    it("allows previously accepted exact replay during suspension while denying every NEW attribution", async () => {
      const acceptedInput = input("suspend1", {
        subjectId: "suspension-history-subject",
        source: "checkout_code",
        evidence: { token: "accepted-before-suspension" },
      });
      const accepted =
        await service.recordReferralAndEstablishAttribution(acceptedInput);
      await pool.execute(
        `UPDATE affiliate_memberships
         SET status = 'suspended', updated_at = UTC_TIMESTAMP(3)
         WHERE affiliate_id = 'aff_attr_0001' AND program_id = 'prog_attr_0001'`,
      );

      const replay =
        await service.recordReferralAndEstablishAttribution(acceptedInput);
      expect(replay.replayed).toBe(true);
      expect(replay.attribution.id).toBe(accepted.attribution.id);

      await expect(
        service.recordReferralAndEstablishAttribution(
          input("suspend2", {
            subjectId: "suspension-new-subject",
            evidence: { token: "new-while-suspended" },
          }),
        ),
      ).rejects.toThrow("AFFILIATE_NOT_ELIGIBLE");
      expect(await count("affiliate_attributions")).toBe(1);
    });

    it("serializes 6+ competing affiliate rounds and converges on the deterministic higher-precedence winner", async () => {
      for (let round = 0; round < 6; round += 1) {
        const subject = `concurrent-subject-${round}`;
        now.value = `2026-08-01T00:10:0${round}.000Z`;
        const lower = input(`conc-link-${round}`, {
          affiliateId: "aff_attr_0001",
          subjectId: subject,
          source: "platform_link",
          evidence: { token: `link-${round}` },
        });
        const higher = input(`conc-code-${round}`, {
          affiliateId: "aff_attr_0002",
          subjectId: subject,
          source: "checkout_code",
          evidence: { token: `code-${round}` },
        });
        const requests = round % 2 === 0 ? [lower, higher] : [higher, lower];
        const results = await Promise.all(
          requests.map((request) =>
            service.recordReferralAndEstablishAttribution(request),
          ),
        );
        const canonicalSubjectId = results[0]?.attribution.subjectId;
        if (!canonicalSubjectId) throw new Error("CONCURRENT_SUBJECT_MISSING");
        const persisted = await readAttribution(canonicalSubjectId);
        expect(persisted.source).toBe("checkout_code");
        expect(persisted.affiliate_id).toBe("aff_attr_0002");
        const [rows] = await pool.execute<CountRow[]>(
          "SELECT COUNT(*) AS count FROM affiliate_attributions WHERE subject_id = ?",
          [canonicalSubjectId],
        );
        expect(Number(rows[0]?.count ?? 0)).toBe(1);
      }
    });

    it("serializes competing affiliates 1ms before expiry and still converges deterministically with one active attribution", async () => {
      const subject = "near-expiry-concurrent-subject";
      const initial = await service.recordReferralAndEstablishAttribution(
        input("expiry-base", {
          affiliateId: "aff_attr_0001",
          subjectId: subject,
          source: "platform_link",
          evidence: { token: "initial" },
        }),
      );
      expect(initial.attribution.expiresAt).toBe("2026-08-31T00:00:00.000Z");

      now.value = "2026-08-30T23:59:59.999Z";
      const serverReferral = input("expiry-srv", {
        affiliateId: "aff_attr_0001",
        subjectId: subject,
        source: "server_referral",
        evidence: { token: "server", authenticated: true, version: 1 },
      });
      const checkout = input("expiry-code", {
        affiliateId: "aff_attr_0002",
        subjectId: subject,
        source: "checkout_code",
        evidence: { token: "checkout" },
      });
      const results = await Promise.all([
        service.recordReferralAndEstablishAttribution(serverReferral),
        service.recordReferralAndEstablishAttribution(checkout),
      ]);
      const canonicalSubjectId = results[0]?.attribution.subjectId;
      if (!canonicalSubjectId) throw new Error("NEAR_EXPIRY_SUBJECT_MISSING");
      const persisted = await readAttribution(canonicalSubjectId);
      expect(persisted.source).toBe("checkout_code");
      expect(persisted.affiliate_id).toBe("aff_attr_0002");
      const [rows] = await pool.execute<CountRow[]>(
        "SELECT COUNT(*) AS count FROM affiliate_attributions WHERE subject_id = ?",
        [canonicalSubjectId],
      );
      expect(Number(rows[0]?.count ?? 0)).toBe(1);
    });
  },
);
