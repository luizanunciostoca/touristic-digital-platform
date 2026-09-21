export type ExploreFlowBottomSheetState = "peek" | "half" | "full";
export type ExploreFlowBottomSheetKind = "explore" | "tour";
export type ExploreFlowBottomSheetStatus =
  | "loading"
  | "ready"
  | "empty"
  | "error";

export interface ExploreFlowBottomSheetPresentation {
  readonly kind: ExploreFlowBottomSheetKind;
  readonly accessibleLabel: string;
  readonly source: HTMLElement;
  readonly messageSource?: HTMLElement;
  readonly content?: HTMLElement;
  readonly status?: ExploreFlowBottomSheetStatus;
  readonly statusText?: string;
  readonly onDismiss: () => void;
}

export interface ExploreFlowBottomSheetController {
  show(presentation: ExploreFlowBottomSheetPresentation): void;
  hide(): void;
  setState(state: ExploreFlowBottomSheetState): void;
  getState(): ExploreFlowBottomSheetState;
  setStatus(status: ExploreFlowBottomSheetStatus, text?: string): void;
  destroy(): void;
}

export interface ExploreFlowBottomSheetOptions {
  readonly document: Document;
}

type SheetCopy = Readonly<{
  close: string;
  loading: string;
  empty: string;
  unavailable: string;
  states: Readonly<Record<ExploreFlowBottomSheetState, string>>;
}>;
const copyByLanguage = Object.freeze<Record<string, SheetCopy>>({
  pt: {
    close: "Fechar painel",
    loading: "Atualizando o mapa e os resultados…",
    empty: "Nenhum resultado encontrado para este filtro.",
    unavailable: "Não foi possível atualizar o mapa agora. Seus filtros foram preservados.",
    states: {
      peek: "Mostrar resumo",
      half: "Mostrar conteúdo principal",
      full: "Expandir painel",
    },
  },
  en: {
    close: "Close panel",
    loading: "Updating the map and results…",
    empty: "No results were found for this filter.",
    unavailable: "The map could not be updated right now. Your filters were preserved.",
    states: {
      peek: "Show summary",
      half: "Show main content",
      full: "Expand panel",
    },
  },
  es: {
    close: "Cerrar panel",
    loading: "Actualizando el mapa y los resultados…",
    empty: "No se encontraron resultados para este filtro.",
    unavailable: "No fue posible actualizar el mapa ahora. Tus filtros se conservaron.",
    states: {
      peek: "Mostrar resumen",
      half: "Mostrar contenido principal",
      full: "Expandir panel",
    },
  },
  he: {
    close: "סגירת הלוח",
    loading: "מעדכן את המפה והתוצאות…",
    empty: "לא נמצאו תוצאות למסנן הזה.",
    unavailable: "לא ניתן לעדכן את המפה כרגע. המסננים שלך נשמרו.",
    states: {
      peek: "הצגת תקציר",
      half: "הצגת התוכן הראשי",
      full: "הרחבת הלוח",
    },
  },
});

const stateGlyph: Readonly<Record<ExploreFlowBottomSheetState, string>> =
  Object.freeze({
    peek: "⌄",
    half: "—",
    full: "⌃",
  });

function languageKey(document: Document): string {
  const raw = document.documentElement.lang.trim().toLowerCase();
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("he")) return "he";
  return "pt";
}

function currentCopy(document: Document): SheetCopy {
  return copyByLanguage[languageKey(document)] ?? copyByLanguage.pt!;
}

function isPrimaryTourAction(value: string): boolean {
  return ["__tour_start__", "__tour_next__", "__tour_finish__"].includes(value);
}
function createStateButton(
  document: Document,
  state: ExploreFlowBottomSheetState,
  copy: SheetCopy,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-icon-button explore-flow-sheet-state-button";
  button.dataset.sheetStateTarget = state;
  button.setAttribute("aria-label", copy.states[state]);
  button.title = copy.states[state];
  button.textContent = stateGlyph[state];
  return button;
}

