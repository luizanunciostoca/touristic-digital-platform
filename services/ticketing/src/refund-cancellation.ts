import {
  type PaymentRepositoryPort,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
} from "@touristic/financial";
import { normalizeOrderId } from "@touristic/ordering";
import type { TicketingOrderBindingRepositoryPort } from "@touristic/ordering/ticketing-reservation";
import type { Ticket } from "@touristic/ticketing";
import {
  normalizeTicketReservationId,
  type TicketReservation,
  type TicketReservationId,
} from "@touristic/ticketing/reservations";

export interface RefundedReservationCancellationRepositoryPort {
  findReservationById(
    reservationId: TicketReservationId,
  ): Promise<TicketReservation | null>;
  cancelConfirmedAfterRefund(input: {
    readonly reservationId: TicketReservationId;
    readonly orderId: string;
    readonly paymentId: string;
    readonly cancelledAt: string;
    readonly actorReference: string;
  }): Promise<{
    readonly reservation: TicketReservation;
    readonly tickets: readonly Ticket[];
    readonly replayed: boolean;
  }>;
}

export interface VerifiedRefundCancellationResult {
  readonly reservation: TicketReservation;
  readonly tickets: readonly Ticket[];
  readonly replayed: boolean;
}

export interface VerifiedRefundTicketCancellationHandler {
  handle(
    result: VerifiedPaymentResult,
  ): Promise<VerifiedRefundCancellationResult | null>;
}

function sameRefundResult(
  left: VerifiedPaymentResult,
  right: VerifiedPaymentResult,
): boolean {
  return (
    left.resultId === right.resultId &&
    left.paymentId === right.paymentId &&
    left.orderReference === right.orderReference &&
    left.kind === "refunded" &&
    left.paymentStatus === "refunded"
  );
}

export function createVerifiedRefundTicketCancellationHandler(dependencies: {
  readonly bindings: TicketingOrderBindingRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly verifiedResults: VerifiedPaymentResultRepositoryPort;
  readonly reservations: RefundedReservationCancellationRepositoryPort;
}): VerifiedRefundTicketCancellationHandler {
  const handler: VerifiedRefundTicketCancellationHandler = {
    async handle(result) {
      if (result.kind !== "refunded" || result.paymentStatus !== "refunded") {
        return null;
      }

      const orderId = normalizeOrderId(result.orderReference);
      if (!orderId) throw new Error("TICKETING_REFUND_ORDER_INVALID");
      const binding = await dependencies.bindings.findByOrderId(orderId);
      if (!binding) return null;
      const reservationId = normalizeTicketReservationId(
        binding.reservationReference,
      );
      if (!reservationId) {
        throw new Error("TICKETING_ORDERING_BINDING_INVALID");
      }

      const [payment, persistedResult, currentReservation] = await Promise.all([
        dependencies.payments.findById(result.paymentId),
        dependencies.verifiedResults.findByPaymentStatus(
          result.paymentId,
          "refunded",
        ),
        dependencies.reservations.findReservationById(reservationId),
      ]);
      if (
        !payment ||
        payment.status !== "refunded" ||
        payment.subject.kind !== "order" ||
        payment.subject.reference !== binding.orderId ||
        payment.id !== result.paymentId ||
        !persistedResult ||
        !sameRefundResult(persistedResult, result) ||
        !currentReservation ||
        currentReservation.orderId !== binding.orderId ||
        currentReservation.paymentId !== result.paymentId
      ) {
        throw new Error("TICKETING_REFUND_AUTHORITY_MISMATCH");
      }

      return dependencies.reservations.cancelConfirmedAfterRefund({
        reservationId,
        orderId: binding.orderId,
        paymentId: result.paymentId,
        cancelledAt: result.occurredAt,
        actorReference: "verified_financial_refund",
      });
    },
  };

  return Object.freeze(handler);
}
