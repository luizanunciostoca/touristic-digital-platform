import {
  createAssistantContextManager,
  createAssistantDialogController,
  type AssistantDialogResponse,
} from "@touristic/assistant";

import type { NavigationSessionBootstrap } from "../navigation/navigation-session-bootstrap.js";
import { createMorroAssistantDestinationResolver } from "./assistant-destination-resolver.js";
import { createAssistantNavigationAppHandlers } from "./assistant-navigation-adapter.js";

export interface BrowserAssistantRuntimeOptions {
  readonly document: Document;
  readonly navigation: Pick<NavigationSessionBootstrap, "start" | "stop">;
  readonly storage?: Storage;
}

export interface BrowserAssistantRuntime {
  process(input: string): Promise<AssistantDialogResponse>;
  destroy(): void;
}

function appendMessage(
  document: Document,
  role: "user" | "assistant",
  text: string,
): void {
  const messagesArea = document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
  if (!messagesArea) return;

  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.dataset.messageType = "standard";
  message.textContent = text;
  messagesArea.appendChild(message);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function resolveStorage(
  document: Document,
  override?: Storage,
): Storage | undefined {
  if (override) return override;
  try {
    return document.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

export function installBrowserAssistantRuntime(
  options: BrowserAssistantRuntimeOptions,
): BrowserAssistantRuntime {
  const storage = resolveStorage(options.document, options.storage);
  const context = createAssistantContextManager(storage ? { storage } : {});
  const navigationHandlers = createAssistantNavigationAppHandlers({
    navigation: options.navigation,
    resolver: createMorroAssistantDestinationResolver(),
  });
  const controller = createAssistantDialogController({
    context,
    handlers: navigationHandlers,
  });

  const input = options.document.getElementById("assistantInput");
  const sendButton = options.document.getElementById("sendButton");
  let destroyed = false;

  const process = async (
    rawInput: string,
  ): Promise<AssistantDialogResponse> => {
    const value = rawInput.trim();
    if (!value) return { text: "Como posso ajudar?" };
    appendMessage(options.document, "user", value);
    const response = await controller.processUserInput(value);
    appendMessage(options.document, "assistant", response.text);
    return response;
  };

  const submitInput = (): void => {
    if (destroyed || !(input instanceof HTMLInputElement)) return;
    const value = input.value;
    input.value = "";
    void process(value);
  };

  const onSendClick = (): void => submitInput();
  const onInputKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Enter") return;
    event.preventDefault();
    submitInput();
  };
  const onOptionSelected = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail as { value?: unknown } | null;
    const value = typeof detail?.value === "string" ? detail.value : "";
    if (value) void process(value);
  };

  sendButton?.addEventListener("click", onSendClick);
  input?.addEventListener("keydown", onInputKeyDown);
  options.document.addEventListener(
    "morro:assistant-option-selected",
    onOptionSelected,
  );

  return Object.freeze({
    process,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      sendButton?.removeEventListener("click", onSendClick);
      input?.removeEventListener("keydown", onInputKeyDown);
      options.document.removeEventListener(
        "morro:assistant-option-selected",
        onOptionSelected,
      );
      context.flush();
    },
  });
}
