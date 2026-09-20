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

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
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

function snapshot(expiresAt = "2026-09-21T10:00:00.000Z"): OfflineContentSnapshot {
  const result = createOfflineContentSnapshot([published()], {
    destinationId: "morro-de-sao-paulo",
    generatedAt: "2026-09-20T10:00:00.000Z",
    expiresAt,
  });
  if (!result) throw new Error("Expected valid snapshot fixture.");
  return result;
}

describe("browser content snapshot storage", () => {
  it("round-trips only validated destination-bound snapshots", () => {
    const local = storage();
    const cache = createBrowserContentSnapshotStorage(local);
    const value = snapshot();

    cache.write(value);

    expect(cache.read("morro-de-sao-paulo")).toEqual(value);
    expect(cache.read("another-destination")).toBeNull();
  });

  it("rejects malformed or transaction-authoritative cached JSON", () => {
    const local = storage();
    local.setItem(
      "morro-content-snapshot-v1:morro-de-sao-paulo",
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
    );

    expect(
      createBrowserContentSnapshotStorage(local).read("morro-de-sao-paulo"),
    ).toBeNull();
  });
});

describe("content snapshot loading", () => {
  it("prefers a fresh validated network snapshot and persists it", async () => {
    const cache = createBrowserContentSnapshotStorage(storage());
    const value = snapshot();
    const write = vi.spyOn(cache, "write");

    await expect(
      loadContentSnapshot({
        destinationId: "morro-de-sao-paulo",
        now: "2026-09-20T12:00:00.000Z",
        storage: cache,
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
    const cache = createBrowserContentSnapshotStorage(storage());
    const value = snapshot();
    cache.write(value);

    await expect(
      loadContentSnapshot({
        destinationId: "morro-de-sao-paulo",
        now: "2026-09-20T12:00:00.000Z",
        storage: cache,
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
    const cache = createBrowserContentSnapshotStorage(storage());
    const value = snapshot("2026-09-20T11:00:00.000Z");
    cache.write(value);

    await expect(
      loadContentSnapshot({
        destinationId: "morro-de-sao-paulo",
        now: "2026-09-20T12:00:00.000Z",
        storage: cache,
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
    const cache = createBrowserContentSnapshotStorage(storage());
    const value = snapshot();
    cache.write(value);

    const result = await loadContentSnapshot({
      destinationId: "morro-de-sao-paulo",
      now: "2026-09-20T12:00:00.000Z",
      storage: cache,
      fetchSnapshot: async () => ({
        ...value,
        documents: [{ kind: "offer_reference" }],
      }),
    });

    expect(result.status).toBe("cache");
    expect(cache.read("morro-de-sao-paulo")).toEqual(value);
  });
});
