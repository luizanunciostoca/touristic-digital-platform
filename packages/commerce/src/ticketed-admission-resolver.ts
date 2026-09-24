import {
  adaptLegacyTicketingInventoryOffer,
  type CommerceOffering,
  type TicketedAdmissionContext,
} from "./index.js";

export interface TicketedAdmissionInventoryRow {
  readonly id: unknown;
  readonly destinationId: unknown;
  readonly product: unknown;
  readonly label: unknown;
  readonly admission?: unknown;
  readonly unitAmount?: unknown;
  readonly pricingVersion?: unknown;
  readonly maxPerReservation?: unknown;
  readonly salesStartAt?: unknown;
  readonly salesEndAt?: unknown;
  readonly startsAt?: unknown;
  readonly endsAt?: unknown;
  readonly availableQuantity?: unknown;
  readonly sellable?: unknown;
  readonly observedAt?: unknown;
}

export interface TicketedAdmissionVariant {
  readonly inventoryId: string;
  readonly ticketType: string;
  readonly tierLabel: string | null;
  readonly displayOrder: number;
  readonly label: string;
  readonly unitAmount: Readonly<{
    minorUnits: number;
    currency: string;
  }>;
  readonly pricingVersion: string;
  readonly maxPerReservation: number;
  readonly salesStartAt: string;
  readonly salesEndAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly availableQuantity: number;
  readonly sellable: boolean;
  readonly observedAt: string;
}

export interface TicketedAdmissionOffering {
  readonly offering: CommerceOffering;
  readonly subtype: TicketedAdmissionContext;
  readonly variants: readonly TicketedAdmissionVariant[];
}

const CURRENCY = /^[A-Z]{3}$/u;
const PRICING_VERSION = /^[A-Za-z0-9._:-]{1,80}$/u;

function string(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : "";
}

function timestamp(value: unknown): string | null {
  const normalized = string(value, 80);
  if (!normalized) return null;
  const epoch = Date.parse(normalized);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

function money(value: unknown): Readonly<{
  minorUnits: number;
  currency: string;
}> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const minorUnits = input.minorUnits;
  const currency = string(input.currency, 3).toUpperCase();
  if (
    typeof minorUnits !== "number" ||
    !Number.isSafeInteger(minorUnits) ||
    minorUnits <= 0 ||
    !CURRENCY.test(currency)
  ) {
    return null;
  }
  return Object.freeze({ minorUnits, currency });
}

function admission(value: unknown): Readonly<{
  offeringId: string;
  placeId: string;
  subtype: TicketedAdmissionContext;
  ticketType: string;
  tierLabel: string | null;
  displayOrder: number;
}> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const offeringId = string(input.offeringId, 120);
  const placeId = string(input.placeId, 120);
  const subtype =
    input.subtype === "sunset" ||
    input.subtype === "event" ||
    input.subtype === "party"
      ? input.subtype
      : null;
  const ticketType = string(input.ticketType, 80);
  const tierLabel =
    input.tierLabel === null || input.tierLabel === undefined
      ? null
      : string(input.tierLabel, 80);
  const displayOrder =
    typeof input.displayOrder === "number" &&
    Number.isSafeInteger(input.displayOrder) &&
    input.displayOrder >= 0 &&
    input.displayOrder <= 999
      ? input.displayOrder
      : null;
  if (
    !offeringId ||
    !placeId ||
    !subtype ||
    !ticketType ||
    tierLabel === "" ||
    displayOrder === null
  ) {
    return null;
  }
  return Object.freeze({
    offeringId,
    placeId,
    subtype,
    ticketType,
    tierLabel,
    displayOrder,
  });
}

