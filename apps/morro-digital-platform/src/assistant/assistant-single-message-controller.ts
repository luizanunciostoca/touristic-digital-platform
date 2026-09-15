export interface AssistantSingleMessageControllerOptions {
  readonly document: Document;
}

export interface AssistantSingleMessageController {
  reconcile(): void;
  destroy(): void;
}

const CATEGORY_FLOW_RESULTS_ID = "assistant-category-results";
const CATEGORY_FLOW_MESSAGE_ID = "assistant-category-results-message";

function directChildrenByClass(
  container: HTMLElement,
  className: string,
): HTMLElement[] {
  return Array.from(container.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains(className),
  );
}

function setHidden(element: HTMLElement | null, hidden: boolean): void {
  if (!element) return;
  element.classList.toggle("hidden", hidden);
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function ensureCategoryFlowMessage(area: HTMLElement): HTMLElement | null {
  const results = area.querySelector<HTMLElement>(`#${CATEGORY_FLOW_RESULTS_ID}`);
  if (!results) return null;

  const text = results.getAttribute("aria-label")?.trim() ?? "";
  let message = area.querySelector<HTMLElement>(`#${CATEGORY_FLOW_MESSAGE_ID}`);
  if (!message) {
    message = area.ownerDocument.createElement("div");
    message.id = CATEGORY_FLOW_MESSAGE_ID;
    message.className = "message assistant";
    message.dataset.messageType = "category-flow";
    area.insertBefore(message, results);
  }

  message.dataset.category = results.dataset.category ?? "";
  if (text && message.textContent !== text) message.textContent = text;
  return message;
}

/**
 * Restores the audited V1 assistant presentation contract: one visible
 * conversational message at a time. The shell welcome/menu is preserved so
 * the Explore controller can restore it when a category flow ends.
 */
export function installAssistantSingleMessageController({
  document,
}: AssistantSingleMessageControllerOptions): AssistantSingleMessageController {
  const area = document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
  if (!area) {
    return Object.freeze({
      reconcile() {},
      destroy() {},
    });
  }

  const shellMessage = directChildrenByClass(area, "message")[0] ?? null;
  const shellOptions =
    directChildrenByClass(area, "assistant-options")[0] ?? null;
  let destroyed = false;
  let reconciling = false;

  const reconcile = (): void => {
    if (destroyed || reconciling) return;
    reconciling = true;
    try {
      const categoryFlowMessage = ensureCategoryFlowMessage(area);
      const messages = directChildrenByClass(area, "message");
      const dynamicMessages = messages.filter(
        (message) => message !== shellMessage,
      );
      const latestDynamicMessage =
        categoryFlowMessage ?? dynamicMessages.at(-1) ?? null;

      // V1 never leaves older conversational messages stacked below the
      // current response. Remove stale dynamic nodes rather than merely
      // hiding them so a later menu restore cannot resurrect old content.
      for (const message of dynamicMessages) {
        if (message !== latestDynamicMessage) message.remove();
      }

      if (latestDynamicMessage) {
        setHidden(shellMessage, true);
        setHidden(latestDynamicMessage, false);

        if (categoryFlowMessage) {
          delete shellOptions?.dataset.singleMessageHidden;
          setHidden(shellOptions, true);
        } else if (shellOptions && !shellOptions.classList.contains("hidden")) {
          shellOptions.dataset.singleMessageHidden = "true";
          setHidden(shellOptions, true);
        }
        return;
      }

      // If this controller hid the menu for a normal assistant response,
      // restore it once that response is removed. Category flows hide the
      // menu themselves and therefore do not receive this marker.
      if (shellOptions?.dataset.singleMessageHidden === "true") {
        delete shellOptions.dataset.singleMessageHidden;
        setHidden(shellOptions, false);
      }

      const shellMenuVisible =
        shellOptions !== null && !shellOptions.classList.contains("hidden");
      setHidden(shellMessage, !shellMenuVisible);
    } finally {
      reconciling = false;
    }
  };

  const MutationObserverConstructor = document.defaultView?.MutationObserver;
  const observer = MutationObserverConstructor
    ? new MutationObserverConstructor(reconcile)
    : null;
  observer?.observe(area, { childList: true });
  reconcile();

  return Object.freeze({
    reconcile,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      delete shellOptions?.dataset.singleMessageHidden;
    },
  });
}
