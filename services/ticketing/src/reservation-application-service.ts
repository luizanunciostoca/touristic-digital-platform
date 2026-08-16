import { normalizePaymentId, type PaymentId } from "@touristic/financial";
import { normalizeOrderId, type OrderId } from "@touristic/ordering";
import {
  isTicketReservationExpired,
  normalizeTicketReservationId,
  type TicketReservation,
  type TicketReservationId,
} from "@touristic/ticketing/reservations";

export const ticketReservationApplicationErrorCodes = Object.freeze([
  "TICKETING_RESERVATION_CONFIRMATION_INVALID",
  "TICKETING_RESERVATION_NOT_FOUND",
  "TICKETING_RESERVATION_NOT_HELD",
  "TICKETING_RESERVATION_HOLD_EXPIRED",
  "TICKETING_RESERVATION_PAYMENT_NOT_VERIFIED",
] as const);

export type TicketReservationApplicationErrorCode =
  (typeof ticketReservationApplicationErrorCodes)[number];

export class TicketReservationApplicationError extends Error {
  constructor(readonly code: TicketReservationApplicationErrorCode) {
    super(code);
    this.name = "TicketReservationApplicationError";
  }
}

export interface VerifiedTicketReservationAuthority {
  readonly orderId: OrderId;
  readonly paymentId: PaymentId;
}

export interface TicketReservationConfirmationAuthorityPort {
  verify(input: {
    readonly reservation: TicketReservation;
    readonly orderId: OrderId;
    readonly paymentId: PaymentId;
  }): Promise<VerifiedTicketReservationAuthority | null>;
}

export interface TicketReservationConfirmationResult {
  readonly reservation: TicketReservation;
  readonly replayed: boolean;
}

export interface TicketReservationConfirmationRepositoryPort {
  findReservationById(
    reservationId: TicketReservationId,
  ): Promise<TicketReservation | null>;
  confirmAuthoritative(input: {
    readonly reservationId: TicketReservationId;
    readonly orderId: OrderId;
    readonly paymentId: PaymentId;
    readonly confirmedAt: string;
    readonly actorReference: string;
  }): Promise<TicketReservationConfirmationResult>;
}

export interface TicketReservationClockPort {
  now(): unknown;
}

export interface TicketReservationApplicationService {
  confirmReservation(input: {
    readonly reservationId: unknown;
    readonly orderId: unknown;
    readonly paymentId: unknown;
    readonly actorReference: unknown;
  }): Promise<TicketReservationConfirmationResult>;
}

function normalizedActor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{2,120}$/u.test(normalized) ? normalized : null;
}

function normalizedNow(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function createTicketReservationApplicationService(dependencies: {
  readonly reservations: TicketReservationConfirmationRepositoryPort;
  readonly confirmationAuthority: TicketReservationConfirmationAuthorityPort;
  readonly clock: TicketReservationClockPort;
}): TicketReservationApplicationService {
  return Object.freeze({
    async confirmReservation(input) {
      const reservationId = normalizeTicketReservationId(input.reservationId);
      const orderId = normalizeOrderId(input.orderId);
      const paymentId = normalizePaymentId(input.paymentId);
      const actorReference = normalizedActor(input.actorReference);
      const confirmedAt = normalizedNow(dependencies.clock.now());
      if (
        !reservationId ||
        !orderId ||
        !paymentId ||
        !actorReference ||
        !confirmedAt
      ) {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_CONFIRMATION_INVALID",
        );
      }

      const reservation =
        await dependencies.reservations.findReservationById(reservationId);
      if (!reservation) {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_NOT_FOUND",
        );
      }
      if (reservation.status !== "held") {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_NOT_HELD",
        );
      }
      if (isTicketReservationExpired(reservation, confirmedAt)) {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_HOLD_EXPIRED",
        );
      }

      const verified = await dependencies.confirmationAuthority.verify({
        reservation,
        orderId,
        paymentId,
      });
      if (
        !verified ||
        verified.orderId !== orderId ||
        verified.paymentId !== paymentId
      ) {
        throw new TicketReservationApplicationError(
          "TICKETING_RESERVATION_PAYMENT_NOT_VERIFIED",
        );
      }

      return dependencies.reservations.confirmAuthoritative({
        reservationId,
        orderId: verified.orderId,
        paymentId: verified.paymentId,
        confirmedAt,
        actorReference,
      });
    },
  });
}