export function installExploreFlowBottomSheet({
  document,
}: ExploreFlowBottomSheetOptions): ExploreFlowBottomSheetController {
  let destroyed = false;
  let state: ExploreFlowBottomSheetState = "half";
  const sheet = document.createElement("aside");
  sheet.id = "explore-flow-bottom-sheet";
  sheet.className = "md-bottom-sheet md-card explore-flow-bottom-sheet hidden";
  sheet.dataset.sheetState = state;
  sheet.setAttribute("role", "region");
  sheet.setAttribute("aria-hidden", "true");

  const toolbar = document.createElement("div");
  toolbar.className = "explore-flow-sheet-toolbar";

  const handle = document.createElement("div");
  handle.className = "md-bottom-sheet-handle explore-flow-sheet-drag-handle";
  handle.setAttribute("aria-hidden", "true");

  const stateControls = document.createElement("div");
  stateControls.className = "explore-flow-sheet-state-controls";
  stateControls.setAttribute("role", "group");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "md-icon-button explore-flow-sheet-close";
  close.textContent = "×";

  toolbar.append(handle, stateControls, close);

  const content = document.createElement("div");
  content.className = "md-bottom-sheet-content explore-flow-sheet-content";

  const heading = document.createElement("h2");
  heading.id = "explore-flow-bottom-sheet-title";
  heading.className = "explore-flow-sheet-title";
  sheet.setAttribute("aria-labelledby", heading.id);
  sheet.tabIndex = -1;

  const status = document.createElement("div");
  status.className = "explore-flow-sheet-status hidden";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const richContent = document.createElement("div");
  richContent.className = "explore-flow-sheet-rich";

  const actions = document.createElement("div");
  actions.className = "explore-flow-sheet-actions";
  actions.setAttribute("role", "group");

  content.append(heading, status, richContent, actions);
  sheet.append(toolbar, content);
  document.body.appendChild(sheet);

  let dismissHandler: (() => void) | undefined;
  let activeKind: ExploreFlowBottomSheetKind | undefined;
  let compatibilityMessageSource: HTMLElement | undefined;

  const clearCompatibilityMessageSource = (): void => {
    if (!compatibilityMessageSource) return;
    compatibilityMessageSource.classList.remove(
      "explore-flow-message-compat-source",
    );
    compatibilityMessageSource.removeAttribute("aria-hidden");
    compatibilityMessageSource = undefined;
  };

  const setStatus = (
    nextStatus: ExploreFlowBottomSheetStatus,
    text?: string,
  ): void => {
    const copy = currentCopy(document);
    sheet.dataset.flowState = nextStatus;
    sheet.setAttribute("aria-busy", String(nextStatus === "loading"));
    status.replaceChildren();
    if (nextStatus === "ready") {
      status.classList.add("hidden");
      return;
    }
    status.classList.remove("hidden");
    if (nextStatus === "loading") {
      const skeleton = document.createElement("span");
      skeleton.className = "md-skeleton explore-flow-sheet-status-skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      status.appendChild(skeleton);
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = text || copy.loading;
      status.appendChild(sr);
      return;
    }
    status.textContent =
      text || (nextStatus === "empty" ? copy.empty : copy.unavailable);
  };

  const setState = (nextState: ExploreFlowBottomSheetState): void => {
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

  let dragStartY: number | null = null;
  let dragPointerId: number | null = null;
  const dragStep = (direction: "up" | "down"): void => {
    const order: readonly ExploreFlowBottomSheetState[] = [
      "peek",
      "half",
      "full",
    ];
    const current = order.indexOf(state);
    const offset = direction === "up" ? 1 : -1;
    const next = order[Math.min(order.length - 1, Math.max(0, current + offset))];
    if (next) setState(next);
  };
  handle.addEventListener("pointerdown", (event) => {
    if (activeKind !== "explore") return;
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

  const rebuildStateControls = (): void => {
    const copy = currentCopy(document);
    stateControls.replaceChildren();
    for (const target of ["peek", "half", "full"] as const) {
      const button = createStateButton(document, target, copy);
      button.addEventListener("click", () => setState(target));
      stateControls.appendChild(button);
    }
    close.setAttribute("aria-label", copy.close);
    close.title = copy.close;
    setState(state);
  };

  const render = (presentation: ExploreFlowBottomSheetPresentation): void => {
    dismissHandler = presentation.onDismiss;
    clearCompatibilityMessageSource();
    compatibilityMessageSource = presentation.messageSource;
    if (compatibilityMessageSource) {
      compatibilityMessageSource.classList.add(
        "explore-flow-message-compat-source",
      );
      compatibilityMessageSource.setAttribute("aria-hidden", "true");
    }
    rebuildStateControls();
    activeKind = presentation.kind;
    sheet.dataset.flowKind = presentation.kind;
    heading.textContent = presentation.accessibleLabel;
    setStatus(
      presentation.status ?? "ready",
      presentation.statusText,
    );

    richContent.replaceChildren();
    if (presentation.content) {
      presentation.content.classList.add("md-card");
      richContent.appendChild(presentation.content);
    }
    richContent.classList.toggle("hidden", richContent.childElementCount === 0);
    actions.replaceChildren(presentation.source);
    presentation.source.classList.add("explore-flow-sheet-source");
    presentation.source.removeAttribute("aria-hidden");
    for (const button of Array.from(
      presentation.source.querySelectorAll<HTMLButtonElement>(
        ".assistant-option-btn",
      ),
    )) {
      const primary =
        presentation.kind === "tour" &&
        isPrimaryTourAction(button.dataset.value ?? "");
      button.classList.add(
        "md-button",
        primary ? "md-button--primary" : "md-button--secondary",
        "explore-flow-sheet-option",
      );
      button.classList.toggle("explore-flow-sheet-option--primary", primary);
    }

    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
  };

  close.addEventListener("click", () => dismissHandler?.());

  return Object.freeze({
    show(presentation: ExploreFlowBottomSheetPresentation): void {
      if (destroyed) return;
      render(presentation);
    },
    hide(): void {
      if (destroyed) return;
      dismissHandler = undefined;
      activeKind = undefined;
      clearCompatibilityMessageSource();
      sheet.classList.add("hidden");
      sheet.setAttribute("aria-hidden", "true");
      delete sheet.dataset.flowKind;
    },
    setState,
    getState(): ExploreFlowBottomSheetState {
      return state;
    },
    setStatus,
    destroy(): void {
      if (destroyed) return;
      clearCompatibilityMessageSource();
      destroyed = true;
      dismissHandler = undefined;
      activeKind = undefined;
      sheet.remove();
    },
  });
}
