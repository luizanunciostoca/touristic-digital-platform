import {
  createAssistantContextManager,
  createAssistantDialogController,
  createAssistantUserProfileManager,
  normalizeAssistantVoiceLanguage,
  type AssistantDialogResponse,
} from "@touristic/assistant";

import type { ExploreLocationsControl } from "../map/explore-locations-control.js";
import type { NavigationSessionBootstrap } from "../navigation/navigation-session-bootstrap.js";
import { createAssistantLlmHandler } from "./assistant-llm-adapter.js";
import { createAssistantBrowserDomainHandlers } from "./assistant-domain-adapter.js";
import { createAssistantMessageDom } from "./assistant-message-dom.js";
import {
  clearAssistantDomOptions,
  readAssistantResponseOptions,
  renderAssistantDomOptions,
  type AssistantDomOption,
} from "./assistant-dom-view.js";
import {
  executeAssistantRuntimeAction,
  readAssistantExploreState,
  resolveAssistantMenuCommand,
  resolveAssistantRuntimeAction,
  routeAssistantMenuCommand,
} from "./assistant-menu-command-router.js";
import { createAssistantNavigationAppHandlers } from "./assistant-navigation-adapter.js";
import { createMorroAssistantV1DestinationResolver } from "./assistant-v1-place-resolver.js";
import { createAssistantBrowserVoice } from "./assistant-voice-adapter.js";
import {
  createAssistantBrowserVoiceInput,
  resolveAssistantSpeechRecognitionConstructor,
} from "./assistant-voice-input-adapter.js";
import { installAssistantVoiceSettings } from "./assistant-voice-settings.js";

interface AssistantRuntimeEnvironmentGlobal {
  readonly __MORRO_RUNTIME_ENV__?: {
    readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
  };
}

export interface BrowserAssistantRuntimeOptions {
  readonly document: Document;
  readonly navigation: Pick<NavigationSessionBootstrap, "start" | "stop">;
  readonly explore?: Pick<ExploreLocationsControl, "execute" | "getState">;
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

interface AssistantPresentationSnapshot {
  readonly text: string;
  readonly options: readonly AssistantDomOption[];
}

type AssistantInputSource =
  "button" | "keyboard" | "voice" | "option" | "programmatic";

const CONTROLLER_OWNED_AWAITING_TYPES = new Set([
  "awaiting_place",
  "awaiting_category",
  "awaiting_destination",
]);

function supersededResponse(): AssistantDialogResponse {
  return {
    text: "",
    metadata: { domain: "runtime", state: "superseded" },
  };
}

function getMessagesArea(document: Document): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
}

function readPhotoPresentation(
  response: AssistantDialogResponse,
): AssistantPhotoPresentation | null {
  const metadata = response.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  if (metadata.domain !== "photos" || metadata.state !== "resolved") {
    return null;
  }
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

function isPhotoResponse(response: AssistantDialogResponse): boolean {
  const metadata = response.metadata;
  return Boolean(
    metadata && typeof metadata === "object" && metadata.domain === "photos",
  );
}

function readRuntimeAction(response: AssistantDialogResponse): string | null {
  const metadata = response.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  return typeof metadata.action === "string" ? metadata.action : null;
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

function removePhotoPresentation(document: Document): void {
  const area = getMessagesArea(document);
  if (!area) return;
  for (const element of Array.from(
    area.querySelectorAll<HTMLElement>(
      ".assistant-photo-carousel, .assistant-photo-back-options",
    ),
  )) {
    element.remove();
  }
}

function renderPhotoActionOptions(
  document: Document,
  options: readonly AssistantDomOption[],
): HTMLElement | null {
  const container = renderAssistantDomOptions(document, options);
  if (!container) return null;

  container.dataset.presentation = "photo-actions";
  container.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".assistant-option-btn")) return;
      removePhotoPresentation(document);
    },
    { capture: true },
  );
  return container;
}

function snapshotPresentation(
  text: string,
  options: readonly AssistantDomOption[],
): AssistantPresentationSnapshot {
  return Object.freeze({
    text,
    options: Object.freeze(
      options.map(({ label, value }) => Object.freeze({ label, value })),
    ),
  });
}

