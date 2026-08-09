import type { NavigationDestinationInput } from "./navigation-session-bootstrap.js";
import type { NavigationDomLifecycle } from "./navigation-dom-lifecycle.js";

export const NAVIGATION_REQUEST_EVENT = "morro:navigation-requested";

export interface NavigationRequestPortOptions {
  readonly document: Document;
  readonly lifecycle: NavigationDomLifecycle;
  readonly onError?: (error: unknown) => void;
}

export interface NavigationRequestPort {
  destroy(): void;
}

function isNavigationDestinationInput(
  value: unknown,
): value is NavigationDestinationInput {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<NavigationDestinationInput>;
  return (
    Number.isFinite(candidate.longitude) &&
    Number.isFinite(candidate.latitude) &&
    Number(candidate.longitude) >= -180 &&
    Number(candidate.longitude) <= 180 &&
    Number(candidate.latitude) >= -90 &&
    Number(candidate.latitude) <= 90
  );
}

export function createNavigationRequestPort(
  options: NavigationRequestPortOptions,
): NavigationRequestPort {
  const { document, lifecycle, onError } = options;
  let destroyed = false;

  const onNavigationRequested = (event: Event): void => {
    if (destroyed || !(event instanceof CustomEvent)) return;

    const detail = event.detail as
      { readonly destination?: unknown } | undefined;
    const destination = detail?.destination;
    if (!isNavigationDestinationInput(destination)) return;

    void lifecycle.start(destination).catch((error: unknown) => {
      onError?.(error);
    });
  };

  document.addEventListener(NAVIGATION_REQUEST_EVENT, onNavigationRequested);

  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener(
        NAVIGATION_REQUEST_EVENT,
        onNavigationRequested,
      );
    },
  });
}
