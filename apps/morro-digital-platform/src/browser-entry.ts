import { normalizeAssistantVoiceLanguage } from "@touristic/assistant";
import type {
  MapboxGlMapLike,
  MapboxGlMarkerLike,
  MapboxGlModuleLike,
  MapMarker,
} from "@touristic/geospatial";
import { morroV1SearchCatalog } from "@touristic/search";

import {
  installBrowserAnalyticsConsentPreferences,
  installMorroBrowserAnalytics,
} from "./analytics/browser-analytics.js";
import { installAssistantShellUi } from "./assistant/assistant-shell-ui.js";
import { startMorroDigitalBrowser } from "./browser.js";
import { morroDeSaoPauloDestination } from "./config/destination.js";
import type { RuntimeEnvironment } from "./config/mapbox-runtime.js";
import {
  getMorroTourById,
  type TourRouteContract,
} from "./config/tour-catalog.js";
import { createMorroTourSelectionController } from "./config/tour-selection.js";
import {
  createLeafletCompatibilitySdk,
  hasLeafletCompatibilitySdk,
} from "./development/leaflet-compatibility-sdk.js";
import { createDevelopmentMapboxSdk } from "./development/mapbox-sdk.js";
import { installHomeDiscoverNavigation } from "./home/home-discover-navigation.js";
import { bootstrapMorroDigitalApplication } from "./main.js";
import {
  installBrowserNavigationRuntime,
  type BrowserNavigationRuntimeInstall,
} from "./navigation/browser-navigation-runtime-install.js";
import { installPublicOnboarding } from "./onboarding/public-onboarding.js";
import { recordMorroStartupMetric } from "./performance/browser-startup-performance.js";
import {
  installGlobalViewControl,
  type GlobalViewControl,
} from "./map/global-view-control.js";
import { getExploreLocationsCategories } from "./map/explore-locations-control.js";
import { createV1ExploreMarkerElement } from "./map/explore-marker-element.js";
import { initializeMorroBrowserLocale } from "./runtime/browser-locale.js";
import {
  loadPublicDestination,
  type MorroPublicDestination,
} from "./runtime/public-destination.js";
import { loadMapboxGlSdk } from "./runtime/mapbox-sdk-loader.js";
import { createMapStyleReadinessTracker } from "./runtime/map-style-readiness.js";
import {
  applyRuntimeAccessibilityPresentation,
  formatRuntimeStatus,
  localizedTourStopLabel,
  type RuntimeStatusDescriptor,
} from "./runtime/runtime-accessibility-i18n.js";
import { installPremiumUxModePresenter } from "./ux/premium-ux-mode.js";
import {
  installTouristExperienceSnapshotCapture,
  restoreTouristExperienceSnapshot,
} from "./ux/tourist-experience-snapshot.js";
import { initializeWeatherWidget } from "./weather/weather-widget.js";

interface MorroRuntimeGlobal {
  readonly __MORRO_RUNTIME_ENV__?: RuntimeEnvironment;
}

interface MorroMapboxCompatibilityGlobal {
  mapboxPrimaryInstance: MapboxGlMapLike | undefined;
  mapbox3dInstance: MapboxGlMapLike | undefined;
}

interface ResolvedMapProvider {
  readonly sdk: MapboxGlModuleLike;
  readonly environment: RuntimeEnvironment;
  readonly mode: "real" | "leaflet" | "development";
}

const TOUR_ROUTE_SOURCE = "tour-route-source";
const TOUR_ROUTE_LAYER = "tour-route-layer";
const TOUR_ROUTE_OUTLINE = "tour-route-outline";
const TOUR_CAMERA_DURATION_MS = 2000;
const TOUR_CAMERA_TIMEOUT_MS = 3500;
const DISCOVER_HOME_ZOOM = 14.8;
const DISCOVER_DEFAULT_MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
const DISCOVER_SATELLITE_MAP_STYLE =
  "mapbox://styles/mapbox/satellite-streets-v12";
const DISCOVER_POI_CATEGORIES = Object.freeze([
  "beaches",
  "restaurants",
  "hotels",
  "attractions",
  "nightlife",
  "shops",
  "transport",
] as const);
const SPLASH_VISIBLE_MS = 800;
const SPLASH_FADE_MS = 550;

initializeMorroBrowserLocale({ document });
const browserAnalytics = installMorroBrowserAnalytics({ document, window });
const privacyPreferences = installBrowserAnalyticsConsentPreferences({
  document,
  controller: browserAnalytics,
});

const application = bootstrapMorroDigitalApplication(document);

