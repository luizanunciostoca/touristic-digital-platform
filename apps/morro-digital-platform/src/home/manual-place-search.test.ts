import { describe, expect, it, vi } from "vitest";
import { createManualPlaceSearch } from "./manual-place-search.js";
import { createPublicPlaceMapClient } from "../map/public-place-map-client-v2.js";
const place = (id: string, name: string) => ({
  id,
  name,
  category: "beaches",
  lat: -13.38,
  lng: -38.92,
  presentation: { markerKey: "beaches", priority: 1 },
});
function client(pages: unknown[]) {
  const requests: string[] = [];
  const fetcher = vi.fn(async (url: string) => {
    requests.push(url);
    const page = pages.shift();
    if (page instanceof Error) throw page;
    return new Response(JSON.stringify(page), { status: 200 });
  });
  return {
    search: createManualPlaceSearch(
      createPublicPlaceMapClient(fetcher as typeof fetch),
    ),
    requests,
    fetcher,
  };
}
describe("manual search without an assistant or AI endpoint", () => {
  it("follows canonical cursors before local matching and never invents q", async () => {
    const run = client([
      { items: [place("one", "Primeira Praia")], nextCursor: "page2" },
      { items: [place("two", "Segunda Praia")], nextCursor: null },
    ]);
    const result = await run.search("segunda", "beaches");
    expect(result.source).toBe("canonical");
    expect(result.results.map((item) => item.placeId)).toEqual(["two"]);
    expect(run.requests).toHaveLength(2);
    for (const url of run.requests) {
      const parsed = new URL(url, "https://example.test");
      expect(parsed.pathname).toBe("/api/places/v1/map");
      expect(parsed.searchParams.get("category")).toBe("beaches");
      expect(parsed.searchParams.has("q")).toBe(false);
    }
    expect(
      new URL(run.requests[1]!, "https://example.test").searchParams.get(
        "cursor",
      ),
    ).toBe("page2");
  });
  it("keeps canonical empty distinct from unavailable local fallback", async () => {
    expect(
      await client([{ items: [], nextCursor: null }]).search("praia"),
    ).toEqual({ source: "canonical", results: [] });
    const unavailable = await client([new Error("offline")]).search("primeira");
    expect(unavailable.source).toBe("local");
    expect(unavailable.results.length).toBeGreaterThan(0);
    expect(
      unavailable.results.every(
        (item) => !item.placeId && item.source === "local",
      ),
    ).toBe(true);
  });
  it("rejects an aborted request rather than disguising cancellation as fallback", async () => {
    const abort = new AbortController();
    abort.abort();
    const run = client([]);
    await expect(run.search("praia", "", abort.signal)).rejects.toBeDefined();
    expect(run.fetcher).not.toHaveBeenCalled();
  });
  it("does not label partial cyclic pagination as canonical complete", async () => {
    const run = client([
      { items: [place("one", "Remote only")], nextCursor: "cycle" },
      { items: [], nextCursor: "cycle" },
    ]);
    const result = await run.search("Remote only");
    expect(result.source).toBe("local");
    expect(result.results.some((item) => item.placeId === "one")).toBe(false);
    expect(run.fetcher).toHaveBeenCalledTimes(2);
  });
  it("deduplicates IDs and permits category browse with empty query", async () => {
    const run = client([
      { items: [place("one", "Praia")], nextCursor: "next" },
      { items: [place("one", "Praia atualizada")], nextCursor: null },
    ]);
    expect(
      (await run.search("", "beaches")).results.map((item) => item.name),
    ).toEqual(["Praia atualizada"]);
  });
  it("retains all25 canonical results for UI pagination rather than truncating20", async () => {
    const records = Array.from({ length: 25 }, (_, index) =>
      place(`place-${index}`, `Praia ${index}`),
    );
    const run = client([
      { items: records.slice(0, 13), nextCursor: "next" },
      { items: records.slice(13), nextCursor: null },
    ]);
    const snapshot = await run.search("Praia", "beaches");
    expect(snapshot.results).toHaveLength(25);
    expect(snapshot.results.map((item) => item.placeId).sort()).toEqual(
      records.map((item) => item.id).sort(),
    );
  });
  it("fails over honestly when canonical pagination exceeds20pages", async () => {
    const run = client(
      Array.from({ length: 20 }, (_, index) => ({
        items: [place(`remote-${index}`, "Remote only")],
        nextCursor: `cursor-${index}`,
      })),
    );
    const snapshot = await run.search("Remote only");
    expect(snapshot.source).toBe("local");
    expect(snapshot.results).toEqual([]);
    expect(run.fetcher).toHaveBeenCalledTimes(20);
  });
  it("rejects cancellation while canonical HTTP is in flight", async () => {
    const abort = new AbortController();
    const fetcher = vi.fn(async () => {
      abort.abort();
      return new Response(
        JSON.stringify({ items: [place("one", "Praia")], nextCursor: null }),
      );
    });
    const search = createManualPlaceSearch(createPublicPlaceMapClient(fetcher));
    await expect(search("Praia", "", abort.signal)).rejects.toBeDefined();
  });
});
