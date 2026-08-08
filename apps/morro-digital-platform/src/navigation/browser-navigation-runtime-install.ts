import type {
  MapboxGlMapLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";
import type { NavigationRuntimeSnapshot } from "@touristic/navigation";

import type { BrowserLocation } from "./browser-geolocation.js";
import {
  createNavigationDomEventBridge,
  type NavigationDomEventBridge,
} from "./navigation-dom-events.js";
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
  type NavigationSessionEventContext,
} from "./navigation-session-bootstrap.js";

export interface BrowserNavigationRuntimeInstallOptions {
  readonly map: MapboxGlMapLike;
  readonly sdk: MapboxGlModuleLike;
  readonly document: Document;
  readonly createBootstrap?: typeof createNavigationSessionBootstrap;
  readonly createLifecycle?: typeof createNavigationDomLifecycle;
  readonly createRequestPort?: typeof createNavigationRequestPort;
  readonly createEventBridge?: typeof createNavigationDomEventBridge;
}

export interface BrowserNavigationRuntimeInstall {
  readonly bootstrap: NavigationSessionBootstrap;
  readonly lifecycle: NavigationDomLifecycle;
  readonly requestPort: NavigationRequestPort;
  readonly eventBridge: NavigationDomEventBridge;
  destroy(): void;
}

function destinationLabel(context: NavigationSessionEventContext): string {
  return `${context.destination.latitude.toFixed(6)},${context.destination.longitude.toFixed(6)}`;
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
  const createEventBridge =
    options.createEventBridge ?? createNavigationDomEventBridge;
  const eventBridge = createEventBridge(options.document);

  let lifecycle: NavigationDomLifecycle | null = null;
  let latestLocation: BrowserLocation | null = null;
  let latestSnapshot: NavigationRuntimeSnapshot | null = null;
  let recalculations = 0;

  function publishStatus(context: NavigationSessionEventContext): void {
    const snapshot = latestSnapshot;
    eventBridge.status({
      phase: "active",
      hasRoute: snapshot !== null,
      hasInstructions: (snapshot?.guidance.totalSteps ?? 0) > 0,
      hasUserLocation: latestLocation !== null,
      isActive: true,
      isPaused: false,
      currentStepIndex: snapshot?.guidance.stepIndex ?? 0,
      totalSteps: snapshot?.guidance.totalSteps ?? 0,
      routeDistance: snapshot?.totalDistance ?? 0,
      routeDuration: snapshot?.totalDuration ?? 0,
      routeProgress: snapshot?.progress ?? 0,
      navigationSessionId: context.sessionId,
      recalculations,
      destination: destinationLabel(context),
      timestamp: Date.now(),
    });
  }

  const bootstrap = createBootstrap({
    map: options.map,
    sdk: options.sdk,
    onLocation: (location, context) => {
      latestLocation = location;
      eventBridge.location({
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: Number.isFinite(location.accuracy) ? location.accuracy : null,
        speed: Number.isFinite(Number(location.speed))
          ? Number(location.speed)
          : null,
        timestamp: location.timestamp,
        sessionId: context.sessionId,
      });
      publishStatus(context);
    },
    onSnapshot: (snapshot, context) => {
      latestSnapshot = snapshot;
      eventBridge.runtime({
        sessionId: context.sessionId,
        routeIdentity: snapshot.routeIdentity,
        offRouteDistance: snapshot.offRouteDistance,
        remainingDistance: snapshot.remainingDistance,
        remainingDuration: snapshot.remainingDuration,
        progress: snapshot.progress,
        progressPercent: snapshot.progressPercent,
        bearing: snapshot.bearing,
        distanceToNextManeuver: snapshot.distanceToNextManeuver,
        timestamp: Date.now(),
      });
      publishStatus(context);
    },
    onRecalculation: () => {
      recalculations += 1;
    },
    onAutoEnd: () => lifecycle?.stop("arrived"),
  });
  lifecycle = createLifecycle({
    document: options.document,
    bootstrap,
    eventBridge,
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
    eventBridge,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      requestPort.destroy();
      activeLifecycle.destroy();
      lifecycle = null;
      latestLocation = null;
      latestSnapshot = null;
      recalculations = 0;
    },
  });
}
