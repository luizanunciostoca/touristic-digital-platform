import {
  chooseAttribution,
  createAttribution,
  createReferralEvidence,
  createAffiliateIdempotencyKey,
  type AffiliateAuthorizationPort,
  type AffiliateDigestPort,
  type Attribution,
  type ReferralEvidence,
} from "@touristic/affiliates";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { lockAndAssertAffiliateAttributionEligibility } from "./affiliate-eligibility-gate.js";

export interface AffiliateReferralMutationInput {
  readonly evidenceId: string;
  readonly attributionId: string;
  readonly affiliateId: string;
  readonly programId: string;
  readonly destinationId?: string;
  readonly subjectId: string;
  readonly source:
    "platform_link" | "platform_qr" | "checkout_code" | "server_referral";
  readonly evidenceFingerprint: string;
  readonly serverObservedAt: string;
  readonly receivedAt: string;
  readonly actorReference: string;
  readonly correlationId: string;
}

export interface AffiliateReferralMutationResult {
  readonly attribution: Attribution;
  readonly replayed: boolean;
  readonly idempotencyKey: string;
}

interface AttributionRow extends RowDataPacket {
  attribution_id: string;
  affiliate_id: string;
  program_id: string;
  subject_id: string;
  evidence_id: string;
  evidence_fingerprint: Buffer;
  source: Attribution["source"];
  established_at: Date;
  expires_at: Date;
  policy_version: string;
  order_id: string | null;
  order_locked_at: Date | null;
}

function date(value: string): Date {
  return new Date(value);
}

function attributionFromRow(row: AttributionRow): Attribution {
  return {
    id: row.attribution_id as Attribution["id"],
    affiliateId: row.affiliate_id as Attribution["affiliateId"],
    programId: row.program_id as Attribution["programId"],
    subjectId: row.subject_id as Attribution["subjectId"],
    evidenceId: row.evidence_id as Attribution["evidenceId"],
    evidenceFingerprint: row.evidence_fingerprint.toString("hex"),
    source: row.source,
    establishedAt: row.established_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    policyVersion: row.policy_version as Attribution["policyVersion"],
  };
}

export class AffiliateApplicationService {
  public constructor(
    private readonly pool: Pool,
    private readonly authorization: AffiliateAuthorizationPort,
    private readonly digest: AffiliateDigestPort,
  ) {}

