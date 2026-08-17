import type {
  AffiliateAuditEntry,
  AffiliateAuditPort,
  AffiliateIdempotencyClaim,
  AffiliateIdempotencyPort,
  Attribution,
  AttributionRepositoryPort,
  CommissionEntitlement,
  CommissionEntitlementRepositoryPort,
  ConversionAssociation,
  ConversionAssociationRepositoryPort,
  ReferralEvidence,
  ReferralEvidenceRepositoryPort,
} from "@touristic/affiliates";
import type {
  CommissionEntitlementId,
  ConversionAssociationId,
} from "@touristic/affiliates";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { affiliatesM154SchemaSql } from "./schema.js";

interface ReferralRow extends RowDataPacket {
  evidence_id: string;
  affiliate_id: string;
  program_id: string;
  subject_id: string;
  source: ReferralEvidence["source"];
  evidence_fingerprint: Buffer;
  server_observed_at: Date;
  received_at: Date;
  policy_version: string;
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
}

interface ConversionRow extends RowDataPacket {
  conversion_id: string;
  attribution_id: string;
  affiliate_id: string;
  program_id: string;
  order_id: string;
  payment_reference: string;
  financial_evidence_digest: Buffer;
  eligible_revenue_minor: number | string;
  currency: string;
  payment_confirmed_at: Date;
  service_occurred_at: Date | null;
  conversion_kind: ConversionAssociation["conversionKind"];
  policy_version: string;
  created_at: Date;
}

