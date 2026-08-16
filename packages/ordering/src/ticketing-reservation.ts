import {
  createMoney,
  normalizeFinancialTimestamp,
  type Money,
} from "@touristic/financial";

import {
  capturePricingSnapshot,
  createOrder,
  createPricingQuote,
  createTicketingOrderRequestKey,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
  type OrderId,
  type OrderRepositoryPort,
} from "./index.js";

const RESERVATION_REFERENCE = /^trv_[A-Za-z0-9_-]{8,116}$/u;
const PRODUCT_REFERENCE = /^[A-Za-z0-9:_-]{2,120}$/u;
const PRICING_VERSION = /^[A-Za-z0-9._:-]{1,80}$/u;

export interface TicketingOrderBinding {
  readonly reservationReference: string;
  readonly orderId: OrderId;
  readonly productReference: string;
  readonly quantity: number;
  readonly amount: Money;
  readonly pricingVersion: string;
  readonly boundAt: string;
}

export interface TicketingOrderBindingRepositoryPort {
  findByReservationReference(
    reservationReference: string,
  ): Promise<TicketingOrderBinding | null>;
  findByOrderId(orderId: OrderId): Promise<TicketingOrderBinding | null>;
  save(binding: TicketingOrderBinding): Promise<TicketingOrderBinding>;
}

export interface TicketingReservationOrderHandoff {
  readonly reservationReference: unknown;
  readonly productReference: unknown;
  readonly quantity: unknown;
  readonly amount: unknown;
  readonly pricingVersion: unknown;
  readonly capturedAt: unknown;
}

export interface TicketingReservationOrderResult {
  readonly order: Order;
  readonly binding: TicketingOrderBinding;
  readonly replayed: boolean;
}

export interface TicketingReservationOrderApplicationService {
  placeReservationOrder(
    handoff: TicketingReservationOrderHandoff,
  ): Promise<TicketingReservationOrderResult>;
}

