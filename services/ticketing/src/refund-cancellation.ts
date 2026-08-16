import {
  type PaymentRepositoryPort,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
} from "@touristic/financial";
import type { TicketingOrderBindingRepositoryPort } from "@touristic/ordering/ticketing-reservation";
import {
  applyTicketCheckIn,
  type Ticket,
  type TicketRepositoryPort,
} from "@touristic/ticketing";
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
  }): Promise<{ readonly reservation: TicketReservation; readonly replayed: boolean }>;
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

function cancellationTime(ticket: Ticket, refundedAt: string): string {
  const current = Date.parse(ticket.updatedAt);
  const candidate = Date.parse(refundedAt);
  if (!Number.isFinite(current) || !Number.isFinite(candidate)) {
    throw new Error("TICKETING_REFUND_TIMESTAMP_INVALID");
  }
  return new Date(Math.max(candidate, current + 1)).toISOString();
}

export function createVerifiedRefundTicketCancellationHandler(dependencies: {
  readonly bindings: TicketingOrderBindingRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly verifiedResults: VerifiedPaymentResultRepositoryPort;
  readonly reservations: RefundedReservationCancellationRepositoryPort;
  readonly tickets: TicketRepositoryPort;
}): VerifiedRefundTicketCancellationHandler {
  const handler: VerifiedRefundTicketCancellationHandler = {
    async handle(result) {
      if (result.kind !== "refunded" || result.paymentStatus !== "refunded") {
        return null;
      }

      const binding = await dependencies.bindings.findByOrderId(
        result.orderReference as never,
      );
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

      const reservationResult =
        await dependencies.reservations.cancelConfirmedAfterRefund({
          reservationId,
          orderId: binding.orderId,
          paymentId: result.paymentId,
          cancelledAt: result.occurredAt,
          actorReference: "verified_financial_refund",
        });

      const existingTickets = await dependencies.tickets.findByOrderId(
        binding.orderId,
      );
      const tickets: Ticket[] = [];
      let replayed = reservationResult.replayed;
      for (const ticket of existingTickets) {
        if (ticket.paymentId !== result.paymentId) {
          throw new Error("TICKETING_REFUND_TICKET_AUTHORITY_MISMATCH");
        }
        if (ticket.status === "used") {
          throw new Error("TICKETING_REFUND_TICKET_ALREADY_USED");
        }
        if (ticket.status === "cancelled") {
          replayed = true;
          tickets.push(ticket);
          continue;
        }
        const cancelled = applyTicketCheckIn(ticket, {
          result: "cancelled",
          occurredAt: cancellationTime(ticket, result.occurredAt),
        });
        tickets.push(await dependencies.tickets.save(cancelled));
      }

      return Object.freeze({
        reservation: reservationResult.reservation,
        tickets: Object.freeze(tickets),
        replayed,
      });
    },
  };

  return Object.freeze(handler);
}
