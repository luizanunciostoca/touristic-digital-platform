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

export interface ExploreLocationsCategory {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface ExploreLocationsControlOptions {
  readonly document: Document;
}

export interface ExploreLocationsControl {
  close(): void;
  setGeospatialEngine(engine: GeospatialEngine | undefined): void;
  destroy(): void;
}

interface MapboxCompatibilityGlobal {
  readonly mapboxPrimaryInstance?: MapboxGlMapLike;
}

type ExploreStage = "menu" | "filters" | "places" | "tour";

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
  if (map?.getSource?.(TOUR_ROUTE_SOURCE))
    map.removeSource?.(TOUR_ROUTE_SOURCE);

  const tourSelect = document.getElementById("tour-select");
  if (tourSelect instanceof HTMLSelectElement) tourSelect.selectedIndex = -1;
}

function markerForLocation(
  location: MorroV1SearchCatalogItem,
  index: number,
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
    if (geospatialEngine?.initialized) {
      void geospatialEngine.setCenter({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } else {
      map?.setCenter([location.longitude, location.latitude]);
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
  let activeStage: ExploreStage = "menu";
  let visibleLocations: readonly MorroV1SearchCatalogItem[] = Object.freeze([]);
  let mainMenuContainer: HTMLElement | undefined;
  const categoryListeners = new Map<HTMLButtonElement, EventListener>();
  const categories = getExploreLocationsCategories();

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
  };

  const renderLocationsOnMap = async (
    locations: readonly MorroV1SearchCatalogItem[],
    category: string,
  ): Promise<void> => {
    visibleLocations = Object.freeze([...locations]);
    if (!geospatialEngine?.initialized) return;

    updateMapState(locations.length, category, "loading");
    try {
      await geospatialEngine.replaceMarkers(
        locations.map((location, index) => markerForLocation(location, index)),
      );
      updateMapState(locations.length, category, "ready");
      frameLocationsOnMap(locations, geospatialEngine);
    } catch (error) {
      updateMapState(0, undefined, "error");
      try {
        await geospatialEngine.replaceMarkers([]);
      } catch {
        // Preserve the first provider failure for diagnostics.
      }
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

  const renderFlow = (
    text: string,
    options: readonly Readonly<{
      label: string;
      value: string;
      action?: string;
      location?: MorroV1SearchCatalogItem;
      tourId?: string;
    }>[],
    onSelect: (option: (typeof options)[number]) => void,
  ): HTMLButtonElement | null => {
    ensureAssistantVisible(document);
    const area = assistantMessagesArea(document);
    if (!area) return null;

    removeAssistantFlowResults(document);
    hideMainMenu();

    const message = document.createElement("div");
    message.id = ASSISTANT_FLOW_MESSAGE_ID;
    message.className = "message assistant";
    message.dataset.messageType = "category-flow";
    message.dataset.category = activeCategory?.value ?? "";
    message.textContent = text;

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

    area.append(message, container);
    area.scrollTop = area.scrollHeight;
    return container.querySelector<HTMLButtonElement>(".assistant-flow-option");
  };

  const resetCategoryTriggerState = (): void => {
    if (!activeCategoryButton) return;
    activeCategoryButton.setAttribute("aria-expanded", "false");
    activeCategoryButton.setAttribute("aria-pressed", "false");
  };

  const backToMenu = (restoreFocus = true): void => {
    const previousTrigger = activeCategoryButton;
    removeAssistantFlowResults(document);
    resetCategoryTriggerState();
    activeCategory = undefined;
    activeCategoryButton = undefined;
    activeStage = "menu";
    visibleLocations = Object.freeze([]);
    showMainMenu();
    updateMapState(
      Number(document.getElementById("map")?.dataset.mapMarkerCount ?? "0"),
      undefined,
    );
    if (restoreFocus) {
      previousTrigger?.focus();
    }
  };

  const selectLocation = async (
    location: MorroV1SearchCatalogItem,
  ): Promise<void> => {
    if (!activeCategory) return;
    activeStage = "places";
    removeAssistantFlowResults(document);
    await renderLocationsOnMap([location], activeCategory.value);
    document
      .getElementById("runtime-status")
      ?.replaceChildren(
        document.createTextNode(`${location.name} selecionado.`),
      );
    ensureAssistantVisible(document);
    document.dispatchEvent(
      new CustomEvent("morro:assistant-option-selected", {
        detail: { value: createExploreLocationDetailsCommand(location.name) },
      }),
    );
  };

  const renderPlaces = (
    locations: readonly MorroV1SearchCatalogItem[],
    message: string,
  ): void => {
    if (!activeCategory) return;
    activeStage = "places";
    const options = [
      ...locations.map((location) => ({
        label: location.name,
        value: createExploreLocationDetailsCommand(location.name),
        action: "location",
        location,
      })),
      {
        label: "🔙 Voltar aos filtros",
        value: "voltar_filtros",
        action: "back-filters",
      },
    ];

    const first = renderFlow(message, options, (option) => {
      if (option.action === "back-filters") {
        renderFilters();
        return;
      }
      if (option.location) void selectLocation(option.location);
    });
    first?.focus();
    void renderLocationsOnMap(locations, activeCategory.value);
  };

  const startImmersiveTour = (tourId: string): void => {
    const tourSelect = document.getElementById("tour-select");
    if (!(tourSelect instanceof HTMLSelectElement)) return;
    activeStage = "tour";
    removeAssistantFlowResults(document);
    tourSelect.value = tourId;
    tourSelect.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const applyFlowOption = async (option: V1ExploreOption): Promise<void> => {
    if (!activeCategory) return;
    const allLocations = getExploreLocationsForCategory(activeCategory.value);

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
        `${activeCategory.label}: encontrei ${allLocations.length} opções. Escolha um local para ver os detalhes.`,
      );
      return;
    }
    if (option.action === "nearby") {
      const position = await getCurrentPosition(document);
      const nearby = position
        ? sortV1ExploreNearby(allLocations, position, 12)
        : allLocations;
      renderPlaces(
        nearby,
        position
          ? `${activeCategory.label}: estes são os ${nearby.length} locais mais próximos de você.`
          : `Não consegui obter sua localização. Mostrando ${allLocations.length} opções de ${activeCategory.label}.`,
      );
      return;
    }

    const filtered = filterV1ExploreLocations(
      activeCategory.value,
      option.value,
      allLocations,
    );
    const displayed = filtered.length > 0 ? filtered : allLocations;
    renderPlaces(
      displayed,
      filtered.length > 0
        ? `${activeCategory.label}: encontrei ${filtered.length} opção(ões) para ${option.label.replace(/^\S+\s/u, "")}.`
        : `Não encontrei correspondência exata para ${option.label.replace(/^\S+\s/u, "")}. Mostrando todos os ${allLocations.length} locais.`,
    );
  };

  function renderFilters(): void {
    if (!activeCategory) return;
    activeStage = "filters";
    const allLocations = getExploreLocationsForCategory(activeCategory.value);
    const filters = getV1ExploreSubcategoryOptions(activeCategory.value);

    const first = renderFlow(
      `${activeCategory.label}: encontrei ${allLocations.length} locais. Como você quer filtrar?`,
      filters,
      (option) => void applyFlowOption(option),
    );
    first?.focus();
    void renderLocationsOnMap(allLocations, activeCategory.value);
  }

  const openCategory = (
    category: ExploreLocationsCategory,
    trigger: HTMLButtonElement,
  ): void => {
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
    const value =
      event.detail && typeof event.detail.value === "string"
        ? event.detail.value
        : "";
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
    close: () => backToMenu(),
    setGeospatialEngine(engine: GeospatialEngine | undefined) {
      geospatialEngine = engine;
      if (activeCategory && visibleLocations.length > 0) {
        void renderLocationsOnMap(visibleLocations, activeCategory.value);
      }
    },
    destroy() {
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
      activeStage = "menu";
      visibleLocations = Object.freeze([]);
    },
  });
}
