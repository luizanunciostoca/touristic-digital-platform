import type { MapboxGlMapLike } from "@touristic/geospatial";

export interface GlobalViewControlOptions {
  readonly document: Document;
  readonly map: MapboxGlMapLike;
  readonly homeCenter: readonly [number, number];
  readonly homeZoom: number;
}

export interface GlobalViewControl {
  destroy(): void;
  readonly isGlobal: boolean;
}

interface CameraMap extends MapboxGlMapLike {
  easeTo?(options: {
    readonly center: [number, number];
    readonly zoom: number;
    readonly pitch?: number;
    readonly bearing?: number;
    readonly duration?: number;
    readonly essential?: boolean;
  }): void;
  setZoom?(zoom: number): void;
}

const GLOBAL_CENTER: [number, number] = [-38.9167, 5];
const GLOBAL_ZOOM = 1.6;
const CAMERA_DURATION_MS = 900;

export function installGlobalViewControl({
  document,
  map,
  homeCenter,
  homeZoom,
}: GlobalViewControlOptions): GlobalViewControl {
  const button = document.getElementById("toggle-globe-view");
  const mapElement = document.getElementById("map");
  const cameraMap = map as CameraMap;
  let destroyed = false;
  let isGlobal = button?.classList.contains("active") ?? false;

  const canTransition = Boolean(
    cameraMap.easeTo || (cameraMap.fitBounds && cameraMap.setZoom),
  );

  const setButtonAvailability = (enabled: boolean): void => {
    if (!button) return;
    button.setAttribute("aria-disabled", String(!enabled));
    if (button instanceof HTMLButtonElement) button.disabled = !enabled;
  };

  const applyCamera = (): void => {
    if (destroyed || !canTransition) return;
    if (cameraMap.easeTo) {
      cameraMap.easeTo({
        center: isGlobal ? GLOBAL_CENTER : [...homeCenter],
        zoom: isGlobal ? GLOBAL_ZOOM : homeZoom,
        pitch: 0,
        bearing: 0,
        duration: CAMERA_DURATION_MS,
        essential: true,
      });
    } else if (isGlobal && cameraMap.fitBounds) {
      cameraMap.fitBounds(
        [
          [-179, -70],
          [179, 80],
        ],
        {
          padding: 20,
          pitch: 0,
          bearing: 0,
          duration: CAMERA_DURATION_MS,
          essential: true,
        },
      );
    } else {
      cameraMap.setCenter([...homeCenter]);
      cameraMap.setZoom?.(homeZoom);
    }
    mapElement?.setAttribute("data-global-view", String(isGlobal));
  };

  const onClick = (): void => {
    if (!button || destroyed || !canTransition) return;
    // browser-entry preserves the V1 visual active-state listener; this handler
    // converts that state into the corresponding camera transition.
    isGlobal = button.classList.contains("active");
    applyCamera();
  };

  button?.setAttribute("aria-pressed", String(isGlobal));
  mapElement?.setAttribute("data-global-view", String(isGlobal));
  setButtonAvailability(canTransition);
  button?.addEventListener("click", onClick);

  // If the V1 shell was interacted with before the real map finished mounting,
  // honor the already-active visual state as soon as the camera becomes ready.
  if (isGlobal && canTransition) applyCamera();

  return Object.freeze({
    get isGlobal(): boolean {
      return isGlobal;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      button?.removeEventListener("click", onClick);
      setButtonAvailability(false);
    },
  });
}
