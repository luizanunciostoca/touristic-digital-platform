import type { DestinationId } from "@touristic/core";

import {
  evaluateOfferSellability,
  type Menu,
  type Offer,
  type Product,
} from "./commerce-domain.js";
import type {
  BusinessId,
  CanonicalPlaceCategory,
  CategoryId,
  Place,
  PlaceCapability,
  PlaceId,
} from "./place-domain.js";

export type PlaceActionType =
  | "directions"
  | "photos"
  | "menu"
  | "tableReservation"
  | "tickets"
  | "booking"
  | "whatsapp"
  | "call"
  | "website"
  | "products"
  | "offers"
  | "tourBooking"
  | "transportBooking"
  | "save"
  | "share"
  | "info";

export type PlaceActionLocale = "pt" | "en" | "es" | "he";
export type PlaceActionPresentation = "primary" | "secondary";
export type PlaceActionAvailability =
  "available" | "sold_out" | "upcoming" | "unavailable";

export interface PlaceActionDefinition {
  readonly id: PlaceActionType;
  readonly categoryApplicability: readonly CanonicalPlaceCategory[] | "all";
  readonly requiredCapabilities: readonly PlaceCapability[];
  readonly priority: number;
  readonly presentation: PlaceActionPresentation;
}

export interface PlaceActionInventoryFact {
  readonly offerId: string;
  readonly availableQuantity: number | null;
  readonly providerAvailable: boolean;
}

export interface PlaceActionProviderState {
  readonly tableReservationAvailable?: boolean;
  readonly bookingAvailable?: boolean;
  readonly tourBookingAvailable?: boolean;
  readonly transportBookingAvailable?: boolean;
}

export interface PlaceActionMediaState {
  readonly galleryAvailable: boolean;
}

export interface PlaceActionCurrentState {
  readonly saved?: boolean;
}

export interface PlaceActionContext {
  readonly place: Pick<
    Place,
    | "id"
    | "businessId"
    | "destinationId"
    | "categoryId"
    | "capabilities"
    | "location"
    | "contact"
    | "description"
  >;
  readonly category: Readonly<{
    id: CategoryId;
    key: CanonicalPlaceCategory;
    active: boolean;
  }>;
  readonly locale: PlaceActionLocale;
  readonly now: string;
  readonly products?: readonly Product[];
  readonly offers?: readonly Offer[];
  readonly menus?: readonly Menu[];
  readonly inventory?: readonly PlaceActionInventoryFact[];
  readonly media?: PlaceActionMediaState;
  readonly providers?: PlaceActionProviderState;
  readonly currentState?: PlaceActionCurrentState;
}

export interface PlacePresentationAction {
  readonly id: PlaceActionType;
  readonly label: string;
  readonly value: string;
  readonly presentation: PlaceActionPresentation;
  readonly priority: number;
  readonly disabled: boolean;
  readonly availability: PlaceActionAvailability;
}

export interface PlacePresentationActions {
  readonly placeId: PlaceId;
  readonly businessId: BusinessId;
  readonly destinationId: DestinationId;
  readonly primaryAction: PlacePresentationAction | null;
  readonly secondaryActions: readonly PlacePresentationAction[];
}

const CATEGORY_ALL = "all" as const;

