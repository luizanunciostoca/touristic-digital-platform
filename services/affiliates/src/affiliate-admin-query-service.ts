import type { Pool, RowDataPacket } from "mysql2/promise";

export interface AffiliateAdminListItem {
  readonly affiliateId: string;
  readonly identityReference: string;
  readonly accountType: "person" | "organization";
  readonly roleCategory: string;
  readonly status: "active" | "suspended" | "inactive";
  readonly identityVerified: boolean;
  readonly contactVerified: boolean;
  readonly fraudBlocked: boolean;
  readonly membershipCount: number;
  readonly approvedMembershipCount: number;
  readonly suspendedMembershipCount: number;
  readonly conversionCount: number;
  readonly updatedAt: string;
}

export interface AffiliateAdminMembershipProjection {
  readonly membershipId: string;
  readonly programId: string;
  readonly destinationId: string;
  readonly programStatus: "active" | "inactive";
  readonly status: "pending" | "approved" | "suspended" | "closed";
  readonly acceptedTermsVersion: string | null;
  readonly financialOnboardingStatus:
    "not_started" | "pending" | "eligible" | "blocked";
  readonly eligibleForAttribution: boolean;
  readonly joinedAt: string;
  readonly endedAt: string | null;
  readonly updatedAt: string;
}

export interface AffiliateAdminMoneySummary {
  readonly currency: string;
  readonly entitlementCount: number;
  readonly pendingMinor: string;
  readonly earnedMinor: string;
  readonly reversedMinor: string;
  readonly disputedMinor: string;
}

export interface AffiliateAdminConversionProjection {
  readonly conversionId: string;
  readonly orderId: string;
  readonly paymentReference: string;
  readonly currency: string;
  readonly eligibleRevenueMinor: string;
  readonly paymentConfirmedAt: string;
  readonly createdAt: string;
  readonly entitlementId: string;
  readonly entitlementStatus:
    "pending" | "earned" | "cancelled" | "reversed" | "disputed";
  readonly commissionMinor: string;
  readonly rateBasisPoints: number;
  readonly maturityAt: string;
  readonly materializationState:
    "not_requested" | "pending" | "accepted" | "rejected";
  readonly financialReference: string | null;
  readonly rejectionCode: string | null;
}

export interface AffiliateAdminDetail {
  readonly affiliate: Omit<
    AffiliateAdminListItem,
    | "membershipCount"
    | "approvedMembershipCount"
    | "suspendedMembershipCount"
    | "conversionCount"
  >;
  readonly memberships: readonly AffiliateAdminMembershipProjection[];
  readonly summaryByCurrency: readonly AffiliateAdminMoneySummary[];
  readonly attribution: Readonly<{
    count: number;
    latestAt: string | null;
  }>;
  readonly conversions: readonly AffiliateAdminConversionProjection[];
  readonly payoutAuthority: Readonly<{
    owner: "Financial";
    affiliateCanInitiatePayout: false;
  }>;
}

interface AffiliateListRow extends RowDataPacket {
  affiliate_id: string;
  identity_reference: string;
  account_type: "person" | "organization";
  role_category: string;
  status: "active" | "suspended" | "inactive";
  identity_verified: number;
  contact_verified: number;
  fraud_blocked: number;
  membership_count: number | string;
  approved_membership_count: number | string;
  suspended_membership_count: number | string;
  conversion_count: number | string;
  updated_at: Date | string;
}

interface AffiliateAccountRow extends RowDataPacket {
  affiliate_id: string;
  identity_reference: string;
  account_type: "person" | "organization";
  role_category: string;
  status: "active" | "suspended" | "inactive";
  identity_verified: number;
  contact_verified: number;
  fraud_blocked: number;
  updated_at: Date | string;
}

interface MembershipRow extends RowDataPacket {
  membership_id: string;
  program_id: string;
  destination_id: string;
  program_status: "active" | "inactive";
  status: "pending" | "approved" | "suspended" | "closed";
  accepted_terms_version: string | null;
  financial_onboarding_status:
    "not_started" | "pending" | "eligible" | "blocked";
  joined_at: Date | string;
  ended_at: Date | string | null;
  updated_at: Date | string;
}

