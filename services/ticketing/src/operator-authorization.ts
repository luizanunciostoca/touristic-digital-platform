import type { TicketingOrderBindingRepositoryPort } from "@touristic/ordering/ticketing-reservation";
import type { Ticket } from "@touristic/ticketing";
import type {
  TicketInventoryOffer,
  TicketReservation,
} from "@touristic/ticketing/reservations";

import type { TicketingInventoryOwnershipReadPort } from "./business-inventory-repository.js";

export interface TicketingOperatorAuthority {
  readonly subject: string;
  readonly capabilities: readonly string[];
  readonly scope:
    | { readonly kind: "platform" }
    | { readonly kind: "business"; readonly businessIds: readonly string[] };
}

export type TicketingOperatorAuthorizationErrorCode =
  | "TICKETING_OPERATOR_FORBIDDEN"
  | "TICKETING_OPERATOR_NOT_FOUND"
  | "TICKETING_OPERATOR_UNAVAILABLE";

export type TicketingOperatorAuthorizationFailureReason =
  | "AUTHORITY_INVALID"
  | "CAPABILITY_MISSING"
  | "BUSINESS_SCOPE_MISMATCH"
  | "ORDER_BINDING_MISSING"
  | "RESERVATION_MISSING"
  | "INVENTORY_MISSING"
  | "INVENTORY_OWNERSHIP_MISSING"
  | "BUSINESS_DESTINATION_MISSING"
  | "CATALOG_OFFER_MISSING"
  | "CATALOG_PRODUCT_MISSING"
  | "PLACE_MISSING"
  | "DESTINATION_MISSING"
  | "CONTRADICTORY_FACTS"
  | "DEPENDENCY_UNAVAILABLE";

export class TicketingOperatorAuthorizationError extends Error {
  constructor(
    readonly code: TicketingOperatorAuthorizationErrorCode,
    /** Internal diagnosis; transports must expose only the stable code. */
    readonly reason: TicketingOperatorAuthorizationFailureReason,
  ) {
    super(code);
    this.name = "TicketingOperatorAuthorizationError";
  }
}

export interface TicketingOperatorAuthorizationFacts {
  readonly subject: string;
  readonly businessId: string;
  readonly destinationId: string;
  readonly destinationStatus: "active" | "suspended";
}

export interface TicketingOperatorAuthorizationPort {
  authorize(
    ticket: Ticket,
    authority: TicketingOperatorAuthority,
  ): Promise<TicketingOperatorAuthorizationFacts>;
}

interface CatalogOwner {
  readonly id: string;
  readonly businessId: string;
  readonly placeId: string | null;
  readonly destinationId: string | null;
}

export interface TicketingOperatorOwnerPort {
  findBusiness(
    businessId: string,
    destinationId: string,
  ): Promise<{
    readonly businessId: string;
    readonly destinationId: string;
  } | null>;
  findPlace(placeId: string): Promise<{
    readonly id: string;
    readonly businessId: string;
    readonly destinationId: string;
  } | null>;
  findOffer(
    offerId: string,
  ): Promise<(CatalogOwner & { readonly productId: string }) | null>;
  findProduct(productId: string): Promise<CatalogOwner | null>;
}

export interface TicketingOperatorDestinationPort {
  findDestination(destinationId: string): Promise<{
    readonly id: string;
    readonly status: "active" | "suspended";
  } | null>;
}

export interface TicketingOperatorAuthorizationDependencies {
  readonly bindings: Pick<TicketingOrderBindingRepositoryPort, "findByOrderId">;
  readonly reservations: {
    findReservationById(id: string): Promise<TicketReservation | null>;
    findInventoryById(id: string): Promise<TicketInventoryOffer | null>;
  };
  readonly businessInventory: TicketingInventoryOwnershipReadPort;
  readonly owner: TicketingOperatorOwnerPort;
  readonly destinations: TicketingOperatorDestinationPort;
}

