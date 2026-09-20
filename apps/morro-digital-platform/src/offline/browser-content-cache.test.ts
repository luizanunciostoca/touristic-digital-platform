import { describe, expect, it, vi } from "vitest";

import type { OfflineContentSnapshot } from "@touristic/content/public-projection";

import { createBrowserOfflineContentCache } from "./browser-content-cache.js";

function snapshot(): OfflineContentSnapshot {
  return {
    schemaVersion: "1",
    destinationId: "morro-de-sao-paulo",
    generatedAt: "2026-09-20T10:00:00.000Z",
    expiresAt: "2026-09-21T10:00:00.000Z",
    documents: [
      {
        id: "place-1",
        destinationId: "morro-de-sao-paulo",
        kind: "place",
        locale: "pt-BR",
        version: 1,
        fields: { title: "Segunda Praia" },
        publishedAt: "2026-09-20T09:00:00.000Z",
      },
    ],
  };
}

function cacheStorageHarness() {
  const entries = new Map<string, Response>();
  const cache = {
    async put(key: RequestInfo | URL, response: Response) {
      entries.set(String(key), response.clone());
    },
    async match(key: RequestInfo | URL) {
      return entries.get(String(key))?.clone();
    },
    async delete(key: RequestInfo | URL) {
      return entries.delete(String(key));
    },
  };

  return {
    entries,
    caches: {
      open: vi.fn(async () => cache),
    } as unknown as CacheStorage,
  };
}

describe("browser offline content cache", () => {
  it("round-trips a fresh validated public snapshot", async () => {
    const harness = cacheStorageHarness();
    const cache = createBrowserOfflineContentCache({
      caches: harness.caches,
      origin: "https://morro.example",
    });

    await cache.save(snapshot());

    await expect(
      cache.load("morro-de-sao-paulo", "2026-09-20T12:00:00.000Z"),
    ).resolves.toEqual({
      status: "hit",
      snapshot: snapshot(),
    });
  });

  it("deletes stale snapshots instead of returning them as current", async () => {
    const harness = cacheStorageHarness();
    const cache = createBrowserOfflineContentCache({
      caches: harness.caches,
      origin: "https://morro.example",
    });

    await cache.save(snapshot());

    await expect(
      cache.load("morro-de-sao-paulo", "2026-09-21T10:00:00.000Z"),
    ).resolves.toEqual({ status: "stale" });
    expect(harness.entries.size).toBe(0);
  });

  it("deletes malformed cached JSON", async () => {
    const harness = cacheStorageHarness();
    const cache = createBrowserOfflineContentCache({
      caches: harness.caches,
      origin: "https://morro.example",
    });
    harness.entries.set(
      "https://morro.example/__morro_offline/content/morro-de-sao-paulo.json",
      new Response("{broken"),
    );

    await expect(
      cache.load("morro-de-sao-paulo", "2026-09-20T12:00:00.000Z"),
    ).resolves.toEqual({ status: "invalid" });
    expect(harness.entries.size).toBe(0);
  });

  it("rejects a snapshot that bypasses the offline content allowlist", async () => {
    const harness = cacheStorageHarness();
    const cache = createBrowserOfflineContentCache({
      caches: harness.caches,
      origin: "https://morro.example",
    });
    const unsafe = {
      ...snapshot(),
      documents: [
        {
          ...snapshot().documents[0],
          id: "offer-1",
          kind: "offer_reference",
          sourceReference: "offer:tour-001",
        },
      ],
    } as unknown as OfflineContentSnapshot;

    await expect(cache.save(unsafe)).rejects.toThrow(
      "Offline content snapshot is invalid.",
    );
    expect(harness.entries.size).toBe(0);
  });
});
