export const restaurantReservationStatuses = Object.freeze([
  "held",
  "pending_confirmation",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "expired",
] as const);

export type RestaurantReservationStatus =
  (typeof restaurantReservationStatuses)[number];

export type RestaurantDepositPolicy =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "required";
      amount: Readonly<{ minorUnits: number; currency: string }>;
    }>;

export interface RestaurantReservation {
  readonly id: string;
  readonly requestKey: string;
  readonly slotId: string;
  readonly businessId: string;
  readonly placeId: string;
  readonly destinationId: string;
  readonly serviceDate: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly partySize: number;
  readonly seatingArea: string | null;
  readonly notes: string | null;
  readonly holderReference: string;
  readonly status: RestaurantReservationStatus;
  readonly depositPolicy: RestaurantDepositPolicy;
  readonly holdExpiresAt: string | null;
  readonly orderId: string | null;
  readonly paymentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;
const RESERVATION_ID = /^rrv_[A-Za-z0-9_-]{8,116}$/u;
const REQUEST_KEY = /^rrq_[A-Za-z0-9_-]{8,156}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function id(value: unknown): string | null {
  const normalized = text(value, 120);
  return normalized && ID.test(normalized) ? normalized : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value, 40);
  if (!normalized) return null;
  const epoch = Date.parse(normalized);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

function serviceDate(value: unknown): string | null {
  const normalized = text(value, 10);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return null;
  const epoch = Date.parse(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(epoch)) return null;
  return new Date(epoch).toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

export function normalizeRestaurantReservationRequestKey(
  value: unknown,
): string | null {
  const normalized = text(value, 160);
  return normalized && REQUEST_KEY.test(normalized) ? normalized : null;
}

export function createRestaurantReservationRequestKey(
  slotIdInput: unknown,
  attemptInput: unknown,
): string | null {
  const slotId = id(slotIdInput);
  const attempt = text(attemptInput, 80);
  if (!slotId || !attempt) return null;
  const compactAttempt = attempt.replace(/[^A-Za-z0-9_-]/gu, "_");
  return normalizeRestaurantReservationRequestKey(
    `rrq_${slotId}_${compactAttempt}`.slice(0, 160),
  );
}

export function normalizeRestaurantDepositPolicy(
  value: unknown,
): RestaurantDepositPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.kind === "none") return Object.freeze({ kind: "none" as const });
  if (input.kind !== "required") return null;
  const amount =
    input.amount && typeof input.amount === "object" && !Array.isArray(input.amount)
      ? (input.amount as Record<string, unknown>)
      : null;
  const minorUnits = amount?.minorUnits;
  const currency = typeof amount?.currency === "string"
    ? amount.currency.trim().toUpperCase()
    : "";
  if (
    typeof minorUnits !== "number" ||
    !Number.isSafeInteger(minorUnits) ||
    minorUnits <= 0 ||
    minorUnits > Number.MAX_SAFE_INTEGER ||
    !CURRENCY.test(currency)
  ) {
    return null;
  }
  return Object.freeze({
    kind: "required" as const,
    amount: Object.freeze({ minorUnits, currency }),
  });
}

