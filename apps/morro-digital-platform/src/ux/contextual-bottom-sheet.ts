export type ContextualBottomSheetState = "peek" | "half" | "full";

export interface ContextualBottomSheetController {
  readonly state: ContextualBottomSheetState;
  readonly active: boolean;
  sync(): void;
  setState(state: ContextualBottomSheetState): void;
  destroy(): void;
}

const STATE_ORDER: readonly ContextualBottomSheetState[] = Object.freeze([
  "peek",
  "half",
  "full",
]);

const DRAG_THRESHOLD_PX = 36;
const CLICK_SUPPRESSION_MS = 500;

export function stepContextualBottomSheetState(
  state: ContextualBottomSheetState,
  direction: "expand" | "collapse",
): ContextualBottomSheetState {
  const index = STATE_ORDER.indexOf(state);
  if (direction === "expand") {
    return STATE_ORDER[Math.min(index + 1, STATE_ORDER.length - 1)] ?? "full";
  }
  return STATE_ORDER[Math.max(index - 1, 0)] ?? "peek";
}

export function cycleContextualBottomSheetState(
  state: ContextualBottomSheetState,
): ContextualBottomSheetState {
  if (state === "peek") return "half";
  if (state === "half") return "full";
  return "peek";
}

function languageKey(value: string): "pt" | "en" | "es" | "he" {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("he")) return "he";
  return "pt";
}

const LABELS = Object.freeze({
  pt: Object.freeze({
    peek: "Mostrar mais conteúdo",
    half: "Expandir conteúdo",
    full: "Recolher conteúdo",
  }),
  en: Object.freeze({
    peek: "Show more content",
    half: "Expand content",
    full: "Collapse content",
  }),
  es: Object.freeze({
    peek: "Mostrar más contenido",
    half: "Ampliar contenido",
    full: "Contraer contenido",
  }),
  he: Object.freeze({
    peek: "הצגת תוכן נוסף",
    half: "הרחבת התוכן",
    full: "צמצום התוכן",
  }),
});

function stateLabel(
  document: Document,
  state: ContextualBottomSheetState,
): string {
  return LABELS[languageKey(document.documentElement.lang)][state];
}

export function installContextualBottomSheet(input: {
  readonly document: Document;
  readonly window: Window;
  readonly sheet: HTMLElement;
  readonly activeWhen: () => boolean;
  readonly mediaQuery?: string;
  readonly initialState?: ContextualBottomSheetState;
  readonly bodyStateAttribute?: string;
  readonly activeClass?: string;
  readonly handleClass?: string;
}): ContextualBottomSheetController {
  const media = input.window.matchMedia(
    input.mediaQuery ?? "(max-width: 45rem)",
  );
  const sheet = input.sheet;
  const handle = input.document.createElement("button");
  handle.type = "button";
  handle.className =
    input.handleClass ?? "md-contextual-sheet-handle md-icon-button";
  handle.dataset.contextualSheetHandle = "true";
  handle.setAttribute("aria-controls", sheet.id);

  const indicator = input.document.createElement("span");
  indicator.className = "md-bottom-sheet-handle";
  indicator.setAttribute("aria-hidden", "true");
  handle.append(indicator);
  sheet.prepend(handle);

  let state = input.initialState ?? "half";
  let active = false;
  let dragStartY: number | null = null;
  let dragStartState: ContextualBottomSheetState | null = null;
  let dragInput: "pointer" | "touch" | null = null;
  let dragThresholdCrossed = false;
  let suppressClicksUntil = 0;
  let suppressResetTimer: number | undefined;

  const syncLabel = (): void => {
    handle.setAttribute("aria-label", stateLabel(input.document, state));
    handle.setAttribute("aria-expanded", String(state !== "peek"));
  };

  const syncState = (): void => {
    if (!active) return;
    sheet.dataset.sheetState = state;
    if (input.bodyStateAttribute) {
      input.document.body.dataset[input.bodyStateAttribute] = state;
    }
    syncLabel();
  };

  const activate = (): void => {
    if (active) {
      syncState();
      return;
    }
    active = true;
    sheet.classList.add("md-bottom-sheet");
    if (input.activeClass) sheet.classList.add(input.activeClass);
    handle.hidden = false;
    syncState();
  };

  const deactivate = (): void => {
    active = false;
    sheet.classList.remove("md-bottom-sheet");
    if (input.activeClass) sheet.classList.remove(input.activeClass);
    delete sheet.dataset.sheetState;
    if (input.bodyStateAttribute) {
      delete input.document.body.dataset[input.bodyStateAttribute];
    }
    handle.hidden = true;
  };

  const sync = (): void => {
    if (media.matches && input.activeWhen()) activate();
    else deactivate();
  };

  const setState = (nextState: ContextualBottomSheetState): void => {
    state = nextState;
    syncState();
    if (active) sheet.scrollTop = 0;
  };

  const onHandleClick = (): void => {
    if (Date.now() < suppressClicksUntil) return;
    setState(cycleContextualBottomSheetState(state));
  };

  const onHandleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setState(stepContextualBottomSheetState(state, "expand"));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setState(stepContextualBottomSheetState(state, "collapse"));
    } else if (event.key === "Home") {
      event.preventDefault();
      setState("peek");
    } else if (event.key === "End") {
      event.preventDefault();
      setState("full");
    }
  };

  const resetClickSuppression = (): void => {
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
    if (Math.abs(delta) < DRAG_THRESHOLD_PX) return false;
    dragThresholdCrossed = true;
    suppressClicksUntil = Date.now() + CLICK_SUPPRESSION_MS;
    setState(
      stepContextualBottomSheetState(
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
    if (dragThresholdCrossed) resetClickSuppression();
    else suppressClicksUntil = 0;
    dragThresholdCrossed = false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!active) return;
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
    if (!active) return;
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (touch) beginDrag(touch.clientY, "touch");
  };
  const onTouchMove = (event: TouchEvent): void => {
    if (dragInput !== "touch") return;
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (touch && applyDragDelta(touch.clientY)) event.preventDefault();
  };
  const onTouchEnd = (event: TouchEvent): void => {
    if (dragInput !== "touch") return;
    finishDrag(event.changedTouches[0]?.clientY);
  };
  const onTouchCancel = (): void => {
    if (dragInput === "touch") finishDrag();
  };

  const onEnvironmentChange = (): void => sync();

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
  media.addEventListener("change", onEnvironmentChange);

  sync();

  return Object.freeze({
    get state() {
      return state;
    },
    get active() {
      return active;
    },
    sync,
    setState,
    destroy() {
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
      media.removeEventListener("change", onEnvironmentChange);
      if (suppressResetTimer !== undefined) {
        input.window.clearTimeout(suppressResetTimer);
      }
      deactivate();
      handle.remove();
    },
  });
}
