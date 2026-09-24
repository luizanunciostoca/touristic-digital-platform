import type {
  NavigationGuidanceSnapshot,
  NavigationRuntimeSnapshot,
} from "@touristic/navigation";

export const NAVIGATION_RECENTER_REQUEST_EVENT =
  "morro:navigation-recenter-requested";

export type NavigationStatusTone = "info" | "warning" | "danger";

export interface NavigationGuidanceUi {
  start(): void;
  update(snapshot: NavigationRuntimeSnapshot): void;
  approaching?(message: string): void;
  arrived?(message: string): void;
  status?(message: string | null, tone?: NavigationStatusTone): void;
  stop(): void;
  destroy(): void;
}

const V1_DETAIL_CONNECTORS = Object.freeze({
  pt: Object.freeze({ on: "na", for: "por" }),
  en: Object.freeze({ on: "on", for: "for" }),
  es: Object.freeze({ on: "en", for: "por" }),
  he: Object.freeze({ on: "על", for: "עבור" }),
});

function formatDistance(meters: number): string {
  const value = Math.max(0, Number.isFinite(meters) ? meters : 0);
  if (value >= 1000)
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} km`;
  return `${Math.round(value)} m`;
}

function formatDuration(seconds: number): string {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (value < 60) return "< 1 min";
  const minutes = Math.max(1, Math.round(value / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} h ${remainder} min` : `${hours} h`;
}

function includesAny(text: string, values: readonly string[]): boolean {
  return values.some((value) => text.includes(value));
}

function directionFor(instruction: string): {
  readonly arrow: string;
  readonly className: string;
} {
  const text = instruction.toLowerCase();
  if (
    includesAny(text, ["arriv", "destination", "destino", "lleg", "הגע", "יעד"])
  ) {
    return { arrow: "●", className: "arrive" };
  }
  if (
    includesAny(text, [
      "u-turn",
      "uturn",
      "retorno",
      "media vuelta",
      "vuelta en u",
      "פרסה",
    ])
  ) {
    return { arrow: "↶", className: "turn-uturn" };
  }
  if (includesAny(text, ["left", "esquerda", "izquierda", "שמאלה", "שמאל"])) {
    return { arrow: "↰", className: "turn-left" };
  }
  if (includesAny(text, ["right", "direita", "derecha", "ימינה", "ימין"])) {
    return { arrow: "↱", className: "turn-right" };
  }
  return { arrow: "↑", className: "continue-straight" };
}

function v1ArrivalInstruction(guidance: NavigationGuidanceSnapshot): boolean {
  const type = guidance.maneuverType;
  if (type === 10 || type === 11 || type === 12) return true;
  if (typeof type === "string") {
    const normalized = type.toLowerCase();
    if (normalized.includes("arrive") || normalized.includes("destination")) {
      return true;
    }
  }
  const original = guidance.original.toLowerCase();
  return original.includes("arrive") || original.includes("destination");
}

function v1StreetName(guidance: NavigationGuidanceSnapshot): string | null {
  const explicit = guidance.streetName?.trim();
  if (explicit && explicit !== "-") return explicit;

  const original = guidance.original;
  const lower = original.toLowerCase();
  if (lower.includes(" on ")) {
    const extracted = original.split(" on ")[1]?.trim();
    if (extracted) return extracted;
  } else if (lower.includes(" onto ")) {
    const extracted = original.split(" onto ")[1]?.trim();
    if (extracted) return extracted;
  }
  return null;
}

/**
 * Reproduces canonical V1 `bannerUI.buildDetailsText`: localized semantic
 * action + localized connector + street (when available) + maneuver distance.
 */
function v1DetailsText(guidance: NavigationGuidanceSnapshot): string {
  const action =
    guidance.instruction || guidance.original || "Continue pela rota";
  if (v1ArrivalInstruction(guidance)) return action;

  const language = guidance.language ?? "pt";
  const connectors = V1_DETAIL_CONNECTORS[language] ?? V1_DETAIL_CONNECTORS.pt;
  const street = v1StreetName(guidance);
  return street
    ? `${action} ${connectors.on} ${street} ${connectors.for} ${guidance.formattedDistance}`
    : `${action} ${connectors.for} ${guidance.formattedDistance}`;
}