function variant(
  row: TicketedAdmissionInventoryRow,
): TicketedAdmissionVariant | null {
  const profile = admission(row.admission);
  const resolved = adaptLegacyTicketingInventoryOffer(row);
  const unitAmount = money(row.unitAmount);
  const pricingVersion = string(row.pricingVersion, 80);
  const maxPerReservation = row.maxPerReservation;
  const availableQuantity = row.availableQuantity;
  const salesStartAt = timestamp(row.salesStartAt);
  const salesEndAt = timestamp(row.salesEndAt);
  const startsAt = timestamp(row.startsAt);
  const endsAt = timestamp(row.endsAt);
  const observedAt = timestamp(row.observedAt);
  if (
    !profile ||
    !resolved ||
    resolved.offering.commerceMode !== "ticketed_admission" ||
    !unitAmount ||
    !PRICING_VERSION.test(pricingVersion) ||
    typeof maxPerReservation !== "number" ||
    !Number.isSafeInteger(maxPerReservation) ||
    maxPerReservation < 1 ||
    maxPerReservation > 20 ||
    typeof availableQuantity !== "number" ||
    !Number.isSafeInteger(availableQuantity) ||
    availableQuantity < 0 ||
    typeof row.sellable !== "boolean" ||
    !salesStartAt ||
    !salesEndAt ||
    !startsAt ||
    !endsAt ||
    !observedAt
  ) {
    return null;
  }
  return Object.freeze({
    inventoryId: resolved.offering.identity.inventoryId!,
    ticketType: profile.ticketType,
    tierLabel: profile.tierLabel,
    displayOrder: profile.displayOrder,
    label: resolved.offering.presentation.title,
    unitAmount,
    pricingVersion,
    maxPerReservation,
    salesStartAt,
    salesEndAt,
    startsAt,
    endsAt,
    availableQuantity,
    sellable: row.sellable,
    observedAt,
  });
}

export function resolveTicketedAdmissionOfferings(
  rows: readonly TicketedAdmissionInventoryRow[],
): readonly TicketedAdmissionOffering[] {
  const groups = new Map<
    string,
    {
      offering: CommerceOffering;
      subtype: TicketedAdmissionContext;
      variants: TicketedAdmissionVariant[];
    }
  >();

  for (const row of rows) {
    const profile = admission(row.admission);
    const resolved = adaptLegacyTicketingInventoryOffer(row);
    const normalizedVariant = variant(row);
    if (
      !profile ||
      !resolved ||
      !normalizedVariant ||
      resolved.offering.commerceMode !== "ticketed_admission" ||
      resolved.offering.identity.offerId !== profile.offeringId ||
      resolved.offering.identity.placeId !== profile.placeId ||
      resolved.offering.context !== profile.subtype
    ) {
      continue;
    }

    const key = [
      resolved.offering.identity.destinationId,
      profile.placeId,
      profile.offeringId,
    ].join(":");
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        offering: resolved.offering,
        subtype: profile.subtype,
        variants: [normalizedVariant],
      });
      continue;
    }

    if (
      current.subtype !== profile.subtype ||
      current.offering.identity.placeId !== profile.placeId
    ) {
      continue;
    }
    current.variants.push(normalizedVariant);
  }

  return Object.freeze(
    [...groups.values()]
      .map((group) =>
        Object.freeze({
          offering: group.offering,
          subtype: group.subtype,
          variants: Object.freeze(
            [...group.variants].sort(
              (left, right) =>
                left.displayOrder - right.displayOrder ||
                left.ticketType.localeCompare(right.ticketType, "pt-BR") ||
                (left.tierLabel ?? "").localeCompare(
                  right.tierLabel ?? "",
                  "pt-BR",
                ),
            ),
          ),
        }),
      )
      .sort((left, right) => {
        const leftStart = left.variants[0]?.startsAt ?? "";
        const rightStart = right.variants[0]?.startsAt ?? "";
        return (
          leftStart.localeCompare(rightStart) ||
          left.offering.presentation.title.localeCompare(
            right.offering.presentation.title,
            "pt-BR",
          )
        );
      }),
  );
}