export const placeActionRegistry: readonly PlaceActionDefinition[] =
  Object.freeze([
    {
      id: "tickets",
      categoryApplicability: ["nightlife"],
      requiredCapabilities: ["tickets"],
      priority: 10,
      presentation: "primary",
    },
    {
      id: "tourBooking",
      categoryApplicability: ["tours"],
      requiredCapabilities: ["tourBooking"],
      priority: 10,
      presentation: "primary",
    },
    {
      id: "booking",
      categoryApplicability: ["hotels"],
      requiredCapabilities: ["booking"],
      priority: 10,
      presentation: "primary",
    },
    {
      id: "transportBooking",
      categoryApplicability: ["transport"],
      requiredCapabilities: ["transportBooking"],
      priority: 10,
      presentation: "primary",
    },
    {
      id: "menu",
      categoryApplicability: ["restaurants", "nightlife"],
      requiredCapabilities: ["menu"],
      priority: 20,
      presentation: "secondary",
    },
    {
      id: "tableReservation",
      categoryApplicability: ["restaurants"],
      requiredCapabilities: ["tableReservation"],
      priority: 25,
      presentation: "secondary",
    },
    {
      id: "directions",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: ["directions"],
      priority: 30,
      presentation: "secondary",
    },
    {
      id: "photos",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: ["photos"],
      priority: 40,
      presentation: "secondary",
    },
    {
      id: "products",
      categoryApplicability: ["shops"],
      requiredCapabilities: ["products"],
      priority: 45,
      presentation: "secondary",
    },
    {
      id: "offers",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: ["offers"],
      priority: 50,
      presentation: "secondary",
    },
    {
      id: "whatsapp",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: ["whatsapp"],
      priority: 60,
      presentation: "secondary",
    },
    {
      id: "call",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: ["call"],
      priority: 70,
      presentation: "secondary",
    },
    {
      id: "website",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: ["website"],
      priority: 80,
      presentation: "secondary",
    },
    {
      id: "save",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: [],
      priority: 90,
      presentation: "secondary",
    },
    {
      id: "share",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: [],
      priority: 100,
      presentation: "secondary",
    },
    {
      id: "info",
      categoryApplicability: CATEGORY_ALL,
      requiredCapabilities: [],
      priority: 110,
      presentation: "secondary",
    },
  ]);

const labels = Object.freeze({
  pt: {
    directions: "Como chegar",
    photos: "Ver fotos",
    menu: "Ver cardápio",
    tableReservation: "Reservar mesa",
    tickets: "Comprar ingressos",
    booking: "Reservar",
    whatsapp: "WhatsApp",
    call: "Ligar",
    website: "Site",
    products: "Ver produtos",
    offers: "Ver ofertas",
    tourBooking: "Reservar passeio",
    transportBooking: "Reservar transporte",
    save: "Salvar",
    share: "Compartilhar",
    info: "Saiba mais",
    soldOut: "Ingressos esgotados",
    upcoming: "Vendas em breve",
  },
  en: {
    directions: "Directions",
    photos: "Photos",
    menu: "View menu",
    tableReservation: "Reserve a table",
    tickets: "Buy tickets",
    booking: "Book",
    whatsapp: "WhatsApp",
    call: "Call",
    website: "Website",
    products: "View products",
    offers: "View offers",
    tourBooking: "Book tour",
    transportBooking: "Book transport",
    save: "Save",
    share: "Share",
    info: "Learn more",
    soldOut: "Tickets sold out",
    upcoming: "Sales opening soon",
  },
  es: {
    directions: "Cómo llegar",
    photos: "Ver fotos",
    menu: "Ver menú",
    tableReservation: "Reservar mesa",
    tickets: "Comprar entradas",
    booking: "Reservar",
    whatsapp: "WhatsApp",
    call: "Llamar",
    website: "Sitio web",
    products: "Ver productos",
    offers: "Ver ofertas",
    tourBooking: "Reservar paseo",
    transportBooking: "Reservar transporte",
    save: "Guardar",
    share: "Compartir",
    info: "Saber más",
    soldOut: "Entradas agotadas",
    upcoming: "Ventas próximamente",
  },
  he: {
    directions: "ניווט",
    photos: "תמונות",
    menu: "תפריט",
    tableReservation: "הזמנת שולחן",
    tickets: "רכישת כרטיסים",
    booking: "הזמנה",
    whatsapp: "WhatsApp",
    call: "שיחה",
    website: "אתר",
    products: "מוצרים",
    offers: "הצעות",
    tourBooking: "הזמנת סיור",
    transportBooking: "הזמנת הסעה",
    save: "שמירה",
    share: "שיתוף",
    info: "מידע נוסף",
    soldOut: "הכרטיסים אזלו",
    upcoming: "המכירה תיפתח בקרוב",
  },
} satisfies Readonly<
  Record<PlaceActionLocale, Readonly<Record<string, string>>>
>);

