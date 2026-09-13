import type { MapboxGlMapLike } from "@touristic/geospatial";

export interface ThreeDimensionalMapControlOptions {
  readonly document: Document;
  readonly resolveMap?: () => MapboxGlMapLike | undefined;
  readonly pitch?: number;
  readonly durationMs?: number;
}

export interface ThreeDimensionalMapControl {
  readonly active: boolean;
  destroy(): void;
}

interface PerspectiveMap extends MapboxGlMapLike {
  easeTo?(options: {
    readonly pitch?: number;
    readonly bearing?: number;
    readonly duration?: number;
    readonly essential?: boolean;
  }): void;
}

interface MorroMapboxCompatibilityGlobal {
  mapbox3dInstance?: MapboxGlMapLike;
}

const DEFAULT_PITCH = 60;
const DEFAULT_DURATION_MS = 700;

function defaultResolveMap(): MapboxGlMapLike | undefined {
  return (globalThis as typeof globalThis & MorroMapboxCompatibilityGlobal)
    .mapbox3dInstance;
}

function ensureControlButton(document: Document): HTMLButtonElement | undefined {
  const existing = document.getElementById("toggle-3d-mode");
  if (existing?.tagName === "BUTTON") return existing as HTMLButtonElement;

  const container = document.getElementById("globe-map-control");
  if (!container) return undefined;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "toggle-3d-mode";
  button.className = "map-control-button";
  button.title = "Alternar perspectiva 3D";
  button.setAttribute("aria-label", "Alternar perspectiva 3D");
  button.setAttribute("aria-pressed", "false");
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4.5 7.2 12 11.4l7.5-4.2L12 3Z"></path><path d="m4.5 7.2 7.5 4.2 7.5-4.2v9.6L12 21l-7.5-4.2V7.2Z"></path><path d="M12 11.4V21"></path></svg><span class="control-tooltip">Visão 3D</span>`;
  container.prepend(button);
  return button;
}

export function installThreeDimensionalMapControl({
  document,
  resolveMap = defaultResolveMap,
  pitch = DEFAULT_PITCH,
  durationMs = DEFAULT_DURATION_MS,
}: ThreeDimensionalMapControlOptions): ThreeDimensionalMapControl {
  const button = ensureControlButton(document);
  const mapElement = document.getElementById("map");
  let destroyed = false;
  let active = false;

  const renderState = (): void => {
    button?.classList.toggle("active", active);
    button?.setAttribute("aria-pressed", String(active));
    mapElement?.setAttribute("data-3d-view", String(active));
    document.body.classList.toggle("map-3d-mode", active);
    document.body.classList.toggle("navigation-3d-active", active);
  };

  const setAvailability = (enabled: boolean): void => {
    if (!button) return;
    button.setAttribute("aria-disabled", String(!enabled));
    button.disabled = !enabled;
  };

  const refreshAvailability = (): void => {
    if (destroyed) return;
    const provider = mapElement?.getAttribute("data-map-provider");
    const knownFallback = Boolean(provider && provider !== "mapbox");
    if (knownFallback && active) {
      active = false;
      renderState();
    }
    setAvailability(!knownFallback);
  };

  const onClick = (): void => {
    if (!button || destroyed) return;
    const perspectiveMap = resolveMap() as PerspectiveMap | undefined;
    if (typeof perspectiveMap?.easeTo !== "function") {
      refreshAvailability();
      return;
    }

    active = !active;
    renderState();
    perspectiveMap.easeTo({
      pitch: active ? pitch : 0,
      bearing: 0,
      duration: durationMs,
      essential: true,
    });
  };

  const MutationObserverCtor = document.defaultView?.MutationObserver;
  const observer =
    mapElement && MutationObserverCtor
      ? new MutationObserverCtor(refreshAvailability)
      : undefined;
  observer?.observe(mapElement!, {
    attributes: true,
    attributeFilter: ["data-map-provider"],
  });

  renderState();
  refreshAvailability();
  button?.addEventListener("click", onClick);

  return Object.freeze({
    get active(): boolean {
      return active;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      button?.removeEventListener("click", onClick);
      active = false;
      renderState();
      setAvailability(false);
    },
  });
}
