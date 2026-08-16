import {
  createMoney,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type Money,
  type PaymentId,
} from "@touristic/financial";
import { normalizeOrderId, type OrderId } from "@touristic/ordering";

import {
  normalizeTicketProductReference,
  type TicketProductReference,
} from "./index.js";

const ID_BODY = /^[A-Za-z0-9_-]+$/u;
const DESTINATION_REFERENCE = /^[A-Za-z0-9:_-]{2,120}$/u;
const PRICING_VERSION = /^[A-Za-z0-9._:-]{1,80}$/u;
const REQUEST_REFERENCE = /^[A-Za-z0-9_-]{8,120}$/u;

const ticketInventoryIdBrand: unique symbol = Symbol("TicketInventoryId");
const ticketReservationIdBrand: unique symbol = Symbol("TicketReservationId");
const ticketReservationRequestKeyBrand: unique symbol = Symbol(
  "TicketReservationRequestKey",
);

export type TicketInventoryId = string & {
  readonly [ticketInventoryIdBrand]: true;
};
export type TicketReservationId = string & {
  readonly [ticketReservationIdBrand]: true;
};
export type TicketReservationRequestKey = string & {
  readonly [ticketReservationRequestKeyBrand]: true;
};

export const ticketReservationStatuses = Object.freeze([
  "held",
  "confirmed",
  "expired",
  "cancelled",
] as const);
export type TicketReservationStatus =
  (typeof ticketReservationStatuses)[number];