function applies(
  definition: PlaceActionDefinition,
  category: CanonicalPlaceCategory,
): boolean {
  return (
    definition.categoryApplicability === "all" ||
    definition.categoryApplicability.includes(category)
  );
}

function hasRequiredCapabilities(
  place: PlaceActionContext["place"],
  definition: PlaceActionDefinition,
): boolean {
  return definition.requiredCapabilities.every((capability) =>
    place.capabilities.enabled.includes(capability),
  );
}

function validCoordinates(place: PlaceActionContext["place"]): boolean {
  const { latitude, longitude } = place.location;
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function canonicalProducts(context: PlaceActionContext): readonly Product[] {
  return (context.products ?? []).filter(
    (product) =>
      product.businessId === context.place.businessId &&
      product.placeId === context.place.id &&
      (product.destinationId === null ||
        product.destinationId === context.place.destinationId) &&
      product.status === "active",
  );
}

function canonicalOffers(
  context: PlaceActionContext,
  products: readonly Product[],
): readonly Offer[] {
  const productIds = new Set(products.map(({ id }) => id));
  return (context.offers ?? []).filter(
    (offer) =>
      offer.businessId === context.place.businessId &&
      offer.placeId === context.place.id &&
      (offer.destinationId === null ||
        offer.destinationId === context.place.destinationId) &&
      productIds.has(offer.productId),
  );
}

function activeMenus(context: PlaceActionContext): readonly Menu[] {
  return (context.menus ?? []).filter(
    (menu) =>
      menu.businessId === context.place.businessId &&
      menu.placeId === context.place.id &&
      menu.status === "active",
  );
}

function inventoryFor(
  context: PlaceActionContext,
  offerId: string,
): PlaceActionInventoryFact | undefined {
  return (context.inventory ?? []).find((fact) => fact.offerId === offerId);
}

function commerceAvailability(
  context: PlaceActionContext,
  offers: readonly Offer[],
): Readonly<{
  availability: PlaceActionAvailability;
  offerIds: readonly string[];
}> | null {
  if (offers.length === 0) return null;
  const evaluated = offers.map((offer) => {
    const inventory = inventoryFor(context, offer.id);
    if (inventory && !inventory.providerAvailable) {
      return {
        offer,
        sellable: false,
        reason: "PROVIDER_UNAVAILABLE" as const,
      };
    }
    const result = evaluateOfferSellability(offer, {
      now: context.now,
      ...(inventory
        ? { authoritativeAvailableQuantity: inventory.availableQuantity }
        : {}),
    });
    return { offer, ...result };
  });
  const sellable = evaluated.filter(({ sellable }) => sellable);
  if (sellable.length > 0) {
    return Object.freeze({
      availability: "available" as const,
      offerIds: Object.freeze(
        sellable.map(({ offer }) => String(offer.id)).sort(),
      ),
    });
  }
  if (evaluated.some(({ reason }) => reason === "SOLD_OUT")) {
    return Object.freeze({
      availability: "sold_out" as const,
      offerIds: Object.freeze(
        evaluated.map(({ offer }) => String(offer.id)).sort(),
      ),
    });
  }
  if (evaluated.some(({ reason }) => reason === "SALES_NOT_STARTED")) {
    return Object.freeze({
      availability: "upcoming" as const,
      offerIds: Object.freeze(
        evaluated.map(({ offer }) => String(offer.id)).sort(),
      ),
    });
  }
  return null;
}

function actionFor(
  definition: PlaceActionDefinition,
  context: PlaceActionContext,
): PlacePresentationAction | null {
  const { place } = context;
  const locale = labels[context.locale];
  const products = canonicalProducts(context);
  const offers = canonicalOffers(context, products);

  let availability: PlaceActionAvailability = "available";
  let disabled = false;
  let value = `place-action:${definition.id}:${String(place.id)}`;

  switch (definition.id) {
    case "directions":
      if (!validCoordinates(place)) return null;
      break;
    case "photos":
      if (!context.media?.galleryAvailable) return null;
      break;
    case "menu":
      if (activeMenus(context).length === 0) return null;
      break;
    case "tableReservation":
      if (!context.providers?.tableReservationAvailable) return null;
      break;
    case "booking":
      if (!context.providers?.bookingAvailable) return null;
      break;
    case "tourBooking":
      if (!context.providers?.tourBookingAvailable) return null;
      break;
    case "transportBooking":
      if (!context.providers?.transportBookingAvailable) return null;
      break;
    case "tickets": {
      const commerce = commerceAvailability(context, offers);
      if (!commerce) return null;
      availability = commerce.availability;
      disabled = availability !== "available";
      value =
        commerce.offerIds.length === 1
          ? `commerce:offer:${commerce.offerIds[0]}`
          : `commerce:offers:${commerce.offerIds.join(",")}`;
      break;
    }
    case "whatsapp":
      if (!place.contact.whatsapp?.trim()) return null;
      value = `whatsapp:${place.contact.whatsapp.trim()}`;
      break;
    case "call":
      if (!place.contact.phone?.trim()) return null;
      value = `tel:${place.contact.phone.trim()}`;
      break;
    case "website":
      if (!place.contact.website?.trim()) return null;
      value = place.contact.website.trim();
      break;
    case "products":
      if (products.length === 0) return null;
      break;
    case "offers": {
      const commerce = commerceAvailability(context, offers);
      if (!commerce || commerce.availability !== "available") return null;
      value = `commerce:offers:${commerce.offerIds.join(",")}`;
      break;
    }
    case "info":
      if (!place.description.trim()) return null;
      break;
    case "save":
      value = `place-action:save:${String(place.id)}:${context.currentState?.saved ? "remove" : "add"}`;
      break;
    case "share":
      break;
  }

  const label =
    definition.id === "tickets" && availability === "sold_out"
      ? locale.soldOut
      : definition.id === "tickets" && availability === "upcoming"
        ? locale.upcoming
        : locale[definition.id];

  return Object.freeze({
    id: definition.id,
    label,
    value,
    presentation: definition.presentation,
    priority: definition.priority,
    disabled,
    availability,
  });
}

export function resolvePlacePresentationActions(
  context: PlaceActionContext,
): PlacePresentationActions {
  if (
    !context.category.active ||
    context.category.id !== context.place.categoryId
  ) {
    return Object.freeze({
      placeId: context.place.id,
      businessId: context.place.businessId,
      destinationId: context.place.destinationId,
      primaryAction: null,
      secondaryActions: Object.freeze([]),
    });
  }
  if (!Number.isFinite(Date.parse(context.now)))
    throw new Error("INVALID_PLACE_ACTION_NOW");

  const byId = new Map<PlaceActionType, PlacePresentationAction>();
  for (const definition of placeActionRegistry) {
    if (!applies(definition, context.category.key)) continue;
    if (!hasRequiredCapabilities(context.place, definition)) continue;
    const action = actionFor(definition, context);
    if (action && !byId.has(action.id)) byId.set(action.id, action);
  }

  const ordered = Array.from(byId.values()).sort(
    (left, right) =>
      left.priority - right.priority || left.id.localeCompare(right.id),
  );
  const primaryAction =
    ordered.find((action) => action.presentation === "primary") ?? null;
  const secondaryActions = Object.freeze(
    ordered.filter((action) => action.id !== primaryAction?.id),
  );

  return Object.freeze({
    placeId: context.place.id,
    businessId: context.place.businessId,
    destinationId: context.place.destinationId,
    primaryAction,
    secondaryActions,
  });
}
