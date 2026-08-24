import { createHash, randomBytes } from "node:crypto";
import {
  AFFILIATE_POLICY_V1,
  type AffiliateAuthorizationAction,
  type AffiliateAuthorizationContext,
  type AffiliateAuthorizationPort,
  type AffiliateId,
} from "@touristic/affiliates";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

export interface AffiliatePrivacyActor {
  readonly actorKind: AffiliateAuthorizationContext["actorKind"];
  readonly actorReference: string;
  readonly affiliateId?: string;
  readonly correlationId: string;
}

export interface AffiliatePrivacyInventory {
  readonly affiliateId: string;
  readonly identityReferenceState: "linked" | "anonymized";
  readonly accounts: number;
  readonly memberships: number;
  readonly referralEvidence: number;
  readonly attributions: number;
  readonly conversions: number;
  readonly entitlements: number;
  readonly materializationRequests: number;
  readonly privacyRequests: number;
  readonly activeLegalHolds: number;
}

export interface AffiliateDsrResult {
  readonly requestId: string;
  readonly affiliateId: string;
  readonly status: "completed";
  readonly replayed: boolean;
  readonly inventory: AffiliatePrivacyInventory;
}

export interface AffiliateAnonymizationResult {
  readonly requestId: string;
  readonly affiliateId: string;
  readonly status: "completed" | "blocked_legal_hold";
  readonly replayed: boolean;
  readonly identityReferencesAnonymized: boolean;
  readonly subjectsAnonymized: number;
  readonly commercialRecordsPreserved: number;
}

export interface AffiliateRetentionStats {
  readonly rawReferralEvidenceDeleted: number;
  readonly rawReferralEvidencePseudonymized: number;
  readonly attributionsDeleted: number;
  readonly attributionsPseudonymized: number;
  readonly commercialEvidencePreserved: number;
}

export interface AffiliateRetentionResult {
  readonly requestId: string;
  readonly affiliateId: string;
  readonly status: "completed" | "blocked_legal_hold";
  readonly replayed: boolean;
  readonly policy: Readonly<{
    rawReferralEvidenceDays: 90;
    pseudonymousAttributionMonths: 24;
    commercialEvidenceYears: 5;
  }>;
  readonly stats: AffiliateRetentionStats;
}

export interface AffiliateLegalHoldResult {
  readonly holdId: string;
  readonly affiliateId: string;
  readonly active: boolean;
  readonly replayed: boolean;
}

export interface AffiliatePrivacyRequestInput {
  readonly requestId: string;
  readonly affiliateId: string;
  readonly reason: string;
  readonly actor: AffiliatePrivacyActor;
}

export interface AffiliateLegalHoldInput {
  readonly holdId: string;
  readonly affiliateId: string;
  readonly reason: string;
  readonly actor: AffiliatePrivacyActor;
}

export interface AffiliateLegalHoldReleaseInput {
  readonly holdId: string;
  readonly affiliateId: string;
  readonly actor: AffiliatePrivacyActor;
}

type PrivacyRequestKind = "dsr" | "anonymization" | "retention_purge";
type PrivacyRequestStatus =
  "requested" | "completed" | "blocked_legal_hold" | "rejected";

interface AccountRow extends RowDataPacket {
  affiliate_id: string;
  identity_reference: string;
  pseudonymous_reference: string;
  status: "active" | "suspended" | "inactive";
}

interface PrivacyRequestRow extends RowDataPacket {
  request_id: string;
  affiliate_id: string;
  request_kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  requested_by: string;
  reason: string;
  requested_at: Date;
  completed_at: Date | null;
}

interface LegalHoldRow extends RowDataPacket {
  hold_id: string;
  affiliate_id: string;
  reason: string;
  active: number;
  created_by: string;
  created_at: Date;
  released_at: Date | null;
  released_by: string | null;
}

interface CountRow extends RowDataPacket {
  count_value: number | string;
}

interface InventoryRow extends RowDataPacket {
  accounts: number | string;
  memberships: number | string;
  referral_evidence: number | string;
  attributions: number | string;
  conversions: number | string;
  entitlements: number | string;
  materialization_requests: number | string;
  privacy_requests: number | string;
  active_legal_holds: number | string;
}

interface SubjectRow extends RowDataPacket {
  subject_id: string;
}

interface RetentionAttributionRow extends RowDataPacket {
  attribution_id: string;
  subject_id: string;
  order_id: string | null;
  established_at: Date;
}

interface RetentionReferralRow extends RowDataPacket {
  evidence_id: string;
  subject_id: string;
}

interface ActivityRow extends RowDataPacket {
  last_activity: Date | null;
}

interface IdempotencyRow extends RowDataPacket {
  semantic_digest: Buffer;
  outcome_json: string | object | null;
}

interface PrivacyRequestClaim {
  readonly replayed: boolean;
  readonly status: PrivacyRequestStatus;
}

interface IdempotencyClaim<T> {
  readonly key: string;
  readonly semanticDigest: string;
  readonly replayed: boolean;
  readonly outcome: T | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("AFFILIATE_PRIVACY_CANONICAL_INPUT_UNSUPPORTED");
}

function parseOutcome<T>(value: string | object): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function assertIdentifier(value: string, code: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,179}$/u.test(value)) {
    throw new Error(code);
  }
}

function assertReason(value: string): void {
  if (value.trim().length < 3 || value.length > 255) {
    throw new Error("AFFILIATE_PRIVACY_REASON_INVALID");
  }
}

