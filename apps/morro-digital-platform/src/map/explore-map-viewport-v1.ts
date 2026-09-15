import type { MapboxGlMapLike } from "@touristic/geospatial";
import { morroV1SearchCatalog } from "@touristic/search";

export interface ExploreMapViewportV1Options {
  readonly document: Document;
}

export interface ExploreMapViewportV1Controller {
  reframe(): void;
  destroy(): void;
}

interface ExploreMapboxGlobal {
  readonly mapboxPrimaryInstance?: MapboxGlMapLike & {
    fitBounds?(
      bounds: [[number, number], [number, number]],
      options?: {
        readonly padding?: Readonly<{
          top: number;
          bottom: number;
          left: number;
          right: number;
        }>;
        readonly pitch?: number;
        readonly bearing?: number;
        readonly duration?: number;
        readonly maxZoom?: number;
        readonly essential?: boolean;
      },
    ): void;
  };
}

function categoryMaxZoom(totalLocations: number): number {
  if (totalLocations >= 30) return 12.8;
  if (totalLocations >= 18) return 13.4;
  if (totalLocations >= 10) return 14.1;
  if (totalLocations >= 4) return 14.8;
  return 15.4;
}

function categoryViewportPadding(
  document: Document,
  totalLocations: number,
): Readonly<{ top: number; bottom: number; left: number; right: number }> {
  const assistant = document.getElementById("assistant-messages");
  const viewportHeight = Math.max(
    320,
    document.defaultView?.innerHeight ?? document.documentElement.clientHeight,
  );
  let modalHeight = assistant?.offsetHeight ?? 0;
  if (modalHeight < 100) modalHeight = viewportHeight * 0.45;
  const bottom = Math.max(modalHeight + 40, viewportHeight * 0.5);

  if (totalLocations >= 30) {
    return Object.freeze({ top: 80, bottom, left: 20, right: 20 });
  }
  if (totalLocations >= 18) {
    return Object.freeze({ top: 90, bottom, left: 25, right: 25 });
  }
  return Object.freeze({ top: 100, bottom, left: 30, right: 30 });
}

function markerLocations(document: Document, category: string) {
  const names = new Set(
    Array.from(
      document.querySelectorAll<HTMLElement>(
        `.morro-explore-marker[data-explore-category="${category}"]`,
      ),
    )
      .map((marker) => marker.dataset.locationName?.trim() ?? "")
      .filter(Boolean),
  );

  return morroV1SearchCatalog.filter(
    (location) => location.category === category && names.has(location.name),
  );
}

function locationsBounds(
  locations: readonly Readonly<{
    latitude: number;
    longitude: number;
  }>[],
): [[number, number], [number, number]] | null {
  if (locations.length < 2) return null;
  const longitudes = locations.map((location) => location.longitude);
  const latitudes = locations.map((location) => location.latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

/**
 * Re-applies the V1 category framing after marker replacement. The original
 * runtime reserves the assistant modal in the lower half of the viewport so
 * POIs remain visible instead of being positioned behind the conversation UI.
 */
export function installExploreMapViewportV1({
  document,
}: ExploreMapViewportV1Options): ExploreMapViewportV1Controller {
  const mapElement = document.getElementById("map");
  const messagesArea = document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
  let destroyed = false;
  let frameScheduled = false;
  let lastSignature = "";

  const reframe = (): void => {
    frameScheduled = false;
    if (destroyed || !mapElement) return;
    if (mapElement.dataset.exploreState !== "ready") return;

    const category = mapElement.dataset.exploreCategory?.trim() ?? "";
    const expectedCount = Number(mapElement.dataset.mapMarkerCount ?? "0");
    if (!category || !Number.isFinite(expectedCount) || expectedCount <= 1) {
      return;
    }

    const locations = markerLocations(document, category);
    if (locations.length !== expectedCount) return;
    const bounds = locationsBounds(locations);
    if (!bounds) return;

    const map = (globalThis as typeof globalThis & ExploreMapboxGlobal)
      .mapboxPrimaryInstance;
    if (!map?.fitBounds) return;

    const assistantHeight =
      document.getElementById("assistant-messages")?.offsetHeight ?? 0;
    const signature = [
      category,
      mapElement.dataset.exploreStage ?? "",
      expectedCount,
      assistantHeight,
      locations.map((location) => location.name).join("|"),
    ].join(":");
    if (signature === lastSignature) return;
    lastSignature = signature;

    map.fitBounds(bounds, {
      padding: categoryViewportPadding(document, expectedCount),
      pitch: expectedCount > 12 ? 30 : 35,
      bearing: 0,
      duration: 2_000,
      maxZoom: categoryMaxZoom(expectedCount),
      essential: true,
    });
  };

  const scheduleReframe = (): void => {
    if (destroyed || frameScheduled) return;
    frameScheduled = true;
    const view = document.defaultView;
    if (view?.requestAnimationFrame) {
      view.requestAnimationFrame(() => view.requestAnimationFrame(reframe));
    } else {
      queueMicrotask(reframe);
    }
  };

  const MutationObserverConstructor = document.defaultView?.MutationObserver;
  const mapObserver =
    mapElement && MutationObserverConstructor
      ? new MutationObserverConstructor(scheduleReframe)
      : null;
  mapObserver?.observe(mapElement, {
    attributes: true,
    attributeFilter: [
      "data-explore-state",
      "data-explore-category",
      "data-explore-stage",
      "data-map-marker-count",
    ],
    childList: true,
    subtree: true,
  });

  const assistantObserver =
    messagesArea && MutationObserverConstructor
      ? new MutationObserverConstructor(scheduleReframe)
      : null;
  assistantObserver?.observe(messagesArea, {
    childList: true,
    subtree: false,
  });

  document.defaultView?.addEventListener("resize", scheduleReframe);
  scheduleReframe();

  return Object.freeze({
    reframe: scheduleReframe,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      mapObserver?.disconnect();
      assistantObserver?.disconnect();
      document.defaultView?.removeEventListener("resize", scheduleReframe);
    },
  });
}