function discoverInitialMarkers(): readonly MapMarker[] {
  const selected = DISCOVER_POI_CATEGORIES.flatMap((category) =>
    morroV1SearchCatalog
      .filter((location) => location.category === category)
      .slice(0, category === "beaches" ? 2 : 1),
  );
  return Object.freeze(
    selected.map((location, index) =>
      Object.freeze({
        id: `explore:${location.category}:discover:${index}`,
        position: Object.freeze({
          latitude: location.latitude,
          longitude: location.longitude,
        }),
        label: location.name,
      }),
    ),
  );
}

function installDiscoverCategoryRail(): void {
  const rail = document.getElementById("discover-category-rail");
  if (!rail) return;
  const buttons = Array.from(
    rail.querySelectorAll<HTMLButtonElement>("[data-discover-category]"),
  );

  const synchronizeLabels = (): void => {
    const locale = normalizeAssistantVoiceLanguage(
      document.documentElement.lang,
    );
    const categories = new Map(
      getExploreLocationsCategories(locale).map((category) => [
        category.value,
        category,
      ]),
    );
    for (const button of buttons) {
      const value = button.dataset.discoverCategory ?? "";
      const category = categories.get(value);
      if (!category) continue;
      button.textContent = category.label;
      button.setAttribute(
        "aria-label",
        `${category.label} · ${category.count} locais`,
      );
    }
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const category = button.dataset.discoverCategory;
      if (!category) return;
      void application.exploreLocations.execute({
        type: "open_category",
        category,
      });
    });
  }

  document.addEventListener("morro:explore-state-changed", () => {
    const activeCategory = mapContainer?.dataset.exploreCategory ?? null;
    for (const button of buttons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.discoverCategory === activeCategory),
      );
    }
  });

  const observer = new MutationObserver(synchronizeLabels);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  synchronizeLabels();
}

installDiscoverCategoryRail();

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const marker = target.closest<HTMLElement>(".morro-explore-marker");
  if (!marker) return;
  const canonicalPlaceId = marker.dataset.canonicalPlaceId?.trim();
  const place = marker.dataset.locationName?.trim();
  const category = marker.dataset.exploreCategory?.trim();
  if (!canonicalPlaceId && (!place || !category)) return;
  event.preventDefault();
  event.stopPropagation();
  if (canonicalPlaceId) {
    void application.exploreLocations.execute({
      type: "select_place_id",
      placeId: canonicalPlaceId,
    });
    return;
  }
  void application.exploreLocations.execute({
    type: "select_place",
    place: place ?? "",
    category: category ?? "",
  });
});

installHomeDiscoverNavigation({
  document,
  openPrivacyPreferences: () => privacyPreferences.open(),
});
initializeWeatherWidget({ document });

function setupV1ShellInteractions(): void {
  installAssistantShellUi({ document });

  const globeButton = document.getElementById("toggle-globe-view");
  globeButton?.addEventListener("click", () => {
    const active = globeButton.classList.toggle("active");
    globeButton.setAttribute("aria-pressed", String(active));
  });

  document
    .querySelectorAll<HTMLButtonElement>(".assistant-option-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.value || button.textContent?.trim() || "";
        document.dispatchEvent(
          new CustomEvent("morro:assistant-option-selected", {
            detail: { value },
          }),
        );
      });
    });
}

setupV1ShellInteractions();
recordMorroStartupMetric(document, performance, "assistant");
installPremiumUxModePresenter({ document });
const publicOnboarding = installPublicOnboarding({ document });

function setV1MapboxCompatibilityAliases(
  map: MapboxGlMapLike | undefined,
): void {
  const compatibilityGlobal = globalThis as typeof globalThis &
    MorroMapboxCompatibilityGlobal;
  compatibilityGlobal.mapboxPrimaryInstance = map;
  compatibilityGlobal.mapbox3dInstance = map;
}

let pageLoadSettled = false;
let homeRuntimeReady = false;
let onboardingRevealScheduled = false;

function maybeRevealPublicOnboarding(): void {
  if (!pageLoadSettled || !homeRuntimeReady || onboardingRevealScheduled)
    return;
  onboardingRevealScheduled = true;
  window.setTimeout(() => {
    publicOnboarding.showIfNeeded();
  }, SPLASH_FADE_MS);
}

function settlePageLoad(): void {
  window.setTimeout(() => {
    document.getElementById("loading-overlay")?.classList.add("fade-out");
    pageLoadSettled = true;
    maybeRevealPublicOnboarding();
  }, SPLASH_VISIBLE_MS);
}

if (document.readyState === "complete") {
  settlePageLoad();
} else {
  window.addEventListener("load", settlePageLoad, { once: true });
}

const developmentEnvironment = Object.freeze({
  VITE_MAPBOX_ACCESS_TOKEN: "development-only-token",
  VITE_MAPBOX_CONTAINER_ID: "map",
  VITE_MAPBOX_STYLE: "development://morro-digital",
  VITE_MAPBOX_INITIAL_ZOOM: String(DISCOVER_HOME_ZOOM),
});

