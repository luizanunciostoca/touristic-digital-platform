import type { AssistantLocale } from "@touristic/assistant";

import {
  getV1ExploreLabel,
  type V1ExploreLabelKey,
} from "./explore-v1-i18n.js";

export type V1ExplorePlaceAction = "command" | "back-places";

export interface V1ExplorePlaceActionOption {
  readonly label: string;
  readonly value: string;
  readonly action: V1ExplorePlaceAction;
}

type ActionSpec = Readonly<{
  icon: string;
  key: V1ExploreLabelKey;
  value: string;
}>;

const command = (
  spec: ActionSpec,
  locale: AssistantLocale,
): V1ExplorePlaceActionOption =>
  Object.freeze({
    label: spec.icon
      ? `${spec.icon} ${getV1ExploreLabel(spec.key, locale)}`
      : getV1ExploreLabel(spec.key, locale),
    value: spec.value,
    action: "command" as const,
  });

const backToPlaces = (
  category: string,
  locale: AssistantLocale,
): V1ExplorePlaceActionOption =>
  Object.freeze({
    label: `⬅️ ${getV1ExploreLabel("back", locale)}`,
    value: `[sub]${category}`,
    action: "back-places" as const,
  });

const GENERIC_PLACE_ACTIONS: readonly ActionSpec[] = Object.freeze([
  { icon: "📍", key: "directions", value: "como chegar" },
  { icon: "📸", key: "photos", value: "ver fotos" },
  { icon: "ℹ️", key: "moreInformation", value: "mais detalhes" },
  { icon: "❤️", key: "favorite", value: "adicionar aos favoritos" },
]);

const COMMERCE_GRID_ACTIONS = Object.freeze({
  tours: Object.freeze([
    { icon: "📍", key: "meetingPoint", value: "ponto de encontro" },
    { icon: "📸", key: "photos", value: "ver fotos" },
    { icon: "📞", key: "contact", value: "contato" },
    { icon: "❤️", key: "favorite", value: "adicionar aos favoritos" },
  ]),
  nightlife: GENERIC_PLACE_ACTIONS,
  transport: Object.freeze([
    { icon: "📍", key: "location", value: "localização" },
    { icon: "💰", key: "fares", value: "tarifas" },
    { icon: "📞", key: "contact", value: "contato" },
    { icon: "❤️", key: "favorite", value: "adicionar aos favoritos" },
  ]),
} satisfies Readonly<Record<string, readonly ActionSpec[]>>);

const CATEGORY_PLACE_ACTIONS = Object.freeze({
  restaurants: Object.freeze([
    { icon: "🍴", key: "menu", value: "cardápio" },
    { icon: "📍", key: "directions", value: "como chegar" },
    { icon: "📸", key: "photos", value: "ver fotos" },
    { icon: "📞", key: "contact", value: "contato" },
    { icon: "", key: "more", value: "mais opções" },
  ]),
  hotels: Object.freeze([
    { icon: "🛏️", key: "rooms", value: "ver quartos" },
    { icon: "📅", key: "book", value: "reservar" },
    { icon: "📍", key: "directions", value: "como chegar" },
    { icon: "📸", key: "photos", value: "ver fotos" },
    { icon: "", key: "more", value: "mais opções" },
  ]),
  beaches: Object.freeze([
    { icon: "🌊", key: "beachConditions", value: "condições da praia" },
    { icon: "📍", key: "directions", value: "como chegar" },
    { icon: "📸", key: "photos", value: "ver fotos" },
    { icon: "ℹ️", key: "information", value: "informações" },
    { icon: "", key: "more", value: "mais opções" },
  ]),
} satisfies Readonly<Record<string, readonly ActionSpec[]>>);

export function getV1ExplorePlaceActionOptions(
  category: string,
  locale: AssistantLocale = "pt",
): readonly V1ExplorePlaceActionOption[] {
  const commerceSpecs = (
    COMMERCE_GRID_ACTIONS as Readonly<Record<string, readonly ActionSpec[]>>
  )[category];
  if (commerceSpecs) {
    return Object.freeze(commerceSpecs.map((spec) => command(spec, locale)));
  }

  const specs = (
    CATEGORY_PLACE_ACTIONS as Readonly<Record<string, readonly ActionSpec[]>>
  )[category];
  if (!specs) {
    return Object.freeze(
      GENERIC_PLACE_ACTIONS.map((spec) => command(spec, locale)),
    );
  }
  return Object.freeze([
    ...specs.map((spec) => command(spec, locale)),
    backToPlaces(category, locale),
  ]);
}
