import {
  AFFILIATE_POLICY_V1,
  type AffiliateAuthorizationAction,
  type AffiliateAuthorizationContext,
  type AffiliateAuthorizationPort,
  type AffiliateMembershipStatus,
} from "@touristic/affiliates";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

export interface AffiliateIdentityActor {
  readonly actorKind: AffiliateAuthorizationContext["actorKind"];
  readonly actorReference: string;
  readonly correlationId: string;
}

export interface AffiliateIdentityRecord {
  readonly affiliateId: string;
  readonly identityReference: string;
  readonly pseudonymousReference: string;
  readonly accountType: "person" | "organization";
  readonly roleCategory: string;
  readonly status: "active" | "suspended" | "inactive";
  readonly identityVerified: boolean;
  readonly contactVerified: boolean;
  readonly fraudBlocked: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AffiliateMembershipRecord {
  readonly membershipId: string;
  readonly affiliateId: string;
  readonly programId: string;
  readonly destinationId: string;
  readonly status: AffiliateMembershipStatus;
  readonly acceptedTermsVersion: string | null;
  readonly financialOnboardingStatus:
    "not_started" | "pending" | "eligible" | "blocked";
  readonly joinedAt: string;
  readonly endedAt: string | null;
  readonly updatedAt: string;
}

interface AffiliateRow extends RowDataPacket {
  affiliate_id: string;
  identity_reference: string;
  pseudonymous_reference: string;
  account_type: "person" | "organization";
  role_category: string;
  status: "active" | "suspended" | "inactive";
  identity_verified: number;
  contact_verified: number;
  fraud_blocked: number;
  created_at: Date;
  updated_at: Date;
}

interface MembershipRow extends RowDataPacket {
  membership_id: string;
  affiliate_id: string;
  program_id: string;
  destination_id: string;
  status: AffiliateMembershipStatus;
  accepted_terms_version: string | null;
  financial_onboarding_status:
    "not_started" | "pending" | "eligible" | "blocked";
  joined_at: Date;
  ended_at: Date | null;
  updated_at: Date;
}

interface ProgramRow extends RowDataPacket {
  program_id: string;
  destination_id: string;
  status: "active" | "inactive";
  terms_version: string;
}

function affiliateFromRow(row: AffiliateRow): AffiliateIdentityRecord {
  return Object.freeze({
    affiliateId: row.affiliate_id,
    identityReference: row.identity_reference,
    pseudonymousReference: row.pseudonymous_reference,
    accountType: row.account_type,
    roleCategory: row.role_category,
    status: row.status,
    identityVerified: row.identity_verified === 1,
    contactVerified: row.contact_verified === 1,
    fraudBlocked: row.fraud_blocked === 1,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function membershipFromRow(row: MembershipRow): AffiliateMembershipRecord {
  return Object.freeze({
    membershipId: row.membership_id,
    affiliateId: row.affiliate_id,
    programId: row.program_id,
    destinationId: row.destination_id,
    status: row.status,
    acceptedTermsVersion: row.accepted_terms_version,
    financialOnboardingStatus: row.financial_onboarding_status,
    joinedAt: row.joined_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  });
}

function assertAuthenticated(actor: AffiliateIdentityActor): void {
  if (
    actor.actorKind === "public" ||
    actor.actorReference.trim().length === 0 ||
    actor.correlationId.trim().length === 0
  ) {
    throw new Error("AFFILIATE_AUTHENTICATION_REQUIRED");
  }
}

export function isAffiliateMembershipTransitionAllowed(
  from: AffiliateMembershipStatus,
  to: AffiliateMembershipStatus,
): boolean {
  if (from === to || from === "closed") return false;
  if (to === "closed") return true;
  if (from === "pending") return to === "approved";
  if (from === "approved") return to === "suspended";
  return from === "suspended" && to === "approved";
}

export class AffiliateIdentityApplicationService {
  public constructor(
    private readonly pool: Pool,
    private readonly authorization: AffiliateAuthorizationPort,
  ) {}

  private async authorize(
    action: AffiliateAuthorizationAction,
    actor: AffiliateIdentityActor,
    affiliateId?: string,
    programId?: string,
  ): Promise<string> {
    assertAuthenticated(actor);
    const context: AffiliateAuthorizationContext = {
      actorKind: actor.actorKind,
      actorReference: actor.actorReference,
      correlationId: actor.correlationId,
      ...(affiliateId ? { affiliateId: affiliateId as never } : {}),
      ...(programId ? { programId: programId as never } : {}),
    };
    const decision = await this.authorization.authorize(action, context);
    if (!decision.allowed) throw new Error("AFFILIATE_AUTHORIZATION_DENIED");
    if (!decision.decisionReference)
      throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
    return decision.decisionReference;
  }

  public async createAffiliate(
    input: Readonly<{
      actor: AffiliateIdentityActor;
      affiliateId: string;
      identityReference: string;
      pseudonymousReference: string;
      accountType: "person" | "organization";
      roleCategory: string;
      occurredAt: string;
    }>,
  ): Promise<AffiliateIdentityRecord> {
    if (
      input.actor.actorKind === "affiliate" &&
      input.actor.actorReference !== input.identityReference
    )
      throw new Error("AFFILIATE_MISMATCH");
    const decision = await this.authorize(
      "affiliate.manage_identity",
      input.actor,
      input.affiliateId,
    );
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existing] = await connection.execute<AffiliateRow[]>(
        "SELECT * FROM affiliate_accounts WHERE affiliate_id = ? OR identity_reference = ? FOR UPDATE",
        [input.affiliateId, input.identityReference],
      );
      if (existing.length > 0) throw new Error("AFFILIATE_ALREADY_EXISTS");
      await connection.execute(
        `INSERT INTO affiliate_accounts
         (affiliate_id, identity_reference, pseudonymous_reference, account_type, role_category,
          status, identity_verified, contact_verified, fraud_blocked, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', 0, 0, 0, ?, ?)`,
        [
          input.affiliateId,
          input.identityReference,
          input.pseudonymousReference,
          input.accountType,
          input.roleCategory,
          new Date(input.occurredAt),
          new Date(input.occurredAt),
        ],
      );
      await this.insertAudit(connection, {
        operation: "affiliate.manage_identity",
        actor: input.actor,
        decisionReference: decision,
        affiliateId: input.affiliateId,
        subjectReference: input.identityReference,
        reason: "affiliate_created",
        occurredAt: input.occurredAt,
      });
      const created = await this.lockAffiliate(connection, input.affiliateId);
      if (!created) throw new Error("AFFILIATE_CREATE_READBACK_MISSING");
      await connection.commit();
      return affiliateFromRow(created);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async readAffiliate(
    input: Readonly<{
      actor: AffiliateIdentityActor;
      affiliateId: string;
    }>,
  ): Promise<AffiliateIdentityRecord | null> {
    await this.authorize(
      "affiliate.manage_identity",
      input.actor,
      input.affiliateId,
    );
    const [rows] = await this.pool.execute<AffiliateRow[]>(
      "SELECT * FROM affiliate_accounts WHERE affiliate_id = ? LIMIT 1",
      [input.affiliateId],
    );
    const row = rows[0];
    if (!row) return null;
    if (
      input.actor.actorKind === "affiliate" &&
      row.identity_reference !== input.actor.actorReference
    )
      throw new Error("AFFILIATE_MISMATCH");
    return affiliateFromRow(row);
  }

  public async updateAllowedProfileFields(
    input: Readonly<{
      actor: AffiliateIdentityActor;
      affiliateId: string;
      roleCategory: string;
      occurredAt: string;
    }>,
  ): Promise<AffiliateIdentityRecord> {
    const decision = await this.authorize(
      "affiliate.manage_identity",
      input.actor,
      input.affiliateId,
    );
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await this.lockAffiliate(connection, input.affiliateId);
      if (!current) throw new Error("AFFILIATE_NOT_FOUND");
      if (
        input.actor.actorKind === "affiliate" &&
        current.identity_reference !== input.actor.actorReference
      ) {
        throw new Error("AFFILIATE_MISMATCH");
      }
      await connection.execute<ResultSetHeader>(
        "UPDATE affiliate_accounts SET role_category = ?, updated_at = ? WHERE affiliate_id = ?",
        [input.roleCategory, new Date(input.occurredAt), input.affiliateId],
      );
      await this.insertAudit(connection, {
        operation: "affiliate.manage_identity",
        actor: input.actor,
        decisionReference: decision,
        affiliateId: input.affiliateId,
        subjectReference: input.affiliateId,
        reason: "affiliate_profile_updated",
        occurredAt: input.occurredAt,
      });
      const updated = await this.lockAffiliate(connection, input.affiliateId);
      if (!updated) throw new Error("AFFILIATE_UPDATE_READBACK_MISSING");
      await connection.commit();
      return affiliateFromRow(updated);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async createMembership(
    input: Readonly<{
      actor: AffiliateIdentityActor;
      membershipId: string;
      affiliateId: string;
      programId: string;
      destinationId: string;
      acceptedTermsVersion: string | null;
      occurredAt: string;
    }>,
  ): Promise<AffiliateMembershipRecord> {
    const decision = await this.authorize(
      "affiliate.manage_membership",
      input.actor,
      input.affiliateId,
      input.programId,
    );
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const affiliate = await this.lockAffiliate(connection, input.affiliateId);
      if (!affiliate) throw new Error("AFFILIATE_NOT_FOUND");
      if (
        input.actor.actorKind === "affiliate" &&
        affiliate.identity_reference !== input.actor.actorReference
      ) {
        throw new Error("AFFILIATE_MISMATCH");
      }
      const program = await this.lockProgram(connection, input.programId);
      if (!program || program.destination_id !== input.destinationId)
        throw new Error("AFFILIATE_PROGRAM_NOT_FOUND");
      if (program.status !== "active")
        throw new Error("AFFILIATE_PROGRAM_INACTIVE");
      const [duplicate] = await connection.execute<MembershipRow[]>(
        `SELECT m.*, p.destination_id FROM affiliate_memberships m
         JOIN affiliate_programs p ON p.program_id = m.program_id
         WHERE m.affiliate_id = ? AND m.program_id = ? FOR UPDATE`,
        [input.affiliateId, input.programId],
      );
      if (duplicate.length > 0)
        throw new Error("AFFILIATE_MEMBERSHIP_DUPLICATE");
      await connection.execute(
        `INSERT INTO affiliate_memberships
         (membership_id, affiliate_id, program_id, status, accepted_terms_version,
          financial_onboarding_status, joined_at, ended_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, 'not_started', ?, NULL, ?)`,
        [
          input.membershipId,
          input.affiliateId,
          input.programId,
          input.acceptedTermsVersion,
          new Date(input.occurredAt),
          new Date(input.occurredAt),
        ],
      );
      await this.insertAudit(connection, {
        operation: "affiliate.manage_membership",
        actor: input.actor,
        decisionReference: decision,
        affiliateId: input.affiliateId,
        subjectReference: input.membershipId,
        reason: "affiliate_membership_created",
        occurredAt: input.occurredAt,
      });
      const created = await this.lockMembership(
        connection,
        input.affiliateId,
        input.programId,
        input.destinationId,
      );
      if (!created) throw new Error("AFFILIATE_MEMBERSHIP_READBACK_MISSING");
      await connection.commit();
      return membershipFromRow(created);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async readMembership(
    input: Readonly<{
      actor: AffiliateIdentityActor;
      affiliateId: string;
      programId: string;
      destinationId: string;
    }>,
  ): Promise<AffiliateMembershipRecord | null> {
    await this.authorize(
      "affiliate.manage_membership",
      input.actor,
      input.affiliateId,
      input.programId,
    );
    const affiliate = await this.readAffiliateForOwnership(input.affiliateId);
    if (!affiliate) return null;
    if (
      input.actor.actorKind === "affiliate" &&
      affiliate.identity_reference !== input.actor.actorReference
    ) {
      throw new Error("AFFILIATE_MISMATCH");
    }
    const [rows] = await this.pool.execute<MembershipRow[]>(
      `SELECT m.*, p.destination_id FROM affiliate_memberships m
       JOIN affiliate_programs p ON p.program_id = m.program_id
       WHERE m.affiliate_id = ? AND m.program_id = ? AND p.destination_id = ? LIMIT 1`,
      [input.affiliateId, input.programId, input.destinationId],
    );
    return rows[0] ? membershipFromRow(rows[0]) : null;
  }

  public async changeMembershipStatus(
    input: Readonly<{
      actor: AffiliateIdentityActor;
      affiliateId: string;
      programId: string;
      destinationId: string;
      status: AffiliateMembershipStatus;
      occurredAt: string;
    }>,
  ): Promise<AffiliateMembershipRecord> {
    const decision = await this.authorize(
      "affiliate.administer",
      input.actor,
      input.affiliateId,
      input.programId,
    );
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await this.lockMembership(
        connection,
        input.affiliateId,
        input.programId,
        input.destinationId,
      );
      if (!current) throw new Error("AFFILIATE_MEMBERSHIP_NOT_FOUND");
      if (!isAffiliateMembershipTransitionAllowed(current.status, input.status))
        throw new Error("AFFILIATE_MEMBERSHIP_TRANSITION_INVALID");
      await connection.execute(
        `UPDATE affiliate_memberships
         SET status = ?, ended_at = ?, updated_at = ?
         WHERE membership_id = ?`,
        [
          input.status,
          input.status === "closed" ? new Date(input.occurredAt) : null,
          new Date(input.occurredAt),
          current.membership_id,
        ],
      );
      await this.insertAudit(connection, {
        operation: "affiliate.administer",
        actor: input.actor,
        decisionReference: decision,
        affiliateId: input.affiliateId,
        subjectReference: current.membership_id,
        reason: `affiliate_membership_${input.status}`,
        occurredAt: input.occurredAt,
      });
      const updated = await this.lockMembership(
        connection,
        input.affiliateId,
        input.programId,
        input.destinationId,
      );
      if (!updated) throw new Error("AFFILIATE_MEMBERSHIP_READBACK_MISSING");
      await connection.commit();
      return membershipFromRow(updated);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async lockAffiliate(
    connection: PoolConnection,
    affiliateId: string,
  ): Promise<AffiliateRow | null> {
    const [rows] = await connection.execute<AffiliateRow[]>(
      "SELECT * FROM affiliate_accounts WHERE affiliate_id = ? LIMIT 1 FOR UPDATE",
      [affiliateId],
    );
    return rows[0] ?? null;
  }

  private async readAffiliateForOwnership(
    affiliateId: string,
  ): Promise<AffiliateRow | null> {
    const [rows] = await this.pool.execute<AffiliateRow[]>(
      "SELECT * FROM affiliate_accounts WHERE affiliate_id = ? LIMIT 1",
      [affiliateId],
    );
    return rows[0] ?? null;
  }

  private async lockProgram(
    connection: PoolConnection,
    programId: string,
  ): Promise<ProgramRow | null> {
    const [rows] = await connection.execute<ProgramRow[]>(
      "SELECT * FROM affiliate_programs WHERE program_id = ? LIMIT 1 FOR UPDATE",
      [programId],
    );
    return rows[0] ?? null;
  }

  private async lockMembership(
    connection: PoolConnection,
    affiliateId: string,
    programId: string,
    destinationId: string,
  ): Promise<MembershipRow | null> {
    const [rows] = await connection.execute<MembershipRow[]>(
      `SELECT m.*, p.destination_id FROM affiliate_memberships m
       JOIN affiliate_programs p ON p.program_id = m.program_id
       WHERE m.affiliate_id = ? AND m.program_id = ? AND p.destination_id = ?
       LIMIT 1 FOR UPDATE`,
      [affiliateId, programId, destinationId],
    );
    return rows[0] ?? null;
  }

  private async insertAudit(
    connection: PoolConnection,
    input: Readonly<{
      operation: AffiliateAuthorizationAction;
      actor: AffiliateIdentityActor;
      decisionReference: string;
      affiliateId: string;
      subjectReference: string;
      reason: string;
      occurredAt: string;
    }>,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO affiliate_audit_events
       (audit_id, operation, contract_version, actor_kind, actor_reference,
        authorization_decision_reference, affiliate_id, subject_reference, policy_version,
        before_digest, after_digest, idempotency_digest, correlation_id, causation_id,
        occurred_at, outcome, reason)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, NULL, NULL, UNHEX(SHA2(?, 256)), ?, NULL, ?, 'accepted', ?)`,
      [
        `aud:${input.operation}:${input.actor.correlationId}`.slice(0, 120),
        input.operation,
        input.actor.actorKind,
        input.actor.actorReference,
        input.decisionReference,
        input.affiliateId,
        input.subjectReference,
        AFFILIATE_POLICY_V1.version,
        `${input.operation}:${input.affiliateId}:${input.subjectReference}:${input.actor.correlationId}`,
        input.actor.correlationId,
        new Date(input.occurredAt),
        input.reason,
      ],
    );
  }
}
