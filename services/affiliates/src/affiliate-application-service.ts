import {
  AFFILIATE_POLICY_V1,
  chooseAttribution,
  createAffiliateCanonicalDigest,
  createAffiliateIdempotencyKey,
  createAttribution,
  createReferralEvidence,
  isSha256,
  isUtcTimestamp,
  normalizeAcquisitionSubjectId,
  normalizeAffiliateId,
  normalizeAttributionId,
  normalizeReferralEvidenceId,
  type AffiliateAuthorizationPort,
  type AffiliateDigestPort,
  type AffiliateOrderingEvidencePort,
  type AffiliateProgramId,
  type AffiliateReferralEvidenceVerificationPort,
  type Attribution,
  type ReferralEvidence,
  type ReferralEvidenceSource,
} from "@touristic/affiliates";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { lockAndAssertAffiliateAttributionEligibility } from "./affiliate-eligibility-gate.js";

export interface AffiliateReferralMutationInput {
  readonly requestId?: string;
  readonly affiliateId: string;
  readonly programId: string;
  readonly destinationId: string;
  /**
   * Opaque acquisition subject reference supplied by the allowed ingress
   * contract. The canonical AcquisitionSubjectId is derived server-side.
   */
  readonly subjectId: string;
  readonly source: ReferralEvidenceSource;
  readonly evidence?: unknown;
  readonly actorReference: string;
  readonly correlationId: string;
  /** @deprecated Trusted legacy input only. Never accepted by browser HTTP. */
  readonly evidenceFingerprint?: string;
  /** @deprecated Ignored; evidence IDs are server-owned. */
  readonly evidenceId?: string;
  /** @deprecated Ignored; attribution IDs are server-owned. */
  readonly attributionId?: string;
  /** @deprecated Ignored; server clock is authoritative. */
  readonly serverObservedAt?: string;
  /** @deprecated Ignored; server clock is authoritative. */
  readonly receivedAt?: string;
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

interface EvidenceRow extends RowDataPacket {
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

interface IdempotencyRow extends RowDataPacket {
  semantic_digest: string;
  outcome_json: unknown;
}

interface AdvisoryLockRow extends RowDataPacket {
  acquired: number | null;
}

interface AdvisoryUnlockRow extends RowDataPacket {
  released: number | null;
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

function evidenceFromRow(row: EvidenceRow): ReferralEvidence {
  return {
    id: row.evidence_id as ReferralEvidence["id"],
    affiliateId: row.affiliate_id as ReferralEvidence["affiliateId"],
    programId: row.program_id as ReferralEvidence["programId"],
    subjectId: row.subject_id as ReferralEvidence["subjectId"],
    source: row.source,
    evidenceFingerprint: row.evidence_fingerprint.toString("hex"),
    serverObservedAt: row.server_observed_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    policyVersion: row.policy_version as ReferralEvidence["policyVersion"],
  };
}

function isReferralSource(value: unknown): value is ReferralEvidenceSource {
  return (
    value === "platform_link" ||
    value === "platform_qr" ||
    value === "checkout_code" ||
    value === "server_referral"
  );
}

function isBoundedReference(value: string, max = 180): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value) &&
    value.length > 0 &&
    value.length <= max
  );
}

function isRequestId(value: string): boolean {
  return value.length >= 8 && isBoundedReference(value, 120);
}

function parseStoredAttribution(value: unknown): Attribution | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.affiliateId !== "string" ||
    typeof record.programId !== "string" ||
    typeof record.subjectId !== "string" ||
    typeof record.evidenceId !== "string" ||
    typeof record.evidenceFingerprint !== "string" ||
    !isSha256(record.evidenceFingerprint) ||
    !isReferralSource(record.source) ||
    typeof record.establishedAt !== "string" ||
    typeof record.expiresAt !== "string" ||
    !isUtcTimestamp(record.establishedAt) ||
    !isUtcTimestamp(record.expiresAt) ||
    record.policyVersion !== AFFILIATE_POLICY_V1.version
  ) {
    return null;
  }
  return record as unknown as Attribution;
}

export class AffiliateApplicationService {
  public constructor(
    private readonly pool: Pool,
    private readonly authorization: AffiliateAuthorizationPort,
    private readonly digest: AffiliateDigestPort,
    private readonly evidenceVerification?: AffiliateReferralEvidenceVerificationPort,
    private readonly clock: { now(): string } = {
      now: () => new Date().toISOString(),
    },
    private readonly orderingEvidence?: AffiliateOrderingEvidencePort,
  ) {}

