import type { EventBus } from "@touristic/core";
import {
  createGeospatialEngine,
  createMapboxAdapter,
  createMapboxGlDriver,
  type GeospatialEngine,
  type MapboxGlModuleLike,
} from "@touristic/geospatial";
import { morroDeSaoPauloDestination } from "../config/destination.js";
import type { MorroMapboxRuntimeConfig } from "../config/mapbox-runtime.js";

export interface MorroMapboxBootstrapOptions
  extends MorroMapboxRuntimeConfig {
  readonly sdk: MapboxGlModuleLike;
  readonly createMarkerElement?: (input: {
    readonly id: string;
    readonly label?: string;
  }) => HTMLElement | undefined;
}

export interface MorroGeospatialBootstrapResult {
  readonly engine: GeospatialEngine;
  readonly providerId: string;
}

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
    ...(options.createMarkerElement
      ? { createMarkerElement: options.createMarkerElement }
      : {}),
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

  try {
    await engine.initialize({
      containerId: options.containerId,
      center: {
        latitude: morroDeSaoPauloDestination.center.latitude,
        longitude: morroDeSaoPauloDestination.center.longitude,
      },
      zoom: options.zoom,
    });

    await events.publish("MapInitialized", payload);
    await events.publish("MapReady", payload);

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
