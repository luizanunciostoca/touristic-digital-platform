import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";
import type { NavigationSessionBootstrap } from "./navigation-session-bootstrap.js";
import { installBrowserNavigationRuntime } from "./browser-navigation-runtime-install.js";

describe("browser navigation runtime install", () => {
  it("composes the concrete bootstrap and V1 DOM lifecycle", () => {
    const map = {
      setCenter: vi.fn(),
      remove: vi.fn(),
    } as MapboxGlMapLike;
    const sdk = {
      accessToken: "token",
      Map: vi.fn(),
      Marker: vi.fn(),
    } as unknown as MapboxGlModuleLike;
    const document = {} as Document;
    const bootstrap = {
      start: vi.fn(),
      stop: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as NavigationSessionBootstrap;
    const lifecycleDestroy = vi.fn<() => void>();
    const lifecycle = {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: lifecycleDestroy,
      isActive: vi.fn(() => false),
    } as unknown as NavigationDomLifecycle;
    const createBootstrap = vi.fn(() => bootstrap);
    const createLifecycle = vi.fn(() => lifecycle);

    const installed = installBrowserNavigationRuntime({
      map,
      sdk,
      document,
      createBootstrap,
      createLifecycle,
    });

    expect(createBootstrap).toHaveBeenCalledWith({ map, sdk });
    expect(createLifecycle).toHaveBeenCalledWith({ document, bootstrap });
    expect(installed.bootstrap).toBe(bootstrap);
    expect(installed.lifecycle).toBe(lifecycle);
  });

  it("destroys the lifecycle exactly once", () => {
    const lifecycleDestroy = vi.fn<() => void>();
    const bootstrap = {
      start: vi.fn(),
      stop: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as NavigationSessionBootstrap;
    const lifecycle = {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: lifecycleDestroy,
      isActive: vi.fn(() => false),
    } as unknown as NavigationDomLifecycle;

    const installed = installBrowserNavigationRuntime({
      map: { setCenter: vi.fn(), remove: vi.fn() },
      sdk: {
        accessToken: "token",
        Map: vi.fn(),
        Marker: vi.fn(),
      },
      document: {} as Document,
      createBootstrap: vi.fn(() => bootstrap),
      createLifecycle: vi.fn(() => lifecycle),
    });

    installed.destroy();
    installed.destroy();

    expect(lifecycleDestroy).toHaveBeenCalledTimes(1);
  });
});
