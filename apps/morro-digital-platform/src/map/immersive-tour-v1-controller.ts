import {
  localizeMorroTour,
  type LocalizedTourRouteContract,
  type LocalizedTourStopContract,
  type TourLocale,
} from "../config/tour-localization.js";
import {
  idleV1ImmersiveTourState,
  startV1ImmersiveTourState,
  transitionV1ImmersiveTourState,
  type V1ImmersiveTourState,
} from "./immersive-tour-v1-flow.js";
import { getV1ImmersiveTourCopy } from "./immersive-tour-v1-i18n.js";

const TOUR_START = "__tour_start__";
const TOUR_LIST = "__tour_list__";
const TOUR_CANCEL = "__tour_cancel__";
const TOUR_PREVIOUS = "__tour_prev__";
const TOUR_NEXT = "__tour_next__";
const TOUR_FINISH = "__tour_finish__";
const TOUR_EXIT = "__tour_exit__";
const TOUR_SEE_TOURS = "__tour_see_tours__";
const TOUR_EXPLORE_MAP = "__tour_explore_map__";
const TOUR_MAIN_MENU = "__tour_main_menu__";
const TOUR_STOP_PREFIX = "__tour_stop_";
const NARRATION_DELAY_MS = 600;
const FINALE_MAP_CLEAR_MS = 3000;

export interface V1ImmersiveTourRenderOption {
  readonly label: string;
  readonly value: string;
}

export interface V1ImmersiveTourRenderRequest {
  readonly accessibleLabel: string;
  readonly content: HTMLElement;
  readonly options: readonly V1ImmersiveTourRenderOption[];
  onSelect(value: string): void;
}

export interface V1ImmersiveTourControllerOptions {
  readonly document: Document;
  render(request: V1ImmersiveTourRenderRequest): void;
  activateMap(tourId: string): void | Promise<void>;
  deactivateMap(): void | Promise<void>;
  focusStop(stop: LocalizedTourStopContract, index: number): void;
  highlightStop(index: number): void;
  onShowTours(): void;
  onExploreMap(): void;
  onMainMenu(): void;
  onStateChange?(state: V1ImmersiveTourState): void;
}