const status = document.getElementById("runtime-status");
const mapContainer = document.getElementById("map");
const tourSelect = document.getElementById("tour-select");
let activeDestination: MorroPublicDestination = morroDeSaoPauloDestination;
let activeRealMap: MapboxGlMapLike | undefined;
const mapStyleReadiness = createMapStyleReadinessTracker();
let activeNavigationRuntimeInstall: BrowserNavigationRuntimeInstall | undefined;
let activeGlobalViewControl: GlobalViewControl | undefined;
let activeCurrentLocationMarker: MapboxGlMarkerLike | undefined;
let activeCurrentLocation: readonly [number, number] | undefined;
let activeDiscoverRecenterCleanup: (() => void) | undefined;
let activeMapLayerCleanup: (() => void) | undefined;
let activeDiscoverPoiMarkers: MapboxGlMarkerLike[] = [];
let activeDiscoverPoiCleanup: (() => void) | undefined;

installTouristExperienceSnapshotCapture({
  document,
  window,
  getExploreState: () => application.exploreLocations.getState(),
  getMap: () => activeRealMap,
});

function clearBrowserNavigationRuntime(): void {
  activeDiscoverRecenterCleanup?.();
  activeDiscoverRecenterCleanup = undefined;
  activeMapLayerCleanup?.();
  activeMapLayerCleanup = undefined;
  activeDiscoverPoiCleanup?.();
  activeDiscoverPoiCleanup = undefined;
  for (const marker of activeDiscoverPoiMarkers) marker.remove();
  activeDiscoverPoiMarkers = [];
  activeCurrentLocationMarker?.remove();
  activeCurrentLocationMarker = undefined;
  activeCurrentLocation = undefined;
  mapContainer?.removeAttribute("data-current-location");
  mapContainer?.removeAttribute("data-geolocation-state");
  activeGlobalViewControl?.destroy();
  activeGlobalViewControl = undefined;
  activeNavigationRuntimeInstall?.destroy();
  activeNavigationRuntimeInstall = undefined;
}

function presentCurrentLocation(
  map: MapboxGlMapLike,
  sdk: MapboxGlModuleLike,
  longitude: number,
  latitude: number,
  openPopup = false,
): void {
  if (activeRealMap !== map) return;
  activeCurrentLocationMarker?.remove();
  const element = document.createElement("div");
  element.className = "md-current-location-marker";
  element.setAttribute("aria-hidden", "true");
  activeCurrentLocation = Object.freeze([longitude, latitude]);
  const marker = new sdk.Marker({ element, anchor: "center" }).setLngLat([
    longitude,
    latitude,
  ]);
  if (sdk.Popup && marker.setPopup) {
    marker.setPopup(
      new sdk.Popup({ closeButton: false }).setText("Você está aqui"),
    );
  }
  activeCurrentLocationMarker = marker.addTo(map);
  if (openPopup) activeCurrentLocationMarker.togglePopup?.();
  mapContainer?.setAttribute("data-current-location", "visible");
  mapContainer?.setAttribute("data-geolocation-state", "granted");
}

function installDiscoverPoiMarkers(
  map: MapboxGlMapLike,
  sdk: MapboxGlModuleLike,
): () => void {
  const markerModels = discoverInitialMarkers();
  const entries = markerModels.flatMap((markerModel) => {
    const element = createV1ExploreMarkerElement({
      id: markerModel.id,
      ...(markerModel.label ? { label: markerModel.label } : {}),
    });
    if (!element) return [];
    element.dataset.discoverInitialPoi = "true";
    const marker = new sdk.Marker({ element, anchor: "center" }).setLngLat([
      markerModel.position.longitude,
      markerModel.position.latitude,
    ]);
    return [{ marker, element, mounted: false }];
  });

  activeDiscoverPoiMarkers = entries.map(({ marker }) => marker);
  mapContainer?.setAttribute(
    "data-discover-poi-count",
    String(activeDiscoverPoiMarkers.length),
  );

  const syncVisibility = (): void => {
    const markerCount = Number(mapContainer?.dataset.mapMarkerCount ?? "0");
    const exploreCategory = mapContainer?.dataset.exploreCategory?.trim() ?? "";
    const tourState = mapContainer?.dataset.tourState ?? "idle";
    const shouldShow =
      document.body.dataset.mdMode === "discover" &&
      markerCount === 0 &&
      exploreCategory.length === 0 &&
      tourState === "idle";
    for (const entry of entries) {
      if (shouldShow && !entry.mounted) {
        entry.marker.addTo(map);
        entry.mounted = true;
      } else if (!shouldShow && entry.mounted) {
        entry.marker.remove();
        entry.mounted = false;
      }
      entry.element.hidden = !shouldShow;
      entry.element.setAttribute("aria-hidden", String(!shouldShow));
    }
  };

  const onExploreStateChanged = (): void => syncVisibility();
  const visibilityObserver = new MutationObserver(syncVisibility);
  if (mapContainer) {
    visibilityObserver.observe(mapContainer, {
      attributes: true,
      attributeFilter: [
        "data-map-marker-count",
        "data-explore-category",
        "data-tour-state",
      ],
    });
  }
  visibilityObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-mode"],
  });
  document.addEventListener(
    "morro:explore-state-changed",
    onExploreStateChanged,
  );
  syncVisibility();

  return () => {
    visibilityObserver.disconnect();
    document.removeEventListener(
      "morro:explore-state-changed",
      onExploreStateChanged,
    );
    for (const { marker } of entries) marker.remove();
    if (activeDiscoverPoiMarkers.length === entries.length) {
      activeDiscoverPoiMarkers = [];
    }
    mapContainer?.removeAttribute("data-discover-poi-count");
  };
}

