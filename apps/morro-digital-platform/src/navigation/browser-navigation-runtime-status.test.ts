import { describe, expect, it, vi } from "vitest";

import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import { createNavigationHealthSnapshot } from "@touristic/navigation";

import type { NavigationDomEventBridge } from "./navigation-dom-events.js";
import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";
import type { NavigationGuidanceUi } from "./navigation-guidance-ui.js";
import type { NavigationRequestPort } from "./navigation-request-port.js";
import type {
  NavigationSessionBootstrap,
  NavigationSessionBootstrapOptions,
} from "./navigation-session-bootstrap.js";
import { installBrowserNavigationRuntime } from "./browser-navigation-runtime-install.js";

describe("browser navigation runtime route status", () => {
  it("keeps hasRoute true when location arrives before the first runtime snapshot", () => {
    const status = vi.fn<NavigationDomEventBridge["status"]>((input) =>
      createNavigationHealthSnapshot(input),
    );
    const bridge: NavigationDomEventBridge = {
      started: vi.fn(),
      status,
      location: vi.fn(),
      runtime: vi.fn(),
      ended: vi.fn(),
      getLastStatus: () => null,
    };
    const bootstrap: NavigationSessionBootstrap = {
      start: vi.fn(),
      stop: vi.fn(),
      isActive: vi.fn(() => true),
      getActiveSessionId: vi.fn(() => 9),
    };
    const lifecycle: NavigationDomLifecycle = {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      isActive: vi.fn(() => true),
    };
    const requestPort: NavigationRequestPort = { destroy: vi.fn() };
    const guidanceUi: NavigationGuidanceUi = {
      start: vi.fn(),
      update: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    const createBootstrap = vi.fn<
      (options: NavigationSessionBootstrapOptions) => NavigationSessionBootstrap
    >(() => bootstrap);

    installBrowserNavigationRuntime({
      map: { setCenter: vi.fn(), remove: vi.fn() } as MapboxGlMapLike,
      sdk: {
        accessToken: "token",
        Map: vi.fn(),
        Marker: vi.fn(),
      } as unknown as MapboxGlModuleLike,
      document: {} as Document,
      createBootstrap,
      createLifecycle: vi.fn(() => lifecycle),
      createRequestPort: vi.fn(() => requestPort),
      createEventBridge: vi.fn(() => bridge),
      createGuidanceUi: vi.fn(() => guidanceUi),
    });

    const options = createBootstrap.mock.calls[0]?.[0];
    expect(options?.onLocation).toBeTypeOf("function");
    options?.onLocation?.(
      {
        latitude: -13.3762,
        longitude: -38.9172,
        accuracy: 0,
        heading: null,
        speed: 0,
        timestamp: 1_000,
      },
      {
        sessionId: 9,
        destination: { longitude: -38.9148, latitude: -13.374 },
      },
    );

    expect(status).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasRoute: true,
        hasUserLocation: true,
        navigationSessionId: 9,
      }),
    );
  });
});
