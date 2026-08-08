import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";
import type { NavigationRequestPort } from "./navigation-request-port.js";
import type {
  NavigationSessionBootstrap,
  NavigationSessionBootstrapOptions,
} from "./navigation-session-bootstrap.js";
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
    const lifecycleStop = vi.fn<() => void>();
    const lifecycleDestroy = vi.fn<() => void>();
    const lifecycle = {
      start: vi.fn(),
      stop: lifecycleStop,
      destroy: lifecycleDestroy,
      isActive: vi.fn(() => false),
    } as unknown as NavigationDomLifecycle;
    const requestPortDestroy = vi.fn<() => void>();
    const requestPort = {
      destroy: requestPortDestroy,
    } as NavigationRequestPort;
    const createBootstrap = vi.fn<
      (options: NavigationSessionBootstrapOptions) => NavigationSessionBootstrap
    >(() => bootstrap);
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

    expect(createBootstrap).toHaveBeenCalledTimes(1);
    const bootstrapOptions = createBootstrap.mock.calls[0]?.[0];
    expect(bootstrapOptions).toBeDefined();
    expect(bootstrapOptions?.map).toBe(map);
    expect(bootstrapOptions?.sdk).toBe(sdk);
    expect(typeof bootstrapOptions?.onAutoEnd).toBe("function");
    bootstrapOptions?.onAutoEnd?.();
    expect(lifecycleStop).toHaveBeenCalledTimes(1);
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
