import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import type { RoutingLanguage } from "@touristic/navigation";

import type { BrowserGeolocationDriver } from "./browser-geolocation.js";
import {
  createNavigationDomLifecycle,
  type NavigationDomLifecycle,
} from "./navigation-dom-lifecycle.js";
import {
  createNavigationSessionBootstrap,
  type NavigationSessionBootstrap,
} from "./navigation-session-bootstrap.js";

export interface BrowserNavigationRuntimeOptions {
  readonly map: MapboxGlMapLike;
  readonly sdk: MapboxGlModuleLike;
  readonly document: Document;
  readonly geolocationDriver?: BrowserGeolocationDriver;
  readonly language?: RoutingLanguage;
  readonly createBootstrap?: typeof createNavigationSessionBootstrap;
  readonly createDomLifecycle?: typeof createNavigationDomLifecycle;
}

export interface BrowserNavigationRuntime extends NavigationDomLifecycle {
  readonly bootstrap: NavigationSessionBootstrap;
}

export function createBrowserNavigationRuntime(
  options: BrowserNavigationRuntimeOptions,
): BrowserNavigationRuntime {
  const createBootstrap =
    options.createBootstrap ?? createNavigationSessionBootstrap;
  const createDomLifecycle =
    options.createDomLifecycle ?? createNavigationDomLifecycle;

  const bootstrap = createBootstrap({
    map: options.map,
    sdk: options.sdk,
    ...(options.geolocationDriver
      ? { geolocationDriver: options.geolocationDriver }
      : {}),
    ...(options.language ? { language: options.language } : {}),
  });
  const lifecycle = createDomLifecycle({
    document: options.document,
    bootstrap,
  });

  return Object.freeze({
    bootstrap,
    start(destination) {
      return lifecycle.start(destination);
    },
    stop(): void {
      lifecycle.stop();
    },
    destroy(): void {
      lifecycle.destroy();
    },
    isActive(): boolean {
      return lifecycle.isActive();
    },
  });
}
