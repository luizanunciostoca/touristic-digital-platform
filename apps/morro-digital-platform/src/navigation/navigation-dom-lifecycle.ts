import type { RouteFeatureCollection } from "@touristic/navigation";

import type {
  NavigationDestinationInput,
  NavigationSessionBootstrap,
} from "./navigation-session-bootstrap.js";

const END_NAVIGATION_BUTTON_ID = "end-navigation-btn";
const NAVIGATION_ACTIVE_CLASS = "navigation-active";

export interface NavigationDomLifecycleOptions {
  readonly document: Document;
  readonly bootstrap: NavigationSessionBootstrap;
}

export interface NavigationDomLifecycle {
  start(destination: NavigationDestinationInput): Promise<RouteFeatureCollection>;
  stop(): void;
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

function dispatchLifecycleEvent(document: Document, type: string): void {
  document.defaultView?.dispatchEvent(new Event(type));
}

export function createNavigationDomLifecycle(
  options: NavigationDomLifecycleOptions,
): NavigationDomLifecycle {
  const { document, bootstrap } = options;
  const endButton = document.getElementById(END_NAVIGATION_BUTTON_ID);
  let active = false;
  let generation = 0;
  let destroyed = false;

  const applyEndedState = (dispatchEvent: boolean): void => {
    const wasActive = active;
    active = false;
    document.body.classList.remove(NAVIGATION_ACTIVE_CLASS);
    setEndButtonVisible(document, false);
    if (dispatchEvent && wasActive) {
      dispatchLifecycleEvent(document, "navigationEnded");
    }
  };

  const stop = (): void => {
    generation += 1;
    bootstrap.stop();
    applyEndedState(true);
  };

  const onEndButtonClick = (event: Event): void => {
    event.preventDefault();
    stop();
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

      stop();
      const startGeneration = generation;
      try {
        const routeData = await bootstrap.start(destination);
        if (destroyed || startGeneration !== generation) {
          bootstrap.stop();
          throw new DOMException("Navigation start superseded", "AbortError");
        }
        active = true;
        document.body.classList.add(NAVIGATION_ACTIVE_CLASS);
        setEndButtonVisible(document, true);
        dispatchLifecycleEvent(document, "navigationStarted");
        return routeData;
      } catch (error) {
        if (startGeneration === generation) {
          applyEndedState(false);
        }
        throw error;
      }
    },
    stop,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      endButton?.removeEventListener("click", onEndButtonClick);
      stop();
    },
    isActive(): boolean {
      return active;
    },
  });
}
