export type MobileContextSheetMode = "search" | "place" | "tour";
export type MobileContextSheetState = "peek" | "half" | "full";

export interface MobileContextSheetController {
  readonly active: boolean;
  readonly state: MobileContextSheetState;
  setState(state: MobileContextSheetState): void;
  destroy(): void;
}

const ACTIVE_MODES = new Set<MobileContextSheetMode>([
  "search",
  "place",
  "tour",
]);
const STATE_ORDER: readonly MobileContextSheetState[] = Object.freeze([
  "peek",
  "half",
  "full",
]);

const COPY = Object.freeze({
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

function languageKey(value: string): keyof typeof COPY {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("he")) return "he";
  return "pt";
}

function currentMode(document: Document): MobileContextSheetMode | null {
  const mode = document.body.dataset.mdMode;
  return ACTIVE_MODES.has(mode as MobileContextSheetMode)
    ? (mode as MobileContextSheetMode)
    : null;
}

export function stepMobileContextSheetState(
  state: MobileContextSheetState,
  direction: "expand" | "collapse",
): MobileContextSheetState {
  const index = STATE_ORDER.indexOf(state);
  if (direction === "expand") {
    return STATE_ORDER[Math.min(index + 1, STATE_ORDER.length - 1)] ?? "full";
  }
  return STATE_ORDER[Math.max(index - 1, 0)] ?? "peek";
}

function initialState(mode: MobileContextSheetMode): MobileContextSheetState {
  return mode === "search" ? "peek" : "half";
}

export function installMobileContextSheet(input: {
  readonly document: Document;
  readonly window: Window;
  readonly mediaQuery?: string;
}): MobileContextSheetController | null {
  const sheet = input.document.getElementById("assistant-messages");
  const content = sheet?.querySelector<HTMLElement>(".messages-area");
  if (!(sheet instanceof HTMLElement) || !content) return null;

  const media = input.window.matchMedia(
    input.mediaQuery ?? "(max-width: 45rem)",
  );
  const handle = input.document.createElement("button");
  handle.type = "button";
  handle.className = "md-context-sheet-handle md-icon-button";
  handle.dataset.contextSheetHandle = "true";
  handle.setAttribute("aria-controls", sheet.id);

  const indicator = input.document.createElement("span");
  indicator.className = "md-bottom-sheet-handle";
  indicator.setAttribute("aria-hidden", "true");
  handle.append(indicator);
  sheet.prepend(handle);

  let state: MobileContextSheetState = "half";
  let active = false;
  let activeMode: MobileContextSheetMode | null = null;
  let dragStartY: number | null = null;
  let dragStartState: MobileContextSheetState | null = null;
  let dragSource: "pointer" | "touch" | null = null;
  let dragMoved = false;
  let suppressClickUntil = 0;

  const syncLabel = (): void => {
    handle.setAttribute(
      "aria-label",
      COPY[languageKey(input.document.documentElement.lang)][state],
    );
    handle.setAttribute("aria-expanded", String(state !== "peek"));
  };

  const syncState = (): void => {
    if (!active) return;
    sheet.dataset.sheetState = state;
    input.document.body.dataset.contextSheetState = state;
    syncLabel();
  };

  const activate = (mode: MobileContextSheetMode): void => {
    if (activeMode !== mode) {
      activeMode = mode;
      state = initialState(mode);
    }
    active = true;
    sheet.classList.add("md-bottom-sheet", "md-context-sheet");
    content.classList.add("md-bottom-sheet-content");
    sheet.dataset.sheetMode = mode;
    handle.hidden = false;
    syncState();
  };

  const deactivate = (): void => {
    active = false;
    activeMode = null;
    sheet.classList.remove("md-bottom-sheet", "md-context-sheet");
    content.classList.remove("md-bottom-sheet-content");
    delete sheet.dataset.sheetState;
    delete sheet.dataset.sheetMode;
    delete input.document.body.dataset.contextSheetState;
    handle.hidden = true;
  };

  const syncActivation = (): void => {
    const mode = currentMode(input.document);
    if (media.matches && mode) activate(mode);
    else deactivate();
  };

  const setState = (next: MobileContextSheetState): void => {
    state = next;
    syncState();
    if (active) content.scrollTop = 0;
  };

  const cycle = (): void => {
    if (state === "peek") setState("half");
    else if (state === "half") setState("full");
    else setState("peek");
  };

  const onHandleClick = (): void => {
    if (Date.now() < suppressClickUntil) return;
    cycle();
  };

  const onHandleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setState(stepMobileContextSheetState(state, "expand"));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setState(stepMobileContextSheetState(state, "collapse"));
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
    if (event.key === "Escape" && state !== "peek") {
      event.preventDefault();
      event.stopPropagation();
      setState("peek");
    }
  };

  const beginDrag = (clientY: number, source: "pointer" | "touch"): void => {
    dragStartY = clientY;
    dragStartState = state;
    dragSource = source;
    dragMoved = false;
  };

  const applyDrag = (clientY: number): boolean => {
    if (dragStartY === null || dragStartState === null) return false;
    const delta = clientY - dragStartY;
    if (Math.abs(delta) < 36) return false;
    dragMoved = true;
    suppressClickUntil = Date.now() + 500;
    setState(
      stepMobileContextSheetState(
        dragStartState,
        delta < 0 ? "expand" : "collapse",
      ),
    );
    return true;
  };

  const finishDrag = (clientY?: number): void => {
    if (clientY !== undefined) applyDrag(clientY);
    dragStartY = null;
    dragStartState = null;
    dragSource = null;
    if (!dragMoved) suppressClickUntil = 0;
    dragMoved = false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    beginDrag(event.clientY, "pointer");
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (dragSource !== "pointer") return;
    applyDrag(event.clientY);
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (dragSource !== "pointer") return;
    finishDrag(event.clientY);
  };
  const onPointerCancel = (): void => {
    if (dragSource === "pointer") finishDrag();
  };
  const onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (touch) beginDrag(touch.clientY, "touch");
  };
  const onTouchMove = (event: TouchEvent): void => {
    if (dragSource !== "touch") return;
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (touch && applyDrag(touch.clientY)) event.preventDefault();
  };
  const onTouchEnd = (event: TouchEvent): void => {
    if (dragSource !== "touch") return;
    finishDrag(event.changedTouches[0]?.clientY);
  };
  const onTouchCancel = (): void => {
    if (dragSource === "touch") finishDrag();
  };

  const MutationObserverConstructor = input.window.MutationObserver;
  const observer = new MutationObserverConstructor(syncActivation);
  observer.observe(input.document.body, {
    attributes: true,
    attributeFilter: ["data-md-mode"],
  });

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
  media.addEventListener("change", syncActivation);

  syncActivation();

  return Object.freeze({
    get active() {
      return active;
    },
    get state() {
      return state;
    },
    setState,
    destroy() {
      observer.disconnect();
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
      media.removeEventListener("change", syncActivation);
      deactivate();
      handle.remove();
    },
  });
}
