export type TouristSurfaceBottomSheetState = "peek" | "half" | "full";
export type TouristSurfaceBottomSheetSurface = "search" | "place" | "tour";

export interface TouristSurfaceBottomSheetController {
  readonly active: boolean;
  readonly state: TouristSurfaceBottomSheetState;
  readonly surface: TouristSurfaceBottomSheetSurface | null;
  setState(state: TouristSurfaceBottomSheetState): void;
  destroy(): void;
}

type ExploreStage = "menu" | "filters" | "places" | "detail" | "tour";

const STATE_ORDER: readonly TouristSurfaceBottomSheetState[] = Object.freeze([
  "peek",
  "half",
  "full",
]);

const INITIAL_STATE: Readonly<
  Record<TouristSurfaceBottomSheetSurface, TouristSurfaceBottomSheetState>
> = Object.freeze({
  search: "half",
  place: "half",
  tour: "half",
});

const COPY = Object.freeze({
  pt: Object.freeze({
    search: Object.freeze({
      peek: "Mostrar resultados",
      half: "Expandir resultados",
      full: "Recolher resultados",
    }),
    place: Object.freeze({
      peek: "Mostrar detalhes do local",
      half: "Expandir detalhes do local",
      full: "Recolher detalhes do local",
    }),
    tour: Object.freeze({
      peek: "Mostrar etapa do passeio",
      half: "Expandir etapa do passeio",
      full: "Recolher etapa do passeio",
    }),
  }),
  en: Object.freeze({
    search: Object.freeze({
      peek: "Show results",
      half: "Expand results",
      full: "Collapse results",
    }),
    place: Object.freeze({
      peek: "Show place details",
      half: "Expand place details",
      full: "Collapse place details",
    }),
    tour: Object.freeze({
      peek: "Show tour step",
      half: "Expand tour step",
      full: "Collapse tour step",
    }),
  }),
  es: Object.freeze({
    search: Object.freeze({
      peek: "Mostrar resultados",
      half: "Ampliar resultados",
      full: "Contraer resultados",
    }),
    place: Object.freeze({
      peek: "Mostrar detalles del lugar",
      half: "Ampliar detalles del lugar",
      full: "Contraer detalles del lugar",
    }),
    tour: Object.freeze({
      peek: "Mostrar etapa del paseo",
      half: "Ampliar etapa del paseo",
      full: "Contraer etapa del paseo",
    }),
  }),
  he: Object.freeze({
    search: Object.freeze({
      peek: "הצגת תוצאות",
      half: "הרחבת תוצאות",
      full: "צמצום תוצאות",
    }),
    place: Object.freeze({
      peek: "הצגת פרטי המקום",
      half: "הרחבת פרטי המקום",
      full: "צמצום פרטי המקום",
    }),
    tour: Object.freeze({
      peek: "הצגת שלב הסיור",
      half: "הרחבת שלב הסיור",
      full: "צמצום שלב הסיור",
    }),
  }),
});

function languageKey(value: string): keyof typeof COPY {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("he")) return "he";
  return "pt";
}

function surfaceForStage(
  stage: ExploreStage | string | undefined,
): TouristSurfaceBottomSheetSurface | null {
  if (stage === "filters" || stage === "places") return "search";
  if (stage === "detail") return "place";
  if (stage === "tour") return "tour";
  return null;
}

export function stepTouristSurfaceBottomSheetState(
  state: TouristSurfaceBottomSheetState,
  direction: "expand" | "collapse",
): TouristSurfaceBottomSheetState {
  const index = STATE_ORDER.indexOf(state);
  if (direction === "expand") {
    return STATE_ORDER[Math.min(index + 1, STATE_ORDER.length - 1)] ?? "full";
  }
  return STATE_ORDER[Math.max(index - 1, 0)] ?? "peek";
}

export function cycleTouristSurfaceBottomSheetState(
  state: TouristSurfaceBottomSheetState,
): TouristSurfaceBottomSheetState {
  if (state === "peek") return "half";
  if (state === "half") return "full";
  return "peek";
}

