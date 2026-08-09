import { describe, expect, it, vi } from "vitest";

import { NAVIGATION_CAMERA_V1_FIXTURE } from "./navigation-camera-v1.fixture.js";
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

function setup(container = { clientWidth: 400, clientHeight: 800 }) {
  const cameraUpdates: CameraUpdate[] = [];
  const markerOperations: string[] = [];
  const easeTo = vi.fn<(input: CameraUpdate) => void>();
  const map: NavigationMapboxMapLike = {
    easeTo(input) {
      cameraUpdates.push(input);
      easeTo(input);
    },
    getContainer: () => container,
  };
  const setLngLat = vi.fn<(position: [number, number]) => void>();
  const setRotation = vi.fn<(bearing: number) => void>();
  const addTo = vi.fn<(map: NavigationMapboxMapLike) => void>();
  const remove = vi.fn<() => void>();
  const marker: NavigationMapboxMarkerLike = {
    setLngLat(position) {
      markerOperations.push("setLngLat");
      setLngLat(position);
      return marker;
    },
    setRotation(bearing) {
      markerOperations.push("setRotation");
      setRotation(bearing);
      return marker;
    },
    addTo(input) {
      markerOperations.push("addTo");
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
    markerOperations,
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
  it("pins the executable contract to the frozen V1 source", () => {
    expect(NAVIGATION_CAMERA_V1_FIXTURE.sourceCommit).toBe(
      "60746fd7fed97b805758b37adfdbe3bad2582bfe",
    );
    expect(NAVIGATION_CAMERA_V1_FIXTURE.sourcePath).toBe(
      "js/navigation/navigationRuntime/navigation-route-runtime.js",
    );
  });

  it("positions and rotates the marker before attaching it to Mapbox", () => {
    const context = setup();
    context.presenter.update(snapshot());

    expect(context.markerOperations.slice(0, 3)).toEqual([
      "setLngLat",
      "setRotation",
      "addTo",
    ]);
    expect(context.setLngLat).toHaveBeenCalledWith([-38.917, -13.376]);
    expect(context.setRotation).toHaveBeenCalledWith(90);
    expect(context.addTo).toHaveBeenCalledTimes(1);
  });

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

  it("preserves the complete V1 first-person camera defaults", () => {
    const context = setup();
    context.presenter.update(snapshot(), true);

    const update = context.cameraUpdates[0];
    expect(update).toBeDefined();
    expect(update).toMatchObject({
      center: [-38.917, -13.376],
      bearing: 90,
      pitch: NAVIGATION_CAMERA_V1_FIXTURE.camera.pitch,
      zoom: NAVIGATION_CAMERA_V1_FIXTURE.camera.defaultZoom,
      duration: NAVIGATION_CAMERA_V1_FIXTURE.camera.forcedDurationMs,
      padding: { top: 312, bottom: 48, left: 24, right: 24 },
      retainPadding: NAVIGATION_CAMERA_V1_FIXTURE.invariants.retainPadding,
      essential: NAVIGATION_CAMERA_V1_FIXTURE.invariants.essential,
    });
    for (const sample of NAVIGATION_CAMERA_V1_FIXTURE.camera.easingSamples) {
      expect(update?.easing(sample.input)).toBeCloseTo(sample.output, 10);
    }
  });

  it("preserves V1 proportional padding across mobile, tablet and desktop", () => {
    const mobile = setup({ clientWidth: 360, clientHeight: 640 });
    mobile.presenter.update(snapshot(), true);
    expect(mobile.cameraUpdates[0]?.padding).toEqual({
      top: 250,
      bottom: 38,
      left: 22,
      right: 22,
    });

    const tablet = setup({ clientWidth: 768, clientHeight: 1024 });
    tablet.presenter.update(snapshot(), true);
    expect(tablet.cameraUpdates[0]?.padding).toEqual({
      top: 399,
      bottom: 61,
      left: 28,
      right: 28,
    });

    const desktop = setup({ clientWidth: 1440, clientHeight: 900 });
    desktop.presenter.update(snapshot(), true);
    expect(desktop.cameraUpdates[0]?.padding).toEqual({
      top: 351,
      bottom: 54,
      left: 28,
      right: 28,
    });
  });

  it("executes the exact V1 zoom hysteresis boundaries", () => {
    const context = setup();
    const distances = [120, 65, 64.99, 22.01, 22, 38, 38.01, 90, 90.01];
    for (const distanceToNextManeuver of distances) {
      context.presenter.update(snapshot({ distanceToNextManeuver }), true);
    }

    expect(context.cameraUpdates.map((input) => input.zoom)).toEqual([
      19.1, 19.1, 19.35, 19.35, 19.55, 19.55, 19.35, 19.35, 19.1,
    ]);
  });

  it("does not restart camera animation for polling without visual change", () => {
    const context = setup();
    context.presenter.update(snapshot(), true);
    context.setTime(30_000);
    context.presenter.update(snapshot());

    expect(context.easeTo).toHaveBeenCalledTimes(1);
    expect(context.setLngLat).toHaveBeenCalledTimes(2);
  });

  it("does not restart camera animation for movement and bearing below V1 thresholds", () => {
    const context = setup();
    context.presenter.update(snapshot(), true);
    context.setTime(11_000);
    context.presenter.update(
      snapshot({
        visualLocation: { latitude: -13.375999, longitude: -38.916999 },
        bearing: 92.49,
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
    expect(context.cameraUpdates[1]?.duration).toBe(
      NAVIGATION_CAMERA_V1_FIXTURE.camera.normalDurationMs,
    );
  });

  it("forces a camera update even when the visual snapshot is unchanged", () => {
    const context = setup();
    context.presenter.update(snapshot(), true);
    context.setTime(10_100);
    context.presenter.update(snapshot(), true);

    expect(context.easeTo).toHaveBeenCalledTimes(2);
    expect(context.cameraUpdates[1]?.duration).toBe(
      NAVIGATION_CAMERA_V1_FIXTURE.camera.forcedDurationMs,
    );
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
