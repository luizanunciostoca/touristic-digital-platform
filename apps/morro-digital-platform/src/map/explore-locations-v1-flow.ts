import type { AssistantLocale } from "@touristic/assistant";

import {
  normalizeSearchText,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

import {
  getV1ExploreLabel,
  type V1ExploreLabelKey,
} from "./explore-v1-i18n.js";

export type V1ExploreAction =
  "filter" | "nearby" | "all" | "back-menu" | "back-filters" | "tour";

export interface V1ExploreOption {
  readonly label: string;
  readonly value: string;
  readonly action: V1ExploreAction;
  readonly tourId?: string;
}

type FilterSpec = Readonly<{
  icon: string;
  key: V1ExploreLabelKey;
  value: string;
  action: V1ExploreAction;
  tourId?: string;
}>;

const optionFromSpec = (
  spec: FilterSpec,
  locale: AssistantLocale,
): V1ExploreOption =>
  Object.freeze({
    label: spec.icon
      ? `${spec.icon} ${getV1ExploreLabel(spec.key, locale)}`
      : getV1ExploreLabel(spec.key, locale),
    value: spec.value,
    action: spec.action,
    ...(spec.tourId ? { tourId: spec.tourId } : {}),
  });

const shared = (
  key: "nearby" | "seeAll" | "backMenu",
  action: V1ExploreAction,
  value: string,
  icon: string,
  locale: AssistantLocale,
): V1ExploreOption => optionFromSpec({ icon, key, value, action }, locale);

const SUBCATEGORY_SPECS = Object.freeze({
  restaurants: Object.freeze([
    {
      icon: "🌊",
      key: "restaurantsBeach",
      value: "na praia",
      action: "filter",
    },
    {
      icon: "🏘️",
      key: "restaurantsVillage",
      value: "na vila",
      action: "filter",
    },
    {
      icon: "🌴",
      key: "restaurantsGarapua",
      value: "garapua",
      action: "filter",
    },
    { icon: "🍕", key: "restaurantsPizza", value: "pizza", action: "filter" },
    {
      icon: "🐟",
      key: "restaurantsSeafood",
      value: "frutos do mar",
      action: "filter",
    },
    {
      icon: "🥗",
      key: "restaurantsVegetarian",
      value: "vegetariano",
      action: "filter",
    },
    { icon: "🍺", key: "restaurantsBar", value: "bar", action: "filter" },
  ]),
  beaches: Object.freeze([
    { icon: "🏄", key: "beachesSurf", value: "surf", action: "filter" },
    { icon: "🤿", key: "beachesDiving", value: "mergulho", action: "filter" },
    { icon: "🌅", key: "beachesSunset", value: "por do sol", action: "filter" },
    { icon: "👨‍👩‍👧", key: "beachesFamily", value: "familiar", action: "filter" },
    {
      icon: "🎵",
      key: "beachesStructure",
      value: "estrutura",
      action: "filter",
    },
  ]),
  hotels: Object.freeze([
    {
      icon: "🌊",
      key: "hotelsBeachfront",
      value: "frente a praia",
      action: "filter",
    },
    { icon: "🏘️", key: "hotelsVillage", value: "na vila", action: "filter" },
    { icon: "💰", key: "hotelsBudget", value: "economico", action: "filter" },
    { icon: "⭐", key: "hotelsLuxury", value: "luxo", action: "filter" },
    { icon: "🏕️", key: "hotelsCharming", value: "pousada", action: "filter" },
  ]),
  shops: Object.freeze([
    { icon: "🛍️", key: "shopsFashion", value: "roupa", action: "filter" },
    {
      icon: "🛒",
      key: "shopsSupermarket",
      value: "supermercado",
      action: "filter",
    },
    { icon: "🎁", key: "shopsCrafts", value: "artesanato", action: "filter" },
    {
      icon: "💎",
      key: "shopsAccessories",
      value: "bijuteria",
      action: "filter",
    },
    { icon: "💊", key: "shopsPharmacy", value: "farmacia", action: "filter" },
  ]),
  attractions: Object.freeze([
    {
      icon: "🏖️",
      key: "attractionsNature",
      value: "natureza",
      action: "filter",
    },
    {
      icon: "🏛️",
      key: "attractionsHistoric",
      value: "historico",
      action: "filter",
    },
    {
      icon: "🌅",
      key: "attractionsSunset",
      value: "por do sol",
      action: "filter",
    },
    {
      icon: "🦇",
      key: "attractionsNightlife",
      value: "vida noturna",
      action: "filter",
    },
    {
      icon: "🤿",
      key: "attractionsDiving",
      value: "mergulho",
      action: "filter",
    },
  ]),
  nightlife: Object.freeze([
    {
      icon: "🎵",
      key: "nightlifeLiveMusic",
      value: "musica ao vivo",
      action: "filter",
    },
    { icon: "🍹", key: "nightlifeBar", value: "bar", action: "filter" },
    { icon: "💃", key: "nightlifeClub", value: "balada", action: "filter" },
    { icon: "🌅", key: "nightlifeSunset", value: "sunset", action: "filter" },
  ]),
  tours: Object.freeze([
    {
      icon: "🗺️",
      key: "tourIsland",
      value: "tour_volta_ilha",
      action: "tour",
      tourId: "volta-a-ilha",
    },
    {
      icon: "🥾",
      key: "tourGamboa",
      value: "tour_trilha_gamboa",
      action: "tour",
      tourId: "trilha-gamboa",
    },
    {
      icon: "🚤",
      key: "tourAtv",
      value: "tour_quadriciclo",
      action: "tour",
      tourId: "passeio-quadriciclo",
    },
    { icon: "⛵", key: "tourBoat", value: "barco", action: "filter" },
    { icon: "🤿", key: "tourDiving", value: "mergulho", action: "filter" },
    { icon: "🚵", key: "tourAdventure", value: "aventura", action: "filter" },
    { icon: "🐠", key: "tourWildlife", value: "fauna", action: "filter" },
  ]),
  emergencies: Object.freeze([
    {
      icon: "🏥",
      key: "emergenciesHospital",
      value: "hospital",
      action: "filter",
    },
    {
      icon: "👮",
      key: "emergenciesPolice",
      value: "policia",
      action: "filter",
    },
    {
      icon: "🚒",
      key: "emergenciesFirefighters",
      value: "bombeiro",
      action: "filter",
    },
    {
      icon: "💊",
      key: "emergenciesPharmacy",
      value: "farmacia",
      action: "filter",
    },
  ]),
  transport: Object.freeze([
    { icon: "⛵", key: "transportBoat", value: "lancha", action: "filter" },
    { icon: "🚌", key: "transportBuggy", value: "buggy", action: "filter" },
    { icon: "🚶", key: "transportWalking", value: "a pe", action: "filter" },
    { icon: "⚓", key: "transportPier", value: "porto", action: "filter" },
    { icon: "🔎", key: "transportAgency", value: "agencia", action: "filter" },
  ]),
} satisfies Readonly<Record<string, readonly FilterSpec[]>>);

export function getV1ExploreSubcategoryOptions(
  category: string,
  locale: AssistantLocale = "pt",
): readonly V1ExploreOption[] {
  const specs = (
    SUBCATEGORY_SPECS as Readonly<Record<string, readonly FilterSpec[]>>
  )[category];
  if (!specs) return Object.freeze([]);
  const options: V1ExploreOption[] = specs.map((spec) =>
    optionFromSpec(spec, locale),
  );
  if (category !== "emergencies") {
    options.push(shared("nearby", "nearby", "proximo", "📍", locale));
  }
  options.push(shared("seeAll", "all", "ver todos", "🗺️", locale));
  options.push(shared("backMenu", "back-menu", "voltar_menu", "🔙", locale));
  return Object.freeze(options);
}

function normalizedTags(location: MorroV1SearchCatalogItem): readonly string[] {
  return (location.tags ?? []).map(normalizeSearchText);
}

function hasTag(
  location: MorroV1SearchCatalogItem,
  ...tags: string[]
): boolean {
  const haystack = normalizedTags(location);
  return tags.some((tag) => haystack.includes(normalizeSearchText(tag)));
}

function hasArea(
  location: MorroV1SearchCatalogItem,
  ...areas: string[]
): boolean {
  const area = normalizeSearchText(location.area ?? "");
  return areas.some((candidate) => area === normalizeSearchText(candidate));
}

function nameIncludes(
  location: MorroV1SearchCatalogItem,
  value: string,
): boolean {
  return normalizeSearchText(location.name).includes(
    normalizeSearchText(value),
  );
}

export function filterV1ExploreLocations(
  category: string,
  rawFilter: string,
  locations: readonly MorroV1SearchCatalogItem[],
): readonly MorroV1SearchCatalogItem[] {
  const filter = normalizeSearchText(rawFilter.replaceAll("_", " "));
  const matches = (location: MorroV1SearchCatalogItem): boolean => {
    switch (`${category}:${filter}`) {
      case "restaurants:na praia":
        return hasArea(location, "praia") || hasTag(location, "praia");
      case "restaurants:na vila":
        return hasArea(location, "vila") || hasTag(location, "vila");
      case "restaurants:garapua":
        return hasArea(location, "garapua") || hasTag(location, "garapua");
      case "restaurants:pizza":
        return (
          hasTag(location, "pizza", "italiana") ||
          nameIncludes(location, "pizza")
        );
      case "restaurants:frutos do mar":
        return hasTag(location, "frutos do mar", "seafood");
      case "restaurants:vegetariano":
        return hasTag(location, "vegetariano", "saudavel", "vegano");
      case "restaurants:bar":
        return hasTag(location, "bar", "petisco");
      case "beaches:surf":
        return hasTag(location, "surf");
      case "beaches:mergulho":
        return hasTag(location, "mergulho", "snorkel");
      case "beaches:por do sol":
        return hasTag(location, "sunset");
      case "beaches:familiar":
        return hasTag(location, "familiar", "tranquila");
      case "beaches:estrutura":
        return hasTag(location, "estrutura", "animada");
      case "hotels:frente a praia":
        return (
          hasArea(location, "praia") ||
          hasTag(location, "frente_praia", "praia")
        );
      case "hotels:na vila":
        return hasArea(location, "vila") || hasTag(location, "vila");
      case "hotels:economico":
        return hasTag(location, "economico");
      case "hotels:luxo":
        return hasTag(location, "luxo", "premium");
      case "hotels:pousada":
        return (
          hasTag(location, "pousada", "charme") ||
          nameIncludes(location, "pousada")
        );
      case "shops:roupa":
        return hasTag(location, "roupas", "moda");
      case "shops:supermercado":
        return (
          hasTag(location, "mercado", "alimentos") ||
          nameIncludes(location, "super") ||
          nameIncludes(location, "mercad")
        );
      case "shops:artesanato":
        return hasTag(location, "artesanato", "souvenir");
      case "shops:bijuteria":
        return hasTag(location, "bijuteria", "acessorios");
      case "shops:farmacia":
        return (
          hasTag(location, "farmacia") || nameIncludes(location, "farmacia")
        );
      case "attractions:natureza":
        return hasTag(location, "natureza", "trilha");
      case "attractions:historico":
        return hasTag(location, "historico", "cultural");
      case "attractions:por do sol":
        return hasTag(location, "sunset", "mirante");
      case "attractions:vida noturna":
        return hasTag(location, "vida_noturna");
      case "attractions:mergulho":
        return hasTag(location, "mergulho", "snorkel");
      case "nightlife:musica ao vivo":
        return hasTag(location, "musica_ao_vivo");
      case "nightlife:bar":
        return hasTag(location, "bar");
      case "nightlife:balada":
        return hasTag(location, "balada");
      case "nightlife:sunset":
        return hasTag(location, "sunset");
      case "tours:barco":
        return hasTag(location, "barco", "maritimo");
      case "tours:mergulho":
        return hasTag(location, "mergulho", "snorkel");
      case "tours:aventura":
        return hasTag(location, "aventura", "trilha");
      case "tours:fauna":
        return hasTag(location, "fauna");
      case "emergencies:hospital":
        return hasTag(location, "hospital", "saude");
      case "emergencies:policia":
        return hasTag(location, "policia");
      case "emergencies:bombeiro":
        return hasTag(location, "bombeiros", "bombeiro");
      case "emergencies:farmacia":
        return hasTag(location, "farmacia");
      case "transport:lancha":
        return hasTag(location, "lancha", "catamara", "ferry");
      case "transport:buggy":
        return hasTag(location, "buggy", "transfer");
      case "transport:a pe":
        return hasTag(location, "trilha", "caminhada");
      case "transport:porto":
        return hasTag(location, "porto", "cais");
      case "transport:agencia":
        return hasTag(location, "agencia");
      default:
        return true;
    }
  };

  return Object.freeze(locations.filter(matches));
}

function haversineMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radius = 6_371_000;
  const toRadians = (value: number): number => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sortV1ExploreNearby(
  locations: readonly MorroV1SearchCatalogItem[],
  userPosition: Readonly<{ latitude: number; longitude: number }>,
  limit = 12,
): readonly MorroV1SearchCatalogItem[] {
  return Object.freeze(
    [...locations]
      .sort(
        (left, right) =>
          haversineMeters(
            userPosition.latitude,
            userPosition.longitude,
            left.latitude,
            left.longitude,
          ) -
          haversineMeters(
            userPosition.latitude,
            userPosition.longitude,
            right.latitude,
            right.longitude,
          ),
      )
      .slice(0, Math.max(0, limit)),
  );
}
