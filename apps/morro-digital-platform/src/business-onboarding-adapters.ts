import {
  createAssistantContextManager,
  createAssistantDialogController,
  type AssistantDialogResponse,
} from "@touristic/assistant";
import type {
  BusinessAssistantPort,
  BusinessDiscoveryPort,
  BusinessLocationPort,
  BusinessOnboardingPorts,
  BusinessRoutePort,
  BusinessRouteRequest,
  BusinessRouteResult,
} from "@touristic/business/onboarding";
import {
  createMapboxDirectionsRoutingProvider,
  type Coordinates,
} from "@touristic/geospatial";
import {
  createSameOriginRoutingProvider,
  requestRoute,
  type FetchLike as RoutingFetchLike,
  type RouteFeatureCollection,
  type RoutingLanguage,
} from "@touristic/navigation";
import {
  createSearchIndex,
  morroV1SearchCatalog,
  type MorroV1SearchCatalogItem,
  type SearchResult,
} from "@touristic/search";

import {
  createAssistantBrowserDomainHandlers,
  type AssistantGeolocationPort,
} from "./assistant/assistant-domain-adapter.js";

export interface BusinessOnboardingSearchMatch {
  readonly name: string;
  readonly category: string;
  readonly matchType: SearchResult<MorroV1SearchCatalogItem>["matchType"];
  readonly coordinates: Coordinates | null;
}

export interface BusinessOnboardingResolvedLocation {
  readonly name: string;
  readonly category: string;
  readonly coordinates: Coordinates;
  readonly source: "catalog" | "device";
  readonly accuracy?: number;
}

export type BusinessOnboardingAssistantResponse = AssistantDialogResponse & {
  readonly onboardingLocale: string;
};

export interface BusinessOnboardingDiscoveryAdapter extends BusinessDiscoveryPort {
  readonly searchBusiness: (
    query: string,
  ) => Promise<readonly BusinessOnboardingSearchMatch[]>;
}

export interface BusinessOnboardingLocationAdapter extends BusinessLocationPort {
  readonly findExistingLocation: (
    businessName: string,
  ) => Promise<BusinessOnboardingResolvedLocation | null>;
  readonly requestDeviceLocation: () => Promise<BusinessOnboardingResolvedLocation | null>;
}

export interface BusinessOnboardingAssistantAdapter extends BusinessAssistantPort {
  readonly ask: (
    message: string,
    locale: string,
  ) => Promise<BusinessOnboardingAssistantResponse>;
}

export interface BusinessOnboardingRouteAdapter extends BusinessRoutePort {
  readonly showRoute: (
    request: BusinessRouteRequest,
  ) => Promise<BusinessRouteResult>;
}

export interface BusinessOnboardingConcreteAdapters extends BusinessOnboardingPorts {
  readonly discovery: BusinessOnboardingDiscoveryAdapter;
  readonly location: BusinessOnboardingLocationAdapter;
  readonly assistant: BusinessOnboardingAssistantAdapter;
  readonly route: BusinessOnboardingRouteAdapter;
}

export interface BusinessOnboardingAdapterOptions {
  readonly geolocation?: AssistantGeolocationPort;
  readonly fetch?: typeof globalThis.fetch;
  readonly mapboxAccessToken?: string;
  readonly routeTimeoutMs?: number;
}

const businessSearchIndex = createSearchIndex(morroV1SearchCatalog);

function coordinatesFor(item: MorroV1SearchCatalogItem): Coordinates | null {
  if (
    typeof item.latitude !== "number" ||
    !Number.isFinite(item.latitude) ||
    typeof item.longitude !== "number" ||
    !Number.isFinite(item.longitude)
  ) {
    return null;
  }

  return Object.freeze({
    latitude: item.latitude,
    longitude: item.longitude,
  });
}

function toSearchMatch(
  result: SearchResult<MorroV1SearchCatalogItem>,
): BusinessOnboardingSearchMatch {
  return Object.freeze({
    name: result.item.name,
    category: result.item.category,
    matchType: result.matchType,
    coordinates: coordinatesFor(result.item),
  });
}

function createDiscoveryAdapter(): BusinessOnboardingDiscoveryAdapter {
  return Object.freeze({
    searchBusiness(query: string) {
      return Promise.resolve(
        Object.freeze(
          businessSearchIndex.search(query).slice(0, 5).map(toSearchMatch),
        ),
      );
    },
  });
}

