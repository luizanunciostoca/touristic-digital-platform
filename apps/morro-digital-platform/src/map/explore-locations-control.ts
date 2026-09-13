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

function locationDescription(
  location: MorroV1SearchCatalogItem,
): string | null {
  if (location.area?.trim()) return location.area.trim();
  const firstTag = location.tags?.find((tag) => tag.trim().length > 0);
  return firstTag?.trim() ?? null;
}

function createLocationButton(
  document: Document,
  location: MorroV1SearchCatalogItem,
  onSelect: (location: MorroV1SearchCatalogItem) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "submenu-item";
  button.dataset.locationName = location.name;
  button.dataset.locationCategory = location.category;

  const content = document.createElement("span");
  content.className = "submenu-item-content";

  const title = document.createElement("span");
  title.className = "submenu-item-title";
  title.textContent = location.name;
  content.appendChild(title);

  const description = locationDescription(location);
  if (description) {
    const descriptionElement = document.createElement("span");
    descriptionElement.className = "submenu-item-description";
    descriptionElement.textContent = description;
    content.appendChild(descriptionElement);
  }

  button.appendChild(content);
  button.addEventListener("click", () => onSelect(location));
  return button;
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

export function installExploreLocationsControl({
  document,
}: ExploreLocationsControlOptions): ExploreLocationsControl {
  const submenu = document.getElementById("submenu");
  const submenuContainer = document.getElementById("submenuContainer");
  const submenuTitle = submenu?.querySelector<HTMLElement>(".submenu-title");
  const closeButton =
    submenu?.querySelector<HTMLButtonElement>(".close-button");

  // Remove the obsolete duplicate category rail if a stale shell injected it.
  document.getElementById("controls")?.remove();

  if (!submenu || !submenuContainer || !submenuTitle || !closeButton) {
    return Object.freeze({
      close() {},
      setGeospatialEngine() {},
      destroy() {},
    });
  }

  submenu.setAttribute("aria-hidden", "true");
  submenu.setAttribute("aria-labelledby", "explore-locations-title");
  submenuTitle.id = "explore-locations-title";

  let geospatialEngine: GeospatialEngine | undefined;
  let activeCategoryButton: HTMLButtonElement | undefined;
  let activeCategory: string | undefined;
  const categoryListeners = new Map<HTMLButtonElement, EventListener>();
  const categories = getExploreLocationsCategories();

  const updateMarkerCount = (count: number): void => {
    const mapElement = document.getElementById("map");
    mapElement?.setAttribute("data-map-marker-count", String(count));
    mapElement?.removeAttribute("data-active-tour");
    mapElement?.setAttribute("data-tour-state", "idle");
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
      updateMarkerCount(locations.length);
      mapElement?.setAttribute("data-explore-state", "ready");
    } catch (error) {
      mapElement?.setAttribute("data-explore-state", "error");
      try {
        await geospatialEngine.replaceMarkers([]);
        updateMarkerCount(0);
      } catch {
        // Keep the previous marker count untouched when the provider cannot
        // recover; the error state remains observable for diagnostics.
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
    submenu.classList.add("hidden");
    submenu.setAttribute("aria-hidden", "true");
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

    const assistant = document.getElementById("assistant-messages");
    if (assistant?.classList.contains("hidden")) {
      document.querySelector<HTMLButtonElement>(".mood-button")?.click();
    }

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
    submenuTitle.textContent = `Explorar locais — ${category.label}`;

    const list = document.createElement("div");
    list.className = "submenu-location-list";
    list.dataset.category = category.value;

    for (const location of getExploreLocationsForCategory(category.value)) {
      list.appendChild(
        createLocationButton(document, location, selectLocation),
      );
    }

    submenuContainer.replaceChildren(list);
    submenu.classList.remove("hidden");
    submenu.setAttribute("aria-hidden", "false");
    list.querySelector<HTMLButtonElement>(".submenu-item")?.focus();
    void renderCategoryMarkers(category.value);
  };

  for (const category of categories) {
    const button = document.querySelector<HTMLButtonElement>(
      `.assistant-options .assistant-option-btn[data-value="${category.value}"]`,
    );
    if (!button) continue;

    button.id = getAssistantCategoryButtonId(category.value);
    button.dataset.exploreCategory = category.value;
    button.setAttribute("aria-controls", "submenu");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute(
      "aria-label",
      `${category.label}, ${category.count} locais`,
    );

    const onCategoryClick: EventListener = (event) => {
      // The assistant modal category button is the single owner of this action.
      // Stop the generic assistant-option listener from submitting a duplicate command.
      event.stopImmediatePropagation();
      if (
        activeCategory === category.value &&
        submenu.getAttribute("aria-hidden") === "false"
      ) {
        close();
        return;
      }
      openCategory(category, button);
    };

    button.addEventListener("click", onCategoryClick);
    categoryListeners.set(button, onCategoryClick);
  }

  const onCloseClick = (): void => close();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || submenu.classList.contains("hidden")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  };

  closeButton.addEventListener("click", onCloseClick);
  document.addEventListener("keydown", onKeyDown);

  return Object.freeze({
    close: () => close(),
    setGeospatialEngine(engine: GeospatialEngine | undefined) {
      geospatialEngine = engine;
      if (activeCategory) void renderCategoryMarkers(activeCategory);
    },
    destroy() {
      closeButton.removeEventListener("click", onCloseClick);
      document.removeEventListener("keydown", onKeyDown);
      for (const [button, listener] of categoryListeners) {
        button.removeEventListener("click", listener);
        button.removeAttribute("data-explore-category");
        button.removeAttribute("aria-controls");
        button.removeAttribute("aria-expanded");
        button.removeAttribute("aria-pressed");
      }
      categoryListeners.clear();
      submenuContainer.replaceChildren();
      submenuTitle.textContent = "Explorar locais";
      submenu.classList.add("hidden");
      submenu.setAttribute("aria-hidden", "true");
      geospatialEngine = undefined;
    },
  });
}
