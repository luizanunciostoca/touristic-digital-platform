import type {
  AssistantDialogResponse,
  AssistantHistoryEntry,
  AssistantLocale,
} from "@touristic/assistant";
import {
  morroV1SearchCatalog,
  normalizeSearchText,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

import type { ExploreLocationsControl } from "../map/explore-locations-control.js";

export type AssistantV1ResidualCommand =
  | Readonly<{ type: "history" }>
  | Readonly<{
      type: "map_style";
      style: "default" | "satellite" | "dark" | "outdoor";
    }>
  | Readonly<{ type: "map_filter_category"; category: string }>
  | Readonly<{ type: "map_show_all" }>
  | Readonly<{ type: "map_zoom"; direction: "in" | "out" }>
  | Readonly<{ type: "map_overview" }>
  | Readonly<{ type: "map_focus_place"; place: MorroV1SearchCatalogItem }>;

export interface AssistantV1MapCommandMap {
  getCenter?(): Readonly<{ lng: number; lat: number }>;
  getZoom?(): number;
  getPitch?(): number;
  getBearing?(): number;
  setZoom?(zoom: number): void;
  setCenter?(center: [number, number]): void;
  flyTo?(options: {
    readonly center?: [number, number];
    readonly zoom?: number;
    readonly pitch?: number;
    readonly bearing?: number;
    readonly duration?: number;
    readonly essential?: boolean;
  }): void;
  setStyle?(style: string): void;
  once?(event: string, listener: () => void): void;
}

export interface ExecuteAssistantV1ResidualCommandOptions {
  readonly command: AssistantV1ResidualCommand;
  readonly language: AssistantLocale;
  readonly history: readonly AssistantHistoryEntry[];
  readonly map?: AssistantV1MapCommandMap;
  readonly explore?: Pick<ExploreLocationsControl, "execute">;
  readonly defaultMapStyle?: string;
  readonly navigationActive?: boolean;
}

const MAP_STYLES = Object.freeze({
  default: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  dark: "mapbox://styles/mapbox/dark-v11",
  outdoor: "mapbox://styles/mapbox/outdoors-v12",
});

const CATEGORY_ALIASES: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  beaches: ["praia", "praias", "beach", "beaches"],
  restaurants: ["restaurante", "restaurantes", "comida", "restaurant", "restaurants"],
  hotels: ["pousada", "pousadas", "hotel", "hoteis", "hotels"],
  shops: ["loja", "lojas", "compra", "compras", "shop", "shops"],
  attractions: ["atracao", "atracoes", "turismo", "attraction", "attractions"],
  nightlife: ["noite", "balada", "bar", "nightlife"],
  tours: ["passeio", "passeios", "tour", "tours"],
  emergencies: ["emergencia", "emergencias", "hospital", "emergency", "emergencies"],
  transport: ["transporte", "transfer", "barco", "ferry", "lancha", "buggy", "transport"],
});

const MAP_OPTIONS: Readonly<
  Record<AssistantLocale, readonly Readonly<{ label: string; value: string }>[]>
> = Object.freeze({
  pt: Object.freeze([
    Object.freeze({ label: "Mostrar todos", value: "mostrar todos os locais" }),
    Object.freeze({ label: "Modo satélite", value: "modo satélite" }),
    Object.freeze({ label: "Modo normal", value: "modo normal" }),
    Object.freeze({ label: "Visão geral", value: "visão geral" }),
  ]),
  en: Object.freeze([
    Object.freeze({ label: "Show all", value: "show all locations" }),
    Object.freeze({ label: "Satellite mode", value: "satellite mode" }),
    Object.freeze({ label: "Standard mode", value: "standard mode" }),
    Object.freeze({ label: "Overview", value: "overview" }),
  ]),
  es: Object.freeze([
    Object.freeze({ label: "Mostrar todos", value: "mostrar todos los lugares" }),
    Object.freeze({ label: "Modo satélite", value: "modo satélite" }),
    Object.freeze({ label: "Modo normal", value: "modo normal" }),
    Object.freeze({ label: "Vista general", value: "vista general" }),
  ]),
  he: Object.freeze([
    Object.freeze({ label: "הצג הכול", value: "הצג את כל המקומות" }),
    Object.freeze({ label: "מצב לוויין", value: "מצב לוויין" }),
    Object.freeze({ label: "מצב רגיל", value: "מצב רגיל" }),
    Object.freeze({ label: "מבט כללי", value: "מבט כללי" }),
  ]),
});