export interface TicketingReservationOrderIdentityPort {
  allocateOrderId(): unknown;
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

export function normalizeTicketingReservationReference(
  value: unknown,
): string | null {
  const normalized = normalizeString(value, 120);
  return RESERVATION_REFERENCE.test(normalized) ? normalized : null;
}

export function createTicketingOrderBinding(input: {
  readonly reservationReference: unknown;
  readonly orderId: unknown;
  readonly productReference: unknown;
  readonly quantity: unknown;
  readonly amount: unknown;
  readonly pricingVersion: unknown;
  readonly boundAt: unknown;
}): TicketingOrderBinding | null {
  const reservationReference = normalizeTicketingReservationReference(
    input.reservationReference,
  );
  const orderId = normalizeOrderId(input.orderId);
  const productReference = normalizeString(input.productReference, 120);
  const quantity =
    typeof input.quantity === "number" &&
    Number.isSafeInteger(input.quantity) &&
    input.quantity > 0 &&
    input.quantity <= 20
      ? input.quantity
      : null;
  const amountInput = input.amount as Partial<Money> | null | undefined;
  const amount = createMoney(
    amountInput?.minorUnits,
    amountInput?.currency,
  );
  const pricingVersion = normalizeString(input.pricingVersion, 80);
  const boundAt = normalizeFinancialTimestamp(input.boundAt);

  if (
    !reservationReference ||
    !orderId ||
    !PRODUCT_REFERENCE.test(productReference) ||
    !quantity ||
    !amount ||
    amount.minorUnits <= 0 ||
    !PRICING_VERSION.test(pricingVersion) ||
    !boundAt
  ) {
    return null;
  }

  return Object.freeze({
    reservationReference,
    orderId,
    productReference,
    quantity,
    amount,
    pricingVersion,
    boundAt: new Date(boundAt).toISOString(),
  });
}

export function ticketingOrderBindingsEqual(
  left: TicketingOrderBinding,
  right: TicketingOrderBinding,
): boolean {
  return (
    left.reservationReference === right.reservationReference &&
    left.orderId === right.orderId &&
    left.productReference === right.productReference &&
    left.quantity === right.quantity &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency &&
    left.pricingVersion === right.pricingVersion &&
    left.boundAt === right.boundAt
  );
}

interface NormalizedHandoff {
  readonly reservationReference: string;
  readonly productReference: string;
  readonly quantity: number;
  readonly amount: Money;
  readonly pricingVersion: string;
  readonly capturedAt: string;
}

function normalizeHandoff(
  input: TicketingReservationOrderHandoff,
): NormalizedHandoff | null {
  const reservationReference = normalizeTicketingReservationReference(
    input.reservationReference,
  );
  const productReference = normalizeString(input.productReference, 120);
  const quantity =
    typeof input.quantity === "number" &&
    Number.isSafeInteger(input.quantity) &&
    input.quantity > 0 &&
    input.quantity <= 20
      ? input.quantity
      : null;
  const amountInput = input.amount as Partial<Money> | null | undefined;
  const amount = createMoney(
    amountInput?.minorUnits,
    amountInput?.currency,
  );
  const pricingVersion = normalizeString(input.pricingVersion, 80);
  const capturedAt = normalizeFinancialTimestamp(input.capturedAt);
  if (
    !reservationReference ||
    !PRODUCT_REFERENCE.test(productReference) ||
    !quantity ||
    !amount ||
    amount.minorUnits <= 0 ||
    !PRICING_VERSION.test(pricingVersion) ||
    !capturedAt
  ) {
    return null;
  }
  return Object.freeze({
    reservationReference,
    productReference,
    quantity,
    amount,
    pricingVersion,
    capturedAt: new Date(capturedAt).toISOString(),
  });
}

function assertOrderMatchesHandoff(order: Order, handoff: NormalizedHandoff) {
  if (
    order.source.kind !== "ticketing_reservation" ||
    order.source.reference !== handoff.reservationReference ||
    order.requestKey !==
      createTicketingOrderRequestKey(handoff.reservationReference) ||
    order.pricing.planId !== handoff.reservationReference ||
    order.pricing.planName !== handoff.productReference ||
    order.pricing.amount.minorUnits !== handoff.amount.minorUnits ||
    order.pricing.amount.currency !== handoff.amount.currency ||
    order.pricing.pricingVersion !== handoff.pricingVersion ||
    order.pricing.capturedAt !== handoff.capturedAt ||
    order.status === "cancelled"
  ) {
    throw new Error("ORDERING_TICKETING_ORDER_CONFLICT");
  }
}

function bindingFor(order: Order, handoff: NormalizedHandoff) {
  const binding = createTicketingOrderBinding({
    reservationReference: handoff.reservationReference,
    orderId: order.id,
    productReference: handoff.productReference,
    quantity: handoff.quantity,
    amount: handoff.amount,
    pricingVersion: handoff.pricingVersion,
    boundAt: order.createdAt,
  });
  if (!binding) throw new Error("ORDERING_TICKETING_BINDING_INVALID");
  return binding;
}

export function createTicketingReservationOrderApplicationService(
  dependencies: {
    readonly orders: OrderRepositoryPort;
    readonly bindings: TicketingOrderBindingRepositoryPort;
    readonly identities: TicketingReservationOrderIdentityPort;
  },
): TicketingReservationOrderApplicationService {
  const service: TicketingReservationOrderApplicationService = {
    async placeReservationOrder(input) {
      const handoff = normalizeHandoff(input);
      if (!handoff) throw new Error("ORDERING_TICKETING_HANDOFF_INVALID");
      const requestKey = createTicketingOrderRequestKey(
        handoff.reservationReference,
      );
      if (!requestKey) throw new Error("ORDERING_TICKETING_HANDOFF_INVALID");

      let order = await dependencies.orders.findByRequestKey(requestKey);
      let replayed = order !== null;
      if (!order) {
        const orderId = normalizeOrderId(dependencies.identities.allocateOrderId());
        const source = normalizeOrderSourceReference(
          handoff.reservationReference,
          "ticketing_reservation",
        );
        const quote = createPricingQuote({
          planId: handoff.reservationReference,
          planName: handoff.productReference,
          minorUnits: handoff.amount.minorUnits,
          currency: handoff.amount.currency,
          pricingVersion: handoff.pricingVersion,
        });
        const snapshot = quote
          ? capturePricingSnapshot(quote, handoff.capturedAt)
          : null;
        if (!orderId || !source || !snapshot) {
          throw new Error("ORDERING_TICKETING_ORDER_INVALID");
        }
        const proposed = createOrder({
          id: orderId,
          requestKey,
          source,
          status: "pending_payment",
          pricing: snapshot,
          createdAt: handoff.capturedAt,
        });
        if (!proposed) throw new Error("ORDERING_TICKETING_ORDER_INVALID");
        try {
          order = await dependencies.orders.save(proposed);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "ORDERING_REQUEST_KEY_CONFLICT"
          ) {
            throw error;
          }
          order = await dependencies.orders.findByRequestKey(requestKey);
          if (!order) throw new Error("ORDERING_TICKETING_ORDER_CONFLICT");
          replayed = true;
        }
      }

      assertOrderMatchesHandoff(order, handoff);
      const expectedBinding = bindingFor(order, handoff);
      const binding = await dependencies.bindings.save(expectedBinding);
      if (!ticketingOrderBindingsEqual(binding, expectedBinding)) {
        throw new Error("ORDERING_TICKETING_BINDING_CONFLICT");
      }

      return Object.freeze({ order, binding, replayed });
    },
  };

  return Object.freeze(service);
}
