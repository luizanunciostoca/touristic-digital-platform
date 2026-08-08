import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import type { RouteFeatureCollection } from "@touristic/navigation";

import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";
import type { NavigationSessionBootstrap } from "./navigation-session-bootstrap.js";
import { createBrowserNavigationRuntime } from "./browser-navigation-runtime.js";

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
      },
    ],
  };
}

describe("browser navigation runtime", () => {
  it("composes session bootstrap and V1 DOM lifecycle without globals", async () => {
    const map = { setCenter: vi.fn(), remove: vi.fn() } as MapboxGlMapLike;
    const sdk = {
      accessToken: "token",
      Map: vi.fn(),
      Marker: vi.fn(),
    } as unknown as MapboxGlModuleLike;
    const document = {} as Document;

    const bootstrapStart = vi.fn(async () => routeData());
    const bootstrapStop = vi.fn<() => void>();
    const bootstrap: NavigationSessionBootstrap = {
      start: bootstrapStart,
      stop: bootstrapStop,
      isActive: () => true,
    };
    const createBootstrap = vi.fn(() => bootstrap);

    const lifecycleStart = vi.fn(async () => routeData());
    const lifecycleStop = vi.fn<() => void>();
    const lifecycleDestroy = vi.fn<() => void>();
    const lifecycle: NavigationDomLifecycle = {
      start: lifecycleStart,
      stop: lifecycleStop,
      destroy: lifecycleDestroy,
      isActive: () => true,
    };
    const createDomLifecycle = vi.fn(() => lifecycle);

    const runtime = createBrowserNavigationRuntime({
      map,
      sdk,
      document,
      language: "pt",
      createBootstrap,
      createDomLifecycle,
    });

    expect(createBootstrap).toHaveBeenCalledWith({
      map,
      sdk,
      language: "pt",
    });
    expect(createDomLifecycle).toHaveBeenCalledWith({ document, bootstrap });
    expect(runtime.bootstrap).toBe(bootstrap);

    const destination = { longitude: -38.916, latitude: -13.375 };
    await runtime.start(destination);
    runtime.stop();
    runtime.destroy();

    expect(lifecycleStart).toHaveBeenCalledWith(destination);
    expect(lifecycleStop).toHaveBeenCalledTimes(1);
    expect(lifecycleDestroy).toHaveBeenCalledTimes(1);
    expect(runtime.isActive()).toBe(true);
  });
});