  public async recordReferralAndEstablishAttribution(
    input: AffiliateReferralMutationInput,
  ): Promise<AffiliateReferralMutationResult> {
    const requestId = input.requestId ?? input.correlationId;
    if (
      !isRequestId(requestId) ||
      !isReferralSource(input.source) ||
      !isBoundedReference(input.destinationId, 120) ||
      !isBoundedReference(input.programId, 120) ||
      !isBoundedReference(input.subjectId, 180)
    ) {
      throw new Error("AFFILIATE_REFERRAL_REQUEST_INVALID");
    }
    const affiliateId = normalizeAffiliateId(input.affiliateId);
    if (!affiliateId) {
      throw new Error("AFFILIATE_REFERRAL_IDENTIFIERS_INVALID");
    }
    const programId = input.programId as AffiliateProgramId;

    const subjectDigest = await createAffiliateCanonicalDigest(
      {
        destinationId: input.destinationId,
        subjectReference: input.subjectId,
      },
      this.digest,
    );
    const subjectId = normalizeAcquisitionSubjectId(`asub_${subjectDigest}`);
    if (!subjectId) throw new Error("AFFILIATE_SERVER_IDENTIFIER_INVALID");

    const authorized = await this.authorization.authorize(
      "affiliate.establish_attribution",
      {
        actorKind: "service",
        actorReference: input.actorReference,
        affiliateId,
        programId,
        correlationId: input.correlationId,
      },
    );
    if (!authorized.allowed) throw new Error("AFFILIATE_AUTHORIZATION_DENIED");
    if (!authorized.decisionReference) {
      throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
    }

    const canonicalEvidence = await this.verifyEvidence(
      input,
      affiliateId,
      programId,
      subjectId,
    );
    const serverObservedAt = this.serverNow();
    const evidenceFingerprint = await createAffiliateCanonicalDigest(
      {
        affiliateId,
        programId,
        destinationId: input.destinationId,
        subjectId,
        source: input.source,
        evidence: canonicalEvidence,
      },
      this.digest,
    );
    const evidenceId = normalizeReferralEvidenceId(
      `afev_${evidenceFingerprint}`,
    );
    const attributionId = normalizeAttributionId(`attr_${evidenceFingerprint}`);
    if (!evidenceId || !attributionId) {
      throw new Error("AFFILIATE_SERVER_IDENTIFIER_INVALID");
    }
    const evidence = createReferralEvidence({
      id: evidenceId,
      affiliateId,
      programId,
      subjectId,
      source: input.source,
      evidenceFingerprint,
      serverObservedAt,
      receivedAt: serverObservedAt,
      validatedByServer: true,
    });
    if (!evidence) throw new Error("AFFILIATE_REFERRAL_EVIDENCE_INVALID");

    const idempotencyKey = await createAffiliateIdempotencyKey(
      "establish_attribution",
      { requestId },
      this.digest,
    );
    const semanticDigest = await createAffiliateCanonicalDigest(
      {
        affiliateId,
        programId,
        destinationId: input.destinationId,
        subjectId,
        source: input.source,
        evidenceFingerprint,
      },
      this.digest,
    );

    const connection = await this.pool.getConnection();
    let subjectLockHeld = false;
    try {
      await this.acquireSubjectMutex(connection, subjectId);
      subjectLockHeld = true;
      await connection.beginTransaction();

      // Exact replay is resolved before the NEW-attribution eligibility gate.
      // Suspension therefore blocks new attribution without destroying history.
      const replay = await this.claim(
        connection,
        idempotencyKey,
        semanticDigest,
      );
      if (replay) {
        await this.insertAudit(
          connection,
          input,
          idempotencyKey,
          replay,
          authorized.decisionReference,
          "replayed",
          "exact_replay",
          replay.evidenceFingerprint,
          replay.evidenceFingerprint,
        );
        await connection.commit();
        return {
          attribution: replay,
          replayed: true,
          idempotencyKey,
        };
      }

      await lockAndAssertAffiliateAttributionEligibility(
        connection,
        affiliateId,
        input.programId,
        input.destinationId,
      );

      const persistedEvidence = await this.insertOrReadEvidence(
        connection,
        evidence,
      );
      await this.insertReferralOutbox(connection, persistedEvidence);
      const existing = await this.lockSubject(connection, subjectId);
      const candidate = createAttribution(
        attributionId,
        persistedEvidence,
        serverObservedAt,
      );
      if (!candidate) throw new Error("AFFILIATE_ATTRIBUTION_INVALID");
      const selected = chooseAttribution(
        existing ? attributionFromRow(existing) : null,
        candidate,
        existing?.order_id ? "locked" : "open",
        serverObservedAt,
      );
      if (!selected) throw new Error("AFFILIATE_ATTRIBUTION_NOT_SELECTED");

      const transition = await this.persistAttribution(
        connection,
        existing,
        selected,
      );
      if (transition !== "unchanged") {
        await this.insertAttributionOutbox(connection, selected);
      }
      const reason =
        transition === "created"
          ? "attribution_established"
          : transition === "replaced"
            ? "attribution_replaced"
            : existing?.order_id
              ? "attribution_locked_unchanged"
              : "attribution_precedence_unchanged";
      await this.insertAudit(
        connection,
        input,
        idempotencyKey,
        selected,
        authorized.decisionReference,
        "accepted",
        reason,
        existing?.evidence_fingerprint.toString("hex") ?? null,
        selected.evidenceFingerprint,
      );
      await this.completeClaim(connection, idempotencyKey, selected);
      await connection.commit();
      return { attribution: selected, replayed: false, idempotencyKey };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      if (subjectLockHeld) {
        await this.releaseSubjectMutex(connection, subjectId);
      }
      connection.release();
    }
  }

