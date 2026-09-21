export type MorroUxMode =
  | "discover"
  | "search"
  | "place"
  | "navigation"
  | "tour"
  | "commerce"
  | "assistant";

export interface MorroUxModeSignals {
  readonly navigationActive: boolean;
  readonly immersiveTourActive: boolean;
  readonly placeActive: boolean;
  readonly searchActive: boolean;
  readonly commerceActive: boolean;
  readonly assistantActive: boolean;
}

export interface PremiumUxModePresenter {
  readonly mode: MorroUxMode;
  destroy(): void;
}

export function resolveMorroUxMode(signals: MorroUxModeSignals): MorroUxMode {
  if (signals.navigationActive) return "navigation";
  if (signals.immersiveTourActive) return "tour";
  if (signals.placeActive) return "place";
  if (signals.searchActive) return "search";
  if (signals.commerceActive) return "commerce";
  if (signals.assistantActive) return "assistant";
  return "discover";
}

const IMMERSIVE_TOUR_FLOW_STAGES = new Set(["intro", "list", "stop", "finale"]);

function hasActiveImmersiveTour(map: HTMLElement | null): boolean {
  if (!map) return false;

  const flowTourId = map.dataset.tourFlowId?.trim() ?? "";
  const flowStage = map.dataset.tourFlowStage?.trim() ?? "";

  return Boolean(flowTourId && IMMERSIVE_TOUR_FLOW_STAGES.has(flowStage));
}

function readSignals(document: Document): MorroUxModeSignals {
  const body = document.body;
  const map = document.getElementById("map");

  return Object.freeze({
    navigationActive: body.classList.contains("navigation-active"),
    immersiveTourActive: hasActiveImmersiveTour(map),
    placeActive: map?.dataset.exploreStage === "detail",
    searchActive:
      map?.dataset.exploreStage === "filters" ||
      map?.dataset.exploreStage === "places",
    commerceActive:
      body.classList.contains("commerce-detail-shell") ||
      Boolean(document.querySelector(".ticketing-shell")),
    assistantActive: body.classList.contains("assistant-modal-open"),
  });
}

/**
 * Publishes a presentation-only mode on <body>.
 *
 * The presenter deliberately derives state from existing runtime contracts.
 * It never drives Navigation, Tours, Explore, Commerce or Assistant state.
 * In particular, body.tour-active belongs to the public onboarding tutorial
 * and MUST NOT be interpreted as the immersive TOUR product mode.
 */
export function installPremiumUxModePresenter(input: {
  readonly document: Document;
}): PremiumUxModePresenter {
  const { document } = input;
  const body = document.body;
  const map = document.getElementById("map");
  let currentMode: MorroUxMode = "discover";

  const sync = (): void => {
    currentMode = resolveMorroUxMode(readSignals(document));
    body.dataset.mdMode = currentMode;
  };

  const MutationObserverConstructor = document.defaultView?.MutationObserver;
  if (!MutationObserverConstructor) {
    sync();
    return Object.freeze({
      get mode() {
        return currentMode;
      },
      destroy() {},
    });
  }

  const observer = new MutationObserverConstructor(sync);
  observer.observe(body, {
    attributes: true,
    attributeFilter: ["class"],
  });

  if (map) {
    observer.observe(map, {
      attributes: true,
      attributeFilter: [
        "data-tour-flow-stage",
        "data-tour-flow-id",
        "data-explore-stage",
      ],
    });
  }

  sync();

  return Object.freeze({
    get mode() {
      return currentMode;
    },
    destroy() {
      observer.disconnect();
    },
  });
}
