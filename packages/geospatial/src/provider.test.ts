import { describe, expect, it, vi } from "vitest";
import { createGeospatialEngine, type MapProviderAdapter } from "./provider.js";

function createProvider() {
  const initialize = vi.fn<MapProviderAdapter["initialize"]>(() =>
    Promise.resolve(),
  );
  const setCenter = vi.fn<MapProviderAdapter["setCenter"]>(() =>
    Promise.resolve(),
  );
  const addMarkers = vi.fn<MapProviderAdapter["addMarkers"]>(() =>
    Promise.resolve(),
  );
  const replaceMarkers = vi.fn<MapProviderAdapter["replaceMarkers"]>(() =>
    Promise.resolve(),
  );
  const destroy = vi.fn<MapProviderAdapter["destroy"]>(() => Promise.resolve());
  const provider: MapProviderAdapter = {
    id: "mapbox",
    initialize,
    setCenter,
    addMarkers,
    replaceMarkers,
    destroy,
  };

  return {
    provider,
    initialize,
    setCenter,
    addMarkers,
    replaceMarkers,
    destroy,
  };
}

describe("GeospatialEngine", () => {
  it("initializes the selected provider", async () => {
    const fixture = createProvider();
    const engine = createGeospatialEngine(fixture.provider);

    await engine.initialize({
      containerId: "map",
      center: { latitude: -13.3833, longitude: -38.9167 },
      zoom: 14,
    });

    expect(engine.providerId).toBe("mapbox");
    expect(engine.initialized).toBe(true);
    expect(fixture.initialize).toHaveBeenCalledOnce();
  });

  it("blocks operations before initialization", async () => {
    const engine = createGeospatialEngine(createProvider().provider);

    await expect(
      engine.setCenter({ latitude: -13.3833, longitude: -38.9167 }),
    ).rejects.toThrow("Geospatial engine is not initialized.");
    await expect(engine.replaceMarkers([])).rejects.toThrow(
      "Geospatial engine is not initialized.",
    );
  });

  it("rejects duplicate marker ids", async () => {
    const engine = createGeospatialEngine(createProvider().provider);
    await engine.initialize({
      containerId: "map",
      center: { latitude: -13.3833, longitude: -38.9167 },
      zoom: 14,
    });

    await expect(
      engine.addMarkers([
        { id: "pier", position: { latitude: -13.383, longitude: -38.917 } },
        { id: "pier", position: { latitude: -13.384, longitude: -38.918 } },
      ]),
    ).rejects.toThrow("Duplicate marker id: pier");
  });

  it("normalizes marker replacements before forwarding them", async () => {
    const fixture = createProvider();
    const engine = createGeospatialEngine(fixture.provider);
    await engine.initialize({
      containerId: "map",
      center: { latitude: -13.3833, longitude: -38.9167 },
      zoom: 14,
    });

    await engine.replaceMarkers([
      {
        id: "farol",
        label: "Farol",
        position: { latitude: -13.377, longitude: -38.914 },
      },
    ]);

    const forwarded = fixture.replaceMarkers.mock.calls[0]?.[0];
    expect(forwarded).toHaveLength(1);
    expect(Object.isFrozen(forwarded)).toBe(true);
    expect(Object.isFrozen(forwarded?.[0])).toBe(true);
    expect(Object.isFrozen(forwarded?.[0]?.position)).toBe(true);
  });

  it("resets state when destroyed", async () => {
    const fixture = createProvider();
    const engine = createGeospatialEngine(fixture.provider);
    await engine.initialize({
      containerId: "map",
      center: { latitude: -13.3833, longitude: -38.9167 },
      zoom: 14,
    });

    await engine.destroy();

    expect(engine.initialized).toBe(false);
    expect(fixture.destroy).toHaveBeenCalledOnce();
  });
});