function deny(
  reason: TicketingOperatorAuthorizationFailureReason,
  code: TicketingOperatorAuthorizationErrorCode = "TICKETING_OPERATOR_FORBIDDEN",
): never {
  throw new TicketingOperatorAuthorizationError(code, reason);
}

function canonicalText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    Array.from(value).every(
      (character) =>
        character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
    )
  );
}

/** Validates trusted server context; it does not authenticate a caller's body. */
export function requireTicketingOperatorAuthority(
  value: unknown,
  expectedSubject?: unknown,
): TicketingOperatorAuthority {
  const authority = value as Partial<TicketingOperatorAuthority> | null;
  if (
    !authority ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !canonicalText(authority.subject) ||
    authority.subject.startsWith("guest:") ||
    (expectedSubject !== undefined && authority.subject !== expectedSubject) ||
    !Array.isArray(authority.capabilities) ||
    !authority.capabilities.every(canonicalText) ||
    !authority.scope ||
    typeof authority.scope !== "object" ||
    Array.isArray(authority.scope) ||
    (authority.scope.kind !== "platform" &&
      (authority.scope.kind !== "business" ||
        !Array.isArray(authority.scope.businessIds) ||
        authority.scope.businessIds.length === 0 ||
        !authority.scope.businessIds.every(canonicalText)))
  ) {
    deny("AUTHORITY_INVALID");
  }
  if (!authority.capabilities.includes("ticketing.manage")) {
    deny("CAPABILITY_MISSING");
  }
  return Object.freeze({
    subject: authority.subject,
    capabilities: Object.freeze([...authority.capabilities]),
    scope:
      authority.scope.kind === "platform"
        ? Object.freeze({ kind: "platform" })
        : Object.freeze({
            kind: "business",
            businessIds: Object.freeze([...authority.scope.businessIds]),
          }),
  });
}

function requireFound<T>(
  value: T | null,
  reason: TicketingOperatorAuthorizationFailureReason,
): T {
  if (!value) deny(reason, "TICKETING_OPERATOR_NOT_FOUND");
  return value;
}

function assertFacts(condition: unknown): asserts condition {
  if (!condition) deny("CONTRADICTORY_FACTS");
}

function collectCatalogPlace(
  entity: CatalogOwner,
  businessId: string,
  destinationId: string,
  places: Set<string>,
): void {
  assertFacts(
    entity.businessId === businessId &&
      (entity.destinationId === null ||
        entity.destinationId === destinationId) &&
      (entity.placeId === null || canonicalText(entity.placeId)),
  );
  if (entity.placeId !== null) places.add(entity.placeId);
}

