import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";
import type { NavigationRequestPort } from "./navigation-request-port.js";
import type { NavigationSessionBootstrap } from "./navigation-session-bootstrap.js";
import { installBrowserNavigationRuntime } from "./browser-navigation-runtime-install.js";

describe("browser navigation runtime install", () => {
  it("composes bootstrap, DOM lifecycle and navigation request port", () => {
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
    const requestPortDestroy = vi.fn<() => void>();
    const requestPort = {
      destroy: requestPortDestroy,
    } as NavigationRequestPort;
    const createBootstrap = vi.fn(() => bootstrap);
    const createLifecycle = vi.fn(() => lifecycle);
    const createRequestPort = vi.fn(() => requestPort);

    const installed = installBrowserNavigationRuntime({
      map,
      sdk,
      document,
      createBootstrap,
      createLifecycle,
      createRequestPort,
    });

    expect(createBootstrap).toHaveBeenCalledWith({ map, sdk });
    expect(createLifecycle).toHaveBeenCalledWith({ document, bootstrap });
    expect(createRequestPort).toHaveBeenCalledWith({ document, lifecycle });
    expect(installed.bootstrap).toBe(bootstrap);
    expect(installed.lifecycle).toBe(lifecycle);
    expect(installed.requestPort).toBe(requestPort);
  });

  it("destroys the request port before the lifecycle exactly once", () => {
    const calls: string[] = [];
    const lifecycleDestroy = vi.fn(() => calls.push("lifecycle"));
    const requestPortDestroy = vi.fn(() => calls.push("request-port"));
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
    const requestPort = {
      destroy: requestPortDestroy,
    } as NavigationRequestPort;

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
      createRequestPort: vi.fn(() => requestPort),
    });

    installed.destroy();
    installed.destroy();

    expect(requestPortDestroy).toHaveBeenCalledTimes(1);
    expect(lifecycleDestroy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["request-port", "lifecycle"]);
  });
});
