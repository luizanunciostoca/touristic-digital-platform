import type {
  DashboardAuthClient,
  DashboardSessionResponse,
} from "@touristic/auth-browser";
import { normalizeBusinessId, type BusinessProfile } from "@touristic/business";

export interface BusinessDashboardBootstrap {
  readonly session: DashboardSessionResponse;
  readonly businessId: string;
  readonly profile: BusinessProfile | null;
}

export interface BusinessDashboardClient {
  readonly bootstrap: (
    requestedBusinessId?: unknown,
  ) => Promise<BusinessDashboardBootstrap>;
  readonly loadProfile: (
    businessId: unknown,
  ) => Promise<BusinessProfile | null>;
  readonly saveProfile: (
    businessId: unknown,
    profile: unknown,
  ) => Promise<BusinessProfile>;
}

function businessProfileUrl(businessIdInput: unknown): string {
  const businessId = normalizeBusinessId(businessIdInput);
  if (!businessId) throw new Error("INVALID_BUSINESS_ID");
  return `/api/business/${encodeURIComponent(businessId)}/profile`;
}

function selectBusinessId(
  session: DashboardSessionResponse,
  requestedBusinessId?: unknown,
): string {
  const requested = normalizeBusinessId(requestedBusinessId);
  const allowed = session.user.businessIds
    .map((businessId) => normalizeBusinessId(businessId))
    .filter(Boolean);

  if (requested) {
    if (session.user.role === "admin" || allowed.includes(requested)) {
      return requested;
    }
  }

  const firstAllowed = allowed[0];
  if (firstAllowed) return firstAllowed;
  throw new Error("BUSINESS_SCOPE_REQUIRED");
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

export function createBusinessDashboardClient(
  authClient: DashboardAuthClient,
): BusinessDashboardClient {
  async function loadProfile(
    businessIdInput: unknown,
  ): Promise<BusinessProfile | null> {
    const response = await authClient.secureFetch(
      businessProfileUrl(businessIdInput),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { profile?: BusinessProfile };
    return data.profile ?? null;
  }

  async function saveProfile(
    businessIdInput: unknown,
    profile: unknown,
  ): Promise<BusinessProfile> {
    const response = await authClient.secureFetch(
      businessProfileUrl(businessIdInput),
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profile),
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { profile?: BusinessProfile };
    if (!data.profile) throw new Error("INVALID_BUSINESS_PROFILE_RESPONSE");
    return data.profile;
  }

  async function bootstrap(
    requestedBusinessId?: unknown,
  ): Promise<BusinessDashboardBootstrap> {
    const session = await authClient.getSession();
    if (!session) throw new Error("AUTH_REQUIRED");
    const businessId = selectBusinessId(session, requestedBusinessId);
    const profile = await loadProfile(businessId);
    return Object.freeze({ session, businessId, profile });
  }

  return Object.freeze({ bootstrap, loadProfile, saveProfile });
}
