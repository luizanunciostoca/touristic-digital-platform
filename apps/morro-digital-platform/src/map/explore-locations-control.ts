import { getAssistantMainMenu } from "@touristic/assistant";
import type {
  GeospatialEngine,
  MapboxGlMapLike,
  MapMarker,
} from "@touristic/geospatial";
import {
  morroV1SearchCatalog,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

const DETAILS_COMMAND_PREFIX = "Fale sobre ";
const ASSISTANT_CATEGORY_ID_PREFIX = "assistant-category-";
const ASSISTANT_CATEGORY_RESULTS_ID = "assistant-category-results";
const ASSISTANT_CATEGORY_MESSAGE_ID = "assistant-category-results-message";
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
  if (map?.getLayer?.(TOUR_ROUTE_LAYER)) {
    map.removeLayer?.(TOUR_ROUTE_LAYER);
  }
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

function removeAssistantCategoryResults(document: Document): void {
  document.getElementById(ASSISTANT_CATEGORY_RESULTS_ID)?.remove();
  document.getElementById(ASSISTANT_CATEGORY_MESSAGE_ID)?.remove();
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

function frameCategoryOnMap(
  locations: readonly MorroV1SearchCatalogItem[],
  geospatialEngine: GeospatialEngine | undefined,
): void {
  const bounds = categoryBounds(locations);
  const map = currentMap();
  if (bounds && locations.length > 1 && map?.fitBounds) {
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
    return;
  }
  map?.setCenter([center.longitude, center.latitude]);
}

function createAssistantLocationButton(
  document: Document,
  location: MorroV1SearchCatalogItem,
  onSelect: (location: MorroV1SearchCatalogItem) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "assistant-option-btn assistant-location-option";
  button.textContent = location.name;
  button.dataset.value = createExploreLocationDetailsCommand(location.name);
  button.dataset.locationName = location.name;
  button.dataset.locationCategory = location.category;
  button.setAttribute("aria-label", location.name);
  button.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    onSelect(location);
  });
  return button;
}

