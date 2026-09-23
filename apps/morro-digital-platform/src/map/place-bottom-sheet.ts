import type { AssistantLocale } from "@touristic/assistant";
import { resolveAssistantV1Photos } from "../assistant/assistant-v1-photo-catalog.js";
import type { V1ExplorePlaceActionOption } from "./explore-location-actions-v1.js";
import { getV1ExploreLabel } from "./explore-v1-i18n.js";
import type { PlacePrimaryAction } from "./place-commerce-capability.js";

export type PlaceBottomSheetState = "peek" | "half" | "full";

export type PlaceBottomSheetStatus = "loading" | "ready" | "error";

export interface PlaceBottomSheetLocation {
  readonly name: string;
  readonly category: string;
  readonly area?: string | null;
  readonly tags?: readonly string[];
}

export interface PlaceBottomSheetPresentation {
  readonly location: PlaceBottomSheetLocation;
  readonly categoryLabel: string;
  readonly locale: AssistantLocale;
  readonly actions: readonly V1ExplorePlaceActionOption[];
  readonly primaryAction: PlacePrimaryAction | null;
  readonly actionsInContextualRail?: boolean;
  readonly description?: string;
  readonly rating?: Readonly<{ value: number; count?: number }>;
  readonly status?: PlaceBottomSheetStatus;
  readonly statusText?: string;
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
  setStatus(status: PlaceBottomSheetStatus, text?: string): void;
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

const placeUiCopy = Object.freeze({
  pt: {
    save: "Salvar",
    share: "Compartilhar",
    shareSuccess: "Link do local copiado.",
    loading: "Carregando detalhes do local…",
    unavailable: "Alguns detalhes do local estão indisponíveis no momento.",
    rating: "Avaliação",
    more: "Mais opções",
  },
  en: {
    save: "Save",
    share: "Share",
    shareSuccess: "Place link copied.",
    loading: "Loading place details…",
    unavailable: "Some place details are currently unavailable.",
    rating: "Rating",
    more: "More options",
  },
  es: {
    save: "Guardar",
    share: "Compartir",
    shareSuccess: "Enlace del lugar copiado.",
    loading: "Cargando detalles del lugar…",
    unavailable: "Algunos detalles del lugar no están disponibles ahora.",
    rating: "Valoración",
    more: "Más opciones",
  },
  he: {
    save: "שמירה",
    share: "שיתוף",
    shareSuccess: "הקישור למקום הועתק.",
    loading: "טוען פרטי מקום…",
    unavailable: "חלק מפרטי המקום אינם זמינים כרגע.",
    rating: "דירוג",
    more: "אפשרויות נוספות",
  },
} satisfies Readonly<
  Record<
    AssistantLocale,
    Readonly<{
      save: string;
      share: string;
      shareSuccess: string;
      loading: string;
      unavailable: string;
      rating: string;
      more: string;
    }>
  >
>);

function normalizedTags(location: PlaceBottomSheetLocation): readonly string[] {
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
  let compatibilityValues = new Set<string>();

  const sheet = document.createElement("aside");
  sheet.id = "place-bottom-sheet";
  sheet.className = "md-bottom-sheet md-card place-bottom-sheet hidden";
  sheet.dataset.sheetState = state;
  sheet.setAttribute("role", "region");
  sheet.setAttribute("aria-hidden", "true");

  const toolbar = document.createElement("div");
  toolbar.className = "place-bottom-sheet-toolbar";

  const handle = document.createElement("div");
  handle.className = "md-bottom-sheet-handle place-bottom-sheet-drag-handle";
  handle.tabIndex = 0;
  handle.setAttribute("role", "button");
  toolbar.appendChild(handle);

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
  sheet.tabIndex = -1;

  const description = document.createElement("p");
  description.className = "place-bottom-sheet-description hidden";

  const rating = document.createElement("p");
  rating.className = "place-bottom-sheet-rating hidden";

  const status = document.createElement("div");
  status.className = "place-bottom-sheet-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const tags = document.createElement("div");
  tags.className = "place-bottom-sheet-tags";

  const actions = document.createElement("div");
  actions.className = "place-bottom-sheet-actions";
  actions.setAttribute("role", "group");

  const primary = document.createElement("div");
  primary.className = "place-bottom-sheet-primary";

  const overflow = document.createElement("details");
  overflow.className = "place-bottom-sheet-overflow hidden";
  const overflowSummary = document.createElement("summary");
  overflowSummary.className =
    "md-button md-button--secondary place-bottom-sheet-overflow-summary";
  const overflowActions = document.createElement("div");
  overflowActions.className = "place-bottom-sheet-overflow-actions";
  overflow.append(overflowSummary, overflowActions);

  body.append(
    title,
    rating,
    description,
    meta,
    status,
    tags,
    actions,
    primary,
    overflow,
  );
  content.appendChild(body);
  sheet.append(toolbar, content);
  document.body.appendChild(sheet);

  const syncCompatibilitySource = (): void => {
    const active = sheet.getAttribute("aria-hidden") === "false";
    const containers = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#assistant-messages .assistant-options:not(#assistant-category-results):not(:has([data-explore-category])):not([data-presentation="photo-actions"])',
      ),
    );
    for (const container of containers) {
      const values = Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          ".assistant-option-btn[data-value]",
        ),
        (button) => button.dataset.value ?? "",
      ).filter(Boolean);
      const matchesInitialPlaceActions =
        active &&
        compatibilityValues.size > 0 &&
        values.length > 0 &&
        values.every((value) => compatibilityValues.has(value)) &&
        values.some((value) => compatibilityValues.has(value));

      if (matchesInitialPlaceActions) {
        container.classList.add("place-bottom-sheet-compat-source");
        container.setAttribute("aria-hidden", "true");
        container.setAttribute("inert", "");
      } else if (
        container.classList.contains("place-bottom-sheet-compat-source")
      ) {
        container.classList.remove("place-bottom-sheet-compat-source");
        container.removeAttribute("aria-hidden");
        container.removeAttribute("inert");
      }
    }
  };

  const assistantArea = document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
  const MutationObserverCtor = document.defaultView?.MutationObserver;
  const assistantObserver = MutationObserverCtor
    ? new MutationObserverCtor(() => {
        queueMicrotask(syncCompatibilitySource);
      })
    : null;
  if (assistantArea && assistantObserver) {
    assistantObserver.observe(assistantArea, {
      childList: true,
      subtree: true,
    });
  }

  const setStatus = (
    nextStatus: PlaceBottomSheetStatus,
    text?: string,
  ): void => {
    sheet.dataset.placeState = nextStatus;
    sheet.setAttribute("aria-busy", String(nextStatus === "loading"));
    status.replaceChildren();
    if (nextStatus === "ready") {
      status.classList.add("hidden");
      return;
    }
    status.classList.remove("hidden");
    if (nextStatus === "loading") {
      const skeleton = document.createElement("span");
      skeleton.className = "md-skeleton place-bottom-sheet-status-skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      status.appendChild(skeleton);
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = text || placeUiCopy.pt.loading;
      status.appendChild(sr);
      return;
    }
    status.textContent = text || placeUiCopy.pt.unavailable;
  };

  const setState = (nextState: PlaceBottomSheetState): void => {
    if (destroyed) return;
    state = nextState;
    sheet.dataset.sheetState = nextState;
    handle.dataset.sheetState = nextState;
    handle.setAttribute("aria-expanded", String(nextState !== "peek"));
  };

  let dragStartY: number | null = null;
  let dragPointerId: number | null = null;
  const dragStep = (direction: "up" | "down"): void => {
    const order: readonly PlaceBottomSheetState[] = ["peek", "half", "full"];
    const current = order.indexOf(state);
    const offset = direction === "up" ? 1 : -1;
    const next =
      order[Math.min(order.length - 1, Math.max(0, current + offset))];
    if (next) setState(next);
  };
  handle.addEventListener("pointerdown", (event) => {
    dragStartY = event.clientY;
    dragPointerId = event.pointerId;
    handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener("pointerup", (event) => {
    if (dragStartY === null || dragPointerId !== event.pointerId) return;
    const delta = event.clientY - dragStartY;
    dragStartY = null;
    dragPointerId = null;
    if (Math.abs(delta) < 36) return;
    dragStep(delta < 0 ? "up" : "down");
  });
  handle.addEventListener("pointercancel", () => {
    dragStartY = null;
    dragPointerId = null;
  });
  handle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      dragStep("up");
      return;
    }
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      dragStep("down");
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setState("peek");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setState("full");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (state === "full") {
        setState("half");
      } else {
        dragStep("up");
      }
    }
  });

  const updateHandleCopy = (locale: AssistantLocale): void => {
    const label = `${copy[locale].states.peek} / ${copy[locale].states.full}`;
    handle.setAttribute("aria-label", label);
    handle.title = label;
    setState(state);
  };
  const suspendForAssistantAction = (): void => {
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
  };

  const render = (next: PlaceBottomSheetPresentation): void => {
    const localeCopy = copy[next.locale];
    const actionsInContextualRail = next.actionsInContextualRail === true;
    close.setAttribute("aria-label", localeCopy.close);
    close.title = localeCopy.close;
    updateHandleCopy(next.locale);

    sheet.dataset.placeName = next.location.name;
    sheet.dataset.placeCategory = next.location.category;
    meta.textContent = [next.categoryLabel, next.location.area]
      .filter(Boolean)
      .join(" · ");
    title.textContent = next.location.name;

    const canonicalDescription = next.description?.trim();
    description.textContent = canonicalDescription ?? "";
    description.classList.toggle("hidden", !canonicalDescription);

    const canonicalRating =
      next.rating &&
      Number.isFinite(next.rating.value) &&
      next.rating.value >= 0 &&
      next.rating.value <= 5
        ? next.rating
        : undefined;
    rating.textContent = canonicalRating
      ? `${placeUiCopy[next.locale].rating}: ${canonicalRating.value.toFixed(1)} / 5${
          canonicalRating.count === undefined
            ? ""
            : ` · ${canonicalRating.count}`
        }`
      : "";
    rating.classList.toggle("hidden", !canonicalRating);
    setStatus(
      next.status ?? "ready",
      next.statusText ??
        (next.status === "loading"
          ? placeUiCopy[next.locale].loading
          : next.status === "error"
            ? placeUiCopy[next.locale].unavailable
            : undefined),
    );

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
    overflow.open = false;
    overflowActions.replaceChildren();
    overflowSummary.textContent = placeUiCopy[next.locale].more;
    const visibleActions: V1ExplorePlaceActionOption[] = next.primaryAction
      ? next.actions.filter(
          (action) => action.actionId !== next.primaryAction?.actionId,
        )
      : [...next.actions];
    for (const action of visibleActions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "md-button md-button--secondary place-bottom-sheet-action";
      button.dataset.value = action.value;
      button.dataset.placeAction = action.action;
      button.dataset.placeActionId = action.actionId;
      button.textContent = action.label;
      button.addEventListener("click", () => {
        suspendForAssistantAction();
        options.onAction(action.value);
      });
      actions.appendChild(button);
    }
    overflow.classList.add("hidden");
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
      button.addEventListener("click", () => {
        suspendForAssistantAction();
        options.onAction(primaryAction.value);
      });
      primary.appendChild(button);
    }

    actions.classList.toggle("hidden", actionsInContextualRail);
    primary.classList.toggle("hidden", actionsInContextualRail);
    if (actionsInContextualRail) {
      sheet.dataset.actionsSurface = "contextual-rail";
    } else {
      delete sheet.dataset.actionsSurface;
    }

    compatibilityValues = new Set([
      ...next.actions.map(({ value }) => value),
      ...(next.primaryAction ? [next.primaryAction.value] : []),
    ]);
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
    queueMicrotask(syncCompatibilitySource);
    if (!actionsInContextualRail) {
      queueMicrotask(() => {
        if (sheet.getAttribute("aria-hidden") === "false") {
          sheet.focus({ preventScroll: true });
        }
      });
    }
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
      compatibilityValues.clear();
      syncCompatibilitySource();
      delete sheet.dataset.placeName;
      delete sheet.dataset.placeCategory;
      delete sheet.dataset.actionsSurface;
    },
    setState,
    getState(): PlaceBottomSheetState {
      return state;
    },
    setStatus,
    destroy(): void {
      if (destroyed) return;
      assistantObserver?.disconnect();
      compatibilityValues.clear();
      sheet.setAttribute("aria-hidden", "true");
      syncCompatibilitySource();
      destroyed = true;
      sheet.remove();
    },
  });
}