  public async lockAttributionToOrder(
    subjectIdValue: string,
    orderId: string,
    _clientOccurredAt?: string,
  ): Promise<void> {
    void _clientOccurredAt;
    const subjectId = normalizeAcquisitionSubjectId(subjectIdValue);
    if (!subjectId || !isBoundedReference(orderId, 120)) {
      throw new Error("AFFILIATE_ORDER_ATTRIBUTION_LOCK_INPUT_INVALID");
    }
    if (!this.orderingEvidence) {
      throw new Error("AFFILIATE_ORDER_EVIDENCE_REQUIRED");
    }
    const orderEvidence = await this.orderingEvidence.getOrderEvidence(orderId);
    if (
      !orderEvidence ||
      orderEvidence.orderId !== orderId ||
      orderEvidence.status !== "pending_payment" ||
      !Number.isInteger(orderEvidence.contractVersion) ||
      orderEvidence.contractVersion < 1
    ) {
      throw new Error("AFFILIATE_ORDER_NOT_PENDING_PAYMENT");
    }
    const serverOccurredAt = this.serverNow();
    const connection = await this.pool.getConnection();
    let subjectLockHeld = false;
    try {
      await this.acquireSubjectMutex(connection, subjectId);
      subjectLockHeld = true;
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE affiliate_attributions SET order_id = ?, order_locked_at = ?
         WHERE subject_id = ? AND order_id IS NULL AND expires_at > ?`,
        [orderId, date(serverOccurredAt), subjectId, date(serverOccurredAt)],
      );
      if (result.affectedRows !== 1) {
        throw new Error("AFFILIATE_ORDER_ATTRIBUTION_LOCK_CONFLICT");
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      if (subjectLockHeld) {
        await this.releaseSubjectMutex(connection, subjectId);
      }
      connection.release();
    }
  }

  private async verifyEvidence(
    input: AffiliateReferralMutationInput,
    affiliateId: NonNullable<ReturnType<typeof normalizeAffiliateId>>,
    programId: AffiliateProgramId,
    subjectId: NonNullable<ReturnType<typeof normalizeAcquisitionSubjectId>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (input.evidence !== undefined) {
      if (!this.evidenceVerification) {
        throw new Error("AFFILIATE_REFERRAL_EVIDENCE_VERIFIER_REQUIRED");
      }
      const verification = await this.evidenceVerification.verify({
        source: input.source,
        affiliateId,
        programId,
        subjectId,
        evidence: input.evidence,
      });
      if (!verification.accepted) {
        throw new Error(
          `AFFILIATE_REFERRAL_EVIDENCE_REJECTED:${verification.code}`,
        );
      }
      return verification.canonicalEvidence;
    }

    // Backward-compatible trusted internal ingress only. Browser HTTP rejects
    // evidenceFingerprint, evidenceId, attributionId and timestamps before here.
    if (!input.evidenceFingerprint || !isSha256(input.evidenceFingerprint)) {
      throw new Error(
        "AFFILIATE_REFERRAL_EVIDENCE_REJECTED:LEGACY_EVIDENCE_INVALID",
      );
    }
    return { legacyEvidenceFingerprint: input.evidenceFingerprint };
  }

  private serverNow(): string {
    const value = this.clock.now();
    if (!isUtcTimestamp(value)) {
      throw new Error("AFFILIATE_SERVER_CLOCK_INVALID");
    }
    return new Date(Date.parse(value)).toISOString();
  }

  private async acquireSubjectMutex(
    connection: PoolConnection,
    subjectId: string,
  ): Promise<void> {
    const [rows] = await connection.execute<AdvisoryLockRow[]>(
      "SELECT GET_LOCK(SHA2(CONCAT('affiliate-attribution:', ?), 256), 10) AS acquired",
      [subjectId],
    );
    if (Number(rows[0]?.acquired) !== 1) {
      throw new Error("AFFILIATE_ATTRIBUTION_SUBJECT_LOCK_TIMEOUT");
    }
  }

  private async releaseSubjectMutex(
    connection: PoolConnection,
    subjectId: string,
  ): Promise<void> {
    try {
      const [rows] = await connection.execute<AdvisoryUnlockRow[]>(
        "SELECT RELEASE_LOCK(SHA2(CONCAT('affiliate-attribution:', ?), 256)) AS released",
        [subjectId],
      );
      if (Number(rows[0]?.released) !== 1) connection.destroy();
    } catch {
      connection.destroy();
    }
  }

  private async claim(
    connection: PoolConnection,
    key: string,
    semanticDigest: string,
  ): Promise<Attribution | null> {
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT IGNORE INTO affiliate_idempotency_claims (idempotency_key, semantic_digest, created_at) VALUES (?, UNHEX(?), UTC_TIMESTAMP(3))",
      [key, semanticDigest],
    );
    if (result.affectedRows === 1) return null;
    const [rows] = await connection.execute<IdempotencyRow[]>(
      "SELECT HEX(semantic_digest) AS semantic_digest, outcome_json FROM affiliate_idempotency_claims WHERE idempotency_key = ? FOR UPDATE",
      [key],
    );
    const stored = rows[0];
    if (
      !stored ||
      stored.semantic_digest.toLowerCase() !== semanticDigest.toLowerCase()
    ) {
      throw new Error("AFFILIATE_IDEMPOTENCY_CONFLICT");
    }
    const outcome = parseStoredAttribution(stored.outcome_json);
    if (!outcome) throw new Error("AFFILIATE_IDEMPOTENCY_RESULT_MISSING");
    return outcome;
  }

  private async completeClaim(
    connection: PoolConnection,
    key: string,
    attribution: Attribution,
  ): Promise<void> {
    const [result] = await connection.execute<ResultSetHeader>(
      "UPDATE affiliate_idempotency_claims SET outcome_json = ? WHERE idempotency_key = ? AND outcome_json IS NULL",
      [JSON.stringify(attribution), key],
    );
    if (result.affectedRows !== 1) {
      throw new Error("AFFILIATE_IDEMPOTENCY_COMPLETION_CONFLICT");
    }
  }

  private async lockSubject(
    connection: PoolConnection,
    subjectId: string,
  ): Promise<AttributionRow | null> {
    const [rows] = await connection.execute<AttributionRow[]>(
      "SELECT * FROM affiliate_attributions WHERE subject_id = ? LIMIT 1 FOR UPDATE",
      [subjectId],
    );
    return rows[0] ?? null;
  }

  private async insertOrReadEvidence(
    connection: PoolConnection,
    evidence: ReferralEvidence,
  ): Promise<ReferralEvidence> {
    const [result] = await connection.execute<ResultSetHeader>(
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
    if (result.affectedRows === 1) return evidence;

    const [rows] = await connection.execute<EvidenceRow[]>(
      "SELECT * FROM affiliate_referral_evidence WHERE evidence_id = ? FOR UPDATE",
      [evidence.id],
    );
    const existing = rows[0];
    if (!existing) throw new Error("AFFILIATE_REFERRAL_EVIDENCE_CONFLICT");
    const persisted = evidenceFromRow(existing);
    if (
      persisted.affiliateId !== evidence.affiliateId ||
      persisted.programId !== evidence.programId ||
      persisted.subjectId !== evidence.subjectId ||
      persisted.source !== evidence.source ||
      persisted.evidenceFingerprint !== evidence.evidenceFingerprint ||
      persisted.policyVersion !== evidence.policyVersion
    ) {
      throw new Error("AFFILIATE_REFERRAL_EVIDENCE_CONFLICT");
    }
    return persisted;
  }

  private async persistAttribution(
    connection: PoolConnection,
    existing: AttributionRow | null,
    selected: Attribution,
  ): Promise<"created" | "replaced" | "unchanged"> {
    if (!existing) {
      await connection.execute(
        `INSERT INTO affiliate_attributions
         (attribution_id, affiliate_id, program_id, subject_id, evidence_id, evidence_fingerprint,
          source, established_at, expires_at, policy_version, created_at)
         VALUES (?, ?, ?, ?, ?, UNHEX(?), ?, ?, ?, ?, ?)`,
        [
          selected.id,
          selected.affiliateId,
          selected.programId,
          selected.subjectId,
          selected.evidenceId,
          selected.evidenceFingerprint,
          selected.source,
          date(selected.establishedAt),
          date(selected.expiresAt),
          selected.policyVersion,
          date(selected.establishedAt),
        ],
      );
      return "created";
    }
    if (selected.id === existing.attribution_id) return "unchanged";

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE affiliate_attributions
       SET attribution_id = ?, affiliate_id = ?, program_id = ?, evidence_id = ?,
           evidence_fingerprint = UNHEX(?), source = ?, established_at = ?, expires_at = ?,
           policy_version = ?, created_at = ?
       WHERE subject_id = ? AND order_id IS NULL`,
      [
        selected.id,
        selected.affiliateId,
        selected.programId,
        selected.evidenceId,
        selected.evidenceFingerprint,
        selected.source,
        date(selected.establishedAt),
        date(selected.expiresAt),
        selected.policyVersion,
        date(selected.establishedAt),
        selected.subjectId,
      ],
    );
    if (result.affectedRows !== 1) {
      throw new Error("AFFILIATE_ATTRIBUTION_REPLACEMENT_CONFLICT");
    }
    return "replaced";
  }

