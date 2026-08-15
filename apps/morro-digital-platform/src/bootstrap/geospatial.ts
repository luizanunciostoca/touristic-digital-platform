import type { EventBus } from "@touristic/core";
import {
  createGeospatialEngine,
  createMapboxAdapter,
  createMapboxGlDriver,
  type GeospatialEngine,
  type MapboxGlMapLike,
  type MapboxGlModuleLike,
} from "@touristic/geospatial";
import { morroDeSaoPauloDestination } from "../config/destination.js";
import type { MorroMapboxRuntimeConfig } from "../config/mapbox-runtime.js";

export interface MorroMapboxBootstrapOptions extends MorroMapboxRuntimeConfig {
  readonly sdk: MapboxGlModuleLike;
  readonly createMarkerElement?: (input: {
    readonly id: string;
    readonly label?: string;
  }) => HTMLElement | undefined;
  readonly onMapCreated?: (map: MapboxGlMapLike) => void;
}

export interface MorroGeospatialBootstrapResult {
  readonly engine: GeospatialEngine;
  readonly providerId: string;
}

const V1_MAPBOX_INITIAL_CENTER = Object.freeze({
  latitude: -13.4,
  longitude: -38.9159969,
});

const V1_MAPBOX_VISUAL_OPTIONS = Object.freeze({
  pitch: 0,
  bearing: 0,
  antialias: true,
  attributionControl: false,
  minZoom: 0,
  maxZoom: 20,
  projection: "globe",
});

function describeInitializationError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown map initialization error.";
}

async function cleanupAfterFailure(engine: GeospatialEngine): Promise<void> {
  try {
    await engine.destroy();
  } catch {
    return;
  }
}

async function publishInitializationFailure(
  events: EventBus,
  payload: Readonly<{
    destinationId: string;
    providerId: string;
    containerId: string;
  }>,
  error: unknown,
): Promise<void> {
  try {
    await events.publish(
      "MapInitializationFailed",
      Object.freeze({
        ...payload,
        reason: describeInitializationError(error),
      }),
      { destinationId: morroDeSaoPauloDestination.id },
    );
  } catch {
    return;
  }
}

export async function initializeMorroGeospatial(
  options: MorroMapboxBootstrapOptions,
  events: EventBus,
): Promise<MorroGeospatialBootstrapResult> {
  const driver = createMapboxGlDriver({
    sdk: options.sdk,
    accessToken: options.accessToken,
    mapOptions: V1_MAPBOX_VISUAL_OPTIONS,
    ...(options.createMarkerElement
      ? { createMarkerElement: options.createMarkerElement }
      : {}),
    ...(options.onMapCreated ? { onMapCreated: options.onMapCreated } : {}),
  });
  const adapter = createMapboxAdapter({
    driver,
    style: options.style,
  });
  const engine = createGeospatialEngine(adapter);
  const payload = Object.freeze({
    destinationId: morroDeSaoPauloDestination.id,
    providerId: engine.providerId,
    containerId: options.containerId,
  });
  const eventMetadata = Object.freeze({
    destinationId: morroDeSaoPauloDestination.id,
  });

  try {
    await engine.initialize({
      containerId: options.containerId,
      center: V1_MAPBOX_INITIAL_CENTER,
      zoom: options.zoom,
    });

    await events.publish("MapInitialized", payload, eventMetadata);
    await events.publish("MapReady", payload, eventMetadata);

    return Object.freeze({
      engine,
      providerId: engine.providerId,
    });
  } catch (error) {
    await cleanupAfterFailure(engine);
    await publishInitializationFailure(events, payload, error);
    throw error;
  }
}

export function createMorroGeospatialInitializer(
  options: MorroMapboxBootstrapOptions,
): (events: EventBus) => Promise<GeospatialEngine> {
  return async (events) => {
    const result = await initializeMorroGeospatial(options, events);
    return result.engine;
  };
}