interface SummaryRow extends RowDataPacket {
  currency: string;
  entitlement_count: number | string;
  pending_minor: string | null;
  earned_minor: string | null;
  reversed_minor: string | null;
  disputed_minor: string | null;
}

interface AttributionRow extends RowDataPacket {
  attribution_count: number | string;
  latest_attribution_at: Date | string | null;
}

interface ConversionRow extends RowDataPacket {
  conversion_id: string;
  order_id: string;
  payment_reference: string;
  currency: string;
  eligible_revenue_minor: string;
  payment_confirmed_at: Date | string;
  created_at: Date | string;
  entitlement_id: string;
  entitlement_status:
    "pending" | "earned" | "cancelled" | "reversed" | "disputed";
  commission_minor: string;
  rate_basis_points: number | string;
  maturity_at: Date | string;
  materialization_state: "pending" | "accepted" | "rejected" | null;
  financial_reference: string | null;
  rejection_code: string | null;
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("AFFILIATE_ADMIN_INVALID_TIMESTAMP");
  }
  return date.toISOString();
}

function optionalTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}

function boundedSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.length > 120) {
    throw new Error("AFFILIATE_ADMIN_QUERY_TOO_LONG");
  }
  return normalized;
}

function boundedDestinationId(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,118}$/u.test(value.trim())
  ) {
    throw new Error("AFFILIATE_ADMIN_INVALID_DESTINATION_ID");
  }
  return value.trim();
}

function boundedLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return 100;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 250) {
    throw new Error("AFFILIATE_ADMIN_INVALID_LIMIT");
  }
  return parsed;
}

function affiliateId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^aff_[A-Za-z0-9._:-]{8,116}$/u.test(value.trim())
  ) {
    throw new Error("AFFILIATE_ADMIN_INVALID_AFFILIATE_ID");
  }
  return value.trim();
}

function eligibleForAttribution(
  account: AffiliateAccountRow,
  membership: MembershipRow,
): boolean {
  return (
    account.status === "active" &&
    account.identity_verified === 1 &&
    account.contact_verified === 1 &&
    account.fraud_blocked !== 1 &&
    membership.status === "approved" &&
    Boolean(membership.accepted_terms_version) &&
    membership.financial_onboarding_status === "eligible" &&
    membership.program_status === "active"
  );
}

function listItem(row: AffiliateListRow): AffiliateAdminListItem {
  return Object.freeze({
    affiliateId: row.affiliate_id,
    identityReference: row.identity_reference,
    accountType: row.account_type,
    roleCategory: row.role_category,
    status: row.status,
    identityVerified: row.identity_verified === 1,
    contactVerified: row.contact_verified === 1,
    fraudBlocked: row.fraud_blocked === 1,
    membershipCount: Number(row.membership_count),
    approvedMembershipCount: Number(row.approved_membership_count),
    suspendedMembershipCount: Number(row.suspended_membership_count),
    conversionCount: Number(row.conversion_count),
    updatedAt: timestamp(row.updated_at),
  });
}

export class AffiliateAdminQueryService {
  public constructor(private readonly pool: Pool) {}

