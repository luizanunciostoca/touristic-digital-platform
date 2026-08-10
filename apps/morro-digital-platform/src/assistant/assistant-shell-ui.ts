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
}

function hideAssociatedAssistantContent(document: Document): void {
  document
    .querySelector<HTMLElement>(".carousel-container")
    ?.classList.add("hidden");
  document
    .querySelector<HTMLElement>(".carousel-follow-up")
    ?.classList.add("hidden");
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
  const focusDelayMs = options.focusDelayMs ?? 100;
  let destroyed = false;

  const isVisible = (): boolean =>
    Boolean(assistant && !assistant.classList.contains("hidden"));

  const show = (): boolean => {
    if (destroyed || !assistant) return false;
    assistant.classList.remove("hidden");
    assistant.setAttribute("aria-hidden", "false");
    options.document.body.classList.add("assistant-modal-open");
    setQuickActionState(quickAction, true);
    options.document.defaultView?.setTimeout(() => {
      if (!destroyed && input instanceof HTMLInputElement) input.focus();
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
    hideAssociatedAssistantContent(options.document);
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
    if (event.key === "Escape" && isVisible()) hide();
  };

  const initiallyVisible = isVisible();
  assistant?.setAttribute("aria-hidden", String(!initiallyVisible));
  setQuickActionState(quickAction, initiallyVisible);
  quickAction?.addEventListener("click", onQuickActionClick);
  minimizeButton?.addEventListener("click", onMinimizeClick);
  options.document.addEventListener("keydown", onKeyDown);

  return Object.freeze({
    show,
    hide,
    toggle,
    isVisible,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      quickAction?.removeEventListener("click", onQuickActionClick);
      minimizeButton?.removeEventListener("click", onMinimizeClick);
      options.document.removeEventListener("keydown", onKeyDown);
    },
  });
}
