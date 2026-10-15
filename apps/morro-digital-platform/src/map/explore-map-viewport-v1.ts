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
  const dock = document.getElementById("unified-assistant-dock");
  const viewportHeight = Math.max(
    320,
    document.defaultView?.innerHeight ?? document.documentElement.clientHeight,
  );
  const dockHeight = Math.max(0, dock?.offsetHeight ?? 0);
  const bottom = Math.min(
    viewportHeight * 0.58,
    Math.max(dockHeight + 40, viewportHeight * 0.28),
  );

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

type Bounds = [[number, number], [number, number]];

function datasetGeometry(
  map: HTMLElement,
): Readonly<{ bounds: Bounds; count: number; identity: string }> | null {
  if (map.dataset.exploreDatasetContract !== "bounds-v1") return null;
  const count = Number(map.dataset.mapMemberCount);
  const generation = Number(map.dataset.exploreDatasetGeneration);
  if (
    !Number.isSafeInteger(count) ||
    count < 2 ||
    !Number.isSafeInteger(generation) ||
    generation <= 0
  )
    return null;
  try {
    const bounds: unknown = JSON.parse(
      map.dataset.exploreDatasetBounds ?? "null",
    );
    if (
      !Array.isArray(bounds) ||
      bounds.length !== 2 ||
      bounds.some(
        (point) =>
          !Array.isArray(point) ||
          point.length !== 2 ||
          point.some(
            (value) => typeof value !== "number" || !Number.isFinite(value),
          ),
      )
    )
      return null;
    const [[west, south], [east, north]] = bounds as Bounds;
    if (
      west < -180 ||
      east > 180 ||
      south < -90 ||
      north > 90 ||
      west > east ||
      south > north
    )
      return null;
    return {
      bounds: bounds as Bounds,
      count,
      identity: JSON.stringify([generation, count, bounds]),
    };
  } catch {
    return null;
  }
}

/**
 * Re-applies the V1 category framing after marker replacement. The original
 * runtime reserves the measured unified assistant dock so POIs remain visible
 * instead of being positioned behind the persistent conversation/navigation UI.
 */
export function installExploreMapViewportV1({
  document,
}: ExploreMapViewportV1Options): ExploreMapViewportV1Controller {
  const mapElement = document.getElementById("map");
  const messagesArea = document.querySelector<HTMLElement>(
    "#assistant-messages .messages-area",
  );
  const unifiedDock = document.getElementById("unified-assistant-dock");
  let destroyed = false;
  let frameScheduled = false;
  let lastSignature = "";

  const reframe = (): void => {
    frameScheduled = false;
    if (destroyed || !mapElement) return;
    if (mapElement.dataset.exploreState !== "ready") return;

    // Navigation and immersive tours own their cameras independently.
    const mode = document.body?.dataset.mdMode;
    if (
      mode === "navigation" ||
      mode === "tour" ||
      ["switching", "ready"].includes(mapElement.dataset.tourState ?? "")
    )
      return;

    const newContract = [
      "exploreDatasetContract",
      "exploreDatasetBounds",
      "exploreDatasetGeneration",
      "mapMemberCount",
    ].some((key) =>
      Object.prototype.hasOwnProperty.call(mapElement.dataset, key),
    );
    let bounds: Bounds | null;
    let expectedCount: number;
    let datasetIdentity: string;
    if (newContract) {
      const geometry = datasetGeometry(mapElement);
      if (!geometry) return; // Present but partial/invalid never becomes legacy.
      ({ bounds, count: expectedCount, identity: datasetIdentity } = geometry);
    } else {
      const category = mapElement.dataset.exploreCategory?.trim() ?? "";
      expectedCount = Number(mapElement.dataset.mapMarkerCount ?? "0");
      if (!category || !Number.isFinite(expectedCount) || expectedCount <= 1)
        return;
      const locations = markerLocations(document, category);
      if (locations.length !== expectedCount) return;
      bounds = locationsBounds(locations);
      if (!bounds) return;
      datasetIdentity = JSON.stringify([
        category,
        mapElement.dataset.exploreStage ?? "",
        expectedCount,
        locations.map((location) => location.name),
      ]);
    }

    const map = (globalThis as typeof globalThis & ExploreMapboxGlobal)
      .mapboxPrimaryInstance;
    if (!map?.fitBounds) return;

    const dockHeight = unifiedDock?.offsetHeight ?? 0;
    const viewportWidth =
      document.defaultView?.innerWidth ?? document.documentElement.clientWidth;
    const viewportHeight =
      document.defaultView?.innerHeight ??
      document.documentElement.clientHeight;
    const signature = [
      datasetIdentity,
      // Opening lists or returning to menu changes dock height without changing
      // the dataset or viewport. Keep the user's camera; measure new padding
      // when a real dataset/viewport change next requires framing.
      newContract ? null : dockHeight,
      viewportWidth,
      viewportHeight,
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
  let mapObserver: MutationObserver | null = null;
  if (mapElement && MutationObserverConstructor) {
    mapObserver = new MutationObserverConstructor(scheduleReframe);
    mapObserver.observe(mapElement, {
      attributes: true,
      attributeFilter: [
        "data-explore-state",
        "data-explore-category",
        "data-explore-stage",
        "data-map-marker-count",
        "data-map-member-count",
        "data-explore-dataset-contract",
        "data-explore-dataset-bounds",
        "data-explore-dataset-generation",
        "data-tour-state",
      ],
      childList: true,
      subtree: true,
    });
  }

  let assistantObserver: MutationObserver | null = null;
  if (messagesArea && MutationObserverConstructor) {
    assistantObserver = new MutationObserverConstructor(scheduleReframe);
    assistantObserver.observe(messagesArea, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  const ResizeObserverConstructor = document.defaultView?.ResizeObserver;
  const dockObserver =
    unifiedDock && ResizeObserverConstructor
      ? new ResizeObserverConstructor(scheduleReframe)
      : null;
  if (unifiedDock) dockObserver?.observe(unifiedDock);

  document.defaultView?.addEventListener("resize", scheduleReframe);
  scheduleReframe();

  return Object.freeze({
    reframe: scheduleReframe,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      mapObserver?.disconnect();
      assistantObserver?.disconnect();
      dockObserver?.disconnect();
      document.defaultView?.removeEventListener("resize", scheduleReframe);
    },
  });
}