function normalized(value: string): string {
  return normalizeSearchText(value).replace(/\s+/gu, " ").trim();
}

function includesWholePhrase(input: string, phrase: string): boolean {
  const candidate = normalized(phrase);
  return (` ${input} `).includes(` ${candidate} `);
}

function hasAny(input: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => includesWholePhrase(input, phrase));
}

function categoryFromFilter(input: string): string | null {
  const hasFilterPrefix = hasAny(input, [
    "mostra so",
    "mostrar so",
    "ver so",
    "apenas",
    "somente",
    "filtrar",
    "show only",
    "filter",
    "mostrar solo",
    "solo",
  ]);
  if (!hasFilterPrefix) return null;
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => includesWholePhrase(input, alias))) return category;
  }
  return null;
}

function placeFromFocus(input: string): MorroV1SearchCatalogItem | null {
  const focusPrefix = hasAny(input, [
    "zoom",
    "ir para",
    "mostrar no mapa",
    "ver no mapa",
    "localizar",
    "onde fica",
    "go to",
    "show on map",
    "locate",
    "where is",
    "mostrar en el mapa",
    "ubicar",
    "donde esta",
  ]);
  if (!focusPrefix) return null;

  const candidates = morroV1SearchCatalog
    .flatMap((place) => [
      { place, value: place.name },
      ...(place.aliases ?? []).map((value) => ({ place, value })),
    ])
    .sort((a, b) => normalized(b.value).length - normalized(a.value).length);

  return (
    candidates.find(({ value }) => {
      const token = normalized(value);
      return token.length >= 3 && input.includes(token);
    })?.place ?? null
  );
}

export function resolveAssistantV1ResidualCommand(
  input: string,
): AssistantV1ResidualCommand | null {
  const value = normalized(input);
  if (!value) return null;

  if (["historico", "meu historico"].includes(value)) {
    return Object.freeze({ type: "history" });
  }

  const transportQuestion = hasAny(value, [
    "como chegar",
    "como ir",
    "como vir",
    "como voltar",
    "transporte",
    "barco para",
    "acesso a",
    "acesso ao",
  ]);
  if (transportQuestion && !value.includes("filtrar") && !value.includes("mostrar so")) {
    return null;
  }

  if (
    hasAny(value, [
      "modo satelite",
      "visao satelite",
      "satellite",
      "satellite mode",
      "vista aerea",
    ])
  ) {
    return Object.freeze({ type: "map_style", style: "satellite" });
  }
  if (hasAny(value, ["modo noturno", "mapa escuro", "dark mode", "modo dark", "tema escuro"])) {
    return Object.freeze({ type: "map_style", style: "dark" });
  }
  if (
    hasAny(value, [
      "modo normal",
      "mapa normal",
      "mapa padrao",
      "volta ao normal",
      "restaurar mapa",
      "standard mode",
    ])
  ) {
    return Object.freeze({ type: "map_style", style: "default" });
  }
  if (hasAny(value, ["modo outdoor", "mapa outdoor", "topografico", "outdoor mode"])) {
    return Object.freeze({ type: "map_style", style: "outdoor" });
  }

  const category = categoryFromFilter(value);
  if (category) return Object.freeze({ type: "map_filter_category", category });

  if (
    hasAny(value, [
      "mostrar todos os locais",
      "todos os locais",
      "remover filtro",
      "limpar filtro",
      "show all locations",
      "mostrar todos los lugares",
      "הצג את כל המקומות",
    ])
  ) {
    return Object.freeze({ type: "map_show_all" });
  }
  if (hasAny(value, ["aproximar", "zoom in", "mais perto", "mais zoom", "aumentar zoom"])) {
    return Object.freeze({ type: "map_zoom", direction: "in" });
  }
  if (hasAny(value, ["afastar", "zoom out", "mais longe", "menos zoom", "diminuir zoom"])) {
    return Object.freeze({ type: "map_zoom", direction: "out" });
  }
  if (
    hasAny(value, [
      "visao geral",
      "mapa completo",
      "ilha toda",
      "mostrar ilha",
      "overview",
      "vista general",
      "מבט כללי",
    ])
  ) {
    return Object.freeze({ type: "map_overview" });
  }

  const place = placeFromFocus(value);
  return place ? Object.freeze({ type: "map_focus_place", place }) : null;
}

