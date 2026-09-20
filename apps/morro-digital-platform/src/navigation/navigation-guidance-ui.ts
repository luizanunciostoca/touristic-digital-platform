import type {
  NavigationGuidanceSnapshot,
  NavigationRuntimeSnapshot,
} from "@touristic/navigation";

export interface NavigationGuidanceUi {
  start(): void;
  update(snapshot: NavigationRuntimeSnapshot): void;
  approaching?(message: string): void;
  arrived?(message: string): void;
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
    return { arrow: "←", className: "turn-left" };
  }
  if (includesAny(text, ["right", "direita", "derecha", "ימינה", "ימין"])) {
    return { arrow: "→", className: "turn-right" };
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

export function createNavigationGuidanceUi(
  document: Document,
): NavigationGuidanceUi {
  const banner = document.getElementById("instruction-banner");
  const endButton = document.getElementById("end-navigation-btn");
  const minimizeButton = document.getElementById("minimize-navigation-btn");
  const main = document.getElementById("instruction-main");
  const details = document.getElementById("instruction-details");
  const arrow = document.getElementById("instruction-arrow");
  const distance = document.getElementById("instruction-distance");
  const time = document.getElementById("instruction-time");
  const progress = document.getElementById("route-progress");
  const progressText = document.getElementById("progress-text");
  let active = false;
  let destroyed = false;


  const show = (): void => {
    if (destroyed) return;
    active = true;
    document.body.classList.add("navigation-active");
    banner?.classList.remove("hidden");
    endButton?.setAttribute("style", "display:block;");
  };

  const hide = (): void => {
    if (destroyed) return;
    active = false;
    document.body.classList.remove("navigation-active");
    banner?.classList.add("hidden");
    banner?.classList.remove("minimized", "arrive");
    minimizeButton?.setAttribute("aria-expanded", "true");
    endButton?.setAttribute("style", "display:none;");
  };

  const toggleMinimized = (): void => {
    if (!banner || destroyed) return;
    const minimized = banner.classList.toggle("minimized");
    minimizeButton?.setAttribute("aria-expanded", String(!minimized));
  };
  minimizeButton?.addEventListener("click", toggleMinimized);

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
      if (details) details.textContent = v1DetailsText(guidance);
      if (arrow) arrow.textContent = direction.arrow;
      if (distance)
        distance.textContent = formatDistance(snapshot.remainingDistance);
      if (time) time.textContent = formatDuration(snapshot.remainingDuration);
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
      if (distance) distance.textContent = "0 m";
      if (time) time.textContent = "< 1 min";
      if (progress) progress.style.width = "100%";
      if (progressText) progressText.textContent = "100%";
      setDirectionClass("arrive");
    },
    stop: hide,
    destroy(): void {
      if (destroyed) return;
      hide();
      destroyed = true;
      minimizeButton?.removeEventListener("click", toggleMinimized);
    },
  });
}