export interface TicketInventoryOffer {
  readonly id: TicketInventoryId;
  readonly destinationId: string;
  readonly product: TicketProductReference;
  readonly label: string;
  readonly unitAmount: Money;
  readonly pricingVersion: string;
  readonly capacity: number;
  readonly maxPerReservation: number;
  readonly salesStartAt: string;
  readonly salesEndAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketReservation {
  readonly id: TicketReservationId;
  readonly requestKey: TicketReservationRequestKey;
  readonly inventoryId: TicketInventoryId;
  readonly destinationId: string;
  readonly product: TicketProductReference;
  readonly unitAmount: Money;
  readonly pricingVersion: string;
  readonly holderReference: string;
  readonly quantity: number;
  readonly status: TicketReservationStatus;
  readonly expiresAt: string;
  readonly orderId: OrderId | null;
  readonly paymentId: PaymentId | null;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
  readonly expiredAt: string | null;
  readonly cancelledAt: string | null;
  readonly updatedAt: string;
}

export interface TicketInventoryAvailability {
  readonly inventoryId: TicketInventoryId;
  readonly capacity: number;
  readonly committedQuantity: number;
  readonly remainingQuantity: number;
  readonly sellable: boolean;
  readonly observedAt: string;
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

function normalizePrefixedId(
  value: unknown,
  prefix: string,
  maxLength = 120,
): string {
  const normalized = normalizeString(value, maxLength);
  if (!normalized.startsWith(prefix)) return "";
  const body = normalized.slice(prefix.length);
  if (body.length < 8 || !ID_BODY.test(body)) return "";
  return normalized;
}

function normalizePositiveInteger(
  value: unknown,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximum
    ? value
    : null;
}

function normalizedTimestamp(value: unknown): string | null {
  const timestamp = normalizeFinancialTimestamp(value);
  return timestamp ? new Date(timestamp).toISOString() : null;
}

function normalizePositiveMoney(value: unknown): Money | null {
  const input = value as Partial<Money> | null | undefined;
  const amount = createMoney(input?.minorUnits, input?.currency);
  return amount && amount.minorUnits > 0 ? amount : null;
}

function normalizePricingVersion(value: unknown): string | null {
  const normalized = normalizeString(value, 80);
  return PRICING_VERSION.test(normalized) ? normalized : null;
}

export function normalizeTicketInventoryId(
  value: unknown,
): TicketInventoryId | null {
  const normalized = normalizePrefixedId(value, "tin_");
  return normalized ? (normalized as TicketInventoryId) : null;
}

export function normalizeTicketReservationId(
  value: unknown,
): TicketReservationId | null {
  const normalized = normalizePrefixedId(value, "trv_");
  return normalized ? (normalized as TicketReservationId) : null;
}

export function createTicketReservationRequestKey(
  inventoryIdInput: unknown,
  referenceInput: unknown,
): TicketReservationRequestKey | null {
  const inventoryId = normalizeTicketInventoryId(inventoryIdInput);
  const reference = normalizeString(referenceInput, 120);
  if (!inventoryId || !REQUEST_REFERENCE.test(reference)) return null;
  return `ticketing:${inventoryId}:${reference}` as TicketReservationRequestKey;
}

export function normalizeTicketReservationRequestKey(
  value: unknown,
): TicketReservationRequestKey | null {
  const normalized = normalizeString(value, 260);
  const match = /^ticketing:(tin_[A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/u.exec(
    normalized,
  );
  if (!match) return null;
  const inventoryId = normalizeTicketInventoryId(match[1]);
  if (!inventoryId || !REQUEST_REFERENCE.test(match[2] ?? "")) return null;
  return normalized as TicketReservationRequestKey;
}

export function reservationRequestKeyMatchesInventory(
  requestKeyInput: unknown,
  inventoryIdInput: unknown,
): boolean {
  const requestKey = normalizeTicketReservationRequestKey(requestKeyInput);
  const inventoryId = normalizeTicketInventoryId(inventoryIdInput);
  return Boolean(
    requestKey &&
    inventoryId &&
    requestKey.startsWith(`ticketing:${inventoryId}:`),
  );
}

export function createTicketInventoryOffer(input: {
  readonly id: unknown;
  readonly destinationId: unknown;
  readonly product: unknown;
  readonly label: unknown;
  readonly unitAmount: unknown;
  readonly pricingVersion: unknown;
  readonly capacity: unknown;
  readonly maxPerReservation: unknown;
  readonly salesStartAt: unknown;
  readonly salesEndAt: unknown;
  readonly startsAt: unknown;
  readonly endsAt: unknown;
  readonly enabled?: unknown;
  readonly createdAt: unknown;
  readonly updatedAt?: unknown;
}): TicketInventoryOffer | null {
  const id = normalizeTicketInventoryId(input.id);
  const destinationId = normalizeString(input.destinationId, 120);
  const product = normalizeTicketProductReference(input.product);
  const label = normalizeString(input.label, 160);
  const unitAmount = normalizePositiveMoney(input.unitAmount);
  const pricingVersion = normalizePricingVersion(input.pricingVersion);
  const capacity = normalizePositiveInteger(input.capacity, 100_000);
  const maxPerReservation = normalizePositiveInteger(
    input.maxPerReservation,
    20,
  );
  const salesStartAt = normalizedTimestamp(input.salesStartAt);
  const salesEndAt = normalizedTimestamp(input.salesEndAt);
  const startsAt = normalizedTimestamp(input.startsAt);
  const endsAt = normalizedTimestamp(input.endsAt);
  const createdAt = normalizedTimestamp(input.createdAt);
  const updatedAt = normalizedTimestamp(input.updatedAt ?? input.createdAt);
  const enabled = input.enabled === undefined ? true : input.enabled === true;

  if (
    !id ||
    !DESTINATION_REFERENCE.test(destinationId) ||
    !product ||
    label.length < 2 ||
    !unitAmount ||
    !pricingVersion ||
    !capacity ||
    !maxPerReservation ||
    maxPerReservation > capacity ||
    !salesStartAt ||
    !salesEndAt ||
    !startsAt ||
    !endsAt ||
    !createdAt ||
    !updatedAt ||
    Date.parse(salesStartAt) >= Date.parse(salesEndAt) ||
    Date.parse(salesEndAt) > Date.parse(startsAt) ||
    Date.parse(startsAt) >= Date.parse(endsAt) ||
    Date.parse(updatedAt) < Date.parse(createdAt) ||
    (input.enabled !== undefined && typeof input.enabled !== "boolean")
  ) {
    return null;
  }

  return Object.freeze({
    id,
    destinationId,
    product,
    label,
    unitAmount,
    pricingVersion,
    capacity,
    maxPerReservation,
    salesStartAt,
    salesEndAt,
    startsAt,
    endsAt,
    enabled,
    createdAt,
    updatedAt,
  });
}

export function createTicketReservation(input: {
  readonly id: unknown;
  readonly requestKey: unknown;
  readonly inventoryId: unknown;
  readonly destinationId: unknown;
  readonly product: unknown;
  readonly unitAmount: unknown;
  readonly pricingVersion: unknown;
  readonly holderReference: unknown;
  readonly quantity: unknown;
  readonly status?: unknown;
  readonly expiresAt: unknown;
  readonly orderId?: unknown;
  readonly paymentId?: unknown;
  readonly createdAt: unknown;
  readonly confirmedAt?: unknown;
  readonly expiredAt?: unknown;
  readonly cancelledAt?: unknown;
  readonly updatedAt?: unknown;
}): TicketReservation | null {
  const id = normalizeTicketReservationId(input.id);
  const requestKey = normalizeTicketReservationRequestKey(input.requestKey);
  const inventoryId = normalizeTicketInventoryId(input.inventoryId);
  const destinationId = normalizeString(input.destinationId, 120);
  const product = normalizeTicketProductReference(input.product);
  const unitAmount = normalizePositiveMoney(input.unitAmount);
  const pricingVersion = normalizePricingVersion(input.pricingVersion);
  const holderReference = normalizeString(input.holderReference, 120);
  const quantity = normalizePositiveInteger(input.quantity, 20);
  const status =
    typeof input.status === "string" &&
    ticketReservationStatuses.includes(input.status as TicketReservationStatus)
      ? (input.status as TicketReservationStatus)
      : "held";
  const expiresAt = normalizedTimestamp(input.expiresAt);
  const orderId =
    input.orderId === null || input.orderId === undefined
      ? null
      : normalizeOrderId(input.orderId);
  const paymentId =
    input.paymentId === null || input.paymentId === undefined
      ? null
      : normalizePaymentId(input.paymentId);
  const createdAt = normalizedTimestamp(input.createdAt);
  const confirmedAt =
    input.confirmedAt === null || input.confirmedAt === undefined
      ? null
      : normalizedTimestamp(input.confirmedAt);
  const expiredAt =
    input.expiredAt === null || input.expiredAt === undefined
      ? null
      : normalizedTimestamp(input.expiredAt);
  const cancelledAt =
    input.cancelledAt === null || input.cancelledAt === undefined
      ? null
      : normalizedTimestamp(input.cancelledAt);
  const updatedAt = normalizedTimestamp(input.updatedAt ?? input.createdAt);

  if (
    !id ||
    !requestKey ||
    !inventoryId ||
    !reservationRequestKeyMatchesInventory(requestKey, inventoryId) ||
    !DESTINATION_REFERENCE.test(destinationId) ||
    !product ||
    !unitAmount ||
    !pricingVersion ||
    !holderReference ||
    !ID_BODY.test(holderReference) ||
    !quantity ||
    !expiresAt ||
    !createdAt ||
    !updatedAt ||
    Date.parse(expiresAt) <= Date.parse(createdAt) ||
    Date.parse(updatedAt) < Date.parse(createdAt) ||
    (input.orderId !== null && input.orderId !== undefined && !orderId) ||
    (input.paymentId !== null && input.paymentId !== undefined && !paymentId) ||
    (status === "held" &&
      (orderId !== null ||
        paymentId !== null ||
        confirmedAt !== null ||
        expiredAt !== null ||
        cancelledAt !== null)) ||
    (status === "confirmed" &&
      (!orderId ||
        !paymentId ||
        !confirmedAt ||
        expiredAt !== null ||
        cancelledAt !== null ||
        Date.parse(confirmedAt) > Date.parse(expiresAt))) ||
    (status === "expired" &&
      (!expiredAt ||
        orderId !== null ||
        paymentId !== null ||
        confirmedAt !== null ||
        cancelledAt !== null)) ||
    (status === "cancelled" &&
      (!cancelledAt ||
        orderId !== null ||
        paymentId !== null ||
        confirmedAt !== null ||
        expiredAt !== null))
  ) {
    return null;
  }

  return Object.freeze({
    id,
    requestKey,
    inventoryId,
    destinationId,
    product,
    unitAmount,
    pricingVersion,
    holderReference,
    quantity,
    status,
    expiresAt,
    orderId,
    paymentId,
    createdAt,
    confirmedAt,
    expiredAt,
    cancelledAt,
    updatedAt,
  });
}

export function isTicketInventorySellable(
  inventory: TicketInventoryOffer,
  observedAtInput: unknown,
): boolean {
  const observedAt = normalizedTimestamp(observedAtInput);
  if (!observedAt || !inventory.enabled) return false;
  const observed = Date.parse(observedAt);
  return (
    observed >= Date.parse(inventory.salesStartAt) &&
    observed < Date.parse(inventory.salesEndAt)
  );
}

export function isTicketReservationExpired(
  reservation: TicketReservation,
  observedAtInput: unknown,
): boolean {
  const observedAt = normalizedTimestamp(observedAtInput);
  return Boolean(
    observedAt &&
    reservation.status === "held" &&
    Date.parse(observedAt) >= Date.parse(reservation.expiresAt),
  );
}

export function createTicketInventoryAvailability(input: {
  readonly inventory: TicketInventoryOffer;
  readonly committedQuantity: unknown;
  readonly observedAt: unknown;
}): TicketInventoryAvailability | null {
  const committedQuantity =
    typeof input.committedQuantity === "number" &&
    Number.isSafeInteger(input.committedQuantity) &&
    input.committedQuantity >= 0 &&
    input.committedQuantity <= input.inventory.capacity
      ? input.committedQuantity
      : null;
  const observedAt = normalizedTimestamp(input.observedAt);
  if (committedQuantity === null || !observedAt) return null;
  return Object.freeze({
    inventoryId: input.inventory.id,
    capacity: input.inventory.capacity,
    committedQuantity,
    remainingQuantity: input.inventory.capacity - committedQuantity,
    sellable: isTicketInventorySellable(input.inventory, observedAt),
    observedAt,
  });
}

export function confirmTicketReservation(
  reservation: TicketReservation,
  input: {
    readonly orderId: unknown;
    readonly paymentId: unknown;
    readonly confirmedAt: unknown;
  },
): TicketReservation {
  if (reservation.status !== "held") {
    throw new Error(`TICKETING_RESERVATION_NOT_HELD:${reservation.status}`);
  }
  const orderId = normalizeOrderId(input.orderId);
  const paymentId = normalizePaymentId(input.paymentId);
  const confirmedAt = normalizedTimestamp(input.confirmedAt);
  if (!orderId || !paymentId || !confirmedAt) {
    throw new Error("TICKETING_RESERVATION_CONFIRMATION_INVALID");
  }
  if (Date.parse(confirmedAt) > Date.parse(reservation.expiresAt)) {
    throw new Error("TICKETING_RESERVATION_HOLD_EXPIRED");
  }
  const value = createTicketReservation({
    ...reservation,
    status: "confirmed",
    orderId,
    paymentId,
    confirmedAt,
    updatedAt: confirmedAt,
  });
  if (!value) throw new Error("TICKETING_RESERVATION_CONFIRMATION_INVALID");
  return value;
}

export function expireTicketReservation(
  reservation: TicketReservation,
  expiredAtInput: unknown,
): TicketReservation {
  const expiredAt = normalizedTimestamp(expiredAtInput);
  if (!expiredAt || reservation.status !== "held") {
    throw new Error("TICKETING_RESERVATION_EXPIRY_INVALID");
  }
  if (Date.parse(expiredAt) < Date.parse(reservation.expiresAt)) {
    throw new Error("TICKETING_RESERVATION_NOT_EXPIRED");
  }
  const value = createTicketReservation({
    ...reservation,
    status: "expired",
    expiredAt,
    updatedAt: expiredAt,
  });
  if (!value) throw new Error("TICKETING_RESERVATION_EXPIRY_INVALID");
  return value;
}

export function cancelTicketReservation(
  reservation: TicketReservation,
  cancelledAtInput: unknown,
): TicketReservation {
  const cancelledAt = normalizedTimestamp(cancelledAtInput);
  if (!cancelledAt || reservation.status !== "held") {
    throw new Error("TICKETING_RESERVATION_CANCELLATION_INVALID");
  }
  const value = createTicketReservation({
    ...reservation,
    status: "cancelled",
    cancelledAt,
    updatedAt: cancelledAt,
  });
  if (!value) throw new Error("TICKETING_RESERVATION_CANCELLATION_INVALID");
  return value;
}
