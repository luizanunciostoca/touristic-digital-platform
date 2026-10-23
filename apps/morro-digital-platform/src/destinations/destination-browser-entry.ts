import { EventBus } from "@touristic/core";
import type {
  PublicPlaceDetail,
  PublicPlaceMapItem,
} from "@touristic/business";
import type { GeospatialEngine } from "@touristic/geospatial";

import {
  createDestinationMapReadiness,
  createMorroGeospatialInitializer,
  type DestinationMapState,
} from "../bootstrap/geospatial.js";
import { createPublicPlaceMapClient } from "../map/public-place-map-client-v2.js";
import { loadMapboxGlSdk } from "../runtime/mapbox-sdk-loader.js";
import {
  loadPublicDestination,
  toCoreDestinationConfig,
  type PublicDestination,
} from "../runtime/public-destination.js";
import {
  assertPublicDetailDestination,
  destinationPublicBoundingBox,
  localeChoice,
  trustedPublicMapMarkers,
} from "./destination-page.js";

type Locale = ReturnType<typeof localeChoice>;

interface Copy {
  readonly skip: string;
  readonly language: string;
  readonly selectLanguage: string;
  readonly mapInteractive: string;
  readonly publishedPlaces: string;
  readonly footer: string;
  readonly mapLoading: string;
  readonly contextLoading: string;
  readonly destinationLabel: string;
  readonly eyebrow: string;
  readonly headline: string;
  readonly description: string;
  readonly searching: string;
  readonly search: string;
  readonly map: string;
  readonly places: string;
  readonly empty: string;
  readonly failed: string;
  readonly mapUnavailable: string;
  readonly mapReady: string;
  readonly more: string;
  readonly directions: string;
  readonly loadingDetail: string;
  readonly detailUnavailable: string;
  readonly ready: string;
}

const COPY: Readonly<Record<Locale, Copy>> = Object.freeze({
  "pt-BR": {
    skip: "Ir para o conteúdo",
    language: "Idioma",
    selectLanguage: "Selecionar idioma",
    mapInteractive: "Mapa interativo do destino",
    publishedPlaces: "Lugares publicados",
    footer:
      "Informações e serviços sujeitos à publicação e disponibilidade local.",
    mapLoading: "Carregando mapa...",
    contextLoading: "Carregando destino...",
    destinationLabel: "Destino",
    eyebrow: "Explore o destino",
    headline: "Descubra lugares publicados",
    description:
      "Informações de estabelecimentos e pontos turísticos publicados por seus responsáveis. Confirme condições de acesso antes da visita.",
    searching: "Carregando lugares publicados...",
    search: "Buscar lugares",
    map: "Mapa do destino",
    places: "Lugares para conhecer",
    empty: "Ainda não existem lugares publicados neste destino.",
    failed: "Não foi possível carregar o conteúdo deste destino.",
    mapUnavailable:
      "Mapa indisponível. Os lugares publicados continuam acessíveis na lista.",
    mapReady: "Mapa carregado.",
    more: "Carregar mais",
    directions: "Ver no mapa externo",
    loadingDetail: "Carregando informações...",
    detailUnavailable: "Informações indisponíveis.",
    ready: "Destino verificado.",
  },
  en: {
    skip: "Skip to content",
    language: "Language",
    selectLanguage: "Select language",
    mapInteractive: "Interactive destination map",
    publishedPlaces: "Published places",
    footer:
      "Information and services are subject to publication and local availability.",
    mapLoading: "Loading map...",
    contextLoading: "Loading destination...",
    destinationLabel: "Destination",
    eyebrow: "Explore the destination",
    headline: "Discover published places",
    description:
      "Places and businesses published by their owners. Check current access conditions before your visit.",
    searching: "Loading published places...",
    search: "Search places",
    map: "Destination map",
    places: "Places to discover",
    empty: "No places have been published for this destination yet.",
    failed: "Destination content could not be loaded.",
    mapUnavailable:
      "Map unavailable. Published places remain accessible below.",
    mapReady: "Map loaded.",
    more: "Load more",
    directions: "View on external map",
    loadingDetail: "Loading information...",
    detailUnavailable: "Information unavailable.",
    ready: "Destination verified.",
  },
  es: {
    skip: "Ir al contenido",
    language: "Idioma",
    selectLanguage: "Seleccionar idioma",
    mapInteractive: "Mapa interactivo del destino",
    publishedPlaces: "Lugares publicados",
    footer:
      "La información y los servicios están sujetos a publicación y disponibilidad local.",
    mapLoading: "Cargando mapa...",
    contextLoading: "Cargando destino...",
    destinationLabel: "Destino",
    eyebrow: "Explora el destino",
    headline: "Descubre lugares publicados",
    description:
      "Lugares y negocios publicados por sus responsables. Confirma las condiciones de acceso antes de visitar.",
    searching: "Cargando lugares publicados...",
    search: "Buscar lugares",
    map: "Mapa del destino",
    places: "Lugares para conocer",
    empty: "Todavía no hay lugares publicados para este destino.",
    failed: "No se pudo cargar el contenido del destino.",
    mapUnavailable:
      "Mapa no disponible. Los lugares publicados siguen accesibles en la lista.",
    mapReady: "Mapa cargado.",
    more: "Cargar más",
    directions: "Ver en mapa externo",
    loadingDetail: "Cargando información...",
    detailUnavailable: "Información no disponible.",
    ready: "Destino verificado.",
  },
  he: {
    skip: "דילוג לתוכן",
    language: "שפה",
    selectLanguage: "בחירת שפה",
    mapInteractive: "מפה אינטראקטיבית של היעד",
    publishedPlaces: "מקומות שפורסמו",
    footer: "המידע והשירותים כפופים לפרסום ולזמינות מקומית.",
    mapLoading: "טוען מפה...",
    contextLoading: "טוען יעד...",
    destinationLabel: "יעד",
    eyebrow: "גלו את היעד",
    headline: "גלו מקומות שפורסמו",
    description:
      "מקומות ועסקים שפורסמו על ידי האחראים עליהם. בדקו תנאי הגעה לפני הביקור.",
    searching: "טוען מקומות...",
    search: "חיפוש מקומות",
    map: "מפת היעד",
    places: "מקומות לגלות",
    empty: "אין עדיין מקומות שפורסמו ליעד זה.",
    failed: "לא ניתן לטעון את תוכן היעד.",
    mapUnavailable: "המפה אינה זמינה. הרשימה עדיין נגישה.",
    mapReady: "המפה נטענה.",
    more: "טען עוד",
    directions: "הצגה במפה חיצונית",
    loadingDetail: "טוען מידע...",
    detailUnavailable: "המידע אינו זמין.",
    ready: "היעד אומת.",
  },
});

