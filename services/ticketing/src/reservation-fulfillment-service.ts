import { createMoney, normalizePaymentId } from "@touristic/financial";
import { normalizeOrderId } from "@touristic/ordering";
import {
  normalizeTicketReservationId,
  type TicketReservation,
} from "@touristic/ticketing/reservations";

import {
  TicketReservationApplicationError,
  type TicketReservationApplicationService,
  type TicketReservationConfirmationRepositoryPort,
} from "./reservation-application-service.js";
import type {
  TicketingApplicationService,
  TicketingIssueResult,
} from "./ticketing-application-service.js";

export interface TicketHolderProfilePort {
  resolveHolderName(holderReference: string): Promise<string | null>;
}

export interface TicketReservationFulfillmentResult extends TicketingIssueResult {
  readonly reservation: TicketReservation;
}

export interface TicketReservationFulfillmentService {
  fulfill(input: {
    readonly reservationId: unknown;
    readonly orderId: unknown;
    readonly paymentId: unknown;
    readonly actorReference: unknown;
  }): Promise<TicketReservationFulfillmentResult>;
}

export function createTicketReservationFulfillmentService(dependencies: {
  readonly reservations: TicketReservationConfirmationRepositoryPort;
  readonly confirmations: TicketReservationApplicationService;
  readonly ticketing: TicketingApplicationService;
  readonly holderProfiles: TicketHolderProfilePort;
}): TicketReservationFulfillmentService {
  const service: TicketReservationFulfillmentService = {
    async fulfill(input) {
      const reservationId = normalizeTicketReservationId(input.reservationId);
      const orderId = normalizeOrderId(input.orderId);
      const paymentId = normalizePaymentId(input.paymentId);
      if (!reservationId || !orderId || !paymentId) {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_CONFIRMATION_INVALID",
        );
      }

      let reservation =
        await dependencies.reservations.findReservationById(reservationId);
      if (!reservation) {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_NOT_FOUND",
        );
      }

      let reservationReplayed = false;
      if (reservation.status === "held") {
        const confirmed = await dependencies.confirmations.confirmReservation({
          reservationId,
          orderId,
          paymentId,
          actorReference: input.actorReference,
        });
        reservation = confirmed.reservation;
        reservationReplayed = confirmed.replayed;
      } else if (
        reservation.status === "confirmed" &&
        reservation.orderId === orderId &&
        reservation.paymentId === paymentId
      ) {
        reservationReplayed = true;
      } else {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_NOT_HELD",
        );
      }

      if (!reservation.confirmedAt) {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_CONFIRMATION_INVALID",
        );
      }

      const holderName = await dependencies.holderProfiles.resolveHolderName(
        reservation.holderReference,
      );
      if (!holderName) throw new Error("TICKETING_HOLDER_PROFILE_NOT_FOUND");

      const totalMinorUnits =
        reservation.unitAmount.minorUnits * reservation.quantity;
      const amount = createMoney(
        totalMinorUnits,
        reservation.unitAmount.currency,
      );
      if (!amount || !Number.isSafeInteger(totalMinorUnits)) {
        throw new Error("TICKETING_RESERVATION_AMOUNT_INVALID");
      }

      const issued = await dependencies.ticketing.issueTicket({
        orderId,
        paymentId,
        destinationId: reservation.destinationId,
        product: reservation.product,
        holderName,
        quantity: reservation.quantity,
        amount,
        issuedAt: reservation.confirmedAt,
      });

      return Object.freeze({
        reservation,
        ticket: issued.ticket,
        qrPayload: issued.qrPayload,
        replayed: reservationReplayed || issued.replayed,
      });
    },
  };

  return Object.freeze(service);
}
