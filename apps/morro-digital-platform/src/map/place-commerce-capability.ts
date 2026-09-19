import type { AssistantLocale } from "@touristic/assistant";
import {
  normalizeSearchText,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

import { getV1ExploreLabel } from "./explore-v1-i18n.js";

export type PlaceCommerceState =
  | "sellable"
  | "multiple"
  | "sold_out"
  | "upcoming"
  | "fallback";

export interface PlacePrimaryAction {
  readonly label: string;
  readonly value: string;
  readonly presentation: "primary";
  readonly disabled?: boolean;
  readonly commerceState: PlaceCommerceState;
}

interface PublicInventoryOffer {
  readonly id: string;
  readonly destinationId: string;
  readonly product: Readonly<{
    kind: string;
    reference: string;
  }>;
  readonly label: string;
  readonly unitAmount: Readonly<{
    minorUnits: number;
    currency: string;
  }>;
  readonly salesStartAt: string;
  readonly salesEndAt: string;
  readonly startsAt: string;
  readonly availableQuantity: number;
}

const COMMERCE_CATEGORIES = new Set(["tours", "nightlife", "transport"]);
const OFFER_ID = /^[A-Za-z0-9_-]{3,120}$/u;

const localeTag: Readonly<Record<AssistantLocale, string>> = Object.freeze({
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  he: "he-IL",
});

function slug(value: string): string {
  return normalizeSearchText(value).replace(/\s+/gu, "-");
}

function fallbackPrimaryAction(
  category: string,
  locale: AssistantLocale,
): PlacePrimaryAction | null {
  if (category === "tours") {
    return Object.freeze({
      label: `🎟️ ${getV1ExploreLabel("bookTour", locale)}`,
      value: "reservar passeio",
      presentation: "primary" as const,
      commerceState: "fallback" as const,
    });
  }
  if (category === "transport") {
    return Object.freeze({
      label: `🚕 ${getV1ExploreLabel("requestTransport", locale)}`,
      value: "solicitar transporte",
      presentation: "primary" as const,
      commerceState: "fallback" as const,
    });
  }
  return null;
}

function validOffer(value: unknown): value is PublicInventoryOffer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const offer = value as Partial<PublicInventoryOffer>;
  return Boolean(
    typeof offer.id === "string" &&
      OFFER_ID.test(offer.id) &&
      typeof offer.destinationId === "string" &&
      offer.product &&
      typeof offer.product.kind === "string" &&
      typeof offer.product.reference === "string" &&
      typeof offer.label === "string" &&
      offer.unitAmount &&
      typeof offer.unitAmount.minorUnits === "number" &&
      Number.isSafeInteger(offer.unitAmount.minorUnits) &&
      offer.unitAmount.minorUnits > 0 &&
      typeof offer.unitAmount.currency === "string" &&
      typeof offer.salesStartAt === "string" &&
      typeof offer.salesEndAt === "string" &&
      typeof offer.startsAt === "string" &&
      typeof offer.availableQuantity === "number" &&
      Number.isSafeInteger(offer.availableQuantity) &&
      offer.availableQuantity >= 0,
  );
}

function categoryAcceptsKind(category: string, kind: string): boolean {
  if (category === "tours") return kind === "tour";
  if (category === "nightlife") return kind === "business_experience";
  if (category === "transport") {
    return kind === "transport" || kind === "business_experience";
  }
  return false;
}

function offerMatchesLocation(
  location: MorroV1SearchCatalogItem,
  offer: PublicInventoryOffer,
): boolean {
  if (!categoryAcceptsKind(location.category, offer.product.kind)) return false;

  const placeName = normalizeSearchText(location.name);
  const placeSlug = slug(location.name);
  const destinationSlug = slug(offer.destinationId);
  const referenceSlug = slug(offer.product.reference.replace(/[:._]+/gu, " "));
  const offerLabel = normalizeSearchText(offer.label);

  if (
    location.id &&
    (offer.destinationId === location.id ||
      offer.product.reference === location.id)
  ) {
    return true;
  }

  if (
    destinationSlug === placeSlug ||
    destinationSlug === `place-${placeSlug}` ||
    destinationSlug === `${location.category}-${placeSlug}`
  ) {
    return true;
  }

  const businessReference = /^morro-pro:([^:]+):/u.exec(
    offer.product.reference,
  )?.[1];
  if (businessReference && slug(businessReference) === placeSlug) return true;

  if (
    offerLabel === placeName ||
    offerLabel.includes(placeName) ||
    (offerLabel.length >= 8 && placeName.includes(offerLabel))
  ) {
    return true;
  }

  return referenceSlug.includes(placeSlug);
}

function money(
  offer: PublicInventoryOffer,
  locale: AssistantLocale,
): string {
  return new Intl.NumberFormat(localeTag[locale], {
    style: "currency",
    currency: offer.unitAmount.currency,
    maximumFractionDigits: 2,
  }).format(offer.unitAmount.minorUnits / 100);
}