function assertActor(actor: AffiliatePrivacyActor): void {
  if (
    actor.actorReference.trim().length === 0 ||
    actor.actorReference.length > 180
  ) {
    throw new Error("AFFILIATE_PRIVACY_CONTEXT_INCOMPLETE");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/u.test(actor.correlationId)) {
    throw new Error("AFFILIATE_PRIVACY_CONTEXT_INCOMPLETE");
  }
  if (actor.affiliateId !== undefined) {
    assertIdentifier(actor.affiliateId, "AFFILIATE_PRIVACY_CONTEXT_INCOMPLETE");
  }
}

function serverDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("AFFILIATE_PRIVACY_CLOCK_INVALID");
  }
  return parsed;
}

function subtractUtcDays(value: Date, days: number): Date {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function subtractUtcMonths(value: Date, months: number): Date {
  const result = new Date(value.getTime());
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}

function subtractUtcYears(value: Date, years: number): Date {
  const result = new Date(value.getTime());
  result.setUTCFullYear(result.getUTCFullYear() - years);
  return result;
}

function numberValue(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function isPseudonymizedSubject(subjectId: string): boolean {
  return (
    subjectId.startsWith("anon:subject:") ||
    subjectId.startsWith("ret90:subject:") ||
    subjectId.startsWith("ret24:subject:")
  );
}

function retentionPolicy(): AffiliateRetentionResult["policy"] {
  return {
    rawReferralEvidenceDays:
      AFFILIATE_POLICY_V1.retention.rawReferralEvidenceDays,
    pseudonymousAttributionMonths:
      AFFILIATE_POLICY_V1.retention.pseudonymousAttributionMonths,
    commercialEvidenceYears:
      AFFILIATE_POLICY_V1.retention.commercialEvidenceYears,
  };
}

export class AffiliatePrivacyService {
  public constructor(
    private readonly pool: Pool,
    private readonly authorization: AffiliateAuthorizationPort,
    private readonly clock: { now(): string },
  ) {}

  public async handleDsrRequest(
    input: AffiliatePrivacyRequestInput,
  ): Promise<AffiliateDsrResult> {
    this.validatePrivacyRequest(input);
    const decisionReference = await this.authorize(
      "affiliate.request_privacy_data",
      input.actor,
      input.affiliateId,
      false,
    );
    const now = serverDate(this.clock.now());
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const account = await this.lockAccount(connection, input.affiliateId);
      const idempotency = await this.claimIdempotency<AffiliateDsrResult>(
        connection,
        "privacy_dsr",
        input.requestId,
        {
          affiliateId: input.affiliateId,
          requestId: input.requestId,
          reason: input.reason,
          actorKind: input.actor.actorKind,
          actorReference: input.actor.actorReference,
        },
      );
      if (idempotency.outcome) {
        const replay = {
          ...idempotency.outcome,
          replayed: true,
        } as AffiliateDsrResult;
        await this.insertAudit(connection, {
          operation: "affiliate.request_privacy_data",
          stableId: input.requestId,
          actor: input.actor,
          affiliateId: input.affiliateId,
          decisionReference,
          idempotencyDigest: idempotency.semanticDigest,
          occurredAt: now,
          outcome: "replayed",
          reason: "privacy_dsr_replayed",
          beforeDigest: null,
          afterDigest: sha256(canonicalize(replay.inventory)),
        });
        await connection.commit();
        return replay;
      }

      await this.claimPrivacyRequest(connection, input, "dsr", now);
      const inventory = await this.readInventory(
        connection,
        input.affiliateId,
        account,
      );
      const result: AffiliateDsrResult = {
        requestId: input.requestId,
        affiliateId: input.affiliateId,
        status: "completed",
        replayed: false,
        inventory,
      };
      await this.completePrivacyRequest(connection, input.requestId, now);
      await this.storeIdempotencyOutcome(connection, idempotency.key, result);
      await this.insertAudit(connection, {
        operation: "affiliate.request_privacy_data",
        stableId: input.requestId,
        actor: input.actor,
        affiliateId: input.affiliateId,
        decisionReference,
        idempotencyDigest: idempotency.semanticDigest,
        occurredAt: now,
        outcome: "accepted",
        reason: "privacy_dsr_completed",
        beforeDigest: null,
        afterDigest: sha256(canonicalize(inventory)),
      });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async anonymizeAffiliateData(
    input: AffiliatePrivacyRequestInput,
  ): Promise<AffiliateAnonymizationResult> {
    this.validatePrivacyRequest(input);
    const decisionReference = await this.authorize(
      "affiliate.anonymize_privacy_data",
      input.actor,
      input.affiliateId,
      false,
    );
    const now = serverDate(this.clock.now());
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const account = await this.lockAccount(connection, input.affiliateId);
      const idempotency =
        await this.claimIdempotency<AffiliateAnonymizationResult>(
          connection,
          "privacy_anonymize",
          input.requestId,
          {
            affiliateId: input.affiliateId,
            requestId: input.requestId,
            reason: input.reason,
            actorKind: input.actor.actorKind,
            actorReference: input.actor.actorReference,
          },
        );
      if (idempotency.outcome) {
        const replay = {
          ...idempotency.outcome,
          replayed: true,
        } as AffiliateAnonymizationResult;
        await this.insertAudit(connection, {
          operation: "affiliate.anonymize_privacy_data",
          stableId: input.requestId,
          actor: input.actor,
          affiliateId: input.affiliateId,
          decisionReference,
          idempotencyDigest: idempotency.semanticDigest,
          occurredAt: now,
          outcome: "replayed",
          reason: "privacy_anonymization_replayed",
          beforeDigest: null,
          afterDigest: sha256(canonicalize(replay)),
        });
        await connection.commit();
        return replay;
      }

      await this.claimPrivacyRequest(connection, input, "anonymization", now);
      if (await this.hasActiveLegalHold(connection, input.affiliateId)) {
        const result: AffiliateAnonymizationResult = {
          requestId: input.requestId,
          affiliateId: input.affiliateId,
          status: "blocked_legal_hold",
          replayed: false,
          identityReferencesAnonymized: false,
          subjectsAnonymized: 0,
          commercialRecordsPreserved: await this.countCommercialRecords(
            connection,
            input.affiliateId,
          ),
        };
        await this.blockPrivacyRequest(connection, input.requestId, now);
        await this.storeIdempotencyOutcome(connection, idempotency.key, result);
        await this.insertAudit(connection, {
          operation: "affiliate.anonymize_privacy_data",
          stableId: input.requestId,
          actor: input.actor,
          affiliateId: input.affiliateId,
          decisionReference,
          idempotencyDigest: idempotency.semanticDigest,
          occurredAt: now,
          outcome: "rejected",
          reason: "privacy_anonymization_blocked_legal_hold",
          beforeDigest: sha256(canonicalize({ status: account.status })),
          afterDigest: null,
        });
        await connection.commit();
        return result;
      }

      const beforeDigest = sha256(
        canonicalize({
          status: account.status,
          identityReferenceState: account.identity_reference.startsWith(
            "anon:identity:",
          )
            ? "anonymized"
            : "linked",
        }),
      );
      const subjectsAnonymized = await this.anonymizeSubjects(
        connection,
        input.affiliateId,
      );
      const alreadyAnonymized =
        account.identity_reference.startsWith("anon:identity:") &&
        account.pseudonymous_reference.startsWith("anon:pseudo:");
      if (!alreadyAnonymized) {
        await connection.execute(
          `UPDATE affiliate_accounts
           SET identity_reference = ?, pseudonymous_reference = ?, status = 'inactive', updated_at = ?
           WHERE affiliate_id = ?`,
          [
            `anon:identity:${randomBytes(24).toString("hex")}`,
            `anon:pseudo:${randomBytes(24).toString("hex")}`,
            now,
            input.affiliateId,
          ],
        );
      }
      const commercialRecordsPreserved = await this.countCommercialRecords(
        connection,
        input.affiliateId,
      );
      const result: AffiliateAnonymizationResult = {
        requestId: input.requestId,
        affiliateId: input.affiliateId,
        status: "completed",
        replayed: false,
        identityReferencesAnonymized: true,
        subjectsAnonymized,
        commercialRecordsPreserved,
      };
      await this.completePrivacyRequest(connection, input.requestId, now);
      await this.storeIdempotencyOutcome(connection, idempotency.key, result);
      await this.insertAudit(connection, {
        operation: "affiliate.anonymize_privacy_data",
        stableId: input.requestId,
        actor: input.actor,
        affiliateId: input.affiliateId,
        decisionReference,
        idempotencyDigest: idempotency.semanticDigest,
        occurredAt: now,
        outcome: "accepted",
        reason: "privacy_anonymization_completed",
        beforeDigest,
        afterDigest: sha256(
          canonicalize({
            identityReferenceState: "anonymized",
            subjectsAnonymized,
            commercialRecordsPreserved,
          }),
        ),
      });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async runRetentionJob(
    input: AffiliatePrivacyRequestInput,
  ): Promise<AffiliateRetentionResult> {
    this.validatePrivacyRequest(input);
    const decisionReference = await this.authorize(
      "affiliate.execute_retention",
      input.actor,
      input.affiliateId,
      true,
    );
    const now = serverDate(this.clock.now());
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.lockAccount(connection, input.affiliateId);
      const idempotency = await this.claimIdempotency<AffiliateRetentionResult>(
        connection,
        "privacy_retention",
        input.requestId,
        {
          affiliateId: input.affiliateId,
          requestId: input.requestId,
          reason: input.reason,
          actorKind: input.actor.actorKind,
          actorReference: input.actor.actorReference,
          policyVersion: AFFILIATE_POLICY_V1.version,
        },
      );
      if (idempotency.outcome) {
        const replay = {
          ...idempotency.outcome,
          replayed: true,
        } as AffiliateRetentionResult;
        await this.insertAudit(connection, {
          operation: "affiliate.execute_retention",
          stableId: input.requestId,
          actor: input.actor,
          affiliateId: input.affiliateId,
          decisionReference,
          idempotencyDigest: idempotency.semanticDigest,
          occurredAt: now,
          outcome: "replayed",
          reason: "privacy_retention_replayed",
          beforeDigest: null,
          afterDigest: sha256(canonicalize(replay.stats)),
        });
        await connection.commit();
        return replay;
      }

      await this.claimPrivacyRequest(connection, input, "retention_purge", now);
      const emptyStats: AffiliateRetentionStats = {
        rawReferralEvidenceDeleted: 0,
        rawReferralEvidencePseudonymized: 0,
        attributionsDeleted: 0,
        attributionsPseudonymized: 0,
        commercialEvidencePreserved: 0,
      };
      if (await this.hasActiveLegalHold(connection, input.affiliateId)) {
        const result: AffiliateRetentionResult = {
          requestId: input.requestId,
          affiliateId: input.affiliateId,
          status: "blocked_legal_hold",
          replayed: false,
          policy: retentionPolicy(),
          stats: {
            ...emptyStats,
            commercialEvidencePreserved: await this.countCommercialRecords(
              connection,
              input.affiliateId,
            ),
          },
        };
        await this.blockPrivacyRequest(connection, input.requestId, now);
        await this.storeIdempotencyOutcome(connection, idempotency.key, result);
        await this.insertAudit(connection, {
          operation: "affiliate.execute_retention",
          stableId: input.requestId,
          actor: input.actor,
          affiliateId: input.affiliateId,
          decisionReference,
          idempotencyDigest: idempotency.semanticDigest,
          occurredAt: now,
          outcome: "rejected",
          reason: "privacy_retention_blocked_legal_hold",
          beforeDigest: null,
          afterDigest: sha256(canonicalize(result.stats)),
        });
        await connection.commit();
        return result;
      }

      const stats = await this.executeRetention(
        connection,
        input.affiliateId,
        now,
      );
      const result: AffiliateRetentionResult = {
        requestId: input.requestId,
        affiliateId: input.affiliateId,
        status: "completed",
        replayed: false,
        policy: retentionPolicy(),
        stats,
      };
      await this.completePrivacyRequest(connection, input.requestId, now);
      await this.storeIdempotencyOutcome(connection, idempotency.key, result);
      await this.insertAudit(connection, {
        operation: "affiliate.execute_retention",
        stableId: input.requestId,
        actor: input.actor,
        affiliateId: input.affiliateId,
        decisionReference,
        idempotencyDigest: idempotency.semanticDigest,
        occurredAt: now,
        outcome: "accepted",
        reason: "privacy_retention_completed",
        beforeDigest: null,
        afterDigest: sha256(canonicalize(stats)),
      });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async applyLegalHold(
    input: AffiliateLegalHoldInput,
  ): Promise<AffiliateLegalHoldResult> {
    assertIdentifier(input.holdId, "AFFILIATE_LEGAL_HOLD_ID_INVALID");
    assertIdentifier(
      input.affiliateId,
      "AFFILIATE_PRIVACY_AFFILIATE_ID_INVALID",
    );
    assertReason(input.reason);
    assertActor(input.actor);
    const decisionReference = await this.authorize(
      "affiliate.manage_legal_hold",
      input.actor,
      input.affiliateId,
      true,
    );
    const now = serverDate(this.clock.now());
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.lockAccount(connection, input.affiliateId);
      const idempotency = await this.claimIdempotency<AffiliateLegalHoldResult>(
        connection,
        "privacy_hold_apply",
        input.holdId,
        {
          holdId: input.holdId,
          affiliateId: input.affiliateId,
          reason: input.reason,
          actorKind: input.actor.actorKind,
          actorReference: input.actor.actorReference,
        },
      );
      if (idempotency.outcome) {
        const replay = {
          ...idempotency.outcome,
          replayed: true,
        } as AffiliateLegalHoldResult;
        await this.insertAudit(connection, {
          operation: "affiliate.manage_legal_hold.apply",
          stableId: input.holdId,
          actor: input.actor,
          affiliateId: input.affiliateId,
          decisionReference,
          idempotencyDigest: idempotency.semanticDigest,
          occurredAt: now,
          outcome: "replayed",
          reason: "legal_hold_apply_replayed",
          beforeDigest: null,
          afterDigest: sha256(canonicalize({ active: true })),
        });
        await connection.commit();
        return replay;
      }

      const existing = await this.findLegalHold(connection, input.holdId);
      if (existing) {
        if (
          existing.affiliate_id !== input.affiliateId ||
          existing.reason !== input.reason ||
          existing.created_by !== input.actor.actorReference
        ) {
          throw new Error("AFFILIATE_LEGAL_HOLD_CONFLICT");
        }
      } else {
        await connection.execute(
          `INSERT INTO affiliate_legal_holds
           (hold_id, affiliate_id, reason, active, created_by, created_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [
            input.holdId,
            input.affiliateId,
            input.reason,
            input.actor.actorReference,
            now,
          ],
        );
      }
      const result: AffiliateLegalHoldResult = {
        holdId: input.holdId,
        affiliateId: input.affiliateId,
        active: true,
        replayed: false,
      };
      await this.storeIdempotencyOutcome(connection, idempotency.key, result);
      await this.insertAudit(connection, {
        operation: "affiliate.manage_legal_hold.apply",
        stableId: input.holdId,
        actor: input.actor,
        affiliateId: input.affiliateId,
        decisionReference,
        idempotencyDigest: idempotency.semanticDigest,
        occurredAt: now,
        outcome: "accepted",
        reason: "legal_hold_applied",
        beforeDigest: sha256(canonicalize({ active: false })),
        afterDigest: sha256(canonicalize({ active: true })),
      });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async releaseLegalHold(
    input: AffiliateLegalHoldReleaseInput,
  ): Promise<AffiliateLegalHoldResult> {
    assertIdentifier(input.holdId, "AFFILIATE_LEGAL_HOLD_ID_INVALID");
    assertIdentifier(
      input.affiliateId,
      "AFFILIATE_PRIVACY_AFFILIATE_ID_INVALID",
    );
    assertActor(input.actor);
    const decisionReference = await this.authorize(
      "affiliate.manage_legal_hold",
      input.actor,
      input.affiliateId,
      true,
    );
    const now = serverDate(this.clock.now());
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.lockAccount(connection, input.affiliateId);
      const idempotency = await this.claimIdempotency<AffiliateLegalHoldResult>(
        connection,
        "privacy_hold_release",
        input.holdId,
        {
          holdId: input.holdId,
          affiliateId: input.affiliateId,
          actorKind: input.actor.actorKind,
          actorReference: input.actor.actorReference,
        },
      );
      if (idempotency.outcome) {
        const replay = {
          ...idempotency.outcome,
          replayed: true,
        } as AffiliateLegalHoldResult;
        await this.insertAudit(connection, {
          operation: "affiliate.manage_legal_hold.release",
          stableId: input.holdId,
          actor: input.actor,
          affiliateId: input.affiliateId,
          decisionReference,
          idempotencyDigest: idempotency.semanticDigest,
          occurredAt: now,
          outcome: "replayed",
          reason: "legal_hold_release_replayed",
          beforeDigest: null,
          afterDigest: sha256(canonicalize({ active: false })),
        });
        await connection.commit();
        return replay;
      }

      const hold = await this.findLegalHold(connection, input.holdId);
      if (!hold || hold.affiliate_id !== input.affiliateId) {
        throw new Error("AFFILIATE_LEGAL_HOLD_NOT_FOUND");
      }
      if (hold.active === 1) {
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE affiliate_legal_holds
           SET active = 0, released_at = ?, released_by = ?
           WHERE hold_id = ? AND affiliate_id = ? AND active = 1`,
          [now, input.actor.actorReference, input.holdId, input.affiliateId],
        );
        if (result.affectedRows !== 1) {
          throw new Error("AFFILIATE_LEGAL_HOLD_RELEASE_CONFLICT");
        }
      }
      const outcome: AffiliateLegalHoldResult = {
        holdId: input.holdId,
        affiliateId: input.affiliateId,
        active: false,
        replayed: false,
      };
      await this.storeIdempotencyOutcome(connection, idempotency.key, outcome);
      await this.insertAudit(connection, {
        operation: "affiliate.manage_legal_hold.release",
        stableId: input.holdId,
        actor: input.actor,
        affiliateId: input.affiliateId,
        decisionReference,
        idempotencyDigest: idempotency.semanticDigest,
        occurredAt: now,
        outcome: "accepted",
        reason: "legal_hold_released",
        beforeDigest: sha256(canonicalize({ active: true })),
        afterDigest: sha256(canonicalize({ active: false })),
      });
      await connection.commit();
      return outcome;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private validatePrivacyRequest(input: AffiliatePrivacyRequestInput): void {
    assertIdentifier(input.requestId, "AFFILIATE_PRIVACY_REQUEST_ID_INVALID");
    assertIdentifier(
      input.affiliateId,
      "AFFILIATE_PRIVACY_AFFILIATE_ID_INVALID",
    );
    assertReason(input.reason);
    assertActor(input.actor);
  }

  private async authorize(
    action: AffiliateAuthorizationAction,
    actor: AffiliatePrivacyActor,
    targetAffiliateId: string,
    adminOnly: boolean,
  ): Promise<string> {
    if (actor.actorKind === "public") {
      throw new Error("AFFILIATE_PRIVACY_AUTHORIZATION_DENIED");
    }
    if (actor.actorKind === "affiliate") {
      if (!actor.affiliateId || actor.affiliateId !== targetAffiliateId) {
        throw new Error("AFFILIATE_PRIVACY_SCOPE_DENIED");
      }
      if (adminOnly) {
        throw new Error("AFFILIATE_PRIVACY_AUTHORIZATION_DENIED");
      }
    }
    const context: AffiliateAuthorizationContext = {
      actorKind: actor.actorKind,
      actorReference: actor.actorReference,
      affiliateId: targetAffiliateId as AffiliateId,
      correlationId: actor.correlationId,
    };
    const decision = await this.authorization.authorize(action, context);
    if (!decision.allowed) {
      throw new Error("AFFILIATE_PRIVACY_AUTHORIZATION_DENIED");
    }
    return decision.decisionReference;
  }

  private async lockAccount(
    connection: PoolConnection,
    affiliateId: string,
  ): Promise<AccountRow> {
    const [rows] = await connection.execute<AccountRow[]>(
      `SELECT affiliate_id, identity_reference, pseudonymous_reference, status
       FROM affiliate_accounts WHERE affiliate_id = ? LIMIT 1 FOR UPDATE`,
      [affiliateId],
    );
    const row = rows[0];
    if (!row) throw new Error("AFFILIATE_PRIVACY_AFFILIATE_NOT_FOUND");
    return row;
  }

  private async claimPrivacyRequest(
    connection: PoolConnection,
    input: AffiliatePrivacyRequestInput,
    kind: PrivacyRequestKind,
    now: Date,
  ): Promise<PrivacyRequestClaim> {
    const [rows] = await connection.execute<PrivacyRequestRow[]>(
      `SELECT * FROM affiliate_privacy_requests
       WHERE request_id = ? LIMIT 1 FOR UPDATE`,
      [input.requestId],
    );
    const existing = rows[0];
    if (existing) {
      if (
        existing.affiliate_id !== input.affiliateId ||
        existing.request_kind !== kind ||
        existing.requested_by !== input.actor.actorReference ||
        existing.reason !== input.reason
      ) {
        throw new Error("AFFILIATE_PRIVACY_REQUEST_CONFLICT");
      }
      return { replayed: true, status: existing.status };
    }
    await connection.execute(
      `INSERT INTO affiliate_privacy_requests
       (request_id, affiliate_id, request_kind, status, requested_by, reason, requested_at)
       VALUES (?, ?, ?, 'requested', ?, ?, ?)`,
      [
        input.requestId,
        input.affiliateId,
        kind,
        input.actor.actorReference,
        input.reason,
        now,
      ],
    );
    return { replayed: false, status: "requested" };
  }

  private async completePrivacyRequest(
    connection: PoolConnection,
    requestId: string,
    now: Date,
  ): Promise<void> {
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE affiliate_privacy_requests
       SET status = 'completed', completed_at = ?
       WHERE request_id = ? AND status = 'requested'`,
      [now, requestId],
    );
    if (result.affectedRows !== 1) {
      throw new Error("AFFILIATE_PRIVACY_REQUEST_COMPLETION_CONFLICT");
    }
  }

  private async blockPrivacyRequest(
    connection: PoolConnection,
    requestId: string,
    now: Date,
  ): Promise<void> {
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE affiliate_privacy_requests
       SET status = 'blocked_legal_hold', completed_at = ?
       WHERE request_id = ? AND status = 'requested'`,
      [now, requestId],
    );
    if (result.affectedRows !== 1) {
      throw new Error("AFFILIATE_PRIVACY_REQUEST_BLOCK_CONFLICT");
    }
  }

  private async readInventory(
    connection: PoolConnection,
    affiliateId: string,
    account: AccountRow,
  ): Promise<AffiliatePrivacyInventory> {
    const [rows] = await connection.execute<InventoryRow[]>(
      `SELECT
        (SELECT COUNT(*) FROM affiliate_accounts WHERE affiliate_id = ?) AS accounts,
        (SELECT COUNT(*) FROM affiliate_memberships WHERE affiliate_id = ?) AS memberships,
        (SELECT COUNT(*) FROM affiliate_referral_evidence WHERE affiliate_id = ?) AS referral_evidence,
        (SELECT COUNT(*) FROM affiliate_attributions WHERE affiliate_id = ?) AS attributions,
        (SELECT COUNT(*) FROM affiliate_conversions WHERE affiliate_id = ?) AS conversions,
        (SELECT COUNT(*) FROM affiliate_entitlements WHERE affiliate_id = ?) AS entitlements,
        (SELECT COUNT(*) FROM affiliate_materialization_requests WHERE affiliate_id = ?) AS materialization_requests,
        (SELECT COUNT(*) FROM affiliate_privacy_requests WHERE affiliate_id = ?) AS privacy_requests,
        (SELECT COUNT(*) FROM affiliate_legal_holds WHERE affiliate_id = ? AND active = 1) AS active_legal_holds`,
      [
        affiliateId,
        affiliateId,
        affiliateId,
        affiliateId,
        affiliateId,
        affiliateId,
        affiliateId,
        affiliateId,
        affiliateId,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("AFFILIATE_PRIVACY_INVENTORY_MISSING");
    return {
      affiliateId,
      identityReferenceState: account.identity_reference.startsWith(
        "anon:identity:",
      )
        ? "anonymized"
        : "linked",
      accounts: numberValue(row.accounts),
      memberships: numberValue(row.memberships),
      referralEvidence: numberValue(row.referral_evidence),
      attributions: numberValue(row.attributions),
      conversions: numberValue(row.conversions),
      entitlements: numberValue(row.entitlements),
      materializationRequests: numberValue(row.materialization_requests),
      privacyRequests: numberValue(row.privacy_requests),
      activeLegalHolds: numberValue(row.active_legal_holds),
    };
  }

  private async hasActiveLegalHold(
    connection: PoolConnection,
    affiliateId: string,
  ): Promise<boolean> {
    const [rows] = await connection.execute<CountRow[]>(
      `SELECT COUNT(*) AS count_value FROM affiliate_legal_holds
       WHERE affiliate_id = ? AND active = 1`,
      [affiliateId],
    );
    return numberValue(rows[0]?.count_value ?? 0) > 0;
  }

  private async findLegalHold(
    connection: PoolConnection,
    holdId: string,
  ): Promise<LegalHoldRow | null> {
    const [rows] = await connection.execute<LegalHoldRow[]>(
      `SELECT * FROM affiliate_legal_holds
       WHERE hold_id = ? LIMIT 1 FOR UPDATE`,
      [holdId],
    );
    return rows[0] ?? null;
  }

  private async anonymizeSubjects(
    connection: PoolConnection,
    affiliateId: string,
  ): Promise<number> {
    const [rows] = await connection.execute<SubjectRow[]>(
      `SELECT subject_id FROM affiliate_referral_evidence WHERE affiliate_id = ?
       UNION
       SELECT subject_id FROM affiliate_attributions WHERE affiliate_id = ?`,
      [affiliateId, affiliateId],
    );
    const salt = randomBytes(32).toString("hex");
    let changed = 0;
    for (const row of rows) {
      if (isPseudonymizedSubject(row.subject_id)) continue;
      const replacement = `anon:subject:${sha256(`${salt}:${row.subject_id}`).slice(0, 48)}`;
      const [evidenceResult] = await connection.execute<ResultSetHeader>(
        `UPDATE affiliate_referral_evidence SET subject_id = ?
         WHERE affiliate_id = ? AND subject_id = ?`,
        [replacement, affiliateId, row.subject_id],
      );
      const [attributionResult] = await connection.execute<ResultSetHeader>(
        `UPDATE affiliate_attributions SET subject_id = ?
         WHERE affiliate_id = ? AND subject_id = ?`,
        [replacement, affiliateId, row.subject_id],
      );
      if (evidenceResult.affectedRows + attributionResult.affectedRows > 0)
        changed += 1;
    }
    return changed;
  }

  private async executeRetention(
    connection: PoolConnection,
    affiliateId: string,
    now: Date,
  ): Promise<AffiliateRetentionStats> {
    const rawCutoff = subtractUtcDays(
      now,
      AFFILIATE_POLICY_V1.retention.rawReferralEvidenceDays,
    );
    const attributionCutoff = subtractUtcMonths(
      now,
      AFFILIATE_POLICY_V1.retention.pseudonymousAttributionMonths,
    );
    const commercialCutoff = subtractUtcYears(
      now,
      AFFILIATE_POLICY_V1.retention.commercialEvidenceYears,
    );

    let attributionsDeleted = 0;
    let attributionsPseudonymized = 0;
    const [attributions] = await connection.execute<RetentionAttributionRow[]>(
      `SELECT attribution_id, subject_id, order_id, established_at
       FROM affiliate_attributions
       WHERE affiliate_id = ? AND established_at < ?
       ORDER BY established_at ASC FOR UPDATE`,
      [affiliateId, attributionCutoff],
    );
    for (const attribution of attributions) {
      const lastActivity = await this.lastRelevantAttributionActivity(
        connection,
        attribution.attribution_id,
      );
      if (
        !lastActivity ||
        lastActivity.getTime() >= attributionCutoff.getTime()
      )
        continue;
      const hasCommercial =
        (await this.countConversionsForAttribution(
          connection,
          attribution.attribution_id,
        )) > 0 || attribution.order_id !== null;
      if (!hasCommercial) {
        const [result] = await connection.execute<ResultSetHeader>(
          `DELETE FROM affiliate_attributions
           WHERE attribution_id = ? AND affiliate_id = ?`,
          [attribution.attribution_id, affiliateId],
        );
        attributionsDeleted += result.affectedRows;
      } else if (!isPseudonymizedSubject(attribution.subject_id)) {
        const replacement = `ret24:subject:${sha256(attribution.attribution_id).slice(0, 48)}`;
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE affiliate_attributions SET subject_id = ?
           WHERE attribution_id = ? AND affiliate_id = ?`,
          [replacement, attribution.attribution_id, affiliateId],
        );
        attributionsPseudonymized += result.affectedRows;
      }
    }

    let rawReferralEvidenceDeleted = 0;
    let rawReferralEvidencePseudonymized = 0;
    const [referrals] = await connection.execute<RetentionReferralRow[]>(
      `SELECT evidence_id, subject_id FROM affiliate_referral_evidence
       WHERE affiliate_id = ? AND received_at < ?
       ORDER BY received_at ASC FOR UPDATE`,
      [affiliateId, rawCutoff],
    );
    for (const referral of referrals) {
      const [referenceRows] = await connection.execute<CountRow[]>(
        `SELECT COUNT(*) AS count_value FROM affiliate_attributions
         WHERE evidence_id = ?`,
        [referral.evidence_id],
      );
      if (numberValue(referenceRows[0]?.count_value ?? 0) === 0) {
        const [result] = await connection.execute<ResultSetHeader>(
          `DELETE FROM affiliate_referral_evidence
           WHERE evidence_id = ? AND affiliate_id = ?`,
          [referral.evidence_id, affiliateId],
        );
        rawReferralEvidenceDeleted += result.affectedRows;
      } else if (!isPseudonymizedSubject(referral.subject_id)) {
        const replacement = `ret90:subject:${sha256(referral.evidence_id).slice(0, 48)}`;
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE affiliate_referral_evidence SET subject_id = ?
           WHERE evidence_id = ? AND affiliate_id = ?`,
          [replacement, referral.evidence_id, affiliateId],
        );
        rawReferralEvidencePseudonymized += result.affectedRows;
      }
    }

    const [commercialRows] = await connection.execute<CountRow[]>(
      `SELECT COUNT(*) AS count_value FROM affiliate_entitlements
       WHERE affiliate_id = ? AND updated_at < ?`,
      [affiliateId, commercialCutoff],
    );
    const commercialEvidencePreserved = numberValue(
      commercialRows[0]?.count_value ?? 0,
    );

    return {
      rawReferralEvidenceDeleted,
      rawReferralEvidencePseudonymized,
      attributionsDeleted,
      attributionsPseudonymized,
      commercialEvidencePreserved,
    };
  }

  private async lastRelevantAttributionActivity(
    connection: PoolConnection,
    attributionId: string,
  ): Promise<Date | null> {
    const [rows] = await connection.execute<ActivityRow[]>(
      `SELECT MAX(activity_at) AS last_activity FROM (
         SELECT established_at AS activity_at
           FROM affiliate_attributions WHERE attribution_id = ?
         UNION ALL
         SELECT created_at AS activity_at
           FROM affiliate_conversions WHERE attribution_id = ?
         UNION ALL
         SELECT updated_at AS activity_at
           FROM affiliate_entitlements WHERE attribution_id = ?
         UNION ALL
         SELECT m.updated_at AS activity_at
           FROM affiliate_materialization_requests m
           INNER JOIN affiliate_conversions c ON c.conversion_id = m.conversion_id
           WHERE c.attribution_id = ?
       ) AS affiliate_activity`,
      [attributionId, attributionId, attributionId, attributionId],
    );
    return rows[0]?.last_activity ?? null;
  }

  private async countConversionsForAttribution(
    connection: PoolConnection,
    attributionId: string,
  ): Promise<number> {
    const [rows] = await connection.execute<CountRow[]>(
      `SELECT COUNT(*) AS count_value FROM affiliate_conversions
       WHERE attribution_id = ?`,
      [attributionId],
    );
    return numberValue(rows[0]?.count_value ?? 0);
  }

  private async countCommercialRecords(
    connection: PoolConnection,
    affiliateId: string,
  ): Promise<number> {
    const [rows] = await connection.execute<CountRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM affiliate_conversions WHERE affiliate_id = ?) +
         (SELECT COUNT(*) FROM affiliate_entitlements WHERE affiliate_id = ?) +
         (SELECT COUNT(*) FROM affiliate_materialization_requests WHERE affiliate_id = ?)
         AS count_value`,
      [affiliateId, affiliateId, affiliateId],
    );
    return numberValue(rows[0]?.count_value ?? 0);
  }

  private async claimIdempotency<T>(
    connection: PoolConnection,
    operation: string,
    stableId: string,
    immutableInputs: Readonly<Record<string, unknown>>,
  ): Promise<IdempotencyClaim<T>> {
    const key = `affiliate:v1:${operation}:${sha256(stableId)}`;
    const semanticDigest = sha256(canonicalize(immutableInputs));
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT IGNORE INTO affiliate_idempotency_claims
       (idempotency_key, semantic_digest, outcome_json, created_at)
       VALUES (?, UNHEX(?), NULL, UTC_TIMESTAMP(3))`,
      [key, semanticDigest],
    );
    if (result.affectedRows === 1) {
      return { key, semanticDigest, replayed: false, outcome: null };
    }
    const [rows] = await connection.execute<IdempotencyRow[]>(
      `SELECT semantic_digest, outcome_json FROM affiliate_idempotency_claims
       WHERE idempotency_key = ? LIMIT 1 FOR UPDATE`,
      [key],
    );
    const row = rows[0];
    if (!row) throw new Error("AFFILIATE_PRIVACY_IDEMPOTENCY_MISSING");
    if (row.semantic_digest.toString("hex") !== semanticDigest) {
      throw new Error("AFFILIATE_PRIVACY_IDEMPOTENCY_CONFLICT");
    }
    if (row.outcome_json === null) {
      throw new Error("AFFILIATE_PRIVACY_IDEMPOTENCY_OUTCOME_MISSING");
    }
    return {
      key,
      semanticDigest,
      replayed: true,
      outcome: parseOutcome<T>(row.outcome_json),
    };
  }

  private async storeIdempotencyOutcome(
    connection: PoolConnection,
    key: string,
    outcome: Readonly<Record<string, unknown>> | object,
  ): Promise<void> {
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE affiliate_idempotency_claims SET outcome_json = ?
       WHERE idempotency_key = ? AND outcome_json IS NULL`,
      [JSON.stringify(outcome), key],
    );
    if (result.affectedRows !== 1) {
      throw new Error("AFFILIATE_PRIVACY_IDEMPOTENCY_OUTCOME_CONFLICT");
    }
  }

  private async insertAudit(
    connection: PoolConnection,
    input: Readonly<{
      operation: string;
      stableId: string;
      actor: AffiliatePrivacyActor;
      affiliateId: string;
      decisionReference: string;
      idempotencyDigest: string;
      occurredAt: Date;
      outcome: "accepted" | "rejected" | "replayed";
      reason: string;
      beforeDigest: string | null;
      afterDigest: string | null;
    }>,
  ): Promise<void> {
    const auditId = `audit-privacy-${sha256(
      `${input.operation}:${input.stableId}:${input.outcome}`,
    ).slice(0, 64)}`;
    await connection.execute(
      `INSERT IGNORE INTO affiliate_audit_events
       (audit_id, operation, contract_version, actor_kind, actor_reference,
        authorization_decision_reference, affiliate_id, subject_reference, policy_version,
        before_digest, after_digest, idempotency_digest, correlation_id, causation_id,
        occurred_at, outcome, reason)
       VALUES (?, ?, 1, ?, ?, ?, ?, NULL, ?, UNHEX(?), UNHEX(?), UNHEX(?), ?, NULL, ?, ?, ?)`,
      [
        auditId,
        input.operation,
        input.actor.actorKind,
        input.actor.actorReference,
        input.decisionReference,
        input.affiliateId,
        AFFILIATE_POLICY_V1.version,
        input.beforeDigest,
        input.afterDigest,
        input.idempotencyDigest,
        input.actor.correlationId,
        input.occurredAt,
        input.outcome,
        input.reason,
      ],
    );
  }
}
