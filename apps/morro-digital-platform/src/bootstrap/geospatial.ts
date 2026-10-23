import type { DestinationConfig, EventBus } from "@touristic/core";
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
  readonly destination?: DestinationConfig;
  readonly attributionControl?: boolean;
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
      { destinationId: payload.destinationId },
    );
  } catch {
    return;
  }
}

export async function initializeMorroGeospatial(
  options: MorroMapboxBootstrapOptions,
  events: EventBus,
): Promise<MorroGeospatialBootstrapResult> {
  const destination = options.destination ?? morroDeSaoPauloDestination;
  const driver = createMapboxGlDriver({
    sdk: options.sdk,
    accessToken: options.accessToken,
    mapOptions: {
      ...V1_MAPBOX_VISUAL_OPTIONS,
      attributionControl:
        options.attributionControl ??
        V1_MAPBOX_VISUAL_OPTIONS.attributionControl,
    },
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
    destinationId: destination.id,
    providerId: engine.providerId,
    containerId: options.containerId,
  });
  const eventMetadata = Object.freeze({
    destinationId: destination.id,
  });

  try {
    await engine.initialize({
      containerId: options.containerId,
      center: destination.center,
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

export type DestinationMapState = "loading" | "ready" | "unavailable";

/** Destination-page UI readiness only; shared Morro lifecycle events are unchanged. */
export function createDestinationMapReadiness(
  onState: (state: DestinationMapState) => void,
  timeoutMs = 15_000,
): {
  readonly active: boolean;
  readonly onMapCreated: (map: MapboxGlMapLike) => void;
  readonly fail: () => void;
  readonly dispose: () => void;
} {
  let state: DestinationMapState = "loading";
  let disposed = false;
  let nativeMap: MapboxGlMapLike | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const detach = (): void => {
    clearTimer();
    nativeMap?.off?.("load", onLoad);
    nativeMap?.off?.("error", fail);
    nativeMap = null;
  };
  const fail = (): void => {
    if (disposed || state === "unavailable") return;
    state = "unavailable";
    detach();
    onState(state);
  };
  const onLoad = (): void => {
    if (disposed || state !== "loading") return;
    state = "ready";
    clearTimer();
    nativeMap?.off?.("load", onLoad);
    // Keep observing errors after load so a failed map cannot remain ready.
    onState(state);
  };
  timer = setTimeout(fail, timeoutMs);

  return {
    get active(): boolean {
      return !disposed && state !== "unavailable";
    },
    onMapCreated(map): void {
      if (disposed || state !== "loading" || nativeMap) return;
      if (!map.on || !map.off) {
        fail();
        return;
      }
      nativeMap = map;
      map.on("error", fail);
      map.on("load", onLoad);
    },
    fail,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      detach();
    },
  };
}
