import type { AssistantDialogResponse } from "@touristic/assistant";

export interface AssistantDomOption {
  readonly label: string;
  readonly value: string;
}

const ALLOWED_INLINE_TAGS = ["b", "strong", "em"] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function sanitizeAssistantRenderableHtml(value: string): string {
  let output = escapeHtml(value);
  for (const tag of ALLOWED_INLINE_TAGS) {
    output = output
      .replaceAll(`&lt;${tag}&gt;`, `<${tag}>`)
      .replaceAll(`&lt;/${tag}&gt;`, `</${tag}>`);
  }
  return output
    .replaceAll("&lt;br&gt;", "<br>")
    .replaceAll("&lt;br/&gt;", "<br>")
    .replaceAll("&lt;br /&gt;", "<br>");
}

function getMessagesArea(document: Document): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
}

function scrollToLatest(area: HTMLElement): void {
  area.scrollTop = area.scrollHeight;
}

export function clearAssistantDomOptions(document: Document): void {
  getMessagesArea(document)
    ?.querySelector<HTMLElement>(".assistant-options")
    ?.remove();
}

export function appendAssistantDomMessage(
  document: Document,
  role: "user" | "assistant",
  text: string,
  options: {
    readonly clear?: boolean;
    readonly messageType?: string;
  } = {},
): HTMLElement | null {
  const area = getMessagesArea(document);
  if (!area) return null;

  if (options.clear) area.replaceChildren();

  const message = document.createElement("div");
  message.classList.add("message", role);
  message.dataset.messageType = options.messageType ?? "standard";
  message.innerHTML = sanitizeAssistantRenderableHtml(text);
  area.appendChild(message);
  scrollToLatest(area);
  return message;
}

export function renderAssistantDomOptions(
  document: Document,
  options: readonly AssistantDomOption[],
): HTMLElement | null {
  const area = getMessagesArea(document);
  if (!area || options.length === 0) return null;

  clearAssistantDomOptions(document);
  const container = document.createElement("div");
  container.className = "assistant-options";

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "assistant-option-btn";
    button.textContent = option.label;
    button.dataset.value = option.value;
    button.addEventListener("click", () => {
      container.remove();
      button.blur();
      document.dispatchEvent(
        new CustomEvent("morro:assistant-option-selected", {
          detail: { value: option.value },
        }),
      );
    });
    container.appendChild(button);
  }

  area.appendChild(container);
  scrollToLatest(area);
  return container;
}

export function readAssistantResponseOptions(
  response: AssistantDialogResponse,
): readonly AssistantDomOption[] {
  if (!Array.isArray(response.options)) return [];
  return response.options.flatMap((option) => {
    if (
      !option ||
      typeof option !== "object" ||
      typeof option.label !== "string" ||
      typeof option.value !== "string"
    ) {
      return [];
    }
    return [{ label: option.label, value: option.value }];
  });
}
