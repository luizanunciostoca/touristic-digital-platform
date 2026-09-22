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

function createStepButton(
  document: Document,
  direction: "up" | "down",
  locale: AssistantLocale,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-icon-button place-bottom-sheet-state-button";
  button.dataset.sheetStep = direction;
  button.setAttribute(
    "aria-label",
    direction === "up" ? copy[locale].states.full : copy[locale].states.peek,
  );
  button.title =
    direction === "up" ? copy[locale].states.full : copy[locale].states.peek;
  button.textContent = direction === "up" ? "⌃" : "⌄";
  return button;
}

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
    const order: readonly PlaceBottomSheetState[] = ["peek", "half", "full"];
    const current = order.indexOf(nextState);
    for (const child of Array.from(stateControls.children)) {
      if (!(child instanceof HTMLButtonElement)) continue;
      const direction = child.dataset.sheetStep;
      if (direction === "down") child.disabled = current <= 0;
      if (direction === "up") child.disabled = current >= order.length - 1;
    }
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

  const rebuildStateControls = (locale: AssistantLocale): void => {
    stateControls.replaceChildren();
    for (const direction of ["down", "up"] as const) {
      const button = createStepButton(document, direction, locale);
      button.addEventListener("click", () => dragStep(direction));
      stateControls.appendChild(button);
    }
    setState(state);
  };
  const suspendForAssistantAction = (): void => {
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
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
    const visibleActions: V1ExplorePlaceActionOption[] = [...next.actions];
    const hasValue = (value: string): boolean =>
      visibleActions.some(
        (action) => action.value.trim().toLowerCase() === value.toLowerCase(),
      );
    if (!hasValue("como chegar")) {
      visibleActions.unshift(
        Object.freeze({
          label: `📍 ${getV1ExploreLabel("directions", next.locale)}`,
          value: "como chegar",
          action: "command" as const,
        }),
      );
    }
    if (!hasValue("adicionar aos favoritos")) {
      visibleActions.push(
        Object.freeze({
          label: `❤️ ${placeUiCopy[next.locale].save}`,
          value: "adicionar aos favoritos",
          action: "command" as const,
        }),
      );
    }

    const essentialValues = new Set([
      "como chegar",
      "adicionar aos favoritos",
    ]);
    for (const action of visibleActions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "md-button md-button--secondary place-bottom-sheet-action";
      button.dataset.value = action.value;
      button.dataset.placeAction = action.action;
      button.textContent = action.label;
      button.addEventListener("click", () => {
        suspendForAssistantAction();
        options.onAction(action.value);
      });
      const destination = essentialValues.has(action.value.trim().toLowerCase())
        ? actions
        : overflowActions;
      destination.appendChild(button);
    }
    overflow.classList.toggle("hidden", overflowActions.childElementCount === 0);

    const shareButton = document.createElement("button");
    shareButton.type = "button";
    shareButton.className =
      "md-button md-button--secondary place-bottom-sheet-action place-bottom-sheet-share";
    shareButton.dataset.placeNativeAction = "share";
    shareButton.dataset.value = "compartilhar";
    shareButton.textContent = `🔗 ${placeUiCopy[next.locale].share}`;
    shareButton.addEventListener("click", () => {
      const view = document.defaultView;
      const shareText = [next.location.name, next.location.area]
        .filter(Boolean)
        .join(" · ");
      const shareUrl = view?.location.href;
      const navigator = view?.navigator as
        | (Navigator & {
            share?: (data: ShareData) => Promise<void>;
            clipboard?: Clipboard;
          })
        | undefined;
      void (async () => {
        try {
          if (navigator?.share) {
            await navigator.share({
              title: next.location.name,
              text: shareText,
              ...(shareUrl ? { url: shareUrl } : {}),
            });
            return;
          }
          if (navigator?.clipboard && shareUrl) {
            await navigator.clipboard.writeText(
              [shareText, shareUrl].filter(Boolean).join("\n"),
            );
            setStatus("ready");
            status.textContent = placeUiCopy[next.locale].shareSuccess;
            status.classList.remove("hidden");
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          status.textContent = placeUiCopy[next.locale].unavailable;
          status.classList.remove("hidden");
        }
      })();
    });
    actions.appendChild(shareButton);

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

    compatibilityValues = new Set([
      ...next.actions.map(({ value }) => value),
      ...(next.primaryAction ? [next.primaryAction.value] : []),
    ]);
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
    queueMicrotask(syncCompatibilitySource);
    queueMicrotask(() => {
      if (sheet.getAttribute("aria-hidden") === "false") {
        sheet.focus({ preventScroll: true });
      }
    });
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
