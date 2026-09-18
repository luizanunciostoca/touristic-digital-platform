import type { MapboxGlMapLike } from "@touristic/geospatial";

export interface MapStyleReadinessOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface MapStyleReadinessTracker {
  observe(map: MapboxGlMapLike): void;
  waitUntilReady(map: MapboxGlMapLike): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 50;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}

export async function waitForMapStyleReady(
  map: Pick<MapboxGlMapLike, "isStyleLoaded">,
  options: MapStyleReadinessOptions = {},
): Promise<void> {
  const isStyleLoaded = map.isStyleLoaded;
  if (!isStyleLoaded) return;
  if (isStyleLoaded.call(map)) return;

  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const pollIntervalMs = Math.max(
    1,
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  );
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    const remaining = Math.max(0, deadline - now());
    await sleep(Math.min(pollIntervalMs, remaining));
    if (isStyleLoaded.call(map)) return;
  }

  throw new Error(
    "Mapbox style did not become ready before tour presentation.",
  );
}

export function createMapStyleReadinessTracker(
  options: MapStyleReadinessOptions = {},
): MapStyleReadinessTracker {
  const initializedMaps = new WeakSet<MapboxGlMapLike>();

  const markReady = (map: MapboxGlMapLike): void => {
    initializedMaps.add(map);
  };

  return Object.freeze({
    observe(map: MapboxGlMapLike): void {
      if (map.isStyleLoaded?.()) {
        markReady(map);
        return;
      }
      map.once?.("load", () => markReady(map));
    },

    async waitUntilReady(map: MapboxGlMapLike): Promise<void> {
      if (initializedMaps.has(map)) return;
      await waitForMapStyleReady(map, options);
      markReady(map);
    },
  });
}
