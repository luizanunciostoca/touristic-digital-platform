import {
  getAssistantMainMenu,
  normalizeAssistantVoiceLanguage,
  type AssistantLocale,
} from "@touristic/assistant";
import {
  requestAssistantClose,
  requestAssistantOpen,
} from "../assistant/assistant-shell-ui.js";
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
import { resolvePlacePrimaryAction } from "./place-commerce-capability.js";
import {
  installPlaceBottomSheet,
  type PlaceBottomSheetController,
} from "./place-bottom-sheet.js";
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

type ExploreStage = "menu" | "filters" | "places" | "detail" | "tour";

export interface ExploreSearchResult {
  readonly name: string;
  readonly category: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly area?: string;
  readonly description?: string;
  readonly source: "local" | "mapbox";
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
      results: readonly ExploreSearchResult[];
    }>
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
  return Object.freeze({
    id:
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
  locations: readonly ExploreMapLocation[],
  geospatialEngine: GeospatialEngine | undefined,
): void {
  const map = currentMap();
  if (locations.length === 1) {
    const location = locations[0];
    if (!location) return;
    if (map?.flyTo) {
      map.flyTo({
        center: [location.longitude, location.latitude],
        zoom: 16,
        duration: 650,
        essential: true,
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
      padding: { top: 120, bottom: 260, left: 56, right: 56 },
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
  let activeStage: ExploreStage = "menu";
  let visibleLocations: readonly ExploreMapLocation[] = Object.freeze([]);
  let activeSearchQuery = "";
  let mainMenuContainer: HTMLElement | undefined;
  let interactionGeneration = 0;
  let immersiveTourController: V1ImmersiveTourController | undefined;
  let exploreFlowBottomSheet: ExploreFlowBottomSheetController | undefined;
  let placeBottomSheet: PlaceBottomSheetController | undefined;
  let placeReturnLocations: readonly ExploreMapLocation[] = Object.freeze([]);
  let placeReturnMessage = "";
  let placeReturnIsSearch = false;
  const categoryListeners = new Map<HTMLButtonElement, EventListener>();
  const currentLocale = (): AssistantLocale =>
    normalizeAssistantVoiceLanguage(document.documentElement.lang);
  const currentCategories = (): readonly ExploreLocationsCategory[] =>
    getExploreLocationsCategories(currentLocale());
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
        (activeStage === "detail" ? (activePlaceLocation?.category ?? null) : null),
      place: activeStage === "detail" ? (activePlace ?? null) : null,
      stage: activeStage,
      markerCount: Number(
        document.getElementById("map")?.dataset.mapMarkerCount ?? "0",
      ),
      sheetState:
        activeStage === "detail"
          ? (placeBottomSheet?.getState() ?? null)
          : activeStage === "filters" || activeStage === "places"
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
      if (activeStage === "detail") {
        placeBottomSheet?.setStatus(
          status === "empty" ? "error" : status,
          text,
        );
        return;
      }
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

    setSheetStatus("loading");
    if (!geospatialEngine?.initialized) {
      updateMapState(locations.length, category, "error");
      setSheetStatus(
        "error",
        getV1ExploreUiCopy(currentLocale()).mapCategoryError(
          getV1ExploreUiCopy(currentLocale()).mapUnknown,
        ),
      );
      emitStateChange();
      return;
    }

    updateMapState(locations.length, category, "loading");
    try {
      await geospatialEngine.replaceMarkers(
        locations.map((location, index) =>
          markerForLocation(
            location,
            index,
            openSelectedPopup && locations.length === 1,
          ),
        ),
      );
      if (
        generation !== interactionGeneration ||
        (categoryAtStart !== undefined &&
          activeCategory?.value !== categoryAtStart)
      ) {
        return;
      }
      updateMapState(locations.length, category, "ready");
      frameLocationsOnMap(locations, geospatialEngine);
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

  const renderFlow = <
    T extends Readonly<{
      label: string;
      value: string;
      action?: string;
      location?: MorroV1SearchCatalogItem;
      tourId?: string;
    }>,
  >(
    text: string,
    options: readonly T[],
    onSelect: (option: T) => void,
    content?: HTMLElement,
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

    if (
      exploreFlowBottomSheet &&
      (activeStage === "filters" ||
        activeStage === "places" ||
        activeStage === "tour")
    ) {
      const kind = activeStage === "tour" ? "tour" : "explore";
      exploreFlowBottomSheet.show({
        kind,
        accessibleLabel: text,
        source: container,
        messageSource: message,
        status: options.length === 0 ? "empty" : "ready",
        ...(content ? { content } : {}),
        onDismiss() {
          if (activeStage === "tour") {
            const exitOption = options.find(
              (option) =>
                option.value === "__tour_exit__" ||
                option.value === "__tour_cancel__",
            );
            if (exitOption) {
              onSelect(exitOption);
              return;
            }
          }
          backToMenu();
        },
      });
      requestAssistantClose(document);
    }

    return container.querySelector<HTMLButtonElement>(".assistant-flow-option");
  };

  exploreFlowBottomSheet = installExploreFlowBottomSheet({ document });

  const resetCategoryTriggerState = (): void => {
    if (!activeCategoryButton) return;
    activeCategoryButton.setAttribute("aria-expanded", "false");
    activeCategoryButton.setAttribute("aria-pressed", "false");
  };

  const backToMenu = (restoreFocus = true): void => {
    interactionGeneration += 1;
    const previousTrigger = activeCategoryButton;
    if (activeStage === "tour") {
      immersiveTourController?.destroy();
      clearTourPresentation(document);
      if (geospatialEngine?.initialized) {
        void geospatialEngine.replaceMarkers([]).catch(() => undefined);
      }
    }
    removeAssistantFlowResults(document);
    exploreFlowBottomSheet?.hide();
    placeBottomSheet?.hide();
    resetCategoryTriggerState();
    activeCategory = undefined;
    activeCategoryButton = undefined;
    activePlace = undefined;
    activePlaceLocation = undefined;
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
    emitStateChange();
    if (restoreFocus) {
      previousTrigger?.focus();
    }
  };

  const selectLocation = async (
    location: ExploreMapLocation,
  ): Promise<void> => {
    const generation = ++interactionGeneration;
    const category = location.category;
    const locale = currentLocale();
    const categoryLabel =
      currentCategories().find((candidate) => candidate.value === category)
        ?.label ?? category;
    activePlace = location.name;
    activePlaceLocation = location;
    activeStage = "detail";
    removeAssistantFlowResults(document);
    exploreFlowBottomSheet?.hide();

    const placeActions =
      "source" in location && location.source === "mapbox"
        ? Object.freeze([])
        : getV1ExplorePlaceActionOptions(category, locale).filter(
            (action) => action.action !== "back-places",
          );
    const description =
      "description" in location && typeof location.description === "string"
        ? location.description.trim()
        : "";

    placeBottomSheet?.show({
      location,
      categoryLabel,
      locale,
      actions: placeActions,
      primaryAction: null,
      ...(description ? { description } : {}),
      status: "loading",
    });
    requestAssistantClose(document);

    const browserFetch = document.defaultView?.fetch?.bind(
      document.defaultView,
    );
    const primaryActionPromise =
      "source" in location && location.source === "mapbox"
        ? Promise.resolve(null)
        : resolvePlacePrimaryAction({
            location,
            locale,
            ...(browserFetch ? { fetch: browserFetch } : {}),
          });

    await renderLocationsOnMap([location], category, true);
    const primaryAction = await primaryActionPromise;
    if (
      generation !== interactionGeneration ||
      activePlace !== location.name
    ) {
      return;
    }

    const mapFailed =
      document.getElementById("map")?.dataset.exploreState === "error";
    placeBottomSheet?.show({
      location,
      categoryLabel,
      locale,
      actions: placeActions,
      primaryAction,
      ...(description ? { description } : {}),
      status: mapFailed ? "error" : "ready",
      ...(mapFailed
        ? {
            statusText: getV1ExploreUiCopy(locale).mapCategoryError(
              getV1ExploreUiCopy(locale).mapUnknown,
            ),
          }
        : {}),
    });

    setExploreRuntimeStatus({ kind: "selected", place: location.name });
    emitStateChange();
  };

  const renderPlaces = (
    locations: readonly ExploreMapLocation[],
    message: string,
  ): void => {
    if (!activeCategory) return;
    placeBottomSheet?.hide();
    placeReturnLocations = Object.freeze([...locations]);
    placeReturnMessage = message;
    placeReturnIsSearch = false;
    activePlace = undefined;
    activePlaceLocation = undefined;
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
  ): void => {
    placeBottomSheet?.hide();
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

    const options = locations.map((location) =>
      Object.freeze({
        label: location.area
          ? `${location.name} · ${location.area}`
          : location.name,
        value: createExploreLocationDetailsCommand(location.name),
        action: "location" as const,
        location,
      }),
    );
    const first = renderFlow(message, options, (option) => {
      void selectLocation(option.location);
    });
    first?.focus();
    emitStateChange();
    void renderLocationsOnMap(locations, "search");
  };

  const returnFromPlaceDetail = (): void => {
    if (placeReturnIsSearch) {
      renderSearchPlaces(
        placeReturnLocations.filter(
          (location): location is ExploreSearchResult =>
            "source" in location &&
            (location.source === "local" || location.source === "mapbox"),
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
      placeBottomSheet?.hide();
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

  placeBottomSheet = installPlaceBottomSheet({
    document,
    onAction(value) {
      const normalized = normalizeSearchText(value);
      const location = activePlaceLocation;
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
      document.dispatchEvent(
        new CustomEvent("morro:assistant-option-selected", {
          detail: { value, optionsOverride: [] },
        }),
      );
      requestAssistantOpen(document);
    },
    onDismiss: returnFromPlaceDetail,
  });

  const startImmersiveTour = (tourId: string): void => {
    exploreFlowBottomSheet?.hide();
    placeBottomSheet?.hide();
    activePlace = undefined;
    activeStage = "tour";
    clearExploreRuntimeStatus();
    removeAssistantFlowResults(document);

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
    placeBottomSheet?.hide();
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
    const trigger = document.getElementById(
      getAssistantCategoryButtonId(category.value),
    );
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
    placeBottomSheet?.hide();
    resetCategoryTriggerState();
    activeCategory = undefined;
    activeCategoryButton = undefined;
    activePlace = undefined;
    activeStage = "menu";
    visibleLocations = Object.freeze([...locations]);
    clearExploreRuntimeStatus();
    showMainMenu();
    updateMapState(locations.length, category, "loading");

    try {
      await geospatialEngine.replaceMarkers(
        locations.map((location, index) => markerForLocation(location, index)),
      );
      if (generation !== interactionGeneration) return false;
      updateMapState(locations.length, category, "ready");
      frameLocationsOnMap(locations, geospatialEngine);
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
      );
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

  const MutationObserverCtor = document.defaultView?.MutationObserver;
  const localeObserver = MutationObserverCtor
    ? new MutationObserverCtor((records) => {
        if (!records.some((record) => record.attributeName === "lang")) return;
        refreshCategoryPresentation();
        if (exploreRuntimeStatusDescriptor) renderExploreRuntimeStatus();
        if (activeStage === "filters" && activeCategory) renderFilters();
        if (activeStage === "detail" && activePlace) {
          const location =
            activePlaceLocation ??
            resolveExploreLocationByName(
              activePlace,
              activeCategory?.value,
            );
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
    if (activeStage === "menu" || !(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!detail || typeof detail !== "object") return;
    const candidate: unknown = Reflect.get(detail, "value");
    const value = typeof candidate === "string" ? candidate : "";

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
      }
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
      placeBottomSheet?.destroy();
      placeBottomSheet = undefined;
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
      activeSearchQuery = "";
      activeStage = "menu";
      visibleLocations = Object.freeze([]);
    },
  });
}