interface EntitlementRow extends RowDataPacket {
  entitlement_id: string;
  conversion_id: string;
  affiliate_id: string;
  program_id: string;
  attribution_id: string;
  revision: number;
  status: CommissionEntitlement["status"];
  disputed_from: CommissionEntitlement["disputedFrom"];
  eligible_revenue_minor: number | string;
  commission_minor: number | string;
  currency: string;
  rate_basis_points: number;
  policy_version: string;
  maturity_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface ClaimRow extends RowDataPacket {
  semantic_digest: Buffer;
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function hex(value: Buffer | string): string {
  return Buffer.isBuffer(value) ? value.toString("hex") : value;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function referralFromRow(row: ReferralRow): ReferralEvidence {
  return {
    id: row.evidence_id as ReferralEvidence["id"],
    affiliateId: row.affiliate_id as ReferralEvidence["affiliateId"],
    programId: row.program_id as ReferralEvidence["programId"],
    subjectId: row.subject_id as ReferralEvidence["subjectId"],
    source: row.source,
    evidenceFingerprint: hex(row.evidence_fingerprint),
    serverObservedAt: iso(row.server_observed_at),
    receivedAt: iso(row.received_at),
    policyVersion: row.policy_version as ReferralEvidence["policyVersion"],
  };
}

function attributionFromRow(row: AttributionRow): Attribution {
  return {
    id: row.attribution_id as Attribution["id"],
    affiliateId: row.affiliate_id as Attribution["affiliateId"],
    programId: row.program_id as Attribution["programId"],
    subjectId: row.subject_id as Attribution["subjectId"],
    evidenceId: row.evidence_id as Attribution["evidenceId"],
    evidenceFingerprint: hex(row.evidence_fingerprint),
    source: row.source,
    establishedAt: iso(row.established_at),
    expiresAt: iso(row.expires_at),
    policyVersion: row.policy_version as Attribution["policyVersion"],
  };
}

function conversionFromRow(row: ConversionRow): ConversionAssociation {
  return {
    id: row.conversion_id as ConversionAssociationId,
    attributionId: row.attribution_id as ConversionAssociation["attributionId"],
    affiliateId: row.affiliate_id as ConversionAssociation["affiliateId"],
    programId: row.program_id as ConversionAssociation["programId"],
    orderId: row.order_id,
    paymentReference: row.payment_reference,
    financialEvidenceDigest: hex(row.financial_evidence_digest),
    eligibleRevenueMinorUnits: Number(row.eligible_revenue_minor),
    currency: row.currency,
    paymentConfirmedAt: iso(row.payment_confirmed_at),
    serviceOccurredAt: row.service_occurred_at
      ? iso(row.service_occurred_at)
      : null,
    conversionKind: row.conversion_kind,
    policyVersion: row.policy_version as ConversionAssociation["policyVersion"],
    createdAt: iso(row.created_at),
  };
}

function entitlementFromRow(row: EntitlementRow): CommissionEntitlement {
  return {
    id: row.entitlement_id as CommissionEntitlementId,
    revision: row.revision,
    affiliateId: row.affiliate_id as CommissionEntitlement["affiliateId"],
    programId: row.program_id as CommissionEntitlement["programId"],
    conversionAssociationId:
      row.conversion_id as CommissionEntitlement["conversionAssociationId"],
    attributionId: row.attribution_id as CommissionEntitlement["attributionId"],
    status: row.status,
    disputedFrom: row.disputed_from,
    eligibleRevenueMinorUnits: Number(row.eligible_revenue_minor),
    commissionMinorUnits: Number(row.commission_minor),
    currency: row.currency,
    rateBasisPoints: 3000,
    policyVersion: row.policy_version as CommissionEntitlement["policyVersion"],
    maturityAt: iso(row.maturity_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function insertSchema(pool: Pool): Promise<void> {
  for (const statement of affiliatesM154SchemaSql
    .split(/;\s*(?=CREATE TABLE)/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }
}

export class MySqlAffiliateReferralEvidenceRepository implements ReferralEvidenceRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async findByFingerprint(
    fingerprint: string,
  ): Promise<ReferralEvidence | null> {
    const [rows] = await this.pool.execute<ReferralRow[]>(
      "SELECT * FROM affiliate_referral_evidence WHERE evidence_fingerprint = UNHEX(?) LIMIT 1",
      [fingerprint],
    );
    return rows[0] ? referralFromRow(rows[0]) : null;
  }

  public async save(evidence: ReferralEvidence): Promise<ReferralEvidence> {
    await this.pool.execute(
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
        new Date(evidence.serverObservedAt),
        new Date(evidence.receivedAt),
        evidence.policyVersion,
        new Date(evidence.receivedAt),
      ],
    );
    const saved = await this.findByFingerprint(evidence.evidenceFingerprint);
    if (!saved || !same(saved, evidence))
      throw new Error("AFFILIATE_REFERRAL_PERSISTENCE_CONFLICT");
    return saved;
  }
}

export class MySqlAffiliateAttributionRepository implements AttributionRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async findActiveBySubject(
    subjectId: string,
  ): Promise<Attribution | null> {
    const [rows] = await this.pool.execute<AttributionRow[]>(
      "SELECT * FROM affiliate_attributions WHERE subject_id = ? AND expires_at > UTC_TIMESTAMP(3) ORDER BY established_at DESC LIMIT 1",
      [subjectId],
    );
    return rows[0] ? attributionFromRow(rows[0]) : null;
  }

  public async save(attribution: Attribution): Promise<Attribution> {
    await this.pool.execute(
      `INSERT INTO affiliate_attributions
       (attribution_id, affiliate_id, program_id, subject_id, evidence_id, evidence_fingerprint,
        source, established_at, expires_at, policy_version, order_id, order_locked_at, created_at)
       VALUES (?, ?, ?, ?, ?, UNHEX(?), ?, ?, ?, ?, NULL, NULL, ?)
       ON DUPLICATE KEY UPDATE attribution_id = attribution_id`,
      [
        attribution.id,
        attribution.affiliateId,
        attribution.programId,
        attribution.subjectId,
        attribution.evidenceId,
        attribution.evidenceFingerprint,
        attribution.source,
        new Date(attribution.establishedAt),
        new Date(attribution.expiresAt),
        attribution.policyVersion,
        new Date(attribution.establishedAt),
      ],
    );
    const [rows] = await this.pool.execute<AttributionRow[]>(
      "SELECT * FROM affiliate_attributions WHERE attribution_id = ? LIMIT 1",
      [attribution.id],
    );
    if (!rows[0]) throw new Error("AFFILIATE_ATTRIBUTION_NOT_PERSISTED");
    const saved = attributionFromRow(rows[0]);
    if (!same(saved, attribution))
      throw new Error("AFFILIATE_ATTRIBUTION_CONFLICT");
    return saved;
  }
}

export class MySqlAffiliateConversionRepository implements ConversionAssociationRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async findByOrderId(
    orderId: string,
  ): Promise<ConversionAssociation | null> {
    const [rows] = await this.pool.execute<ConversionRow[]>(
      "SELECT * FROM affiliate_conversions WHERE order_id = ? LIMIT 1",
      [orderId],
    );
    return rows[0] ? conversionFromRow(rows[0]) : null;
  }

  public async save(
    conversion: ConversionAssociation,
  ): Promise<ConversionAssociation> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existingRows] = await connection.execute<ConversionRow[]>(
        "SELECT * FROM affiliate_conversions WHERE order_id = ? FOR UPDATE",
        [conversion.orderId],
      );
      if (existingRows[0]) {
        const existing = conversionFromRow(existingRows[0]);
        if (!same(existing, conversion))
          throw new Error("AFFILIATE_CONVERSION_CONFLICT");
        await connection.commit();
        return existing;
      }
      await connection.execute(
        `INSERT INTO affiliate_conversions
         (conversion_id, attribution_id, affiliate_id, program_id, order_id, payment_reference,
          financial_evidence_digest, eligible_revenue_minor, currency, payment_confirmed_at,
          service_occurred_at, conversion_kind, policy_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), ?, ?, ?, ?, ?, ?, ?)`,
        [
          conversion.id,
          conversion.attributionId,
          conversion.affiliateId,
          conversion.programId,
          conversion.orderId,
          conversion.paymentReference,
          conversion.financialEvidenceDigest,
          conversion.eligibleRevenueMinorUnits,
          conversion.currency,
          new Date(conversion.paymentConfirmedAt),
          conversion.serviceOccurredAt
            ? new Date(conversion.serviceOccurredAt)
            : null,
          conversion.conversionKind,
          conversion.policyVersion,
          new Date(conversion.createdAt),
        ],
      );
      await connection.commit();
      return conversion;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export class MySqlAffiliateEntitlementRepository implements CommissionEntitlementRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async findById(
    id: CommissionEntitlementId,
  ): Promise<CommissionEntitlement | null> {
    const [rows] = await this.pool.execute<EntitlementRow[]>(
      "SELECT * FROM affiliate_entitlements WHERE entitlement_id = ? LIMIT 1",
      [id],
    );
    return rows[0] ? entitlementFromRow(rows[0]) : null;
  }

  public async findByConversionId(
    conversionId: ConversionAssociationId,
  ): Promise<CommissionEntitlement | null> {
    const [rows] = await this.pool.execute<EntitlementRow[]>(
      "SELECT * FROM affiliate_entitlements WHERE conversion_id = ? LIMIT 1",
      [conversionId],
    );
    return rows[0] ? entitlementFromRow(rows[0]) : null;
  }

  public async saveRevision(
    entitlement: CommissionEntitlement,
  ): Promise<CommissionEntitlement> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<EntitlementRow[]>(
        "SELECT * FROM affiliate_entitlements WHERE entitlement_id = ? FOR UPDATE",
        [entitlement.id],
      );
      const current = rows[0] ? entitlementFromRow(rows[0]) : null;
      if (!current) {
        await connection.execute(
          `INSERT INTO affiliate_entitlements
           (entitlement_id, conversion_id, affiliate_id, program_id, attribution_id, revision, status,
            disputed_from, eligible_revenue_minor, commission_minor, currency, rate_basis_points,
            policy_version, maturity_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entitlement.id,
            entitlement.conversionAssociationId,
            entitlement.affiliateId,
            entitlement.programId,
            entitlement.attributionId,
            entitlement.revision,
            entitlement.status,
            entitlement.disputedFrom,
            entitlement.eligibleRevenueMinorUnits,
            entitlement.commissionMinorUnits,
            entitlement.currency,
            entitlement.rateBasisPoints,
            entitlement.policyVersion,
            new Date(entitlement.maturityAt),
            new Date(entitlement.createdAt),
            new Date(entitlement.updatedAt),
          ],
        );
      } else {
        if (
          entitlement.revision === current.revision &&
          same(entitlement, current)
        ) {
          await connection.commit();
          return current;
        }
        if (entitlement.revision !== current.revision + 1)
          throw new Error("AFFILIATE_ENTITLEMENT_REVISION_CONFLICT");
        await connection.execute(
          `UPDATE affiliate_entitlements SET revision = ?, status = ?, disputed_from = ?,
           eligible_revenue_minor = ?, commission_minor = ?, updated_at = ?
           WHERE entitlement_id = ? AND revision = ?`,
          [
            entitlement.revision,
            entitlement.status,
            entitlement.disputedFrom,
            entitlement.eligibleRevenueMinorUnits,
            entitlement.commissionMinorUnits,
            new Date(entitlement.updatedAt),
            entitlement.id,
            current.revision,
          ],
        );
      }
      await connection.execute(
        `INSERT IGNORE INTO affiliate_entitlement_revisions
         (entitlement_id, revision, status, disputed_from, eligible_revenue_minor, commission_minor,
          currency, reason, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entitlement.id,
          entitlement.revision,
          entitlement.status,
          entitlement.disputedFrom,
          entitlement.eligibleRevenueMinorUnits,
          entitlement.commissionMinorUnits,
          entitlement.currency,
          "application_state_transition",
          new Date(entitlement.updatedAt),
        ],
      );
      await connection.commit();
      return entitlement;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export class MySqlAffiliateIdempotencyPort implements AffiliateIdempotencyPort {
  public constructor(private readonly pool: Pool) {}

  public async claim(
    key: string,
    semanticDigest: string,
  ): Promise<AffiliateIdempotencyClaim> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT IGNORE INTO affiliate_idempotency_claims (idempotency_key, semantic_digest, outcome_json, created_at) VALUES (?, UNHEX(?), NULL, UTC_TIMESTAMP(3))",
      [key, semanticDigest],
    );
    const [rows] = await this.pool.execute<ClaimRow[]>(
      "SELECT semantic_digest FROM affiliate_idempotency_claims WHERE idempotency_key = ? LIMIT 1",
      [key],
    );
    if (!rows[0]) throw new Error("AFFILIATE_IDEMPOTENCY_CLAIM_MISSING");
    const persisted = hex(rows[0].semantic_digest);
    if (persisted !== semanticDigest)
      return { status: "conflict", semanticDigest: persisted };
    return result.affectedRows === 1
      ? { status: "claimed" }
      : { status: "replayed", semanticDigest: persisted };
  }
}

export class MySqlAffiliateAuditPort implements AffiliateAuditPort {
  public constructor(private readonly pool: Pool) {}

  public async append(entry: AffiliateAuditEntry): Promise<void> {
    await this.pool.execute(
      `INSERT INTO affiliate_audit_events
       (audit_id, operation, contract_version, actor_kind, actor_reference,
        authorization_decision_reference, affiliate_id, subject_reference, policy_version,
        before_digest, after_digest, idempotency_digest, correlation_id, causation_id,
        occurred_at, outcome, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), UNHEX(?), ?, ?, ?, ?, ?)`,
      [
        entry.auditId,
        entry.operation,
        entry.contractVersion,
        entry.actorKind,
        entry.actorReference,
        entry.authorizationDecisionReference,
        entry.affiliateId,
        entry.subjectReference,
        entry.policyVersion,
        entry.beforeDigest,
        entry.afterDigest,
        entry.idempotencyDigest,
        entry.correlationId,
        entry.causationId,
        new Date(entry.occurredAt),
        entry.outcome,
        entry.reason,
      ],
    );
  }
}

export interface AffiliateOutboxEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly contractVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly availableAt: string;
}

export class MySqlAffiliateOutbox {
  public constructor(private readonly pool: Pool) {}

