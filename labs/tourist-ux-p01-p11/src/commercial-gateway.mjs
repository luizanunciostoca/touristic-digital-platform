/** P04: capability gates for owner-controlled TEST commerce; NEVER initiate a payment. */
import { OWNER_CAPABILITIES } from "./authority.mjs";
const LABELS = Object.freeze({
  ticketed_admission: "Comprar ingresso",
  activity_reservation: "Reservar passeio",
  table_reservation: "Reservar mesa",
  transport_ticket: "Comprar passagem",
});
export function prepareCommercialCta({
  mode,
  owner = null,
  capability = null,
  quote = null,
  environment = "isolated",
  paymentMode = "TEST",
  now = Date.now(),
} = {}) {
  if (!(mode in LABELS))
    return Object.freeze({
      visible: false,
      enabled: false,
      reason: "UNSUPPORTED_MODE",
    });
  const ownerName = OWNER_CAPABILITIES[mode];
  const base = {
    mode,
    label: LABELS[mode],
    owner: ownerName,
    visible: true,
    enabled: false,
    action: "prepare-only",
  };
  if (environment !== "isolated" || paymentMode !== "TEST")
    return Object.freeze({ ...base, reason: "PRODUCTION_OR_MONEY_FORBIDDEN" });
  if (owner?.name !== ownerName || owner?.verified !== true)
    return Object.freeze({ ...base, reason: "OWNER_NOT_VERIFIED" });
  if (capability?.enabled !== true || capability?.owner !== ownerName)
    return Object.freeze({ ...base, reason: "CAPABILITY_NOT_VERIFIED" });
  if (
    quote?.owner !== ownerName ||
    typeof quote?.expiresAt !== "number" ||
    quote.expiresAt <= now
  )
    return Object.freeze({ ...base, reason: "FRESH_OWNER_QUOTE_REQUIRED" });
  if (
    typeof quote?.amountMinor !== "number" ||
    !Number.isSafeInteger(quote.amountMinor) ||
    quote.amountMinor < 0 ||
    !quote.currency
  )
    return Object.freeze({ ...base, reason: "OWNER_PRICE_INVALID" });
  return Object.freeze({
    ...base,
    enabled: true,
    reason: null,
    quoteSummary: Object.freeze({
      currency: quote.currency,
      amountMinor: quote.amountMinor,
      expiresAt: quote.expiresAt,
    }),
    requiresServerReadback: true,
    canCheckout: false,
  });
}
export function processCheckoutIntent() {
  throw new Error("CHECKOUT_FORBIDDEN_IN_ISOLATED_LAB");
}