export interface V1ImmersiveTourController {
  start(tourId: string): Promise<boolean>;
  stop(showMessage?: boolean): Promise<void>;
  goToStop(index: number): void;
  goToStopById(tourId: string, stopId: string): boolean;
  refreshLocale(): void;
  getState(): V1ImmersiveTourState;
  destroy(): void;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function tourLocaleToSpeechLanguage(locale: TourLocale): string {
  return {
    "pt-BR": "pt-BR",
    en: "en-US",
    es: "es-ES",
    he: "he-IL",
  }[locale];
}

function finalOptions(locale?: string | null): readonly V1ImmersiveTourRenderOption[] {
  const copy = getV1ImmersiveTourCopy(locale);
  return Object.freeze([
    Object.freeze({ label: copy.seeTours, value: TOUR_SEE_TOURS }),
    Object.freeze({ label: copy.exploreMap, value: TOUR_EXPLORE_MAP }),
    Object.freeze({ label: copy.mainMenu, value: TOUR_MAIN_MENU }),
  ]);
}

export function createV1ImmersiveTourController(
  options: V1ImmersiveTourControllerOptions,
): V1ImmersiveTourController {
  const { document } = options;
  let state = idleV1ImmersiveTourState;
  let narrationTimer: number | undefined;
  let finaleClearTimer: number | undefined;
  let narrationActive = false;
  let currentUtterance: SpeechSynthesisUtterance | undefined;
  let narrationButton: HTMLButtonElement | undefined;

  const locale = (): string => document.documentElement.lang || "pt-BR";

  const currentTour = (): LocalizedTourRouteContract | undefined =>
    state.tourId ? localizeMorroTour(state.tourId, locale()) : undefined;

  const setState = (next: V1ImmersiveTourState): void => {
    state = next;
    options.onStateChange?.(state);
  };

  const clearNarrationTimer = (): void => {
    if (narrationTimer === undefined) return;
    document.defaultView?.clearTimeout(narrationTimer);
    narrationTimer = undefined;
  };

  const clearFinaleTimer = (): void => {
    if (finaleClearTimer === undefined) return;
    document.defaultView?.clearTimeout(finaleClearTimer);
    finaleClearTimer = undefined;
  };

  const updateNarrationButton = (): void => {
    if (!narrationButton) return;
    const copy = getV1ImmersiveTourCopy(locale());
    narrationButton.textContent = narrationActive
      ? copy.stopNarration
      : copy.narration;
    narrationButton.title = narrationButton.textContent;
    narrationButton.setAttribute("aria-pressed", String(narrationActive));
  };

  const stopNarration = (): void => {
    clearNarrationTimer();
    try {
      document.defaultView?.speechSynthesis?.cancel();
    } catch {
      // Speech synthesis is best-effort and must never block the tour flow.
    }
    narrationActive = false;
    currentUtterance = undefined;
    updateNarrationButton();
  };

  const voiceEnabled = (): boolean => {
    try {
      return document.defaultView?.localStorage.getItem("voice-enabled") !== "false";
    } catch {
      return true;
    }
  };

  const narrate = (
    text: string,
    tourLocale: TourLocale,
    button?: HTMLButtonElement,
  ): void => {
    if (!text || !voiceEnabled()) return;
    const synth = document.defaultView?.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;

    stopNarration();
    narrationButton = button ?? narrationButton;

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const speechLanguage = tourLocaleToSpeechLanguage(tourLocale);
      const prefix = speechLanguage.split("-")[0]?.toLowerCase() ?? "pt";
      utterance.lang = speechLanguage;
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = synth.getVoices();
      const matchingVoices = voices.filter((voice) =>
        voice.lang.toLowerCase().startsWith(prefix),
      );
      utterance.voice =
        matchingVoices.find((voice) =>
          /female|feminina/iu.test(voice.name),
        ) ??
        matchingVoices[0] ??
        null;

      currentUtterance = utterance;
      narrationActive = true;
      updateNarrationButton();

      const finish = (): void => {
        if (currentUtterance !== utterance) return;
        currentUtterance = undefined;
        narrationActive = false;
        updateNarrationButton();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
    } catch {
      narrationActive = false;
      currentUtterance = undefined;
      updateNarrationButton();
    }
  };

  const renderRequest = (
    accessibleLabel: string,
    content: HTMLElement,
    renderOptions: readonly V1ImmersiveTourRenderOption[],
    onSelect: (value: string) => void,
  ): void => {
    options.render({
      accessibleLabel,
      content,
      options: renderOptions,
      onSelect,
    });
  };

  const renderNotFound = (): void => {
    const copy = getV1ImmersiveTourCopy(locale());
    const card = createElement(document, "div", "tour-stop-list-card");
    card.appendChild(createElement(document, "strong", "", copy.notFound));
    renderRequest(copy.notFound, card, Object.freeze([]), () => undefined);
  };

  const renderIntro = (): void => {
    const tour = currentTour();
    if (!tour) {
      renderNotFound();
      return;
    }
    stopNarration();
    const copy = getV1ImmersiveTourCopy(tour.locale);
    const card = createElement(document, "div", "tour-intro-card");

    const header = createElement(document, "div", "tour-intro-header");
    header.appendChild(createElement(document, "span", "tour-intro-icon", "🗺️"));

    const headerText = document.createElement("div");
    headerText.appendChild(
      createElement(document, "strong", "tour-intro-title", tour.title),
    );
    headerText.appendChild(
      createElement(
        document,
        "span",
        "tour-intro-meta",
        `⏱️ ${tour.duration} | 🚌 ${tour.transport}`,
      ),
    );
    header.appendChild(headerText);
    card.appendChild(header);

    card.appendChild(
      createElement(document, "p", "tour-intro-desc", tour.description),
    );

    const preview = createElement(document, "div", "tour-stops-preview");
    preview.appendChild(
      createElement(
        document,
        "strong",
        "",
        copy.stopsLabel(tour.stops.length),
      ),
    );
    const stopList = createElement(document, "div", "tour-stops-list");
    tour.stops.forEach((stop, index) => {
      stopList.appendChild(
        createElement(
          document,
          "span",
          "tour-stop-badge",
          `${index + 1}. ${stop.title}`,
        ),
      );
    });
    preview.appendChild(stopList);
    card.appendChild(preview);

    renderRequest(
      tour.title,
      card,
      Object.freeze([
        Object.freeze({ label: copy.start, value: TOUR_START }),
        Object.freeze({ label: copy.seeStops, value: TOUR_LIST }),
        Object.freeze({ label: copy.cancel, value: TOUR_CANCEL }),
      ]),
      (value) => {
        void handleSelection(value);
      },
    );
  };

  const renderStopList = (): void => {
    const tour = currentTour();
    if (!tour) {
      renderNotFound();
      return;
    }
    stopNarration();
    const copy = getV1ImmersiveTourCopy(tour.locale);
    const card = createElement(document, "div", "tour-stop-list-card");
    card.appendChild(
      createElement(document, "strong", "", copy.stopsOf(tour.title)),
    );

    const stopOptions = tour.stops.map((stop, index) =>
      Object.freeze({
        label: `${index + 1}. ${stop.title}`,
        value: `${TOUR_STOP_PREFIX}${index}__`,
      }),
    );

    renderRequest(
      copy.stopsOf(tour.title),
      card,
      Object.freeze([
        ...stopOptions,
        Object.freeze({ label: copy.exit, value: TOUR_EXIT }),
      ]),
      (value) => {
        void handleSelection(value);
      },
    );
  };

  const scheduleNarration = (
    tour: LocalizedTourRouteContract,
    stop: LocalizedTourStopContract,
    index: number,
    button: HTMLButtonElement,
  ): void => {
    clearNarrationTimer();
    const win = document.defaultView;
    if (!win || !stop.narration) return;

    narrationTimer = win.setTimeout(() => {
      narrationTimer = undefined;
      if (
        state.stage !== "stop" ||
        state.tourId !== tour.id ||
        state.currentStopIndex !== index
      ) {
        return;
      }
      narrate(stop.narration, tour.locale, button);
    }, NARRATION_DELAY_MS);
  };

  const renderStop = (autoNarrate = true): void => {
    const tour = currentTour();
    if (!tour || state.stage !== "stop") {
      renderNotFound();
      return;
    }
    const stop = tour.stops[state.currentStopIndex];
    if (!stop) {
      renderNotFound();
      return;
    }

    stopNarration();
    options.highlightStop(state.currentStopIndex);
    options.focusStop(stop, state.currentStopIndex);

    const copy = getV1ImmersiveTourCopy(tour.locale);
    const current = state.currentStopIndex + 1;
    const progress = Math.round((current / tour.stops.length) * 100);
    const card = createElement(document, "div", "tour-stop-card");

    const progressBar = createElement(
      document,
      "div",
      "tour-stop-progress-bar",
    );
    const progressFill = createElement(
      document,
      "div",
      "tour-stop-progress-fill",
    );
    progressFill.style.width = `${progress}%`;
    progressBar.appendChild(progressFill);
    progressBar.appendChild(
      createElement(
        document,
        "span",
        "tour-stop-progress-text",
        copy.stopLabel(current, tour.stops.length),
      ),
    );
    card.appendChild(progressBar);

    if (stop.photoPath) {
      const photoWrap = createElement(
        document,
        "div",
        "tour-stop-photo-wrap",
      );
      const image = createElement(document, "img", "tour-stop-photo");
      image.src = stop.photoPath;
      image.alt = stop.photoAlt || stop.title;
      image.loading = "lazy";
      image.addEventListener(
        "error",
        () => {
          photoWrap.style.display = "none";
        },
        { once: true },
      );
      photoWrap.appendChild(image);
      photoWrap.appendChild(
        createElement(
          document,
          "div",
          "tour-stop-photo-caption",
          stop.title,
        ),
      );

      narrationButton = createElement(
        document,
        "button",
        "tour-narration-btn",
        copy.narration,
      );
      narrationButton.type = "button";
      narrationButton.title = copy.narration;
      narrationButton.setAttribute("aria-pressed", "false");
      narrationButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (narrationActive) {
          stopNarration();
        } else {
          narrate(stop.narration, tour.locale, narrationButton);
        }
      });
      photoWrap.appendChild(narrationButton);
      card.appendChild(photoWrap);
    } else {
      narrationButton = undefined;
    }

