import {
  isActiveForAttribution,
  type AffiliateEligibilitySnapshot,
  type AffiliateMembershipStatus,
  type FinancialOnboardingStatus,
} from "@touristic/affiliates";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

interface EligibilityRow extends RowDataPacket {
  identity_verified: number;
  contact_verified: number;
  accepted_terms_version: string | null;
  membership_status: string;
  fraud_blocked: number;
  financial_onboarding_status: string;
  program_status: string;
  destination_id: string;
}

export interface LockedAffiliateEligibility {
  readonly snapshot: AffiliateEligibilitySnapshot;
  readonly programStatus: "active" | "inactive";
  readonly destinationId: string;
}

function membershipStatus(value: string): AffiliateMembershipStatus {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "suspended" ||
    value === "closed"
  ) {
    return value;
  }
  throw new Error("AFFILIATE_ELIGIBILITY_CONTEXT_INVALID");
}

function financialStatus(value: string): FinancialOnboardingStatus {
  if (
    value === "not_started" ||
    value === "pending" ||
    value === "eligible" ||
    value === "blocked"
  ) {
    return value;
  }
  throw new Error("AFFILIATE_ELIGIBILITY_CONTEXT_INVALID");
}

function programStatus(value: string): "active" | "inactive" {
  if (value === "active" || value === "inactive") return value;
  throw new Error("AFFILIATE_ELIGIBILITY_CONTEXT_INVALID");
}

/**
 * Locks the account/membership/program tuple used by eligibility and suspension
 * mutations. Callers that must preserve historical evidence during suspension
 * can inspect the returned snapshot without incorrectly rejecting it.
 */
export async function lockAffiliateEligibilitySnapshot(
  connection: PoolConnection,
  affiliateId: string,
  programId: string,
): Promise<LockedAffiliateEligibility> {
  if (!affiliateId || !programId) {
    throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
  }
  const [rows] = await connection.execute<EligibilityRow[]>(
    `SELECT
       a.identity_verified,
       a.contact_verified,
       a.fraud_blocked,
       m.accepted_terms_version,
       m.status AS membership_status,
       m.financial_onboarding_status,
       p.status AS program_status,
       p.destination_id
     FROM affiliate_accounts a
     JOIN affiliate_memberships m ON m.affiliate_id = a.affiliate_id
     JOIN affiliate_programs p ON p.program_id = m.program_id
     WHERE a.affiliate_id = ? AND m.program_id = ?
     LIMIT 1 FOR UPDATE`,
    [affiliateId, programId],
  );
  const row = rows[0];
  if (!row) throw new Error("AFFILIATE_ELIGIBILITY_CONTEXT_MISSING");

  return {
    snapshot: {
      identityVerified: row.identity_verified === 1,
      contactVerified: row.contact_verified === 1,
      acceptedTermsVersion: row.accepted_terms_version,
      membershipStatus: membershipStatus(row.membership_status),
      fraudBlocked: row.fraud_blocked === 1,
      financialOnboardingStatus: financialStatus(row.financial_onboarding_status),
    },
    programStatus: programStatus(row.program_status),
    destinationId: row.destination_id,
  };
}

/**
 * Locks the same account/membership/program rows used by suspension changes.
 * This closes the check/use race: a suspension that commits first is observed
 * as suspended; an operation holding the lock first is ordered before it.
 */
export async function lockAndAssertAffiliateAttributionEligibility(
  connection: PoolConnection,
  affiliateId: string,
  programId: string,
  destinationId: string,
): Promise<AffiliateEligibilitySnapshot> {
  if (!destinationId) {
    throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
  }
  const locked = await lockAffiliateEligibilitySnapshot(
    connection,
    affiliateId,
    programId,
  );
  if (
    locked.destinationId !== destinationId ||
    locked.programStatus !== "active" ||
    !isActiveForAttribution(locked.snapshot)
  ) {
    throw new Error("AFFILIATE_NOT_ELIGIBLE");
  }
  return locked.snapshot;
}
