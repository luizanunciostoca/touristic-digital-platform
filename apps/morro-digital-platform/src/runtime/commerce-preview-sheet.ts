export type CommercePreviewSheetState = "peek" | "half" | "full";

export interface CommercePreviewSheetController {
  readonly state: CommercePreviewSheetState;
  readonly active: boolean;
  setState(state: CommercePreviewSheetState): void;
  destroy(): void;
}

const STATE_ORDER: readonly CommercePreviewSheetState[] = Object.freeze([
  "peek",
  "half",
  "full",
]);

const COPY = Object.freeze({
  pt: Object.freeze({
    peek: "Mostrar detalhes da experiência",
    half: "Expandir detalhes da experiência",
    full: "Recolher detalhes da experiência",
  }),
  en: Object.freeze({
    peek: "Show experience details",
    half: "Expand experience details",
    full: "Collapse experience details",
  }),
  es: Object.freeze({
    peek: "Mostrar detalles de la experiencia",
    half: "Ampliar detalles de la experiencia",
    full: "Contraer detalles de la experiencia",
  }),
  he: Object.freeze({
    peek: "הצגת פרטי החוויה",
    half: "הרחבת פרטי החוויה",
    full: "צמצום פרטי החוויה",
  }),
});

function languageKey(value: string): keyof typeof COPY {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("he")) return "he";
  return "pt";
}

export function stepCommercePreviewSheetState(
  state: CommercePreviewSheetState,
  direction: "expand" | "collapse",
): CommercePreviewSheetState {
  const index = STATE_ORDER.indexOf(state);
  if (direction === "expand") {
    return STATE_ORDER[Math.min(index + 1, STATE_ORDER.length - 1)] ?? "full";
  }
  return STATE_ORDER[Math.max(index - 1, 0)] ?? "peek";
}

export function cycleCommercePreviewSheetState(
  state: CommercePreviewSheetState,
): CommercePreviewSheetState {
  if (state === "peek") return "half";
  if (state === "half") return "full";
  return "peek";
}

function buttonLabel(
  document: Document,
  state: CommercePreviewSheetState,
): string {
  return COPY[languageKey(document.documentElement.lang)][state];
}

export function installCommercePreviewSheet(input: {
  readonly document: Document;
  readonly window: Window;
  readonly mediaQuery?: string;
  readonly initialState?: CommercePreviewSheetState;
}): CommercePreviewSheetController | null {
  const sheet = input.document.getElementById("experience-preview-sheet");
  if (!(sheet instanceof HTMLElement)) return null;

  const media = input.window.matchMedia(
    input.mediaQuery ?? "(max-width: 45rem)",
  );
  const handle = input.document.createElement("button");
  handle.type = "button";
  handle.className = "commerce-preview-sheet-handle md-icon-button";
  handle.setAttribute("aria-controls", sheet.id);
  handle.dataset.commerceSheetHandle = "true";

  const indicator = input.document.createElement("span");
  indicator.className = "md-bottom-sheet-handle";
  indicator.setAttribute("aria-hidden", "true");
  handle.append(indicator);
  sheet.prepend(handle);

  let state = input.initialState ?? "half";
  let active = false;
  let pointerStartY: number | null = null;
  let suppressClicksUntil = 0;

  const syncLabel = (): void => {
    handle.setAttribute("aria-label", buttonLabel(input.document, state));
    handle.setAttribute("aria-expanded", String(state !== "peek"));
  };

  const syncState = (): void => {
    if (!active) return;
    sheet.dataset.sheetState = state;
    input.document.body.dataset.commerceSheetState = state;
    syncLabel();
  };

  const activate = (): void => {
    if (active) {
      syncState();
      return;
    }
    active = true;
    sheet.classList.add("md-bottom-sheet", "commerce-preview-sheet");
    sheet.dataset.sheetState = state;
    handle.hidden = false;
    input.document.body.dataset.commercePreviewSheet = "active";
    input.document.body.dataset.commerceSheetState = state;
    syncLabel();
  };

  const deactivate = (): void => {
    active = false;
    sheet.classList.remove("md-bottom-sheet", "commerce-preview-sheet");
    delete sheet.dataset.sheetState;
    handle.hidden = true;
    delete input.document.body.dataset.commercePreviewSheet;
    delete input.document.body.dataset.commerceSheetState;
  };

  const setState = (nextState: CommercePreviewSheetState): void => {
    state = nextState;
    syncState();
  };

  const onHandleClick = (): void => {
    if (Date.now() < suppressClicksUntil) return;
    setState(cycleCommercePreviewSheetState(state));
  };

  const onHandleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setState(stepCommercePreviewSheetState(state, "expand"));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setState(stepCommercePreviewSheetState(state, "collapse"));
    }
  };

  const releasePointerCapture = (event: PointerEvent): void => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") return;
    pointerStartY = event.clientY;
    suppressClicksUntil = 0;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be rejected by a browser after an interrupted gesture.
    }
  };

  const applyDragDelta = (clientY: number): boolean => {
    if (pointerStartY === null) return false;
    const delta = clientY - pointerStartY;
    if (Math.abs(delta) < 36) return false;
    suppressClicksUntil = Date.now() + 500;
    setState(
      stepCommercePreviewSheetState(state, delta < 0 ? "expand" : "collapse"),
    );
    pointerStartY = clientY;
    return true;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") return;
    applyDragDelta(event.clientY);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") return;
    applyDragDelta(event.clientY);
    pointerStartY = null;
    releasePointerCapture(event);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") return;
    pointerStartY = null;
    suppressClicksUntil = 0;
    releasePointerCapture(event);
  };

  const onMouseDown = (event: MouseEvent): void => {
    pointerStartY = event.clientY;
    suppressClicksUntil = 0;
  };

  const onMouseMove = (event: MouseEvent): void => {
    applyDragDelta(event.clientY);
  };

  const onMouseUp = (event: MouseEvent): void => {
    applyDragDelta(event.clientY);
    pointerStartY = null;
  };

  const onMediaChange = (): void => {
    if (media.matches) activate();
    else deactivate();
  };

  handle.addEventListener("click", onHandleClick);
  handle.addEventListener("keydown", onHandleKeyDown);
  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("mousedown", onMouseDown);
  input.document.addEventListener("pointermove", onPointerMove);
  input.document.addEventListener("pointerup", onPointerUp);
  input.document.addEventListener("pointercancel", onPointerCancel);
  input.document.addEventListener("mousemove", onMouseMove);
  input.document.addEventListener("mouseup", onMouseUp);
  media.addEventListener("change", onMediaChange);

  if (media.matches) activate();
  else deactivate();

  return Object.freeze({
    get state() {
      return state;
    },
    get active() {
      return active;
    },
    setState,
    destroy() {
      handle.removeEventListener("click", onHandleClick);
      handle.removeEventListener("keydown", onHandleKeyDown);
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("mousedown", onMouseDown);
      input.document.removeEventListener("pointermove", onPointerMove);
      input.document.removeEventListener("pointerup", onPointerUp);
      input.document.removeEventListener("pointercancel", onPointerCancel);
      input.document.removeEventListener("mousemove", onMouseMove);
      input.document.removeEventListener("mouseup", onMouseUp);
      media.removeEventListener("change", onMediaChange);
      deactivate();
      handle.remove();
    },
  });
}
