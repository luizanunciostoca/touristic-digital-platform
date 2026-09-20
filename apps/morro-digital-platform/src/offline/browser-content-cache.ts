import {
  isOfflineContentSnapshotFresh,
  parseOfflineContentSnapshot,
  type OfflineContentSnapshot,
} from "@touristic/content/public-projection";

const OFFLINE_CONTENT_CACHE = "morro-digital-content-v1";
const OFFLINE_CONTENT_KEY_PREFIX = "/__morro_offline/content/";

export type OfflineContentCacheReadResult =
  | Readonly<{ status: "hit"; snapshot: OfflineContentSnapshot }>
  | Readonly<{ status: "miss" }>
  | Readonly<{ status: "stale" }>
  | Readonly<{ status: "invalid" }>;

export interface BrowserOfflineContentCache {
  save(snapshot: OfflineContentSnapshot): Promise<void>;
  load(destinationId: string, now: string): Promise<OfflineContentCacheReadResult>;
  remove(destinationId: string): Promise<void>;
}

export interface BrowserOfflineContentCacheOptions {
  readonly caches: CacheStorage;
  readonly origin: string;
}

function normalizedDestinationId(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Offline content destination id is required.");
  }
  return normalized;
}

function cacheKey(origin: string, destinationId: string): string {
  return new URL(
    `${OFFLINE_CONTENT_KEY_PREFIX}${encodeURIComponent(destinationId)}.json`,
    origin,
  ).href;
}

export function createBrowserOfflineContentCache(
  options: BrowserOfflineContentCacheOptions,
): BrowserOfflineContentCache {
  const origin = new URL(options.origin).origin;

  return Object.freeze({
    async save(snapshot: OfflineContentSnapshot): Promise<void> {
      const destinationId = normalizedDestinationId(snapshot.destinationId);
      const parsed = parseOfflineContentSnapshot(snapshot);
      if (!parsed || parsed.destinationId !== destinationId) {
        throw new Error("Offline content snapshot is invalid.");
      }

      const cache = await options.caches.open(OFFLINE_CONTENT_CACHE);
      await cache.put(
        cacheKey(origin, destinationId),
        new Response(JSON.stringify(parsed), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
      );
    },

    async load(
      destinationId: string,
      now: string,
    ): Promise<OfflineContentCacheReadResult> {
      const normalized = normalizedDestinationId(destinationId);
      const key = cacheKey(origin, normalized);
      const cache = await options.caches.open(OFFLINE_CONTENT_CACHE);
      const response = await cache.match(key);
      if (!response) return Object.freeze({ status: "miss" });

      let source: unknown;
      try {
        source = await response.json();
      } catch {
        await cache.delete(key);
        return Object.freeze({ status: "invalid" });
      }

      const snapshot = parseOfflineContentSnapshot(source);
      if (!snapshot || snapshot.destinationId !== normalized) {
        await cache.delete(key);
        return Object.freeze({ status: "invalid" });
      }

      if (!isOfflineContentSnapshotFresh(snapshot, now)) {
        await cache.delete(key);
        return Object.freeze({ status: "stale" });
      }

      return Object.freeze({ status: "hit", snapshot });
    },

    async remove(destinationId: string): Promise<void> {
      const normalized = normalizedDestinationId(destinationId);
      const cache = await options.caches.open(OFFLINE_CONTENT_CACHE);
      await cache.delete(cacheKey(origin, normalized));
    },
  });
}
