import {
  getAssistantMainMenu,
  normalizeAssistantVoiceLanguage,
  type AssistantLocale,
} from "@touristic/assistant";
import { requestAssistantOpen } from "../assistant/assistant-shell-ui.js";
import type {
  GeospatialEngine,
  MapboxGlMapLike,
  MapMarker,
} from "@touristic/geospatial";
import {
  morroV1SearchCatalog,
  normalizeSearchText,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

import {
  createV1ImmersiveTourController,
  type V1ImmersiveTourController,
} from "./immersive-tour-v1-controller.js";
import { getV1ExplorePlaceActionOptions } from "./explore-location-actions-v1.js";
import { getV1ExploreLabel, getV1ExploreUiCopy } from "./explore-v1-i18n.js";
import {
  installExploreFlowBottomSheet,
  type ExploreFlowBottomSheetController,
} from "./explore-flow-bottom-sheet.js";
import { createPublicPlaceMapClient } from "./public-place-map-client-v2.js";
import {
  filterV1ExploreLocations,
  getV1ExploreSubcategoryOptions,
  sortV1ExploreNearby,
  type V1ExploreOption,
} from "./explore-locations-v1-flow.js";

const DETAILS_COMMAND_PREFIX = "Fale sobre ";
const ASSISTANT_CATEGORY_ID_PREFIX = "assistant-category-";
const ASSISTANT_FLOW_RESULTS_ID = "assistant-category-results";
const ASSISTANT_FLOW_MESSAGE_ID = "assistant-category-results-message";
const TOUR_ROUTE_SOURCE = "tour-route-source";
const TOUR_ROUTE_LAYER = "tour-route-layer";
const TOUR_ROUTE_OUTLINE = "tour-route-outline";
const TOUR_ACTIVATION_TIMEOUT_MS = 20_000;
const UNREGISTERED_COMMERCIAL_ACTION_IDS = new Set([
  "restaurant.menu",
  "restaurant.reserve",
  "nightlife.tickets",
  "nightlife.menu",
  "hotel.accommodations",
  "hotel.reserve",
  "tour.reserve",
  "transport.request",
  "transport.ticket",
  "shop.products",
  "place.whatsapp",
]);

const CANONICAL_MAP_DESTINATION_ID = "morro-de-sao-paulo";
const CANONICAL_MAP_BBOX = Object.freeze([
  -39.05, -13.5, -38.89, -13.35,
] as const);
const CANONICAL_MAP_ZOOM = 13;

interface PlaceRuntimeEnvironmentGlobal {
  readonly __MORRO_RUNTIME_ENV__?: Readonly<{
    VITE_PLACE_PLATFORM_AVAILABLE?: string;
  }>;
}

function canonicalPlaceRuntimeAvailable(): boolean {
  return (
    (globalThis as typeof globalThis & PlaceRuntimeEnvironmentGlobal)
      .__MORRO_RUNTIME_ENV__?.VITE_PLACE_PLATFORM_AVAILABLE === "true"
  );
}

type ExploreStage = "menu" | "filters" | "places" | "detail" | "tour";

export interface ExploreSearchResult {
  readonly name: string;
  readonly category: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly area?: string;
  readonly description?: string;
  readonly source: "canonical" | "local" | "mapbox";
  readonly placeId?: string;
}

type ExploreMapLocation = MorroV1SearchCatalogItem | ExploreSearchResult;

type ExploreRuntimeStatusDescriptor =
  | Readonly<{ kind: "selected"; place: string }>
  | Readonly<{ kind: "map-error"; error: unknown }>;

export interface ExploreLocationsCategory {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export type ExploreLocationsCommand =
  | Readonly<{ type: "open_category"; category: string }>
  | Readonly<{ type: "apply_option"; value: string }>
  | Readonly<{ type: "show_all" }>
  | Readonly<{ type: "show_nearby" }>
  | Readonly<{
      type: "select_place";
      place: string;
      category?: string;
    }>
  | Readonly<{ type: "map_filter_category"; category: string }>
  | Readonly<{ type: "show_all_locations" }>
  | Readonly<{
      type: "show_search_results";
      query: string;
      status?: "ready" | "empty" | "error";
      statusText?: string;
      results: readonly ExploreSearchResult[];
    }>
  | Readonly<{ type: "back_from_place" }>
  | Readonly<{ type: "back_to_filters" }>
  | Readonly<{ type: "back_to_menu" }>;

export interface ExploreActiveTourSnapshot {
  readonly tourId: string;
  readonly stage: "intro" | "list" | "stop" | "finale";
  readonly currentStopIndex: number;
  readonly totalStops: number;
}

export interface ExploreLocationsStateSnapshot {
  readonly category: string | null;
  readonly place: string | null;
  readonly source: "canonical" | "local" | "mapbox" | "legacy" | null;
  readonly stage: ExploreStage;
  readonly markerCount: number;
  readonly sheetState: "peek" | "half" | "full" | null;
  readonly tour: ExploreActiveTourSnapshot | null;
}

export interface ExploreLocationsControlOptions {
  readonly document: Document;
}

export interface ExploreLocationsControl {
  execute(command: ExploreLocationsCommand): Promise<boolean>;
  getState(): ExploreLocationsStateSnapshot;
  close(): void;
  setGeospatialEngine(engine: GeospatialEngine | undefined): void;
  destroy(): void;
}

interface MapboxCompatibilityGlobal {
  readonly mapboxPrimaryInstance?: MapboxGlMapLike;
}

type ImmersiveTourMapLike = Omit<MapboxGlMapLike, "flyTo"> & {
  flyTo?: (options: {
    readonly center: [number, number];
    readonly zoom?: number;
    readonly pitch?: number;
    readonly bearing?: number;
    readonly duration?: number;
    readonly essential?: boolean;
  }) => void;
};

const categoryValues = new Set(
  morroV1SearchCatalog.map((location) => location.category),
);

export function getExploreLocationsCategories(
  locale: AssistantLocale = "pt",
): readonly ExploreLocationsCategory[] {
  return Object.freeze(
    getAssistantMainMenu(locale)
      .filter((item) => categoryValues.has(item.value))
      .map((item) => ({
        value: item.value,
        label: item.label,
        count: morroV1SearchCatalog.filter(
          (location) => location.category === item.value,
        ).length,
      })),
  );
}

export function getExploreLocationsForCategory(
  category: string,
): readonly MorroV1SearchCatalogItem[] {
  return morroV1SearchCatalog.filter(
    (location) => location.category === category,
  );
}

export function resolveExploreLocationByName(
  place: string,
  category?: string,
): MorroV1SearchCatalogItem | undefined {
  const normalizedPlace = normalizeSearchText(place);
  const normalizedCategory = category ? normalizeSearchText(category) : null;
  return morroV1SearchCatalog.find(
    (candidate) =>
      normalizeSearchText(candidate.name) === normalizedPlace &&
      (normalizedCategory === null ||
        normalizeSearchText(candidate.category) === normalizedCategory),
  );
}

export function createExploreLocationDetailsCommand(name: string): string {
  return `${DETAILS_COMMAND_PREFIX}${name}`;
}

export function getAssistantCategoryButtonId(category: string): string {
  return `${ASSISTANT_CATEGORY_ID_PREFIX}${category}`;
}

function currentMap(): MapboxGlMapLike | undefined {
  return (globalThis as typeof globalThis & MapboxCompatibilityGlobal)
    .mapboxPrimaryInstance;
}

function clearTourPresentation(document: Document): void {
  const map = currentMap();
  if (map?.getLayer?.(TOUR_ROUTE_LAYER)) map.removeLayer?.(TOUR_ROUTE_LAYER);
  if (map?.getLayer?.(TOUR_ROUTE_OUTLINE)) {
    map.removeLayer?.(TOUR_ROUTE_OUTLINE);
  }
  if (map?.getSource?.(TOUR_ROUTE_SOURCE)) {
    map.removeSource?.(TOUR_ROUTE_SOURCE);
  }

  const tourSelect = document.getElementById("tour-select");
  if (tourSelect instanceof HTMLSelectElement) tourSelect.selectedIndex = -1;
  document.dispatchEvent(new CustomEvent("morro:tour-selection-reset"));
}

function markerForLocation(
  location: ExploreMapLocation,
  index: number,
  openPopup = false,
): MapMarker {
  const canonicalPlaceId =
    "placeId" in location && typeof location.placeId === "string"
      ? location.placeId.trim()
      : "";
  return Object.freeze({
    id:
      canonicalPlaceId ||
      ("id" in location ? location.id?.trim() : undefined) ||
      `explore:${location.category}:${index}:${location.name}`,
    position: Object.freeze({
      latitude: location.latitude,
      longitude: location.longitude,
    }),
    label: location.name,
    ...(openPopup ? { openPopup: true } : {}),
  });
}

const TOUR_DISCOVERY_CLUSTER_RADIUS_DEGREES = 0.0017;

function tourDiscoveryClusterLabel(
  count: number,
  locale: AssistantLocale,
): string {
  if (locale === "pt") return `${count} passeios`;
  if (locale === "es") return `${count} paseos`;
  if (locale === "he") return `${count} סיורים`;
  return `${count} tours`;
}

function clusterTourDiscoveryMarkers(
  locations: readonly ExploreMapLocation[],
  locale: AssistantLocale,
): readonly MapMarker[] {
  const clusters: ExploreMapLocation[][] = [];

  for (const location of locations) {
    const existing = clusters.find((cluster) => {
      const latitude =
        cluster.reduce((total, item) => total + item.latitude, 0) /
        cluster.length;
      const longitude =
        cluster.reduce((total, item) => total + item.longitude, 0) /
        cluster.length;
      return (
        Math.hypot(
          location.latitude - latitude,
          location.longitude - longitude,
        ) <= TOUR_DISCOVERY_CLUSTER_RADIUS_DEGREES
      );
    });
    if (existing) existing.push(location);
    else clusters.push([location]);
  }

  return Object.freeze(
    clusters.map((cluster, index) => {
      const first = cluster[0];
      if (!first) throw new Error("Tour discovery cluster cannot be empty.");
      if (cluster.length === 1) return markerForLocation(first, index);

      const latitude =
        cluster.reduce((total, item) => total + item.latitude, 0) /
        cluster.length;
      const longitude =
        cluster.reduce((total, item) => total + item.longitude, 0) /
        cluster.length;
      return Object.freeze({
        id: `explore:tours:cluster:${cluster.length}:${index}`,
        position: Object.freeze({ latitude, longitude }),
        label: tourDiscoveryClusterLabel(cluster.length, locale),
      });
    }),
  );
}

function describeExploreError(error: unknown, locale: AssistantLocale): string {
  return error instanceof Error
    ? error.message
    : getV1ExploreUiCopy(locale).mapUnknown;
}

function assistantMessagesArea(document: Document): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
}

function removeAssistantFlowResults(document: Document): void {
  document.getElementById(ASSISTANT_FLOW_RESULTS_ID)?.remove();
  document.getElementById(ASSISTANT_FLOW_MESSAGE_ID)?.remove();
}

function categoryBounds(
  locations: readonly ExploreMapLocation[],
): [[number, number], [number, number]] | null {
  if (locations.length === 0) return null;
  const longitudes = locations.map((location) => location.longitude);
  const latitudes = locations.map((location) => location.latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

function unifiedDockBottomPadding(document: Document, fallback = 260): number {
  const dock = document.getElementById("unified-assistant-dock");
  const viewportHeight =
    document.defaultView?.innerHeight ?? document.documentElement.clientHeight;
  const dockHeight = dock?.offsetHeight ?? 0;
  if (dockHeight <= 0) return fallback;
  return Math.min(
    Math.max(180, viewportHeight * 0.58),
    Math.max(fallback, dockHeight + 40),
  );
}

function categoryCenter(
  locations: readonly ExploreMapLocation[],
): { latitude: number; longitude: number } | null {
  if (locations.length === 0) return null;
  const latitude =
    locations.reduce((total, location) => total + location.latitude, 0) /
    locations.length;
  const longitude =
    locations.reduce((total, location) => total + location.longitude, 0) /
    locations.length;
  return { latitude, longitude };
}

function frameLocationsOnMap(
  document: Document,
  locations: readonly ExploreMapLocation[],
  geospatialEngine: GeospatialEngine | undefined,
): void {
  const map = currentMap();
  if (locations.length === 1) {
    const location = locations[0];
    if (!location) return;
    if (map?.flyTo) {
      const paddedMap = map as typeof map & {
        flyTo(options: {
          center: [number, number];
          zoom?: number;
          duration?: number;
          essential?: boolean;
          padding?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
          };
        }): void;
      };
      paddedMap.flyTo({
        center: [location.longitude, location.latitude],
        zoom: 16,
        duration: 650,
        essential: true,
        padding: {
          top: 120,
          bottom: unifiedDockBottomPadding(document),
          left: 56,
          right: 56,
        },
      });
    } else if (map) {
      map.setCenter([location.longitude, location.latitude]);
      map.setZoom?.(16);
    } else if (geospatialEngine?.initialized) {
      void geospatialEngine.setCenter({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }
    return;
  }

  const bounds = categoryBounds(locations);
  if (bounds && map?.fitBounds) {
    map.fitBounds(bounds, {
      padding: {
        top: 120,
        bottom: unifiedDockBottomPadding(document),
        left: 56,
        right: 56,
      },
      duration: 650,
      essential: true,
    });
    return;
  }

  const center = categoryCenter(locations);
  if (!center) return;
  if (geospatialEngine?.initialized) {
    void geospatialEngine.setCenter(center);
  } else {
    map?.setCenter([center.longitude, center.latitude]);
  }
}

const TICKETING_OFFER_ID = /^[A-Za-z0-9_-]{3,120}$/u;

function ticketingPlaceKey(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function tourTicketingUrl(value: string, placeName: string): string | null {
  if (value.startsWith("commerce:offer:")) {
    const id = value.slice("commerce:offer:".length);
    return TICKETING_OFFER_ID.test(id)
      ? `/tour-booking.html?offer=${encodeURIComponent(id)}&source=map&mode=tour`
      : null;
  }

  if (value.startsWith("commerce:offers:")) {
    const rawIds = value.slice("commerce:offers:".length).split(",");
    if (
      rawIds.length === 0 ||
      rawIds.some((id) => !TICKETING_OFFER_ID.test(id))
    ) {
      return null;
    }
    return `/tour-booking.html?offers=${rawIds
      .map(encodeURIComponent)
      .join(",")}&source=map&mode=tour`;
  }

  const placeKey = ticketingPlaceKey(placeName);
  return placeKey
    ? `/tour-booking.html?place=${encodeURIComponent(placeKey)}&source=map&mode=tour`
    : null;
}

function isBackToMenuValue(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return [
    "voltar ao menu",
    "voltar ao menu principal",
    "back to main menu",
    "volver al menu",
    "volver al menu principal",
    "חזרה לתפריט",
    "חזורה לתפריט",
  ].includes(normalized);
}

function getCurrentPosition(
  document: Document,
): Promise<Readonly<{ latitude: number; longitude: number }> | null> {
  const geolocation = document.defaultView?.navigator.geolocation;
  if (!geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) =>
        resolve(
          Object.freeze({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        ),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
  });
}

export function installExploreLocationsControl({
  document,
}: ExploreLocationsControlOptions): ExploreLocationsControl {
  const submenu = document.getElementById("submenu");
  const submenuContainer = document.getElementById("submenuContainer");

  document.getElementById("controls")?.remove();
  submenu?.classList.add("hidden");
  submenu?.setAttribute("aria-hidden", "true");
  submenuContainer?.replaceChildren();

  let geospatialEngine: GeospatialEngine | undefined;
  let activeCategoryButton: HTMLButtonElement | undefined;
  let activeCategory: ExploreLocationsCategory | undefined;
  let activePlace: string | undefined;
  let activePlaceLocation: ExploreMapLocation | undefined;
  let activePlaceActionValues: readonly string[] = Object.freeze([]);
  let activeStage: ExploreStage = "menu";
  let visibleLocations: readonly ExploreMapLocation[] = Object.freeze([]);
  let activeSearchQuery = "";
  let mainMenuContainer: HTMLElement | undefined;
  let interactionGeneration = 0;
  let immersiveTourController: V1ImmersiveTourController | undefined;
  let exploreFlowBottomSheet: ExploreFlowBottomSheetController | undefined;
  let placeReturnLocations: readonly ExploreMapLocation[] = Object.freeze([]);
  let placeReturnMessage = "";
  let placeReturnIsSearch = false;
  const categoryListeners = new Map<HTMLButtonElement, EventListener>();
  const currentLocale = (): AssistantLocale =>
    normalizeAssistantVoiceLanguage(document.documentElement.lang);
  const currentCategories = (): readonly ExploreLocationsCategory[] =>
    getExploreLocationsCategories(currentLocale());

  const contextualRail = document.getElementById("assistant-category-rail");
  const contextualRailBack =
    contextualRail?.querySelector<HTMLButtonElement>(
      "[data-context-rail-back]",
    ) ?? null;
  const contextualRailScroll =
    contextualRail?.querySelector<HTMLElement>(
      ".md-assistant-category-scroll",
    ) ?? null;
  const categoryRailTemplate = contextualRailScroll?.cloneNode(
    true,
  ) as HTMLElement | null;

  const restoreCategoryRail = (): HTMLButtonElement | null => {
    if (!contextualRail || !contextualRailScroll || !categoryRailTemplate) {
      return null;
    }
    contextualRailScroll.replaceChildren(
      ...Array.from(categoryRailTemplate.childNodes, (node) =>
        node.cloneNode(true),
      ),
    );
    contextualRail.dataset.railStage = "menu";
    contextualRail.removeAttribute("data-context-category");
    contextualRail.removeAttribute("data-context-place");
    contextualRail.setAttribute("aria-label", "Categorias do assistente");
    if (contextualRailBack) {
      contextualRailBack.hidden = true;
      contextualRailBack.onclick = null;
      contextualRailBack.removeAttribute("data-value");
      contextualRailBack.removeAttribute("data-explore-action");
      contextualRailBack.removeAttribute("data-context-rail-option");
    }

    for (const category of currentCategories()) {
      const button = contextualRailScroll.querySelector<HTMLButtonElement>(
        `[data-assistant-category="${category.value}"]`,
      );
      const label = button?.querySelector<HTMLElement>(
        ".md-assistant-category-label",
      );
      if (label) label.textContent = category.label;
      button?.setAttribute("aria-pressed", "false");
    }
    contextualRailScroll.scrollLeft = 0;
    return contextualRailScroll.querySelector<HTMLButtonElement>(
      "[data-assistant-category]",
    );
  };

  const renderContextualRail = <
    T extends Readonly<{
      label: string;
      value: string;
      action?: string;
      disabled?: boolean;
      location?: ExploreMapLocation;
      tourId?: string;
    }>,
  >(
    stage: ExploreStage,
    accessibleLabel: string,
    options: readonly T[],
    onSelect: (option: T) => void,
  ): HTMLButtonElement | null => {
    if (!contextualRail || !contextualRailScroll) return null;

    contextualRail.dataset.railStage = stage;
    if (activeCategory?.value) {
      contextualRail.dataset.contextCategory = activeCategory.value;
    } else {
      contextualRail.removeAttribute("data-context-category");
    }
    if (activePlace) {
      contextualRail.dataset.contextPlace = activePlace;
    } else {
      contextualRail.removeAttribute("data-context-place");
    }
    contextualRail.setAttribute("aria-label", accessibleLabel);

    const railKind =
      stage === "places"
        ? "place"
        : stage === "detail"
          ? "action"
          : stage === "filters"
            ? "filter"
            : "category";

    const backOption = options.find((option) => {
      const action = option.action ?? "command";
      return action.startsWith("back-") || action === "back-menu";
    });

    if (contextualRailBack) {
      if (backOption && stage !== "menu") {
        const backAction = backOption.action ?? "back-menu";
        contextualRailBack.hidden = false;
        contextualRailBack.dataset.contextRailOption = "true";
        contextualRailBack.dataset.value = backOption.value;
        contextualRailBack.dataset.exploreAction = backAction;
        contextualRailBack.setAttribute(
          "aria-label",
          getV1ExploreLabel("back", currentLocale()),
        );
        contextualRailBack.title = getV1ExploreLabel("back", currentLocale());
        contextualRailBack.onclick = (event) => {
          event.stopImmediatePropagation();
          onSelect(backOption);
        };
      } else {
        contextualRailBack.hidden = true;
        contextualRailBack.onclick = null;
        contextualRailBack.removeAttribute("data-value");
        contextualRailBack.removeAttribute("data-explore-action");
        contextualRailBack.removeAttribute("data-context-rail-option");
      }
    }

    const buttons: HTMLButtonElement[] = [];
    for (const option of options) {
      const action = option.action ?? "command";
      if (action.startsWith("back-") || action === "back-menu") continue;

      const button = document.createElement("button");
      const railVariant = action === "primary" ? "primary" : "secondary";
      button.type = "button";
      button.className = `md-assistant-category-chip md-assistant-context-chip assistant-option-btn md-context-rail-button md-context-rail-button--${railKind}`;
      button.dataset.contextRailOption = "true";
      button.dataset.railKind = railKind;
      button.dataset.railVariant = railVariant;
      button.dataset.value = option.value;
      button.dataset.exploreAction = action;
      if (option.location) {
        button.dataset.locationName = option.location.name;
        button.dataset.locationCategory = option.location.category;
      }
      if (option.tourId) button.dataset.tourId = option.tourId;
      button.disabled = option.disabled === true;
      button.setAttribute("aria-disabled", String(button.disabled));

      const label = document.createElement("span");
      label.className =
        "md-assistant-category-label md-assistant-context-label";
      label.textContent = option.label;
      button.appendChild(label);
      button.addEventListener("click", (event) => {
        event.stopImmediatePropagation();
        if (!button.disabled) onSelect(option);
      });
      buttons.push(button);
    }

    contextualRailScroll.replaceChildren(...buttons);
    contextualRailScroll.scrollLeft = 0;
    if (contextualRailBack && !contextualRailBack.hidden) {
      contextualRail.append(contextualRailBack);
    }
    return buttons[0] ?? null;
  };

  let exploreRuntimeStatusDescriptor:
    ExploreRuntimeStatusDescriptor | undefined;

  const renderExploreRuntimeStatus = (): void => {
    const descriptor = exploreRuntimeStatusDescriptor;
    const statusElement = document.getElementById("runtime-status");
    if (!descriptor || !statusElement) return;

    const copy = getV1ExploreUiCopy(currentLocale());
    statusElement.dataset.statusOwner = "explore";
    statusElement.replaceChildren(
      document.createTextNode(
        descriptor.kind === "selected"
          ? copy.selected(descriptor.place)
          : copy.mapCategoryError(
              describeExploreError(descriptor.error, currentLocale()),
            ),
      ),
    );
  };

  const setExploreRuntimeStatus = (
    descriptor: ExploreRuntimeStatusDescriptor,
  ): void => {
    exploreRuntimeStatusDescriptor = Object.freeze(descriptor);
    renderExploreRuntimeStatus();
  };

  const clearExploreRuntimeStatus = (): void => {
    exploreRuntimeStatusDescriptor = undefined;
    const statusElement = document.getElementById("runtime-status");
    if (statusElement?.dataset.statusOwner !== "explore") return;
    delete statusElement.dataset.statusOwner;
    document.dispatchEvent(new CustomEvent("morro:runtime-status-refresh"));
  };

  const stateSnapshot = (): ExploreLocationsStateSnapshot => {
    const tourState = immersiveTourController?.getState();
    const tour =
      activeStage === "tour" &&
      tourState &&
      tourState.stage !== "idle" &&
      tourState.tourId
        ? Object.freeze({
            tourId: tourState.tourId,
            stage: tourState.stage,
            currentStopIndex: tourState.currentStopIndex,
            totalStops: tourState.totalStops,
          })
        : null;

    return Object.freeze({
      category:
        activeCategory?.value ??
        (activeStage === "detail"
          ? (activePlaceLocation?.category ?? null)
          : null),
      place: activeStage === "detail" ? (activePlace ?? null) : null,
      source:
        activeStage === "detail" && activePlaceLocation
          ? "source" in activePlaceLocation
            ? activePlaceLocation.source
            : "legacy"
          : null,
      stage: activeStage,
      markerCount: Number(
        document.getElementById("map")?.dataset.mapMarkerCount ?? "0",
      ),
      sheetState:
        activeStage === "filters" || activeStage === "places"
          ? (exploreFlowBottomSheet?.getState() ?? null)
          : null,
      tour,
    });
  };

  const emitStateChange = (): void => {
    document.dispatchEvent(
      new CustomEvent("morro:explore-state-changed", {
        detail: stateSnapshot(),
      }),
    );
  };

  const updateMapState = (
    count: number,
    category?: string,
    state: "loading" | "ready" | "error" = "ready",
  ): void => {
    const mapElement = document.getElementById("map");
    mapElement?.setAttribute("data-map-marker-count", String(count));
    mapElement?.removeAttribute("data-active-tour");
    mapElement?.setAttribute("data-tour-state", "idle");
    mapElement?.setAttribute("data-explore-state", state);
    if (category) {
      mapElement?.setAttribute("data-explore-category", category);
    } else {
      mapElement?.removeAttribute("data-explore-category");
    }
    mapElement?.setAttribute("data-explore-stage", activeStage);
    if (activeStage === "detail" && activePlace) {
      mapElement?.setAttribute("data-explore-place", activePlace);
    } else {
      mapElement?.removeAttribute("data-explore-place");
    }
  };

  const renderLocationsOnMap = async (
    locations: readonly ExploreMapLocation[],
    category: string,
    openSelectedPopup = false,
  ): Promise<void> => {
    const generation = interactionGeneration;
    const categoryAtStart = activeCategory?.value;
    visibleLocations = Object.freeze([...locations]);

    const setSheetStatus = (
      status: "loading" | "ready" | "empty" | "error",
      text?: string,
    ): void => {
      if (activeStage === "filters" || activeStage === "places") {
        exploreFlowBottomSheet?.setStatus(status, text);
      }
    };

    if (locations.length === 0) {
      updateMapState(0, category, "ready");
      setSheetStatus("empty");
      if (geospatialEngine?.initialized) {
        await geospatialEngine.replaceMarkers([]).catch(() => undefined);
      }
      emitStateChange();
      return;
    }

    const renderedMarkers =
      category === "tours" && activeStage === "filters"
        ? clusterTourDiscoveryMarkers(locations, currentLocale())
        : locations.map((location, index) =>
            markerForLocation(
              location,
              index,
              openSelectedPopup && locations.length === 1,
            ),
          );

    setSheetStatus("loading");
    if (!geospatialEngine?.initialized) {
      updateMapState(renderedMarkers.length, category, "error");
      setSheetStatus(
        "error",
        getV1ExploreUiCopy(currentLocale()).mapCategoryError(
          getV1ExploreUiCopy(currentLocale()).mapUnknown,
        ),
      );
      emitStateChange();
      return;
    }

    updateMapState(renderedMarkers.length, category, "loading");
    try {
      await geospatialEngine.replaceMarkers(renderedMarkers);
      if (
        generation !== interactionGeneration ||
        (categoryAtStart !== undefined &&
          activeCategory?.value !== categoryAtStart)
      ) {
        return;
      }
      updateMapState(renderedMarkers.length, category, "ready");
      if (openSelectedPopup && locations.length === 1) {
        const selectedMarker = document.querySelector<HTMLElement>(
          '.morro-explore-marker[data-morro-explore-marker="true"]:not([data-discover-initial-poi="true"])',
        );
        selectedMarker?.setAttribute("data-selected", "true");
        selectedMarker?.setAttribute("aria-current", "location");
      }
      frameLocationsOnMap(document, locations, geospatialEngine);
      setSheetStatus("ready");
      emitStateChange();
    } catch (error) {
      if (generation !== interactionGeneration) return;
      updateMapState(0, category, "error");
      try {
        await geospatialEngine.replaceMarkers([]);
      } catch {
        // Preserve the first provider failure for diagnostics.
      }
      const message = getV1ExploreUiCopy(currentLocale()).mapCategoryError(
        describeExploreError(error, currentLocale()),
      );
      setSheetStatus("error", message);
      emitStateChange();
      setExploreRuntimeStatus({ kind: "map-error", error });
    }
  };

  const loadHybridGlobalMarkers = async (): Promise<void> => {
    if (
      !geospatialEngine?.initialized ||
      !canonicalPlaceRuntimeAvailable() ||
      activeStage !== "menu" ||
      visibleLocations.length > 0
    ) {
      return;
    }

    const browserFetch = document.defaultView?.fetch?.bind(
      document.defaultView,
    );
    if (!browserFetch) return;

    const generation = interactionGeneration;
    try {
      const client = createPublicPlaceMapClient(browserFetch);
      const canonicalLocations: ExploreSearchResult[] = [];
      let cursor: string | null = null;
      let pageCount = 0;

      do {
        const page = await client.listMap({
          destinationId: CANONICAL_MAP_DESTINATION_ID,
          bbox: CANONICAL_MAP_BBOX,
          zoom: CANONICAL_MAP_ZOOM,
          ...(cursor ? { cursor } : {}),
        });
        canonicalLocations.push(
          ...page.items.map((item) =>
            Object.freeze({
              name: item.name,
              category: String(item.category),
              latitude: item.lat,
              longitude: item.lng,
              source: "canonical" as const,
              placeId: String(item.id),
            }),
          ),
        );
        cursor = page.nextCursor;
        pageCount += 1;
      } while (cursor && pageCount < 20);

      if (
        generation !== interactionGeneration ||
        activeStage !== "menu" ||
        visibleLocations.length > 0
      ) {
        return;
      }

      const canonicalKeys = new Set(
        canonicalLocations.map(
          (location) =>
            `${normalizeSearchText(location.category)}:${normalizeSearchText(location.name)}`,
        ),
      );
      const legacyFallback = morroV1SearchCatalog.filter(
        (location) =>
          !canonicalKeys.has(
            `${normalizeSearchText(location.category)}:${normalizeSearchText(location.name)}`,
          ),
      );

      await renderLocationsOnMap(
        Object.freeze([...canonicalLocations, ...legacyFallback]),
        "places",
      );
    } catch {
      // Hybrid fail-open for discovery only: preserve the provider/legacy map
      // when the canonical public projection is temporarily unavailable.
    }
  };

  const hideMainMenu = (): void => {
    if (!mainMenuContainer) return;
    mainMenuContainer.classList.add("hidden");
    mainMenuContainer.setAttribute("aria-hidden", "true");
  };

  const showMainMenu = (): void => {
    if (!mainMenuContainer) return;
    mainMenuContainer.classList.remove("hidden");
    mainMenuContainer.setAttribute("aria-hidden", "false");
  };

  const renderPlaceDetailMessage = (
    location: ExploreMapLocation,
    categoryLabel: string,
    description: string,
  ): void => {
    const area = assistantMessagesArea(document);
    if (!area) return;

    document.getElementById(ASSISTANT_FLOW_RESULTS_ID)?.remove();
    hideMainMenu();

    let message = document.getElementById(ASSISTANT_FLOW_MESSAGE_ID);
    if (!(message instanceof HTMLElement)) {
      message = document.createElement("div");
      message.id = ASSISTANT_FLOW_MESSAGE_ID;
      area.appendChild(message);
    }

    message.className = "message assistant md-assistant-place-detail-message";
    message.dataset.messageType = "place-detail";
    message.dataset.category = location.category;
    message.dataset.place = location.name;

    const title = document.createElement("strong");
    title.className = "md-assistant-place-detail-title";
    title.textContent = location.name;

    const meta = document.createElement("span");
    meta.className = "md-assistant-place-detail-meta";
    meta.textContent = [categoryLabel, location.area]
      .filter(Boolean)
      .join(" · ");

    const content: Node[] = [title];
    if (meta.textContent) content.push(meta);
    if (description) {
      const body = document.createElement("span");
      body.className = "md-assistant-place-detail-description";
      body.textContent = description;
      content.push(body);
    }
    message.replaceChildren(...content);
    message.classList.remove("hidden");
    message.setAttribute("aria-hidden", "false");
    area.scrollTop = area.scrollHeight;
    requestAssistantOpen(document);
  };

  const renderFlow = <
    T extends Readonly<{
      label: string;
      value: string;
      action?: string;
      location?: ExploreMapLocation;
      tourId?: string;
    }>,
  >(
    text: string,
    options: readonly T[],
    onSelect: (option: T) => void,
    content?: HTMLElement,
    statusOverride?: "loading" | "ready" | "empty" | "error",
    statusTextOverride?: string,
  ): HTMLButtonElement | null => {
    const area = assistantMessagesArea(document);
    if (!area) return null;

    document.getElementById(ASSISTANT_FLOW_RESULTS_ID)?.remove();
    hideMainMenu();

    let message = document.getElementById(ASSISTANT_FLOW_MESSAGE_ID);
    if (!(message instanceof HTMLElement)) {
      message = document.createElement("div");
      message.id = ASSISTANT_FLOW_MESSAGE_ID;
      area.appendChild(message);
    }
    message.className = "message assistant";
    message.dataset.messageType = "category-flow";
    message.dataset.category = activeCategory?.value ?? "";
    if (content) {
      message.dataset.preserveContent = "true";
      message.replaceChildren(content);
    } else {
      delete message.dataset.preserveContent;
      message.textContent = text;
    }
    message.classList.remove("hidden");
    message.setAttribute("aria-hidden", "false");

    const container = document.createElement("div");
    container.id = ASSISTANT_FLOW_RESULTS_ID;
    container.className = "assistant-options assistant-category-results";
    container.dataset.category = activeCategory?.value ?? "";
    container.dataset.stage = activeStage;
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", text);

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "assistant-option-btn assistant-flow-option";
      button.textContent = option.label;
      button.dataset.value = option.value;
      button.dataset.exploreAction = option.action ?? "location";
      if (option.location) {
        button.dataset.locationName = option.location.name;
        button.dataset.locationCategory = option.location.category;
      }
      if (option.tourId) button.dataset.tourId = option.tourId;
      button.addEventListener("click", (event) => {
        event.stopImmediatePropagation();
        onSelect(option);
      });
      container.appendChild(button);
    }

    area.appendChild(container);
    area.scrollTop = area.scrollHeight;

    let contextualFirst: HTMLButtonElement | null = null;
    if (activeStage === "filters" || activeStage === "places") {
      container.classList.add("md-contextual-rail-source");
      container.setAttribute("aria-hidden", "true");
      container.setAttribute("inert", "");
      exploreFlowBottomSheet?.hide();
      contextualFirst = renderContextualRail(
        activeStage,
        text,
        options,
        onSelect,
      );
    } else if (exploreFlowBottomSheet && activeStage === "tour") {
      exploreFlowBottomSheet.show({
        kind: "tour",
        accessibleLabel: text,
        source: container,
        messageSource: message,
        status: statusOverride ?? (options.length === 0 ? "empty" : "ready"),
        ...(statusTextOverride ? { statusText: statusTextOverride } : {}),
        ...(content ? { content } : {}),
        onDismiss() {
          const exitOption = options.find(
            (option) =>
              option.value === "__tour_exit__" ||
              option.value === "__tour_cancel__",
          );
          if (exitOption) {
            onSelect(exitOption);
            return;
          }
          backToMenu();
        },
      });
    }

    return (
      contextualFirst ??
      container.querySelector<HTMLButtonElement>(".assistant-flow-option")
    );
  };

  exploreFlowBottomSheet = installExploreFlowBottomSheet({ document });

  const resetCategoryTriggerState = (): void => {
    if (!activeCategoryButton) return;
    activeCategoryButton.setAttribute("aria-expanded", "false");
    activeCategoryButton.setAttribute("aria-pressed", "false");
  };

  const backToMenu = (restoreFocus = true): void => {
    interactionGeneration += 1;
    const previousCategoryValue = activeCategory?.value;
    if (activeStage === "tour") {
      immersiveTourController?.destroy();
      clearTourPresentation(document);
      if (geospatialEngine?.initialized) {
        void geospatialEngine.replaceMarkers([]).catch(() => undefined);
      }
    }
    removeAssistantFlowResults(document);
    exploreFlowBottomSheet?.hide();
    resetCategoryTriggerState();
    activeCategory = undefined;
    activeCategoryButton = undefined;
    activePlace = undefined;
    activePlaceLocation = undefined;
    activePlaceActionValues = Object.freeze([]);
    activeSearchQuery = "";
    activeStage = "menu";
    visibleLocations = Object.freeze([]);
    placeReturnLocations = Object.freeze([]);
    placeReturnMessage = "";
    placeReturnIsSearch = false;
    clearExploreRuntimeStatus();
    showMainMenu();
    updateMapState(
      Number(document.getElementById("map")?.dataset.mapMarkerCount ?? "0"),
      undefined,
    );
    restoreCategoryRail();
    emitStateChange();
    void loadHybridGlobalMarkers();
    if (restoreFocus && previousCategoryValue) {
      contextualRailScroll
        ?.querySelector<HTMLButtonElement>(
          `[data-assistant-category="${previousCategoryValue}"]`,
        )
        ?.focus();
    }
  };

  const shareActivePlace = (): void => {
    const location = activePlaceLocation;
    const view = document.defaultView;
    if (!location || !view) return;

    const shareText = [location.name, location.area]
      .filter(Boolean)
      .join(" · ");
    const shareUrl = view.location.href;
    const navigator = view.navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      clipboard?: Clipboard;
    };

    void (async () => {
      try {
        if (navigator.share) {
          await navigator.share({
            title: location.name,
            text: shareText,
            ...(shareUrl ? { url: shareUrl } : {}),
          });
          return;
        }
        if (navigator.clipboard && shareUrl) {
          await navigator.clipboard.writeText(
            [shareText, shareUrl].filter(Boolean).join("\n"),
          );
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    })();
  };

  const handlePlaceAction = (value: string): void => {
    const normalized = normalizeSearchText(value);
    const location = activePlaceLocation;
    if (normalized === "compartilhar" || normalized === "share") {
      shareActivePlace();
      return;
    }
    if (
      location &&
      ["como chegar", "directions", "localizacao", "location"].includes(
        normalized,
      )
    ) {
      document.dispatchEvent(
        new CustomEvent("morro:navigation-requested", {
          detail: {
            destination: {
              name: location.name,
              latitude: location.latitude,
              longitude: location.longitude,
              category: location.category,
            },
            source: "place-v2",
          },
        }),
      );
      return;
    }
    const locationCategory = activePlaceLocation?.category;
    if (
      locationCategory === "tours" &&
      activePlaceLocation &&
      (normalized === "reservar passeio" ||
        value.startsWith("commerce:offer:") ||
        value.startsWith("commerce:offers:"))
    ) {
      const targetUrl = tourTicketingUrl(value, activePlaceLocation.name);
      if (targetUrl) {
        document.defaultView?.location.assign(targetUrl);
        return;
      }
    }
    if (
      normalized === "fazer tour interativo" &&
      locationCategory === "tours"
    ) {
      const placeName = normalizeSearchText(activePlaceLocation?.name ?? "");
      const tourId =
        placeName.includes("volta") && placeName.includes("ilha")
          ? "volta-a-ilha"
          : placeName.includes("gamboa")
            ? "trilha-gamboa"
            : placeName.includes("quadriciclo")
              ? "passeio-quadriciclo"
              : null;
      if (tourId) {
        startImmersiveTour(tourId);
        return;
      }
    }
    const locale = currentLocale();
    const detail =
      normalized === "ver fotos" && locationCategory
        ? {
            value,
            optionsOverride: [
              {
                label: `⬅️ ${getV1ExploreLabel("back", locale)}`,
                value: `[sub]${locationCategory}`,
              },
            ],
          }
        : {
            value,
            suppressOptionValues: activePlaceActionValues,
          };
    document.dispatchEvent(
      new CustomEvent("morro:assistant-option-selected", { detail }),
    );
    requestAssistantOpen(document);
  };

  const renderPlaceActionsRail = (
    placeActions: readonly Readonly<{
      actionId: string;
      label: string;
      value: string;
      action: "command" | "back-places";
      disabled?: boolean;
    }>[],
    primaryAction: Readonly<{
      actionId: string;
      label: string;
      value: string;
      disabled?: boolean;
    }> | null,
    placeName: string,
    locale: AssistantLocale,
  ): HTMLButtonElement | null => {
    const options: Array<{
      label: string;
      value: string;
      action: string;
      disabled?: boolean;
    }> = [];
    let primaryReplaced = false;
    for (const action of placeActions) {
      if (primaryAction && action.actionId === primaryAction.actionId) {
        primaryReplaced = true;
        options.push({
          label: primaryAction.label,
          value: primaryAction.value,
          action: "primary",
          ...(primaryAction.disabled === true ? { disabled: true } : {}),
        });
        continue;
      }
      options.push({
        label: action.label,
        value: action.value,
        action: action.action,
        ...(action.disabled === true ? { disabled: true } : {}),
      });
    }
    if (primaryAction && !primaryReplaced) {
      options.unshift({
        label: primaryAction.label,
        value: primaryAction.value,
        action: "primary",
        ...(primaryAction.disabled === true ? { disabled: true } : {}),
      });
    }
    options.push({
      label: `⬅️ ${getV1ExploreLabel("back", locale)}`,
      value: "__back_to_places__",
      action: "back-places",
    });

    activePlaceActionValues = Object.freeze(
      Array.from(
        new Set([
          ...activePlaceActionValues,
          ...options.map(({ value }) => value),
        ]),
      ),
    );

    const previousValue =
      document.activeElement instanceof HTMLButtonElement &&
      document.activeElement.dataset.contextRailOption === "true"
        ? document.activeElement.dataset.value
        : undefined;
    const first = renderContextualRail(
      "detail",
      `Ações para ${placeName}`,
      options,
      (option) => {
        if (option.action === "back-places") {
          returnFromPlaceDetail();
          return;
        }
        handlePlaceAction(option.value);
      },
    );
    if (previousValue) {
      Array.from(
        contextualRailScroll?.querySelectorAll<HTMLButtonElement>(
          '[data-context-rail-option="true"]',
        ) ?? [],
      )
        .find((button) => button.dataset.value === previousValue)
        ?.focus();
    }
    return first;
  };

  const selectLocation = async (
    location: ExploreMapLocation,
  ): Promise<void> => {
    const generation = ++interactionGeneration;
    const category = location.category;
    const locale = currentLocale();
    const canonicalPlaceId =
      "placeId" in location && typeof location.placeId === "string"
        ? location.placeId.trim()
        : "";
    const canonicalLocation =
      !canonicalPlaceId && "source" in location && location.source === "local"
        ? resolveExploreLocationByName(location.name, location.category)
        : !("source" in location)
          ? location
          : undefined;
    const presentationLocation = canonicalLocation ?? location;
    const categoryLabel =
      currentCategories().find((candidate) => candidate.value === category)
        ?.label ?? category;
    activePlace = presentationLocation.name;
    activePlaceLocation = presentationLocation;
    activeStage = "detail";
    removeAssistantFlowResults(document);
    exploreFlowBottomSheet?.hide();

    const safeFallbackActions = getV1ExplorePlaceActionOptions(
      category,
      locale,
    ).filter(
      ({ actionId }) => !UNREGISTERED_COMMERCIAL_ACTION_IDS.has(actionId),
    );
    const description =
      "description" in presentationLocation &&
      typeof presentationLocation.description === "string"
        ? presentationLocation.description.trim()
        : "";
    activePlaceActionValues = Object.freeze(
      Array.from(new Set(safeFallbackActions.map(({ value }) => value))),
    );

    renderPlaceDetailMessage(presentationLocation, categoryLabel, description);
    const firstPlaceAction = renderPlaceActionsRail(
      safeFallbackActions,
      null,
      presentationLocation.name,
      locale,
    );
    firstPlaceAction?.focus();

    const browserFetch = document.defaultView?.fetch?.bind(
      document.defaultView,
    );
    const canonicalDetailPromise =
      canonicalPlaceId && browserFetch
        ? createPublicPlaceMapClient(browserFetch).getDetail(canonicalPlaceId, {
            locale: document.documentElement.lang || "pt-BR",
          })
        : Promise.resolve(null);

    await renderLocationsOnMap([location], category, true);

    if (canonicalPlaceId) {
      try {
        const detail = await canonicalDetailPromise;
        if (
          generation !== interactionGeneration ||
          activePlace !== presentationLocation.name
        ) {
          return;
        }
        if (detail) {
          const canonicalActions = detail.actions.secondaryActions.map(
            (action) =>
              Object.freeze({
                actionId: action.id,
                label: action.label,
                value: action.value,
                action: "command" as const,
                disabled: action.disabled,
              }),
          );
          const canonicalPrimary = detail.actions.primaryAction
            ? Object.freeze({
                actionId: detail.actions.primaryAction.id,
                label: detail.actions.primaryAction.label,
                value: detail.actions.primaryAction.value,
                disabled: detail.actions.primaryAction.disabled,
              })
            : null;
          activePlaceActionValues = Object.freeze(
            Array.from(
              new Set([
                ...canonicalActions.map(({ value }) => value),
                ...(canonicalPrimary ? [canonicalPrimary.value] : []),
              ]),
            ),
          );
          renderPlaceActionsRail(
            canonicalActions,
            canonicalPrimary,
            detail.profile.name,
            locale,
          );
        }
      } catch {
        // Canonical Places fail closed: never fall back to inferred commercial
        // actions when the authoritative detail projection is unavailable.
      }
    }

    if (
      generation !== interactionGeneration ||
      activePlace !== presentationLocation.name
    ) {
      return;
    }

    const mapFailed =
      document.getElementById("map")?.dataset.exploreState === "error";
    if (mapFailed) {
      setExploreRuntimeStatus({
        kind: "map-error",
        error: new Error(getV1ExploreUiCopy(locale).mapUnknown),
      });
    } else {
      setExploreRuntimeStatus({
        kind: "selected",
        place: presentationLocation.name,
      });
    }
    emitStateChange();
  };

  const renderPlaces = (
    locations: readonly ExploreMapLocation[],
    message: string,
  ): void => {
    if (!activeCategory) return;
    placeReturnLocations = Object.freeze([...locations]);
    placeReturnMessage = message;
    placeReturnIsSearch = false;
    activePlace = undefined;
    activePlaceLocation = undefined;
    activePlaceActionValues = Object.freeze([]);
    activeStage = "places";
    clearExploreRuntimeStatus();
    const options: readonly Readonly<{
      label: string;
      value: string;
      action: "location" | "back-filters";
      location?: MorroV1SearchCatalogItem;
    }>[] = [
      ...locations.map((location) => ({
        label: location.name,
        value: createExploreLocationDetailsCommand(location.name),
        action: "location" as const,
        location,
      })),
      {
        label: `🔙 ${getV1ExploreLabel("backFilters", currentLocale())}`,
        value: "voltar_filtros",
        action: "back-filters" as const,
      },
    ];

    const first = renderFlow(message, options, (option) => {
      if (option.action === "back-filters") {
        interactionGeneration += 1;
        renderFilters();
        return;
      }
      if (option.location) void selectLocation(option.location);
    });
    first?.focus();
    emitStateChange();
    void renderLocationsOnMap(locations, activeCategory.value);
  };

  const renderSearchPlaces = (
    locations: readonly ExploreSearchResult[],
    message: string,
    query = activeSearchQuery,
    status: "ready" | "empty" | "error" = locations.length === 0
      ? "empty"
      : "ready",
    statusText?: string,
  ): void => {
    resetCategoryTriggerState();
    activeCategory = undefined;
    activeCategoryButton = undefined;
    activeSearchQuery = query;
    placeReturnLocations = Object.freeze([...locations]);
    placeReturnMessage = message;
    placeReturnIsSearch = true;
    activePlace = undefined;
    activePlaceLocation = undefined;
    activeStage = "places";
    clearExploreRuntimeStatus();

    const options: readonly Readonly<{
      label: string;
      value: string;
      action: "location" | "back-menu";
      location?: ExploreSearchResult;
    }>[] = [
      ...locations.map((location) =>
        Object.freeze({
          label: location.area
            ? `${location.name} · ${location.area}`
            : location.name,
          value: createExploreLocationDetailsCommand(location.name),
          action: "location" as const,
          location,
        }),
      ),
      Object.freeze({
        label: `🔙 ${getV1ExploreLabel("backMenu", currentLocale())}`,
        value: "voltar_menu",
        action: "back-menu" as const,
      }),
    ];
    const first = renderFlow(
      message,
      options,
      (option) => {
        if (option.action === "back-menu") {
          backToMenu();
          return;
        }
        if (option.location) void selectLocation(option.location);
      },
      undefined,
      status,
      statusText,
    );
    first?.focus();
    emitStateChange();
    if (status === "error") {
      updateMapState(
        Number(document.getElementById("map")?.dataset.mapMarkerCount ?? "0"),
        "search",
        "error",
      );
      exploreFlowBottomSheet?.setStatus("error", statusText);
      emitStateChange();
      return;
    }
    void renderLocationsOnMap(locations, "search");
  };

  const returnFromPlaceDetail = (): void => {
    if (placeReturnIsSearch) {
      renderSearchPlaces(
        placeReturnLocations.filter(
          (location): location is ExploreSearchResult =>
            "source" in location &&
            (location.source === "canonical" ||
              location.source === "local" ||
              location.source === "mapbox"),
        ),
        placeReturnMessage ||
          getV1ExploreUiCopy(currentLocale()).searchResults(
            activeSearchQuery,
            placeReturnLocations.length,
          ),
      );
      return;
    }
    if (!activeCategory) {
      return;
    }
    const locations =
      placeReturnLocations.length > 0
        ? placeReturnLocations
        : getExploreLocationsForCategory(activeCategory.value);
    const message =
      placeReturnMessage ||
      getV1ExploreUiCopy(currentLocale()).chooseOther(activeCategory.label);
    renderPlaces(
      locations.filter(
        (location): location is MorroV1SearchCatalogItem =>
          !("source" in location),
      ),
      message,
    );
  };

  const startImmersiveTour = (tourId: string): void => {
    exploreFlowBottomSheet?.hide();
    activePlace = undefined;
    activePlaceLocation = undefined;
    activePlaceActionValues = Object.freeze([]);
    activeStage = "tour";
    clearExploreRuntimeStatus();
    removeAssistantFlowResults(document);
    restoreCategoryRail();

    if (immersiveTourController) {
      void immersiveTourController.start(tourId).catch((error: unknown) => {
        if (activeStage !== "tour") return;
        renderFilters();
        setExploreRuntimeStatus({ kind: "map-error", error });
      });
    } else {
      const tourSelect = document.getElementById("tour-select");
      if (tourSelect instanceof HTMLSelectElement) {
        tourSelect.value = tourId;
        tourSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    emitStateChange();
  };

  const applyFlowOption = async (option: V1ExploreOption): Promise<void> => {
    if (!activeCategory) return;
    const generation = ++interactionGeneration;
    const categoryValue = activeCategory.value;
    const categoryLabel = activeCategory.label;
    const allLocations = getExploreLocationsForCategory(categoryValue);

    if (option.action === "back-menu") {
      backToMenu();
      return;
    }
    if (option.action === "tour" && option.tourId) {
      startImmersiveTour(option.tourId);
      return;
    }
    if (option.action === "all") {
      renderPlaces(
        allLocations,
        getV1ExploreUiCopy(currentLocale()).allPrompt(
          categoryLabel,
          allLocations.length,
        ),
      );
      return;
    }
    if (option.action === "nearby") {
      const position = await getCurrentPosition(document);
      if (
        generation !== interactionGeneration ||
        activeCategory?.value !== categoryValue
      ) {
        return;
      }
      const nearby = position
        ? sortV1ExploreNearby(allLocations, position, 12)
        : allLocations;
      renderPlaces(
        nearby,
        position
          ? getV1ExploreUiCopy(currentLocale()).nearbyPrompt(
              categoryLabel,
              nearby.length,
            )
          : getV1ExploreUiCopy(currentLocale()).geoFallback(
              categoryLabel,
              allLocations.length,
            ),
      );
      return;
    }

    const filtered = filterV1ExploreLocations(
      categoryValue,
      option.value,
      allLocations,
    );
    const displayed = filtered.length > 0 ? filtered : allLocations;
    renderPlaces(
      displayed,
      filtered.length > 0
        ? getV1ExploreUiCopy(currentLocale()).filterFound(
            categoryLabel,
            filtered.length,
            option.label.replace(/^\S+\s/u, ""),
          )
        : getV1ExploreUiCopy(currentLocale()).filterFallback(
            allLocations.length,
            option.label.replace(/^\S+\s/u, ""),
          ),
    );
  };

  function renderFilters(): void {
    if (!activeCategory) return;
    activePlace = undefined;
    activeStage = "filters";
    clearExploreRuntimeStatus();
    const allLocations = getExploreLocationsForCategory(activeCategory.value);
    const filters = getV1ExploreSubcategoryOptions(
      activeCategory.value,
      currentLocale(),
    );

    const first = renderFlow(
      getV1ExploreUiCopy(currentLocale()).filtersPrompt(
        activeCategory.label,
        allLocations.length,
      ),
      filters,
      (option) => void applyFlowOption(option),
    );
    first?.focus();
    emitStateChange();
    void renderLocationsOnMap(allLocations, activeCategory.value);
  }

  const openCategory = (
    category: ExploreLocationsCategory,
    trigger: HTMLButtonElement,
  ): void => {
    interactionGeneration += 1;
    if (activeCategoryButton && activeCategoryButton !== trigger) {
      activeCategoryButton.setAttribute("aria-expanded", "false");
      activeCategoryButton.setAttribute("aria-pressed", "false");
    }

    if (activeStage === "tour") immersiveTourController?.destroy();
    clearTourPresentation(document);
    const localizedCategory =
      getExploreLocationsCategories(currentLocale()).find(
        (candidate) => candidate.value === category.value,
      ) ?? category;
    activeCategory = localizedCategory;
    activeCategoryButton = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-pressed", "true");
    renderFilters();
  };

  const openCategoryByValue = (categoryValue: string): boolean => {
    const normalized = normalizeSearchText(categoryValue);
    const category = currentCategories().find(
      (candidate) => normalizeSearchText(candidate.value) === normalized,
    );
    if (!category) return false;
    const visibleTrigger =
      contextualRailScroll?.querySelector<HTMLButtonElement>(
        `[data-assistant-category="${category.value}"]`,
      ) ?? null;
    const legacyTrigger = document.getElementById(
      getAssistantCategoryButtonId(category.value),
    );
    const trigger =
      visibleTrigger ??
      (legacyTrigger instanceof HTMLButtonElement ? legacyTrigger : null);
    if (!(trigger instanceof HTMLButtonElement)) return false;
    openCategory(category, trigger);
    return true;
  };

  const renderMapOnlyLocations = async (
    locations: readonly ExploreMapLocation[],
    category?: string,
  ): Promise<boolean> => {
    if (!geospatialEngine?.initialized) return false;
    const generation = ++interactionGeneration;
    if (activeStage === "tour") immersiveTourController?.destroy();
    clearTourPresentation(document);
    removeAssistantFlowResults(document);
    exploreFlowBottomSheet?.hide();
    resetCategoryTriggerState();
    activeCategory = undefined;
    activeCategoryButton = undefined;
    activePlace = undefined;
    activeStage = "menu";
    visibleLocations = Object.freeze([...locations]);
    clearExploreRuntimeStatus();
    showMainMenu();
    restoreCategoryRail();
    updateMapState(locations.length, category, "loading");

    try {
      await geospatialEngine.replaceMarkers(
        locations.map((location, index) => markerForLocation(location, index)),
      );
      if (generation !== interactionGeneration) return false;
      updateMapState(locations.length, category, "ready");
      frameLocationsOnMap(document, locations, geospatialEngine);
      emitStateChange();
      return true;
    } catch (error) {
      if (generation !== interactionGeneration) return false;
      updateMapState(0, undefined, "error");
      try {
        await geospatialEngine.replaceMarkers([]);
      } catch {
        // Preserve the first provider failure for diagnostics.
      }
      emitStateChange();
      document
        .getElementById("runtime-status")
        ?.replaceChildren(
          document.createTextNode(
            getV1ExploreUiCopy(currentLocale()).mapCategoryError(
              describeExploreError(error, currentLocale()),
            ),
          ),
        );
      return false;
    }
  };

  const execute = async (
    command: ExploreLocationsCommand,
  ): Promise<boolean> => {
    if (command.type === "open_category") {
      return openCategoryByValue(command.category);
    }

    if (command.type === "show_search_results") {
      interactionGeneration += 1;
      const results = command.results
        .filter(
          (result) =>
            result.name.trim().length > 0 &&
            result.category.trim().length > 0 &&
            Number.isFinite(result.latitude) &&
            Number.isFinite(result.longitude) &&
            result.latitude >= -90 &&
            result.latitude <= 90 &&
            result.longitude >= -180 &&
            result.longitude <= 180,
        )
        .slice(0, 20);
      renderSearchPlaces(
        results,
        getV1ExploreUiCopy(currentLocale()).searchResults(
          command.query,
          results.length,
        ),
        command.query,
        command.status ?? (results.length === 0 ? "empty" : "ready"),
        command.statusText,
      );
      return true;
    }

    if (command.type === "back_from_place") {
      if (activeStage !== "detail" || !activePlace) return false;
      returnFromPlaceDetail();
      return true;
    }

    if (command.type === "back_to_menu") {
      backToMenu();
      return true;
    }

    if (command.type === "back_to_filters") {
      if (!activeCategory) return false;
      interactionGeneration += 1;
      renderFilters();
      return true;
    }

    if (command.type === "map_filter_category") {
      const locations = getExploreLocationsForCategory(command.category);
      if (locations.length === 0) return false;
      return renderMapOnlyLocations(locations, command.category);
    }

    if (command.type === "show_all_locations") {
      return renderMapOnlyLocations(morroV1SearchCatalog);
    }

    if (command.type === "select_place") {
      const location = resolveExploreLocationByName(
        command.place,
        command.category,
      );
      if (!location) return false;
      if (activeCategory?.value !== location.category) {
        if (!openCategoryByValue(location.category)) return false;
      }
      await selectLocation(location);
      return true;
    }

    if (!activeCategory) return false;
    const allLocations = getExploreLocationsForCategory(activeCategory.value);

    if (command.type === "show_all") {
      interactionGeneration += 1;
      renderPlaces(
        allLocations,
        getV1ExploreUiCopy(currentLocale()).allPrompt(
          activeCategory.label,
          allLocations.length,
        ),
      );
      return true;
    }

    const flowOptions = getV1ExploreSubcategoryOptions(
      activeCategory.value,
      currentLocale(),
    );
    if (command.type === "show_nearby") {
      const nearby = flowOptions.find((option) => option.action === "nearby");
      if (!nearby) return false;
      await applyFlowOption(nearby);
      return true;
    }

    const normalized = normalizeSearchText(command.value);
    const option = flowOptions.find(
      (candidate) =>
        normalizeSearchText(candidate.value) === normalized ||
        normalizeSearchText(candidate.label) === normalized,
    );
    if (!option) return false;
    await applyFlowOption(option);
    return true;
  };

  immersiveTourController = createV1ImmersiveTourController({
    document,
    render(request) {
      const flowOptions = request.options.map((option) =>
        Object.freeze({
          ...option,
          action: "tour-control" as const,
        }),
      );
      const first = renderFlow(
        request.accessibleLabel,
        flowOptions,
        (option) => request.onSelect(option.value),
        request.content,
      );
      first?.focus();
    },
    activateMap(tourId) {
      const tourSelect = document.getElementById("tour-select");
      const mapElement = document.getElementById("map");
      const MutationObserverCtor = document.defaultView?.MutationObserver;
      if (
        !(tourSelect instanceof HTMLSelectElement) ||
        !mapElement ||
        !MutationObserverCtor
      ) {
        if (tourSelect instanceof HTMLSelectElement) {
          tourSelect.value = tourId;
          tourSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error): void => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          document.defaultView?.clearTimeout(timeoutId);
          if (error) reject(error);
          else resolve();
        };
        const inspectState = (): void => {
          if (
            mapElement.dataset.tourState === "ready" &&
            mapElement.dataset.activeTour === tourId
          ) {
            finish();
            return;
          }
          if (mapElement.dataset.tourState === "error") {
            finish(new Error(`Unable to activate tour ${tourId} on the map.`));
          }
        };
        const observer = new MutationObserverCtor(inspectState);
        const timeoutId = document.defaultView?.setTimeout(
          () =>
            finish(
              new Error(
                `Timed out activating tour ${tourId} after ${TOUR_ACTIVATION_TIMEOUT_MS}ms.`,
              ),
            ),
          TOUR_ACTIVATION_TIMEOUT_MS,
        );

        observer.observe(mapElement, {
          attributes: true,
          attributeFilter: ["data-tour-state", "data-active-tour"],
        });
        tourSelect.value = tourId;
        tourSelect.dispatchEvent(new Event("change", { bubbles: true }));
        inspectState();
      });
    },
    async deactivateMap() {
      clearTourPresentation(document);
      if (geospatialEngine?.initialized) {
        try {
          await geospatialEngine.replaceMarkers([]);
        } catch (error) {
          setExploreRuntimeStatus({ kind: "map-error", error });
        }
      }
      const mapElement = document.getElementById("map");
      mapElement?.setAttribute("data-map-marker-count", "0");
      mapElement?.removeAttribute("data-active-tour");
      mapElement?.setAttribute("data-tour-state", "idle");
    },
    focusStop(stop) {
      const map = currentMap() as ImmersiveTourMapLike | undefined;
      if (map?.flyTo) {
        map.flyTo({
          center: [stop.position.longitude, stop.position.latitude],
          zoom: 15,
          pitch: 55,
          bearing: 0,
          duration: 1800,
          essential: true,
        });
        return;
      }
      if (map) {
        map.setCenter([stop.position.longitude, stop.position.latitude]);
        map.setZoom?.(15);
        return;
      }
      if (geospatialEngine?.initialized) {
        void geospatialEngine.setCenter(stop.position);
      }
    },
    highlightStop(index) {
      document
        .querySelectorAll<HTMLElement>(".tour-stop-marker")
        .forEach((marker) => {
          marker
            .querySelector<HTMLElement>(".tour-stop-pin")
            ?.classList.toggle(
              "tour-stop-active",
              marker.dataset.stopIndex === String(index),
            );
        });
    },
    onShowTours() {
      if (activeCategory?.value === "tours") {
        renderFilters();
        return;
      }
      openCategoryByValue("tours");
    },
    onExploreMap() {
      void renderMapOnlyLocations(morroV1SearchCatalog);
    },
    onMainMenu() {
      backToMenu();
    },
    onStateChange(tourState) {
      const mapElement = document.getElementById("map");
      if (tourState.stage === "idle" || !tourState.tourId) {
        mapElement?.removeAttribute("data-tour-flow-stage");
        mapElement?.removeAttribute("data-tour-flow-id");
        mapElement?.removeAttribute("data-tour-stop-index");
        mapElement?.removeAttribute("data-tour-total-stops");
      } else {
        mapElement?.setAttribute("data-tour-flow-stage", tourState.stage);
        mapElement?.setAttribute("data-tour-flow-id", tourState.tourId);
        mapElement?.setAttribute(
          "data-tour-stop-index",
          String(tourState.currentStopIndex),
        );
        mapElement?.setAttribute(
          "data-tour-total-stops",
          String(tourState.totalStops),
        );
      }
      emitStateChange();
    },
  });

  const refreshCategoryPresentation = (): void => {
    const localized = currentCategories();
    for (const category of localized) {
      const button = document.getElementById(
        getAssistantCategoryButtonId(category.value),
      );
      if (!(button instanceof HTMLButtonElement)) continue;
      button.textContent = category.label;
      button.setAttribute(
        "aria-label",
        getV1ExploreUiCopy(currentLocale()).categoryAria(
          category.label,
          category.count,
        ),
      );
      if (activeCategory?.value === category.value) activeCategory = category;
    }
  };

  for (const category of currentCategories()) {
    const button = document.querySelector<HTMLButtonElement>(
      `.assistant-options .assistant-option-btn[data-value="${category.value}"]`,
    );
    if (!button) continue;

    button.id = getAssistantCategoryButtonId(category.value);
    button.dataset.exploreCategory = category.value;
    button.setAttribute("aria-controls", ASSISTANT_FLOW_RESULTS_ID);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute(
      "aria-label",
      getV1ExploreUiCopy(currentLocale()).categoryAria(
        category.label,
        category.count,
      ),
    );

    mainMenuContainer ??=
      button.closest<HTMLElement>(".assistant-options") ?? undefined;

    const onCategoryClick: EventListener = (event) => {
      event.stopImmediatePropagation();
      openCategory(category, button);
    };

    button.addEventListener("click", onCategoryClick);
    categoryListeners.set(button, onCategoryClick);
  }

  // The app shell ships English fallback labels while the runtime locale can
  // already be PT/ES/HE before this control is installed. Reconcile both the
  // visible labels and accessible names immediately, not only after a later
  // <html lang> mutation.
  refreshCategoryPresentation();
  restoreCategoryRail();

  const MutationObserverCtor = document.defaultView?.MutationObserver;
  const localeObserver = MutationObserverCtor
    ? new MutationObserverCtor((records) => {
        if (!records.some((record) => record.attributeName === "lang")) return;
        refreshCategoryPresentation();
        if (activeStage === "menu") restoreCategoryRail();
        if (exploreRuntimeStatusDescriptor) renderExploreRuntimeStatus();
        if (activeStage === "filters" && activeCategory) renderFilters();
        if (activeStage === "detail" && activePlace) {
          const location =
            activePlaceLocation ??
            resolveExploreLocationByName(activePlace, activeCategory?.value);
          if (location) void selectLocation(location);
        }
        if (activeStage === "tour") immersiveTourController?.refreshLocale();
      })
    : null;
  localeObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || activeStage === "menu") return;
    if (activeStage === "detail") {
      event.preventDefault();
      event.stopImmediatePropagation();
      returnFromPlaceDetail();
      return;
    }
    if (!document.getElementById(ASSISTANT_FLOW_RESULTS_ID)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    backToMenu();
  };

  const onAssistantOptionSelected = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!detail || typeof detail !== "object") return;
    const candidate: unknown = Reflect.get(detail, "value");
    const value = typeof candidate === "string" ? candidate : "";
    const sourceCandidate: unknown = Reflect.get(detail, "source");
    const source = typeof sourceCandidate === "string" ? sourceCandidate : "";

    if (activeStage === "menu") {
      const isUnifiedCategory =
        source === "unified-category-rail" &&
        currentCategories().some(
          (category) =>
            normalizeSearchText(category.value) === normalizeSearchText(value),
        );
      if (!isUnifiedCategory) return;
      event.stopImmediatePropagation();
      openCategoryByValue(value);
      return;
    }

    if (
      activeStage === "detail" &&
      activeCategory &&
      value === `[sub]${activeCategory.value}`
    ) {
      event.stopImmediatePropagation();
      interactionGeneration += 1;
      const locations =
        placeReturnLocations.length > 0
          ? placeReturnLocations
          : getExploreLocationsForCategory(activeCategory.value);
      renderPlaces(
        locations,
        placeReturnMessage ||
          getV1ExploreUiCopy(currentLocale()).chooseOther(activeCategory.label),
      );
      return;
    }

    if (!isBackToMenuValue(value)) return;
    event.stopImmediatePropagation();
    backToMenu(false);
  };

  const onTourStopRequested = (event: Event): void => {
    if (activeStage !== "tour" || !(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!detail || typeof detail !== "object") return;
    const tourIdCandidate: unknown = Reflect.get(detail, "tourId");
    const stopIdCandidate: unknown = Reflect.get(detail, "stopId");
    if (
      typeof tourIdCandidate !== "string" ||
      typeof stopIdCandidate !== "string"
    ) {
      return;
    }
    if (
      immersiveTourController?.goToStopById(tourIdCandidate, stopIdCandidate)
    ) {
      event.stopImmediatePropagation();
    }
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener(
    "morro:assistant-option-selected",
    onAssistantOptionSelected,
  );
  document.addEventListener("morro:tour-stop-requested", onTourStopRequested);

  return Object.freeze({
    execute,
    getState: stateSnapshot,
    close: () => backToMenu(),
    setGeospatialEngine(engine: GeospatialEngine | undefined) {
      geospatialEngine = engine;
      if (visibleLocations.length > 0) {
        void renderLocationsOnMap(
          visibleLocations,
          activeCategory?.value ?? (activeSearchQuery ? "search" : "places"),
          activeStage === "detail" && visibleLocations.length === 1,
        );
        return;
      }
      void loadHybridGlobalMarkers();
    },
    destroy() {
      interactionGeneration += 1;
      localeObserver?.disconnect();
      clearExploreRuntimeStatus();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener(
        "morro:assistant-option-selected",
        onAssistantOptionSelected,
      );
      document.removeEventListener(
        "morro:tour-stop-requested",
        onTourStopRequested,
      );
      immersiveTourController?.destroy();
      immersiveTourController = undefined;
      exploreFlowBottomSheet?.destroy();
      exploreFlowBottomSheet = undefined;
      placeReturnLocations = Object.freeze([]);
      placeReturnMessage = "";
      for (const [button, listener] of categoryListeners) {
        button.removeEventListener("click", listener);
        button.removeAttribute("data-explore-category");
        button.removeAttribute("aria-controls");
        button.removeAttribute("aria-expanded");
        button.removeAttribute("aria-pressed");
      }
      categoryListeners.clear();
      removeAssistantFlowResults(document);
      showMainMenu();
      submenuContainer?.replaceChildren();
      submenu?.classList.add("hidden");
      submenu?.setAttribute("aria-hidden", "true");
      geospatialEngine = undefined;
      activeCategory = undefined;
      activeCategoryButton = undefined;
      activePlace = undefined;
      activePlaceLocation = undefined;
      activePlaceActionValues = Object.freeze([]);
      activeSearchQuery = "";
      activeStage = "menu";
      visibleLocations = Object.freeze([]);
      restoreCategoryRail();
    },
  });
}
