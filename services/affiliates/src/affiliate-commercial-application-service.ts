import {
  AFFILIATE_POLICY_V1,
  applyRefundConsequence,
  createCommissionEntitlement,
  createConversionAssociation,
  disputeEntitlement,
  isActiveForAttribution,
  markEntitlementEarned,
  normalizeCommissionEntitlementId,
  normalizeConversionAssociationId,
  resolveEntitlementDispute,
  type AffiliateAuthorizationPort,
  type AffiliateDigestPort,
  type AffiliateEligibilityPort,
  type AffiliateFinancialEvidencePort,
  type AffiliateOrderingEvidencePort,
  type Attribution,
  type CommissionEntitlement,
  type ConversionAssociation,
  type EarnedReversal,
} from "@touristic/affiliates";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { lockAffiliateEligibilitySnapshot } from "./affiliate-eligibility-gate.js";

export interface AffiliateFinancialAdjustmentEvidenceV1 {
  readonly contractVersion: 1;
  readonly adjustmentReference: string;
  readonly orderId: string;
  readonly kind: "refund" | "cancellation";
  readonly updatedEligibleRevenueMinorUnits: number;
  readonly evidenceDigest: string;
  readonly occurredAt: string;
}

export interface AffiliateFinancialAdjustmentEvidencePort {
  getAdjustmentEvidence(
    adjustmentReference: string,
  ): Promise<AffiliateFinancialAdjustmentEvidenceV1 | null>;
}

export interface AffiliateCommercialDependencies {
  readonly authorization: AffiliateAuthorizationPort;
  readonly digest: AffiliateDigestPort;
  readonly ordering: AffiliateOrderingEvidencePort;
  readonly financial: AffiliateFinancialEvidencePort;
  readonly financialAdjustments: AffiliateFinancialAdjustmentEvidencePort;
  /**
   * Retained for the versioned public dependency contract. Mutating commercial
   * decisions use the transactional MySQL eligibility lock instead of this
   * potentially stale reader.
   */
  readonly eligibility: AffiliateEligibilityPort;
}

