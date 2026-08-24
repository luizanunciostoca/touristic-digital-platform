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
  if (!affiliateId || !programId || !destinationId)
    throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
  const [rows] = await connection.execute<EligibilityRow[]>(
    `SELECT
       a.identity_verified,
       a.contact_verified,
       a.fraud_blocked,
       m.accepted_terms_version,
       m.status AS membership_status,
       m.financial_onboarding_status,
       p.status AS program_status
     FROM affiliate_accounts a
     JOIN affiliate_memberships m ON m.affiliate_id = a.affiliate_id
     JOIN affiliate_programs p ON p.program_id = m.program_id
     WHERE a.affiliate_id = ? AND m.program_id = ? AND p.destination_id = ?
     LIMIT 1 FOR UPDATE`,
    [affiliateId, programId, destinationId],
  );
  const row = rows[0];
  if (!row) throw new Error("AFFILIATE_ELIGIBILITY_CONTEXT_MISSING");
  if (row.program_status !== "active")
    throw new Error("AFFILIATE_NOT_ELIGIBLE");

  const snapshot: AffiliateEligibilitySnapshot = {
    identityVerified: row.identity_verified === 1,
    contactVerified: row.contact_verified === 1,
    acceptedTermsVersion: row.accepted_terms_version,
    membershipStatus: membershipStatus(row.membership_status),
    fraudBlocked: row.fraud_blocked === 1,
    financialOnboardingStatus: financialStatus(row.financial_onboarding_status),
  };
  if (!isActiveForAttribution(snapshot))
    throw new Error("AFFILIATE_NOT_ELIGIBLE");
  return snapshot;
}