const BRAND_ASSETS: Readonly<Record<string, string>> = Object.freeze({
  itacare: "/assets/brand/itacare-digital-symbol-v2.svg",
});

interface PublicEnvironment {
  readonly __MORRO_RUNTIME_ENV__?: Readonly<Record<string, string | undefined>>;
}

const required = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`DESTINATION_UI_MISSING:${id}`);
  return element as T;
};

// Destination scope is carried by the path admitted by the server, not by
// caller-provided query parameters or the browser-side destination selector.
// On shared hosts, the unprefixed Place detail endpoint defaults to Morro.
function destinationScopedPlaceFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (
    !destination ||
    typeof input !== "string" ||
    !input.startsWith("/api/places/v1/")
  ) {
    return Promise.reject(new Error("DESTINATION_SCOPED_PLACE_REQUIRED"));
  }
  return fetch(`/d/${encodeURIComponent(destination.id)}${input}`, init);
}
const client = createPublicPlaceMapClient(destinationScopedPlaceFetch);
const allPlaces: PublicPlaceMapItem[] = [];
const seenPlaceIds = new Set<string>();
const seenCursors = new Set<string>();
let selectedLocale: Locale = localeChoice(navigator.language);
let destination: PublicDestination | null = null;
let mapEngine: GeospatialEngine | null = null;
let nextCursor: string | null = null;
let loadingPlaces = false;
let placePageFailed = false;
let loadedPages = 0;
let searchTerm = "";
let contextState: "loading" | "ready" | "unavailable" = "loading";
let mapState: DestinationMapState = "loading";
let mapReadiness: ReturnType<typeof createDestinationMapReadiness> | null =
  null;
let pageActive = true;
let selectionRevision = 0;
type DetailState =
  | { readonly status: "hidden" | "loading" | "unavailable" }
  | { readonly status: "ready"; readonly detail: PublicPlaceDetail };
let detailState: DetailState = { status: "hidden" };

function text(id: string, value: string): void {
  required(id).textContent = value;
}

function copy(): Copy {
  return COPY[selectedLocale];
}

function updateLocale(locale: Locale): void {
  selectedLocale = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
  text("destination-eyebrow", copy().eyebrow);
  text("destination-title", copy().headline);
  text("destination-description", copy().description);
  text("destination-map-title", copy().map);
  text("destination-places-title", copy().places);
  text("destination-search-label", copy().search);
  required<HTMLInputElement>("destination-place-search").placeholder =
    copy().search;
  text("destination-places-more", copy().more);
  text("destination-skip", copy().skip);
  text("destination-language-label", copy().language);
  required<HTMLSelectElement>("destination-language").value = locale;
  required("destination-language").setAttribute(
    "aria-label",
    copy().selectLanguage,
  );
  required("destination-map-region").setAttribute("aria-label", copy().map);
  required("destination-map").setAttribute("aria-label", copy().mapInteractive);
  required("destination-places-region").setAttribute(
    "aria-label",
    copy().publishedPlaces,
  );
  text("destination-footer-note", copy().footer);
  text("destination-name", destination?.name ?? copy().destinationLabel);
  document.title = `${destination?.name ?? copy().headline} — Touristic Digital Platform`;
  document
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.setAttribute("content", copy().description);
  text(
    "destination-status",
    contextState === "ready"
      ? copy().ready
      : contextState === "unavailable"
        ? copy().failed
        : copy().contextLoading,
  );
  renderMapState();
  renderDetail();
  showPlaces();
}

