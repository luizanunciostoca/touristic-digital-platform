import {
  createGeospatialEngine,
  createMapboxAdapter,
  createMapboxGlDriver,
  type GeospatialEngine,
  type MapboxGlModuleLike,
} from "@touristic/geospatial";
import type { EventBus } from "@touristic/platform-runtime";
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

  await engine.initialize({
    containerId: options.containerId,
    center: {
      latitude: morroDeSaoPauloDestination.center.latitude,
      longitude: morroDeSaoPauloDestination.center.longitude,
    },
    zoom: options.zoom,
  });

  const payload = Object.freeze({
    destinationId: morroDeSaoPauloDestination.id,
    providerId: engine.providerId,
    containerId: options.containerId,
  });

  await events.publish("MapInitialized", payload);
  await events.publish("MapReady", payload);

  return Object.freeze({
    engine,
    providerId: engine.providerId,
  });
}

export function createMorroGeospatialInitializer(
  options: MorroMapboxBootstrapOptions,
): (events: EventBus) => Promise<GeospatialEngine> {
  return async (events) => {
    const result = await initializeMorroGeospatial(options, events);
    return result.engine;
  };
}
