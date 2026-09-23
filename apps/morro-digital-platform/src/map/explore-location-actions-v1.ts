import type { AssistantLocale } from "@touristic/assistant";

import {
  getV1ExploreLabel,
  type V1ExploreLabelKey,
} from "./explore-v1-i18n.js";

export type V1ExplorePlaceAction = "command" | "back-places";

export type PlaceActionId =
  | "place.info"
  | "place.directions"
  | "place.photos"
  | "place.save"
  | "place.whatsapp"
  | "restaurant.menu"
  | "restaurant.reserve"
  | "nightlife.tickets"
  | "nightlife.menu"
  | "nightlife.schedule"
  | "hotel.accommodations"
  | "hotel.reserve"
  | "tour.reserve"
  | "tour.schedule"
  | "tour.meeting_point"
  | "tour.interactive"
  | "transport.request"
  | "transport.ticket"
  | "transport.stop"
  | "transport.schedule"
  | "shop.products"
  | "shop.schedule"
  | "emergency.schedule";

export interface V1ExplorePlaceActionOption {
  readonly actionId: PlaceActionId;
  readonly label: string;
  readonly value: string;
  readonly action: V1ExplorePlaceAction;
}

type ActionSpec = Readonly<{
  actionId: PlaceActionId;
  icon: string;
  key: V1ExploreLabelKey;
  value: string;
}>;

const command = (
  spec: ActionSpec,
  locale: AssistantLocale,
): V1ExplorePlaceActionOption =>
  Object.freeze({
    actionId: spec.actionId,
    label: spec.icon
      ? `${spec.icon} ${getV1ExploreLabel(spec.key, locale)}`
      : getV1ExploreLabel(spec.key, locale),
    value: spec.value,
    action: "command" as const,
  });

