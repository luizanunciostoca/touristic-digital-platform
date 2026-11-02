import type { TicketingOrderBindingRepositoryPort } from "@touristic/ordering/ticketing-reservation";
import type { Ticket } from "@touristic/ticketing";

import type { TicketingBusinessInventoryRepositoryPort } from "./business-inventory-repository.js";
import type { MySqlTicketReservationRepository } from "./mysql-ticket-reservation-repository.js";

export interface TicketingOperatorAuthority {
  readonly subject: string;
  readonly capabilities: readonly string[];
  readonly scope:
    | { readonly kind: "platform" }
    | { readonly kind: "business"; readonly businessIds: readonly string[] };
}

export class TicketingOperatorAuthorizationError extends Error {
  constructor(
    readonly code:
      | "TICKETING_OPERATOR_FORBIDDEN"
      | "TICKETING_OPERATOR_NOT_FOUND"
      | "TICKETING_OPERATOR_UNAVAILABLE",
  ) {
    super(code);
    this.name = "TicketingOperatorAuthorizationError";
  }
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
    !authority.capabilities.includes("ticketing.manage") ||
    !authority.scope ||
    typeof authority.scope !== "object" ||
    Array.isArray(authority.scope) ||
    (authority.scope.kind !== "platform" &&
      (authority.scope.kind !== "business" ||
        !Array.isArray(authority.scope.businessIds) ||
        authority.scope.businessIds.length === 0 ||
        !authority.scope.businessIds.every(canonicalText)))
  ) {
    throw new TicketingOperatorAuthorizationError(
      "TICKETING_OPERATOR_FORBIDDEN",
    );
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

export interface TicketingOperatorAuthorizationPort {
  authorize(
    ticket: Ticket,
    authority: TicketingOperatorAuthority,
  ): Promise<void>;
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
  findOffer(offerId: string): Promise<{
    readonly id: string;
    readonly businessId: string;
    readonly destinationId: string | null;
    readonly placeId: string | null;
    readonly productId: string;
  } | null>;
}

export function createTicketingOperatorAuthorization(dependencies: {
  readonly bindings: Pick<TicketingOrderBindingRepositoryPort, "findByOrderId">;
  readonly reservations: Pick<
    MySqlTicketReservationRepository,
    "findReservationById"
  >;
  readonly businessInventory: Pick<
    TicketingBusinessInventoryRepositoryPort,
    "findByInventoryId" | "findCatalogBindingByInventoryId"
  >;
  readonly owner: TicketingOperatorOwnerPort;
}): TicketingOperatorAuthorizationPort {
  function notFound(): never {
    throw new TicketingOperatorAuthorizationError(
      "TICKETING_OPERATOR_NOT_FOUND",
    );
  }
  return Object.freeze({
    async authorize(
      ticket: Ticket,
      inputAuthority: TicketingOperatorAuthority,
    ) {
      const authority = requireTicketingOperatorAuthority(inputAuthority);
      try {
        const binding = await dependencies.bindings.findByOrderId(
          ticket.orderId,
        );
        if (!binding || binding.orderId !== ticket.orderId) notFound();
        const reservation = await dependencies.reservations.findReservationById(
          binding.reservationReference,
        );
        if (
          !reservation ||
          reservation.id !== binding.reservationReference ||
          reservation.orderId !== ticket.orderId ||
          reservation.paymentId !== ticket.paymentId ||
          reservation.status !== "confirmed" ||
          reservation.destinationId !== ticket.destinationId ||
          reservation.product.kind !== ticket.product.kind ||
          reservation.product.reference !== ticket.product.reference ||
          reservation.quantity !== ticket.quantity ||
          binding.quantity !== ticket.quantity ||
          binding.productReference !==
            `${reservation.product.kind}:${reservation.product.reference}` ||
          binding.pricingVersion !== reservation.pricingVersion ||
          binding.amount.currency !== reservation.unitAmount.currency ||
          binding.amount.currency !== ticket.amount.currency ||
          binding.amount.minorUnits !== ticket.amount.minorUnits ||
          binding.amount.minorUnits !==
            reservation.unitAmount.minorUnits * reservation.quantity
        )
          notFound();

        const inventory =
          await dependencies.businessInventory.findByInventoryId(
            reservation.inventoryId,
          );
        if (
          !inventory ||
          inventory.id !== reservation.inventoryId ||
          inventory.destinationId !== ticket.destinationId ||
          inventory.productKind !== ticket.product.kind ||
          inventory.productReference !== ticket.product.reference ||
          (authority.scope.kind === "business" &&
            !authority.scope.businessIds.includes(inventory.businessId))
        )
          notFound();

        const business = await dependencies.owner.findBusiness(
          inventory.businessId,
          inventory.destinationId,
        );
        if (
          !business ||
          business.businessId !== inventory.businessId ||
          business.destinationId !== inventory.destinationId
        )
          notFound();

        let placeId = inventory.admission?.placeId ?? null;
        const catalogBinding =
          await dependencies.businessInventory.findCatalogBindingByInventoryId(
            inventory.id,
          );
        if (catalogBinding) {
          if (
            catalogBinding.inventoryId !== inventory.id ||
            catalogBinding.businessId !== inventory.businessId
          )
            notFound();
          const offer = await dependencies.owner.findOffer(
            catalogBinding.offerId,
          );
          if (
            !offer ||
            offer.id !== catalogBinding.offerId ||
            offer.businessId !== inventory.businessId ||
            (offer.destinationId !== null &&
              offer.destinationId !== inventory.destinationId) ||
            (placeId !== null &&
              offer.placeId !== null &&
              placeId !== offer.placeId)
          )
            notFound();
          // Catalog product IDs and Ticketing product references are distinct contracts.
          placeId ??= offer.placeId;
        }
        if (placeId !== null) {
          const place = await dependencies.owner.findPlace(placeId);
          if (
            !place ||
            place.id !== placeId ||
            place.businessId !== inventory.businessId ||
            place.destinationId !== inventory.destinationId
          )
            notFound();
        }
      } catch (error) {
        if (error instanceof TicketingOperatorAuthorizationError) throw error;
        throw new TicketingOperatorAuthorizationError(
          "TICKETING_OPERATOR_UNAVAILABLE",
        );
      }
    },
  });
}
