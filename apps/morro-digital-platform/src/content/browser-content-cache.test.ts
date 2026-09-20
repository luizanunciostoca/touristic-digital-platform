import { describe, expect, it, vi } from "vitest";

import {
  createOfflineContentSnapshot,
  type OfflineContentSnapshot,
} from "@touristic/content/public-projection";
import {
  createContentDraft,
  transitionContent,
  type ContentDocument,
} from "@touristic/content";

import {
  createBrowserContentSnapshotStorage,
  loadContentSnapshot,
} from "./browser-content-cache.js";

function cacheRequestKey(key: RequestInfo | URL): string {
  if (typeof key === "string") return key;
  if (key instanceof URL) return key.href;
  return key.url;
}

function cacheStorageHarness() {
  const values = new Map<string, Response>();
  const cache = {
    async match(key: RequestInfo | URL) {
      return values.get(cacheRequestKey(key))?.clone();
    },
    async put(key: RequestInfo | URL, response: Response) {
      values.set(cacheRequestKey(key), response.clone());
    },
    async delete(key: RequestInfo | URL) {
      return values.delete(cacheRequestKey(key));
    },
  };

  return {
    values,
    caches: {
      open: vi.fn(async () => cache),
    } as unknown as CacheStorage,
  };
}

function published(kind: ContentDocument["kind"] = "place"): ContentDocument {
  const draft = createContentDraft({
    id: `${kind}-001`,
    destinationId: "morro-de-sao-paulo",
    kind,
    locale: "pt-BR",
    fields: { title: "Conteúdo público" },
    createdAt: "2026-09-20T10:00:00.000Z",
  });
  if (!draft) throw new Error("Expected valid draft fixture.");

  const result = transitionContent(draft, {
    status: "published",
    transitionedAt: "2026-09-20T10:01:00.000Z",
  });
  if (!result) throw new Error("Expected published fixture.");
  return result;
}

function snapshot(
  expiresAt = "2026-09-21T10:00:00.000Z",
): OfflineContentSnapshot {
  const result = createOfflineContentSnapshot([published()], {
    destinationId: "morro-de-sao-paulo",
    generatedAt: "2026-09-20T10:00:00.000Z",
    expiresAt,
  });
  if (!result) throw new Error("Expected valid snapshot fixture.");
  return result;
}

function storageHarness() {
  const harness = cacheStorageHarness();
  return {
    ...harness,
    storage: createBrowserContentSnapshotStorage(
      harness.caches,
      "https://morro.example",
    ),
  };
}

describe("browser content snapshot storage", () => {
  it("round-trips only validated destination-bound snapshots", async () => {
    const { storage } = storageHarness();
    const value = snapshot();

    await storage.write(value);

    await expect(storage.read("morro-de-sao-paulo")).resolves.toEqual(value);
    await expect(storage.read("another-destination")).resolves.toBeNull();
  });

  it("deletes malformed or transaction-authoritative cached JSON", async () => {
    const { storage, values } = storageHarness();
    const key =
      "https://morro.example/__morro_offline/content/morro-de-sao-paulo.json";
    values.set(
      key,
      new Response(
        JSON.stringify({
          ...snapshot(),
          documents: [
            {
              id: "offer-001",
              destinationId: "morro-de-sao-paulo",
              kind: "offer_reference",
              locale: "pt-BR",
              version: 1,
              fields: { label: "Comprar" },
              publishedAt: "2026-09-20T10:01:00.000Z",
            },
          ],
        }),
      ),
    );

    await expect(storage.read("morro-de-sao-paulo")).resolves.toBeNull();
    expect(values.has(key)).toBe(false);
  });
});

describe("content snapshot loading", () => {
  it("prefers a fresh validated network snapshot and persists it", async () => {
    const { storage } = storageHarness();
    const value = snapshot();
    const write = vi.fn((next: OfflineContentSnapshot) => storage.write(next));
    const observedStorage = {
      read: storage.read,
      write,
      clear: storage.clear,
    };

    await expect(
      loadContentSnapshot({
        destinationId: "morro-de-sao-paulo",
        now: "2026-09-20T12:00:00.000Z",
        storage: observedStorage,
        fetchSnapshot: async () => value,
      }),
    ).resolves.toEqual({
      status: "network",
      snapshot: value,
      stale: false,
    });
    expect(write).toHaveBeenCalledWith(value);
  });

  it("falls back to a fresh cache when network is unavailable", async () => {
    const { storage } = storageHarness();
    const value = snapshot();
    await storage.write(value);

    await expect(
      loadContentSnapshot({
        destinationId: "morro-de-sao-paulo",
        now: "2026-09-20T12:00:00.000Z",
        storage,
        fetchSnapshot: async () => {
          throw new Error("offline");
        },
      }),
    ).resolves.toEqual({
      status: "cache",
      snapshot: value,
      stale: false,
    });
  });

  it("surfaces expired cache as stale instead of fresh authority", async () => {
    const { storage } = storageHarness();
    const value = snapshot("2026-09-20T11:00:00.000Z");
    await storage.write(value);

    await expect(
      loadContentSnapshot({
        destinationId: "morro-de-sao-paulo",
        now: "2026-09-20T12:00:00.000Z",
        storage,
        fetchSnapshot: async () => {
          throw new Error("offline");
        },
      }),
    ).resolves.toEqual({
      status: "stale",
      snapshot: value,
      stale: true,
    });
  });

  it("does not overwrite valid cache with invalid network data", async () => {
    const { storage } = storageHarness();
    const value = snapshot();
    await storage.write(value);

    const result = await loadContentSnapshot({
      destinationId: "morro-de-sao-paulo",
      now: "2026-09-20T12:00:00.000Z",
      storage,
      fetchSnapshot: async () => ({
        ...value,
        documents: [{ kind: "offer_reference" }],
      }),
    });

    expect(result.status).toBe("cache");
    await expect(storage.read("morro-de-sao-paulo")).resolves.toEqual(value);
  });
});