  public async recordReferralAndEstablishAttribution(
    input: AffiliateReferralMutationInput,
  ): Promise<AffiliateReferralMutationResult> {
    if (!input.destinationId) {
      throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
    }
    const authorized = await this.authorization.authorize(
      "affiliate.establish_attribution",
      {
        actorKind: "service",
        actorReference: input.actorReference,
        affiliateId: input.affiliateId as never,
        programId: input.programId as never,
        correlationId: input.correlationId,
      },
    );
    if (!authorized.allowed) {
      throw new Error("AFFILIATE_AUTHORIZATION_DENIED");
    }
    if (!authorized.decisionReference) {
      throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
    }

    const evidence = createReferralEvidence({
      id: input.evidenceId as never,
      affiliateId: input.affiliateId as never,
      programId: input.programId as never,
      subjectId: input.subjectId as never,
      source: input.source,
      evidenceFingerprint: input.evidenceFingerprint,
      serverObservedAt: input.serverObservedAt,
      receivedAt: input.receivedAt,
      validatedByServer: true,
    });
    if (!evidence) {
      throw new Error("AFFILIATE_REFERRAL_EVIDENCE_INVALID");
    }
    const idempotencyKey = await createAffiliateIdempotencyKey(
      "establish_attribution",
      {
        affiliateId: input.affiliateId,
        programId: input.programId,
        destinationId: input.destinationId,
        subjectId: input.subjectId,
        evidenceFingerprint: input.evidenceFingerprint,
      },
      this.digest,
    );
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const replay = await this.claim(
        connection,
        idempotencyKey,
        input.evidenceFingerprint,
      );
      if (replay) {
        const existing = await this.lockSubject(connection, input.subjectId);
        if (!existing) {
          throw new Error("AFFILIATE_IDEMPOTENCY_RESULT_MISSING");
        }
        await connection.commit();
        return {
          attribution: attributionFromRow(existing),
          replayed: true,
          idempotencyKey,
        };
      }
      await lockAndAssertAffiliateAttributionEligibility(
        connection,
        input.affiliateId,
        input.programId,
        input.destinationId,
      );
      await this.insertEvidence(connection, evidence);
      const existing = await this.lockSubject(connection, input.subjectId);
      const candidate = createAttribution(
        input.attributionId as never,
        evidence,
        input.serverObservedAt,
      );
      if (!candidate) {
        throw new Error("AFFILIATE_ATTRIBUTION_INVALID");
      }
      const selected = chooseAttribution(
        existing ? attributionFromRow(existing) : null,
        candidate,
        existing?.order_id ? "locked" : "open",
        input.serverObservedAt,
      );
      if (!selected) {
        throw new Error("AFFILIATE_ATTRIBUTION_NOT_SELECTED");
      }
      if (!existing || selected.id !== existing.attribution_id) {
        await this.insertAttribution(connection, selected);
        await this.insertOutbox(connection, selected);
      }
      await this.insertAudit(
        connection,
        input,
        idempotencyKey,
        selected,
        authorized.decisionReference,
      );
      await connection.commit();
      return { attribution: selected, replayed: false, idempotencyKey };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async lockAttributionToOrder(
    subjectId: string,
    orderId: string,
    occurredAt: string,
  ): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE affiliate_attributions SET order_id = ?, order_locked_at = ?
         WHERE subject_id = ? AND order_id IS NULL AND expires_at > ?`,
        [orderId, date(occurredAt), subjectId, date(occurredAt)],
      );
      if (result.affectedRows !== 1) {
        throw new Error("AFFILIATE_ORDER_ATTRIBUTION_LOCK_CONFLICT");
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async claim(
    connection: PoolConnection,
    key: string,
    semanticDigest: string,
  ): Promise<boolean> {
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT IGNORE INTO affiliate_idempotency_claims (idempotency_key, semantic_digest, created_at) VALUES (?, UNHEX(?), UTC_TIMESTAMP(3))",
      [key, semanticDigest],
    );
    if (result.affectedRows === 1) return false;
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT HEX(semantic_digest) AS semantic_digest FROM affiliate_idempotency_claims WHERE idempotency_key = ? FOR UPDATE",
      [key],
    );
    const storedDigest: unknown = rows[0]?.semantic_digest;
    if (
      typeof storedDigest !== "string" ||
      storedDigest.toLowerCase() !== semanticDigest.toLowerCase()
    ) {
      throw new Error("AFFILIATE_IDEMPOTENCY_CONFLICT");
    }
    return true;
  }

  private async lockSubject(
    connection: PoolConnection,
    subjectId: string,
  ): Promise<AttributionRow | null> {
    const [rows] = await connection.execute<AttributionRow[]>(
      "SELECT * FROM affiliate_attributions WHERE subject_id = ? ORDER BY established_at DESC LIMIT 1 FOR UPDATE",
      [subjectId],
    );
    return rows[0] ?? null;
  }

  private async insertEvidence(
    connection: PoolConnection,
    evidence: ReferralEvidence,
  ): Promise<void> {
    await connection.execute(
      `INSERT IGNORE INTO affiliate_referral_evidence
       (evidence_id, affiliate_id, program_id, subject_id, source, evidence_fingerprint,
        server_observed_at, received_at, policy_version, created_at)
       VALUES (?, ?, ?, ?, ?, UNHEX(?), ?, ?, ?, ?)`,
      [
        evidence.id,
        evidence.affiliateId,
        evidence.programId,
        evidence.subjectId,
        evidence.source,
        evidence.evidenceFingerprint,
        date(evidence.serverObservedAt),
        date(evidence.receivedAt),
        evidence.policyVersion,
        date(evidence.receivedAt),
      ],
    );
  }

  private async insertAttribution(
    connection: PoolConnection,
    attribution: Attribution,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO affiliate_attributions
       (attribution_id, affiliate_id, program_id, subject_id, evidence_id, evidence_fingerprint,
        source, established_at, expires_at, policy_version, created_at)
       VALUES (?, ?, ?, ?, ?, UNHEX(?), ?, ?, ?, ?, ?)`,
      [
        attribution.id,
        attribution.affiliateId,
        attribution.programId,
        attribution.subjectId,
        attribution.evidenceId,
        attribution.evidenceFingerprint,
        attribution.source,
        date(attribution.establishedAt),
        date(attribution.expiresAt),
        attribution.policyVersion,
        date(attribution.establishedAt),
      ],
    );
  }

  private async insertOutbox(
    connection: PoolConnection,
    attribution: Attribution,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO affiliate_outbox_events
       (event_id, event_type, aggregate_type, aggregate_id, contract_version, payload_json,
        status, attempts, available_at, created_at)
       VALUES (?, 'AffiliateAttributionEstablished', 'attribution', ?, 1, ?, 'pending', 0, ?, ?)`,
      [
        `affiliate-attribution-${attribution.id}`,
        attribution.id,
        JSON.stringify(attribution),
        date(attribution.establishedAt),
        date(attribution.establishedAt),
      ],
    );
  }

  private async insertAudit(
    connection: PoolConnection,
    input: AffiliateReferralMutationInput,
    key: string,
    attribution: Attribution,
    decisionReference: string,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO affiliate_audit_events
       (audit_id, operation, contract_version, actor_kind, actor_reference,
        authorization_decision_reference, affiliate_id, subject_reference, policy_version,
        idempotency_digest, correlation_id, occurred_at, outcome, reason)
       VALUES (?, 'affiliate.establish_attribution', 1, 'service', ?, ?, ?, ?, ?, UNHEX(?), ?, ?, 'accepted', 'attribution_established')`,
      [
        `audit-${key.slice(-48)}`,
        input.actorReference,
        decisionReference,
        input.affiliateId,
        input.subjectId,
        attribution.policyVersion,
        input.evidenceFingerprint,
        input.correlationId,
        date(input.serverObservedAt),
      ],
    );
  }
}
