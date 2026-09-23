import {
  ASSISTANT_UI_STATE_EVENT,
  assistantUiStateStatus,
  type AssistantUiState,
  type AssistantUiStateDetail,
} from "./assistant-ui-state.js";

export const ASSISTANT_OPEN_REQUEST_EVENT = "morro:assistant-open-request";
export const ASSISTANT_CLOSE_REQUEST_EVENT = "morro:assistant-close-request";

function dispatchAssistantShellRequest(document: Document, type: string): void {
  const EventConstructor = document.defaultView?.Event ?? globalThis.Event;
  document.dispatchEvent(new EventConstructor(type));
}

export function requestAssistantOpen(document: Document): void {
  dispatchAssistantShellRequest(document, ASSISTANT_OPEN_REQUEST_EVENT);
}

export function requestAssistantClose(document: Document): void {
  dispatchAssistantShellRequest(document, ASSISTANT_CLOSE_REQUEST_EVENT);
}

interface AssistantTutorialWindow extends Window {
  readonly __tourActive?: boolean;
}

export interface AssistantShellUiOptions {
  readonly document: Document;
  readonly focusDelayMs?: number;
}

export interface AssistantShellUi {
  show(): boolean;
  hide(): boolean;
  toggle(): boolean;
  isVisible(): boolean;
  setState(state: AssistantUiState): void;
  destroy(): void;
}

function isTutorialActive(document: Document): boolean {
  const view = document.defaultView as AssistantTutorialWindow | null;
  return Boolean(
    view?.__tourActive || document.body.classList.contains("tour-active"),
  );
}

function hideAssociatedAssistantContent(document: Document): void {
  document
    .querySelector<HTMLElement>(".carousel-container")
    ?.classList.add("hidden");
  document
    .querySelector<HTMLElement>(".carousel-follow-up")
    ?.classList.add("hidden");
}

function clearTransientDetailPresentation(document: Document): void {
  const selectors = [
    ".assistant-photo-carousel",
    ".assistant-photo-back-options",
    '.assistant-options[data-presentation="photo-actions"]',
  ];
  for (const selector of selectors) {
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    )) {
      element.remove();
    }
  }
}

function focusElement(element: Element | null | undefined): boolean {
  const candidate = element as (HTMLElement & { focus?: () => void }) | null;
  if (!candidate || typeof candidate.focus !== "function") return false;
  candidate.focus();
  return true;
}

function syncAssistantLoadingSkeleton(
  document: Document,
  loading: boolean,
): void {
  const area = document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
  if (!area) return;

  const existing = area.querySelector<HTMLElement>(
    ".assistant-loading-skeleton",
  );
  if (!loading) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const skeleton = document.createElement("div");
  skeleton.className = "assistant-loading-skeleton";
  skeleton.setAttribute("aria-hidden", "true");
  skeleton.dataset.messageType = "loading-skeleton";

  for (const size of ["short", "long", "medium"] as const) {
    const line = document.createElement("span");
    line.className = "md-skeleton assistant-loading-skeleton-line";
    line.dataset.size = size;
    skeleton.appendChild(line);
  }
  area.appendChild(skeleton);
}

