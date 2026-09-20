import {
  isOfflineContentSnapshotFresh,
  parseOfflineContentSnapshot,
  type OfflineContentSnapshot,
} from "@touristic/content/public-projection";

export interface ContentSnapshotStorage {
  read(destinationId: string): Promise<OfflineContentSnapshot | null>;
  write(snapshot: OfflineContentSnapshot): Promise<void>;
  clear(destinationId: string): Promise<void>;
}

export type ContentSnapshotLoadResult =
  | Readonly<{
      status: "network" | "cache";
      snapshot: OfflineContentSnapshot;
      stale: false;
    }>
  | Readonly<{
      status: "stale";
      snapshot: OfflineContentSnapshot;
      stale: true;
    }>
  | Readonly<{ status: "unavailable"; stale: true }>;

export interface LoadContentSnapshotOptions {
  readonly destinationId: string;
  readonly now: string;
  readonly storage: ContentSnapshotStorage;
  readonly fetchSnapshot: () => Promise<unknown>;
}

const CACHE_NAME = "morro-digital-content-v1";
const CACHE_KEY_PREFIX = "/__morro_offline/content/";

function normalizedDestinationId(destinationId: string): string {
  return destinationId.trim();
}

function cacheKey(origin: string, destinationId: string): string {
  return new URL(
    `${CACHE_KEY_PREFIX}${encodeURIComponent(destinationId)}.json`,
    origin,
  ).href;
}

export function createBrowserContentSnapshotStorage(
  caches: CacheStorage,
  origin: string,
): ContentSnapshotStorage {
  const normalizedOrigin = new URL(origin).origin;

  return Object.freeze({
    async read(destinationId: string): Promise<OfflineContentSnapshot | null> {
      const normalized = normalizedDestinationId(destinationId);
      if (!normalized) return null;

      const key = cacheKey(normalizedOrigin, normalized);
      try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(key);
        if (!response) return null;

        try {
          const parsed = parseOfflineContentSnapshot(await response.json());
          if (!parsed || parsed.destinationId !== normalized) {
            await cache.delete(key).catch(() => false);
            return null;
          }
          return parsed;
        } catch {
          await cache.delete(key).catch(() => false);
          return null;
        }
      } catch {
        return null;
      }
    },

    async write(snapshot: OfflineContentSnapshot): Promise<void> {
      const parsed = parseOfflineContentSnapshot(snapshot);
      if (!parsed) return;

      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(
          cacheKey(normalizedOrigin, parsed.destinationId),
          new Response(JSON.stringify(parsed), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          }),
        );
      } catch {
        // Browser persistence is best-effort and never runtime authority.
      }
    },

    async clear(destinationId: string): Promise<void> {
      const normalized = normalizedDestinationId(destinationId);
      if (!normalized) return;

      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(cacheKey(normalizedOrigin, normalized));
      } catch {
        // Browser persistence is best-effort and never runtime authority.
      }
    },
  });
}

export async function loadContentSnapshot(
  options: LoadContentSnapshotOptions,
): Promise<ContentSnapshotLoadResult> {
  const destinationId = normalizedDestinationId(options.destinationId);
  if (!destinationId) {
    return Object.freeze({ status: "unavailable", stale: true });
  }

  let cached: OfflineContentSnapshot | null = null;
  try {
    cached = await options.storage.read(destinationId);
  } catch {
    // Custom storage adapters are also fail-soft at the presentation boundary.
  }

  try {
    const networkValue = await options.fetchSnapshot();
    const networkSnapshot = parseOfflineContentSnapshot(networkValue);

    if (
      networkSnapshot &&
      networkSnapshot.destinationId === destinationId &&
      isOfflineContentSnapshotFresh(networkSnapshot, options.now)
    ) {
      try {
        await options.storage.write(networkSnapshot);
      } catch {
        // A successful network read must not fail because persistence is unavailable.
      }
      return Object.freeze({
        status: "network",
        snapshot: networkSnapshot,
        stale: false,
      });
    }
  } catch {
    // Network/provider failure falls through to validated cache.
  }

  if (!cached) {
    return Object.freeze({ status: "unavailable", stale: true });
  }

  if (isOfflineContentSnapshotFresh(cached, options.now)) {
    return Object.freeze({
      status: "cache",
      snapshot: cached,
      stale: false,
    });
  }

  return Object.freeze({
    status: "stale",
    snapshot: cached,
    stale: true,
  });
}