function renderAssistantCategoryResults(
  document: Document,
  category: ExploreLocationsCategory,
  locations: readonly MorroV1SearchCatalogItem[],
  onSelect: (location: MorroV1SearchCatalogItem) => void,
): HTMLButtonElement | null {
  ensureAssistantVisible(document);
  const area = assistantMessagesArea(document);
  if (!area) return null;

  removeAssistantCategoryResults(document);

  const message = document.createElement("div");
  message.id = ASSISTANT_CATEGORY_MESSAGE_ID;
  message.className = "message assistant";
  message.dataset.messageType = "category-results";
  message.dataset.category = category.value;
  message.textContent = `${category.label}: encontrei ${locations.length} opções. Escolha um local para ver os detalhes.`;

  const options = document.createElement("div");
  options.id = ASSISTANT_CATEGORY_RESULTS_ID;
  options.className = "assistant-options assistant-category-results";
  options.dataset.category = category.value;
  options.setAttribute("role", "group");
  options.setAttribute("aria-label", `Opções de ${category.label}`);

  for (const location of locations) {
    options.appendChild(
      createAssistantLocationButton(document, location, onSelect),
    );
  }

  area.append(message, options);
  area.scrollTop = area.scrollHeight;
  return options.querySelector<HTMLButtonElement>(".assistant-location-option");
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
  let activeCategory: string | undefined;
  const categoryListeners = new Map<HTMLButtonElement, EventListener>();
  const categories = getExploreLocationsCategories();

  const updateMarkerCount = (count: number, category?: string): void => {
    const mapElement = document.getElementById("map");
    mapElement?.setAttribute("data-map-marker-count", String(count));
    mapElement?.removeAttribute("data-active-tour");
    mapElement?.setAttribute("data-tour-state", "idle");
    if (category) {
      mapElement?.setAttribute("data-explore-category", category);
    } else {
      mapElement?.removeAttribute("data-explore-category");
    }
  };

  const renderCategoryMarkers = async (category: string): Promise<void> => {
    const locations = getExploreLocationsForCategory(category);
    if (!geospatialEngine?.initialized) return;

    const mapElement = document.getElementById("map");
    mapElement?.setAttribute("data-explore-state", "loading");
    try {
      await geospatialEngine.replaceMarkers(
        locations.map((location, index) => markerForLocation(location, index)),
      );
      updateMarkerCount(locations.length, category);
      frameCategoryOnMap(locations, geospatialEngine);
      mapElement?.setAttribute("data-explore-state", "ready");
    } catch (error) {
      mapElement?.setAttribute("data-explore-state", "error");
      try {
        await geospatialEngine.replaceMarkers([]);
        updateMarkerCount(0);
      } catch {
        // Preserve the provider error state if marker cleanup also fails.
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

  const close = (restoreFocus = true): void => {
    removeAssistantCategoryResults(document);
    submenu?.classList.add("hidden");
    submenu?.setAttribute("aria-hidden", "true");
    submenuContainer?.replaceChildren();
    if (activeCategoryButton) {
      activeCategoryButton.setAttribute("aria-expanded", "false");
      activeCategoryButton.setAttribute("aria-pressed", "false");
      if (restoreFocus) activeCategoryButton.focus();
    }
    activeCategory = undefined;
  };

  const selectLocation = (location: MorroV1SearchCatalogItem): void => {
    if (geospatialEngine?.initialized) {
      void geospatialEngine.setCenter({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } else {
      currentMap()?.setCenter([location.longitude, location.latitude]);
    }

    document
      .getElementById("runtime-status")
      ?.replaceChildren(
        document.createTextNode(`${location.name} selecionado.`),
      );

    close(false);
    ensureAssistantVisible(document);
    document.dispatchEvent(
      new CustomEvent("morro:assistant-option-selected", {
        detail: { value: createExploreLocationDetailsCommand(location.name) },
      }),
    );
  };

  const openCategory = (
    category: ExploreLocationsCategory,
    trigger: HTMLButtonElement,
  ): void => {
    if (activeCategoryButton && activeCategoryButton !== trigger) {
      activeCategoryButton.setAttribute("aria-expanded", "false");
      activeCategoryButton.setAttribute("aria-pressed", "false");
    }

    clearTourPresentation(document);
    activeCategory = category.value;
    activeCategoryButton = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-pressed", "true");

    const locations = getExploreLocationsForCategory(category.value);
    const firstOption = renderAssistantCategoryResults(
      document,
      category,
      locations,
      selectLocation,
    );
    firstOption?.focus();
    void renderCategoryMarkers(category.value);
  };

  for (const category of categories) {
    const button = document.querySelector<HTMLButtonElement>(
      `.assistant-options .assistant-option-btn[data-value="${category.value}"]`,
    );
    if (!button) continue;

    button.id = getAssistantCategoryButtonId(category.value);
    button.dataset.exploreCategory = category.value;
    button.setAttribute("aria-controls", ASSISTANT_CATEGORY_RESULTS_ID);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute(
      "aria-label",
      `${category.label}, ${category.count} locais`,
    );

    const onCategoryClick: EventListener = (event) => {
      event.stopImmediatePropagation();
      openCategory(category, button);
    };

    button.addEventListener("click", onCategoryClick);
    categoryListeners.set(button, onCategoryClick);
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !activeCategory) return;
    if (!document.getElementById(ASSISTANT_CATEGORY_RESULTS_ID)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  };

  document.addEventListener("keydown", onKeyDown);

  return Object.freeze({
    close: () => close(),
    setGeospatialEngine(engine: GeospatialEngine | undefined) {
      geospatialEngine = engine;
      if (activeCategory) void renderCategoryMarkers(activeCategory);
    },
    destroy() {
      document.removeEventListener("keydown", onKeyDown);
      for (const [button, listener] of categoryListeners) {
        button.removeEventListener("click", listener);
        button.removeAttribute("data-explore-category");
        button.removeAttribute("aria-controls");
        button.removeAttribute("aria-expanded");
        button.removeAttribute("aria-pressed");
      }
      categoryListeners.clear();
      removeAssistantCategoryResults(document);
      submenuContainer?.replaceChildren();
      submenu?.classList.add("hidden");
      submenu?.setAttribute("aria-hidden", "true");
      geospatialEngine = undefined;
      activeCategory = undefined;
      activeCategoryButton = undefined;
    },
  });
}
