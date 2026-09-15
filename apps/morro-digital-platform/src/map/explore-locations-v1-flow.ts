import {
  normalizeSearchText,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

export type V1ExploreAction =
  "filter" | "nearby" | "all" | "back-menu" | "back-filters" | "tour";

export interface V1ExploreOption {
  readonly label: string;
  readonly value: string;
  readonly action: V1ExploreAction;
  readonly tourId?: string;
}

const BACK_MENU: V1ExploreOption = Object.freeze({
  label: "🔙 Voltar ao menu",
  value: "voltar_menu",
  action: "back-menu",
});

const NEARBY: V1ExploreOption = Object.freeze({
  label: "📍 Próximos a mim",
  value: "proximo",
  action: "nearby",
});

const SEE_ALL: V1ExploreOption = Object.freeze({
  label: "🗺️ Ver todos",
  value: "ver todos",
  action: "all",
});

const SUBCATEGORY_OPTIONS: Readonly<
  Record<string, readonly V1ExploreOption[]>
> = Object.freeze({
  restaurants: Object.freeze([
    { label: "🌊 Na praia", value: "na praia", action: "filter" },
    { label: "🏘️ Na vila", value: "na vila", action: "filter" },
    { label: "🌴 Em Garapuá", value: "garapua", action: "filter" },
    { label: "🍕 Pizzaria / Italiana", value: "pizza", action: "filter" },
    {
      label: "🐟 Frutos do mar",
      value: "frutos do mar",
      action: "filter",
    },
    {
      label: "🥗 Vegetariano / Vegano",
      value: "vegetariano",
      action: "filter",
    },
    { label: "🍺 Bar / Petiscos", value: "bar", action: "filter" },
    NEARBY,
    SEE_ALL,
    BACK_MENU,
  ]),
  beaches: Object.freeze([
    { label: "🏄 Com ondas para surf", value: "surf", action: "filter" },
    {
      label: "🤿 Para mergulho / snorkel",
      value: "mergulho",
      action: "filter",
    },
    {
      label: "🌅 Para pôr do sol",
      value: "por do sol",
      action: "filter",
    },
    {
      label: "👨‍👩‍👧 Familiar / tranquila",
      value: "familiar",
      action: "filter",
    },
    {
      label: "🎵 Com estrutura / bares",
      value: "estrutura",
      action: "filter",
    },
    NEARBY,
    { ...SEE_ALL, label: "🗺️ Ver todas" },
    BACK_MENU,
  ]),
  hotels: Object.freeze([
    {
      label: "🌊 Frente à praia",
      value: "frente a praia",
      action: "filter",
    },
    { label: "🏘️ Na vila", value: "na vila", action: "filter" },
    { label: "💰 Econômico", value: "economico", action: "filter" },
    { label: "⭐ Luxo / Conforto", value: "luxo", action: "filter" },
    {
      label: "🏕️ Pousada charmosa",
      value: "pousada",
      action: "filter",
    },
    NEARBY,
    SEE_ALL,
    BACK_MENU,
  ]),
  shops: Object.freeze([
    { label: "🛍️ Roupas e moda", value: "roupa", action: "filter" },
    { label: "🛒 Supermercado", value: "supermercado", action: "filter" },
    {
      label: "🎁 Artesanato / Souvenirs",
      value: "artesanato",
      action: "filter",
    },
    {
      label: "💎 Bijuteria / Acessórios",
      value: "bijuteria",
      action: "filter",
    },
    { label: "💊 Farmácia", value: "farmacia", action: "filter" },
    NEARBY,
    SEE_ALL,
    BACK_MENU,
  ]),
  attractions: Object.freeze([
    {
      label: "🏖️ Praias e natureza",
      value: "natureza",
      action: "filter",
    },
    {
      label: "🏛️ Histórico / Cultural",
      value: "historico",
      action: "filter",
    },
    { label: "🌅 Pôr do sol", value: "por do sol", action: "filter" },
    {
      label: "🦇 Vida noturna",
      value: "vida noturna",
      action: "filter",
    },
    {
      label: "🤿 Mergulho / Snorkel",
      value: "mergulho",
      action: "filter",
    },
    NEARBY,
    SEE_ALL,
    BACK_MENU,
  ]),
  nightlife: Object.freeze([
    {
      label: "🎵 Música ao vivo",
      value: "musica ao vivo",
      action: "filter",
    },
    { label: "🍹 Bar / Drinks", value: "bar", action: "filter" },
    { label: "💃 Balada / Dança", value: "balada", action: "filter" },
    { label: "🌅 Sunset bar", value: "sunset", action: "filter" },
    NEARBY,
    SEE_ALL,
    BACK_MENU,
  ]),
  tours: Object.freeze([
    {
      label: "🗺️ Tour Imersivo: Volta à Ilha",
      value: "tour_volta_ilha",
      action: "tour",
      tourId: "volta-a-ilha",
    },
    {
      label: "🥾 Tour Imersivo: Trilha Gamboa",
      value: "tour_trilha_gamboa",
      action: "tour",
      tourId: "trilha-gamboa",
    },
    {
      label: "🚤 Tour Imersivo: Quadriciclo",
      value: "tour_quadriciclo",
      action: "tour",
      tourId: "passeio-quadriciclo",
    },
    { label: "⛵ Passeio de barco", value: "barco", action: "filter" },
    {
      label: "🤿 Mergulho / Snorkel",
      value: "mergulho",
      action: "filter",
    },
    {
      label: "🚵 Aventura / Trilha",
      value: "aventura",
      action: "filter",
    },
    {
      label: "🐠 Observação de fauna",
      value: "fauna",
      action: "filter",
    },
    NEARBY,
    SEE_ALL,
    BACK_MENU,
  ]),
  emergencies: Object.freeze([
    {
      label: "🏥 Hospital / Saúde",
      value: "hospital",
      action: "filter",
    },
    { label: "👮 Polícia", value: "policia", action: "filter" },
    { label: "🚒 Bombeiros", value: "bombeiro", action: "filter" },
    { label: "💊 Farmácia", value: "farmacia", action: "filter" },
    SEE_ALL,
    BACK_MENU,
  ]),
  transport: Object.freeze([
    { label: "⛵ Lancha / Catamarã", value: "lancha", action: "filter" },
    { label: "🚌 Buggy / Transfer", value: "buggy", action: "filter" },
    { label: "🚶 A pé / Trilha", value: "a pe", action: "filter" },
    { label: "⚓ Porto / Cais", value: "porto", action: "filter" },
    {
      label: "🔎 Agência de Viagem",
      value: "agencia",
      action: "filter",
    },
    NEARBY,
    SEE_ALL,
    BACK_MENU,
  ]),
});

export function getV1ExploreSubcategoryOptions(
  category: string,
): readonly V1ExploreOption[] {
  return SUBCATEGORY_OPTIONS[category] ?? Object.freeze([]);
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
