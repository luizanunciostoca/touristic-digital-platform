import type {
  DashboardAuthClient,
  DashboardSessionResponse,
} from "@touristic/auth-browser";
import { normalizeBusinessId, type BusinessProfile } from "@touristic/business";

export interface MorroProInventoryOffer {
  readonly id: string;
  readonly businessId: string;
  readonly destinationId: string;
  readonly productKind: "tour" | "business_experience";
  readonly productReference: string;
  readonly label: string;
  readonly unitAmountMinor: number;
  readonly currency: string;
  readonly pricingVersion: string;
  readonly capacity: number;
  readonly maxPerReservation: number;
  readonly salesStartAt: string;
  readonly salesEndAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly enabled: boolean;
}

export interface MorroProOfferInput {
  readonly productKind: "tour" | "business_experience";
  readonly productReference: string;
  readonly label: string;
  readonly unitAmountMinor: number;
  readonly currency: string;
  readonly pricingVersion: string;
  readonly capacity: number;
  readonly maxPerReservation: number;
  readonly salesStartAt: string;
  readonly salesEndAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

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
  readonly listOffers: (
    businessId: unknown,
  ) => Promise<readonly MorroProInventoryOffer[]>;
  readonly createOffer: (
    businessId: unknown,
    offer: MorroProOfferInput,
    requestKey: string,
  ) => Promise<MorroProInventoryOffer>;
  readonly disableOffer: (
    businessId: unknown,
    inventoryId: string,
  ) => Promise<MorroProInventoryOffer>;
}

function businessProfileUrl(businessIdInput: unknown): string {
  const businessId = normalizeBusinessId(businessIdInput);
  if (!businessId) throw new Error("INVALID_BUSINESS_ID");
  return `/api/business/${encodeURIComponent(businessId)}/profile`;
}

function businessInventoryUrl(businessIdInput: unknown): string {
  const businessId = normalizeBusinessId(businessIdInput);
  if (!businessId) throw new Error("INVALID_BUSINESS_ID");
  return `/api/ticketing/v1/operator/businesses/${encodeURIComponent(businessId)}/inventory`;
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

  async function listOffers(
    businessIdInput: unknown,
  ): Promise<readonly MorroProInventoryOffer[]> {
    const response = await authClient.secureFetch(
      businessInventoryUrl(businessIdInput),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: MorroProInventoryOffer[] };
    return Object.freeze(Array.isArray(data.data) ? data.data : []);
  }

  async function createOffer(
    businessIdInput: unknown,
    offer: MorroProOfferInput,
    requestKey: string,
  ): Promise<MorroProInventoryOffer> {
    const response = await authClient.secureFetch(
      businessInventoryUrl(businessIdInput),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify(offer),
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: MorroProInventoryOffer };
    if (!data.data) throw new Error("INVALID_MORRO_PRO_OFFER_RESPONSE");
    return data.data;
  }

  async function disableOffer(
    businessIdInput: unknown,
    inventoryId: string,
  ): Promise<MorroProInventoryOffer> {
    const base = businessInventoryUrl(businessIdInput);
    const response = await authClient.secureFetch(
      `${base}/${encodeURIComponent(inventoryId)}/disable`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: MorroProInventoryOffer };
    if (!data.data) throw new Error("INVALID_MORRO_PRO_OFFER_RESPONSE");
    return data.data;
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

  return Object.freeze({
    bootstrap,
    loadProfile,
    saveProfile,
    listOffers,
    createOffer,
    disableOffer,
  });
}