function copy(
  category: string,
  locale: AssistantLocale,
): {
  single: (price: string) => string;
  multiple: (count: number) => string;
  soldOut: string;
  upcoming: string;
} {
  const transport = category === "transport";
  const variants = {
    pt: transport
      ? {
          single: (price: string) => `🎫 Comprar passagem · ${price}`,
          multiple: (count: number) =>
            `🎫 Ver passagens (${count} opções)`,
          soldOut: "🎫 Passagens esgotadas",
          upcoming: "🎫 Vendas em breve",
        }
      : {
          single: (price: string) => `🎟️ Comprar ingressos · ${price}`,
          multiple: (count: number) =>
            `🎟️ Ver ingressos (${count} opções)`,
          soldOut: "🎟️ Ingressos esgotados",
          upcoming: "🎟️ Vendas em breve",
        },
    en: transport
      ? {
          single: (price: string) => `🎫 Buy ticket · ${price}`,
          multiple: (count: number) => `🎫 View tickets (${count} options)`,
          soldOut: "🎫 Tickets sold out",
          upcoming: "🎫 Sales opening soon",
        }
      : {
          single: (price: string) => `🎟️ Buy tickets · ${price}`,
          multiple: (count: number) => `🎟️ View tickets (${count} options)`,
          soldOut: "🎟️ Tickets sold out",
          upcoming: "🎟️ Sales opening soon",
        },
    es: transport
      ? {
          single: (price: string) => `🎫 Comprar pasaje · ${price}`,
          multiple: (count: number) =>
            `🎫 Ver pasajes (${count} opciones)`,
          soldOut: "🎫 Pasajes agotados",
          upcoming: "🎫 Ventas próximamente",
        }
      : {
          single: (price: string) => `🎟️ Comprar entradas · ${price}`,
          multiple: (count: number) =>
            `🎟️ Ver entradas (${count} opciones)`,
          soldOut: "🎟️ Entradas agotadas",
          upcoming: "🎟️ Ventas próximamente",
        },
    he: transport
      ? {
          single: (price: string) => `🎫 רכישת כרטיס · ${price}`,
          multiple: (count: number) => `🎫 הצגת כרטיסים (${count} אפשרויות)`,
          soldOut: "🎫 הכרטיסים אזלו",
          upcoming: "🎫 המכירה תיפתח בקרוב",
        }
      : {
          single: (price: string) => `🎟️ רכישת כרטיסים · ${price}`,
          multiple: (count: number) => `🎟️ הצגת כרטיסים (${count} אפשרויות)`,
          soldOut: "🎟️ הכרטיסים אזלו",
          upcoming: "🎟️ המכירה תיפתח בקרוב",
        },
  } as const;
  return variants[locale];
}

export async function resolvePlacePrimaryAction(options: {
  readonly location: MorroV1SearchCatalogItem;
  readonly locale: AssistantLocale;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
}): Promise<PlacePrimaryAction | null> {
  const { location, locale } = options;
  if (!COMMERCE_CATEGORIES.has(location.category)) return null;

  const fallback = fallbackPrimaryAction(location.category, locale);
  if (!options.fetch) return fallback;

  let offers: readonly PublicInventoryOffer[] = [];
  try {
    const response = await options.fetch("/api/ticketing/v1/inventory", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return fallback;
    const payload = (await response.json()) as { data?: unknown };
    offers = Array.isArray(payload.data)
      ? Object.freeze(payload.data.filter(validOffer))
      : Object.freeze([]);
  } catch {
    return fallback;
  }

  const matched = offers
    .filter((offer) => offerMatchesLocation(location, offer))
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  if (matched.length === 0) return fallback;

  const now = (options.now ?? Date.now)();
  const active = matched.filter(
    (offer) =>
      Date.parse(offer.salesStartAt) <= now && now < Date.parse(offer.salesEndAt),
  );
  const sellable = active.filter((offer) => offer.availableQuantity > 0);
  const labels = copy(location.category, locale);

  if (sellable.length === 1) {
    const offer = sellable[0];
    if (!offer) return fallback;
    return Object.freeze({
      label: labels.single(money(offer, locale)),
      value: `commerce:offer:${offer.id}`,
      presentation: "primary" as const,
      commerceState: "sellable" as const,
    });
  }

  if (sellable.length > 1) {
    return Object.freeze({
      label: labels.multiple(sellable.length),
      value: `commerce:offers:${sellable.map(({ id }) => id).join(",")}`,
      presentation: "primary" as const,
      commerceState: "multiple" as const,
    });
  }

  if (active.length > 0) {
    return Object.freeze({
      label: labels.soldOut,
      value: "commerce-disabled:sold-out",
      presentation: "primary" as const,
      disabled: true,
      commerceState: "sold_out" as const,
    });
  }

  const upcoming = matched.find(
    (offer) => now < Date.parse(offer.salesStartAt),
  );
  if (upcoming) {
    return Object.freeze({
      label: labels.upcoming,
      value: "commerce-disabled:upcoming",
      presentation: "primary" as const,
      disabled: true,
      commerceState: "upcoming" as const,
    });
  }

  return fallback;
}
