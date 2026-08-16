import { describe, expect, it, vi } from "vitest";

import {
  createTicketReservation,
  createTicketReservationRequestKey,
  type TicketReservation,
} from "@touristic/ticketing/reservations";

import { createTicketReservationApplicationService } from "./reservation-application-service.js";

function reservation(): TicketReservation {
  const requestKey = createTicketReservationRequestKey(
    "tin_authority_0001",
    "authority_attempt_0001",
  );
  if (!requestKey) throw new Error("FIXTURE_INVALID");
  const value = createTicketReservation({
    id: "trv_authority_0001",
    requestKey,
    inventoryId: "tin_authority_0001",
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "volta-a-ilha" },
    unitAmount: { minorUnits: 19_900, currency: "BRL" },
    pricingVersion: "ticket-2026-08",
    holderReference: "holder_authority_0001",
    quantity: 1,
    status: "held",
    expiresAt: "2026-08-16T18:10:00.000Z",
    createdAt: "2026-08-16T18:00:00.000Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describe("Ticketing reservation confirmation application service", () => {
  it("fails closed when backend payment authority does not verify the reservation", async () => {
    const held = reservation();
    const confirmAuthoritative = vi.fn();
    const verify = vi.fn().mockResolvedValue(null);
    const service = createTicketReservationApplicationService({
      reservations: {
        findReservationById: vi.fn().mockResolvedValue(held),
        confirmAuthoritative,
      },
      confirmationAuthority: { verify },
      clock: { now: () => "2026-08-16T18:05:00.000Z" },
    });

    await expect(
      service.confirmReservation({
        reservationId: held.id,
        orderId: "ord_authority_0001",
        paymentId: "pay_authority_0001",
        actorReference: "payment_webhook",
      }),
    ).rejects.toMatchObject({
      code: "TICKETING_RESERVATION_PAYMENT_NOT_VERIFIED",
    });

    expect(verify).toHaveBeenCalledWith({
      reservation: held,
      orderId: "ord_authority_0001",
      paymentId: "pay_authority_0001",
    });
    expect(confirmAuthoritative).not.toHaveBeenCalled();
  });

  it("commits only the exact order and payment returned by backend authority", async () => {
    const held = reservation();
    const confirmAuthoritative = vi.fn().mockResolvedValue({
      reservation: held,
      replayed: false,
    });
    const service = createTicketReservationApplicationService({
      reservations: {
        findReservationById: vi.fn().mockResolvedValue(held),
        confirmAuthoritative,
      },
      confirmationAuthority: {
        verify: vi.fn().mockResolvedValue({
          orderId: "ord_authority_0001",
          paymentId: "pay_authority_0001",
        }),
      },
      clock: { now: () => "2026-08-16T18:05:00.000Z" },
    });

    await service.confirmReservation({
      reservationId: held.id,
      orderId: "ord_authority_0001",
      paymentId: "pay_authority_0001",
      actorReference: "payment_webhook",
    });

    expect(confirmAuthoritative).toHaveBeenCalledWith({
      reservationId: held.id,
      orderId: "ord_authority_0001",
      paymentId: "pay_authority_0001",
      confirmedAt: "2026-08-16T18:05:00.000Z",
      actorReference: "payment_webhook",
    });
  });

  it("rejects invalid identities before consulting payment authority", async () => {
    const verify = vi.fn();
    const findReservationById = vi.fn();
    const service = createTicketReservationApplicationService({
      reservations: {
        findReservationById,
        confirmAuthoritative: vi.fn(),
      },
      confirmationAuthority: { verify },
      clock: { now: () => "2026-08-16T18:05:00.000Z" },
    });

    await expect(
      service.confirmReservation({
        reservationId: "invalid",
        orderId: "invalid",
        paymentId: "invalid",
        actorReference: "payment_webhook",
      }),
    ).rejects.toMatchObject({
      code: "TICKETING_RESERVATION_CONFIRMATION_INVALID",
    });

    expect(findReservationById).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects an expired hold before consulting payment authority", async () => {
    const held = reservation();
    const verify = vi.fn();
    const service = createTicketReservationApplicationService({
      reservations: {
        findReservationById: vi.fn().mockResolvedValue(held),
        confirmAuthoritative: vi.fn(),
      },
      confirmationAuthority: { verify },
      clock: { now: () => "2026-08-16T18:10:00.000Z" },
    });

    await expect(
      service.confirmReservation({
        reservationId: held.id,
        orderId: "ord_authority_0001",
        paymentId: "pay_authority_0001",
        actorReference: "payment_webhook",
      }),
    ).rejects.toMatchObject({
      code: "TICKETING_RESERVATION_HOLD_EXPIRED",
    });
    expect(verify).not.toHaveBeenCalled();
  });
});
