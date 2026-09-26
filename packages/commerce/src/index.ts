export const commerceModes = Object.freeze([
  "ticketed_admission",
  "activity_reservation",
  "table_reservation",
  "transport_ticket",
] as const);

export type CommerceMode = (typeof commerceModes)[number];

export interface CommerceOfferingIdentity {
  readonly offeringId: string;
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
  readonly mode: CommerceMode;
  readonly product: CommerceProductReference;
  readonly presentation: Readonly<{
    title: string;
  }>;
}

export interface TicketingInventoryReadContract {
  readonly id: unknown;
  readonly destinationId: unknown;
  readonly product: unknown;
  readonly label: unknown;
}

export interface CommerceIdentityBinding {
  readonly offeringId: unknown;
  readonly destinationId: unknown;
  readonly businessId?: unknown;
  readonly placeId?: unknown;
}

export interface TicketingInventoryCompatibilityView {
  readonly inventoryId: string;
  readonly destinationId: string;
  readonly product: CommerceProductReference;
  readonly label: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return ID.test(normalized) ? normalized : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function commerceModeForProductKind(kind: unknown): CommerceMode | null {
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

export function createCommerceOfferingIdentity(input: {
  readonly offeringId: unknown;
  readonly destinationId: unknown;
  readonly businessId?: unknown;
  readonly placeId?: unknown;
  readonly inventoryId?: unknown;
}): CommerceOfferingIdentity | null {
  const offeringId = boundedId(input.offeringId);
  const destinationId = boundedId(input.destinationId);
  const businessId =
    input.businessId === null || input.businessId === undefined
      ? null
      : boundedId(input.businessId);
  const placeId =
    input.placeId === null || input.placeId === undefined
      ? null
      : boundedId(input.placeId);
  const inventoryId =
    input.inventoryId === null || input.inventoryId === undefined
      ? null
      : boundedId(input.inventoryId);

  if (
    !offeringId ||
    !destinationId ||
    (input.businessId !== null &&
      input.businessId !== undefined &&
      !businessId) ||
    (input.placeId !== null && input.placeId !== undefined && !placeId) ||
    (input.inventoryId !== null &&
      input.inventoryId !== undefined &&
      !inventoryId)
  ) {
    return null;
  }

  return Object.freeze({
    offeringId,
    destinationId,
    businessId,
    placeId,
    inventoryId,
  });
}

export function readTicketingInventoryContract(
  value: TicketingInventoryReadContract,
): TicketingInventoryCompatibilityView | null {
  const inventoryId = boundedId(value.id);
  const destinationId = boundedId(value.destinationId);
  const product = record(value.product);
  const kind = boundedId(product?.kind);
  const reference = boundedId(product?.reference);
  const label = boundedText(value.label, 160);

  if (!inventoryId || !destinationId || !kind || !reference || !label) {
    return null;
  }

  return Object.freeze({
    inventoryId,
    destinationId,
    product: Object.freeze({ kind, reference }),
    label,
  });
}

export function adaptTicketingInventoryOffer(
  value: TicketingInventoryReadContract,
  binding: CommerceIdentityBinding,
): CommerceOffering | null {
  const inventory = readTicketingInventoryContract(value);
  if (!inventory) return null;

  const identity = createCommerceOfferingIdentity({
    offeringId: binding.offeringId,
    destinationId: binding.destinationId,
    businessId: binding.businessId,
    placeId: binding.placeId,
    inventoryId: inventory.inventoryId,
  });
  if (!identity || identity.destinationId !== inventory.destinationId) {
    return null;
  }

  const mode = commerceModeForProductKind(inventory.product.kind);
  if (!mode) return null;

  return Object.freeze({
    identity,
    mode,
    product: inventory.product,
    presentation: Object.freeze({ title: inventory.label }),
  });
}

export function offeringMatchesCanonicalPlace(
  offering: CommerceOffering,
  place: Readonly<{
    placeId?: unknown;
    businessId?: unknown;
  }>,
): boolean {
  const placeId = boundedId(place.placeId);
  const businessId = boundedId(place.businessId);

  if (placeId && offering.identity.placeId) {
    return placeId === offering.identity.placeId;
  }
  if (businessId && offering.identity.businessId) {
    return businessId === offering.identity.businessId;
  }
  return false;
}

export * from "./restaurant-reservations.js";
export * from "./restaurant-availability.js";