function showPlaces(): void {
  const list = required<HTMLUListElement>("destination-places");
  list.replaceChildren();
  const filtered = allPlaces.filter((place) => {
    const phrase = `${place.name} ${place.category}`.toLocaleLowerCase(
      selectedLocale,
    );
    return phrase.includes(searchTerm.toLocaleLowerCase(selectedLocale));
  });
  for (const place of filtered) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.placeId = place.id;
    const name = document.createElement("strong");
    name.textContent = place.name;
    const category = document.createElement("small");
    category.textContent = place.category;
    button.append(name, category);
    button.addEventListener("click", () => void openPlace(place));
    item.appendChild(button);
    list.appendChild(item);
  }
  text("destination-places-count", String(filtered.length));
  if (contextState === "unavailable") {
    text("destination-places-status", copy().failed);
  } else if (contextState === "loading" || loadingPlaces) {
    text("destination-places-status", copy().searching);
  } else if (placePageFailed) {
    text("destination-places-status", copy().failed);
  } else if (allPlaces.length === 0 && !loadingPlaces && loadedPages > 0) {
    text("destination-places-status", copy().empty);
  } else if (filtered.length === 0 && !loadingPlaces) {
    text("destination-places-status", copy().empty);
  } else if (!loadingPlaces) {
    text("destination-places-status", "");
  }
}

function renderMapState(): void {
  text(
    "destination-map-status",
    mapState === "ready"
      ? copy().mapReady
      : mapState === "unavailable"
        ? copy().mapUnavailable
        : copy().mapLoading,
  );
}

function destroyMapEngine(): void {
  const engine = mapEngine;
  mapEngine = null;
  if (engine) void engine.destroy().catch(() => undefined);
}

function updateMarkers(): void {
  if (!destination || !mapEngine || mapState !== "ready") return;
  const readiness = mapReadiness;
  const markers = trustedPublicMapMarkers(
    allPlaces,
    destinationPublicBoundingBox(destination),
  );
  void mapEngine.replaceMarkers(markers).catch(() => {
    readiness?.fail();
  });
}

async function loadPlacesPage(): Promise<void> {
  if (!destination || loadingPlaces || loadedPages >= 20) return;
  if (loadedPages > 0 && !nextCursor) return;
  loadingPlaces = true;
  text("destination-places-status", copy().searching);
  try {
    const page = await client.listMap({
      destinationId: destination.id,
      bbox: destinationPublicBoundingBox(destination),
      zoom: 12,
      ...(nextCursor ? { cursor: nextCursor } : {}),
    });
    placePageFailed = false;
    for (const place of page.items) {
      if (seenPlaceIds.has(place.id)) continue;
      seenPlaceIds.add(place.id);
      allPlaces.push(place);
    }
    loadedPages++;
    const candidateCursor = page.nextCursor;
    if (!candidateCursor || seenCursors.has(candidateCursor)) {
      nextCursor = null;
    } else {
      seenCursors.add(candidateCursor);
      nextCursor = candidateCursor;
    }
  } catch {
    placePageFailed = true;
    text("destination-places-status", copy().failed);
    return;
  } finally {
    loadingPlaces = false;
    required<HTMLButtonElement>("destination-places-more").hidden =
      !nextCursor || loadedPages >= 20;
    showPlaces();
    updateMarkers();
  }
}

function renderDetail(): void {
  const holder = required<HTMLElement>("destination-place-detail");
  holder.hidden = detailState.status === "hidden";
  holder.replaceChildren();
  if (detailState.status === "hidden") return;
  if (detailState.status !== "ready") {
    const status = document.createElement("p");
    status.textContent =
      detailState.status === "loading"
        ? copy().loadingDetail
        : copy().detailUnavailable;
    holder.appendChild(status);
    return;
  }
  const { detail } = detailState;
  const heading = document.createElement("h3");
  heading.textContent = detail.profile.name;
  const category = document.createElement("p");
  category.textContent = String(detail.profile.categoryId);
  const link = document.createElement("a");
  const url = new URL("https://www.openstreetmap.org/");
  url.searchParams.set("mlat", String(detail.profile.location.latitude));
  url.searchParams.set("mlon", String(detail.profile.location.longitude));
  url.searchParams.set("zoom", "16");
  link.href = url.toString();
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  link.textContent = copy().directions;
  holder.append(heading, category, link);
}

