import {
  createAssistantContextManager,
  createAssistantDialogController,
  createAssistantUserProfileManager,
  normalizeAssistantVoiceLanguage,
  type AssistantDialogResponse,
  type AssistantInterestCategory,
  type AssistantNavigationRuntimePhase,
} from "@touristic/assistant";

import type {
  ExploreLocationsCommand,
  ExploreLocationsControl,
} from "../map/explore-locations-control.js";
import type { NavigationSessionBootstrap } from "../navigation/navigation-session-bootstrap.js";
import { fetchMorroWeather } from "../weather/weather-widget.js";
import { createAssistantLlmHandler } from "./assistant-llm-adapter.js";
import { createAssistantV1IntelligenceHandlers } from "./assistant-v1-intelligence-adapter.js";
import { resolveAssistantV1PlaceAction } from "./assistant-v1-place-action-adapter.js";
import {
  executeAssistantV1ResidualCommand,
  invalidateAssistantV1MapCameraRestore,
  resolveAssistantV1ResidualCommand,
  type AssistantV1MapCommandMap,
} from "./assistant-v1-residual-command-adapter.js";
import { createAssistantBrowserDomainHandlers } from "./assistant-domain-adapter.js";
import { createAssistantMessageDom } from "./assistant-message-dom.js";
import {
  installAssistantContextualMessaging,
  normalizeAssistantContextualLanguage,
  resolveAssistantContextualCategoryLabel,
  resolveAssistantContextualCopy,
  resolveExploreContextualState,
} from "./assistant-contextual-state.js";
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
import { dispatchAssistantUiState } from "./assistant-ui-state.js";

interface AssistantRuntimeEnvironmentGlobal {
  readonly __MORRO_RUNTIME_ENV__?: {
    readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
    readonly VITE_MAPBOX_STYLE?: string;
  };
  readonly mapboxPrimaryInstance?: AssistantV1MapCommandMap;
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

function revealLatestAssistantContent(
  document: Document,
  target?: HTMLElement | null,
): void {
  const area = getMessagesArea(document);
  if (!area) return;

  const settle = (): void => {
    area.scrollTop = area.scrollHeight;
    target?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "nearest",
    });
  };

  settle();
  document.defaultView?.requestAnimationFrame(() => {
    settle();
    document.defaultView?.requestAnimationFrame(settle);
  });
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

function readPlaceOwnedActionValues(document: Document): readonly string[] {
  const sheet = document.getElementById("place-bottom-sheet");
  if (!(sheet instanceof HTMLElement) || !sheet.dataset.placeName) return [];
  return Object.freeze(
    Array.from(
      sheet.querySelectorAll<HTMLElement>(
        ".place-bottom-sheet-action[data-value], .place-bottom-sheet-primary-action[data-value]",
      ),
      (node) => node.dataset.value?.trim() ?? "",
    ).filter(Boolean),
  );
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
      type === "back_from_place" ||
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
    if (
      type === "show_search_results" &&
      "query" in raw &&
      typeof raw.query === "string" &&
      "results" in raw &&
      Array.isArray(raw.results)
    ) {
      const results = raw.results.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Record<string, unknown>;
        if (
          typeof item.name !== "string" ||
          typeof item.category !== "string" ||
          typeof item.latitude !== "number" ||
          !Number.isFinite(item.latitude) ||
          typeof item.longitude !== "number" ||
          !Number.isFinite(item.longitude) ||
          (item.source !== "local" && item.source !== "mapbox") ||
          (item.area !== undefined && typeof item.area !== "string") ||
          (item.description !== undefined &&
            typeof item.description !== "string")
        ) {
          return [];
        }
        return [
          Object.freeze({
            name: item.name,
            category: item.category,
            latitude: item.latitude,
            longitude: item.longitude,
            ...(typeof item.area === "string" ? { area: item.area } : {}),
            ...(typeof item.description === "string"
              ? { description: item.description }
              : {}),
            source: item.source,
          }),
        ];
      });
      if (results.length !== raw.results.length) return [];
      const status =
        "status" in raw &&
        (raw.status === "ready" ||
          raw.status === "empty" ||
          raw.status === "error")
          ? raw.status
          : results.length === 0
            ? "empty"
            : "ready";
      const statusText =
        "statusText" in raw && typeof raw.statusText === "string"
          ? raw.statusText
          : undefined;
      commands.push({
        type,
        query: raw.query,
        status,
        ...(statusText ? { statusText } : {}),
        results: Object.freeze(results),
      });
      continue;
    }
    return [];
  }
  return Object.freeze(commands);
}