export function installTouristSurfaceBottomSheet(input: {
  readonly document: Document;
  readonly window: Window;
  readonly mediaQuery?: string;
}): TouristSurfaceBottomSheetController | null {
  const assistant = input.document.getElementById("assistant-messages");
  if (!(assistant instanceof HTMLElement)) return null;

  const media = input.window.matchMedia(
    input.mediaQuery ?? "(max-width: 45rem)",
  );
  const stateBySurface = new Map<
    TouristSurfaceBottomSheetSurface,
    TouristSurfaceBottomSheetState
  >(
    (
      Object.entries(INITIAL_STATE) as [
        TouristSurfaceBottomSheetSurface,
        TouristSurfaceBottomSheetState,
      ][]
    ).map(([surface, state]) => [surface, state]),
  );

  const handle = input.document.createElement("button");
  handle.type = "button";
  handle.hidden = true;
  handle.className = "md-tourist-sheet-handle md-icon-button";
  handle.dataset.touristSheetHandle = "true";
  handle.setAttribute("aria-controls", assistant.id);

  const indicator = input.document.createElement("span");
  indicator.className = "md-bottom-sheet-handle";
  indicator.setAttribute("aria-hidden", "true");
  handle.append(indicator);
  assistant.prepend(handle);

  let active = false;
  let surface: TouristSurfaceBottomSheetSurface | null = null;
  let state: TouristSurfaceBottomSheetState = "half";
  let dragStartY: number | null = null;
  let dragStartState: TouristSurfaceBottomSheetState | null = null;
  let dragInput: "pointer" | "touch" | null = null;
  let dragThresholdCrossed = false;
  let suppressClicksUntil = 0;
  let suppressResetTimer: number | undefined;
  let destroyed = false;

  const syncLabel = (): void => {
    if (!surface) return;
    const labels = COPY[languageKey(input.document.documentElement.lang)];
    handle.setAttribute("aria-label", labels[surface][state]);
    handle.setAttribute("aria-expanded", String(state !== "peek"));
  };

  const syncState = (): void => {
    if (!active || !surface) return;
    assistant.dataset.sheetState = state;
    assistant.dataset.sheetSurface = surface;
    input.document.body.dataset.mdTouristSheetSurface = surface;
    input.document.body.dataset.mdTouristSheetState = state;
    stateBySurface.set(surface, state);
    syncLabel();
  };

  const focusFallbackAfterHandle = (): void => {
    if (input.document.activeElement !== handle) return;
    const inputElement = input.document.getElementById("assistantInput");
    if (inputElement instanceof HTMLElement) {
      inputElement.focus();
      return;
    }
    assistant
      .querySelector<HTMLElement>(".minimize-button, .assistant-option-btn")
      ?.focus();
  };

  const deactivate = (): void => {
    if (!active && !surface) return;
    active = false;
    surface = null;
    assistant.classList.remove("md-bottom-sheet", "md-tourist-surface-sheet");
    delete assistant.dataset.sheetState;
    delete assistant.dataset.sheetSurface;
    delete input.document.body.dataset.mdTouristSheetSurface;
    delete input.document.body.dataset.mdTouristSheetState;
    handle.hidden = true;
    focusFallbackAfterHandle();
  };

  const activate = (nextSurface: TouristSurfaceBottomSheetSurface): void => {
    if (destroyed) return;
    surface = nextSurface;
    state = stateBySurface.get(nextSurface) ?? INITIAL_STATE[nextSurface];
    if (!media.matches) {
      deactivate();
      return;
    }
    active = true;
    assistant.classList.add("md-bottom-sheet", "md-tourist-surface-sheet");
    handle.hidden = false;
    syncState();
  };

  const applyStage = (stage: ExploreStage | string | undefined): void => {
    const nextSurface = surfaceForStage(stage);
    if (!nextSurface || !media.matches) {
      deactivate();
      return;
    }
    activate(nextSurface);
  };

  const setState = (nextState: TouristSurfaceBottomSheetState): void => {
    state = nextState;
    syncState();
    if (active) {
      assistant
        .querySelector<HTMLElement>(".messages-area")
        ?.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const scheduleClickSuppressionReset = (): void => {
    if (suppressResetTimer !== undefined) {
      input.window.clearTimeout(suppressResetTimer);
      suppressResetTimer = undefined;
    }
    const remaining = suppressClicksUntil - Date.now();
    if (remaining <= 0) {
      suppressClicksUntil = 0;
      return;
    }
    suppressResetTimer = input.window.setTimeout(() => {
      suppressClicksUntil = 0;
      suppressResetTimer = undefined;
    }, remaining);
  };

  const beginDrag = (clientY: number, source: "pointer" | "touch"): void => {
    if (!active) return;
    if (suppressResetTimer !== undefined) {
      input.window.clearTimeout(suppressResetTimer);
      suppressResetTimer = undefined;
    }
    dragStartY = clientY;
    dragStartState = state;
    dragInput = source;
    dragThresholdCrossed = false;
    suppressClicksUntil = 0;
  };

  const applyDragDelta = (clientY: number): boolean => {
    if (dragStartY === null || dragStartState === null) return false;
    const delta = clientY - dragStartY;
    if (Math.abs(delta) < 36) return false;
    dragThresholdCrossed = true;
    suppressClicksUntil = Date.now() + 500;
    setState(
      stepTouristSurfaceBottomSheetState(
        dragStartState,
        delta < 0 ? "expand" : "collapse",
      ),
    );
    return true;
  };

  const finishDrag = (clientY?: number): void => {
    if (clientY !== undefined) applyDragDelta(clientY);
    dragStartY = null;
    dragStartState = null;
    dragInput = null;
    if (dragThresholdCrossed) scheduleClickSuppressionReset();
    else suppressClicksUntil = 0;
    dragThresholdCrossed = false;
  };

  const onHandleClick = (): void => {
    if (!active || Date.now() < suppressClicksUntil) return;
    setState(cycleTouristSurfaceBottomSheetState(state));
  };

  const onHandleKeyDown = (event: KeyboardEvent): void => {
    if (!active) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setState(stepTouristSurfaceBottomSheetState(state, "expand"));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setState(stepTouristSurfaceBottomSheetState(state, "collapse"));
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
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    beginDrag(event.clientY, "pointer");
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (dragInput !== "pointer") return;
    applyDragDelta(event.clientY);
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (dragInput !== "pointer") return;
    finishDrag(event.clientY);
  };
  const onPointerCancel = (): void => {
    if (dragInput === "pointer") finishDrag();
  };
  const onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (touch) beginDrag(touch.clientY, "touch");
  };
  const onTouchMove = (event: TouchEvent): void => {
    if (dragInput !== "touch") return;
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) return;
    if (applyDragDelta(touch.clientY)) event.preventDefault();
  };
  const onTouchEnd = (event: TouchEvent): void => {
    if (dragInput !== "touch") return;
    finishDrag(event.changedTouches[0]?.clientY);
  };
  const onTouchCancel = (): void => {
    if (dragInput === "touch") finishDrag();
  };

  const onExploreStateChanged = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail as { readonly stage?: unknown } | null;
    applyStage(typeof detail?.stage === "string" ? detail.stage : undefined);
  };

  const onMediaChange = (): void => {
    const stage = input.document.getElementById("map")?.dataset.exploreStage;
    applyStage(stage);
  };

  handle.addEventListener("click", onHandleClick);
  handle.addEventListener("keydown", onHandleKeyDown);
  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("touchstart", onTouchStart, { passive: true });
  input.document.addEventListener("pointermove", onPointerMove);
  input.document.addEventListener("pointerup", onPointerUp);
  input.document.addEventListener("pointercancel", onPointerCancel);
  input.document.addEventListener("touchmove", onTouchMove, { passive: false });
  input.document.addEventListener("touchend", onTouchEnd);
  input.document.addEventListener("touchcancel", onTouchCancel);
  input.document.addEventListener(
    "morro:explore-state-changed",
    onExploreStateChanged,
  );
  media.addEventListener("change", onMediaChange);

  onMediaChange();

  return Object.freeze({
    get active() {
      return active;
    },
    get state() {
      return state;
    },
    get surface() {
      return surface;
    },
    setState,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      handle.removeEventListener("click", onHandleClick);
      handle.removeEventListener("keydown", onHandleKeyDown);
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("touchstart", onTouchStart);
      input.document.removeEventListener("pointermove", onPointerMove);
      input.document.removeEventListener("pointerup", onPointerUp);
      input.document.removeEventListener("pointercancel", onPointerCancel);
      input.document.removeEventListener("touchmove", onTouchMove);
      input.document.removeEventListener("touchend", onTouchEnd);
      input.document.removeEventListener("touchcancel", onTouchCancel);
      input.document.removeEventListener(
        "morro:explore-state-changed",
        onExploreStateChanged,
      );
      media.removeEventListener("change", onMediaChange);
      if (suppressResetTimer !== undefined) {
        input.window.clearTimeout(suppressResetTimer);
      }
      deactivate();
      handle.remove();
    },
  });
}