function v2SecondaryContext(guidance: NavigationGuidanceSnapshot): string {
  const street = v1StreetName(guidance);
  if (!street) return v1DetailsText(guidance);

  switch (guidance.language ?? "pt") {
    case "en":
      return `Toward ${street}`;
    case "es":
      return `En dirección a ${street}`;
    case "he":
      return `לכיוון ${street}`;
    default:
      return `Em direção a ${street}`;
  }
}

function ensureNavigationSupportUi(document: Document): {
  readonly status: HTMLElement | null;
  readonly recenter: HTMLButtonElement | null;
  readonly travelMode: HTMLElement | null;
} {
  const summary = document.getElementById("navigation-summary");
  const distance = document.getElementById("instruction-distance");

  let handle = document.getElementById("navigation-summary-handle");
  if (!handle && summary) {
    handle = document.createElement("span");
    handle.id = "navigation-summary-handle";
    handle.setAttribute("aria-hidden", "true");
    summary.prepend(handle);
  }

  let travelMode = document.getElementById("navigation-travel-mode");
  if (!travelMode && distance?.parentElement) {
    travelMode = document.createElement("span");
    travelMode.id = "navigation-travel-mode";
    travelMode.className = "navigation-travel-mode";
    travelMode.textContent = "Caminhada";
    distance.parentElement.appendChild(travelMode);
  }

  let status = document.getElementById("navigation-status");
  if (!status && summary?.parentElement) {
    status = document.createElement("p");
    status.id = "navigation-status";
    status.className = "navigation-status hidden";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    summary.parentElement.insertBefore(status, summary);
  }

  const recenter = document.getElementById(
    "recenter-map-control",
  ) as HTMLButtonElement | null;

  return {
    status,
    recenter,
    travelMode,
  };
}

