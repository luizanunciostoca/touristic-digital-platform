import type { MapboxGlMapLike } from "@touristic/geospatial";

import {
  createAssistantContextManager,
  createAssistantDialogController,
  createAssistantUserProfileManager,
  normalizeAssistantVoiceLanguage,
  type AssistantDialogResponse,
  type AssistantInterestCategory,
} from "@touristic/assistant";

import type {
  ExploreLocationsCommand,
  ExploreLocationsControl,
} from "../map/explore-locations-control.js";
import type { NavigationSessionBootstrap } from "../navigation/navigation-session-bootstrap.js";
import { fetchMorroWeather } from "../weather/weather-widget.js";
import { createAssistantLlmHandler } from "./assistant-llm-adapter.js";
import { createAssistantV1IntelligenceHandlers } from "./assistant-v1-intelligence-adapter.js";
import { resolveAssistantV1History } from "./assistant-v1-history-adapter.js";
import { executeAssistantV1MapCommand } from "./assistant-v1-map-command-adapter.js";
import { resolveAssistantV1PlaceAction } from "./assistant-v1-place-action-adapter.js";
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
  readonly explore?: Pick<
    ExploreLocationsControl,
    "execute" | "getState" | "showCategoryOnMap" | "showAllOnMap"
  >;
  readonly map?: MapboxGlMapLike;
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

