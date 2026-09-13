import { getAssistantMainMenu } from "@touristic/assistant";
import {
  morroV1SearchCatalog,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";
import type { MapboxGlMapLike } from "@touristic/geospatial";

const DETAILS_COMMAND_PREFIX = "Fale sobre ";

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

function currentMap(): MapboxGlMapLike | undefined {
  return (globalThis as typeof globalThis & MapboxCompatibilityGlobal)
    .mapboxPrimaryInstance;
}

function locationDescription(location: MorroV1SearchCatalogItem): string | null {
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

export function installExploreLocationsControl({
  document,
}: ExploreLocationsControlOptions): ExploreLocationsControl {
  const shell = document.querySelector<HTMLElement>(".app-shell");
  const submenu = document.getElementById("submenu");
  const submenuContainer = document.getElementById("submenuContainer");
  const submenuTitle = submenu?.querySelector<HTMLElement>(".submenu-title");
  const closeButton = submenu?.querySelector<HTMLButtonElement>(".close-button");

  if (!shell || !submenu || !submenuContainer || !submenuTitle || !closeButton) {
    return Object.freeze({
      close() {},
      destroy() {},
    });
  }

  const existingControls = document.getElementById("controls");
  existingControls?.remove();

  const controls = document.createElement("nav");
  controls.id = "controls";
  controls.setAttribute("aria-label", "Explorar locais");

  const buttonGroup = document.createElement("div");
  buttonGroup.id = "buttonGroup";
  controls.appendChild(buttonGroup);
  shell.appendChild(controls);

  submenu.setAttribute("aria-hidden", "true");
  submenu.setAttribute("aria-labelledby", "explore-locations-title");
  submenuTitle.id = "explore-locations-title";

  let activeCategoryButton: HTMLButtonElement | undefined;
  let activeCategory: string | undefined;

  const categories = getExploreLocationsCategories();

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
    currentMap()?.setCenter([location.longitude, location.latitude]);
    document.getElementById("runtime-status")?.replaceChildren(
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

    activeCategory = category.value;
    activeCategoryButton = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-pressed", "true");
    submenuTitle.textContent = `Explorar locais — ${category.label}`;

    const list = document.createElement("div");
    list.className = "submenu-location-list";
    list.dataset.category = category.value;

    for (const location of getExploreLocationsForCategory(category.value)) {
      list.appendChild(createLocationButton(document, location, selectLocation));
    }

    submenuContainer.replaceChildren(list);
    submenu.classList.remove("hidden");
    submenu.setAttribute("aria-hidden", "false");
    list.querySelector<HTMLButtonElement>(".submenu-item")?.focus();
  };

  for (const category of categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button";
    button.dataset.exploreCategory = category.value;
    button.textContent = category.label;
    button.setAttribute("aria-controls", "submenu");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute(
      "aria-label",
      `${category.label}, ${category.count} locais`,
    );
    button.addEventListener("click", () => {
      if (
        activeCategory === category.value &&
        submenu.getAttribute("aria-hidden") === "false"
      ) {
        close();
        return;
      }
      openCategory(category, button);
    });
    buttonGroup.appendChild(button);
  }

  const onCloseClick = (): void => close();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || submenu.classList.contains("hidden")) return;
    event.preventDefault();
    close();
  };

  closeButton.addEventListener("click", onCloseClick);
  document.addEventListener("keydown", onKeyDown);

  return Object.freeze({
    close: () => close(),
    destroy() {
      closeButton.removeEventListener("click", onCloseClick);
      document.removeEventListener("keydown", onKeyDown);
      controls.remove();
      submenuContainer.replaceChildren();
      submenuTitle.textContent = "Explorar locais";
      submenu.classList.add("hidden");
      submenu.setAttribute("aria-hidden", "true");
    },
  });
}