function photoCarouselCopy(
  document: Document,
  place: string,
  index: number,
  total: number,
): { region: string; track: string; slide: string } {
  const language = document.documentElement.lang.toLowerCase();
  if (language.startsWith("en")) {
    return {
      region: `Photos of ${place}`,
      track: `Scrollable photo gallery of ${place}`,
      slide: `Photo ${index} of ${total}`,
    };
  }
  if (language.startsWith("es")) {
    return {
      region: `Fotos de ${place}`,
      track: `Galería desplazable de fotos de ${place}`,
      slide: `Foto ${index} de ${total}`,
    };
  }
  if (language.startsWith("he")) {
    return {
      region: `תמונות של ${place}`,
      track: `גלריית תמונות נגללת של ${place}`,
      slide: `תמונה ${index} מתוך ${total}`,
    };
  }
  return {
    region: `Fotos de ${place}`,
    track: `Galeria rolável de fotos de ${place}`,
    slide: `Foto ${index} de ${total}`,
  };
}

function appendPhotoCarousel(
  document: Document,
  presentation: AssistantPhotoPresentation,
): void {
  const messagesArea = getMessagesArea(document);
  if (!messagesArea) return;

  const total = presentation.images.length;
  const copy = photoCarouselCopy(document, presentation.place, 1, total);
  const container = document.createElement("section");
  container.className = "assistant-photo-carousel";
  container.dataset.messageType = "photo-carousel";
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", copy.region);

  const track = document.createElement("div");
  track.className = "assistant-photo-carousel-track";
  track.tabIndex = 0;
  track.dataset.activeIndex = "0";
  track.setAttribute("role", "list");
  track.setAttribute("aria-label", copy.track);

  const slides: HTMLElement[] = [];
  for (const [index, source] of presentation.images.entries()) {
    const figure = document.createElement("figure");
    figure.className = "assistant-photo-carousel-slide";
    figure.setAttribute("role", "listitem");
    figure.setAttribute(
      "aria-label",
      photoCarouselCopy(document, presentation.place, index + 1, total).slide,
    );

    const image = document.createElement("img");
    image.src = source;
    image.alt = `${presentation.place} — foto ${index + 1}`;
    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";
    image.fetchPriority = index === 0 ? "high" : "auto";
    image.sizes = "(max-width: 48rem) calc(100vw - 2rem), 46rem";
    figure.appendChild(image);
    slides.push(figure);
    track.appendChild(figure);
  }

  track.addEventListener("keydown", (event) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    event.preventDefault();
    const current = Number(track.dataset.activeIndex ?? "0");
    const rtl = document.documentElement.dir === "rtl";
    const direction =
      event.key === "ArrowRight" ? (rtl ? -1 : 1) : rtl ? 1 : -1;
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? slides.length - 1
          : Math.min(slides.length - 1, Math.max(0, current + direction));
    const slide = slides[target];
    if (!slide) return;

    track.dataset.activeIndex = String(target);
    const reducedMotion =
      document.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
        .matches === true;
    slide.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  });

  container.appendChild(track);
  messagesArea.appendChild(container);
  revealLatestAssistantContent(document, container);
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
  revealLatestAssistantContent(document, container);
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
      options.map(({ label, value, presentation, disabled }) =>
        Object.freeze({
          label,
          value,
          ...(presentation ? { presentation } : {}),
          ...(disabled === true ? { disabled: true } : {}),
        }),
      ),
    ),
  });
}

