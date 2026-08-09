import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import type {
  RouteCoordinate,
  RouteFeatureCollection,
} from "@touristic/navigation";

import type { BrowserGeolocationDriver } from "./browser-geolocation.js";
import type { BrowserNavigationWiring } from "./browser-navigation-wiring.js";
import { createNavigationSessionBootstrap } from "./navigation-session-bootstrap.js";

const V1_STALE_ROUTE_PROVENANCE = Object.freeze({
  repository: "luizidebook/morro-de-sao-paulo-digital",
  commit: "60746fd7fed97b805758b37adfdbe3bad2582bfe",
  controller: Object.freeze({
    path: "js/navigation/navigationController/navigationController.js",
    blobSha: "12efc692f597c9b57a3ccbb476b2b9f71e369c94",
  }),
  mapControls: Object.freeze({
    path: "js/map/core/map-controls.js",
    blobSha: "23529a5c4859b7497c9460784529ca65c6058cb1",
  }),
  contractTest: Object.freeze({
    path: "js/navigation/navigationState/__tests__/navigation-session-contract.test.js",
    blobSha: "4df4fd6fe7924198a0139e3ba44e62540fa8e167",
  }),
});

function routeData(): RouteFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-38.917, -13.376],
            [-38.916, -13.375],
          ],
        },
        properties: { distance: 100, duration: 80 },
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setup() {
  const map: MapboxGlMapLike = { setCenter: vi.fn(), remove: vi.fn() };
  const sdk = {
    accessToken: "token",
    Map: vi.fn(),
    Marker: vi.fn(),
  } as unknown as MapboxGlModuleLike;
  const geolocationDriver = {
    watchPosition: vi.fn(),
    getCurrentPosition: vi.fn(),
    clearWatch: vi.fn(),
  } as unknown as BrowserGeolocationDriver;
  const wiringStart = vi.fn<() => void>();
  const wiringStop = vi.fn<() => void>();
  const wiring: BrowserNavigationWiring = {
    composition: {} as BrowserNavigationWiring["composition"],
    start: wiringStart,
    stop: wiringStop,
  };
  const createWiring = vi.fn(() => wiring);
  const resolveStartCoordinate = vi.fn<
    (signal: AbortSignal) => Promise<RouteCoordinate>
  >(async () => [-38.917, -13.376]);
  const requestRouteImpl = vi.fn();

  const bootstrap = createNavigationSessionBootstrap({
    map,
    sdk,
    geolocationDriver,
    resolveStartCoordinate,
    requestRouteImpl,
    createWiring,
  });

  return {
    bootstrap,
    createWiring,
    requestRouteImpl,
    wiringStart,
  };
}

describe("V1 stale route result baseline parity", () => {
  it("pins the V1 controller/map/session-contract provenance", () => {
    expect(V1_STALE_ROUTE_PROVENANCE.commit).toBe(
      "60746fd7fed97b805758b37adfdbe3bad2582bfe",
    );
    expect(V1_STALE_ROUTE_PROVENANCE.controller.blobSha).toBe(
      "12efc692f597c9b57a3ccbb476b2b9f71e369c94",
    );
    expect(V1_STALE_ROUTE_PROVENANCE.mapControls.blobSha).toBe(
      "23529a5c4859b7497c9460784529ca65c6058cb1",
    );
  });

  it("blocks a stale route response after a newer navigation start", async () => {
    const context = setup();
    const firstRoute = deferred<RouteFeatureCollection>();
    context.requestRouteImpl
      .mockImplementationOnce(() => firstRoute.promise)
      .mockResolvedValueOnce(routeData());

    const first = context.bootstrap.start({
      longitude: -38.916,
      latitude: -13.375,
    });
    await Promise.resolve();
    await Promise.resolve();

    const second = context.bootstrap.start({
      longitude: -38.915,
      latitude: -13.374,
    });
    firstRoute.resolve(routeData());

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).resolves.toEqual(routeData());
    expect(context.createWiring).toHaveBeenCalledTimes(1);
    expect(context.wiringStart).toHaveBeenCalledTimes(1);
  });

  it("blocks a pending route response after navigation stop", async () => {
    const context = setup();
    const pendingRoute = deferred<RouteFeatureCollection>();
    context.requestRouteImpl.mockImplementationOnce(() => pendingRoute.promise);

    const start = context.bootstrap.start({
      longitude: -38.916,
      latitude: -13.375,
    });
    await Promise.resolve();
    await Promise.resolve();

    context.bootstrap.stop();
    pendingRoute.resolve(routeData());

    await expect(start).rejects.toMatchObject({ name: "AbortError" });
    expect(context.createWiring).not.toHaveBeenCalled();
    expect(context.wiringStart).not.toHaveBeenCalled();
    expect(context.bootstrap.isActive()).toBe(false);
  });
});
