import { describe, expect, it, vi } from "vitest";

import {
  createNavigationMapboxPresenter,
  type NavigationMapboxMapLike,
  type NavigationMapboxMarkerLike,
  type NavigationVisualSnapshot,
} from "./navigation-mapbox.js";

type CameraUpdate = Parameters<NavigationMapboxMapLike["easeTo"]>[0];

function snapshot(
  overrides: Partial<NavigationVisualSnapshot> = {},
): NavigationVisualSnapshot {
  return {
    visualLocation: { latitude: -13.376, longitude: -38.917 },
    bearing: 90,
    distanceToNextManeuver: 120,
    ...overrides,
  };
}

function setup() {
  const cameraUpdates: CameraUpdate[] = [];
  const easeTo = vi.fn<(input: CameraUpdate) => void>();
  const map: NavigationMapboxMapLike = {
    easeTo(input) {
      cameraUpdates.push(input);
      easeTo(input);
    },
    getContainer: () => ({ clientWidth: 400, clientHeight: 800 }),
  };
  const setLngLat = vi.fn<(position: [number, number]) => void>();
  const setRotation = vi.fn<(bearing: number) => void>();
  const addTo = vi.fn<(map: NavigationMapboxMapLike) => void>();
  const remove = vi.fn<() => void>();
  const marker: NavigationMapboxMarkerLike = {
    setLngLat(position) {
      setLngLat(position);
      return marker;
    },
    setRotation(bearing) {
      setRotation(bearing);
      return marker;
    },
    addTo(input) {
      addTo(input);
      return marker;
    },
    remove,
  };
  let time = 10_000;
  const presenter = createNavigationMapboxPresenter({
    map,
    createMarker: () => marker,
    now: () => time,
    viewport: () => ({ width: 360, height: 640 }),
  });
  return {
    presenter,
    easeTo,
    cameraUpdates,
    setLngLat,
    setRotation,
    addTo,
    remove,
    setTime(value: number) {
      time = value;
    },
  };
}

describe("Mapbox navigation presenter", () => {
  it("creates and updates one user marker from the visual snapshot", () => {
    const context = setup();
    context.presenter.update(snapshot());
    context.presenter.update(
      snapshot({
        visualLocation: { latitude: -13.3759, longitude: -38.9169 },
        bearing: 110,
      }),
    );

    expect(context.addTo).toHaveBeenCalledTimes(1);
    expect(context.setLngLat).toHaveBeenLastCalledWith([-38.9169, -13.3759]);
    expect(context.setRotation).toHaveBeenLastCalledWith(110);
  });

  it("preserves the V1 first-person camera defaults and proportional padding", () => {
    const context = setup();
    context.presenter.update(snapshot(), true);

    expect(context.easeTo).toHaveBeenCalledWith({
      center: [-38.917, -13.376],
      bearing: 90,
      pitch: 68,
      zoom: 19.1,
      duration: 900,
      padding: { top: 312, bottom: 48, left: 24, right: 24 },
      retainPadding: false,
      essential: true,
    });
  });

  it("uses V1 zoom hysteresis for far, near and close maneuver distances", () => {
    const context = setup();
    context.presenter.update(snapshot({ distanceToNextManeuver: 120 }), true);
    context.presenter.update(snapshot({ distanceToNextManeuver: 60 }), true);
    context.presenter.update(snapshot({ distanceToNextManeuver: 20 }), true);
    context.presenter.update(snapshot({ distanceToNextManeuver: 30 }), true);
    context.presenter.update(snapshot({ distanceToNextManeuver: 100 }), true);

    expect(context.cameraUpdates.map((input) => input.zoom)).toEqual([
      19.1, 19.35, 19.55, 19.55, 19.1,
    ]);
  });

  it("does not restart camera animation for insignificant visual jitter", () => {
    const context = setup();
    context.presenter.update(snapshot(), true);
    context.setTime(11_000);
    context.presenter.update(
      snapshot({
        visualLocation: { latitude: -13.375999, longitude: -38.916999 },
        bearing: 91,
      }),
    );

    expect(context.easeTo).toHaveBeenCalledTimes(1);
    expect(context.setLngLat).toHaveBeenCalledTimes(2);
  });

  it("respects the V1 camera minimum interval for small changes", () => {
    const context = setup();
    context.presenter.update(snapshot(), true);
    context.setTime(10_400);
    context.presenter.update(
      snapshot({
        visualLocation: { latitude: -13.37598, longitude: -38.91698 },
        bearing: 94,
      }),
    );
    expect(context.easeTo).toHaveBeenCalledTimes(1);

    context.setTime(11_100);
    context.presenter.update(
      snapshot({
        visualLocation: { latitude: -13.37596, longitude: -38.91696 },
        bearing: 97,
      }),
    );
    expect(context.easeTo).toHaveBeenCalledTimes(2);
  });

  it("ignores stale visual updates and removes marker on destroy", () => {
    const context = setup();
    expect(
      context.presenter.update(snapshot({ visualIgnoredStaleUpdate: true })),
    ).toBe(false);
    expect(context.easeTo).not.toHaveBeenCalled();
    expect(context.addTo).not.toHaveBeenCalled();

    context.presenter.update(snapshot(), true);
    context.presenter.destroy();
    expect(context.remove).toHaveBeenCalledTimes(1);
  });
});
