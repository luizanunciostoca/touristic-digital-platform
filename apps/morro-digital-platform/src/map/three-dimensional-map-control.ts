import type { MapboxGlMapLike } from "@touristic/geospatial";

export interface ThreeDimensionalMapControlOptions {
  readonly document: Document;
  readonly map: MapboxGlMapLike;
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

const DEFAULT_PITCH = 60;
const DEFAULT_DURATION_MS = 700;

export function installThreeDimensionalMapControl({
  document,
  map,
  pitch = DEFAULT_PITCH,
  durationMs = DEFAULT_DURATION_MS,
}: ThreeDimensionalMapControlOptions): ThreeDimensionalMapControl {
  const button = document.getElementById("toggle-3d-mode");
  const mapElement = document.getElementById("map");
  const perspectiveMap = map as PerspectiveMap;
  const canTransition = typeof perspectiveMap.easeTo === "function";
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
    if (button instanceof HTMLButtonElement) button.disabled = !enabled;
  };

  const applyCamera = (): void => {
    if (!canTransition || destroyed) return;
    perspectiveMap.easeTo?.({
      pitch: active ? pitch : 0,
      bearing: 0,
      duration: durationMs,
      essential: true,
    });
  };

  const onClick = (): void => {
    if (!button || !canTransition || destroyed) return;
    active = !active;
    renderState();
    applyCamera();
  };

  setAvailability(canTransition);
  renderState();
  button?.addEventListener("click", onClick);

  return Object.freeze({
    get active(): boolean {
      return active;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      button?.removeEventListener("click", onClick);
      active = false;
      renderState();
      setAvailability(false);
    },
  });
}
