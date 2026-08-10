import {
  createAssistantContextManager,
  createAssistantDialogController,
  type AssistantDialogResponse,
} from "@touristic/assistant";

import type { NavigationSessionBootstrap } from "../navigation/navigation-session-bootstrap.js";
import { createAssistantLlmHandler } from "./assistant-llm-adapter.js";
import { createAssistantBrowserDomainHandlers } from "./assistant-domain-adapter.js";
import { createAssistantNavigationAppHandlers } from "./assistant-navigation-adapter.js";
import { createMorroAssistantV1DestinationResolver } from "./assistant-v1-place-resolver.js";

interface AssistantRuntimeEnvironmentGlobal {
  readonly __MORRO_RUNTIME_ENV__?: {
    readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
  };
}

export interface BrowserAssistantRuntimeOptions {
  readonly document: Document;
  readonly navigation: Pick<NavigationSessionBootstrap, "start" | "stop">;
  readonly storage?: Storage;
  readonly fetch?: typeof globalThis.fetch;
  readonly mapboxAccessToken?: string;
}

export interface BrowserAssistantRuntime {
  process(input: string): Promise<AssistantDialogResponse>;
  destroy(): void;
}

interface AssistantPhotoPresentation {
  readonly place: string;
  readonly images: readonly string[];
}

function getMessagesArea(document: Document): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
}

function appendMessage(
  document: Document,
  role: "user" | "assistant",
  text: string,
): void {
  const messagesArea = getMessagesArea(document);
  if (!messagesArea) return;

  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.dataset.messageType = "standard";
  message.textContent = text;
  messagesArea.appendChild(message);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function readPhotoPresentation(
  response: AssistantDialogResponse,
): AssistantPhotoPresentation | null {
  const metadata = response.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  if (metadata.domain !== "photos" || metadata.state !== "resolved")
    return null;
  if (
    metadata.presentation !== "carousel" ||
    typeof metadata.place !== "string"
  ) {
    return null;
  }

  const images = Array.isArray(metadata.images)
    ? metadata.images.filter(
        (image): image is string => typeof image === "string",
      )
    : [];
  if (images.length === 0) return null;
  return { place: metadata.place, images };
}

function appendPhotoCarousel(
  document: Document,
  presentation: AssistantPhotoPresentation,
): void {
  const messagesArea = getMessagesArea(document);
  if (!messagesArea) return;

  const container = document.createElement("section");
  container.className = "assistant-photo-carousel";
  container.dataset.messageType = "photo-carousel";
  container.setAttribute("aria-label", `Fotos de ${presentation.place}`);

  const track = document.createElement("div");
  track.className = "assistant-photo-carousel-track";

  for (const [index, source] of presentation.images.entries()) {
    const figure = document.createElement("figure");
    figure.className = "assistant-photo-carousel-slide";

    const image = document.createElement("img");
    image.src = source;
    image.alt = `${presentation.place} — foto ${index + 1}`;
    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";
    figure.appendChild(image);
    track.appendChild(figure);
  }

  container.appendChild(track);
  messagesArea.appendChild(container);
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

function resolveMapboxAccessToken(override?: string): string | undefined {
  const explicit = override?.trim();
  if (explicit) return explicit;
  const runtime = (
    globalThis as typeof globalThis & AssistantRuntimeEnvironmentGlobal
  ).__MORRO_RUNTIME_ENV__?.VITE_MAPBOX_ACCESS_TOKEN?.trim();
  return runtime || undefined;
}

export function installBrowserAssistantRuntime(
  options: BrowserAssistantRuntimeOptions,
): BrowserAssistantRuntime {
  const storage = resolveStorage(options.document, options.storage);
  const mapboxAccessToken = resolveMapboxAccessToken(options.mapboxAccessToken);
  const context = createAssistantContextManager(storage ? { storage } : {});
  const navigationHandlers = createAssistantNavigationAppHandlers({
    navigation: options.navigation,
    resolver: createMorroAssistantV1DestinationResolver(),
  });
  const domainHandlers = createAssistantBrowserDomainHandlers({
    ...(storage ? { storage } : {}),
    ...(options.document.defaultView?.navigator.geolocation
      ? { geolocation: options.document.defaultView.navigator.geolocation }
      : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(mapboxAccessToken ? { mapboxAccessToken } : {}),
  });
  const controller = createAssistantDialogController({
    context,
    handlers: {
      ...domainHandlers,
      ...navigationHandlers,
    },
    llm: createAssistantLlmHandler({
      ...(options.fetch ? { fetch: options.fetch } : {}),
    }),
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
    const photoPresentation = readPhotoPresentation(response);
    if (photoPresentation) {
      appendPhotoCarousel(options.document, photoPresentation);
    }
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
