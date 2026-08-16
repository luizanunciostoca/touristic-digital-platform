import { describe, expect, it, vi } from "vitest";

import {
  createTicketReservation,
  createTicketReservationRequestKey,
  type TicketReservation,
} from "@touristic/ticketing/reservations";

import { createTicketReservationFulfillmentService } from "./reservation-fulfillment-service.js";

function confirmedReservation(): TicketReservation {
  const requestKey = createTicketReservationRequestKey(
    "tin_fulfillment_0001",
    "fulfillment_attempt_0001",
  );
  if (!requestKey) throw new Error("FIXTURE_INVALID");
  const value = createTicketReservation({
    id: "trv_fulfillment_0001",
    requestKey,
    inventoryId: "tin_fulfillment_0001",
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "volta-a-ilha" },
    unitAmount: { minorUnits: 19_900, currency: "BRL" },
    pricingVersion: "ticket-2026-08",
    holderReference: "holder_fulfillment_0001",
    quantity: 2,
    status: "confirmed",
    expiresAt: "2026-08-16T18:10:00.000Z",
    orderId: "ord_fulfillment_0001",
    paymentId: "pay_fulfillment_0001",
    createdAt: "2026-08-16T18:00:00.000Z",
    confirmedAt: "2026-08-16T18:05:00.000Z",
    updatedAt: "2026-08-16T18:05:00.000Z",
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describe("Ticketing reservation fulfillment service", () => {
  it("replays an authoritative confirmed reservation into deterministic ticket issuance", async () => {
    const reservation = confirmedReservation();
    const confirmReservation = vi.fn();
    const issueTicket = vi.fn().mockResolvedValue({
      ticket: { id: "tck_fulfillment_0001" } as never,
      qrPayload: "tck.v1.tck_fulfillment_0001.signature",
      replayed: false,
    });
    const service = createTicketReservationFulfillmentService({
      reservations: {
        findReservationById: vi.fn().mockResolvedValue(reservation),
        confirmAuthoritative: vi.fn(),
      },
      confirmations: { confirmReservation },
      ticketing: {
        issueTicket,
        checkInByQr: vi.fn(),
        checkInByCode: vi.fn(),
        syncOfflineEnvelope: vi.fn(),
      },
      holderProfiles: {
        resolveHolderName: vi.fn().mockResolvedValue("Visitante Teste"),
      },
    });

    const result = await service.fulfill({
      reservationId: reservation.id,
      orderId: reservation.orderId,
      paymentId: reservation.paymentId,
      actorReference: "verified_payment_outcome",
    });

    expect(confirmReservation).not.toHaveBeenCalled();
    expect(issueTicket).toHaveBeenCalledWith({
      orderId: reservation.orderId,
      paymentId: reservation.paymentId,
      destinationId: reservation.destinationId,
      product: reservation.product,
      holderName: "Visitante Teste",
      quantity: 2,
      amount: { minorUnits: 39_800, currency: "BRL" },
      issuedAt: "2026-08-16T18:05:00.000Z",
    });
    expect(result.replayed).toBe(true);
  });

  it("confirms a held reservation before issuing and never accepts a divergent identity", async () => {
    const confirmed = confirmedReservation();
    const held = createTicketReservation({
      ...confirmed,
      status: "held",
      orderId: null,
      paymentId: null,
      confirmedAt: null,
      updatedAt: confirmed.createdAt,
    });
    if (!held) throw new Error("FIXTURE_INVALID");
    const confirmReservation = vi.fn().mockResolvedValue({
      reservation: confirmed,
      replayed: false,
    });
    const issueTicket = vi.fn().mockResolvedValue({
      ticket: { id: "tck_fulfillment_0001" } as never,
      qrPayload: "tck.v1.tck_fulfillment_0001.signature",
      replayed: false,
    });
    const service = createTicketReservationFulfillmentService({
      reservations: {
        findReservationById: vi.fn().mockResolvedValue(held),
        confirmAuthoritative: vi.fn(),
      },
      confirmations: { confirmReservation },
      ticketing: {
        issueTicket,
        checkInByQr: vi.fn(),
        checkInByCode: vi.fn(),
        syncOfflineEnvelope: vi.fn(),
      },
      holderProfiles: {
        resolveHolderName: vi.fn().mockResolvedValue("Visitante Teste"),
      },
    });

    await service.fulfill({
      reservationId: held.id,
      orderId: confirmed.orderId,
      paymentId: confirmed.paymentId,
      actorReference: "verified_payment_outcome",
    });

    expect(confirmReservation).toHaveBeenCalledTimes(1);
    expect(issueTicket).toHaveBeenCalledTimes(1);
  });
});