  public async list(
    input: Readonly<{
      query?: unknown;
      limit?: unknown;
      destinationId?: unknown;
    }> = {},
  ): Promise<readonly AffiliateAdminListItem[]> {
    const query = boundedSearch(input.query);
    const limit = boundedLimit(input.limit);
    const destinationId = boundedDestinationId(input.destinationId);
    const pattern = `%${query}%`;
    const [rows] = await this.pool.execute<AffiliateListRow[]>(
      `SELECT
         a.affiliate_id,
         a.identity_reference,
         a.account_type,
         a.role_category,
         a.status,
         a.identity_verified,
         a.contact_verified,
         a.fraud_blocked,
         a.updated_at,
         COUNT(DISTINCT m.membership_id) AS membership_count,
         COUNT(DISTINCT CASE WHEN m.status IN ('approved','active') THEN m.membership_id END) AS approved_membership_count,
         COUNT(DISTINCT CASE WHEN m.status = 'suspended' THEN m.membership_id END) AS suspended_membership_count,
         COUNT(DISTINCT c.conversion_id) AS conversion_count
       FROM affiliate_accounts a
       LEFT JOIN affiliate_memberships m ON m.affiliate_id = a.affiliate_id
       LEFT JOIN affiliate_conversions c ON c.affiliate_id = a.affiliate_id
       WHERE (? = '' OR a.affiliate_id LIKE ? OR a.identity_reference LIKE ? OR a.role_category LIKE ?)
         AND (
           ? = ''
           OR EXISTS (
             SELECT 1
             FROM affiliate_memberships scoped_membership
             INNER JOIN affiliate_programs scoped_program
               ON scoped_program.program_id = scoped_membership.program_id
             WHERE scoped_membership.affiliate_id = a.affiliate_id
               AND scoped_program.destination_id = ?
           )
         )
       GROUP BY
         a.affiliate_id, a.identity_reference, a.account_type, a.role_category,
         a.status, a.identity_verified, a.contact_verified, a.fraud_blocked, a.updated_at
       ORDER BY a.updated_at DESC, a.affiliate_id ASC
       LIMIT ${limit}`,
      [query, pattern, pattern, pattern, destinationId, destinationId],
    );
    return Object.freeze(rows.map(listItem));
  }

