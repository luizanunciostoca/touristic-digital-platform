import type {
  DashboardAuthClient,
  DashboardSessionResponse,
} from "@touristic/auth-browser";

export interface AffiliateMembershipView {
  readonly membership_id: string;
  readonly program_id: string;
  readonly status: "pending" | "approved" | "suspended" | "closed";
  readonly accepted_terms_version: string | null;
  readonly financial_onboarding_status:
    | "not_started"
    | "pending"
    | "eligible"
    | "blocked";
  readonly destination_id: string;
  readonly program_status: "active" | "inactive";
  readonly terms_version: string;
}

export interface AffiliateCurrencySummary {
  readonly currency: string;
  readonly entitlementCount: number;
  readonly pendingMinor: string;
  readonly earnedMinor: string;
  readonly reversedMinor: string;
  readonly disputedMinor: string;
}

export interface AffiliateConversionView {
  readonly conversionId: string;
  readonly orderId: string;
  readonly currency: string;
  readonly eligibleRevenueMinor: string;
  readonly paymentConfirmedAt: string;
  readonly serviceOccurredAt: string | null;
  readonly createdAt: string;
  readonly entitlementId: string;
  readonly revision: number;
  readonly entitlementStatus:
    | "pending"
    | "earned"
    | "cancelled"
    | "reversed"
    | "disputed";
  readonly commissionMinor: string;
  readonly rateBasisPoints: number;
  readonly maturityAt: string;
  readonly materializationState:
    | "not_requested"
    | "pending"
    | "accepted"
    | "rejected";
  readonly financialReference: string | null;
  readonly rejectionCode: string | null;
}

export interface AffiliatePortalProjection {
  readonly affiliate: {
    readonly affiliateId: string;
    readonly accountType: "person" | "organization";
    readonly roleCategory: string;
    readonly status: "active" | "suspended" | "inactive";
    readonly identityVerified: boolean;
    readonly contactVerified: boolean;
    readonly fraudBlocked: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly memberships: readonly AffiliateMembershipView[];
  readonly summaryByCurrency: readonly AffiliateCurrencySummary[];
  readonly attribution: {
    readonly count: number;
    readonly latestAt: string | null;
  };
  readonly conversions: readonly AffiliateConversionView[];
  readonly materializations: readonly Readonly<Record<string, unknown>>[];
  readonly payoutAuthority: {
    readonly owner: "Financial";
    readonly affiliateCanInitiatePayout: false;
    readonly note: string;
  };
}

export interface AffiliatePortalBootstrap {
  readonly session: DashboardSessionResponse;
  readonly projection: AffiliatePortalProjection;
}

export interface AffiliatePortalClient {
  readonly bootstrap: () => Promise<AffiliatePortalBootstrap>;
  readonly refresh: () => Promise<AffiliatePortalProjection>;
  readonly issueReferralLink: (
    programId: string,
    path?: string,
  ) => Promise<Readonly<{ url: string; expiresAt: string }>>;
  readonly logout: () => Promise<boolean>;
}

async function readError(response: Response): Promise<string> {
  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string"
    ? body.error
    : `HTTP_${response.status}`;
}

export function createAffiliatePortalClient(
  authClient: DashboardAuthClient,
): AffiliatePortalClient {
  let currentSession: DashboardSessionResponse | null = null;

  async function requireSession(
    force = false,
  ): Promise<DashboardSessionResponse> {
    const session = await authClient.getSession(force);
    if (!session?.authenticated || !session.csrfToken) {
      currentSession = null;
      throw new Error("AUTH_REQUIRED");
    }
    currentSession = session;
    return session;
  }

  async function refresh(): Promise<AffiliatePortalProjection> {
    await requireSession();
    const response = await authClient.secureFetch("/api/affiliates/v1/me", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as AffiliatePortalProjection;
  }

  async function bootstrap(): Promise<AffiliatePortalBootstrap> {
    const session = await requireSession();
    return Object.freeze({
      session,
      projection: await refresh(),
    });
  }

  async function issueReferralLink(
    programId: string,
    path = "/",
  ): Promise<Readonly<{ url: string; expiresAt: string }>> {
    const session = currentSession ?? (await requireSession());
    const response = await authClient.secureFetch(
      "/api/affiliates/v1/referral-links",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({ programId, path }),
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as {
      referral?: { url?: unknown; expiresAt?: unknown };
    };
    if (
      typeof data.referral?.url !== "string" ||
      typeof data.referral.expiresAt !== "string"
    ) {
      throw new Error("INVALID_AFFILIATE_REFERRAL_RESPONSE");
    }
    return Object.freeze({
      url: data.referral.url,
      expiresAt: data.referral.expiresAt,
    });
  }

  return Object.freeze({
    bootstrap,
    refresh,
    issueReferralLink,
    logout: () => authClient.logout(),
  });
}