const CATEGORY_PLACE_ACTIONS = Object.freeze({
  restaurants: Object.freeze([
    { actionId: "restaurant.menu", icon: "🍽️", key: "viewMenu", value: "ver cardápio" },
    { actionId: "restaurant.reserve", icon: "📅", key: "reserveTable", value: "reservar mesa" },
    { actionId: "place.directions", icon: "📍", key: "directions", value: "como chegar" },
    { actionId: "place.photos", icon: "📸", key: "photos", value: "ver fotos" },
    { actionId: "place.whatsapp", icon: "💬", key: "whatsapp", value: "whatsapp" },
  ]),
  nightlife: Object.freeze([
    { actionId: "nightlife.tickets", icon: "🎟️", key: "buyTickets", value: "comprar ingressos" },
    { actionId: "nightlife.menu", icon: "🍹", key: "viewMenu", value: "ver cardápio" },
    { actionId: "place.directions", icon: "📍", key: "directions", value: "como chegar" },
    { actionId: "place.photos", icon: "📸", key: "photos", value: "ver fotos" },
    { actionId: "nightlife.schedule", icon: "📅", key: "programming", value: "programação" },
    { actionId: "place.whatsapp", icon: "💬", key: "whatsapp", value: "whatsapp" },
  ]),
  hotels: Object.freeze([
    { actionId: "hotel.accommodations", icon: "🛏️", key: "accommodations", value: "ver acomodações" },
    { actionId: "hotel.reserve", icon: "📅", key: "book", value: "reservar" },
    { actionId: "place.directions", icon: "📍", key: "directions", value: "como chegar" },
    { actionId: "place.photos", icon: "📸", key: "photos", value: "ver fotos" },
    { actionId: "place.whatsapp", icon: "💬", key: "whatsapp", value: "whatsapp" },
  ]),
  tours: Object.freeze([
    { actionId: "place.info", icon: "ℹ️", key: "learnMore", value: "saiba mais" },
    { actionId: "tour.reserve", icon: "🎟️", key: "bookTour", value: "reservar passeio" },
    { actionId: "tour.schedule", icon: "🕐", key: "viewHours", value: "ver horários" },
    { actionId: "tour.meeting_point", icon: "📍", key: "meetingPoint", value: "ponto de encontro" },
    { actionId: "place.photos", icon: "📸", key: "photos", value: "ver fotos" },
    { actionId: "tour.interactive", icon: "ℹ️", key: "interactiveTour", value: "fazer tour interativo" },
    { actionId: "place.whatsapp", icon: "💬", key: "whatsapp", value: "whatsapp" },
  ]),
  beaches: Object.freeze([
    { actionId: "place.info", icon: "ℹ️", key: "learnMore", value: "saiba mais" },
    { actionId: "place.directions", icon: "📍", key: "directions", value: "como chegar" },
    { actionId: "place.photos", icon: "📸", key: "photos", value: "ver fotos" },
    { actionId: "place.save", icon: "❤️", key: "save", value: "adicionar aos favoritos" },
  ]),
  attractions: Object.freeze([
    { actionId: "place.info", icon: "ℹ️", key: "learnMore", value: "saiba mais" },
    { actionId: "place.directions", icon: "📍", key: "directions", value: "como chegar" },
    { actionId: "place.photos", icon: "📸", key: "photos", value: "ver fotos" },
    { actionId: "place.save", icon: "❤️", key: "save", value: "adicionar aos favoritos" },
  ]),
  transport: Object.freeze([
    { actionId: "place.info", icon: "ℹ️", key: "learnMore", value: "saiba mais" },
    { actionId: "transport.request", icon: "🚕", key: "requestTransportFull", value: "solicitar transporte" },
    { actionId: "transport.ticket", icon: "🎫", key: "buyTransportTicket", value: "comprar passagem" },
    { actionId: "transport.stop", icon: "📍", key: "viewStop", value: "ver ponto" },
    { actionId: "transport.schedule", icon: "🕐", key: "hours", value: "horários" },
    { actionId: "place.whatsapp", icon: "💬", key: "whatsapp", value: "whatsapp" },
  ]),
  shops: Object.freeze([
    { actionId: "place.info", icon: "ℹ️", key: "learnMore", value: "saiba mais" },
    { actionId: "shop.products", icon: "📸", key: "viewProducts", value: "ver produtos" },
    { actionId: "shop.schedule", icon: "🕐", key: "hours", value: "horários" },
    { actionId: "place.whatsapp", icon: "💬", key: "whatsapp", value: "whatsapp" },
    { actionId: "place.directions", icon: "📍", key: "directions", value: "como chegar" },
    { actionId: "place.save", icon: "❤️", key: "save", value: "adicionar aos favoritos" },
  ]),
  emergencies: Object.freeze([
    { actionId: "place.info", icon: "ℹ️", key: "learnMore", value: "saiba mais" },
    { actionId: "emergency.schedule", icon: "🕐", key: "hours", value: "horários" },
    { actionId: "place.whatsapp", icon: "💬", key: "whatsapp", value: "whatsapp" },
    { actionId: "place.directions", icon: "📍", key: "directions", value: "como chegar" },
    { actionId: "place.save", icon: "❤️", key: "save", value: "adicionar aos favoritos" },
  ]),
} satisfies Readonly<Record<string, readonly ActionSpec[]>>);

const GENERIC_PLACE_ACTIONS: readonly ActionSpec[] = Object.freeze([
  { actionId: "place.info", icon: "ℹ️", key: "learnMore", value: "saiba mais" },
  { actionId: "place.directions", icon: "📍", key: "directions", value: "como chegar" },
  { actionId: "place.photos", icon: "📸", key: "photos", value: "ver fotos" },
  { actionId: "place.save", icon: "❤️", key: "save", value: "adicionar aos favoritos" },
]);

export function getV1ExplorePlaceActionOptions(
  category: string,
  locale: AssistantLocale = "pt",
): readonly V1ExplorePlaceActionOption[] {
  const specs =
    (CATEGORY_PLACE_ACTIONS as Readonly<Record<string, readonly ActionSpec[]>>)[
      category
    ] ?? GENERIC_PLACE_ACTIONS;
  return Object.freeze(specs.map((spec) => command(spec, locale)));
}