async function installGrantedCurrentLocationMarker(
  map: MapboxGlMapLike,
  sdk: MapboxGlModuleLike,
): Promise<void> {
  const permissions = window.navigator.permissions;
  const geolocation = window.navigator.geolocation;
  if (!permissions || !geolocation) {
    mapContainer?.setAttribute("data-geolocation-state", "unavailable");
    return;
  }

  let permission: PermissionStatus;
  try {
    permission = await permissions.query({ name: "geolocation" });
  } catch {
    mapContainer?.setAttribute("data-geolocation-state", "unknown");
    return;
  }
  mapContainer?.setAttribute("data-geolocation-state", permission.state);
  if (permission.state !== "granted") return;

  geolocation.getCurrentPosition(
    (position) =>
      presentCurrentLocation(
        map,
        sdk,
        position.coords.longitude,
        position.coords.latitude,
      ),
    (error) => {
      mapContainer?.removeAttribute("data-current-location");
      mapContainer?.setAttribute(
        "data-geolocation-state",
        error.code === 1 ? "denied" : "error",
      );
    },
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 },
  );
}

function discoverCameraPadding(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const dock = document.getElementById("unified-assistant-dock");
  const dockHeight = Math.max(0, dock?.offsetHeight ?? 0);
  const viewportHeight = Math.max(
    320,
    window.innerHeight || document.documentElement.clientHeight,
  );
  return {
    top: 72,
    bottom: Math.min(
      Math.max(120, viewportHeight * 0.58),
      Math.max(120, dockHeight + 24),
    ),
    left: 24,
    right: 24,
  };
}

function installMapLayerToggle(map: MapboxGlMapLike): () => void {
  const button = document.getElementById("toggle-map-layer");
  const mapElement = document.getElementById("map");
  if (!(button instanceof HTMLButtonElement)) return () => undefined;

  const styleMap = map as MapboxGlMapLike & {
    setStyle?: (style: string) => void;
  };
  const canSetStyle = typeof styleMap.setStyle === "function";
  let satellite = false;
  let destroyed = false;

  const render = (): void => {
    button.classList.toggle("active", satellite);
    button.setAttribute("aria-pressed", String(satellite));
    button.title = satellite ? "Usar mapa padrão" : "Usar mapa de satélite";
    button.setAttribute(
      "aria-label",
      satellite ? "Alterar para mapa padrão" : "Alterar para mapa de satélite",
    );
    mapElement?.setAttribute(
      "data-map-layer",
      satellite ? "satellite" : "standard",
    );
  };

  const onClick = (): void => {
    if (destroyed || !canSetStyle) return;
    satellite = !satellite;
    render();
    styleMap.setStyle?.(
      satellite ? DISCOVER_SATELLITE_MAP_STYLE : DISCOVER_DEFAULT_MAP_STYLE,
    );
  };

  button.disabled = !canSetStyle;
  button.setAttribute("aria-disabled", String(!canSetStyle));
  render();
  button.addEventListener("click", onClick);

  return () => {
    if (destroyed) return;
    destroyed = true;
    button.removeEventListener("click", onClick);
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  };
}