function requestDeviceLocation(
  geolocation?: AssistantGeolocationPort,
): Promise<BusinessOnboardingResolvedLocation | null> {
  if (!geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
        resolve(
          Object.freeze({
            name: "device-location",
            category: "device",
            coordinates: Object.freeze({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
            source: "device" as const,
            accuracy: position.coords.accuracy,
          }),
        );
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
  });
}

function createLocationAdapter(
  geolocation?: AssistantGeolocationPort,
): BusinessOnboardingLocationAdapter {
  return Object.freeze({
    findExistingLocation(businessName: string) {
      const result = businessSearchIndex.search(businessName)[0];
      if (!result) return Promise.resolve(null);
      const coordinates = coordinatesFor(result.item);
      if (!coordinates) return Promise.resolve(null);

      return Promise.resolve(
        Object.freeze({
          name: result.item.name,
          category: result.item.category,
          coordinates,
          source: "catalog" as const,
        }),
      );
    },
    requestDeviceLocation: () => requestDeviceLocation(geolocation),
  });
}

function createAssistantAdapter(
  options: BusinessOnboardingAdapterOptions,
): BusinessOnboardingAssistantAdapter {
  const context = createAssistantContextManager();
  const controller = createAssistantDialogController({
    context,
    handlers: createAssistantBrowserDomainHandlers({
      ...(options.geolocation ? { geolocation: options.geolocation } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.mapboxAccessToken
        ? { mapboxAccessToken: options.mapboxAccessToken }
        : {}),
    }),
  });

  return Object.freeze({
    async ask(
      message: string,
      locale: string,
    ): Promise<BusinessOnboardingAssistantResponse> {
      const response = await controller.processUserInput(message);
      return Object.freeze({ ...response, onboardingLocale: locale });
    },
  });
}

function asRoutingFetch(fetchImpl: typeof globalThis.fetch): RoutingFetchLike {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    return {
      ok: response.ok,
      status: response.status,
      json: () => response.json(),
    };
  };
}

function numericProperty(value: unknown, key: "distance" | "duration"): number {
  if (!value || typeof value !== "object") return 0;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : 0;
}

function routeSummary(route: RouteFeatureCollection): {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
} {
  const summary = route.features[0]?.properties?.summary;
  return Object.freeze({
    distanceMeters: numericProperty(summary, "distance"),
    durationSeconds: numericProperty(summary, "duration"),
  });
}

function routingLanguage(value: string | undefined): RoutingLanguage {
  return value === "en" || value === "es" || value === "he" ? value : "pt";
}

function routeFailure(code: string): BusinessRouteResult {
  return Object.freeze({
    success: false,
    code,
    distanceMeters: 0,
    durationSeconds: 0,
    route: null,
    tutorial: true,
    excludeFromBusinessMetrics: true,
  });
}

function routeErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { readonly code?: unknown }).code === "string"
  ) {
    return (error as { readonly code: string }).code;
  }
  return "ROUTING_FAILED";
}

function createRouteAdapter(
  options: BusinessOnboardingAdapterOptions,
): BusinessOnboardingRouteAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const primaryProvider = createSameOriginRoutingProvider({
    fetchImpl: asRoutingFetch(fetchImpl),
  });
  const fallbackProvider = options.mapboxAccessToken
    ? createMapboxDirectionsRoutingProvider({
        token: options.mapboxAccessToken,
      })
    : null;

  return Object.freeze({
    async showRoute(
      request: BusinessRouteRequest,
    ): Promise<BusinessRouteResult> {
      try {
        const route = await requestRoute({
          start: [request.origin.longitude, request.origin.latitude],
          end: [request.destination.longitude, request.destination.latitude],
          profile: "foot-walking",
          language: routingLanguage(request.language),
          timeoutMs: options.routeTimeoutMs ?? 15_000,
          primaryProvider,
          fallbackProvider,
          allowFallback: fallbackProvider !== null,
        });
        const summary = routeSummary(route);
        return Object.freeze({
          success: true,
          code: "ROUTE_VERIFIED",
          ...summary,
          route,
          tutorial: true,
          excludeFromBusinessMetrics: true,
        });
      } catch (error) {
        return routeFailure(routeErrorCode(error));
      }
    },
  });
}

export function createBusinessOnboardingAdapters(
  options: BusinessOnboardingAdapterOptions = {},
): BusinessOnboardingConcreteAdapters {
  return Object.freeze({
    discovery: createDiscoveryAdapter(),
    location: createLocationAdapter(options.geolocation),
    assistant: createAssistantAdapter(options),
    route: createRouteAdapter(options),
  });
}
