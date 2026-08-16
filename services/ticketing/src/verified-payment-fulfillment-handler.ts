import type { VerifiedPaymentResult } from "@touristic/financial";
import { normalizeOrderId } from "@touristic/ordering";
import type { TicketingOrderBindingRepositoryPort } from "@touristic/ordering/ticketing-reservation";
import { normalizeTicketReservationId } from "@touristic/ticketing/reservations";

import type {
  TicketReservationFulfillmentResult,
  TicketReservationFulfillmentService,
} from "./reservation-fulfillment-service.js";

export interface VerifiedPaymentTicketFulfillmentHandler {
  handle(
    result: VerifiedPaymentResult,
  ): Promise<TicketReservationFulfillmentResult | null>;
}

export function createVerifiedPaymentTicketFulfillmentHandler(dependencies: {
  readonly bindings: TicketingOrderBindingRepositoryPort;
  readonly fulfillment: TicketReservationFulfillmentService;
}): VerifiedPaymentTicketFulfillmentHandler {
  const handler: VerifiedPaymentTicketFulfillmentHandler = {
    async handle(result) {
      if (result.kind !== "approved" || result.paymentStatus !== "confirmed") {
        return null;
      }
      const orderId = normalizeOrderId(result.orderReference);
      if (!orderId) return null;
      const binding = await dependencies.bindings.findByOrderId(orderId);
      if (!binding) return null;
      const reservationId = normalizeTicketReservationId(
        binding.reservationReference,
      );
      if (!reservationId) {
        throw new Error("TICKETING_ORDERING_BINDING_INVALID");
      }
      return dependencies.fulfillment.fulfill({
        reservationId,
        orderId,
        paymentId: result.paymentId,
        actorReference: "verified_payment_outcome",
      });
    },
  };

  return Object.freeze(handler);
}
