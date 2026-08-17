import type {
  AffiliateId,
  AffiliateMembershipId,
  AffiliateProgramId,
} from "./ids.js";

export interface AffiliateAccount {
  readonly id: AffiliateId;
  readonly identityReference: string;
  readonly accountType: "person" | "organization";
  readonly createdAt: string;
}

export type AffiliateMembershipStatus =
  | "pending"
  | "approved"
  | "suspended"
  | "closed";

export interface AffiliateProgramMembership {
  readonly id: AffiliateMembershipId;
  readonly affiliateId: AffiliateId;
  readonly programId: AffiliateProgramId;
  readonly status: AffiliateMembershipStatus;
  readonly acceptedTermsVersion: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type FinancialOnboardingStatus =
  | "not_started"
  | "pending"
  | "eligible"
  | "blocked";

export interface AffiliateEligibilitySnapshot {
  readonly identityVerified: boolean;
  readonly contactVerified: boolean;
  readonly acceptedTermsVersion: string | null;
  readonly membershipStatus: AffiliateMembershipStatus;
  readonly fraudBlocked: boolean;
  readonly financialOnboardingStatus: FinancialOnboardingStatus;
}

export function isActiveForAttribution(
  snapshot: AffiliateEligibilitySnapshot,
): boolean {
  return (
    snapshot.identityVerified &&
    snapshot.contactVerified &&
    snapshot.acceptedTermsVersion !== null &&
    snapshot.acceptedTermsVersion.length > 0 &&
    snapshot.membershipStatus === "approved" &&
    !snapshot.fraudBlocked
  );
}

export function isEligibleForFinancialMaterialization(
  snapshot: AffiliateEligibilitySnapshot,
): boolean {
  return (
    isActiveForAttribution(snapshot) &&
    snapshot.financialOnboardingStatus === "eligible"
  );
}
