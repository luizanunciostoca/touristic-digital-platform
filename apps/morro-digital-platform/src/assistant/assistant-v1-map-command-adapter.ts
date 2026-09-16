import type { AssistantDialogResponse } from "@touristic/assistant";
import type { MapboxGlMapLike } from "@touristic/geospatial";
import {
  morroV1SearchCatalog,
  normalizeSearchText,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

export type AssistantV1MapLanguage = "pt" | "en" | "es" | "he";
export type AssistantV1MapStyle = "default" | "satellite" | "dark" | "outdoor";

export type AssistantV1MapCommand =
  | Readonly<{ type: "style"; style: AssistantV1MapStyle }>
  | Readonly<{ type: "filter"; category: string }>
  | Readonly<{ type: "show_all" }>
  | Readonly<{ type: "zoom"; direction: "in" | "out" }>
  | Readonly<{ type: "overview" }>
  | Readonly<{ type: "focus"; place: MorroV1SearchCatalogItem; zoom: number }>;

export interface AssistantV1MapExplorePort {
  showCategoryOnMap(category: string): Promise<number | null>;
  showAllOnMap(): Promise<number | null>;
}

export interface AssistantV1MapCommandRequest {
  readonly input: string;
  readonly language?: AssistantV1MapLanguage;
  readonly map?: MapboxGlMapLike;
  readonly explore?: AssistantV1MapExplorePort;
}

const MAP_STYLES: Readonly<Record<AssistantV1MapStyle, string>> = Object.freeze(
  {
    default: "mapbox://styles/mapbox/streets-v12",
    satellite: "mapbox://styles/mapbox/satellite-streets-v12",
    dark: "mapbox://styles/mapbox/dark-v11",
    outdoor: "mapbox://styles/mapbox/outdoors-v12",
  },
);

const OPTIONS = Object.freeze({
  pt: [
    { label: "Ver todos", value: "mostrar todos" },
    { label: "Modo satélite", value: "modo satélite" },
    { label: "Modo normal", value: "modo normal" },
    { label: "Visão geral", value: "visão geral" },
  ],
  en: [
    { label: "Show all", value: "mostrar todos" },
    { label: "Satellite mode", value: "modo satélite" },
    { label: "Standard mode", value: "modo normal" },
    { label: "Overview", value: "visão geral" },
  ],
  es: [
    { label: "Mostrar todos", value: "mostrar todos" },
    { label: "Modo satélite", value: "modo satélite" },
    { label: "Modo normal", value: "modo normal" },
    { label: "Vista general", value: "visão geral" },
  ],
  he: [
    { label: "הצג הכול", value: "mostrar todos" },
    { label: "מצב לוויין", value: "modo satélite" },
    { label: "מצב רגיל", value: "modo normal" },
    { label: "מבט כללי", value: "visão geral" },
  ],
} as const);

const COPY = Object.freeze({
  pt: {
    unavailable: "Mapa não disponível no momento.",
    moved: (place: string) => `✅ Mapa movido para ${place}.`,
    moveError: "Erro ao mover o mapa.",
    style: (style: string) => `🗺️ Mapa alterado para modo ${style}.`,
    styleError: "Erro ao alterar o estilo do mapa.",
    filtered: (count: number, label: string) =>
      `📍 Mostrando ${count} ${label.toLowerCase()} no mapa.`,
    filterEmpty: (label: string) =>
      `Nenhum local encontrado na categoria ${label}.`,
    filterError: "Erro ao filtrar categoria no mapa.",
    restored: "✅ Todos os locais restaurados no mapa.",
    restoreError: "Erro ao restaurar filtros.",
    zoom: (zoom: number) => `🔍 Zoom ajustado para ${zoom.toFixed(0)}.`,
    zoomError: "Erro ao ajustar zoom.",
    overview: "🗺️ Visão geral de Morro de São Paulo.",
    overviewError: "Erro ao mostrar visão geral.",
  },
  en: {
    unavailable: "Map is not available right now.",
    moved: (place: string) => `✅ Map moved to ${place}.`,
    moveError: "Could not move the map.",
    style: (style: string) => `🗺️ Map changed to ${style} mode.`,
    styleError: "Could not change the map style.",
    filtered: (count: number, label: string) =>
      `📍 Showing ${count} ${label.toLowerCase()} on the map.`,
    filterEmpty: (label: string) => `No places found in ${label}.`,
    filterError: "Could not filter the map category.",
    restored: "✅ All locations restored on the map.",
    restoreError: "Could not restore the filters.",
    zoom: (zoom: number) => `🔍 Zoom adjusted to ${zoom.toFixed(0)}.`,
    zoomError: "Could not adjust the zoom.",
    overview: "🗺️ Overview of Morro de São Paulo.",
    overviewError: "Could not show the overview.",
  },
  es: {
    unavailable: "El mapa no está disponible en este momento.",
    moved: (place: string) => `✅ Mapa movido a ${place}.`,
    moveError: "No fue posible mover el mapa.",
    style: (style: string) => `🗺️ Mapa cambiado al modo ${style}.`,
    styleError: "No fue posible cambiar el estilo del mapa.",
    filtered: (count: number, label: string) =>
      `📍 Mostrando ${count} ${label.toLowerCase()} en el mapa.`,
    filterEmpty: (label: string) => `No se encontraron lugares en ${label}.`,
    filterError: "No fue posible filtrar la categoría en el mapa.",
    restored: "✅ Todos los lugares fueron restaurados en el mapa.",
    restoreError: "No fue posible restaurar los filtros.",
    zoom: (zoom: number) => `🔍 Zoom ajustado a ${zoom.toFixed(0)}.`,
    zoomError: "No fue posible ajustar el zoom.",
    overview: "🗺️ Vista general de Morro de São Paulo.",
    overviewError: "No fue posible mostrar la vista general.",
  },
  he: {
    unavailable: "המפה אינה זמינה כרגע.",
    moved: (place: string) => `✅ המפה הוזזה אל ${place}.`,
    moveError: "לא ניתן היה להזיז את המפה.",
    style: (style: string) => `🗺️ המפה הוחלפה למצב ${style}.`,
    styleError: "לא ניתן היה לשנות את סגנון המפה.",
    filtered: (count: number, label: string) =>
      `📍 מוצגים ${count} מקומות מסוג ${label} במפה.`,
    filterEmpty: (label: string) => `לא נמצאו מקומות בקטגוריה ${label}.`,
    filterError: "לא ניתן היה לסנן את הקטגוריה במפה.",
    restored: "✅ כל המקומות שוחזרו במפה.",
    restoreError: "לא ניתן היה לשחזר את המסננים.",
    zoom: (zoom: number) => `🔍 הזום הותאם ל-${zoom.toFixed(0)}.`,
    zoomError: "לא ניתן היה להתאים את הזום.",
    overview: "🗺️ מבט כללי על מורו דה סאו פאולו.",
    overviewError: "לא ניתן היה להציג את המבט הכללי.",
  },
} as const);

const STYLE_LABELS = Object.freeze({
  pt: {
    default: "padrão",
    satellite: "satélite",
    dark: "noturno",
    outdoor: "outdoor",
  },
  en: {
    default: "standard",
    satellite: "satellite",
    dark: "dark",
    outdoor: "outdoor",
  },
  es: {
    default: "normal",
    satellite: "satélite",
    dark: "oscuro",
    outdoor: "outdoor",
  },
  he: { default: "רגיל", satellite: "לוויין", dark: "כהה", outdoor: "חוץ" },
} as const);

const CATEGORY_LABELS = Object.freeze({
  pt: {
    beaches: "Praias",
    restaurants: "Restaurantes",
    hotels: "Hotéis e Pousadas",
    shops: "Lojas e Comércio",
    attractions: "Atrações Turísticas",
    nightlife: "Vida Noturna",
    tours: "Passeios",
    emergencies: "Emergências",
    transport: "Transporte",
  },
  en: {
    beaches: "Beaches",
    restaurants: "Restaurants",
    hotels: "Hotels and guesthouses",
    shops: "Shops",
    attractions: "Attractions",
    nightlife: "Nightlife",
    tours: "Tours",
    emergencies: "Emergencies",
    transport: "Transport",
  },
  es: {
    beaches: "Playas",
    restaurants: "Restaurantes",
    hotels: "Hoteles y posadas",
    shops: "Tiendas",
    attractions: "Atracciones",
    nightlife: "Vida nocturna",
    tours: "Paseos",
    emergencies: "Emergencias",
    transport: "Transporte",
  },
  he: {
    beaches: "חופים",
    restaurants: "מסעדות",
    hotels: "מלונות",
    shops: "חנויות",
    attractions: "אטרקציות",
    nightlife: "חיי לילה",
    tours: "סיורים",
    emergencies: "מקרי חירום",
    transport: "תחבורה",
  },
} as const);

const KNOWN_ZOOM: Readonly<Record<string, number>> = Object.freeze({
  "primeira praia": 17,
  "segunda praia": 17,
  "terceira praia": 17,
  "quarta praia": 17,
  "quinta praia": 16,
  "toca do morcego": 17,
  "farol do morro": 17,
  "forte de tapirandu": 17,
  "mirante da tirolesa": 17,
  "paredao da argila": 17,
  gamboa: 15,
  "vila do morro": 16,
  porto: 16,
  "morro de sao paulo": 14,
});

function options(language: AssistantV1MapLanguage) {
  return OPTIONS[language].map((option) => Object.freeze({ ...option }));
}

function response(
  text: string,
  language: AssistantV1MapLanguage,
  state: "resolved" | "unavailable" | "error",
  command: AssistantV1MapCommand,
): AssistantDialogResponse {
  return {
    text,
    options: options(language),
    metadata: {
      domain: "map_command",
      state,
      deterministic: true,
      command: command.type,
    },
  };
}

function isTransportQuestion(normalized: string): boolean {
  return /(como chegar|como ir|como vir|como voltar|como acessar|transporte|lancha|catamarao|catamara|ferry|barco para|aviao|onibus|uber|taxi|transfer|acesso a|acesso ao)/u.test(
    normalized,
  );
}

function findPlace(input: string): MorroV1SearchCatalogItem | null {
  const normalized = normalizeSearchText(input);
  const candidates = morroV1SearchCatalog
    .flatMap((place) =>
      [place.name, ...(place.aliases ?? [])].map((name) => ({
        place,
        name: normalizeSearchText(name),
      })),
    )
    .filter(({ name }) => name.length >= 4 && normalized.includes(name))
    .sort((a, b) => b.name.length - a.name.length);
  return candidates[0]?.place ?? null;
}

function zoomFor(place: MorroV1SearchCatalogItem): number {
  const normalized = normalizeSearchText(place.name);
  const direct = KNOWN_ZOOM[normalized];
  if (direct) return direct;
  for (const [name, zoom] of Object.entries(KNOWN_ZOOM)) {
    if (normalized.includes(name) || name.includes(normalized)) return zoom;
  }
  return 16;
}

export function resolveAssistantV1MapCommand(
  rawInput: string,
): AssistantV1MapCommand | null {
  const input = normalizeSearchText(rawInput);
  if (!input || isTransportQuestion(input)) return null;

  if (
    /(modo satelite|visao satelite|satellite|satelite|vista aerea)/u.test(input)
  ) {
    return { type: "style", style: "satellite" };
  }
  if (
    /(modo noturno|mapa escuro|dark mode|modo dark|tema escuro)/u.test(input)
  ) {
    return { type: "style", style: "dark" };
  }
  if (
    /(modo normal|mapa normal|mapa padrao|volta ao normal|restaurar mapa)/u.test(
      input,
    )
  ) {
    return { type: "style", style: "default" };
  }
  if (/(modo outdoor|mapa outdoor|trilhas|topografico)/u.test(input)) {
    return { type: "style", style: "outdoor" };
  }

  const filterPrefix = /(mostra so|mostrar so|ver so|apenas|somente|filtrar)/u;
  if (filterPrefix.test(input) && /(praia|beach)/u.test(input))
    return { type: "filter", category: "beaches" };
  if (filterPrefix.test(input) && /(restaurante|comida)/u.test(input))
    return { type: "filter", category: "restaurants" };
  if (filterPrefix.test(input) && /(pousada|hotel)/u.test(input))
    return { type: "filter", category: "hotels" };
  if (filterPrefix.test(input) && /(loja|compra)/u.test(input))
    return { type: "filter", category: "shops" };
  if (filterPrefix.test(input) && /(atracao|turismo)/u.test(input))
    return { type: "filter", category: "attractions" };
  if (filterPrefix.test(input) && /(noite|balada|bar)/u.test(input))
    return { type: "filter", category: "nightlife" };
  if (filterPrefix.test(input) && /(passeio|tour)/u.test(input))
    return { type: "filter", category: "tours" };
  if (filterPrefix.test(input) && /(emergencia|hospital)/u.test(input))
    return { type: "filter", category: "emergencies" };
  if (filterPrefix.test(input) && /(buggy)/u.test(input))
    return { type: "filter", category: "transport" };

  if (
    /(mostrar todos|ver todos|todos os locais|remover filtro|limpar filtro|restaurar|show all)/u.test(
      input,
    )
  ) {
    return { type: "show_all" };
  }
  if (/(aproximar|zoom in|mais perto|mais zoom|aumentar zoom)/u.test(input)) {
    return { type: "zoom", direction: "in" };
  }
  if (/(afastar|zoom out|mais longe|menos zoom|diminuir zoom)/u.test(input)) {
    return { type: "zoom", direction: "out" };
  }
  if (
    /(visao geral|ver tudo|mapa completo|ilha toda|mostrar ilha|overview)/u.test(
      input,
    )
  ) {
    return { type: "overview" };
  }
  if (
    /(zoom|ir para|mostrar no mapa|ver no mapa|localizar|onde fica)/u.test(
      input,
    )
  ) {
    const place = findPlace(input);
    if (place) return { type: "focus", place, zoom: zoomFor(place) };
  }
  return null;
}

function categoryLabel(
  category: string,
  language: AssistantV1MapLanguage,
): string {
  return (
    CATEGORY_LABELS[language][
      category as keyof (typeof CATEGORY_LABELS)[AssistantV1MapLanguage]
    ] ?? category
  );
}

export async function executeAssistantV1MapCommand(
  request: AssistantV1MapCommandRequest,
): Promise<AssistantDialogResponse | null> {
  const command = resolveAssistantV1MapCommand(request.input);
  if (!command) return null;
  const language = request.language ?? "pt";
  const copy = COPY[language];

  if (command.type === "filter") {
    const label = categoryLabel(command.category, language);
    try {
      const count = await request.explore?.showCategoryOnMap(command.category);
      if (count === undefined || count === null)
        return response(copy.unavailable, language, "unavailable", command);
      if (count === 0)
        return response(
          copy.filterEmpty(label),
          language,
          "unavailable",
          command,
        );
      return response(
        copy.filtered(count, label),
        language,
        "resolved",
        command,
      );
    } catch {
      return response(copy.filterError, language, "error", command);
    }
  }

  if (command.type === "show_all") {
    try {
      const count = await request.explore?.showAllOnMap();
      return count === undefined || count === null
        ? response(copy.unavailable, language, "unavailable", command)
        : response(copy.restored, language, "resolved", command);
    } catch {
      return response(copy.restoreError, language, "error", command);
    }
  }

  const map = request.map;
  if (!map) return response(copy.unavailable, language, "unavailable", command);

  if (command.type === "style") {
    if (!map.setStyle)
      return response(copy.unavailable, language, "unavailable", command);
    try {
      const center = map.getCenter?.();
      const zoom = map.getZoom?.();
      const pitch = map.getPitch?.();
      const bearing = map.getBearing?.();
      map.setStyle(MAP_STYLES[command.style]);
      if (map.once && center) {
        map.once("style.load", () => {
          map.flyTo?.({
            center: [center.lng, center.lat],
            ...(typeof zoom === "number" ? { zoom } : {}),
            ...(typeof pitch === "number" ? { pitch } : {}),
            ...(typeof bearing === "number" ? { bearing } : {}),
            duration: 800,
            essential: true,
          });
        });
      }
      return response(
        copy.style(STYLE_LABELS[language][command.style]),
        language,
        "resolved",
        command,
      );
    } catch {
      return response(copy.styleError, language, "error", command);
    }
  }

  if (command.type === "zoom") {
    const current = map.getZoom?.();
    if (typeof current !== "number")
      return response(copy.unavailable, language, "unavailable", command);
    const target =
      command.direction === "in"
        ? Math.min(current + 2, 20)
        : Math.max(current - 2, 8);
    try {
      if (map.flyTo)
        map.flyTo({ zoom: target, duration: 800, essential: true });
      else if (map.setZoom) map.setZoom(target);
      else return response(copy.unavailable, language, "unavailable", command);
      return response(copy.zoom(target), language, "resolved", command);
    } catch {
      return response(copy.zoomError, language, "error", command);
    }
  }

  if (command.type === "overview") {
    try {
      if (map.flyTo) {
        map.flyTo({
          center: [-38.9145, -13.382],
          zoom: 14,
          duration: 800,
          essential: true,
        });
      } else {
        map.setCenter([-38.9145, -13.382]);
        map.setZoom?.(14);
      }
      return response(copy.overview, language, "resolved", command);
    } catch {
      return response(copy.overviewError, language, "error", command);
    }
  }

  try {
    if (map.flyTo) {
      map.flyTo({
        center: [command.place.longitude, command.place.latitude],
        zoom: command.zoom,
        duration: 800,
        essential: true,
      });
    } else {
      map.setCenter([command.place.longitude, command.place.latitude]);
      map.setZoom?.(command.zoom);
    }
    return response(
      copy.moved(command.place.name),
      language,
      "resolved",
      command,
    );
  } catch {
    return response(copy.moveError, language, "error", command);
  }
}