export interface AssociateConversionInput {
  readonly conversionId: string;
  readonly entitlementId: string;
  readonly attributionId: string;
  readonly orderId: string;
  readonly serviceOccurredAt?: string;
  readonly actorReference: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface AssociateConversionResult {
  readonly conversion: ConversionAssociation;
  readonly entitlement: CommissionEntitlement;
  readonly replayed: boolean;
}

export type EntitlementTransitionAction =
  "earn" | "dispute" | "restore" | "cancel_dispute" | "reverse_dispute";

export interface TransitionEntitlementInput {
  readonly entitlementId: string;
  readonly operationId: string;
  readonly action: EntitlementTransitionAction;
  readonly actorReference: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface TransitionEntitlementResult {
  readonly entitlement: CommissionEntitlement;
  readonly replayed: boolean;
}

export interface ApplyFinancialAdjustmentInput {
  readonly entitlementId: string;
  readonly adjustmentReference: string;
  readonly actorReference: string;
  readonly correlationId: string;
}

export type ApplyFinancialAdjustmentResult =
  | Readonly<{
      kind: "pending_reprice";
      entitlement: CommissionEntitlement;
      replayed: boolean;
    }>
  | Readonly<{
      kind: "earned_reversal_required";
      reversal: EarnedReversal;
      entitlement: CommissionEntitlement;
      replayed: boolean;
    }>;

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

interface IdempotencyRow extends RowDataPacket {
  semantic_digest: Buffer;
  outcome_json: unknown;
}

function date(value: string): Date {
  return new Date(value);
}

function stable(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("AFFILIATE_CANONICAL_INPUT_UNSUPPORTED");
}

function parsedOutcome<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
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

function conversionFromRow(row: ConversionRow): ConversionAssociation {
  return {
    id: row.conversion_id as ConversionAssociation["id"],
    attributionId: row.attribution_id as ConversionAssociation["attributionId"],
    affiliateId: row.affiliate_id as ConversionAssociation["affiliateId"],
    programId: row.program_id as ConversionAssociation["programId"],
    orderId: row.order_id,
    paymentReference: row.payment_reference,
    financialEvidenceDigest: row.financial_evidence_digest.toString("hex"),
    eligibleRevenueMinorUnits: Number(row.eligible_revenue_minor),
    currency: row.currency,
    paymentConfirmedAt: row.payment_confirmed_at.toISOString(),
    serviceOccurredAt: row.service_occurred_at?.toISOString() ?? null,
    conversionKind: row.conversion_kind,
    policyVersion: row.policy_version as ConversionAssociation["policyVersion"],
    createdAt: row.created_at.toISOString(),
  };
}

function entitlementFromRow(row: EntitlementRow): CommissionEntitlement {
  if (
    row.policy_version !== AFFILIATE_POLICY_V1.version ||
    row.rate_basis_points !== AFFILIATE_POLICY_V1.commission.rateBasisPoints
  ) {
    throw new Error("AFFILIATE_POLICY_SNAPSHOT_CONFLICT");
  }
  return {
    id: row.entitlement_id as CommissionEntitlement["id"],
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
    rateBasisPoints: AFFILIATE_POLICY_V1.commission.rateBasisPoints,
    policyVersion: AFFILIATE_POLICY_V1.version,
    maturityAt: row.maturity_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class AffiliateCommercialApplicationService {
  public constructor(
    private readonly pool: Pool,
    private readonly dependencies: AffiliateCommercialDependencies,
  ) {}

  public async associateConversion(
    input: AssociateConversionInput,
  ): Promise<AssociateConversionResult> {
    const conversionId = normalizeConversionAssociationId(input.conversionId);
    const entitlementId = normalizeCommissionEntitlementId(input.entitlementId);
    if (!conversionId || !entitlementId) {
      throw new Error("AFFILIATE_CONVERSION_ID_INVALID");
    }

    const [attributionRows] = await this.pool.execute<AttributionRow[]>(
      "SELECT * FROM affiliate_attributions WHERE attribution_id = ? LIMIT 1",
      [input.attributionId],
    );
    const snapshotRow = attributionRows[0];
    if (!snapshotRow || snapshotRow.order_id !== input.orderId) {
      throw new Error("AFFILIATE_ATTRIBUTION_ORDER_MISMATCH");
    }
    const snapshot = attributionFromRow(snapshotRow);
    const authorized = await this.dependencies.authorization.authorize(
      "affiliate.associate_conversion",
      {
        actorKind: "service",
        actorReference: input.actorReference,
        affiliateId: snapshot.affiliateId,
        programId: snapshot.programId,
        correlationId: input.correlationId,
      },
    );
    this.assertAuthorized(authorized);

    const semanticDigest = await this.digest({
      operation: "associate_conversion",
      conversionId,
      entitlementId,
      attributionId: input.attributionId,
      orderId: input.orderId,
      serviceOccurredAt: input.serviceOccurredAt ?? null,
      occurredAt: input.occurredAt,
    });
    const key = `affiliate:conversion:${input.orderId}`;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const replay = await this.claim<AssociateConversionResult>(
        connection,
        key,
        semanticDigest,
      );
      if (replay) {
        await connection.commit();
        return { ...replay, replayed: true };
      }

      const [lockedRows] = await connection.execute<AttributionRow[]>(
        "SELECT * FROM affiliate_attributions WHERE attribution_id = ? AND order_id = ? FOR UPDATE",
        [input.attributionId, input.orderId],
      );
      const lockedRow = lockedRows[0];
      if (
        !lockedRow ||
        stable(attributionFromRow(lockedRow)) !== stable(snapshot)
      ) {
        throw new Error("AFFILIATE_ATTRIBUTION_CHANGED");
      }
      const lockedEligibility = await lockAffiliateEligibilitySnapshot(
        connection,
        snapshot.affiliateId,
        snapshot.programId,
      );
      const [ordering, financial] = await Promise.all([
        this.dependencies.ordering.getOrderEvidence(input.orderId),
        this.dependencies.financial.getConversionEvidence(input.orderId),
      ]);
      if (!ordering) throw new Error("AFFILIATE_ORDER_NOT_FOUND");
      if (ordering.orderId !== input.orderId) {
        throw new Error("AFFILIATE_ORDER_EVIDENCE_MISMATCH");
      }
      if (!financial) {
        throw new Error("AFFILIATE_FINANCIAL_EVIDENCE_MISSING");
      }

      const conversion = createConversionAssociation({
        id: conversionId,
        attribution: snapshot,
        ordering,
        financial,
        conversionKind: "initial_purchase",
        ...(input.serviceOccurredAt
          ? { serviceOccurredAt: input.serviceOccurredAt }
          : {}),
        createdAt: input.occurredAt,
      });
      if (!conversion) throw new Error("AFFILIATE_CONVERSION_NOT_ELIGIBLE");
      const entitlement = createCommissionEntitlement({
        id: entitlementId,
        conversion,
        affiliateSuspendedAtConversion:
          lockedEligibility.programStatus !== "active" ||
          !isActiveForAttribution(lockedEligibility.snapshot),
        createdAt: input.occurredAt,
      });
      if (!entitlement) throw new Error("AFFILIATE_COMMISSION_NOT_ELIGIBLE");

      await this.insertConversion(connection, conversion);
      await this.insertEntitlement(
        connection,
        entitlement,
        "conversion_associated",
      );
      const entitlementDigest = await this.digest(entitlement);
      await this.audit(connection, {
        operation: "affiliate.associate_conversion",
        actorReference: input.actorReference,
        authorizationDecisionReference: authorized.decisionReference,
        affiliateId: entitlement.affiliateId,
        subjectReference: input.orderId,
        policyVersion: entitlement.policyVersion,
        idempotencyDigest: semanticDigest,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        reason: "conversion_and_entitlement_created",
      });
      await this.outbox(connection, {
        eventId: `affiliate-conversion-${semanticDigest.slice(0, 48)}`,
        eventType: "AffiliateConversionAssociated",
        aggregateType: "conversion",
        aggregateId: conversion.id,
        payload: {
          conversionAssociationId: conversion.id,
          attributionId: conversion.attributionId,
          affiliateId: conversion.affiliateId,
          orderId: conversion.orderId,
          financialEvidenceDigest: conversion.financialEvidenceDigest,
          policyVersion: conversion.policyVersion,
        },
        occurredAt: input.occurredAt,
      });
      await this.emitEntitlementChanged(
        connection,
        entitlement,
        entitlementDigest,
        semanticDigest,
        input.occurredAt,
      );
      const outcome: AssociateConversionResult = {
        conversion,
        entitlement,
        replayed: false,
      };
      await this.storeOutcome(connection, key, outcome);
      await connection.commit();
      return outcome;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async transitionEntitlement(
    input: TransitionEntitlementInput,
  ): Promise<TransitionEntitlementResult> {
    const snapshot = await this.readEntitlement(input.entitlementId);
    if (!snapshot) throw new Error("AFFILIATE_ENTITLEMENT_NOT_FOUND");
    const authorized = await this.dependencies.authorization.authorize(
      "affiliate.change_entitlement",
      {
        actorKind: "service",
        actorReference: input.actorReference,
        affiliateId: snapshot.affiliateId,
        programId: snapshot.programId,
        correlationId: input.correlationId,
      },
    );
    this.assertAuthorized(authorized);
    const semanticDigest = await this.digest({
      operation: "transition_commission",
      entitlementId: input.entitlementId,
      operationId: input.operationId,
      action: input.action,
      occurredAt: input.occurredAt,
    });
    const key = `affiliate:entitlement:${input.entitlementId}:${input.operationId}`;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const replay = await this.claim<TransitionEntitlementResult>(
        connection,
        key,
        semanticDigest,
      );
      if (replay) {
        await connection.commit();
        return { ...replay, replayed: true };
      }
      const lockedEligibility = await lockAffiliateEligibilitySnapshot(
        connection,
        snapshot.affiliateId,
        snapshot.programId,
      );
      const current = await this.lockEntitlement(
        connection,
        input.entitlementId,
      );
      if (!current) throw new Error("AFFILIATE_ENTITLEMENT_NOT_FOUND");

      const canBecomeActive = lockedEligibility.programStatus === "active";
      const next =
        input.action === "earn"
          ? canBecomeActive
            ? markEntitlementEarned(
                current,
                lockedEligibility.snapshot,
                input.occurredAt,
              )
            : null
          : input.action === "dispute"
            ? disputeEntitlement(current, input.occurredAt)
            : resolveEntitlementDispute(
                current,
                input.action === "restore"
                  ? "restore"
                  : input.action === "cancel_dispute"
                    ? "cancel"
                    : "reverse",
                canBecomeActive
                  ? lockedEligibility.snapshot
                  : {
                      ...lockedEligibility.snapshot,
                      membershipStatus: "suspended",
                    },
                input.occurredAt,
              );
      if (!next) throw new Error("AFFILIATE_ENTITLEMENT_TRANSITION_INVALID");
      await this.updateEntitlement(
        connection,
        current,
        next,
        `lifecycle_${input.action}`,
      );
      const entitlementDigest = await this.digest(next);
      await this.audit(connection, {
        operation: "affiliate.change_entitlement",
        actorReference: input.actorReference,
        authorizationDecisionReference: authorized.decisionReference,
        affiliateId: next.affiliateId,
        subjectReference: next.id,
        policyVersion: next.policyVersion,
        idempotencyDigest: semanticDigest,
        correlationId: input.correlationId,
        causationId: input.operationId,
        occurredAt: input.occurredAt,
        reason: `commission_${input.action}`,
      });
      await this.emitEntitlementChanged(
        connection,
        next,
        entitlementDigest,
        semanticDigest,
        input.occurredAt,
      );
      const outcome: TransitionEntitlementResult = {
        entitlement: next,
        replayed: false,
      };
      await this.storeOutcome(connection, key, outcome);
      await connection.commit();
      return outcome;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async applyFinancialAdjustment(
    input: ApplyFinancialAdjustmentInput,
  ): Promise<ApplyFinancialAdjustmentResult> {
    const snapshot = await this.readEntitlement(input.entitlementId);
    if (!snapshot) throw new Error("AFFILIATE_ENTITLEMENT_NOT_FOUND");
    const [conversionRows] = await this.pool.execute<ConversionRow[]>(
      "SELECT * FROM affiliate_conversions WHERE conversion_id = ? LIMIT 1",
      [snapshot.conversionAssociationId],
    );
    const conversionRow = conversionRows[0];
    if (!conversionRow) throw new Error("AFFILIATE_CONVERSION_NOT_FOUND");
    const conversion = conversionFromRow(conversionRow);
    const evidence =
      await this.dependencies.financialAdjustments.getAdjustmentEvidence(
        input.adjustmentReference,
      );
    if (!evidence || evidence.contractVersion !== 1) {
      throw new Error("AFFILIATE_FINANCIAL_ADJUSTMENT_MISSING");
    }
    if (evidence.orderId !== conversion.orderId) {
      throw new Error("AFFILIATE_FINANCIAL_ADJUSTMENT_ORDER_MISMATCH");
    }
    const authorized = await this.dependencies.authorization.authorize(
      "affiliate.change_entitlement",
      {
        actorKind: "service",
        actorReference: input.actorReference,
        affiliateId: snapshot.affiliateId,
        programId: snapshot.programId,
        correlationId: input.correlationId,
      },
    );
    this.assertAuthorized(authorized);

    const semanticDigest = await this.digest({
      operation: "apply_financial_adjustment",
      entitlementId: input.entitlementId,
      evidence,
    });
    const key = `affiliate:adjustment:${input.entitlementId}:${input.adjustmentReference}`;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const replay = await this.claim<ApplyFinancialAdjustmentResult>(
        connection,
        key,
        semanticDigest,
      );
      if (replay) {
        await connection.commit();
        return { ...replay, replayed: true };
      }
      const current = await this.lockEntitlement(
        connection,
        input.entitlementId,
      );
      if (!current) throw new Error("AFFILIATE_ENTITLEMENT_NOT_FOUND");
      const consequence = applyRefundConsequence({
        entitlement: current,
        updatedEligibleRevenueMinorUnits:
          evidence.updatedEligibleRevenueMinorUnits,
        refundEvidenceDigest: evidence.evidenceDigest,
        occurredAt: evidence.occurredAt,
      });
      if (!consequence) {
        throw new Error("AFFILIATE_FINANCIAL_ADJUSTMENT_INVALID");
      }

      let outcome: ApplyFinancialAdjustmentResult;
      let durableEntitlement: CommissionEntitlement;
      if (consequence.kind === "pending_reprice") {
        durableEntitlement = consequence.entitlement;
        await this.updateEntitlement(
          connection,
          current,
          durableEntitlement,
          evidence.kind,
        );
        outcome = {
          kind: "pending_reprice",
          entitlement: durableEntitlement,
          replayed: false,
        };
      } else {
        durableEntitlement = Object.freeze({
          ...current,
          revision: current.revision + 1,
          status: consequence.full
            ? "reversed"
            : current.status === "disputed"
              ? "disputed"
              : "earned",
          disputedFrom:
            consequence.full || current.status !== "disputed" ? null : "earned",
          eligibleRevenueMinorUnits: evidence.updatedEligibleRevenueMinorUnits,
          commissionMinorUnits: consequence.remainingCommissionMinorUnits,
          updatedAt: evidence.occurredAt,
        });
        await this.updateEntitlement(
          connection,
          current,
          durableEntitlement,
          `${evidence.kind}_earned_reversal`,
        );
        await this.outbox(connection, {
          eventId: `affiliate-reversal-${semanticDigest.slice(0, 48)}`,
          eventType: "AffiliateFinancialReconciliationRequired",
          aggregateType: "commission_entitlement",
          aggregateId: semanticDigest,
          payload: {
            contractVersion: 1,
            entitlementId: durableEntitlement.id,
            entitlementRevision: durableEntitlement.revision,
            conversionAssociationId: durableEntitlement.conversionAssociationId,
            orderId: conversion.orderId,
            financialAdjustmentReference: evidence.adjustmentReference,
            financialEvidenceDigest: evidence.evidenceDigest,
            policyVersion: durableEntitlement.policyVersion,
            full: consequence.full,
            correlationId: input.correlationId,
          },
          occurredAt: evidence.occurredAt,
        });
        outcome = {
          kind: "earned_reversal_required",
          reversal: consequence,
          entitlement: durableEntitlement,
          replayed: false,
        };
      }

      const entitlementDigest = await this.digest(durableEntitlement);
      await this.emitEntitlementChanged(
        connection,
        durableEntitlement,
        entitlementDigest,
        semanticDigest,
        evidence.occurredAt,
      );
      await this.audit(connection, {
        operation: "affiliate.change_entitlement",
        actorReference: input.actorReference,
        authorizationDecisionReference: authorized.decisionReference,
        affiliateId: durableEntitlement.affiliateId,
        subjectReference: durableEntitlement.id,
        policyVersion: durableEntitlement.policyVersion,
        idempotencyDigest: semanticDigest,
        correlationId: input.correlationId,
        causationId: evidence.adjustmentReference,
        occurredAt: evidence.occurredAt,
        reason:
          outcome.kind === "pending_reprice"
            ? `${evidence.kind}_repriced_pending_entitlement`
            : `${evidence.kind}_requires_financial_reconciliation`,
      });
      await this.storeOutcome(connection, key, outcome);
      await connection.commit();
      return outcome;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async readEntitlement(
    entitlementId: string,
  ): Promise<CommissionEntitlement | null> {
    const [rows] = await this.pool.execute<EntitlementRow[]>(
      "SELECT * FROM affiliate_entitlements WHERE entitlement_id = ? LIMIT 1",
      [entitlementId],
    );
    return rows[0] ? entitlementFromRow(rows[0]) : null;
  }

  private assertAuthorized(
    value: Readonly<{ allowed: boolean; decisionReference: string }>,
  ): void {
    if (!value.allowed) throw new Error("AFFILIATE_AUTHORIZATION_DENIED");
    if (!value.decisionReference) {
      throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
    }
  }

  private async digest(value: unknown): Promise<string> {
    const digest = await this.dependencies.digest.sha256(stable(value));
    if (!/^[a-f0-9]{64}$/u.test(digest)) {
      throw new Error("AFFILIATE_IDEMPOTENCY_DIGEST_INVALID");
    }
    return digest;
  }

  private async claim<T>(
    connection: PoolConnection,
    key: string,
    semanticDigest: string,
  ): Promise<T | null> {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT IGNORE INTO affiliate_idempotency_claims
       (idempotency_key, semantic_digest, outcome_json, created_at)
       VALUES (?, UNHEX(?), NULL, UTC_TIMESTAMP(3))`,
      [key, semanticDigest],
    );
    if (result.affectedRows === 1) return null;
    const [rows] = await connection.execute<IdempotencyRow[]>(
      `SELECT semantic_digest, outcome_json FROM affiliate_idempotency_claims
       WHERE idempotency_key = ? FOR UPDATE`,
      [key],
    );
    const row = rows[0];
    if (!row) throw new Error("AFFILIATE_IDEMPOTENCY_CLAIM_MISSING");
    if (row.semantic_digest.toString("hex") !== semanticDigest) {
      throw new Error("AFFILIATE_IDEMPOTENCY_CONFLICT");
    }
    const outcome = parsedOutcome<T>(row.outcome_json);
    if (!outcome) throw new Error("AFFILIATE_IDEMPOTENCY_RESULT_MISSING");
    return outcome;
  }

  private async storeOutcome(
    connection: PoolConnection,
    key: string,
    outcome: unknown,
  ): Promise<void> {
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE affiliate_idempotency_claims SET outcome_json = ?
       WHERE idempotency_key = ? AND outcome_json IS NULL`,
      [JSON.stringify(outcome), key],
    );
    if (result.affectedRows !== 1) {
      throw new Error("AFFILIATE_IDEMPOTENCY_OUTCOME_CONFLICT");
    }
  }

  private async lockEntitlement(
    connection: PoolConnection,
    entitlementId: string,
  ): Promise<CommissionEntitlement | null> {
    const [rows] = await connection.execute<EntitlementRow[]>(
      "SELECT * FROM affiliate_entitlements WHERE entitlement_id = ? FOR UPDATE",
      [entitlementId],
    );
    return rows[0] ? entitlementFromRow(rows[0]) : null;
  }

  private async insertConversion(
    connection: PoolConnection,
    conversion: ConversionAssociation,
  ): Promise<void> {
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
        date(conversion.paymentConfirmedAt),
        conversion.serviceOccurredAt
          ? date(conversion.serviceOccurredAt)
          : null,
        conversion.conversionKind,
        conversion.policyVersion,
        date(conversion.createdAt),
      ],
    );
  }

  private async insertEntitlement(
    connection: PoolConnection,
    entitlement: CommissionEntitlement,
    reason: string,
  ): Promise<void> {
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
        date(entitlement.maturityAt),
        date(entitlement.createdAt),
        date(entitlement.updatedAt),
      ],
    );
    await this.insertRevision(connection, entitlement, reason);
  }

  private async updateEntitlement(
    connection: PoolConnection,
    current: CommissionEntitlement,
    next: CommissionEntitlement,
    reason: string,
  ): Promise<void> {
    if (
      next.id !== current.id ||
      next.revision !== current.revision + 1 ||
      next.rateBasisPoints !== current.rateBasisPoints ||
      next.policyVersion !== current.policyVersion ||
      next.currency !== current.currency
    ) {
      throw new Error("AFFILIATE_ENTITLEMENT_REVISION_INVALID");
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE affiliate_entitlements SET revision = ?, status = ?, disputed_from = ?,
       eligible_revenue_minor = ?, commission_minor = ?, updated_at = ?
       WHERE entitlement_id = ? AND revision = ?`,
      [
        next.revision,
        next.status,
        next.disputedFrom,
        next.eligibleRevenueMinorUnits,
        next.commissionMinorUnits,
        date(next.updatedAt),
        current.id,
        current.revision,
      ],
    );
    if (result.affectedRows !== 1) {
      throw new Error("AFFILIATE_ENTITLEMENT_REVISION_CONFLICT");
    }
    await this.insertRevision(connection, next, reason);
  }

  private async insertRevision(
    connection: PoolConnection,
    entitlement: CommissionEntitlement,
    reason: string,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO affiliate_entitlement_revisions
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
        reason,
        date(entitlement.updatedAt),
      ],
    );
  }

  private async emitEntitlementChanged(
    connection: PoolConnection,
    entitlement: CommissionEntitlement,
    entitlementDigest: string,
    semanticDigest: string,
    occurredAt: string,
  ): Promise<void> {
    await this.outbox(connection, {
      eventId: `affiliate-entitlement-${semanticDigest.slice(0, 48)}`,
      eventType: "AffiliateCommissionEntitlementChanged",
      aggregateType: "commission_entitlement_revision",
      aggregateId: entitlementDigest,
      payload: {
        entitlementId: entitlement.id,
        revision: entitlement.revision,
        affiliateId: entitlement.affiliateId,
        conversionAssociationId: entitlement.conversionAssociationId,
        status: entitlement.status,
        policyVersion: entitlement.policyVersion,
        entitlementDigest,
      },
      occurredAt,
    });
  }

  private async audit(
    connection: PoolConnection,
    entry: Readonly<{
      operation: string;
      actorReference: string;
      authorizationDecisionReference: string;
      affiliateId: string;
      subjectReference: string;
      policyVersion: string;
      idempotencyDigest: string;
      correlationId: string;
      causationId?: string;
      occurredAt: string;
      reason: string;
    }>,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO affiliate_audit_events
       (audit_id, operation, contract_version, actor_kind, actor_reference,
        authorization_decision_reference, affiliate_id, subject_reference, policy_version,
        idempotency_digest, correlation_id, causation_id, occurred_at, outcome, reason)
       VALUES (?, ?, 1, 'service', ?, ?, ?, ?, ?, UNHEX(?), ?, ?, ?, 'accepted', ?)`,
      [
        `audit-${entry.idempotencyDigest.slice(0, 48)}`,
        entry.operation,
        entry.actorReference,
        entry.authorizationDecisionReference,
        entry.affiliateId,
        entry.subjectReference,
        entry.policyVersion,
        entry.idempotencyDigest,
        entry.correlationId,
        entry.causationId ?? null,
        date(entry.occurredAt),
        entry.reason,
      ],
    );
  }

  private async outbox(
    connection: PoolConnection,
    event: Readonly<{
      eventId: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Readonly<Record<string, unknown>>;
      occurredAt: string;
    }>,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO affiliate_outbox_events
       (event_id, event_type, aggregate_type, aggregate_id, contract_version, payload_json,
        status, attempts, available_at, created_at)
       VALUES (?, ?, ?, ?, 1, ?, 'pending', 0, ?, ?)`,
      [
        event.eventId,
        event.eventType,
        event.aggregateType,
        event.aggregateId,
        JSON.stringify(event.payload),
        date(event.occurredAt),
        date(event.occurredAt),
      ],
    );
  }
}