  public async enqueue(event: AffiliateOutboxEvent): Promise<void> {
    await this.pool.execute(
      `INSERT INTO affiliate_outbox_events
       (event_id, event_type, aggregate_type, aggregate_id, contract_version, payload_json,
        status, attempts, available_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
       ON DUPLICATE KEY UPDATE event_id = event_id`,
      [
        event.eventId,
        event.eventType,
        event.aggregateType,
        event.aggregateId,
        event.contractVersion,
        JSON.stringify(event.payload),
        new Date(event.availableAt),
        new Date(event.availableAt),
      ],
    );
  }
}

export async function applyAffiliatesM154Schema(pool: Pool): Promise<void> {
  await insertSchema(pool);
}

export interface AffiliateMaterializationRequestRecord {
  readonly requestId: string;
  readonly entitlementId: string;
  readonly entitlementRevision: number;
  readonly affiliateId: string;
  readonly conversionId: string;
  readonly policyVersion: string;
  readonly entitlementDigest: string;
  readonly correlationId: string;
  readonly state: "pending" | "accepted" | "rejected";
  readonly financialReference: string | null;
  readonly rejectionCode: string | null;
  readonly retryable: boolean;
  readonly attempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class MySqlAffiliateMaterializationRepository {
  public constructor(private readonly pool: Pool) {}

  public async createPending(
    request: AffiliateMaterializationRequestRecord,
  ): Promise<AffiliateMaterializationRequestRecord> {
    await this.pool.execute(
      `INSERT INTO affiliate_materialization_requests
       (request_id, entitlement_id, entitlement_revision, affiliate_id, conversion_id, policy_version,
        entitlement_digest, correlation_id, state, financial_reference, rejection_code, retryable,
        attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), ?, 'pending', NULL, NULL, 0, 0, ?, ?)
       ON DUPLICATE KEY UPDATE request_id = request_id`,
      [
        request.requestId,
        request.entitlementId,
        request.entitlementRevision,
        request.affiliateId,
        request.conversionId,
        request.policyVersion,
        request.entitlementDigest,
        request.correlationId,
        new Date(request.createdAt),
        new Date(request.updatedAt),
      ],
    );
    return request;
  }

  public async recordResult(
    input: Readonly<{
      requestId: string;
      accepted: boolean;
      financialReference?: string;
      code?: string;
      retryable?: boolean;
      occurredAt: string;
    }>,
  ): Promise<void> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE affiliate_materialization_requests
       SET state = ?, financial_reference = ?, rejection_code = ?, retryable = ?, attempts = attempts + 1, updated_at = ?
       WHERE request_id = ? AND state = 'pending'`,
      [
        input.accepted ? "accepted" : "rejected",
        input.financialReference ?? null,
        input.code ?? null,
        input.retryable ? 1 : 0,
        new Date(input.occurredAt),
        input.requestId,
      ],
    );
    if (result.affectedRows !== 1) {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        "SELECT request_id FROM affiliate_materialization_requests WHERE request_id = ? LIMIT 1",
        [input.requestId],
      );
      if (!rows[0]) throw new Error("AFFILIATE_MATERIALIZATION_NOT_FOUND");
    }
  }
}

export interface AffiliateAccountRecord {
  readonly affiliateId: string;
  readonly identityReference: string;
  readonly pseudonymousReference: string;
  readonly status: "active" | "suspended" | "inactive";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AffiliateMembershipRecord {
  readonly membershipId: string;
  readonly affiliateId: string;
  readonly programId: string;
  readonly status: "active" | "suspended" | "inactive";
  readonly joinedAt: string;
  readonly endedAt: string | null;
  readonly updatedAt: string;
}

export class MySqlAffiliateAccountRepository {
  public constructor(private readonly pool: Pool) {}

  public async saveAccount(account: AffiliateAccountRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO affiliate_accounts
       (affiliate_id, identity_reference, pseudonymous_reference, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = VALUES(updated_at)`,
      [
        account.affiliateId,
        account.identityReference,
        account.pseudonymousReference,
        account.status,
        new Date(account.createdAt),
        new Date(account.updatedAt),
      ],
    );
  }

