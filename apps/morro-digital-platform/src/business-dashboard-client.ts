import type {
  DashboardAuthClient,
  DashboardSessionResponse,
} from "@touristic/auth-browser";
import { normalizeBusinessId, type BusinessProfile } from "@touristic/business";
import { resolveBusinessContext } from "./morro-pro-business-management.js";

export interface MorroProInventoryOffer {
  readonly id: string;
  readonly businessId: string;
  readonly destinationId: string;
  readonly productKind: "tour" | "business_experience" | "transport";
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
  readonly productKind: "tour" | "business_experience" | "transport";
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

export type MorroProCatalogKind =
  "product" | "offer" | "menu" | "menu-category" | "menu-item";

export interface MorroProCatalogPrice {
  readonly minorUnits: number;
  readonly currency: string;
}

export interface MorroProCatalogProduct {
  readonly id: string;
  readonly businessId: string;
  readonly placeId: string | null;
  readonly destinationId: string | null;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly tags: readonly string[];
}

export interface MorroProCatalogOffer {
  readonly id: string;
  readonly businessId: string;
  readonly placeId: string | null;
  readonly destinationId: string | null;
  readonly productId: string;
  readonly price: MorroProCatalogPrice;
  readonly capacity: number | null;
  readonly salesStartsAt: string | null;
  readonly salesEndsAt: string | null;
  readonly experienceStartsAt: string | null;
  readonly experienceEndsAt: string | null;
  readonly status: string;
}

export interface MorroProCatalogMenu {
  readonly id: string;
  readonly businessId: string;
  readonly placeId: string | null;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly fallbackMediaId: string | null;
  readonly fallbackDocumentUrl: string | null;
}

export interface MorroProCatalogMenuCategory {
  readonly id: string;
  readonly businessId: string;
  readonly menuId: string;
  readonly name: string;
  readonly sortOrder: number;
}

export interface MorroProCatalogMenuItem {
  readonly id: string;
  readonly businessId: string;
  readonly menuId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  readonly price: MorroProCatalogPrice;
  readonly mediaId: string | null;
  readonly available: boolean;
  readonly tags: readonly string[];
  readonly allergens: readonly string[];
  readonly sortOrder: number;
}

export interface MorroProCatalog {
  readonly products: readonly MorroProCatalogProduct[];
  readonly offers: readonly MorroProCatalogOffer[];
  readonly menus: readonly MorroProCatalogMenu[];
  readonly categories: readonly MorroProCatalogMenuCategory[];
  readonly items: readonly MorroProCatalogMenuItem[];
}

export interface MorroProMediaAsset {
  readonly id: string;
  readonly provider: string;
  readonly providerReference: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly publicationState: "draft" | "published";
}

export interface MorroProMediaEntry {
  readonly placeId: string;
  readonly mediaId: string;
  readonly role: "cover" | "gallery" | "logo" | "menu" | "product" | "other";
  readonly sortOrder: number;
  readonly asset: MorroProMediaAsset | null;
}

export interface MorroProMedia {
  readonly count: number;
  readonly storageAvailable: boolean;
  readonly assets: readonly MorroProMediaEntry[];
}

export interface MorroProMediaUploadInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly role: MorroProMediaEntry["role"];
  readonly published: boolean;
  readonly dataBase64: string;
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
    signal?: AbortSignal,
  ) => Promise<BusinessProfile | null>;
  readonly saveProfile: (
    businessId: unknown,
    profile: unknown,
  ) => Promise<BusinessProfile>;
  readonly listOffers: (
    businessId: unknown,
    signal?: AbortSignal,
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
  readonly loadMedia: (
    businessId: unknown,
    signal?: AbortSignal,
  ) => Promise<MorroProMedia>;
  readonly uploadMedia: (
    businessId: unknown,
    input: MorroProMediaUploadInput,
  ) => Promise<unknown>;
  readonly updateMedia: (
    businessId: unknown,
    mediaId: string,
    input: unknown,
  ) => Promise<unknown>;
  readonly reorderMedia: (
    businessId: unknown,
    orderedMediaIds: readonly string[],
  ) => Promise<unknown>;
  readonly deleteMedia: (
    businessId: unknown,
    mediaId: string,
  ) => Promise<void>;
  readonly loadCatalog: (
    businessId: unknown,
    signal?: AbortSignal,
  ) => Promise<MorroProCatalog>;
  readonly createCatalogEntry: (
    businessId: unknown,
    kind: MorroProCatalogKind,
    input: unknown,
  ) => Promise<unknown>;
  readonly updateCatalogEntry: (
    businessId: unknown,
    kind: MorroProCatalogKind,
    id: string,
    input: unknown,
  ) => Promise<unknown>;
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

function businessMediaUrl(
  businessIdInput: unknown,
  mediaId?: string,
  order = false,
): string {
  const businessId = normalizeBusinessId(businessIdInput);
  if (!businessId) throw new Error("INVALID_BUSINESS_ID");
  let url = `/api/business/${encodeURIComponent(businessId)}/media`;
  if (order) url += "/order";
  else if (mediaId) url += `/${encodeURIComponent(mediaId)}`;
  return url;
}

function businessCatalogUrl(
  businessIdInput: unknown,
  kind?: MorroProCatalogKind,
  id?: string,
): string {
  const businessId = normalizeBusinessId(businessIdInput);
  if (!businessId) throw new Error("INVALID_BUSINESS_ID");
  let url = `/api/business/${encodeURIComponent(businessId)}/catalog`;
  if (kind) url += `/${encodeURIComponent(kind)}`;
  if (id) url += `/${encodeURIComponent(id)}`;
  return url;
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
    signal?: AbortSignal,
  ): Promise<BusinessProfile | null> {
    const response = await authClient.secureFetch(
      businessProfileUrl(businessIdInput),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: signal ?? null,
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
    signal?: AbortSignal,
  ): Promise<readonly MorroProInventoryOffer[]> {
    const response = await authClient.secureFetch(
      businessInventoryUrl(businessIdInput),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: signal ?? null,
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

  async function loadMedia(
    businessIdInput: unknown,
    signal?: AbortSignal,
  ): Promise<MorroProMedia> {
    const response = await authClient.secureFetch(
      businessMediaUrl(businessIdInput),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: signal ?? null,
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as Partial<MorroProMedia>;
    return Object.freeze({
      count: Number(data.count ?? 0),
      storageAvailable: data.storageAvailable === true,
      assets: Object.freeze(Array.isArray(data.assets) ? data.assets : []),
    });
  }

  async function uploadMedia(
    businessIdInput: unknown,
    input: MorroProMediaUploadInput,
  ): Promise<unknown> {
    const response = await authClient.secureFetch(
      businessMediaUrl(businessIdInput),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: unknown };
    return data.data;
  }

  async function updateMedia(
    businessIdInput: unknown,
    mediaId: string,
    input: unknown,
  ): Promise<unknown> {
    const response = await authClient.secureFetch(
      businessMediaUrl(businessIdInput, mediaId),
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: unknown };
    return data.data;
  }

  async function reorderMedia(
    businessIdInput: unknown,
    orderedMediaIds: readonly string[],
  ): Promise<unknown> {
    const response = await authClient.secureFetch(
      businessMediaUrl(businessIdInput, undefined, true),
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderedMediaIds }),
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: unknown };
    return data.data;
  }

  async function deleteMedia(
    businessIdInput: unknown,
    mediaId: string,
  ): Promise<void> {
    const response = await authClient.secureFetch(
      businessMediaUrl(businessIdInput, mediaId),
      { method: "DELETE", headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(await readError(response));
  }

  async function loadCatalog(
    businessIdInput: unknown,
    signal?: AbortSignal,
  ): Promise<MorroProCatalog> {
    const response = await authClient.secureFetch(
      businessCatalogUrl(businessIdInput),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: signal ?? null,
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as Partial<MorroProCatalog>;
    return Object.freeze({
      products: Object.freeze(
        Array.isArray(data.products) ? data.products : [],
      ),
      offers: Object.freeze(Array.isArray(data.offers) ? data.offers : []),
      menus: Object.freeze(Array.isArray(data.menus) ? data.menus : []),
      categories: Object.freeze(
        Array.isArray(data.categories) ? data.categories : [],
      ),
      items: Object.freeze(Array.isArray(data.items) ? data.items : []),
    });
  }

  async function createCatalogEntry(
    businessIdInput: unknown,
    kind: MorroProCatalogKind,
    input: unknown,
  ): Promise<unknown> {
    const response = await authClient.secureFetch(
      businessCatalogUrl(businessIdInput, kind),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: unknown };
    return data.data;
  }

  async function updateCatalogEntry(
    businessIdInput: unknown,
    kind: MorroProCatalogKind,
    id: string,
    input: unknown,
  ): Promise<unknown> {
    const response = await authClient.secureFetch(
      businessCatalogUrl(businessIdInput, kind, id),
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { data?: unknown };
    return data.data;
  }

  async function bootstrap(
    requestedBusinessId?: unknown,
  ): Promise<BusinessDashboardBootstrap> {
    const session = await authClient.getSession();
    if (!session) throw new Error("AUTH_REQUIRED");
    const businessId = resolveBusinessContext(session, requestedBusinessId);
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
    loadMedia,
    uploadMedia,
    updateMedia,
    reorderMedia,
    deleteMedia,
    loadCatalog,
    createCatalogEntry,
    updateCatalogEntry,
  });
}
