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
  const requestRouteImpl = vi.fn(async () => routeData());
  const resolveStartCoordinate = vi.fn(
    async (): Promise<RouteCoordinate> => [-38.917, -13.376],
  );

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
    map,
    sdk,
    geolocationDriver,
    createWiring,
    requestRouteImpl,
    resolveStartCoordinate,
    wiringStart,
    wiringStop,
  };
}

describe("navigation session bootstrap", () => {
  it("resolves one start location, requests route and starts concrete wiring", async () => {
    const context = setup();
    const result = await context.bootstrap.start({
      longitude: -38.916,
      latitude: -13.375,
    });

    expect(result).toEqual(routeData());
    expect(context.resolveStartCoordinate).toHaveBeenCalledTimes(1);
    expect(context.requestRouteImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        start: [-38.917, -13.376],
        end: [-38.916, -13.375],
        language: "pt",
      }),
    );
    expect(context.createWiring).toHaveBeenCalledWith({
      map: context.map,
      sdk: context.sdk,
      routeData: result,
      geolocationDriver: context.geolocationDriver,
    });
    expect(context.wiringStart).toHaveBeenCalledTimes(1);
    expect(context.bootstrap.isActive()).toBe(true);
  });

  it("stops the active wiring exactly once per active session", async () => {
    const context = setup();
    await context.bootstrap.start({ longitude: -38.916, latitude: -13.375 });
    context.bootstrap.stop();
    context.bootstrap.stop();

    expect(context.wiringStop).toHaveBeenCalledTimes(1);
    expect(context.bootstrap.isActive()).toBe(false);
  });

  it("cancels an in-flight start when a newer session begins", async () => {
    const context = setup();
    let firstResolve: ((value: RouteCoordinate) => void) | null = null;
    context.resolveStartCoordinate
      .mockImplementationOnce(
        (signal: AbortSignal) =>
          new Promise<RouteCoordinate>((resolve, reject) => {
            firstResolve = resolve;
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("cancelled", "AbortError")),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce([-38.918, -13.377]);

    const first = context.bootstrap.start({
      longitude: -38.916,
      latitude: -13.375,
    });
    const second = context.bootstrap.start({
      longitude: -38.915,
      latitude: -13.374,
    });

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).resolves.toEqual(routeData());
    expect(firstResolve).not.toBeNull();
    expect(context.requestRouteImpl).toHaveBeenCalledTimes(1);
    expect(context.wiringStart).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid destination before requesting location or route", async () => {
    const context = setup();

    await expect(
      context.bootstrap.start({ longitude: 200, latitude: -13.375 }),
    ).rejects.toThrow("INVALID_NAVIGATION_DESTINATION");
    expect(context.resolveStartCoordinate).not.toHaveBeenCalled();
    expect(context.requestRouteImpl).not.toHaveBeenCalled();
    expect(context.wiringStart).not.toHaveBeenCalled();
  });
});