    const header = createElement(document, "div", "tour-stop-header");
    header.appendChild(
      createElement(
        document,
        "span",
        "tour-stop-num-badge",
        String(current),
      ),
    );
    header.appendChild(
      createElement(document, "strong", "tour-stop-title", stop.title),
    );
    card.appendChild(header);
    card.appendChild(
      createElement(document, "p", "tour-stop-desc", stop.description),
    );

    if (stop.tips.length > 0) {
      const tips = createElement(document, "div", "tour-tips");
      tips.appendChild(
        createElement(document, "strong", "", copy.tipsLabel),
      );
      const list = document.createElement("ul");
      stop.tips.forEach((tip) => {
        list.appendChild(createElement(document, "li", "", tip));
      });
      tips.appendChild(list);
      card.appendChild(tips);
    }

    const navigation: V1ImmersiveTourRenderOption[] = [];
    if (state.currentStopIndex > 0) {
      navigation.push({ label: copy.previous, value: TOUR_PREVIOUS });
    }
    if (state.currentStopIndex < tour.stops.length - 1) {
      navigation.push({ label: copy.next, value: TOUR_NEXT });
    } else {
      navigation.push({ label: copy.finish, value: TOUR_FINISH });
    }
    navigation.push({ label: copy.seeStops, value: TOUR_LIST });
    navigation.push({ label: copy.exit, value: TOUR_EXIT });