export function formatAssistantV1History(
  history: readonly AssistantHistoryEntry[],
  language: AssistantLocale,
): string {
  const copy = {
    pt: {
      user: "Você",
      assistant: "Assistente",
      empty: "Seu histórico está vazio. Gostaria de começar uma nova busca?",
      recent: "Seu histórico recente:",
      more: "Deseja saber mais sobre algum desses locais?",
    },
    en: {
      user: "You",
      assistant: "Assistant",
      empty: "Your history is empty. Would you like to start a new search?",
      recent: "Your recent history:",
      more: "Would you like to know more about any of these places?",
    },
    es: {
      user: "Tú",
      assistant: "Asistente",
      empty: "Tu historial está vacío. ¿Te gustaría comenzar una nueva búsqueda?",
      recent: "Tu historial reciente:",
      more: "¿Te gustaría saber más sobre alguno de estos lugares?",
    },
    he: {
      user: "אתה",
      assistant: "העוזר",
      empty: "ההיסטוריה שלך ריקה. האם תרצה להתחיל חיפוש חדש?",
      recent: "ההיסטוריה האחרונה שלך:",
      more: "האם תרצה לדעת יותר על אחד מהמקומות האלה?",
    },
  } as const;
  const labels = copy[language];
  if (history.length === 0) return labels.empty;

  const recent = history
    .slice(-5)
    .map(
      (entry) =>
        `${labels.user}: ${entry.input}\n${labels.assistant}: ${entry.response || ""}`,
    )
    .join("\n\n");
  return `${labels.recent}\n${recent}\n${labels.more}`;
}

function mapCommandOptions(language: AssistantLocale) {
  return MAP_OPTIONS[language];
}

function mapResponse(
  text: string,
  language: AssistantLocale,
  action: string,
  state: "resolved" | "unavailable" | "blocked" = "resolved",
): AssistantDialogResponse {
  return {
    text,
    options: mapCommandOptions(language),
    metadata: {
      domain: "v1_map_command",
      action,
      state,
      deterministic: true,
    },
  };
}

function unavailable(language: AssistantLocale): string {
  return {
    pt: "Mapa não disponível.",
    en: "Map is not available.",
    es: "El mapa no está disponible.",
    he: "המפה אינה זמינה.",
  }[language];
}

function navigationBlocked(language: AssistantLocale): string {
  return {
    pt: "Câmera bloqueada durante navegação.",
    en: "The camera is locked during navigation.",
    es: "La cámara está bloqueada durante la navegación.",
    he: "המצלמה נעולה במהלך הניווט.",
  }[language];
}