/** Resolves current resource authority. New-operation eligibility belongs after replay. */
export function createTicketingOperatorAuthorization(
  dependencies: TicketingOperatorAuthorizationDependencies,
): TicketingOperatorAuthorizationPort {
  return Object.freeze({
    async authorize(
      ticket: Ticket,
      inputAuthority: TicketingOperatorAuthority,
    ): Promise<TicketingOperatorAuthorizationFacts> {
      const authority = requireTicketingOperatorAuthority(inputAuthority);
      try {
        const binding = requireFound(
          await dependencies.bindings.findByOrderId(ticket.orderId),
          "ORDER_BINDING_MISSING",
        );
        assertFacts(binding.orderId === ticket.orderId);
        const reservation = requireFound(
          await dependencies.reservations.findReservationById(
            binding.reservationReference,
          ),
          "RESERVATION_MISSING",
        );
        const total = reservation.unitAmount.minorUnits * reservation.quantity;
        assertFacts(
          reservation.id === binding.reservationReference &&
            reservation.orderId === ticket.orderId &&
            reservation.paymentId === ticket.paymentId &&
            reservation.destinationId === ticket.destinationId &&
            reservation.product.kind === ticket.product.kind &&
            reservation.product.reference === ticket.product.reference &&
            binding.productReference ===
              ticket.product.kind + ":" + ticket.product.reference &&
            binding.quantity === ticket.quantity &&
            reservation.quantity === ticket.quantity &&
            binding.pricingVersion === reservation.pricingVersion &&
            binding.amount.currency === ticket.amount.currency &&
            reservation.unitAmount.currency === ticket.amount.currency &&
            binding.amount.minorUnits === ticket.amount.minorUnits &&
            Number.isSafeInteger(total) &&
            total === ticket.amount.minorUnits,
        );
        const inventory = requireFound(
          await dependencies.reservations.findInventoryById(
            reservation.inventoryId,
          ),
          "INVENTORY_MISSING",
        );
        assertFacts(
          inventory.id === reservation.inventoryId &&
            inventory.destinationId === ticket.destinationId &&
            inventory.product.kind === ticket.product.kind &&
            inventory.product.reference === ticket.product.reference,
        );
        const ownership = requireFound(
          await dependencies.businessInventory.findOwnershipByInventoryId(
            inventory.id,
          ),
          "INVENTORY_OWNERSHIP_MISSING",
        );
        assertFacts(
          ownership.inventoryId === inventory.id &&
            canonicalText(ownership.businessId),
        );
        const businessId = ownership.businessId;
        if (
          authority.scope.kind === "business" &&
          !authority.scope.businessIds.includes(businessId)
        ) {
          deny("BUSINESS_SCOPE_MISMATCH");
        }
        const business = requireFound(
          await dependencies.owner.findBusiness(
            businessId,
            ticket.destinationId,
          ),
          "BUSINESS_DESTINATION_MISSING",
        );
        assertFacts(
          business.businessId === businessId &&
            business.destinationId === ticket.destinationId,
        );
        const destination = requireFound(
          await dependencies.destinations.findDestination(ticket.destinationId),
          "DESTINATION_MISSING",
        );
        assertFacts(
          destination.id === ticket.destinationId &&
            (destination.status === "active" ||
              destination.status === "suspended"),
        );
        // The raw Inventory reader does not load ticketing_admission_profiles.
        const profile =
          await dependencies.businessInventory.findAdmissionProfileByInventoryId(
            inventory.id,
          );
        const places = new Set<string>();
        if (profile !== null) {
          assertFacts(
            profile.inventoryId === inventory.id &&
              inventory.product.kind === "business_experience" &&
              canonicalText(profile.admission.placeId),
          );
          places.add(profile.admission.placeId);
        }
        // Catalog binding is optional for a valid, newly created Inventory.
        const catalog =
          await dependencies.businessInventory.findCatalogBindingByInventoryId(
            inventory.id,
          );
        if (catalog !== null) {
          assertFacts(
            catalog.inventoryId === inventory.id &&
              catalog.businessId === businessId &&
              canonicalText(catalog.offerId),
          );
          const offer = requireFound(
            await dependencies.owner.findOffer(catalog.offerId),
            "CATALOG_OFFER_MISSING",
          );
          assertFacts(
            offer.id === catalog.offerId && canonicalText(offer.productId),
          );
          collectCatalogPlace(offer, businessId, ticket.destinationId, places);
          const product = requireFound(
            await dependencies.owner.findProduct(offer.productId),
            "CATALOG_PRODUCT_MISSING",
          );
          assertFacts(product.id === offer.productId);
          collectCatalogPlace(
            product,
            businessId,
            ticket.destinationId,
            places,
          );
        }
        assertFacts(places.size <= 1);
        const [placeId] = places;
        if (placeId !== undefined) {
          const place = requireFound(
            await dependencies.owner.findPlace(placeId),
            "PLACE_MISSING",
          );
          assertFacts(
            place.id === placeId &&
              place.businessId === businessId &&
              place.destinationId === ticket.destinationId,
          );
        }
        return Object.freeze({
          subject: authority.subject,
          businessId,
          destinationId: destination.id,
          destinationStatus: destination.status,
        });
      } catch (error) {
        if (error instanceof TicketingOperatorAuthorizationError) throw error;
        deny("DEPENDENCY_UNAVAILABLE", "TICKETING_OPERATOR_UNAVAILABLE");
      }
    },
  });
}
