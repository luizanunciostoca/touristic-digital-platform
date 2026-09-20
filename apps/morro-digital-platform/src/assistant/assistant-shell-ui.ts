import {
  ASSISTANT_UI_STATE_EVENT,
  assistantUiStateStatus,
  type AssistantUiState,
  type AssistantUiStateDetail,
} from "./assistant-ui-state.js";

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

function setQuickActionState(
  button: HTMLButtonElement | null,
  visible: boolean,
): void {
  if (!button) return;
  button.classList.toggle("active", visible);
  button.setAttribute("aria-expanded", String(visible));
  button.setAttribute("aria-controls", "assistant-messages");
  button.setAttribute("aria-haspopup", "dialog");
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

export function installAssistantShellUi(
  options: AssistantShellUiOptions,
): AssistantShellUi {
  const assistant = options.document.getElementById("assistant-messages");
  const quickAction = options.document.querySelector<HTMLButtonElement>(
    ".quick-actions .action-button.primary",
  );
  const minimizeButton =
    assistant?.querySelector<HTMLButtonElement>(".minimize-button") ?? null;
  const input = options.document.getElementById("assistantInput");
  const status = options.document.getElementById("assistant-dialog-status");
  const focusDelayMs = options.focusDelayMs ?? 100;
  let destroyed = false;
  let previousFocus: Element | null = null;

  const isVisible = (): boolean =>
    Boolean(assistant && !assistant.classList.contains("hidden"));

  const setState = (state: AssistantUiState): void => {
    if (!assistant) return;
    assistant.setAttribute("data-assistant-state", state);
    assistant.setAttribute("aria-busy", String(state === "loading"));
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
        : quickAction;
    previousFocus = null;
    if (!focusElement(candidate)) focusElement(quickAction);
  };

  const show = (): boolean => {
    if (destroyed || !assistant) return false;
    if (!isVisible()) {
      previousFocus = options.document.activeElement;
    }
    assistant.classList.remove("hidden");
    assistant.setAttribute("aria-hidden", "false");
    options.document.body.classList.add("assistant-modal-open");
    setQuickActionState(quickAction, true);
    options.document.defaultView?.setTimeout(() => {
      if (!destroyed && isVisible()) focusElement(input);
    }, focusDelayMs);
    return true;
  };

  const hide = (): boolean => {
    if (destroyed || !assistant) return false;
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
    setQuickActionState(quickAction, false);
    setState("idle");
    hideAssociatedAssistantContent(options.document);
    restoreFocus();
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

  const onQuickActionClick = (): void => {
    toggle();
  };
  const onMinimizeClick = (): void => {
    hide();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !isVisible()) return;
    event.preventDefault();
    event.stopPropagation();
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
  setQuickActionState(quickAction, initiallyVisible);
  setState("idle");
  quickAction?.addEventListener("click", onQuickActionClick);
  quickAction?.setAttribute("data-assistant-shell-ready", "true");
  minimizeButton?.addEventListener("click", onMinimizeClick);
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
      quickAction?.removeEventListener("click", onQuickActionClick);
      quickAction?.removeAttribute("data-assistant-shell-ready");
      minimizeButton?.removeEventListener("click", onMinimizeClick);
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