export function installAssistantShellUi(
  options: AssistantShellUiOptions,
): AssistantShellUi {
  const assistant = options.document.getElementById("assistant-messages");
  const composer = options.document.getElementById("assistant-input-area");
  const minimizeButton =
    assistant?.querySelector<HTMLButtonElement>(".minimize-button") ?? null;
  const input = options.document.getElementById("assistantInput");
  const voiceButton = options.document.getElementById("voiceButton");
  const focusTarget = voiceButton ?? input;
  const status = options.document.getElementById("assistant-dialog-status");
  const focusDelayMs = options.focusDelayMs ?? 100;
  let destroyed = false;
  let previousFocus: Element | null = null;
  let pendingFocusTimer: number | undefined;

  const cancelPendingFocus = (): void => {
    if (pendingFocusTimer === undefined) return;
    options.document.defaultView?.clearTimeout(pendingFocusTimer);
    pendingFocusTimer = undefined;
  };

  const isVisible = (): boolean =>
    Boolean(assistant && !assistant.classList.contains("hidden"));

  const setState = (state: AssistantUiState): void => {
    if (!assistant) return;
    assistant.setAttribute("data-assistant-state", state);
    assistant.setAttribute("aria-busy", String(state === "loading"));
    syncAssistantLoadingSkeleton(options.document, state === "loading");
    if (status) {
      status.textContent = assistantUiStateStatus(
        state,
        options.document.documentElement.lang,
      );
    }
  };

  const restoreFocus = (): void => {
    const candidate =
      previousFocus && !assistant?.contains(previousFocus)
        ? previousFocus
        : focusTarget;
    previousFocus = null;
    if (!focusElement(candidate)) focusElement(focusTarget);
  };

  const show = (): boolean => {
    if (destroyed || !assistant) return false;
    const activeElement = options.document.activeElement;
    const openedFromComposer = Boolean(
      composer && activeElement && composer.contains(activeElement),
    );
    const wasVisible = isVisible();
    if (!wasVisible) {
      previousFocus = activeElement;
    }
    assistant.classList.remove("hidden");
    assistant.setAttribute("aria-hidden", "false");
    options.document.body.classList.add("assistant-modal-open");
    input?.setAttribute("aria-expanded", "true");
    voiceButton?.setAttribute("aria-expanded", "true");
    if (!wasVisible && !openedFromComposer) {
      cancelPendingFocus();
      const focusOrigin = activeElement;
      pendingFocusTimer = options.document.defaultView?.setTimeout(() => {
        pendingFocusTimer = undefined;
        if (
          !destroyed &&
          isVisible() &&
          options.document.activeElement === focusOrigin
        ) {
          focusElement(focusTarget);
        }
      }, focusDelayMs);
    }
    return true;
  };

  const hide = (shouldRestoreFocus = true): boolean => {
    if (destroyed || !assistant) return false;
    cancelPendingFocus();
    if (isTutorialActive(options.document)) {
      show();
      return false;
    }

    assistant.classList.add("hidden");
    assistant.setAttribute("aria-hidden", "true");
    options.document.body.classList.remove(
      "assistant-modal-open",
      "assistant-messages",
      "assistant-active",
    );
    input?.setAttribute("aria-expanded", "false");
    voiceButton?.setAttribute("aria-expanded", "false");
    setState("idle");
    hideAssociatedAssistantContent(options.document);
    if (shouldRestoreFocus) {
      restoreFocus();
    } else {
      previousFocus = null;
    }
    return true;
  };

  const toggle = (): boolean => {
    if (destroyed || !assistant) return false;
    if (isTutorialActive(options.document)) {
      show();
      return true;
    }
    return isVisible() ? (hide(), false) : (show(), true);
  };

  const onComposerFocusIn = (event: FocusEvent): void => {
    cancelPendingFocus();
    const target = event.target as { id?: string } | null;
    if (target?.id === "configButton") return;
    if (!isVisible()) show();
  };
  const onAssistantOpenRequest = (): void => {
    show();
  };
  const onAssistantCloseRequest = (): void => {
    hide(false);
  };
  const onMinimizeClick = (): void => {
    hide();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !isVisible()) return;
    event.preventDefault();
    event.stopPropagation();

    const unifiedDockOwnsAssistant =
      options.document.body.dataset.mdUnifiedDock === "true" ||
      assistant?.parentElement?.id === "unified-assistant-dock";
    if (unifiedDockOwnsAssistant) {
      setState("idle");
      focusElement(focusTarget);
      return;
    }

    hide();
  };
  const onExploreStateChanged = (): void => {
    clearTransientDetailPresentation(options.document);
  };
  const onAssistantUiState = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail as AssistantUiStateDetail | null;
    if (!detail) return;
    if (
      detail.state !== "idle" &&
      detail.state !== "loading" &&
      detail.state !== "success" &&
      detail.state !== "error"
    ) {
      return;
    }
    setState(detail.state);
  };

  const initiallyVisible = isVisible();
  assistant?.setAttribute("aria-hidden", String(!initiallyVisible));
  input?.setAttribute("aria-controls", "assistant-messages");
  input?.setAttribute("aria-expanded", String(initiallyVisible));
  voiceButton?.setAttribute("aria-controls", "assistant-messages");
  voiceButton?.setAttribute("aria-expanded", String(initiallyVisible));
  composer?.setAttribute("data-assistant-shell-ready", "true");
  setState("idle");
  composer?.addEventListener("focusin", onComposerFocusIn);
  minimizeButton?.addEventListener("click", onMinimizeClick);
  options.document.addEventListener(
    ASSISTANT_OPEN_REQUEST_EVENT,
    onAssistantOpenRequest,
  );
  options.document.addEventListener(
    ASSISTANT_CLOSE_REQUEST_EVENT,
    onAssistantCloseRequest,
  );
  options.document.addEventListener("keydown", onKeyDown);
  options.document.addEventListener(
    "morro:explore-state-changed",
    onExploreStateChanged,
  );
  options.document.addEventListener(
    ASSISTANT_UI_STATE_EVENT,
    onAssistantUiState,
  );

  return Object.freeze({
    show,
    hide,
    toggle,
    isVisible,
    setState,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cancelPendingFocus();
      composer?.removeEventListener("focusin", onComposerFocusIn);
      composer?.removeAttribute("data-assistant-shell-ready");
      minimizeButton?.removeEventListener("click", onMinimizeClick);
      options.document.removeEventListener(
        ASSISTANT_OPEN_REQUEST_EVENT,
        onAssistantOpenRequest,
      );
      options.document.removeEventListener(
        ASSISTANT_CLOSE_REQUEST_EVENT,
        onAssistantCloseRequest,
      );
      options.document.removeEventListener("keydown", onKeyDown);
      options.document.removeEventListener(
        "morro:explore-state-changed",
        onExploreStateChanged,
      );
      options.document.removeEventListener(
        ASSISTANT_UI_STATE_EVENT,
        onAssistantUiState,
      );
      previousFocus = null;
    },
  });
}
