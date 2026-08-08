export interface NavigationVisualSnapshot {
  readonly visualLocation: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly bearing: number;
  readonly distanceToNextManeuver: number;
  readonly visualIgnoredStaleUpdate?: boolean;
}

export interface NavigationMapContainerLike {
  readonly clientHeight: number;
  readonly clientWidth: number;
}

export interface NavigationMapboxMapLike {
  easeTo(input: {
    readonly center: [number, number];
    readonly bearing: number;
    readonly pitch: number;
    readonly zoom: number;
    readonly duration: number;
    readonly easing: (time: number) => number;
    readonly padding: {
      readonly top: number;
      readonly bottom: number;
      readonly left: number;
      readonly right: number;
    };
    readonly retainPadding: boolean;
    readonly essential: boolean;
  }): void;
  getContainer?(): NavigationMapContainerLike;
}

export interface NavigationMapboxMarkerLike {
  setLngLat(position: [number, number]): NavigationMapboxMarkerLike;
  setRotation?(bearing: number): NavigationMapboxMarkerLike;
  addTo(map: NavigationMapboxMapLike): NavigationMapboxMarkerLike;
  remove(): void;
}

export interface NavigationMapboxPresenterOptions {
  readonly map: NavigationMapboxMapLike;
  readonly createMarker: () => NavigationMapboxMarkerLike;
  readonly now?: () => number;
  readonly viewport?: () => { readonly width: number; readonly height: number };
}

export interface NavigationMapboxPresenter {
  update(snapshot: NavigationVisualSnapshot, force?: boolean): boolean;
  reset(): void;
  destroy(): void;
}

const CAMERA_MIN_INTERVAL_MS = 900;
const CAMERA_MIN_MOVE_METERS = 1.5;
const CAMERA_MIN_BEARING_DEGREES = 2.5;
const CAMERA_PITCH = 68;
const CAMERA_DEFAULT_ZOOM = 19.1;

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function geographicDistanceMeters(
  a: { readonly latitude: number; readonly longitude: number } | null,
  b: { readonly latitude: number; readonly longitude: number },
): number {
  if (!a) return Infinity;
  const latitudeScale = 110_540;
  const longitudeScale =
    111_320 * Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
  return Math.hypot(
    (a.longitude - b.longitude) * longitudeScale,
    (a.latitude - b.latitude) * latitudeScale,
  );
}

function bearingDifference(a: number, b: number): number {
  let difference = Math.abs(finiteNumber(a) - finiteNumber(b)) % 360;
  if (difference > 180) difference = 360 - difference;
  return difference;
}

function cameraEasing(time: number): number {
  return time * (2 - time);
}

function getCameraPadding(
  map: NavigationMapboxMapLike,
  viewport: () => { readonly width: number; readonly height: number },
): { top: number; bottom: number; left: number; right: number } {
  const container = map.getContainer?.();
  const fallback = viewport();
  const height = Math.max(320, container?.clientHeight ?? fallback.height);
  const width = Math.max(280, container?.clientWidth ?? fallback.width);
  return {
    top: Math.round(height * 0.39),
    bottom: Math.round(height * 0.06),
    left: Math.round(Math.min(28, width * 0.06)),
    right: Math.round(Math.min(28, width * 0.06)),
  };
}

export function createNavigationMapboxPresenter(
  options: NavigationMapboxPresenterOptions,
): NavigationMapboxPresenter {
  const now = options.now ?? (() => Date.now());
  const viewport = options.viewport ?? (() => ({ width: 360, height: 640 }));
  let marker: NavigationMapboxMarkerLike | null = null;
  let lastCameraUpdate = 0;
  let lastCameraPosition: NavigationVisualSnapshot["visualLocation"] | null =
    null;
  let lastBearing: number | null = null;
  let lastCameraZoom: number | null = null;
  let cameraZoomMode: "far" | "near" | "close" = "far";

  function cameraZoomFor(snapshot: NavigationVisualSnapshot): number {
    const distance = Math.max(
      0,
      finiteNumber(snapshot.distanceToNextManeuver, 200),
    );
    if (cameraZoomMode === "close") {
      if (distance > 38) cameraZoomMode = "near";
    } else if (cameraZoomMode === "near") {
      if (distance <= 22) cameraZoomMode = "close";
      else if (distance > 90) cameraZoomMode = "far";
    } else if (distance < 65) {
      cameraZoomMode = distance <= 22 ? "close" : "near";
    }
    if (cameraZoomMode === "close") return 19.55;
    if (cameraZoomMode === "near") return 19.35;
    return CAMERA_DEFAULT_ZOOM;
  }

  function updateMarker(snapshot: NavigationVisualSnapshot): void {
    marker ??= options.createMarker().addTo(options.map);
    marker
      .setLngLat([
        snapshot.visualLocation.longitude,
        snapshot.visualLocation.latitude,
      ])
      .setRotation?.(snapshot.bearing);
  }

  function resetState(): void {
    lastCameraUpdate = 0;
    lastCameraPosition = null;
    lastBearing = null;
    lastCameraZoom = null;
    cameraZoomMode = "far";
  }

  const presenter: NavigationMapboxPresenter = {
    update(snapshot: NavigationVisualSnapshot, force = false): boolean {
      if (snapshot.visualIgnoredStaleUpdate) return false;
      updateMarker(snapshot);

      const targetZoom = cameraZoomFor(snapshot);
      const moved = geographicDistanceMeters(
        lastCameraPosition,
        snapshot.visualLocation,
      );
      const bearingChanged =
        lastBearing === null
          ? Infinity
          : bearingDifference(snapshot.bearing, lastBearing);
      const zoomChanged =
        lastCameraZoom === null ||
        Math.abs(targetZoom - lastCameraZoom) >= 0.05;
      const currentTime = now();

      if (
        !force &&
        moved < CAMERA_MIN_MOVE_METERS &&
        bearingChanged < CAMERA_MIN_BEARING_DEGREES &&
        !zoomChanged
      ) {
        return true;
      }

      if (
        !force &&
        currentTime - lastCameraUpdate < CAMERA_MIN_INTERVAL_MS &&
        moved < 4 &&
        bearingChanged < 6 &&
        !zoomChanged
      ) {
        return true;
      }

      options.map.easeTo({
        center: [
          snapshot.visualLocation.longitude,
          snapshot.visualLocation.latitude,
        ],
        bearing: clamp(finiteNumber(snapshot.bearing), 0, 360),
        pitch: CAMERA_PITCH,
        zoom: targetZoom,
        duration: force ? 900 : 650,
        easing: cameraEasing,
        padding: getCameraPadding(options.map, viewport),
        retainPadding: false,
        essential: true,
      });
      lastCameraUpdate = currentTime;
      lastCameraPosition = { ...snapshot.visualLocation };
      lastBearing = snapshot.bearing;
      lastCameraZoom = targetZoom;
      return true;
    },
    reset(): void {
      resetState();
    },
    destroy(): void {
      marker?.remove();
      marker = null;
      resetState();
    },
  };

  return Object.freeze(presenter);
}