export async function executeAssistantV1ResidualCommand(
  options: ExecuteAssistantV1ResidualCommandOptions,
): Promise<AssistantDialogResponse> {
  const { command, language, history, map, explore } = options;
  if (command.type === "history") {
    return {
      text: formatAssistantV1History(history, language),
      metadata: {
        domain: "v1_history",
        action: "history",
        state: "resolved",
        deterministic: true,
      },
    };
  }

  const blocksCamera =
    command.type === "map_style" ||
    command.type === "map_zoom" ||
    command.type === "map_overview" ||
    command.type === "map_focus_place";
  if (options.navigationActive && blocksCamera) {
    return mapResponse(
      navigationBlocked(language),
      language,
      command.type,
      "blocked",
    );
  }

  if (command.type === "map_filter_category") {
    const success =
      (await explore?.execute({
        type: "map_filter_category",
        category: command.category,
      })) ?? false;
    const count = morroV1SearchCatalog.filter(
      (place) => place.category === command.category,
    ).length;
    const categoryLabel = {
      beaches: { pt: "praias", en: "beaches", es: "playas", he: "חופים" },
      restaurants: { pt: "restaurantes", en: "restaurants", es: "restaurantes", he: "מסעדות" },
      hotels: { pt: "hotéis e pousadas", en: "hotels", es: "hoteles", he: "מלונות" },
      shops: { pt: "lojas", en: "shops", es: "tiendas", he: "חנויות" },
      attractions: { pt: "atrações", en: "attractions", es: "atracciones", he: "אטרקציות" },
      nightlife: { pt: "locais de vida noturna", en: "nightlife places", es: "lugares de vida nocturna", he: "מקומות בילוי" },
      tours: { pt: "passeios", en: "tours", es: "paseos", he: "סיורים" },
      emergencies: { pt: "locais de emergência", en: "emergency places", es: "lugares de emergencia", he: "מוקדי חירום" },
      transport: { pt: "opções de transporte", en: "transport options", es: "opciones de transporte", he: "אפשרויות תחבורה" },
    } as const;
    const label =
      categoryLabel[command.category as keyof typeof categoryLabel]?.[language] ??
      command.category;
    const text = success
      ? {
          pt: `📍 Mostrando ${count} ${label} no mapa.`,
          en: `📍 Showing ${count} ${label} on the map.`,
          es: `📍 Mostrando ${count} ${label} en el mapa.`,
          he: `📍 מציג ${count} ${label} במפה.`,
        }[language]
      : unavailable(language);
    return mapResponse(
      text,
      language,
      "map_filter_category",
      success ? "resolved" : "unavailable",
    );
  }

  if (command.type === "map_show_all") {
    const success =
      (await explore?.execute({ type: "show_all_locations" })) ?? false;
    const text = success
      ? {
          pt: "✅ Todos os locais restaurados no mapa.",
          en: "✅ All locations restored on the map.",
          es: "✅ Todos los lugares fueron restaurados en el mapa.",
          he: "✅ כל המקומות שוחזרו במפה.",
        }[language]
      : unavailable(language);
    return mapResponse(
      text,
      language,
      "map_show_all",
      success ? "resolved" : "unavailable",
    );
  }

  if (!map) {
    return mapResponse(unavailable(language), language, command.type, "unavailable");
  }

  if (command.type === "map_style") {
    if (!map.setStyle) {
      return mapResponse(unavailable(language), language, "map_style", "unavailable");
    }
    const center = map.getCenter?.();
    const zoom = map.getZoom?.();
    const pitch = map.getPitch?.();
    const bearing = map.getBearing?.();
    const styleUrl =
      command.style === "default"
        ? options.defaultMapStyle?.trim() || MAP_STYLES.default
        : MAP_STYLES[command.style];
    map.setStyle(styleUrl);
    if (map.once && map.flyTo && center) {
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
    const label = {
      default: { pt: "padrão", en: "standard", es: "normal", he: "רגיל" },
      satellite: { pt: "satélite", en: "satellite", es: "satélite", he: "לוויין" },
      dark: { pt: "noturno", en: "dark", es: "oscuro", he: "כהה" },
      outdoor: { pt: "outdoor", en: "outdoor", es: "outdoor", he: "שטח" },
    }[command.style][language];
    return mapResponse(
      {
        pt: `🗺️ Mapa alterado para modo ${label}.`,
        en: `🗺️ Map changed to ${label} mode.`,
        es: `🗺️ Mapa cambiado al modo ${label}.`,
        he: `🗺️ המפה הוחלפה למצב ${label}.`,
      }[language],
      language,
      "map_style",
    );
  }

  if (command.type === "map_zoom") {
    const current = map.getZoom?.();
    if (typeof current !== "number") {
      return mapResponse(unavailable(language), language, "map_zoom", "unavailable");
    }
    const target =
      command.direction === "in"
        ? Math.min(current + 2, 20)
        : Math.max(current - 2, 8);
    if (map.flyTo) {
      map.flyTo({ zoom: target, duration: 800, essential: true });
    } else {
      map.setZoom?.(target);
    }
    return mapResponse(
      `🔍 Zoom ${language === "he" ? "" : ""}${target.toFixed(0)}.`,
      language,
      "map_zoom",
    );
  }

  if (command.type === "map_overview") {
    const center: [number, number] = [-38.9145, -13.382];
    if (map.flyTo) {
      map.flyTo({ center, zoom: 14, duration: 800, essential: true });
    } else {
      map.setCenter?.(center);
      map.setZoom?.(14);
    }
    return mapResponse(
      {
        pt: "🗺️ Visão geral de Morro de São Paulo.",
        en: "🗺️ Overview of Morro de São Paulo.",
        es: "🗺️ Vista general de Morro de São Paulo.",
        he: "🗺️ מבט כללי על מורו דה סאו פאולו.",
      }[language],
      language,
      "map_overview",
    );
  }

  const center: [number, number] = [
    command.place.longitude,
    command.place.latitude,
  ];
  if (map.flyTo) {
    map.flyTo({ center, zoom: 17, duration: 800, essential: true });
  } else {
    map.setCenter?.(center);
    map.setZoom?.(17);
  }
  return mapResponse(
    {
      pt: `📍 Mostrando ${command.place.name} no mapa.`,
      en: `📍 Showing ${command.place.name} on the map.`,
      es: `📍 Mostrando ${command.place.name} en el mapa.`,
      he: `📍 מציג את ${command.place.name} במפה.`,
    }[language],
    language,
    "map_focus_place",
  );
}
