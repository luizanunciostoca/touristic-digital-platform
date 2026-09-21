import type { AssistantLocale } from "@touristic/assistant";
import type { MorroV1SearchCatalogItem } from "@touristic/search";

import { resolveAssistantV1Photos } from "../assistant/assistant-v1-photo-catalog.js";
import type { V1ExplorePlaceActionOption } from "./explore-location-actions-v1.js";
import type { PlacePrimaryAction } from "./place-commerce-capability.js";

export type PlaceBottomSheetState = "peek" | "half" | "full";

export interface PlaceBottomSheetPresentation {
  readonly location: MorroV1SearchCatalogItem;
  readonly categoryLabel: string;
  readonly locale: AssistantLocale;
  readonly actions: readonly V1ExplorePlaceActionOption[];
  readonly primaryAction: PlacePrimaryAction | null;
}

export interface PlaceBottomSheetOptions {
  readonly document: Document;
  readonly onAction: (value: string) => void;
  readonly onDismiss: () => void;
}
export interface PlaceBottomSheetController {
  show(presentation: PlaceBottomSheetPresentation): void;
  hide(): void;
  setState(state: PlaceBottomSheetState): void;
  getState(): PlaceBottomSheetState;
  destroy(): void;
}

const copy = Object.freeze({
  pt: {
    close: "Fechar detalhes do lugar",
    states: {
      peek: "Mostrar resumo",
      half: "Mostrar detalhes",
      full: "Expandir detalhes",
    },
  },
  en: {
    close: "Close place details",
    states: {
      peek: "Show summary",
      half: "Show details",
      full: "Expand details",
    },
  },
  es: {
    close: "Cerrar detalles del lugar",
    states: {
      peek: "Mostrar resumen",
      half: "Mostrar detalles",
      full: "Expandir detalles",
    },
  },
  he: {
    close: "סגירת פרטי המקום",
    states: {
      peek: "הצגת תקציר",
      half: "הצגת פרטים",
      full: "הרחבת הפרטים",
    },
  },
} satisfies Readonly<
  Record<
    AssistantLocale,
    {
      readonly close: string;
      readonly states: Readonly<Record<PlaceBottomSheetState, string>>;
    }
  >
>);

const stateGlyph: Readonly<Record<PlaceBottomSheetState, string>> =
  Object.freeze({
    peek: "⌄",
    half: "—",
    full: "⌃",
  });
function createStateButton(
  document: Document,
  state: PlaceBottomSheetState,
  locale: AssistantLocale,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-icon-button place-bottom-sheet-state-button";
  button.dataset.sheetStateTarget = state;
  button.setAttribute("aria-label", copy[locale].states[state]);
  button.title = copy[locale].states[state];
  button.textContent = stateGlyph[state];
  return button;
}