export function createRestaurantReservation(input: {
  readonly id: unknown;
  readonly requestKey: unknown;
  readonly slotId: unknown;
  readonly businessId: unknown;
  readonly placeId: unknown;
  readonly destinationId: unknown;
  readonly serviceDate: unknown;
  readonly startsAt: unknown;
  readonly endsAt: unknown;
  readonly partySize: unknown;
  readonly seatingArea?: unknown;
  readonly notes?: unknown;
  readonly holderReference: unknown;
  readonly status: unknown;
  readonly depositPolicy: unknown;
  readonly holdExpiresAt?: unknown;
  readonly orderId?: unknown;
  readonly paymentId?: unknown;
  readonly createdAt: unknown;
  readonly updatedAt?: unknown;
}): RestaurantReservation | null {
  const reservationId = text(input.id, 120);
  const requestKey = normalizeRestaurantReservationRequestKey(input.requestKey);
  const slotId = id(input.slotId);
  const businessId = id(input.businessId);
  const placeId = id(input.placeId);
  const destinationId = id(input.destinationId);
  const date = serviceDate(input.serviceDate);
  const startsAt = timestamp(input.startsAt);
  const endsAt = timestamp(input.endsAt);
  const holderReference = id(input.holderReference);
  const status =
    typeof input.status === "string" &&
    restaurantReservationStatuses.includes(
      input.status as RestaurantReservationStatus,
    )
      ? (input.status as RestaurantReservationStatus)
      : null;
  const depositPolicy = normalizeRestaurantDepositPolicy(input.depositPolicy);
  const createdAt = timestamp(input.createdAt);
  const updatedAt = timestamp(input.updatedAt ?? input.createdAt);
  const holdExpiresAt =
    input.holdExpiresAt === null || input.holdExpiresAt === undefined
      ? null
      : timestamp(input.holdExpiresAt);
  const orderId =
    input.orderId === null || input.orderId === undefined
      ? null
      : id(input.orderId);
  const paymentId =
    input.paymentId === null || input.paymentId === undefined
      ? null
      : id(input.paymentId);
  const seatingArea =
    input.seatingArea === null || input.seatingArea === undefined
      ? null
      : text(input.seatingArea, 80);
  const notes =
    input.notes === null || input.notes === undefined
      ? null
      : text(input.notes, 500);

  if (
    !reservationId ||
    !RESERVATION_ID.test(reservationId) ||
    !requestKey ||
    !slotId ||
    !businessId ||
    !placeId ||
    !destinationId ||
    !date ||
    !startsAt ||
    !endsAt ||
    Date.parse(startsAt) >= Date.parse(endsAt) ||
    startsAt.slice(0, 10) !== date ||
    typeof input.partySize !== "number" ||
    !Number.isSafeInteger(input.partySize) ||
    input.partySize < 1 ||
    input.partySize > 30 ||
    !holderReference ||
    !status ||
    !depositPolicy ||
    !createdAt ||
    !updatedAt ||
    Date.parse(updatedAt) < Date.parse(createdAt) ||
    (input.seatingArea !== null &&
      input.seatingArea !== undefined &&
      !seatingArea) ||
    (input.notes !== null && input.notes !== undefined && !notes) ||
    (input.orderId !== null && input.orderId !== undefined && !orderId) ||
    (input.paymentId !== null && input.paymentId !== undefined && !paymentId)
  ) {
    return null;
  }

  const requiresHold = status === "held" || status === "pending_confirmation";
  if (
    (requiresHold && !holdExpiresAt) ||
    (holdExpiresAt !== null &&
      Date.parse(holdExpiresAt) <= Date.parse(createdAt)) ||
    (holdExpiresAt !== null &&
      Date.parse(holdExpiresAt) >= Date.parse(startsAt)) ||
    (depositPolicy.kind === "required" &&
      status === "pending_confirmation") ||
    (depositPolicy.kind === "required" &&
      (status === "confirmed" ||
        status === "completed" ||
        status === "no_show") &&
      (!orderId || !paymentId)) ||
    (depositPolicy.kind === "required" &&
      (status === "held" || status === "expired") &&
      (orderId !== null || paymentId !== null)) ||
    (depositPolicy.kind === "required" &&
      status === "cancelled" &&
      ((orderId === null) !== (paymentId === null))) ||
    (depositPolicy.kind === "none" && (orderId !== null || paymentId !== null))
  ) {
    return null;
  }

  return Object.freeze({
    id: reservationId,
    requestKey,
    slotId,
    businessId,
    placeId,
    destinationId,
    serviceDate: date,
    startsAt,
    endsAt,
    partySize: input.partySize,
    seatingArea,
    notes,
    holderReference,
    status,
    depositPolicy,
    holdExpiresAt,
    orderId,
    paymentId,
    createdAt,
    updatedAt,
  });
}

export function isRestaurantReservationTransitionAllowed(
  from: RestaurantReservationStatus,
  to: RestaurantReservationStatus,
): boolean {
  if (from === to) return true;
  if (from === "held") {
    return (
      to === "pending_confirmation" ||
      to === "confirmed" ||
      to === "cancelled" ||
      to === "expired"
    );
  }
  if (from === "pending_confirmation") {
    return to === "confirmed" || to === "cancelled" || to === "expired";
  }
  if (from === "confirmed") {
    return to === "cancelled" || to === "completed" || to === "no_show";
  }
  return false;
}

export function assertRestaurantReservationTransition(
  from: RestaurantReservationStatus,
  to: RestaurantReservationStatus,
): void {
  if (!isRestaurantReservationTransitionAllowed(from, to)) {
    throw new Error(
      `COMMERCE_RESTAURANT_INVALID_TRANSITION:${from}:${to}`,
    );
  }
}
