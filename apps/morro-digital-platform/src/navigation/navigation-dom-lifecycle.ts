import type { RouteFeatureCollection } from "@touristic/navigation";

import type { NavigationDomEventBridge } from "./navigation-dom-events.js";
import type {
  NavigationDestinationInput,
  NavigationSessionBootstrap,
} from "./navigation-session-bootstrap.js";

const END_NAVIGATION_BUTTON_ID = "end-navigation-btn";
const NAVIGATION_ACTIVE_CLASS = "navigation-active";

export interface NavigationDomLifecycleOptions {
  readonly document: Document;
  readonly bootstrap: NavigationSessionBootstrap;
  readonly eventBridge?: NavigationDomEventBridge;
}

export interface NavigationDomLifecycle {
  start(
    destination: NavigationDestinationInput,
  ): Promise<RouteFeatureCollection>;
  stop(reason?: string): void;
  destroy(): void;
  isActive(): boolean;
}

function setEndButtonVisible(document: Document, visible: boolean): void {
  const endButton = document.getElementById(END_NAVIGATION_BUTTON_ID);
  if (!endButton) return;
  endButton.style.display = visible ? "block" : "none";
  endButton.style.opacity = visible ? "1" : "0";
  endButton.style.pointerEvents = visible ? "auto" : "none";
}

function destinationLabel(
  destination: NavigationDestinationInput | null,
): string {
  if (!destination) return "";
  return `${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}`;
}

function dispatchLegacyLifecycleEvent(document: Document, type: string): void {
  document.defaultView?.dispatchEvent(new Event(type));
}

export function createNavigationDomLifecycle(
  options: NavigationDomLifecycleOptions,
): NavigationDomLifecycle {
  const { document, bootstrap, eventBridge } = options;
  const endButton = document.getElementById(END_NAVIGATION_BUTTON_ID);
  let active = false;
  let generation = 0;
  let destroyed = false;
  let activeDestination: NavigationDestinationInput | null = null;

  const applyEndedState = (reason: string, dispatchEvent: boolean): void => {
    const wasActive = active;
    const endedDestination = activeDestination;
    active = false;
    activeDestination = null;
    document.body.classList.remove(NAVIGATION_ACTIVE_CLASS);
    setEndButtonVisible(document, false);
    if (!dispatchEvent || !wasActive) return;

    if (eventBridge) {
      eventBridge.ended({
        reason,
        destination: destinationLabel(endedDestination),
        timestamp: Date.now(),
      });
      eventBridge.status({
        phase: reason === "arrived" ? "arrived" : "ended",
        hasRoute: false,
        hasInstructions: false,
        hasUserLocation: false,
        isActive: false,
        navigationSessionId: null,
        destination: destinationLabel(endedDestination),
        timestamp: Date.now(),
      });
      return;
    }

    dispatchLegacyLifecycleEvent(document, "navigationEnded");
  };

  const stop = (reason = "cancelled"): void => {
    generation += 1;
    bootstrap.stop();
    applyEndedState(reason, true);
  };

  const onEndButtonClick = (event: Event): void => {
    event.preventDefault();
    stop("cancelled");
  };

  endButton?.addEventListener("click", onEndButtonClick);
  setEndButtonVisible(document, false);

  return Object.freeze({
    async start(
      destination: NavigationDestinationInput,
    ): Promise<RouteFeatureCollection> {
      if (destroyed) {
        throw new Error("NAVIGATION_DOM_LIFECYCLE_DESTROYED");
      }

      stop("superseded");
      const startGeneration = generation;
      try {
        const routeData = await bootstrap.start(destination);
        if (destroyed || startGeneration !== generation) {
          bootstrap.stop();
          throw new DOMException("Navigation start superseded", "AbortError");
        }
        active = true;
        activeDestination = destination;
        document.body.classList.add(NAVIGATION_ACTIVE_CLASS);
        setEndButtonVisible(document, true);
        const sessionId = bootstrap.getActiveSessionId();
        if (eventBridge && sessionId !== null) {
          eventBridge.started({
            destination: destinationLabel(destination),
            sessionId,
            timestamp: Date.now(),
          });
          eventBridge.status({
            phase: "active",
            hasRoute: true,
            isActive: true,
            navigationSessionId: sessionId,
            destination: destinationLabel(destination),
            timestamp: Date.now(),
          });
        } else {
          dispatchLegacyLifecycleEvent(document, "navigationStarted");
        }
        return routeData;
      } catch (error) {
        if (startGeneration === generation) {
          applyEndedState("start_failed", false);
        }
        throw error;
      }
    },
    stop,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      endButton?.removeEventListener("click", onEndButtonClick);
      stop("destroyed");
    },
    isActive(): boolean {
      return active;
    },
  });
}