function normalizedTags(location: MorroV1SearchCatalogItem): readonly string[] {
  return Object.freeze(
    Array.from(new Set(location.tags ?? []))
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 3),
  );
}
export function installPlaceBottomSheet(
  options: PlaceBottomSheetOptions,
): PlaceBottomSheetController {
  const { document } = options;
  let destroyed = false;
  let state: PlaceBottomSheetState = "half";

  const sheet = document.createElement("aside");
  sheet.id = "place-bottom-sheet";
  sheet.className = "md-bottom-sheet md-card place-bottom-sheet hidden";
  sheet.dataset.sheetState = state;
  sheet.setAttribute("role", "region");
  sheet.setAttribute("aria-hidden", "true");

  const toolbar = document.createElement("div");
  toolbar.className = "place-bottom-sheet-toolbar";

  const handle = document.createElement("div");
  handle.className = "md-bottom-sheet-handle";
  handle.setAttribute("aria-hidden", "true");
  toolbar.appendChild(handle);
  const stateControls = document.createElement("div");
  stateControls.className = "place-bottom-sheet-state-controls";
  stateControls.setAttribute("role", "group");
  toolbar.appendChild(stateControls);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "md-icon-button place-bottom-sheet-close";
  close.textContent = "×";
  toolbar.appendChild(close);

  const content = document.createElement("div");
  content.className = "md-bottom-sheet-content place-bottom-sheet-content";

  const hero = document.createElement("div");
  hero.className = "place-bottom-sheet-hero hidden";
  const heroImage = document.createElement("img");
  heroImage.className = "place-bottom-sheet-image";
  heroImage.loading = "lazy";
  heroImage.decoding = "async";
  hero.appendChild(heroImage);
  content.appendChild(hero);
  const body = document.createElement("div");
  body.className = "place-bottom-sheet-body";

  const meta = document.createElement("div");
  meta.className = "place-bottom-sheet-meta";

  const title = document.createElement("h2");
  title.id = "place-bottom-sheet-title";
  title.className = "place-bottom-sheet-title";
  sheet.setAttribute("aria-labelledby", title.id);

  const tags = document.createElement("div");
  tags.className = "place-bottom-sheet-tags";

  const actions = document.createElement("div");
  actions.className = "place-bottom-sheet-actions";
  actions.setAttribute("role", "group");

  const primary = document.createElement("div");
  primary.className = "place-bottom-sheet-primary";

  body.append(meta, title, tags, actions, primary);
  content.appendChild(body);
  sheet.append(toolbar, content);
  document.body.appendChild(sheet);

  const setState = (nextState: PlaceBottomSheetState): void => {
    if (destroyed) return;
    state = nextState;
    sheet.dataset.sheetState = nextState;
    for (const child of Array.from(stateControls.children)) {
      if (!(child instanceof HTMLButtonElement)) continue;
      if (!child.dataset.sheetStateTarget) continue;
      child.setAttribute(
        "aria-pressed",
        String(child.dataset.sheetStateTarget === nextState),
      );
    }
  };

  const rebuildStateControls = (locale: AssistantLocale): void => {
    stateControls.replaceChildren();
    for (const target of ["peek", "half", "full"] as const) {
      const button = createStateButton(document, target, locale);
      button.addEventListener("click", () => setState(target));
      stateControls.appendChild(button);
    }
    setState(state);
  };
  const render = (next: PlaceBottomSheetPresentation): void => {
    const localeCopy = copy[next.locale];
    close.setAttribute("aria-label", localeCopy.close);
    close.title = localeCopy.close;
    rebuildStateControls(next.locale);

    sheet.dataset.placeName = next.location.name;
    sheet.dataset.placeCategory = next.location.category;
    meta.textContent = [next.categoryLabel, next.location.area]
      .filter(Boolean)
      .join(" · ");
    title.textContent = next.location.name;

    const photo = resolveAssistantV1Photos(next.location.name)?.images[0];
    if (photo) {
      heroImage.src = photo;
      heroImage.alt = next.location.name;
      hero.classList.remove("hidden");
    } else {
      heroImage.removeAttribute("src");
      heroImage.alt = "";
      hero.classList.add("hidden");
    }
    tags.replaceChildren();
    for (const tag of normalizedTags(next.location)) {
      const chip = document.createElement("span");
      chip.className = "md-chip place-bottom-sheet-tag";
      chip.textContent = tag;
      tags.appendChild(chip);
    }
    tags.classList.toggle("hidden", tags.childElementCount === 0);

    actions.replaceChildren();
    for (const action of next.actions) {
      if (action.action !== "command") continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "md-button md-button--secondary place-bottom-sheet-action";
      button.dataset.value = action.value;
      button.textContent = action.label;
      button.addEventListener("click", () => options.onAction(action.value));
      actions.appendChild(button);
    }

    primary.replaceChildren();
    if (next.primaryAction) {
      const primaryAction = next.primaryAction;
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "md-button md-button--primary place-bottom-sheet-primary-action";
      button.dataset.value = primaryAction.value;
      button.textContent = primaryAction.label;
      button.disabled = primaryAction.disabled === true;
      button.addEventListener("click", () =>
        options.onAction(primaryAction.value),
      );
      primary.appendChild(button);
    }

    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
  };

  close.addEventListener("click", () => options.onDismiss());
  heroImage.addEventListener("error", () => {
    hero.classList.add("hidden");
  });

  return Object.freeze({
    show(next: PlaceBottomSheetPresentation): void {
      if (destroyed) return;
      render(next);
    },
    hide(): void {
      if (destroyed) return;
      sheet.classList.add("hidden");
      sheet.setAttribute("aria-hidden", "true");
      delete sheet.dataset.placeName;
      delete sheet.dataset.placeCategory;
    },
    setState,
    getState(): PlaceBottomSheetState {
      return state;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      sheet.remove();
    },
  });
}