  public async saveMembership(
    membership: AffiliateMembershipRecord,
  ): Promise<void> {
    await this.pool.execute(
      `INSERT INTO affiliate_memberships
       (membership_id, affiliate_id, program_id, status, joined_at, ended_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), ended_at = VALUES(ended_at), updated_at = VALUES(updated_at)`,
      [
        membership.membershipId,
        membership.affiliateId,
        membership.programId,
        membership.status,
        new Date(membership.joinedAt),
        membership.endedAt ? new Date(membership.endedAt) : null,
        new Date(membership.updatedAt),
      ],
    );
  }
}

export interface AffiliatePersistencePorts {
  readonly accounts: MySqlAffiliateAccountRepository;
  readonly materializations: MySqlAffiliateMaterializationRepository;
  readonly referrals: MySqlAffiliateReferralEvidenceRepository;
  readonly attributions: MySqlAffiliateAttributionRepository;
  readonly conversions: MySqlAffiliateConversionRepository;
  readonly entitlements: MySqlAffiliateEntitlementRepository;
  readonly idempotency: MySqlAffiliateIdempotencyPort;
  readonly audit: MySqlAffiliateAuditPort;
  readonly outbox: MySqlAffiliateOutbox;
}

export function createAffiliatePersistencePorts(
  pool: Pool,
): AffiliatePersistencePorts {
  return {
    accounts: new MySqlAffiliateAccountRepository(pool),
    materializations: new MySqlAffiliateMaterializationRepository(pool),
    referrals: new MySqlAffiliateReferralEvidenceRepository(pool),
    attributions: new MySqlAffiliateAttributionRepository(pool),
    conversions: new MySqlAffiliateConversionRepository(pool),
    entitlements: new MySqlAffiliateEntitlementRepository(pool),
    idempotency: new MySqlAffiliateIdempotencyPort(pool),
    audit: new MySqlAffiliateAuditPort(pool),
    outbox: new MySqlAffiliateOutbox(pool),
  };
}
