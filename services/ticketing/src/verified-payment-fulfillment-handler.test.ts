import { describe, expect, it, vi } from "vitest";

import { normalizeVerifiedPaymentResult } from "@touristic/financial";
import { createTicketingOrderBinding } from "@touristic/ordering/ticketing-reservation";

import { createVerifiedPaymentTicketFulfillmentHandler } from "./verified-payment-fulfillment-handler.js";

function approvedResult() {
  const result = normalizeVerifiedPaymentResult({
    resultId: "fev_ticketing_handler_0001",
    providerEventId: "pwe_ticketing_handler_0001",
    paymentId: "pay_ticketing_handler_0001",
    orderReference: "ord_ticketing_handler_0001",
    kind: "approved",
    paymentStatus: "confirmed",
    paymentReference: "provider_ticketing_handler_0001",
    occurredAt: "2026-08-16T18:05:00.000Z",
    recordedAt: "2026-08-16T18:05:01.000Z",
  });
  if (!result) throw new Error("FIXTURE_INVALID");
  return result;
}

describe("Verified Financial payment Ticketing fulfillment handler", () => {
  it("derives reservation/order/payment identities from the verified Financial result", async () => {
    const result = approvedResult();
    const binding = createTicketingOrderBinding({
      reservationReference: "trv_ticketing_handler_0001",
      orderId: result.orderReference,
      productReference: "tour:volta-a-ilha",
      quantity: 1,
      amount: { minorUnits: 19_900, currency: "BRL" },
      pricingVersion: "ticket-2026-08",
      boundAt: "2026-08-16T18:01:00.000Z",
    });
    if (!binding) throw new Error("FIXTURE_INVALID");
    const fulfill = vi.fn().mockResolvedValue({
      reservation: { id: binding.reservationReference } as never,
      ticket: { id: "tck_ticketing_handler_0001" } as never,
      qrPayload: "qr",
      replayed: false,
    });
    const handler = createVerifiedPaymentTicketFulfillmentHandler({
      bindings: {
        findByReservationReference: vi.fn(),
        findByOrderId: vi.fn().mockResolvedValue(binding),
        save: vi.fn(),
      },
      fulfillment: { fulfill },
    });

    await handler.handle(result);

    expect(fulfill).toHaveBeenCalledWith({
      reservationId: binding.reservationReference,
      orderId: binding.orderId,
      paymentId: result.paymentId,
      actorReference: "verified_payment_outcome",
    });
  });

  it("ignores non-approved Financial terminal results", async () => {
    const refunded = normalizeVerifiedPaymentResult({
      resultId: "fev_ticketing_handler_refund_0001",
      providerEventId: "pwe_ticketing_handler_refund_0001",
      paymentId: "pay_ticketing_handler_0001",
      orderReference: "ord_ticketing_handler_0001",
      kind: "refunded",
      paymentStatus: "refunded",
      paymentReference: "provider_ticketing_handler_0001",
      occurredAt: "2026-08-16T19:05:00.000Z",
      recordedAt: "2026-08-16T19:05:01.000Z",
    });
    if (!refunded) throw new Error("FIXTURE_INVALID");
    const findByOrderId = vi.fn();
    const fulfill = vi.fn();
    const handler = createVerifiedPaymentTicketFulfillmentHandler({
      bindings: {
        findByReservationReference: vi.fn(),
        findByOrderId,
        save: vi.fn(),
      },
      fulfillment: { fulfill },
    });

    await expect(handler.handle(refunded)).resolves.toBeNull();
    expect(findByOrderId).not.toHaveBeenCalled();
    expect(fulfill).not.toHaveBeenCalled();
  });
});
