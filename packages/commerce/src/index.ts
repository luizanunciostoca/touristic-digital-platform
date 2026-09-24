export const commerceModes = Object.freeze([
  "ticketed_admission",
  "activity_reservation",
  "table_reservation",
  "transport_ticket",
] as const);

export type CommerceMode = (typeof commerceModes)[number];

export const ticketedAdmissionContexts = Object.freeze([
  "sunset",
  "event",
  "party",
] as const);

export type TicketedAdmissionContext =
  (typeof ticketedAdmissionContexts)[number];

export interface CommerceOfferingIdentity {
  readonly offerId: string;
  readonly destinationId: string;
  readonly businessId: string | null;
  readonly placeId: string | null;
  readonly inventoryId: string | null;
}

export interface CommerceProductReference {
  readonly kind: string;
  readonly reference: string;
}

export interface CommerceOffering {
  readonly identity: CommerceOfferingIdentity;
  readonly commerceMode: CommerceMode;
  readonly context: string | null;
  readonly product: CommerceProductReference;
  readonly presentation: Readonly<{
    title: string;
    shortDescription?: string;
    heroImage?: string;
  }>;
}

export interface LegacyTicketingInventoryOffer {
  readonly id: unknown;
  readonly destinationId: unknown;
  readonly product: unknown;
  readonly label: unknown;
  readonly businessId?: unknown;
  readonly placeId?: unknown;
  readonly offerId?: unknown;
}

export type CommerceIdentitySource =
  | "explicit"
  | "legacy_reference"
  | "inventory_only";

export interface CommerceOfferingResolution {
  readonly offering: CommerceOffering;
  readonly identitySource: CommerceIdentitySource;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return ID.test(normalized) ? normalized : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function commerceModeForProductKind(
  kind: unknown,
): CommerceMode | null {
  if (kind === "tour") return "activity_reservation";
  if (kind === "business_experience") return "ticketed_admission";
  if (kind === "transport") return "transport_ticket";
  return null;
}

export function commerceModeForPlaceCategory(
  category: unknown,
): CommerceMode | null {
  if (category === "tours") return "activity_reservation";
  if (category === "nightlife") return "ticketed_admission";
  if (category === "restaurants") return "table_reservation";
  if (category === "transport") return "transport_ticket";
  return null;
}

function legacyIdentity(reference: string): Readonly<{
  businessId: string | null;
  placeId: string | null;
}> {
  const morroPro =
    /^morro-pro:([^:]+)(?::place-([^:]+))?(?::|$)/u.exec(reference);
  if (!morroPro) return Object.freeze({ businessId: null, placeId: null });
  return Object.freeze({
    businessId: boundedId(morroPro[1]),
    placeId: boundedId(morroPro[2]),
  });
}

function admissionContext(reference: string): TicketedAdmissionContext | null {
  const normalized = reference.toLowerCase();
  if (/(^|[:_-])sunset($|[:_-])/u.test(normalized)) return "sunset";
  if (/(^|[:_-])party($|[:_-])/u.test(normalized)) return "party";
  if (/(^|[:_-])event($|[:_-])/u.test(normalized)) return "event";
  return null;
}

export function adaptLegacyTicketingInventoryOffer(
  value: LegacyTicketingInventoryOffer,
): CommerceOfferingResolution | null {
  const product = record(value.product);
  const inventoryId = boundedId(value.id);
  const destinationId = boundedId(value.destinationId);
  const kind = typeof product?.kind === "string" ? product.kind : "";
  const reference = boundedId(product?.reference);
  const title =
    typeof value.label === "string" && value.label.trim().length > 0
      ? value.label.trim().slice(0, 160)
      : "";
  const commerceMode = commerceModeForProductKind(kind);
  if (!inventoryId || !destinationId || !reference || !title || !commerceMode) {
    return null;
  }

  const explicitBusinessId = boundedId(value.businessId);
  const explicitPlaceId = boundedId(value.placeId);
  const explicitOfferId = boundedId(value.offerId);
  const legacy = legacyIdentity(reference);
  const businessId = explicitBusinessId ?? legacy.businessId;
  const placeId = explicitPlaceId ?? legacy.placeId;
  const identitySource: CommerceIdentitySource =
    explicitBusinessId || explicitPlaceId || explicitOfferId
      ? "explicit"
      : businessId || placeId
        ? "legacy_reference"
        : "inventory_only";

  return Object.freeze({
    offering: Object.freeze({
      identity: Object.freeze({
        offerId: explicitOfferId ?? inventoryId,
        destinationId,
        businessId,
        placeId,
        inventoryId,
      }),
      commerceMode,
      context:
        commerceMode === "ticketed_admission"
          ? admissionContext(reference)
          : null,
      product: Object.freeze({ kind, reference }),
      presentation: Object.freeze({ title }),
    }),
    identitySource,
  });
}

export function offeringMatchesPlace(
  offering: CommerceOffering,
  place: Readonly<{
    id?: string | null;
    businessId?: string | null;
    destinationId?: string | null;
  }>,
): boolean {
  const placeId = boundedId(place.id);
  const businessId = boundedId(place.businessId);
  const destinationId = boundedId(place.destinationId);
  if (placeId && offering.identity.placeId) {
    return placeId === offering.identity.placeId;
  }
  if (businessId && offering.identity.businessId) {
    return businessId === offering.identity.businessId;
  }
  if (placeId && offering.product.reference === placeId) return true;
  if (destinationId && offering.identity.destinationId === destinationId) {
    return true;
  }
  return false;
}
