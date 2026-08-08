import {
  createNavigationHealthSnapshot,
  type NavigationEndedEventDetail,
  type NavigationEventMap,
  type NavigationHealthSnapshot,
  type NavigationHealthSnapshotInput,
  type NavigationRouteRuntimeUpdatedEventDetail,
  type NavigationStartedEventDetail,
  type UserLocationUpdatedEventDetail,
} from "@touristic/navigation";

export interface NavigationDomEventBridge {
  started(detail: NavigationStartedEventDetail): void;
  status(input: NavigationHealthSnapshotInput): NavigationHealthSnapshot;
  location(detail: UserLocationUpdatedEventDetail): void;
  runtime(detail: NavigationRouteRuntimeUpdatedEventDetail): void;
  ended(detail: NavigationEndedEventDetail): void;
  getLastStatus(): NavigationHealthSnapshot | null;
}

function dispatchNavigationEvent<K extends keyof NavigationEventMap>(
  document: Document,
  type: K,
  detail: NavigationEventMap[K],
): void {
  const target = document.defaultView;
  if (!target) return;
  target.dispatchEvent(new target.CustomEvent(type, { detail }));
}

export function createNavigationDomEventBridge(
  document: Document,
): NavigationDomEventBridge {
  let lastStatus: NavigationHealthSnapshot | null = null;

  return Object.freeze({
    started(detail: NavigationStartedEventDetail): void {
      dispatchNavigationEvent(document, "navigationStarted", detail);
    },
    status(input: NavigationHealthSnapshotInput): NavigationHealthSnapshot {
      const snapshot = createNavigationHealthSnapshot(input);
      lastStatus = snapshot;
      dispatchNavigationEvent(document, "navigationStatusChanged", snapshot);
      return snapshot;
    },
    location(detail: UserLocationUpdatedEventDetail): void {
      dispatchNavigationEvent(document, "userLocationUpdated", detail);
    },
    runtime(detail: NavigationRouteRuntimeUpdatedEventDetail): void {
      dispatchNavigationEvent(
        document,
        "navigationRouteRuntimeUpdated",
        detail,
      );
    },
    ended(detail: NavigationEndedEventDetail): void {
      dispatchNavigationEvent(document, "navigationEnded", detail);
    },
    getLastStatus(): NavigationHealthSnapshot | null {
      return lastStatus;
    },
  });
}
