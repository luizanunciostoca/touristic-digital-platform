import {
  createMoney,
  normalizeFinancialTimestamp,
  type Money,
} from "@touristic/financial";

import {
  capturePricingSnapshot,
  createOrder,
  createPricingQuote,
  createRestaurantOrderRequestKey,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
  type OrderId,
  type OrderRepositoryPort,
} from "./index.js";

const RESERVATION_REFERENCE = /^rrv_[A-Za-z0-9_-]{8,116}$/u;
const BUSINESS_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;
const PRICING_VERSION = /^[A-Za-z0-9._:-]{1,80}$/u;

export interface RestaurantReservationOrderBinding {
  readonly reservationReference: string;
  readonly orderId: OrderId;
  readonly businessId: string;
  readonly amount: Money;
  readonly pricingVersion: string;
  readonly boundAt: string;
}

export interface RestaurantReservationOrderBindingRepositoryPort {
  findByReservationReference(
    reservationReference: string,
  ): Promise<RestaurantReservationOrderBinding | null>;
  findByOrderId(
    orderId: OrderId,
  ): Promise<RestaurantReservationOrderBinding | null>;
  save(
    binding: RestaurantReservationOrderBinding,
  ): Promise<RestaurantReservationOrderBinding>;
}

export interface RestaurantReservationOrderHandoff {
  readonly reservationReference: unknown;
  readonly businessId: unknown;
  readonly amount: unknown;
  readonly pricingVersion: unknown;
  readonly capturedAt: unknown;
}

export interface RestaurantReservationOrderResult {
  readonly order: Order;
  readonly binding: RestaurantReservationOrderBinding;
  readonly replayed: boolean;
}

export interface RestaurantReservationOrderIdentityPort {
  allocateOrderId(): unknown;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : "";
}

export function normalizeRestaurantReservationReference(
  value: unknown,
): string | null {
  const normalized = text(value, 120);
  return RESERVATION_REFERENCE.test(normalized) ? normalized : null;
}

export function createRestaurantReservationOrderBinding(input: {
  readonly reservationReference: unknown;
  readonly orderId: unknown;
  readonly businessId: unknown;
  readonly amount: unknown;
  readonly pricingVersion: unknown;
  readonly boundAt: unknown;
}): RestaurantReservationOrderBinding | null {
  const reservationReference = normalizeRestaurantReservationReference(
    input.reservationReference,
  );
  const orderId = normalizeOrderId(input.orderId);
  const businessId = text(input.businessId, 120);
  const amountInput = input.amount as Partial<Money> | null | undefined;
  const amount = createMoney(amountInput?.minorUnits, amountInput?.currency);
  const pricingVersion = text(input.pricingVersion, 80);
  const boundAt = normalizeFinancialTimestamp(input.boundAt);
  if (
    !reservationReference ||
    !orderId ||
    !BUSINESS_ID.test(businessId) ||
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
    businessId,
    amount,
    pricingVersion,
    boundAt: new Date(boundAt).toISOString(),
  });
}

export function restaurantReservationOrderBindingsEqual(
  left: RestaurantReservationOrderBinding,
  right: RestaurantReservationOrderBinding,
): boolean {
  return (
    left.reservationReference === right.reservationReference &&
    left.orderId === right.orderId &&
    left.businessId === right.businessId &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency &&
    left.pricingVersion === right.pricingVersion &&
    left.boundAt === right.boundAt
  );
}

export function createRestaurantReservationOrderApplicationService(dependencies: {
  readonly orders: OrderRepositoryPort;
  readonly bindings: RestaurantReservationOrderBindingRepositoryPort;
  readonly identities: RestaurantReservationOrderIdentityPort;
}) {
  return Object.freeze({
    async placeReservationOrder(
      input: RestaurantReservationOrderHandoff,
    ): Promise<RestaurantReservationOrderResult> {
      const reservationReference = normalizeRestaurantReservationReference(
        input.reservationReference,
      );
      const businessId = text(input.businessId, 120);
      const amountInput = input.amount as Partial<Money> | null | undefined;
      const amount = createMoney(
        amountInput?.minorUnits,
        amountInput?.currency,
      );
      const pricingVersion = text(input.pricingVersion, 80);
      const capturedAt = normalizeFinancialTimestamp(input.capturedAt);
      if (
        !reservationReference ||
        !BUSINESS_ID.test(businessId) ||
        !amount ||
        amount.minorUnits <= 0 ||
        !PRICING_VERSION.test(pricingVersion) ||
        !capturedAt
      ) {
        throw new Error("ORDERING_RESTAURANT_HANDOFF_INVALID");
      }

      const requestKey = createRestaurantOrderRequestKey(reservationReference);
      if (!requestKey) {
        throw new Error("ORDERING_RESTAURANT_HANDOFF_INVALID");
      }

      let order = await dependencies.orders.findByRequestKey(requestKey);
      let replayed = order !== null;
      if (!order) {
        const orderId = normalizeOrderId(
          dependencies.identities.allocateOrderId(),
        );
        const source = normalizeOrderSourceReference(
          reservationReference,
          "restaurant_reservation",
        );
        const quote = createPricingQuote({
          planId: reservationReference,
          planName: "restaurant_deposit",
          minorUnits: amount.minorUnits,
          currency: amount.currency,
          pricingVersion,
        });
        const snapshot = quote
          ? capturePricingSnapshot(quote, capturedAt)
          : null;
        if (!orderId || !source || !snapshot) {
          throw new Error("ORDERING_RESTAURANT_ORDER_INVALID");
        }
        const proposed = createOrder({
          id: orderId,
          requestKey,
          source,
          status: "pending_payment",
          pricing: snapshot,
          createdAt: capturedAt,
        });
        if (!proposed) {
          throw new Error("ORDERING_RESTAURANT_ORDER_INVALID");
        }
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
          if (!order) {
            throw new Error("ORDERING_RESTAURANT_ORDER_CONFLICT");
          }
          replayed = true;
        }
      }

      if (
        order.source.kind !== "restaurant_reservation" ||
        order.source.reference !== reservationReference ||
        order.requestKey !== requestKey ||
        order.pricing.amount.minorUnits !== amount.minorUnits ||
        order.pricing.amount.currency !== amount.currency ||
        order.pricing.pricingVersion !== pricingVersion ||
        order.status === "cancelled"
      ) {
        throw new Error("ORDERING_RESTAURANT_ORDER_CONFLICT");
      }

      const expected = createRestaurantReservationOrderBinding({
        reservationReference,
        orderId: order.id,
        businessId,
        amount,
        pricingVersion,
        boundAt: order.createdAt,
      });
      if (!expected) {
        throw new Error("ORDERING_RESTAURANT_BINDING_INVALID");
      }
      const binding = await dependencies.bindings.save(expected);
      if (!restaurantReservationOrderBindingsEqual(binding, expected)) {
        throw new Error("ORDERING_RESTAURANT_BINDING_CONFLICT");
      }
      return Object.freeze({ order, binding, replayed });
    },
  });
}
