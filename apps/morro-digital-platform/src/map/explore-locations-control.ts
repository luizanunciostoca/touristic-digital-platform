import { getAssistantMainMenu } from "@touristic/assistant";
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

import { getV1ExplorePlaceActionOptions } from "./explore-location-actions-v1.js";
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

type ExploreStage = "menu" | "filters" | "places" | "detail" | "tour";

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
  | Readonly<{ type: "select_place"; place: string }>
  | Readonly<{ type: "back_to_filters" }>
  | Readonly<{ type: "back_to_menu" }>;

export interface ExploreLocationsStateSnapshot {
  readonly category: string | null;
  readonly place: string | null;
  readonly stage: ExploreStage;
  readonly markerCount: number;
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

const categoryValues = new Set(
  morroV1SearchCatalog.map((location) => location.category),
);

export function getExploreLocationsCategories(): readonly ExploreLocationsCategory[] {
  return Object.freeze(
    getAssistantMainMenu("pt")
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
}

function markerForLocation(
  location: MorroV1SearchCatalogItem,
  index: number,
  openPopup = false,
): MapMarker {
  return Object.freeze({
    id:
      location.id?.trim() ||
      `explore:${location.category}:${index}:${location.name}`,
    position: Object.freeze({
      latitude: location.latitude,
      longitude: location.longitude,
    }),
    label: location.name,
    ...(openPopup ? { openPopup: true } : {}),
  });
}

function describeExploreError(error: unknown): string {
  return error instanceof Error ? error.message : "Falha desconhecida no mapa.";
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

function ensureAssistantVisible(document: Document): void {
  const assistant = document.getElementById("assistant-messages");
  if (!assistant?.classList.contains("hidden")) return;
  document.querySelector<HTMLButtonElement>(".mood-button")?.click();
}

function categoryBounds(
  locations: readonly MorroV1SearchCatalogItem[],
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
  locations: readonly MorroV1SearchCatalogItem[],
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
  locations: readonly MorroV1SearchCatalogItem[],
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
  let activeStage: ExploreStage = "menu";
  let visibleLocations: readonly MorroV1SearchCatalogItem[] = Object.freeze([]);
  let mainMenuContainer: HTMLElement | undefined;
  let interactionGeneration = 0;
  const categoryListeners = new Map<HTMLButtonElement, EventListener>();
  const categories = getExploreLocationsCategories();

  const stateSnapshot = (): ExploreLocationsStateSnapshot =>
    Object.freeze({
      category: activeCategory?.value ?? null,
      place: activeStage === "detail" ? (activePlace ?? null) : null,
      stage: activeStage,
      markerCount: Number(
        document.getElementById("map")?.dataset.mapMarkerCount ?? "0",
      ),
    });

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
    locations: readonly MorroV1SearchCatalogItem[],
    category: string,
    openSelectedPopup = false,
  ): Promise<void> => {
    const generation = interactionGeneration;
    visibleLocations = Object.freeze([...locations]);
    if (!geospatialEngine?.initialized) return;

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
        activeCategory?.value !== category
      ) {
        return;
      }
      updateMapState(locations.length, category, "ready");
      frameLocationsOnMap(locations, geospatialEngine);
      emitStateChange();
    } catch (error) {
      if (generation !== interactionGeneration) return;
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
            `Não foi possível exibir esta categoria: ${describeExploreError(error)}`,
          ),
        );
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
  ): HTMLButtonElement | null => {
    ensureAssistantVisible(document);
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
    message.textContent = text;
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
    return container.querySelector<HTMLButtonElement>(".assistant-flow-option");
  };

  const resetCategoryTriggerState = (): void => {
    if (!activeCategoryButton) return;
    activeCategoryButton.setAttribute("aria-expanded", "false");
    activeCategoryButton.setAttribute("aria-pressed", "false");
  };

  const backToMenu = (restoreFocus = true): void => {
    interactionGeneration += 1;
    const previousTrigger = activeCategoryButton;
    removeAssistantFlowResults(document);
    resetCategoryTriggerState();
    activeCategory = undefined;
    activeCategoryButton = undefined;
    activePlace = undefined;
    activeStage = "menu";
    visibleLocations = Object.freeze([]);
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
    location: MorroV1SearchCatalogItem,
  ): Promise<void> => {
    if (!activeCategory) return;
    const generation = ++interactionGeneration;
    activePlace = location.name;
    activeStage = "detail";
    removeAssistantFlowResults(document);
    await renderLocationsOnMap([location], activeCategory.value, true);
    if (
      generation !== interactionGeneration ||
      activeCategory?.value !== location.category
    ) {
      return;
    }
    document
      .getElementById("runtime-status")
      ?.replaceChildren(
        document.createTextNode(`${location.name} selecionado.`),
      );
    emitStateChange();
    ensureAssistantVisible(document);
    const optionsOverride = getV1ExplorePlaceActionOptions(
      activeCategory.value,
    ).map(({ label, value }) => Object.freeze({ label, value }));
    document.dispatchEvent(
      new CustomEvent("morro:assistant-option-selected", {
        detail: {
          value: createExploreLocationDetailsCommand(location.name),
          optionsOverride: Object.freeze(optionsOverride),
        },
      }),
    );
  };

  const renderPlaces = (
    locations: readonly MorroV1SearchCatalogItem[],
    message: string,
  ): void => {
    if (!activeCategory) return;
    activePlace = undefined;
    activeStage = "places";
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
        label: "🔙 Voltar aos filtros",
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

  const startImmersiveTour = (tourId: string): void => {
    const tourSelect = document.getElementById("tour-select");
    if (!(tourSelect instanceof HTMLSelectElement)) return;
    activePlace = undefined;
    activeStage = "tour";
    removeAssistantFlowResults(document);
    tourSelect.value = tourId;
    tourSelect.dispatchEvent(new Event("change", { bubbles: true }));
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
        `${categoryLabel}: encontrei ${allLocations.length} opções. Escolha um local para ver os detalhes.`,
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
          ? `${categoryLabel}: estes são os ${nearby.length} locais mais próximos de você.`
          : `Não consegui obter sua localização. Mostrando ${allLocations.length} opções de ${categoryLabel}.`,
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
        ? `${categoryLabel}: encontrei ${filtered.length} opção(ões) para ${option.label.replace(/^\S+\s/u, "")}.`
        : `Não encontrei correspondência exata para ${option.label.replace(/^\S+\s/u, "")}. Mostrando todos os ${allLocations.length} locais.`,
    );
  };

  function renderFilters(): void {
    if (!activeCategory) return;
    activePlace = undefined;
    activeStage = "filters";
    const allLocations = getExploreLocationsForCategory(activeCategory.value);
    const filters = getV1ExploreSubcategoryOptions(activeCategory.value);

    const first = renderFlow(
      `${activeCategory.label}: encontrei ${allLocations.length} locais. Como você quer filtrar?`,
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

    clearTourPresentation(document);
    activeCategory = category;
    activeCategoryButton = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-pressed", "true");
    renderFilters();
  };

  const openCategoryByValue = (categoryValue: string): boolean => {
    const normalized = normalizeSearchText(categoryValue);
    const category = categories.find(
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

  const execute = async (
    command: ExploreLocationsCommand,
  ): Promise<boolean> => {
    if (command.type === "open_category") {
      return openCategoryByValue(command.category);
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

    if (command.type === "select_place") {
      const normalized = normalizeSearchText(command.place);
      const location = morroV1SearchCatalog.find(
        (candidate) => normalizeSearchText(candidate.name) === normalized,
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
        `${activeCategory.label}: encontrei ${allLocations.length} opções. Escolha um local para ver os detalhes.`,
      );
      return true;
    }

    const flowOptions = getV1ExploreSubcategoryOptions(activeCategory.value);
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

  for (const category of categories) {
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
      `${category.label}, ${category.count} locais`,
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

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || activeStage === "menu") return;
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
      const allLocations = getExploreLocationsForCategory(activeCategory.value);
      renderPlaces(
        allLocations,
        `${activeCategory.label}: escolha outro local para ver os detalhes.`,
      );
      return;
    }

    if (!isBackToMenuValue(value)) return;
    event.stopImmediatePropagation();
    backToMenu(false);
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener(
    "morro:assistant-option-selected",
    onAssistantOptionSelected,
  );

  return Object.freeze({
    execute,
    getState: stateSnapshot,
    close: () => backToMenu(),
    setGeospatialEngine(engine: GeospatialEngine | undefined) {
      geospatialEngine = engine;
      if (activeCategory && visibleLocations.length > 0) {
        void renderLocationsOnMap(
          visibleLocations,
          activeCategory.value,
          activeStage === "detail" && visibleLocations.length === 1,
        );
      }
    },
    destroy() {
      interactionGeneration += 1;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener(
        "morro:assistant-option-selected",
        onAssistantOptionSelected,
      );
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
      activeStage = "menu";
      visibleLocations = Object.freeze([]);
    },
  });
}
