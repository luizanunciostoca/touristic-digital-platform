import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

import {
  createNavigationDomLifecycle,
  type NavigationDomLifecycle,
} from "./navigation-dom-lifecycle.js";
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
}

export interface BrowserNavigationRuntimeInstall {
  readonly bootstrap: NavigationSessionBootstrap;
  readonly lifecycle: NavigationDomLifecycle;
  destroy(): void;
}

export function installBrowserNavigationRuntime(
  options: BrowserNavigationRuntimeInstallOptions,
): BrowserNavigationRuntimeInstall {
  const createBootstrap =
    options.createBootstrap ?? createNavigationSessionBootstrap;
  const createLifecycle = options.createLifecycle ?? createNavigationDomLifecycle;
  const bootstrap = createBootstrap({
    map: options.map,
    sdk: options.sdk,
  });
  const lifecycle = createLifecycle({
    document: options.document,
    bootstrap,
  });
  let destroyed = false;

  return Object.freeze({
    bootstrap,
    lifecycle,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      lifecycle.destroy();
    },
  });
}
