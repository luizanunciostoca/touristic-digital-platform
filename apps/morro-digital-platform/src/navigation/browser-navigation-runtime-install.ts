import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import {
  createNavigationDomLifecycle,
  type NavigationDomLifecycle,
} from "./navigation-dom-lifecycle.js";
import {
  createNavigationRequestPort,
  type NavigationRequestPort,
} from "./navigation-request-port.js";
import {
  createNavigationSessionBootstrap,
  type NavigationSessionBootstrap,
} from "./navigation-session-bootstrap.js";

export interface BrowserNavigationRuntimeInstallOptions {
  readonly map: MapboxGlMapLike;
  readonly sdk: MapboxGlModuleLike;
  readonly document: Document;
  readonly createBootstrap?: typeof createNavigationSessionBootstrap;
  readonly createLifecycle?: typeof createNavigationDomLifecycle;
  readonly createRequestPort?: typeof createNavigationRequestPort;
}

export interface BrowserNavigationRuntimeInstall {
  readonly bootstrap: NavigationSessionBootstrap;
  readonly lifecycle: NavigationDomLifecycle;
  readonly requestPort: NavigationRequestPort;
  destroy(): void;
}

export function installBrowserNavigationRuntime(
  options: BrowserNavigationRuntimeInstallOptions,
): BrowserNavigationRuntimeInstall {
  const createBootstrap =
    options.createBootstrap ?? createNavigationSessionBootstrap;
  const createLifecycle =
    options.createLifecycle ?? createNavigationDomLifecycle;
  const createRequestPort =
    options.createRequestPort ?? createNavigationRequestPort;

  let lifecycle: NavigationDomLifecycle | null = null;
  const bootstrap = createBootstrap({
    map: options.map,
    sdk: options.sdk,
    onAutoEnd: () => lifecycle?.stop(),
  });
  lifecycle = createLifecycle({
    document: options.document,
    bootstrap,
  });
  const activeLifecycle = lifecycle;
  const requestPort = createRequestPort({
    document: options.document,
    lifecycle: activeLifecycle,
  });
  let destroyed = false;

  return Object.freeze({
    bootstrap,
    lifecycle: activeLifecycle,
    requestPort,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      requestPort.destroy();
      activeLifecycle.destroy();
      lifecycle = null;
    },
  });
}
