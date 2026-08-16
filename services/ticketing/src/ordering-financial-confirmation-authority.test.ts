import { describe, expect, it, vi } from "vitest";

import {
  applyVerifiedProviderPaymentEvent,
  createPendingPayment,
  normalizeVerifiedPaymentResult,
  normalizeVerifiedProviderPaymentEvent,
} from "@touristic/financial";
import {
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  normalizeOrderSourceReference,
} from "@touristic/ordering";
import { createTicketingOrderBinding } from "@touristic/ordering/ticketing-reservation";
import {
  createTicketReservation,
  createTicketReservationRequestKey,
} from "@touristic/ticketing/reservations";

import { createOrderingFinancialReservationConfirmationAuthority } from "./ordering-financial-confirmation-authority.js";

function fixture() {
  const orderId = normalizeOrderId("ord_ticketing_bridge_0001");
  const requestKey = createBusinessOrderRequestKey(
    "ticketing_bridge_session_0001",
    "ticketing_bridge_plan_0001",
  );
  const source = normalizeOrderSourceReference("ticketing_bridge_source_0001");
  const quote = createPricingQuote({
    planId: "ticketing_bridge_plan_0001",
    planName: "Ticketing bridge",
    minorUnits: 39_800,
    currency: "BRL",
    pricingVersion: "ticket-2026-08",
  });
  if (!orderId || !requestKey || !source || !quote)
    throw new Error("FIXTURE_INVALID");
  const pricing = capturePricingSnapshot(quote, "2026-08-16T18:01:00.000Z");
  if (!pricing) throw new Error("FIXTURE_INVALID");
  const order = createOrder({
    id: orderId,
    requestKey,
    source,
    status: "payment_confirmed",
    pricing,
    createdAt: "2026-08-16T18:01:00.000Z",
    updatedAt: "2026-08-16T18:03:00.000Z",
  });
  if (!order) throw new Error("FIXTURE_INVALID");

  const pendingPayment = createPendingPayment({
    id: "pay_ticketing_bridge_0001",
    orderReference: order.id,
    amount: order.pricing.amount,
    createdAt: "2026-08-16T18:01:30.000Z",
  });
  const providerEvent = normalizeVerifiedProviderPaymentEvent({
    providerEventId: "pwe_ticketing_bridge_0001",
    externalReference: "pay_ticketing_bridge_0001",
    providerPaymentReference: "provider_ticketing_bridge_0001",
    status: "paid",
    occurredAt: "2026-08-16T18:02:30.000Z",
  });
  if (!pendingPayment || !providerEvent) throw new Error("FIXTURE_INVALID");
  const payment = applyVerifiedProviderPaymentEvent(
    pendingPayment,
    providerEvent,
  ).payment;
  const verifiedResult = normalizeVerifiedPaymentResult({
    resultId: "fev_ticketing_bridge_0001",
    providerEventId: providerEvent.providerEventId,
    paymentId: payment.id,
    orderReference: order.id,
    kind: "approved",
    paymentStatus: "confirmed",
    paymentReference: payment.providerReference,
    occurredAt: providerEvent.occurredAt,
    recordedAt: "2026-08-16T18:02:31.000Z",
  });
  if (!verifiedResult) throw new Error("FIXTURE_INVALID");

  const reservationRequestKey = createTicketReservationRequestKey(
    "tin_ticketing_bridge_0001",
    "ticketing_bridge_attempt_0001",
  );
  if (!reservationRequestKey) throw new Error("FIXTURE_INVALID");
  const reservation = createTicketReservation({
    id: "trv_ticketing_bridge_0001",
    requestKey: reservationRequestKey,
    inventoryId: "tin_ticketing_bridge_0001",
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "volta-a-ilha" },
    unitAmount: { minorUnits: 19_900, currency: "BRL" },
    pricingVersion: "ticket-2026-08",
    holderReference: "holder_ticketing_bridge_0001",
    quantity: 2,
    status: "held",
    expiresAt: "2026-08-16T18:10:00.000Z",
    createdAt: "2026-08-16T18:00:00.000Z",
  });
  if (!reservation) throw new Error("FIXTURE_INVALID");

  const binding = createTicketingOrderBinding({
    reservationReference: reservation.id,
    orderId: order.id,
    productReference: "tour:volta-a-ilha",
    quantity: reservation.quantity,
    amount: payment.amount,
    pricingVersion: reservation.pricingVersion,
    boundAt: "2026-08-16T18:01:00.000Z",
  });
  if (!binding) throw new Error("FIXTURE_INVALID");

  return { binding, order, payment, reservation, verifiedResult };
}

function authority(overrides?: {
  readonly verifiedResult?: ReturnType<typeof fixture>["verifiedResult"] | null;
  readonly binding?: ReturnType<typeof fixture>["binding"] | null;
}) {
  const value = fixture();
  return {
    value,
    service: createOrderingFinancialReservationConfirmationAuthority({
      bindings: {
        findByReservationReference: vi
          .fn()
          .mockResolvedValue(
            overrides?.binding === undefined
              ? value.binding
              : overrides.binding,
          ),
        findByOrderId: vi.fn(),
        save: vi.fn(),
      },
      orders: {
        findById: vi.fn().mockResolvedValue(value.order),
        findByRequestKey: vi.fn(),
        save: vi.fn(),
      },
      payments: {
        findById: vi.fn().mockResolvedValue(value.payment),
        save: vi.fn(),
      },
      verifiedResults: {
        findByProviderEventId: vi.fn(),
        findByPaymentStatus: vi
          .fn()
          .mockResolvedValue(
            overrides?.verifiedResult === undefined
              ? value.verifiedResult
              : overrides.verifiedResult,
          ),
        save: vi.fn(),
      },
    }),
  };
}

describe("Ticketing canonical Ordering/Financial confirmation authority", () => {
  it("accepts only the persisted order, payment and approved verified outcome", async () => {
    const { service, value } = authority();
    await expect(
      service.verify({
        reservation: value.reservation,
        orderId: value.order.id,
        paymentId: value.payment.id,
      }),
    ).resolves.toEqual({
      orderId: value.order.id,
      paymentId: value.payment.id,
    });
  });

  it("rejects a confirmed Payment when persisted verified Financial evidence is absent", async () => {
    const { service, value } = authority({ verifiedResult: null });
    await expect(
      service.verify({
        reservation: value.reservation,
        orderId: value.order.id,
        paymentId: value.payment.id,
      }),
    ).resolves.toBeNull();
  });

  it("rejects reservation price/product divergence before Financial confirmation", async () => {
    const value = fixture();
    const divergentBinding = createTicketingOrderBinding({
      ...value.binding,
      productReference: "tour:outro-produto",
    });
    if (!divergentBinding) throw new Error("FIXTURE_INVALID");
    const { service } = authority({ binding: divergentBinding });
    await expect(
      service.verify({
        reservation: value.reservation,
        orderId: value.order.id,
        paymentId: value.payment.id,
      }),
    ).resolves.toBeNull();
  });
});