    renderRequest(
      `${copy.stopLabel(current, tour.stops.length)} — ${stop.title}`,
      card,
      Object.freeze(navigation.map((option) => Object.freeze(option))),
      (value) => {
        void handleSelection(value);
      },
    );

    if (autoNarrate && narrationButton) {
      scheduleNarration(
        tour,
        stop,
        state.currentStopIndex,
        narrationButton,
      );
    }
  };

  const renderFinale = (scheduleMapClear = true): void => {
    const tour = currentTour();
    if (!tour) {
      renderNotFound();
      return;
    }
    stopNarration();
    const copy = getV1ImmersiveTourCopy(tour.locale);
    const card = createElement(document, "div", "tour-finale-card");
    card.appendChild(
      createElement(document, "div", "tour-finale-icon", "🎉"),
    );
    card.appendChild(
      createElement(
        document,
        "strong",
        "tour-finale-title",
        copy.completedTitle,
      ),
    );
    card.appendChild(
      createElement(
        document,
        "p",
        "tour-finale-desc",
        copy.completedDescription(tour.stops.length, tour.title),
      ),
    );
    card.appendChild(
      createElement(
        document,
        "p",
        "tour-finale-cta",
        copy.completedCta,
      ),
    );

    renderRequest(
      copy.completedTitle,
      card,
      finalOptions(tour.locale),
      (value) => {
        void handleSelection(value);
      },
    );

    if (!scheduleMapClear) return;
    clearFinaleTimer();
    const win = document.defaultView;
    if (!win) return;
    finaleClearTimer = win.setTimeout(() => {
      finaleClearTimer = undefined;
      void Promise.resolve(options.deactivateMap()).catch(() => undefined);
    }, FINALE_MAP_CLEAR_MS);
  };

  const renderEnded = (tourTitle: string): void => {
    const copy = getV1ImmersiveTourCopy(locale());
    const message = copy.endedMessage(tourTitle);
    const card = createElement(document, "div", "tour-stop-list-card");
    card.appendChild(createElement(document, "strong", "", message));
    renderRequest(message, card, finalOptions(locale()), (value) => {
      void handleSelection(value);
    });
  };

  const stop = async (showMessage = true): Promise<void> => {
    if (state.stage === "idle") return;
    const tourTitle = currentTour()?.title ?? "passeio";
    stopNarration();
    clearFinaleTimer();
    setState(transitionV1ImmersiveTourState(state, { type: "stop" }));
    await Promise.resolve(options.deactivateMap()).catch(() => undefined);
    if (showMessage) renderEnded(tourTitle);
  };

  const goToStop = (index: number): void => {
    const next = transitionV1ImmersiveTourState(state, {
      type: "go_to_stop",
      index,
    });
    if (next === state || next.stage !== "stop") return;
    setState(next);
    renderStop();
  };

  const showFinale = (): void => {
    const next = transitionV1ImmersiveTourState(state, { type: "finish" });
    if (next.stage !== "finale") return;
    setState(next);
    renderFinale();
  };

  const handleSelection = async (value: string): Promise<void> => {
    if (value === TOUR_START) {
      setState(
        transitionV1ImmersiveTourState(state, {
          type: "show_first_stop",
        }),
      );
      renderStop();
      return;
    }

    if (value === TOUR_LIST) {
      setState(
        transitionV1ImmersiveTourState(state, { type: "show_list" }),
      );
      renderStopList();
      return;
    }

    if (value === TOUR_PREVIOUS) {
      const next = transitionV1ImmersiveTourState(state, {
        type: "previous",
      });
      if (next !== state) {
        setState(next);
        renderStop();
      }
      return;
    }

    if (value === TOUR_NEXT) {
      const next = transitionV1ImmersiveTourState(state, { type: "next" });
      setState(next);
      if (next.stage === "finale") {
        renderFinale();
      } else {
        renderStop();
      }
      return;
    }

    if (value === TOUR_FINISH) {
      showFinale();
      return;
    }

    if (value === TOUR_CANCEL || value === TOUR_EXIT) {
      await stop(true);
      return;
    }

    if (value.startsWith(TOUR_STOP_PREFIX) && value.endsWith("__")) {
      const rawIndex = value.slice(TOUR_STOP_PREFIX.length, -2);
      const index = Number.parseInt(rawIndex, 10);
      if (Number.isInteger(index)) goToStop(index);
      return;
    }

    if (
      value === TOUR_SEE_TOURS ||
      value === TOUR_EXPLORE_MAP ||
      value === TOUR_MAIN_MENU
    ) {
      await stop(false);
      if (value === TOUR_SEE_TOURS) options.onShowTours();
      if (value === TOUR_EXPLORE_MAP) options.onExploreMap();
      if (value === TOUR_MAIN_MENU) options.onMainMenu();
    }
  };

  return Object.freeze({
    async start(tourId: string): Promise<boolean> {
      const tour = localizeMorroTour(tourId, locale());
      if (!tour) {
        renderNotFound();
        return false;
      }

      if (state.stage !== "idle") await stop(false);
      clearFinaleTimer();
      setState(startV1ImmersiveTourState(tour.id, tour.stops.length));
      await Promise.resolve(options.activateMap(tour.id));
      renderIntro();
      return true;
    },

    stop,

    goToStop,

    goToStopById(tourId: string, stopId: string): boolean {
      if (state.stage === "idle" || state.tourId !== tourId) return false;
      const tour = currentTour();
      const index = tour?.stops.findIndex((stop) => stop.id === stopId) ?? -1;
      if (index < 0) return false;
      goToStop(index);
      return true;
    },

    refreshLocale(): void {
      if (state.stage === "idle") return;
      if (state.stage === "intro") renderIntro();
      if (state.stage === "list") renderStopList();
      if (state.stage === "stop") renderStop(false);
      if (state.stage === "finale") renderFinale(false);
    },

    getState(): V1ImmersiveTourState {
      return state;
    },

    destroy(): void {
      stopNarration();
      clearFinaleTimer();
      setState(idleV1ImmersiveTourState);
    },
  });
}
