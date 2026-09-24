export const ticketedAdmissionSubtypes = Object.freeze([
  "sunset",
  "event",
  "party",
] as const);

export type TicketedAdmissionSubtype =
  (typeof ticketedAdmissionSubtypes)[number];

export interface TicketedAdmissionProfile {
  readonly offeringId: string;
  readonly placeId: string;
  readonly subtype: TicketedAdmissionSubtype;
  readonly ticketType: string;
  readonly tierLabel: string | null;
  readonly displayOrder: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;
const LABEL = /^[^\u0000-\u001f\u007f]{1,80}$/u;

function normalized(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const result = value.trim();
  return result && result.length <= max ? result : "";
}

export function normalizeTicketedAdmissionProfile(
  value: unknown,
): TicketedAdmissionProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const offeringId = normalized(input.offeringId, 120);
  const placeId = normalized(input.placeId, 120);
  const subtype = ticketedAdmissionSubtypes.includes(
    input.subtype as TicketedAdmissionSubtype,
  )
    ? (input.subtype as TicketedAdmissionSubtype)
    : null;
  const ticketType = normalized(input.ticketType, 80);
  const tierLabel =
    input.tierLabel === null || input.tierLabel === undefined
      ? null
      : normalized(input.tierLabel, 80);
  const displayOrder =
    typeof input.displayOrder === "number" &&
    Number.isSafeInteger(input.displayOrder) &&
    input.displayOrder >= 0 &&
    input.displayOrder <= 999
      ? input.displayOrder
      : null;
  if (
    !ID.test(offeringId) ||
    !ID.test(placeId) ||
    !subtype ||
    !LABEL.test(ticketType) ||
    (tierLabel !== null && !LABEL.test(tierLabel)) ||
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
