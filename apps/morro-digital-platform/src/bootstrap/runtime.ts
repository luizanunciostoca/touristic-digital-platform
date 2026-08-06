import {
  createPlatformRuntime,
  EventBus,
  ModuleRegistry,
  type PlatformModule,
  type PlatformRuntime,
} from "@touristic/core";
import type { GeospatialEngine, MapMarker } from "@touristic/geospatial";
import { morroDeSaoPauloDestination } from "../config/destination.js";

const geospatialModule: PlatformModule = Object.freeze({
  id: "geospatial",
  version: "0.1.0",
  enabled: true,
});

const marketplaceModule: PlatformModule = Object.freeze({
  id: "marketplace",
  version: "0.1.0",
  dependencies: ["geospatial"],
  enabled: true,
});

export type GeospatialInitializer = (
  events: EventBus,
) => Promise<GeospatialEngine>;

export interface BootstrapMorroDigitalOptions {
  readonly events?: EventBus;
  readonly initializeGeospatial?: GeospatialInitializer;
  readonly initialMarkers?: readonly MapMarker[];
}

export interface BootstrapResult {
  readonly runtime: PlatformRuntime;
  readonly startedModules: readonly string[];
  readonly geospatialEngine?: GeospatialEngine;
  readonly loadedMarkerCount: number;
}

function describeMarkerError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown marker loading error.";
}

async function cleanupGeospatialEngine(
  engine: GeospatialEngine,
): Promise<void> {
  try {
    await engine.destroy();
  } catch {
    return;
  }
}

async function publishMarkerFailure(
  events: EventBus,
  markers: readonly MapMarker[],
  error: unknown,
): Promise<void> {
  try {
    await events.publish(
      "MapMarkersLoadFailed",
      Object.freeze({
        destinationId: morroDeSaoPauloDestination.id,
        markerIds: Object.freeze(markers.map((marker) => marker.id)),
        reason: describeMarkerError(error),
      }),
    );
  } catch {
    return;
  }
}

async function loadInitialMarkers(
  engine: GeospatialEngine,
  events: EventBus,
  markers: readonly MapMarker[],
): Promise<number> {
  if (markers.length === 0) return 0;

  try {
    await engine.addMarkers(markers);
    await events.publish(
      "MapMarkersLoaded",
      Object.freeze({
        destinationId: morroDeSaoPauloDestination.id,
        count: markers.length,
        markerIds: Object.freeze(markers.map((marker) => marker.id)),
      }),
    );
    return markers.length;
  } catch (error) {
    await cleanupGeospatialEngine(engine);
    await publishMarkerFailure(events, markers, error);
    throw error;
  }
}

export async function bootstrapMorroDigital(
  options: BootstrapMorroDigitalOptions = {},
): Promise<BootstrapResult> {
  const registry = new ModuleRegistry();
  registry.register(geospatialModule);
  registry.register(marketplaceModule);

  const events = options.events ?? new EventBus();
  const runtime = createPlatformRuntime({
    destination: {
      id: morroDeSaoPauloDestination.id,
      name: morroDeSaoPauloDestination.name,
      locale: "pt-BR",
      enabledModules: ["geospatial", "marketplace"],
    },
    registry,
    events,
  });

  await runtime.events.publish("DestinationLoaded", {
    destinationId: runtime.destination.id,
    modules: runtime.modules.map((module) => module.id),
  });

  const geospatialEngine = options.initializeGeospatial
    ? await options.initializeGeospatial(runtime.events)
    : undefined;
  const initialMarkers = options.initialMarkers ?? [];

  if (initialMarkers.length > 0 && !geospatialEngine) {
    throw new Error("Initial map markers require a geospatial initializer.");
  }

  const loadedMarkerCount = geospatialEngine
    ? await loadInitialMarkers(geospatialEngine, runtime.events, initialMarkers)
    : 0;

  return Object.freeze({
    runtime,
    startedModules: Object.freeze(runtime.modules.map((module) => module.id)),
    ...(geospatialEngine ? { geospatialEngine } : {}),
    loadedMarkerCount,
  });
}