function installDiscoverRecenterControl(
  map: MapboxGlMapLike,
  sdk: MapboxGlModuleLike,
): () => void {
  const button = document.getElementById("recenter-map-control");
  if (!(button instanceof HTMLButtonElement)) return () => undefined;
  const cameraMap = map as MapboxGlMapLike & {
    easeTo?: (options: {
      center: [number, number];
      zoom: number;
      pitch?: number;
      bearing?: number;
      duration?: number;
      essential?: boolean;
      padding?: { top: number; bottom: number; left: number; right: number };
    }) => void;
  };
  const moveCamera = (
    center: readonly [number, number],
    zoom: number,
  ): void => {
    if (cameraMap.easeTo) {
      cameraMap.easeTo({
        center: [...center],
        zoom,
        pitch: 0,
        bearing: 0,
        duration: 650,
        essential: true,
        padding: discoverCameraPadding(),
      });
    } else {
      cameraMap.setCenter([...center]);
      cameraMap.setZoom?.(zoom);
    }
    document.dispatchEvent(new Event("morro:map-camera-flattened"));
  };
  const onClick = (): void => {
    if (activeCurrentLocation) {
      presentCurrentLocation(
        map,
        sdk,
        activeCurrentLocation[0],
        activeCurrentLocation[1],
        true,
      );
      moveCamera(activeCurrentLocation, Math.max(DISCOVER_HOME_ZOOM, 15.5));
      return;
    }
    const geolocation = window.navigator.geolocation;
    if (!geolocation) {
      mapContainer?.setAttribute("data-geolocation-state", "unavailable");
      return;
    }
    button.setAttribute("aria-busy", "true");
    geolocation.getCurrentPosition(
      (position) => {
        button.removeAttribute("aria-busy");
        presentCurrentLocation(
          map,
          sdk,
          position.coords.longitude,
          position.coords.latitude,
          true,
        );
        moveCamera(
          [position.coords.longitude, position.coords.latitude],
          Math.max(DISCOVER_HOME_ZOOM, 15.5),
        );
      },
      (error) => {
        button.removeAttribute("aria-busy");
        mapContainer?.setAttribute(
          "data-geolocation-state",
          error.code === 1 ? "denied" : "error",
        );
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 8_000 },
    );
  };
  button.addEventListener("click", onClick);
  return () => button.removeEventListener("click", onClick);
}

let runtimeStatusDescriptor: RuntimeStatusDescriptor = Object.freeze({
  kind: "initializing",
});

function renderRuntimeAccessibility(): void {
  applyRuntimeAccessibilityPresentation(document);
  if (status?.dataset.statusOwner === "explore") return;
  if (status) {
    status.dataset.statusOwner = "runtime";
    status.textContent = formatRuntimeStatus(
      runtimeStatusDescriptor,
      document.documentElement.lang,
    );
  }
}

function updateStatus(descriptor: RuntimeStatusDescriptor): void {
  runtimeStatusDescriptor = Object.freeze(descriptor);
  if (status) status.dataset.statusOwner = "runtime";
  renderRuntimeAccessibility();
}

const onRuntimeStatusRefresh = (): void => {
  if (status) status.dataset.statusOwner = "runtime";
  renderRuntimeAccessibility();
};
document.addEventListener(
  "morro:runtime-status-refresh",
  onRuntimeStatusRefresh,
);

const runtimeAccessibilityLocaleObserver = new MutationObserver(() => {
  renderRuntimeAccessibility();
});
runtimeAccessibilityLocaleObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"],
});
renderRuntimeAccessibility();

function createTourMarkerElement(input: {
  readonly id: string;
  readonly label?: string;
}): HTMLElement | undefined {
  const separatorIndex = input.id.indexOf(":");
  if (separatorIndex <= 0) return undefined;

  const tourId = input.id.slice(0, separatorIndex);
  const stopId = input.id.slice(separatorIndex + 1);
  const tour = getMorroTourById(tourId);
  const stopIndex = tour?.stops.findIndex((stop) => stop.id === stopId) ?? -1;
  if (!tour || stopIndex < 0) return undefined;

  const stop = tour.stops[stopIndex];
  if (!stop) return undefined;

  const isFirst = stopIndex === 0;
  const isLast = stopIndex === tour.stops.length - 1;
  const element = document.createElement("div");
  element.className = "tour-stop-marker";
  element.dataset.stopIndex = String(stopIndex);
  element.dataset.tourId = tourId;
  element.dataset.stopId = stopId;
  element.setAttribute(
    "aria-label",
    localizedTourStopLabel(tourId, stopId, document.documentElement.lang) ??
      input.label ??
      stop.title,
  );
  element.style.cursor = "pointer";
  element.style.zIndex = "10";

  const pin = document.createElement("div");
  pin.className = `tour-stop-pin${
    isFirst ? " tour-stop-start" : isLast ? " tour-stop-end" : ""
  }`;
  pin.style.width = "38px";
  pin.style.height = "38px";
  pin.style.borderRadius = "50% 50% 50% 0";
  pin.style.transform = "rotate(-45deg)";
  pin.style.background = isFirst
    ? "linear-gradient(135deg, #10b981, #059669)"
    : isLast
      ? "linear-gradient(135deg, #f59e0b, #d97706)"
      : "linear-gradient(135deg, #06b6d4, #0891b2)";
  pin.style.border = "3px solid white";
  pin.style.boxShadow = isFirst
    ? "0 3px 12px rgba(16, 185, 129, 0.5), 0 1px 4px rgba(0,0,0,0.3)"
    : isLast
      ? "0 3px 12px rgba(245, 158, 11, 0.5), 0 1px 4px rgba(0,0,0,0.3)"
      : "0 3px 12px rgba(6, 182, 212, 0.5), 0 1px 4px rgba(0,0,0,0.3)";
  pin.style.display = "flex";
  pin.style.alignItems = "center";
  pin.style.justifyContent = "center";
  pin.style.position = "relative";

  const number = document.createElement("span");
  number.className = "tour-stop-number";
  number.textContent = String(stop.order);
  number.style.transform = "rotate(45deg)";
  number.style.fontSize = "13px";
  number.style.fontWeight = "700";
  number.style.color = "white";
  number.style.lineHeight = "1";
  number.style.display = "block";

  pin.appendChild(number);
  element.appendChild(pin);
  return element;
}

function onTourMarkerClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const marker = target.closest<HTMLElement>(".tour-stop-marker");
  if (!marker) return;

  const tourId = marker.dataset.tourId;
  const stopId = marker.dataset.stopId;
  if (!tourId || !stopId) return;

  document.dispatchEvent(
    new CustomEvent("morro:tour-stop-requested", {
      detail: Object.freeze({ tourId, stopId }),
    }),
  );
}

document.addEventListener("click", onTourMarkerClick);

function clearTourRoute(map: MapboxGlMapLike): void {
  if (map.getLayer?.(TOUR_ROUTE_LAYER)) map.removeLayer?.(TOUR_ROUTE_LAYER);
  if (map.getLayer?.(TOUR_ROUTE_OUTLINE)) map.removeLayer?.(TOUR_ROUTE_OUTLINE);
  if (map.getSource?.(TOUR_ROUTE_SOURCE)) map.removeSource?.(TOUR_ROUTE_SOURCE);
}

function routeBounds(
  tour: TourRouteContract,
): [[number, number], [number, number]] {
  const longitudes = tour.stops.map((stop) => stop.position.longitude);
  const latitudes = tour.stops.map((stop) => stop.position.latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

async function fitTourBoundsAndWait(
  map: MapboxGlMapLike,
  tour: TourRouteContract,
): Promise<void> {
  if (!map.fitBounds) return;

  const options = {
    padding: { top: 120, bottom: 260, left: 60, right: 60 },
    pitch: 50,
    bearing: 0,
    duration: TOUR_CAMERA_DURATION_MS,
    essential: true,
  } as const;

  if (!map.once) {
    map.fitBounds(routeBounds(tour), options);
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, TOUR_CAMERA_TIMEOUT_MS);
    map.once?.("moveend", finish);
    map.fitBounds?.(routeBounds(tour), options);
  });
}

async function presentTourOnRealMap(tourId: string): Promise<void> {
  const map = activeRealMap;
  const tour = getMorroTourById(tourId);
  if (!map || !tour) return;
  if (!map.addSource || !map.addLayer || !map.fitBounds) return;

  await mapStyleReadiness.waitUntilReady(map);
  clearTourRoute(map);

  const coordinates = tour.stops.map(
    (stop) =>
      [stop.position.longitude, stop.position.latitude] as [number, number],
  );

  map.addSource(TOUR_ROUTE_SOURCE, {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates,
      },
    },
  });
  map.addLayer({
    id: TOUR_ROUTE_OUTLINE,
    type: "line",
    source: TOUR_ROUTE_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#0f4c81",
      "line-width": 9,
      "line-opacity": 0.35,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: TOUR_ROUTE_LAYER,
    type: "line",
    source: TOUR_ROUTE_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#06b6d4",
      "line-width": 5,
      "line-opacity": 0.9,
      "line-dasharray": [2, 1.5],
    },
  });
  await fitTourBoundsAndWait(map, tour);
}

function createFallbackMapProvider(): ResolvedMapProvider {
  if (hasLeafletCompatibilitySdk(window)) {
    return Object.freeze({
      sdk: createLeafletCompatibilitySdk(window, {
        initialCenter: [
          activeDestination.center.longitude,
          activeDestination.center.latitude,
        ],
        initialZoom: DISCOVER_HOME_ZOOM,
      }),
      environment: developmentEnvironment,
      mode: "leaflet" as const,
    });
  }

  return Object.freeze({
    sdk: createDevelopmentMapboxSdk(document),
    environment: developmentEnvironment,
    mode: "development" as const,
  });
}

