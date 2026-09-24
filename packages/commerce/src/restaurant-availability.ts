import {
  normalizeRestaurantDepositPolicy,
  type RestaurantDepositPolicy,
} from "./restaurant-reservations.js";

export interface RestaurantReservationSlot {
  readonly id: string;
  readonly businessId: string;
  readonly placeId: string;
  readonly destinationId: string;
  readonly serviceDate: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly seatingArea: string | null;
  readonly capacity: number;
  readonly minPartySize: number;
  readonly maxPartySize: number;
  readonly minimumLeadMinutes: number;
  readonly maximumAdvanceDays: number;
  readonly holdDurationSeconds: number;
  readonly depositPolicy: RestaurantDepositPolicy;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RestaurantSlotAvailability {
  readonly slotId: string;
  readonly capacity: number;
  readonly committedGuests: number;
  readonly remainingGuests: number;
  readonly minPartySize: number;
  readonly maxPartySize: number;
  readonly sellable: boolean;
  readonly observedAt: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;
const SLOT_ID = /^rsl_[A-Za-z0-9_-]{8,116}$/u;

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function identifier(value: unknown): string | null {
  const normalized = bounded(value, 120);
  return normalized && ID.test(normalized) ? normalized : null;
}

function instant(value: unknown): string | null {
  const normalized = bounded(value, 40);
  if (!normalized) return null;
  const epoch = Date.parse(normalized);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

function date(value: unknown): string | null {
  const normalized = bounded(value, 10);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return null;
  const epoch = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(epoch) &&
    new Date(epoch).toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

export function createRestaurantReservationSlot(input: {
  readonly id: unknown;
  readonly businessId: unknown;
  readonly placeId: unknown;
  readonly destinationId: unknown;
  readonly serviceDate: unknown;
  readonly startsAt: unknown;
  readonly endsAt: unknown;
  readonly seatingArea?: unknown;
  readonly capacity: unknown;
  readonly minPartySize: unknown;
  readonly maxPartySize: unknown;
  readonly minimumLeadMinutes: unknown;
  readonly maximumAdvanceDays: unknown;
  readonly holdDurationSeconds: unknown;
  readonly depositPolicy: unknown;
  readonly enabled?: unknown;
  readonly createdAt: unknown;
  readonly updatedAt?: unknown;
}): RestaurantReservationSlot | null {
  const slotId = bounded(input.id, 120);
  const businessId = identifier(input.businessId);
  const placeId = identifier(input.placeId);
  const destinationId = identifier(input.destinationId);
  const serviceDate = date(input.serviceDate);
  const startsAt = instant(input.startsAt);
  const endsAt = instant(input.endsAt);
  const seatingArea =
    input.seatingArea === undefined || input.seatingArea === null
      ? null
      : bounded(input.seatingArea, 80);
  const capacity = integer(input.capacity, 1, 500);
  const minPartySize = integer(input.minPartySize, 1, 30);
  const maxPartySize = integer(input.maxPartySize, 1, 30);
  const minimumLeadMinutes = integer(input.minimumLeadMinutes, 0, 43_200);
  const maximumAdvanceDays = integer(input.maximumAdvanceDays, 0, 730);
  const holdDurationSeconds = integer(input.holdDurationSeconds, 60, 3_600);
  const depositPolicy = normalizeRestaurantDepositPolicy(input.depositPolicy);
  const createdAt = instant(input.createdAt);
  const updatedAt = instant(input.updatedAt ?? input.createdAt);
  if (
    !slotId ||
    !SLOT_ID.test(slotId) ||
    !businessId ||
    !placeId ||
    !destinationId ||
    !serviceDate ||
    !startsAt ||
    !endsAt ||
    startsAt.slice(0, 10) !== serviceDate ||
    Date.parse(startsAt) >= Date.parse(endsAt) ||
    (input.seatingArea !== undefined &&
      input.seatingArea !== null &&
      !seatingArea) ||
    capacity === null ||
    minPartySize === null ||
    maxPartySize === null ||
    minPartySize > maxPartySize ||
    maxPartySize > capacity ||
    minimumLeadMinutes === null ||
    maximumAdvanceDays === null ||
    holdDurationSeconds === null ||
    !depositPolicy ||
    !createdAt ||
    !updatedAt ||
    Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    return null;
  }
  return Object.freeze({
    id: slotId,
    businessId,
    placeId,
    destinationId,
    serviceDate,
    startsAt,
    endsAt,
    seatingArea,
    capacity,
    minPartySize,
    maxPartySize,
    minimumLeadMinutes,
    maximumAdvanceDays,
    holdDurationSeconds,
    depositPolicy,
    enabled: input.enabled === undefined ? true : input.enabled === true,
    createdAt,
    updatedAt,
  });
}

export function isRestaurantSlotBookable(
  slot: RestaurantReservationSlot,
  observedAtInput: unknown,
): boolean {
  const observedAt = instant(observedAtInput);
  if (!observedAt || !slot.enabled) return false;
  const now = Date.parse(observedAt);
  const start = Date.parse(slot.startsAt);
  const minimumLead = slot.minimumLeadMinutes * 60_000;
  const maximumAdvance = slot.maximumAdvanceDays * 86_400_000;
  return now + minimumLead <= start && start - now <= maximumAdvance;
}

export function createRestaurantSlotAvailability(input: {
  readonly slot: RestaurantReservationSlot;
  readonly committedGuests: unknown;
  readonly observedAt: unknown;
}): RestaurantSlotAvailability | null {
  const committedGuests = integer(
    input.committedGuests,
    0,
    input.slot.capacity,
  );
  const observedAt = instant(input.observedAt);
  if (committedGuests === null || !observedAt) return null;
  const remainingGuests = input.slot.capacity - committedGuests;
  return Object.freeze({
    slotId: input.slot.id,
    capacity: input.slot.capacity,
    committedGuests,
    remainingGuests,
    minPartySize: input.slot.minPartySize,
    maxPartySize: input.slot.maxPartySize,
    sellable:
      isRestaurantSlotBookable(input.slot, observedAt) &&
      remainingGuests >= input.slot.minPartySize,
    observedAt,
  });
}