export function createNavigationGuidanceUi(
  document: Document,
): NavigationGuidanceUi {
  const banner = document.getElementById("instruction-banner");
  const endButton = document.getElementById("end-navigation-btn");
  const minimizeButton = document.getElementById("minimize-navigation-btn");
  const main = document.getElementById("instruction-main");
  const details = document.getElementById("instruction-details");
  const arrow = document.getElementById("instruction-arrow");
  const stepDistance = document.getElementById("instruction-step-distance");
  const distance = document.getElementById("instruction-distance");
  const time = document.getElementById("instruction-time");
  const progress = document.getElementById("route-progress");
  const progressText = document.getElementById("progress-text");
  const supportUi = ensureNavigationSupportUi(document);
  const originalEndText = endButton?.textContent ?? "Encerrar Navegação";
  const originalEndAria = endButton?.getAttribute("aria-label");
  const unifiedDock = document.getElementById("unified-assistant-dock");
  const categoryRail = document.getElementById("assistant-category-rail");
  const voiceButton = document.getElementById(
    "voiceButton",
  ) as HTMLButtonElement | null;
  const originalVoiceMarkup = voiceButton?.innerHTML ?? "";
  const originalVoiceAria = voiceButton?.getAttribute("aria-label");
  const originalVoiceI18nAria = voiceButton?.getAttribute("data-i18n-aria");
  let navigationDockSummary: HTMLElement | null = null;
  let active = false;
  let destroyed = false;

  const navigationStopLabel = (): string => {
    const language = document.documentElement.lang.toLowerCase();
    if (language.startsWith("en")) return "End navigation";
    if (language.startsWith("es")) return "Finalizar navegación";
    if (language.startsWith("he")) return "סיום ניווט";
    return "Encerrar navegação";
  };

  const navigationTravelModeLabel = (): string => {
    const language = document.documentElement.lang.toLowerCase();
    if (language.startsWith("en")) return "Walking";
    if (language.startsWith("es")) return "Caminando";
    if (language.startsWith("he")) return "הליכה";
    return "Caminhada";
  };

  const ensureNavigationDockSummary = (): HTMLElement | null => {
    if (!categoryRail) return null;
    if (navigationDockSummary?.isConnected) return navigationDockSummary;

    const existing = categoryRail.querySelector<HTMLElement>(
      "[data-navigation-dock-summary]",
    );
    if (existing) {
      navigationDockSummary = existing;
      return existing;
    }

    const summary = document.createElement("div");
    summary.className = "md-navigation-dock-summary";
    summary.dataset.navigationDockSummary = "true";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    summary.setAttribute("aria-atomic", "true");
    summary.innerHTML =
      '<strong class="md-navigation-dock-time" data-navigation-dock-time>0 min</strong>' +
      '<span class="md-navigation-dock-meta">' +
      "<span data-navigation-dock-distance>0 m</span>" +
      '<span aria-hidden="true">·</span>' +
      "<span data-navigation-dock-mode></span>" +
      "</span>";
    categoryRail.appendChild(summary);
    navigationDockSummary = summary;
    return summary;
  };

  const updateNavigationDockSummary = (
    remainingDuration: number,
    remainingDistance: number,
  ): void => {
    const summary = ensureNavigationDockSummary();
    if (!summary) return;
    const timeValue = summary.querySelector<HTMLElement>(
      "[data-navigation-dock-time]",
    );
    const distanceValue = summary.querySelector<HTMLElement>(
      "[data-navigation-dock-distance]",
    );
    const modeValue = summary.querySelector<HTMLElement>(
      "[data-navigation-dock-mode]",
    );
    if (timeValue) timeValue.textContent = formatDuration(remainingDuration);
    if (distanceValue)
      distanceValue.textContent = formatDistance(remainingDistance);
    if (modeValue) modeValue.textContent = navigationTravelModeLabel();
  };

  const setNavigationDockActive = (enabled: boolean): void => {
    if (enabled) {
      unifiedDock?.setAttribute("data-dock-mode", "navigation");
      categoryRail?.setAttribute("data-navigation-summary", "true");
      const summary = ensureNavigationDockSummary();
      summary?.removeAttribute("hidden");
      if (voiceButton) {
        const label = navigationStopLabel();
        voiceButton.dataset.navigationStop = "true";
        voiceButton.classList.add("is-navigation-stop");
        voiceButton.setAttribute("aria-label", label);
        voiceButton.setAttribute("aria-pressed", "false");
        voiceButton.removeAttribute("data-i18n-aria");
        voiceButton.innerHTML =
          '<i class="fas fa-times" aria-hidden="true"></i><span>' +
          label +
          "</span>";
      }
      return;
    }

    unifiedDock?.removeAttribute("data-dock-mode");
    categoryRail?.removeAttribute("data-navigation-summary");
    navigationDockSummary?.setAttribute("hidden", "");
    if (voiceButton) {
      delete voiceButton.dataset.navigationStop;
      voiceButton.classList.remove("is-navigation-stop");
      voiceButton.innerHTML = originalVoiceMarkup;
      if (originalVoiceAria) {
        voiceButton.setAttribute("aria-label", originalVoiceAria);
      } else {
        voiceButton.removeAttribute("aria-label");
      }
      if (originalVoiceI18nAria) {
        voiceButton.setAttribute("data-i18n-aria", originalVoiceI18nAria);
      } else {
        voiceButton.removeAttribute("data-i18n-aria");
      }
    }
  };

  const onNavigationStopVoiceClick = (event: Event): void => {
    if (!active || voiceButton?.dataset.navigationStop !== "true") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    endButton?.click();
  };
  voiceButton?.addEventListener("click", onNavigationStopVoiceClick, true);

  const show = (): void => {
    if (destroyed) return;
    active = true;
    document.body.classList.add("navigation-active");
    banner?.classList.remove("hidden");
    endButton?.setAttribute("style", "display:block;");
    setNavigationDockActive(true);
    if (
      endButton &&
      document.documentElement.lang.toLowerCase().startsWith("pt")
    ) {
      endButton.textContent = "Sair";
      endButton.setAttribute("aria-label", "Sair da navegação");
    }
  };

  const hide = (): void => {
    if (destroyed) return;
    active = false;
    document.body.classList.remove("navigation-active");
    setNavigationDockActive(false);
    banner?.classList.add("hidden");
    banner?.classList.remove("minimized", "arrive");
    minimizeButton?.setAttribute("aria-expanded", "true");
    endButton?.setAttribute("style", "display:none;");
    supportUi.status?.classList.add("hidden");
    if (supportUi.status) supportUi.status.textContent = "";
    if (endButton) {
      endButton.textContent = originalEndText;
      if (originalEndAria) {
        endButton.setAttribute("aria-label", originalEndAria);
      }
    }
  };

  const toggleMinimized = (): void => {
    if (!banner || destroyed) return;
    const minimized = banner.classList.toggle("minimized");
    minimizeButton?.setAttribute("aria-expanded", String(!minimized));
  };
  minimizeButton?.addEventListener("click", toggleMinimized);

  const requestRecenter = (event: Event): void => {
    if (destroyed || !active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.dispatchEvent(new CustomEvent(NAVIGATION_RECENTER_REQUEST_EVENT));
  };
  supportUi.recenter?.addEventListener("click", requestRecenter, true);

  const setDirectionClass = (className: string): void => {
    banner?.classList.remove(
      "turn-left",
      "turn-right",
      "turn-uturn",
      "arrive",
      "continue-straight",
    );
    banner?.classList.add(className);
  };

  return Object.freeze({
    start: show,
    update(snapshot: NavigationRuntimeSnapshot): void {
      if (destroyed) return;
      if (!active) show();
      const guidance = snapshot.guidance;
      const instruction =
        guidance.instruction || guidance.original || "Continue pela rota";
      const direction = directionFor(instruction);
      const percent = Math.max(
        0,
        Math.min(100, Math.round(snapshot.progressPercent)),
      );

      if (main) main.textContent = instruction;
      if (details) details.textContent = v2SecondaryContext(guidance);
      if (arrow) arrow.textContent = direction.arrow;
      if (stepDistance) stepDistance.textContent = guidance.formattedDistance;
      if (distance)
        distance.textContent = formatDistance(snapshot.remainingDistance);
      if (time) time.textContent = formatDuration(snapshot.remainingDuration);
      updateNavigationDockSummary(
        snapshot.remainingDuration,
        snapshot.remainingDistance,
      );
      if (progress) progress.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `${percent}%`;
      setDirectionClass(direction.className);
    },
    approaching(message: string): void {
      if (destroyed) return;
      if (!active) show();
      if (details) details.textContent = message;
    },
    arrived(message: string): void {
      if (destroyed) return;
      if (!active) show();
      if (main) main.textContent = message;
      if (details) details.textContent = message;
      if (arrow) arrow.textContent = "●";
      if (stepDistance) stepDistance.textContent = "0 m";
      if (distance) distance.textContent = "0 m";
      if (time) time.textContent = "< 1 min";
      updateNavigationDockSummary(0, 0);
      if (progress) progress.style.width = "100%";
      if (progressText) progressText.textContent = "100%";
      setDirectionClass("arrive");
    },
    status(message: string | null, tone: NavigationStatusTone = "info"): void {
      if (destroyed || !supportUi.status) return;
      const normalized = message?.trim() ?? "";
      supportUi.status.textContent = normalized;
      supportUi.status.dataset.tone = tone;
      supportUi.status.classList.toggle("hidden", normalized.length === 0);
    },
    stop: hide,
    destroy(): void {
      if (destroyed) return;
      hide();
      destroyed = true;
      minimizeButton?.removeEventListener("click", toggleMinimized);
      supportUi.recenter?.removeEventListener("click", requestRecenter, true);
      voiceButton?.removeEventListener(
        "click",
        onNavigationStopVoiceClick,
        true,
      );
    },
  });
}
