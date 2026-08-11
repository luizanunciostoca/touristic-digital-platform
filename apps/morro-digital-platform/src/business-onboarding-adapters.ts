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
} from "@touristic/business";
import type { Coordinates } from "@touristic/geospatial";
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

export interface BusinessOnboardingAdapterOptions {
  readonly geolocation?: AssistantGeolocationPort;
  readonly fetch?: typeof globalThis.fetch;
  readonly mapboxAccessToken?: string;
}

const businessSearchIndex = createSearchIndex(morroV1SearchCatalog);

function coordinatesFor(
  item: MorroV1SearchCatalogItem,
): Coordinates | null {
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

function createDiscoveryAdapter(): BusinessDiscoveryPort {
  return Object.freeze({
    async searchBusiness(
      query: string,
    ): Promise<readonly BusinessOnboardingSearchMatch[]> {
      return Object.freeze(
        businessSearchIndex.search(query).slice(0, 5).map(toSearchMatch),
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
): BusinessLocationPort {
  return Object.freeze({
    async findExistingLocation(
      businessName: string,
    ): Promise<BusinessOnboardingResolvedLocation | null> {
      const result = businessSearchIndex.search(businessName)[0];
      if (!result) return null;
      const coordinates = coordinatesFor(result.item);
      if (!coordinates) return null;

      return Object.freeze({
        name: result.item.name,
        category: result.item.category,
        coordinates,
        source: "catalog" as const,
      });
    },
    requestDeviceLocation: () => requestDeviceLocation(geolocation),
  });
}

function createAssistantAdapter(
  options: BusinessOnboardingAdapterOptions,
): BusinessAssistantPort {
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
    ): Promise<AssistantDialogResponse & { readonly onboardingLocale: string }> {
      const response = await controller.processUserInput(message);
      return Object.freeze({ ...response, onboardingLocale: locale });
    },
  });
}

export function createBusinessOnboardingAdapters(
  options: BusinessOnboardingAdapterOptions = {},
): BusinessOnboardingPorts {
  return Object.freeze({
    discovery: createDiscoveryAdapter(),
    location: createLocationAdapter(options.geolocation),
    assistant: createAssistantAdapter(options),
  });
}