function readVisiblePresentation(
  document: Document,
): AssistantPresentationSnapshot | null {
  const contextualRail = document.querySelector<HTMLElement>(
    '#assistant-category-rail[data-rail-stage]:not([data-rail-stage="menu"])',
  );
  const contextualButtons = contextualRail
    ? Array.from(
        contextualRail.querySelectorAll<HTMLButtonElement>(
          '.assistant-option-btn[data-context-rail-option="true"]',
        ),
      )
    : [];

  const flow = document.getElementById("assistant-category-results");
  const flowButtons =
    flow &&
    !flow.classList.contains("hidden") &&
    flow.getAttribute("aria-hidden") !== "true"
      ? Array.from(
          flow.querySelectorAll<HTMLButtonElement>(".assistant-option-btn"),
        )
      : [];
  const dynamicContainers = Array.from(
    document.querySelectorAll<HTMLElement>(
      "#assistant-messages .assistant-options",
    ),
  ).filter(
    (container) =>
      container.getAttribute("aria-hidden") !== "true" &&
      !container.querySelector("[data-explore-category]"),
  );
  const dynamicButtons = Array.from(
    dynamicContainers
      .at(-1)
      ?.querySelectorAll<HTMLButtonElement>(".assistant-option-btn") ?? [],
  );
  const buttons =
    contextualButtons.length > 0
      ? contextualButtons
      : flowButtons.length > 0
        ? flowButtons
        : dynamicButtons;
  const visibleOptions = buttons.flatMap((button) => {
    const label = button.textContent?.trim();
    const value = button.dataset.value?.trim();
    return label && value
      ? [
          {
            label,
            value,
            ...(button.dataset.presentation === "primary"
              ? { presentation: "primary" as const }
              : {}),
            ...(button.disabled ? { disabled: true } : {}),
          },
        ]
      : [];
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
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return Object.freeze([]);
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
    const presentation: unknown =
      "presentation" in option ? option.presentation : undefined;
    const disabled: unknown =
      "disabled" in option ? option.disabled : undefined;
    if (
      typeof label !== "string" ||
      typeof optionValue !== "string" ||
      (presentation !== undefined && presentation !== "primary") ||
      (disabled !== undefined && typeof disabled !== "boolean")
    ) {
      return null;
    }
    result.push(
      Object.freeze({
        label,
        value: optionValue,
        ...(presentation === "primary"
          ? { presentation: "primary" as const }
          : {}),
        ...(disabled === true ? { disabled: true } : {}),
      }),
    );
  }
  return Object.freeze(result);
}

const COMMERCE_OPTION_ID = /^[A-Za-z0-9_-]{3,120}$/u;
const COMMERCE_PLACE_KEY = /^[a-z0-9][a-z0-9-]{2,119}$/u;

function commerceCheckoutUrl(value: string): string | null {
  if (value.startsWith("commerce:offer:")) {
    const id = value.slice("commerce:offer:".length);
    return COMMERCE_OPTION_ID.test(id)
      ? `/tickets.html?offer=${encodeURIComponent(id)}&source=map`
      : null;
  }

  if (value.startsWith("commerce:offers:")) {
    const rawIds = value.slice("commerce:offers:".length).split(",");
    const ids = rawIds.filter((id) => COMMERCE_OPTION_ID.test(id));
    if (ids.length === 0 || ids.length !== rawIds.length) return null;
    return `/tickets.html?offers=${ids.map(encodeURIComponent).join(",")}&source=map`;
  }

  if (value.startsWith("commerce:place:")) {
    const placeKey = value.slice("commerce:place:".length);
    return COMMERCE_PLACE_KEY.test(placeKey)
      ? `/tickets.html?place=${encodeURIComponent(placeKey)}&source=map`
      : null;
  }

  return null;
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
  context.updateContext({
    navigationState: {
      active: false,
      destination: null,
      phase: "idle",
    },
  });
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
  let navigationActive = false;
  const navigationPhases = new Set<AssistantNavigationRuntimePhase>([
    "idle",
    "initializing",
    "route_ready",
    "active",
    "recalculating",
    "ui_ready",
    "arrived",
    "failed",
    "ended",
  ]);
  const eventDetail = (event: Event): Record<string, unknown> | null => {
    const detail = "detail" in event ? event.detail : null;
    return detail && typeof detail === "object"
      ? (detail as Record<string, unknown>)
      : null;
  };
  const onNavigationStarted = (event: Event): void => {
    navigationActive = true;
    const detail = eventDetail(event);
    const destination =
      typeof detail?.destination === "string"
        ? detail.destination.trim().slice(0, 160) || null
        : null;
    context.updateContext({
      navigationState: {
        active: true,
        destination,
        phase: "active",
      },
    });
    const runtimeGlobal = globalThis as typeof globalThis &
      AssistantRuntimeEnvironmentGlobal;
    if (runtimeGlobal.mapboxPrimaryInstance) {
      invalidateAssistantV1MapCameraRestore(
        runtimeGlobal.mapboxPrimaryInstance,
      );
    }
  };
  const onNavigationStatusChanged = (event: Event): void => {
    const detail = eventDetail(event);
    const phase = detail?.phase;
    if (
      typeof phase !== "string" ||
      !navigationPhases.has(phase as AssistantNavigationRuntimePhase)
    ) {
      return;
    }
    const destination =
      typeof detail?.destination === "string"
        ? detail.destination.trim().slice(0, 160) || null
        : context.getContext().navigationState.destination;
    const active =
      detail?.isActive === true &&
      phase !== "ended" &&
      phase !== "failed" &&
      phase !== "idle";
    navigationActive = active;
    context.updateContext({
      navigationState: {
        active,
        destination,
        phase: phase as AssistantNavigationRuntimePhase,
      },
    });
  };
  const onNavigationEnded = (event: Event): void => {
    navigationActive = false;
    const detail = eventDetail(event);
    const destination =
      typeof detail?.destination === "string"
        ? detail.destination.trim().slice(0, 160) || null
        : context.getContext().navigationState.destination;
    const terminalPhase =
      detail?.reason === "arrived" ? ("arrived" as const) : ("ended" as const);
    context.updateContext({
      navigationState: {
        active: false,
        destination,
        phase: terminalPhase,
      },
    });
    if (detail?.reason === "arrived") {
      profile.recordSuccessfulNavigation();
    }
  };
  view?.addEventListener("navigationStarted", onNavigationStarted);
  view?.addEventListener("navigationStatusChanged", onNavigationStatusChanged);
  view?.addEventListener("navigationEnded", onNavigationEnded);

  const voice =
    view?.speechSynthesis && typeof view.SpeechSynthesisUtterance === "function"
      ? createAssistantBrowserVoice({
          synthesis: view.speechSynthesis,
          createUtterance: (text) => new view.SpeechSynthesisUtterance(text),
          initialLanguage: normalizeAssistantVoiceLanguage(
            options.document.documentElement.lang,
          ),
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

  const contextualMessaging = installAssistantContextualMessaging({
    document: options.document,
    messages,
    readExploreState,
    resolveNavigationDestination(candidate) {
      const normalized = candidate?.trim() ?? "";
      const coordinateDestination =
        /^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/u.test(normalized);
      if (normalized && !coordinateDestination) return normalized;
      const explorePlace = readExploreState().place?.trim();
      if (explorePlace) return explorePlace;
      return context.getContext().lastPlace?.trim() || null;
    },
  });

  const syncExploreContext = (placeHint?: string): void => {
    const state = readExploreState();
    context.updateContext({
      activeTour: state.stage === "tour" ? state.tour : null,
    });
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

  const processInputTurn = async (
    rawInput: string,
    optionOverride?: readonly AssistantDomOption[],
    preservePreviousOptions = false,
    source: AssistantInputSource = "programmatic",
    suppressOptionValues: readonly string[] = [],
  ): Promise<AssistantDialogResponse> => {
    const submittedValue = rawInput.trim();
    if (!submittedValue) return { text: "Como posso ajudar?" };
    syncExploreContext();
    const numericIndex = /^\d+$/u.test(submittedValue)
      ? Number(submittedValue) - 1
      : -1;
    const selectedNumericOption =
      numericIndex >= 0
        ? currentPresentation?.options[numericIndex]
        : undefined;
    const value = selectedNumericOption?.value.trim() || submittedValue;

    const generation = ++requestGeneration;

    const commerceUrl = commerceCheckoutUrl(value);
    if (commerceUrl) {
      clearAssistantDomOptions(options.document);
      removePhotoPresentation(options.document);
      currentPresentation = null;
      options.document.dispatchEvent(
        new CustomEvent("morro:commerce-cta-activated", {
          detail: Object.freeze({
            value,
            url: commerceUrl,
            source,
            place: readExploreState().place,
            category: readExploreState().category,
          }),
        }),
      );
      options.document.defaultView?.location.assign(commerceUrl);
      return {
        text: "",
        metadata: {
          domain: "commerce",
          state: "redirecting",
          deterministic: true,
          action: "open_ticketing_checkout",
        },
      };
    }

    const residualCommand = resolveAssistantV1ResidualCommand(value);
    if (residualCommand) {
      const residualContext = context.getContext();
      const runtimeGlobal = globalThis as typeof globalThis &
        AssistantRuntimeEnvironmentGlobal;
      const defaultMapStyle =
        runtimeGlobal.__MORRO_RUNTIME_ENV__?.VITE_MAPBOX_STYLE?.trim();
      const response = await executeAssistantV1ResidualCommand({
        command: residualCommand,
        language: presentationLanguage(),
        history: residualContext.history,
        ...(runtimeGlobal.mapboxPrimaryInstance
          ? { map: runtimeGlobal.mapboxPrimaryInstance }
          : {}),
        ...(options.explore ? { explore: options.explore } : {}),
        ...(defaultMapStyle ? { defaultMapStyle } : {}),
        navigationActive,
      });
      if (destroyed || generation !== requestGeneration) {
        return supersededResponse();
      }

      clearAssistantDomOptions(options.document);
      removePhotoPresentation(options.document);
      appendStandardMessage("user", submittedValue);
      appendStandardMessage("assistant", response.text);
      const responseOptions = readAssistantResponseOptions(response);
      if (responseOptions.length > 0) {
        const renderedOptions = renderAssistantDomOptions(
          options.document,
          responseOptions,
        );
        revealLatestAssistantContent(options.document, renderedOptions);
      }
      currentPresentation = snapshotPresentation(
        response.text,
        responseOptions,
      );
      context.updateContext({
        lastIntent:
          residualCommand.type === "history" ? "history" : "map_command",
        fallbackCount: 0,
      });
      context.addToHistory({ input: submittedValue, response: response.text });
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-residual-command-routed", {
          detail: {
            command: residualCommand.type,
            source,
            state: response.metadata?.state ?? null,
          },
        }),
      );
      voice?.speak(response.text, voiceLanguage());
      return response;
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
      const suppressedValues = new Set([
        ...suppressOptionValues.map((item) => item.trim()).filter(Boolean),
        ...readPlaceOwnedActionValues(options.document),
      ]);
      const responseOptions = readAssistantResponseOptions(response).filter(
        (option) => !suppressedValues.has(option.value),
      );
      if (responseOptions.length > 0) {
        const renderedOptions = renderAssistantDomOptions(
          options.document,
          responseOptions,
        );
        revealLatestAssistantContent(options.document, renderedOptions);
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
    const suppressedValues = new Set([
      ...suppressOptionValues.map((value) => value.trim()).filter(Boolean),
      ...readPlaceOwnedActionValues(options.document),
    ]);
    const rawResponseOptions =
      optionOverride ?? readAssistantResponseOptions(response);
    const responseOptions = rawResponseOptions.filter(
      (option) => !suppressedValues.has(option.value),
    );
    const photoPresentation = readPhotoPresentation(response);
    const photoResponse = isPhotoResponse(response);

    if (photoPresentation) {
      appendPhotoCarousel(options.document, photoPresentation);
    }

    if (photoResponse) {
      const previousOptions =
        preservePreviousOptions && previousPresentation
          ? previousPresentation.options.filter(
              (option) => !suppressedValues.has(option.value),
            )
          : [];
      const photoOptions =
        responseOptions.length > 0 ? responseOptions : previousOptions;
      if (photoOptions.length > 0) {
        renderPhotoActionOptions(options.document, photoOptions);
        currentPresentation = snapshotPresentation(response.text, photoOptions);
      } else {
        currentPresentation = snapshotPresentation(response.text, []);
      }
    } else {
      if (responseOptions.length > 0) {
        const renderedOptions = renderAssistantDomOptions(
          options.document,
          responseOptions,
        );
        revealLatestAssistantContent(options.document, renderedOptions);
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

  const processInput = async (
    rawInput: string,
    optionOverride?: readonly AssistantDomOption[],
    preservePreviousOptions = false,
    source: AssistantInputSource = "programmatic",
    suppressOptionValues: readonly string[] = [],
  ): Promise<AssistantDialogResponse> => {
    if (!rawInput.trim()) {
      return processInputTurn(
        rawInput,
        optionOverride,
        preservePreviousOptions,
        source,
        suppressOptionValues,
      );
    }

    dispatchAssistantUiState(options.document, "loading");
    try {
      const response = await processInputTurn(
        rawInput,
        optionOverride,
        preservePreviousOptions,
        source,
        suppressOptionValues,
      );
      dispatchAssistantUiState(
        options.document,
        response.metadata?.state === "superseded" ? "idle" : "success",
      );
      return response;
    } catch (error) {
      dispatchAssistantUiState(options.document, "error");
      throw error;
    }
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
      suppressOptionValues?: unknown;
    } | null;
    const value = typeof detail?.value === "string" ? detail.value : "";
    if (!value) return;
    const optionOverride = readOptionOverride(detail?.optionsOverride);
    const suppressOptionValues = Array.isArray(detail?.suppressOptionValues)
      ? detail.suppressOptionValues.filter(
          (candidate): candidate is string => typeof candidate === "string",
        )
      : [];
    void processInput(
      value,
      optionOverride ?? undefined,
      value.trim().toLowerCase() === "ver fotos" && optionOverride === null,
      "option",
      suppressOptionValues,
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

  const syncExploreContextualMessage = (placeHint?: string): void => {
    const state = readExploreState();
    const contextualState = resolveExploreContextualState(state);
    if (!contextualState) return;

    const canonicalMessage = options.document.getElementById(
      "assistant-category-results-message",
    );
    if (!(canonicalMessage instanceof HTMLElement)) return;

    const language = normalizeAssistantContextualLanguage(
      options.document.documentElement.lang,
    );
    const rendered = resolveAssistantContextualCopy(
      contextualState,
      {
        category: resolveAssistantContextualCategoryLabel(
          state.category,
          language,
        ),
        place: placeHint ?? state.place,
        count: state.markerCount,
      },
      language,
    );

    canonicalMessage.dataset.contextualState = contextualState;
    if (rendered.cta) canonicalMessage.dataset.contextualCta = rendered.cta;
    else delete canonicalMessage.dataset.contextualCta;
    canonicalMessage.dataset.contextualVoiceCopy = rendered.voiceCopy;

    const isPlainCategoryFlow =
      canonicalMessage.dataset.messageType === "category-flow" &&
      canonicalMessage.dataset.preserveContent !== "true";
    if (isPlainCategoryFlow) {
      canonicalMessage.textContent = rendered.message;
      return;
    }

    // Rich Explore presenters remain the single visual authority. Contextual
    // copy is projected as a bounded submessage inside the existing presenter
    // instead of creating a competing assistant message node.
    let contextualCopy = canonicalMessage.querySelector<HTMLElement>(
      ":scope > .md-assistant-contextual-copy",
    );
    if (!contextualCopy) {
      contextualCopy = options.document.createElement("span");
      contextualCopy.className = "md-assistant-contextual-copy";
      canonicalMessage.appendChild(contextualCopy);
    }
    contextualCopy.textContent = rendered.message;
  };

  const syncExplorePresentation = (placeHint?: string): void => {
    syncExploreContext(placeHint);
    syncExploreContextualMessage(placeHint);
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
    queueMicrotask(() => syncExplorePresentation(placeHint));
  };

  const onExploreEscape = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    queueMicrotask(() => syncExploreContext());
  };
  const onExploreStateChanged = (): void => syncExplorePresentation();

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
  syncExploreContext();

  return Object.freeze({
    process,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      requestGeneration += 1;
      view?.removeEventListener("navigationStarted", onNavigationStarted);
      view?.removeEventListener(
        "navigationStatusChanged",
        onNavigationStatusChanged,
      );
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
      contextualMessaging.destroy();
      voiceSettings.destroy();
      voiceInput?.destroy();
      voice?.destroy();
      context.flush();
    },
  });
}