function hasRealMapboxToken(
  environment?: RuntimeEnvironment,
): environment is RuntimeEnvironment {
  return Boolean(environment?.VITE_MAPBOX_ACCESS_TOKEN?.trim());
}

function normalizeRealMapboxEnvironment(
  environment: RuntimeEnvironment,
): RuntimeEnvironment {
  return Object.freeze({
    ...environment,
    VITE_MAPBOX_CONTAINER_ID:
      environment.VITE_MAPBOX_CONTAINER_ID?.trim() || "map",
    VITE_MAPBOX_STYLE: DISCOVER_DEFAULT_MAP_STYLE,
    VITE_MAPBOX_INITIAL_ZOOM:
      environment.VITE_MAPBOX_INITIAL_ZOOM?.trim() ||
      String(DISCOVER_HOME_ZOOM),
  });
}

async function resolveMapProvider(): Promise<ResolvedMapProvider> {
  const runtimeEnvironment = (
    globalThis as typeof globalThis & MorroRuntimeGlobal
  ).__MORRO_RUNTIME_ENV__;

  if (!hasRealMapboxToken(runtimeEnvironment)) {
    return createFallbackMapProvider();
  }

  try {
    const sdk = await loadMapboxGlSdk({ document, window });
    return Object.freeze({
      sdk,
      environment: normalizeRealMapboxEnvironment(runtimeEnvironment),
      mode: "real" as const,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    updateStatus({
      kind: "map-fallback",
      mode: "using",
      ...(detail ? { detail } : {}),
    });
    mapContainer?.setAttribute("data-map-fallback", "leaflet");
    return createFallbackMapProvider();
  }
}

function prepareMapContainerForFallback(): void {
  clearBrowserNavigationRuntime();
  activeRealMap = undefined;
  setV1MapboxCompatibilityAliases(undefined);
  if (!mapContainer) return;
  mapContainer.replaceChildren();
  mapContainer.classList.remove("mapboxgl-map");
  mapContainer.removeAttribute("style");
  mapContainer.removeAttribute("aria-busy");
  mapContainer.setAttribute("data-map-fallback", "leaflet");
}

async function startBrowserWithProvider(provider: ResolvedMapProvider) {
  mapContainer?.setAttribute("data-map-mode", provider.mode);
  mapContainer?.setAttribute(
    "data-map-provider",
    provider.mode === "real" ? "mapbox" : provider.mode,
  );

  try {
    return await startMorroDigitalBrowser({
      sdk: provider.sdk,
      environment: provider.environment,
      document,
      createMarkerElement: createTourMarkerElement,
      ...(provider.mode === "real"
        ? {
            onMapCreated: (map: MapboxGlMapLike) => {
              clearBrowserNavigationRuntime();
              activeRealMap = map;
              activeDiscoverPoiCleanup = installDiscoverPoiMarkers(
                map,
                provider.sdk,
              );
              map.setCenter([
                activeDestination.center.longitude,
                activeDestination.center.latitude,
              ]);
              map.setZoom?.(DISCOVER_HOME_ZOOM);
              mapStyleReadiness.observe(map);
              setV1MapboxCompatibilityAliases(map);
              activeGlobalViewControl = installGlobalViewControl({
                document,
                map,
                homeCenter: [
                  activeDestination.center.longitude,
                  activeDestination.center.latitude,
                ],
                homeZoom: DISCOVER_HOME_ZOOM,
              });
              activeMapLayerCleanup = installMapLayerToggle(map);
              activeDiscoverRecenterCleanup = installDiscoverRecenterControl(
                map,
                provider.sdk,
              );
              activeNavigationRuntimeInstall = installBrowserNavigationRuntime({
                map,
                sdk: provider.sdk,
                document,
              });
              void installGrantedCurrentLocationMarker(map, provider.sdk);
            },
          }
        : {}),
    });
  } catch (error) {
    if (provider.mode !== "real") throw error;

    const detail = error instanceof Error ? error.message : undefined;
    updateStatus({
      kind: "map-fallback",
      mode: "restoring",
      ...(detail ? { detail } : {}),
    });
    prepareMapContainerForFallback();

    const fallbackProvider = createFallbackMapProvider();
    mapContainer?.setAttribute("data-map-mode", fallbackProvider.mode);
    mapContainer?.setAttribute("data-map-provider", fallbackProvider.mode);

    return await startMorroDigitalBrowser({
      sdk: fallbackProvider.sdk,
      environment: fallbackProvider.environment,
      document,
      createMarkerElement: createTourMarkerElement,
      onMapCreated: (map: MapboxGlMapLike) => {
        activeDiscoverPoiCleanup = installDiscoverPoiMarkers(
          map,
          fallbackProvider.sdk,
        );
      },
    });
  }
}

async function start(): Promise<void> {
  const resolvedDestination = await loadPublicDestination();
  activeDestination = resolvedDestination.destination;
  document.documentElement.dataset.destinationSource =
    resolvedDestination.source;
  document.documentElement.dataset.destinationId = activeDestination.id;
  const provider = await resolveMapProvider();
  const result = await startBrowserWithProvider(provider);
  application.exploreLocations.setGeospatialEngine(result.geospatialEngine);
  recordMorroStartupMetric(document, performance, "map");

  mapContainer?.removeAttribute("data-active-tour");
  mapContainer?.setAttribute("data-tour-state", "idle");
  mapContainer?.setAttribute("data-home-state", "ready");
  mapContainer?.setAttribute("data-map-marker-count", "0");
  mapContainer?.setAttribute(
    "data-discover-poi-count",
    String(activeDiscoverPoiMarkers.length),
  );
  const providerId = result.geospatialEngine?.providerId;
  updateStatus({
    kind: "runtime-ready",
    modules: result.startedModules,
    ...(providerId ? { providerId } : {}),
  });

  await restoreTouristExperienceSnapshot({
    document,
    window,
    ...(activeRealMap ? { map: activeRealMap } : {}),
    restorePlace: (place, category) =>
      application.exploreLocations.execute({
        type: "select_place",
        place,
        ...(category ? { category } : {}),
      }),
    restoreCategory: (category) =>
      application.exploreLocations.execute({ type: "open_category", category }),
  });

  homeRuntimeReady = true;
  maybeRevealPublicOnboarding();

  if (!(tourSelect instanceof HTMLSelectElement) || !result.geospatialEngine) {
    return;
  }

  const controller = createMorroTourSelectionController({
    engine: result.geospatialEngine,
    events: result.runtime.events,
    initialTourId: null,
  });
  let tourSelectionGeneration = 0;

  document.addEventListener("morro:tour-selection-reset", () => {
    tourSelectionGeneration += 1;
    controller.resetSelection();
    tourSelect.disabled = false;
    mapContainer?.removeAttribute("aria-busy");
  });

  tourSelect.selectedIndex = -1;
  tourSelect.disabled = false;

  tourSelect.addEventListener("change", () => {
    const requestedTourId = tourSelect.value;
    if (!requestedTourId || !getMorroTourById(requestedTourId)) {
      tourSelect.selectedIndex = -1;
      return;
    }

    const selectionGeneration = ++tourSelectionGeneration;
    tourSelect.disabled = true;
    mapContainer?.setAttribute("aria-busy", "true");
    mapContainer?.setAttribute("data-tour-state", "switching");
    updateStatus({ kind: "tour-switching" });

    void controller
      .selectTour(requestedTourId)
      .then(async (selection) => {
        if (selectionGeneration !== tourSelectionGeneration) return;
        await presentTourOnRealMap(selection.activeTourId);
        if (selectionGeneration !== tourSelectionGeneration) return;
        mapContainer?.setAttribute(
          "data-map-marker-count",
          String(selection.markerCount),
        );
        mapContainer?.setAttribute("data-active-tour", selection.activeTourId);
        mapContainer?.setAttribute("data-tour-state", "ready");
        updateStatus({
          kind: "tour-ready",
          tourId: selection.activeTourId,
          markerCount: selection.markerCount,
        });
      })
      .catch((error: unknown) => {
        if (selectionGeneration !== tourSelectionGeneration) return;
        const activeTourId = controller.activeTourId;
        if (activeTourId) {
          tourSelect.value = activeTourId;
          mapContainer?.setAttribute("data-active-tour", activeTourId);
        } else {
          tourSelect.selectedIndex = -1;
          mapContainer?.removeAttribute("data-active-tour");
          mapContainer?.setAttribute("data-map-marker-count", "0");
        }
        mapContainer?.setAttribute("data-tour-state", "error");
        const detail = error instanceof Error ? error.message : undefined;
        updateStatus({
          kind: "tour-error",
          ...(detail ? { detail } : {}),
        });
      })
      .finally(() => {
        if (selectionGeneration !== tourSelectionGeneration) return;
        tourSelect.disabled = false;
        mapContainer?.removeAttribute("aria-busy");
      });
  });
}

void start().catch((error: unknown) => {
  application.exploreLocations.setGeospatialEngine(undefined);
  const detail = error instanceof Error ? error.message : undefined;
  updateStatus({
    kind: "runtime-error",
    ...(detail ? { detail } : {}),
  });
  mapContainer?.setAttribute("data-map-state", "error");
});
