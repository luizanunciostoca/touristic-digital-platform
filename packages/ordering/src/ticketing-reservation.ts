import {
  createMoney,
  normalizeFinancialTimestamp,
  type Money,
} from "@touristic/financial";

import { normalizeOrderId, type OrderId } from "./index.js";

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