  public async read(
    affiliateIdInput: unknown,
  ): Promise<AffiliateAdminDetail | null> {
    const id = affiliateId(affiliateIdInput);
    const [accounts] = await this.pool.execute<AffiliateAccountRow[]>(
      `SELECT affiliate_id, identity_reference, account_type, role_category, status,
              identity_verified, contact_verified, fraud_blocked, updated_at
         FROM affiliate_accounts
        WHERE affiliate_id = ?
        LIMIT 1`,
      [id],
    );
    const account = accounts[0];
    if (!account) return null;

    const [
      membershipsResult,
      summariesResult,
      attributionResult,
      conversionsResult,
    ] = await Promise.all([
      this.pool.execute<MembershipRow[]>(
        `SELECT
             m.membership_id, m.program_id, p.destination_id,
             p.status AS program_status,
             CASE m.status WHEN 'active' THEN 'approved' WHEN 'inactive' THEN 'closed' ELSE m.status END AS status,
             m.accepted_terms_version,
             m.financial_onboarding_status, m.joined_at, m.ended_at, m.updated_at
           FROM affiliate_memberships m
           JOIN affiliate_programs p ON p.program_id = m.program_id
           WHERE m.affiliate_id = ?
           ORDER BY m.joined_at ASC, m.membership_id ASC`,
        [id],
      ),
      this.pool.execute<SummaryRow[]>(
        `SELECT
             currency,
             COUNT(*) AS entitlement_count,
             CAST(SUM(CASE WHEN status = 'pending' THEN commission_minor ELSE 0 END) AS CHAR) AS pending_minor,
             CAST(SUM(CASE WHEN status = 'earned' THEN commission_minor ELSE 0 END) AS CHAR) AS earned_minor,
             CAST(SUM(CASE WHEN status = 'reversed' THEN commission_minor ELSE 0 END) AS CHAR) AS reversed_minor,
             CAST(SUM(CASE WHEN status = 'disputed' THEN commission_minor ELSE 0 END) AS CHAR) AS disputed_minor
           FROM affiliate_entitlements
           WHERE affiliate_id = ?
           GROUP BY currency
           ORDER BY currency ASC`,
        [id],
      ),
      this.pool.execute<AttributionRow[]>(
        `SELECT COUNT(*) AS attribution_count, MAX(established_at) AS latest_attribution_at
             FROM affiliate_attributions
            WHERE affiliate_id = ?`,
        [id],
      ),
      this.pool.execute<ConversionRow[]>(
        `SELECT
             c.conversion_id, c.order_id, c.payment_reference, c.currency,
             CAST(c.eligible_revenue_minor AS CHAR) AS eligible_revenue_minor,
             c.payment_confirmed_at, c.created_at,
             e.entitlement_id, e.status AS entitlement_status,
             CAST(e.commission_minor AS CHAR) AS commission_minor,
             e.rate_basis_points, e.maturity_at,
             mr.state AS materialization_state,
             mr.financial_reference, mr.rejection_code
           FROM affiliate_conversions c
           JOIN affiliate_entitlements e ON e.conversion_id = c.conversion_id
           LEFT JOIN affiliate_materialization_requests mr
             ON mr.entitlement_id = e.entitlement_id
            AND mr.entitlement_revision = e.revision
           WHERE c.affiliate_id = ?
           ORDER BY c.created_at DESC
           LIMIT 50`,
        [id],
      ),
    ]);

    const memberships = membershipsResult[0].map((row) =>
      Object.freeze({
        membershipId: row.membership_id,
        programId: row.program_id,
        destinationId: row.destination_id,
        programStatus: row.program_status,
        status: row.status,
        acceptedTermsVersion: row.accepted_terms_version,
        financialOnboardingStatus: row.financial_onboarding_status,
        eligibleForAttribution: eligibleForAttribution(account, row),
        joinedAt: timestamp(row.joined_at),
        endedAt: optionalTimestamp(row.ended_at),
        updatedAt: timestamp(row.updated_at),
      }),
    );
    const summaryByCurrency = summariesResult[0].map((row) =>
      Object.freeze({
        currency: row.currency,
        entitlementCount: Number(row.entitlement_count),
        pendingMinor: row.pending_minor ?? "0",
        earnedMinor: row.earned_minor ?? "0",
        reversedMinor: row.reversed_minor ?? "0",
        disputedMinor: row.disputed_minor ?? "0",
      }),
    );
    const attributionRow = attributionResult[0][0];
    const conversions = conversionsResult[0].map((row) =>
      Object.freeze({
        conversionId: row.conversion_id,
        orderId: row.order_id,
        paymentReference: row.payment_reference,
        currency: row.currency,
        eligibleRevenueMinor: row.eligible_revenue_minor,
        paymentConfirmedAt: timestamp(row.payment_confirmed_at),
        createdAt: timestamp(row.created_at),
        entitlementId: row.entitlement_id,
        entitlementStatus: row.entitlement_status,
        commissionMinor: row.commission_minor,
        rateBasisPoints: Number(row.rate_basis_points),
        maturityAt: timestamp(row.maturity_at),
        materializationState: row.materialization_state ?? "not_requested",
        financialReference: row.financial_reference,
        rejectionCode: row.rejection_code,
      }),
    );

    return Object.freeze({
      affiliate: Object.freeze({
        affiliateId: account.affiliate_id,
        identityReference: account.identity_reference,
        accountType: account.account_type,
        roleCategory: account.role_category,
        status: account.status,
        identityVerified: account.identity_verified === 1,
        contactVerified: account.contact_verified === 1,
        fraudBlocked: account.fraud_blocked === 1,
        updatedAt: timestamp(account.updated_at),
      }),
      memberships: Object.freeze(memberships),
      summaryByCurrency: Object.freeze(summaryByCurrency),
      attribution: Object.freeze({
        count: Number(attributionRow?.attribution_count ?? 0),
        latestAt:
          attributionRow?.latest_attribution_at === null ||
          attributionRow?.latest_attribution_at === undefined
            ? null
            : timestamp(attributionRow.latest_attribution_at),
      }),
      conversions: Object.freeze(conversions),
      payoutAuthority: Object.freeze({
        owner: "Financial" as const,
        affiliateCanInitiatePayout: false as const,
      }),
    });
  }
}