function toProfileInterestCategory(
  value: string | null,
): AssistantInterestCategory | null {
  switch (value) {
    case "beaches":
    case "restaurants":
    case "hotels":
    case "shops":
    case "attractions":
    case "nightlife":
    case "tours":
    case "emergencies":
      return value;
    default:
      return null;
  }
}

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

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readDeterministicExploreCommands(
  response: AssistantDialogResponse,
): readonly ExploreLocationsCommand[] {
  const metadata = response.metadata;
  const rawCommands: unknown =
    metadata && typeof metadata === "object"
      ? metadata.exploreCommands
      : undefined;
  if (
    !metadata ||
    typeof metadata !== "object" ||
    metadata.deterministic !== true ||
    metadata.fromLLM === true ||
    !isUnknownArray(rawCommands)
  ) {
    return [];
  }

  const commands: ExploreLocationsCommand[] = [];
  for (const raw of rawCommands) {
    if (!raw || typeof raw !== "object" || !("type" in raw)) return [];
    const type = raw.type;
    if (
      type === "open_category" &&
      "category" in raw &&
      typeof raw.category === "string"
    ) {
      commands.push({ type, category: raw.category });
      continue;
    }
    if (
      type === "apply_option" &&
      "value" in raw &&
      typeof raw.value === "string"
    ) {
      commands.push({ type, value: raw.value });
      continue;
    }
    if (
      type === "show_all" ||
      type === "show_nearby" ||
      type === "back_to_filters" ||
      type === "back_to_menu"
    ) {
      commands.push({ type });
      continue;
    }
    if (
      type === "select_place" &&
      "place" in raw &&
      typeof raw.place === "string"
    ) {
      commands.push({ type, place: raw.place });
      continue;
    }
    return [];
  }
  return Object.freeze(commands);
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

function readVisiblePresentation(
  document: Document,
): AssistantPresentationSnapshot | null {
  const flow = document.getElementById("assistant-category-results");
  const flowButtons =
    flow && !flow.classList.contains("hidden")
      ? Array.from(
          flow.querySelectorAll<HTMLButtonElement>(".assistant-option-btn"),
        )
      : [];
  const dynamicContainers = Array.from(
    document.querySelectorAll<HTMLElement>(
      "#assistant-messages .assistant-options",
    ),
  ).filter((container) => !container.querySelector("[data-explore-category]"));
  const dynamicButtons = Array.from(
    dynamicContainers
      .at(-1)
      ?.querySelectorAll<HTMLButtonElement>(".assistant-option-btn") ?? [],
  );
  const buttons = flowButtons.length > 0 ? flowButtons : dynamicButtons;
  const visibleOptions = buttons.flatMap((button) => {
    const label = button.textContent?.trim();
    const value = button.dataset.value?.trim();
    return label && value ? [{ label, value }] : [];
  });
  if (visibleOptions.length === 0) return null;

  const text =
    document
      .getElementById("assistant-category-results-message")
      ?.textContent?.trim() ??
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "#assistant-messages .message.assistant",
      ),
    )
      .at(-1)
      ?.textContent?.trim() ??
    "";
  return snapshotPresentation(text, visibleOptions);
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
  const intelligenceHandlers = createAssistantV1IntelligenceHandlers({
    profile,
    getWeather: async () => {
      try {
        const reading = await fetchMorroWeather(
          options.fetch ?? globalThis.fetch,
        );
        return {
          temp: reading.temperatureCelsius,
          precipprob: reading.rainChancePercent,
          condition: String(reading.weatherCode),
        };
      } catch {
        return null;
      }
    },
  });
  const controller = createAssistantDialogController({
    context,
    profile,
    handlers: {
      ...domainHandlers,
      ...intelligenceHandlers,
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
  let legacyMenuRouting = false;
  let profiledExploreCategory: string | null = null;
  let profiledExplorePlace: string | null = null;

  const appendStandardMessage = (
    sender: "user" | "assistant",
    text: string,
  ): void => {
    messages.append({ sender, html: text, messageType: "standard" });
  };

  const voiceLanguage = () =>
    voice?.getPreferences().language ??
    normalizeAssistantVoiceLanguage(options.document.documentElement.lang);

  const presentationLanguage = () =>
    normalizeAssistantVoiceLanguage(options.document.documentElement.lang);

  const readExploreState = () =>
    options.explore?.getState() ?? readAssistantExploreState(options.document);

  const syncExploreContext = (placeHint?: string): void => {
    const state = readExploreState();
    const interestCategory = toProfileInterestCategory(state.category);
    if (interestCategory && state.category !== profiledExploreCategory) {
      profile.recordInteraction(
        state.category ?? interestCategory,
        interestCategory,
      );
      profiledExploreCategory = state.category;
    }
    const selectedPlace = placeHint ?? state.place;
    if (selectedPlace && selectedPlace !== profiledExplorePlace) {
      profile.recordInteraction(selectedPlace, interestCategory, {
        name: selectedPlace,
        category: interestCategory,
      });
      profiledExplorePlace = selectedPlace;
    }
    if (state.stage === "filters" && state.category) {
      context.updateContext({
        lastCategory: state.category,
        lastPlace: null,
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
        lastPlace: null,
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
        ...(selectedPlace ? { lastPlace: selectedPlace } : {}),
      });
      return;
    }
    if (state.stage === "tour" && state.category) {
      context.updateContext({
        lastCategory: state.category,
        lastIntent: "tour",
        awaiting: null,
      });
      return;
    }
    if (state.stage === "menu") {
      profiledExploreCategory = null;
      profiledExplorePlace = null;
      context.updateContext({ awaiting: null });
    }
  };

  const processInput = async (
    rawInput: string,
    optionOverride?: readonly AssistantDomOption[],
    preservePreviousOptions = false,
    source: AssistantInputSource = "programmatic",
  ): Promise<AssistantDialogResponse> => {
    const submittedValue = rawInput.trim();
    if (!submittedValue) return { text: "Como posso ajudar?" };
    const numericIndex = /^\d+$/u.test(submittedValue)
      ? Number(submittedValue) - 1
      : -1;
    const selectedNumericOption =
      numericIndex >= 0
        ? currentPresentation?.options[numericIndex]
        : undefined;
    const value = selectedNumericOption?.value.trim() || submittedValue;

    const generation = ++requestGeneration;

    // V1 exposes some labels (notably “ver todos”) in both MapCommander and
    // contextual Explore menus. Preserve the active product flow first so a
    // visible menu choice is not stolen by the global map command router.
    const exploreStateBeforeMap = options.explore?.getState();
    const contextualExploreCommand =
      exploreStateBeforeMap && exploreStateBeforeMap.stage !== "menu"
        ? resolveAssistantMenuCommand(options.document, value)
        : null;

    const mapResponse = contextualExploreCommand
      ? null
      : await executeAssistantV1MapCommand({
          input: value,
          language: presentationLanguage(),
          ...(options.map ? { map: options.map } : {}),
          ...(options.explore
            ? {
                explore: {
                  showCategoryOnMap: (category) =>
                    options.explore!.showCategoryOnMap(category),
                  showAllOnMap: () => options.explore!.showAllOnMap(),
                },
              }
            : {}),
        });
    if (mapResponse) {
      if (destroyed || generation !== requestGeneration)
        return supersededResponse();
      clearAssistantDomOptions(options.document);
      removePhotoPresentation(options.document);
      appendStandardMessage("user", submittedValue);
      appendStandardMessage("assistant", mapResponse.text);
      const mapOptions = readAssistantResponseOptions(mapResponse);
      if (mapOptions.length > 0)
        renderAssistantDomOptions(options.document, mapOptions);
      currentPresentation = snapshotPresentation(mapResponse.text, mapOptions);
      context.updateContext({
        lastIntent: "map_command",
        fallbackCount: 0,
        awaiting: null,
      });
      context.addToHistory({
        input: submittedValue,
        response: mapResponse.text,
      });
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-map-command-routed", {
          detail: { command: mapResponse.metadata?.command ?? null, source },
        }),
      );
      voice?.speak(mapResponse.text, voiceLanguage());
      return mapResponse;
    }

    const historySnapshot = context.getContext();
    const historyResponse = resolveAssistantV1History(
      value,
      historySnapshot.history,
      presentationLanguage(),
    );
    if (historyResponse) {
      if (destroyed || generation !== requestGeneration)
        return supersededResponse();
      clearAssistantDomOptions(options.document);
      removePhotoPresentation(options.document);
      appendStandardMessage("user", submittedValue);
      appendStandardMessage("assistant", historyResponse.text);
      currentPresentation = snapshotPresentation(historyResponse.text, []);
      context.updateContext({
        lastIntent: "history",
        fallbackCount: 0,
        awaiting: null,
      });
      // Match V1 semantics: format the previous history first, then record this turn.
      context.addToHistory({
        input: submittedValue,
        response: historyResponse.text,
      });
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-history-routed", {
          detail: { source },
        }),
      );
      voice?.speak(historyResponse.text, voiceLanguage());
      return historyResponse;
    }

    const placeActionContext = context.getContext();
    const placeAction = resolveAssistantV1PlaceAction({
      input: value,
      lastPlace: placeActionContext.lastPlace,
      lastCategory: placeActionContext.lastCategory,
      language: presentationLanguage(),
    });

    if (placeAction) {
      if (destroyed || generation !== requestGeneration) {
        return supersededResponse();
      }

      clearAssistantDomOptions(options.document);
      removePhotoPresentation(options.document);
      appendStandardMessage("user", submittedValue);

      const response = placeAction.response;
      appendStandardMessage("assistant", response.text);
      const responseOptions = readAssistantResponseOptions(response);
      if (responseOptions.length > 0) {
        renderAssistantDomOptions(options.document, responseOptions);
      }
      currentPresentation = snapshotPresentation(
        response.text,
        responseOptions,
      );

      const interestCategory = toProfileInterestCategory(placeAction.category);
      profile.recordInteraction(submittedValue, interestCategory, {
        name: placeAction.place.name,
        category: placeAction.category,
      });

      if (placeAction.navigationDestination) {
        context.updateContext({
          lastIntent: "navigate",
          lastPlace: placeAction.place.name,
          lastCategory: placeAction.category,
          fallbackCount: 0,
          awaiting: { type: "confirmar_navegacao", intent: "navigate" },
          pendingRoute: placeAction.navigationDestination,
          selectedDestination: placeAction.navigationDestination,
        });
      } else {
        context.updateContext({
          lastIntent: "place_action",
          lastPlace: placeAction.place.name,
          lastCategory: placeAction.category,
          fallbackCount: 0,
          awaiting: null,
          ...(placeActionContext.awaiting?.type === "confirmar_navegacao"
            ? { pendingRoute: null, selectedDestination: null }
            : {}),
        });
      }
      context.addToHistory({ input: submittedValue, response: response.text });

      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-place-action-routed", {
          detail: {
            action: response.metadata?.action ?? null,
            place: placeAction.place.name,
            category: placeAction.category,
            source,
          },
        }),
      );
      voice?.speak(response.text, voiceLanguage());
      return response;
    }
    const visiblePresentation = readVisiblePresentation(options.document);
    const previousPresentation = preservePreviousOptions
      ? (currentPresentation ?? visiblePresentation)
      : (visiblePresentation ?? currentPresentation);
    const awaitingType = context.getContext().awaiting?.type;
    const menuCommand = resolveAssistantMenuCommand(options.document, value);
    const explicitCategoryInterrupt =
      (awaitingType === "awaiting_place" ||
        awaitingType === "awaiting_destination") &&
      menuCommand?.type === "open_category";
    const controllerOwnsTurn =
      (typeof awaitingType === "string" &&
        CONTROLLER_OWNED_AWAITING_TYPES.has(awaitingType) &&
        !explicitCategoryInterrupt) ||
      (source === "option" && optionOverride !== undefined);

    let menuRouted = false;
    if (!controllerOwnsTurn) {
      if (options.explore) {
        menuRouted = menuCommand
          ? await options.explore.execute(menuCommand)
          : false;
        if (
          !menuRouted &&
          menuCommand &&
          (menuCommand.type === "show_all" ||
            menuCommand.type === "show_nearby")
        ) {
          const lastCategory = context.getContext().lastCategory;
          if (lastCategory) {
            const opened = await options.explore.execute({
              type: "open_category",
              category: lastCategory,
            });
            menuRouted = opened
              ? await options.explore.execute(menuCommand)
              : false;
          }
        }
      } else {
        legacyMenuRouting = true;
        try {
          menuRouted = routeAssistantMenuCommand(options.document, value);
        } finally {
          legacyMenuRouting = false;
        }
      }
    }

    if (destroyed || generation !== requestGeneration) {
      return supersededResponse();
    }

    if (menuRouted) {
      if (context.getContext().awaiting?.type === "confirmar_navegacao") {
        context.updateContext({ awaiting: null, pendingRoute: null });
      }
      syncExploreContext();
      currentPresentation = readVisiblePresentation(options.document);
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-menu-command-routed", {
          detail: { message: submittedValue, semanticValue: value, source },
        }),
      );
      const routedText =
        options.document
          .getElementById("assistant-category-results-message")
          ?.textContent?.trim() ?? "";
      context.addToHistory({ input: submittedValue, response: routedText });
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
    appendStandardMessage("user", submittedValue);
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
    const deterministicCommands = readDeterministicExploreCommands(response);
    let actionExecuted = false;
    if (deterministicCommands.length > 0 && options.explore) {
      actionExecuted = true;
      for (const command of deterministicCommands) {
        const executed = await options.explore.execute(command);
        if (destroyed || generation !== requestGeneration) {
          return supersededResponse();
        }
        if (!executed) {
          actionExecuted = false;
          break;
        }
      }
    } else if (runtimeAction) {
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
      syncExploreContext();
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-action-executed", {
          detail:
            deterministicCommands.length > 0
              ? { commands: deterministicCommands, source: "deterministic" }
              : {
                  action: runtimeAction,
                  source:
                    response.metadata?.fromLLM === true
                      ? "llm"
                      : "deterministic",
                },
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
    if (legacyMenuRouting || !(event instanceof CustomEvent)) return;
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
  const onExploreStateChanged = (): void => syncExploreContext();

  sendButton?.addEventListener("click", onSendClick);
  input?.addEventListener("keydown", onInputKeyDown);
  voiceButton?.setAttribute("aria-pressed", "false");
  voiceButton?.addEventListener("click", onVoiceClick);
  if (options.explore) {
    options.document.addEventListener(
      "morro:explore-state-changed",
      onExploreStateChanged,
    );
  } else {
    options.document.addEventListener(
      "morro:assistant-option-selected",
      scheduleExploreContextSync,
      true,
    );
    options.document.addEventListener(
      "click",
      scheduleExploreContextSync,
      true,
    );
    options.document.addEventListener("keydown", onExploreEscape, true);
  }
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
      if (options.explore) {
        options.document.removeEventListener(
          "morro:explore-state-changed",
          onExploreStateChanged,
        );
      } else {
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
      }
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