  private async insertReferralOutbox(
    connection: PoolConnection,
    evidence: ReferralEvidence,
  ): Promise<void> {
    await connection.execute(
      `INSERT IGNORE INTO affiliate_outbox_events
       (event_id, event_type, aggregate_type, aggregate_id, contract_version, payload_json,
        status, attempts, available_at, created_at)
       VALUES (?, 'AffiliateReferralEvidenceRecorded', 'referral_evidence', ?, 1, ?, 'pending', 0, ?, ?)`,
      [
        `affiliate-referral-${evidence.id}`,
        evidence.id,
        JSON.stringify({
          evidenceId: evidence.id,
          affiliateId: evidence.affiliateId,
          programId: evidence.programId,
          subjectId: evidence.subjectId,
          source: evidence.source,
          evidenceFingerprint: evidence.evidenceFingerprint,
          serverObservedAt: evidence.serverObservedAt,
          policyVersion: evidence.policyVersion,
        }),
        date(evidence.serverObservedAt),
        date(evidence.serverObservedAt),
      ],
    );
  }

  private async insertAttributionOutbox(
    connection: PoolConnection,
    attribution: Attribution,
  ): Promise<void> {
    await connection.execute(
      `INSERT IGNORE INTO affiliate_outbox_events
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
    outcome: "accepted" | "replayed",
    reason: string,
    beforeDigest: string | null,
    afterDigest: string,
  ): Promise<void> {
    await connection.execute(
      `INSERT IGNORE INTO affiliate_audit_events
       (audit_id, operation, contract_version, actor_kind, actor_reference,
        authorization_decision_reference, affiliate_id, subject_reference, policy_version,
        before_digest, after_digest, idempotency_digest, correlation_id, occurred_at, outcome, reason)
       VALUES (?, 'affiliate.establish_attribution', 1, 'service', ?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), ?, ?, ?, ?)`,
      [
        `audit-${key.slice(-48)}-${outcome}`,
        input.actorReference,
        decisionReference,
        attribution.affiliateId,
        attribution.subjectId,
        attribution.policyVersion,
        beforeDigest ? Buffer.from(beforeDigest, "hex") : null,
        afterDigest,
        key.slice(-64),
        input.correlationId,
        date(this.serverNow()),
        outcome,
        reason,
      ],
    );
  }
}