async function openPlace(place: PublicPlaceMapItem): Promise<void> {
  const revision = ++selectionRevision;
  const requestedDestinationId = destination?.id;
  const requestedPlaceId = place.id;
  const isCurrent = (): boolean =>
    pageActive &&
    revision === selectionRevision &&
    destination?.id === requestedDestinationId;
  detailState = { status: "loading" };
  renderDetail();
  try {
    if (!requestedDestinationId) throw new Error("PLACE_NOT_FOUND");
    const detail = await client.getDetail(requestedPlaceId, {
      locale: selectedLocale,
    });
    if (!isCurrent()) return;
    if (!detail) throw new Error("PLACE_NOT_FOUND");
    assertPublicDetailDestination(
      detail,
      requestedDestinationId,
      requestedPlaceId,
    );
    detailState = { status: "ready", detail };
    renderDetail();
  } catch {
    if (!isCurrent()) return;
    detailState = { status: "unavailable" };
    renderDetail();
  }
}

async function loadMap(): Promise<void> {
  mapReadiness?.dispose();
  mapReadiness = null;
  destroyMapEngine();
  mapState = "loading";
  renderMapState();
  if (!pageActive || !destination || destination.modules.map !== true) {
    mapState = "unavailable";
    renderMapState();
    return;
  }
  const env =
    (window as Window & PublicEnvironment).__MORRO_RUNTIME_ENV__ ?? {};
  const accessToken = env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
  if (!/^pk\.[a-zA-Z0-9._-]+$/u.test(accessToken)) {
    mapState = "unavailable";
    renderMapState();
    return;
  }
  // The deadline includes SDK loading and initialization, not just native load.
  const readiness = createDestinationMapReadiness((state) => {
    if (!pageActive || mapReadiness !== readiness) return;
    mapState = state;
    renderMapState();
    if (state === "unavailable") destroyMapEngine();
    if (state === "ready") updateMarkers();
  });
  mapReadiness = readiness;
  try {
    const sdk = await loadMapboxGlSdk({ document, window });
    if (!readiness.active) return;
    const destinationCore = toCoreDestinationConfig(destination);
    const initialize = createMorroGeospatialInitializer({
      sdk,
      destination: destinationCore,
      accessToken,
      containerId: "destination-map",
      style: env.VITE_MAPBOX_STYLE || "mapbox://styles/mapbox/streets-v12",
      zoom: 12,
      attributionControl: true,
      onMapCreated: readiness.onMapCreated,
    });
    const engine = await initialize(
      new EventBus({ destinationId: destinationCore.id }),
    );
    if (!readiness.active) {
      await engine.destroy();
      return;
    }
    mapEngine = engine;
    updateMarkers();
  } catch {
    readiness.fail();
  }
}

async function start(): Promise<void> {
  const main = required<HTMLElement>("destination-main");
  const language = required<HTMLSelectElement>("destination-language");
  language.addEventListener("change", () =>
    updateLocale(localeChoice(language.value)),
  );
  updateLocale(selectedLocale);
  window.addEventListener("pagehide", () => {
    pageActive = false;
    selectionRevision++;
    mapReadiness?.dispose();
    destroyMapEngine();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    pageActive = true;
    if (detailState.status === "loading")
      detailState = { status: "unavailable" };
    renderDetail();
    if (contextState === "ready") void loadMap();
  });
  try {
    const resolved = await loadPublicDestination(
      fetch,
      window.location.pathname,
    );
    if (resolved.source !== "destination-owner") {
      throw new Error("NON_OWNER_DESTINATION_CONTEXT_DENIED");
    }
    destination = resolved.destination;
    contextState = "ready";
    document.documentElement.dataset.destinationTheme = destination.id;
    text("destination-name", destination.name);
    document.title = `${destination.name} — Touristic Digital Platform`;
    const brand = BRAND_ASSETS[destination.id];
    if (brand) required<HTMLImageElement>("destination-brand").src = brand;
    const search = required<HTMLInputElement>("destination-place-search");
    search.disabled = false;
    search.addEventListener("input", () => {
      searchTerm = search.value.trim();
      showPlaces();
    });
    required<HTMLButtonElement>("destination-places-more").addEventListener(
      "click",
      () => void loadPlacesPage(),
    );
    updateLocale(selectedLocale);
    main.setAttribute("aria-busy", "false");
    await Promise.allSettled([loadMap(), loadPlacesPage()]);
  } catch {
    main.setAttribute("aria-busy", "false");
    contextState = "unavailable";
    mapState = "unavailable";
    detailState = { status: "hidden" };
    required<HTMLDivElement>("destination-map").hidden = true;
    updateLocale(selectedLocale);
  }
}

void start();
