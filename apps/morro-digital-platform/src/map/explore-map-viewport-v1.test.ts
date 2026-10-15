import { afterEach, describe, expect, it, vi } from "vitest";
import { morroV1SearchCatalog } from "@touristic/search";
import { installExploreMapViewportV1 } from "./explore-map-viewport-v1.js";

function harness(semantic = true) {
  const dataset: Record<string, string> = {
    exploreState: "ready",
    exploreCategory: "beaches",
    exploreStage: "places",
    mapMarkerCount: "2",
    ...(semantic
      ? {
          exploreDatasetContract: "bounds-v1",
          exploreDatasetBounds: "[[-40,-15],[-38,-13]]",
          exploreDatasetGeneration: "1",
          mapMemberCount: "8",
        }
      : {}),
  };
  const map = { dataset };
  const dock = { offsetHeight: 180 };
  const body = { dataset: { mdMode: "explore" } };
  const view = {
    innerWidth: 390,
    innerHeight: 844,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const locations = morroV1SearchCatalog
    .filter((item) => item.category === "beaches")
    .slice(0, 2);
  const document = {
    body,
    defaultView: view,
    documentElement: { clientWidth: 390, clientHeight: 844 },
    getElementById: (id: string) =>
      id === "map" ? map : id === "unified-assistant-dock" ? dock : null,
    querySelector: () => null,
    querySelectorAll: () =>
      locations.map((item) => ({ dataset: { locationName: item.name } })),
  } as unknown as Document;
  const fitBounds = vi.fn();
  vi.stubGlobal("mapboxPrimaryInstance", { fitBounds });
  const controller = installExploreMapViewportV1({ document });
  const flush = async () => {
    await Promise.resolve();
  };
  const reframe = async () => {
    controller.reframe();
    await flush();
  };
  return {
    dataset,
    body,
    view,
    dock,
    locations,
    controller,
    fitBounds,
    flush,
    reframe,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("semantic dataset viewport", () => {
  it("frames actual dataset coordinates independently of symbols/catalog and reserves the dock", async () => {
    const h = harness();
    await h.flush();
    expect(h.fitBounds).toHaveBeenCalledExactlyOnceWith(
      [
        [-40, -15],
        [-38, -13],
      ],
      expect.objectContaining({
        padding: { top: 100, bottom: 236.32000000000002, left: 30, right: 30 },
      }),
    );
    h.view.innerWidth = 430;
    await h.reframe();
    expect(h.fitBounds).toHaveBeenCalledTimes(2);
    h.dock.offsetHeight = 300;
    await h.reframe();
    expect(h.fitBounds).toHaveBeenCalledTimes(2);
    h.view.innerWidth = 450;
    await h.reframe();
    expect(h.fitBounds.mock.calls[2]?.[1].padding.bottom).toBe(340);
  });

  it("does not reset manual camera on regroup, open/close members or retained back menu", async () => {
    const h = harness();
    await h.flush();
    h.dataset.mapMarkerCount = "4";
    await h.reframe();
    h.dataset.exploreStage = "cluster";
    h.dataset.exploreLocationCount = "2";
    await h.reframe();
    h.dataset.exploreStage = "menu";
    h.dataset.exploreLocationCount = "8";
    await h.reframe();
    expect(h.fitBounds).toHaveBeenCalledTimes(1);
    h.dataset.exploreDatasetGeneration = "2";
    h.dataset.exploreDatasetBounds = "[[-39,-14],[-38,-13]]";
    await h.reframe();
    expect(h.fitBounds).toHaveBeenCalledTimes(2);
  });

  it.each(["navigation", "tour"])(
    "never takes camera from %s",
    async (mode) => {
      const h = harness();
      h.body.dataset.mdMode = mode;
      await h.flush();
      expect(h.fitBounds).not.toHaveBeenCalled();
    },
  );

  it.each(["switching", "ready"])(
    "never takes camera from foreign tour %s",
    async (state) => {
      const h = harness();
      h.dataset.tourState = state;
      await h.flush();
      expect(h.fitBounds).not.toHaveBeenCalled();
    },
  );

  it.each([
    { exploreDatasetContract: "future" },
    { exploreDatasetBounds: "" },
    { exploreDatasetBounds: "null" },
    { exploreDatasetBounds: "[[181,-15],[182,-13]]" },
    { exploreDatasetBounds: "[[-38,-15],[-40,-13]]" },
    { exploreDatasetBounds: '[["-40",-15],[-38,-13]]' },
    { exploreDatasetBounds: "[[-40,-91],[-38,-13]]" },
    { exploreDatasetGeneration: "0" },
    { exploreDatasetGeneration: "1.2" },
    { mapMemberCount: "1" },
    { mapMemberCount: "NaN" },
    { mapMemberCount: "8.5" },
    { exploreState: "loading" },
    { exploreState: "error" },
  ])(
    "rejects invalid/partial new contract without singleton fallback: %j",
    async (patch) => {
      const h = harness();
      Object.assign(h.dataset, patch);
      await h.flush();
      expect(h.fitBounds).not.toHaveBeenCalled();
    },
  );

  it("rejects declared capability with missing bounds and undeclared new member fields", async () => {
    const h = harness();
    delete h.dataset.exploreDatasetBounds;
    await h.flush();
    expect(h.fitBounds).not.toHaveBeenCalled();
    delete h.dataset.exploreDatasetContract;
    await h.reframe();
    expect(h.fitBounds).not.toHaveBeenCalled();
    h.controller.destroy();
    h.view.innerWidth = 600;
    await h.reframe();
    expect(h.fitBounds).not.toHaveBeenCalled();
  });

  it("preserves the truly absent legacy singleton contract", async () => {
    const h = harness(false);
    await h.flush();
    const longs = h.locations.map((item) => item.longitude),
      lats = h.locations.map((item) => item.latitude);
    expect(h.fitBounds.mock.calls[0]?.[0]).toEqual([
      [Math.min(...longs), Math.min(...lats)],
      [Math.max(...longs), Math.max(...lats)],
    ]);
    h.dataset.mapMarkerCount = "3";
    h.view.innerWidth = 500;
    await h.reframe();
    expect(h.fitBounds).toHaveBeenCalledTimes(1);
    h.controller.destroy();
    expect(h.view.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
  });
});