function readOptionOverride(
  value: unknown,
): readonly AssistantDomOption[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const options: readonly unknown[] = value;
  const result: AssistantDomOption[] = [];
  for (const option of options) {
    if (
      !option ||
      typeof option !== "object" ||
      !("label" in option) ||
      !("value" in option)
    ) {
      return null;
    }
    const label: unknown = option.label;
    const optionValue: unknown = option.value;
    if (typeof label !== "string" || typeof optionValue !== "string") {
      return null;
    }
    result.push(Object.freeze({ label, value: optionValue }));
  }
  return Object.freeze(result);
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

function voiceInputMessage(
  language: ReturnType<typeof normalizeAssistantVoiceLanguage>,
  state: "listening" | "unsupported" | "error",
): string {
  const messages = {
    pt: {
      listening: "Estou ouvindo...",
      unsupported:
        "Desculpe, seu navegador não suporta reconhecimento de voz. Por favor, digite sua pergunta.",
      error:
        "Desculpe, não consegui entender. Pode tentar novamente ou digitar sua pergunta?",
    },
    en: {
      listening: "I'm listening...",
      unsupported:
        "Sorry, your browser does not support voice recognition. Please type your question.",
      error:
        "Sorry, I couldn't understand. Please try again or type your question.",
    },
    es: {
      listening: "Estoy escuchando...",
      unsupported:
        "Lo siento, tu navegador no admite reconocimiento de voz. Escribe tu pregunta.",
      error:
        "Lo siento, no pude entender. Inténtalo de nuevo o escribe tu pregunta.",
    },
    he: {
      listening: "אני מקשיב...",
      unsupported:
        "מצטערים, הדפדפן שלך אינו תומך בזיהוי קולי. אנא הקלד את השאלה.",
      error: "מצטערים, לא הצלחתי להבין. נסה שוב או הקלד את השאלה.",
    },
  } as const;
  return messages[language][state];
}

export function installBrowserAssistantRuntime(
  options: BrowserAssistantRuntimeOptions,
): BrowserAssistantRuntime {
  const storage = resolveStorage(options.document, options.storage);
  const mapboxAccessToken = resolveMapboxAccessToken(options.mapboxAccessToken);
  const context = createAssistantContextManager(storage ? { storage } : {});
  const profile = createAssistantUserProfileManager(storage ? { storage } : {});
  const messages = createAssistantMessageDom({ document: options.document });
  const navigationHandlers = createAssistantNavigationAppHandlers({
    navigation: options.navigation,
    resolver: createMorroAssistantV1DestinationResolver(),
  });
  const domainHandlers = createAssistantBrowserDomainHandlers({
    profile,
    ...(storage ? { storage } : {}),
    ...(options.document.defaultView?.navigator.geolocation
      ? { geolocation: options.document.defaultView.navigator.geolocation }
      : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(mapboxAccessToken ? { mapboxAccessToken } : {}),
  });
  const controller = createAssistantDialogController({
    context,
    profile,
    handlers: {
      ...domainHandlers,
      ...navigationHandlers,
    },
    llm: createAssistantLlmHandler({
      ...(options.fetch ? { fetch: options.fetch } : {}),
    }),
  });

  const view = options.document.defaultView;
  const onNavigationEnded = (event: Event): void => {
    const detail = "detail" in event ? event.detail : null;
    if (
      detail &&
      typeof detail === "object" &&
      "reason" in detail &&
      detail.reason === "arrived"
    ) {
      profile.recordSuccessfulNavigation();
    }
  };
  view?.addEventListener("navigationEnded", onNavigationEnded);

  const voice =
    view?.speechSynthesis && typeof view.SpeechSynthesisUtterance === "function"
      ? createAssistantBrowserVoice({
          synthesis: view.speechSynthesis,
          createUtterance: (text) => new view.SpeechSynthesisUtterance(text),
          ...(storage ? { storage } : {}),
        })
      : null;
  const voiceSettings = installAssistantVoiceSettings({
    document: options.document,
    voice,
    voices: () =>
      view?.speechSynthesis.getVoices().map((item) => ({
        name: item.name,
        lang: item.lang,
        default: item.default,
      })) ?? [],
  });
  const input = options.document.getElementById("assistantInput");
  const sendButton = options.document.getElementById("sendButton");
  const voiceButton = options.document.getElementById("voiceButton");
  let destroyed = false;
  let requestGeneration = 0;
  let currentPresentation: AssistantPresentationSnapshot | null = null;

  const appendStandardMessage = (
    sender: "user" | "assistant",
    text: string,
  ): void => {
    messages.append({ sender, html: text, messageType: "standard" });
  };

  const voiceLanguage = () =>
    voice?.getPreferences().language ??
    normalizeAssistantVoiceLanguage(options.document.documentElement.lang);

  const readExploreState = () =>
    options.explore?.getState() ?? readAssistantExploreState(options.document);

  const syncExploreContext = (placeHint?: string): void => {
    const state = readExploreState();
    if (state.stage === "filters" && state.category) {
      context.updateContext({
        lastCategory: state.category,
        lastIntent: "categoria",
        awaiting: {
          type: "selecionar_subcategoria",
          category: state.category,
        },
      });
      return;
    }
    if (state.stage === "places" && state.category) {
      context.updateContext({
        lastCategory: state.category,
        lastIntent: "categoria",
        awaiting: {
          type: "selecionar_local",
          category: state.category,
        },
      });
      return;
    }
    if (state.stage === "detail" && state.category) {
      context.updateContext({
        lastCategory: state.category,
        lastIntent: "detalhes",
        awaiting: null,
        ...(placeHint ? { lastPlace: placeHint } : {}),
      });
      return;
    }
    if (state.stage === "menu") {
      context.updateContext({ awaiting: null });
    }
  };

  const processInput = async (
    rawInput: string,
    optionOverride?: readonly AssistantDomOption[],
    preservePreviousOptions = false,
    source: AssistantInputSource = "programmatic",
  ): Promise<AssistantDialogResponse> => {
    const value = rawInput.trim();
    if (!value) return { text: "Como posso ajudar?" };

    const generation = ++requestGeneration;
    const previousPresentation = preservePreviousOptions
      ? currentPresentation
      : null;
    const awaitingType = context.getContext().awaiting?.type;
    const controllerOwnsTurn =
      (typeof awaitingType === "string" &&
        CONTROLLER_OWNED_AWAITING_TYPES.has(awaitingType)) ||
      (source === "option" && optionOverride !== undefined);

    let menuRouted = false;
    if (!controllerOwnsTurn) {
      if (options.explore) {
        const command = resolveAssistantMenuCommand(options.document, value);
        menuRouted = command ? await options.explore.execute(command) : false;
      } else {
        menuRouted = routeAssistantMenuCommand(options.document, value);
      }
    }

    if (destroyed || generation !== requestGeneration) {
      return supersededResponse();
    }

    if (menuRouted) {
      currentPresentation = null;
      queueMicrotask(() => syncExploreContext());
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-menu-command-routed", {
          detail: { message: value, source },
        }),
      );
      const routedText =
        options.document
          .getElementById("assistant-category-results-message")
          ?.textContent?.trim() ?? "";
      if (routedText) voice?.speak(routedText, voiceLanguage());
      return {
        text: routedText,
        metadata: {
          domain: "menu_command",
          state: "routed",
          source,
          explore: readExploreState(),
        },
      };
    }

    clearAssistantDomOptions(options.document);
    removePhotoPresentation(options.document);
    appendStandardMessage("user", value);
    const response = await controller.processUserInput(value);
    if (destroyed || generation !== requestGeneration) return response;

    appendStandardMessage("assistant", response.text);
    const responseOptions =
      optionOverride ?? readAssistantResponseOptions(response);
    const photoPresentation = readPhotoPresentation(response);
    const photoResponse = isPhotoResponse(response);

    if (photoPresentation) {
      appendPhotoCarousel(options.document, photoPresentation);
    }

    if (photoResponse) {
      if (previousPresentation && previousPresentation.options.length > 0) {
        renderPhotoActionOptions(
          options.document,
          previousPresentation.options,
        );
        currentPresentation = previousPresentation;
      } else {
        currentPresentation = snapshotPresentation(response.text, []);
      }
    } else {
      if (responseOptions.length > 0) {
        renderAssistantDomOptions(options.document, responseOptions);
      }
      currentPresentation = snapshotPresentation(
        response.text,
        responseOptions,
      );
    }

    const runtimeAction = readRuntimeAction(response);
    let actionExecuted = false;
    if (runtimeAction) {
      if (options.explore) {
        const command = resolveAssistantRuntimeAction(runtimeAction);
        actionExecuted = command
          ? await options.explore.execute(command)
          : false;
      } else {
        actionExecuted = executeAssistantRuntimeAction(
          options.document,
          runtimeAction,
        );
      }
    }
    if (actionExecuted && generation === requestGeneration) {
      queueMicrotask(() => syncExploreContext());
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-action-executed", {
          detail: { action: runtimeAction, source: "llm" },
        }),
      );
    }

    voice?.speak(response.text, voiceLanguage());
    return response;
  };

  const process = (rawInput: string): Promise<AssistantDialogResponse> =>
    processInput(rawInput, undefined, false, "programmatic");

  const Recognition = view
    ? resolveAssistantSpeechRecognitionConstructor(view)
    : null;
  const voiceInput = Recognition
    ? createAssistantBrowserVoiceInput({
        Recognition,
        language: normalizeAssistantVoiceLanguage(
          options.document.documentElement.lang,
        ),
        onResult: (transcript) => {
          void processInput(transcript, undefined, false, "voice");
        },
        onError: () => {
          appendStandardMessage(
            "assistant",
            voiceInputMessage(
              normalizeAssistantVoiceLanguage(
                options.document.documentElement.lang,
              ),
              "error",
            ),
          );
        },
        onListeningChange: (listening) => {
          voiceButton?.classList.toggle("listening", listening);
          voiceButton?.setAttribute(
            "aria-pressed",
            listening ? "true" : "false",
          );
        },
      })
    : null;

  const submitInput = (source: "button" | "keyboard"): void => {
    if (destroyed || !(input instanceof HTMLInputElement)) return;
    const value = input.value;
    if (!value.trim()) return;
    input.value = "";
    void processInput(value, undefined, false, source);
  };

  const onSendClick = (): void => submitInput("button");
  const onInputKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Enter") return;
    if (event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submitInput("keyboard");
  };
  const onOptionSelected = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail as {
      value?: unknown;
      optionsOverride?: unknown;
    } | null;
    const value = typeof detail?.value === "string" ? detail.value : "";
    if (!value) return;
    const optionOverride = readOptionOverride(detail?.optionsOverride);
    void processInput(
      value,
      optionOverride ?? undefined,
      value.trim().toLowerCase() === "ver fotos",
      "option",
    );
  };
  const onVoiceClick = (): void => {
    if (destroyed) return;
    const language = voiceLanguage();
    if (!voiceInput) {
      appendStandardMessage(
        "assistant",
        voiceInputMessage(language, "unsupported"),
      );
      return;
    }
    if (voiceInput.isListening()) {
      voiceInput.stop();
      return;
    }
    voiceInput.setLanguage(language);
    if (voiceInput.start()) {
      appendStandardMessage(
        "assistant",
        voiceInputMessage(language, "listening"),
      );
    }
  };

  const scheduleExploreContextSync = (event: Event): void => {
    const target = event.target;
    const button =
      target instanceof Element
        ? target.closest<HTMLButtonElement>(
            "[data-explore-category], .assistant-flow-option",
          )
        : null;
    const placeHint = button?.dataset.locationName;
    if (!button && event.type !== "morro:assistant-option-selected") return;
    queueMicrotask(() => syncExploreContext(placeHint));
  };

  const onExploreEscape = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    queueMicrotask(() => syncExploreContext());
  };

  sendButton?.addEventListener("click", onSendClick);
  input?.addEventListener("keydown", onInputKeyDown);
  voiceButton?.setAttribute("aria-pressed", "false");
  voiceButton?.addEventListener("click", onVoiceClick);
  options.document.addEventListener(
    "morro:assistant-option-selected",
    scheduleExploreContextSync,
    true,
  );
  options.document.addEventListener("click", scheduleExploreContextSync, true);
  options.document.addEventListener("keydown", onExploreEscape, true);
  options.document.addEventListener(
    "morro:assistant-option-selected",
    onOptionSelected,
  );

  return Object.freeze({
    process,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      requestGeneration += 1;
      view?.removeEventListener("navigationEnded", onNavigationEnded);
      sendButton?.removeEventListener("click", onSendClick);
      input?.removeEventListener("keydown", onInputKeyDown);
      voiceButton?.removeEventListener("click", onVoiceClick);
      options.document.removeEventListener(
        "morro:assistant-option-selected",
        scheduleExploreContextSync,
        true,
      );
      options.document.removeEventListener(
        "click",
        scheduleExploreContextSync,
        true,
      );
      options.document.removeEventListener("keydown", onExploreEscape, true);
      options.document.removeEventListener(
        "morro:assistant-option-selected",
        onOptionSelected,
      );
      voiceSettings.destroy();
      voiceInput?.destroy();
      voice?.destroy();
      context.flush();
    },
  });
}
