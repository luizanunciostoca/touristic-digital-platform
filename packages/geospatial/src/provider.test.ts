import { describe, expect, it, vi } from "vitest";
import { createGeospatialEngine, type MapProviderAdapter } from "./provider.js";

function createProvider(): MapProviderAdapter {
  return {
    id: "mapbox",
    initialize: vi.fn(async () => undefined),
    setCenter: vi.fn(async () => undefined),
    addMarkers: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  };
}

describe("GeospatialEngine", () => {
  it("initializes the selected provider", async () => {
    const provider = createProvider();
    const engine = createGeospatialEngine(provider);

    await engine.initialize({
      containerId: "map",
      center: { latitude: -13.3833, longitude: -38.9167 },
      zoom: 14,
    });

    expect(engine.providerId).toBe("mapbox");
    expect(engine.initialized).toBe(true);
    expect(provider.initialize).toHaveBeenCalledOnce();
  });

  it("blocks operations before initialization", async () => {
    const engine = createGeospatialEngine(createProvider());

    await expect(
      engine.setCenter({ latitude: -13.3833, longitude: -38.9167 }),
    ).rejects.toThrow("Geospatial engine is not initialized.");
  });

  it("rejects duplicate marker ids", async () => {
    const engine = createGeospatialEngine(createProvider());
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

  it("resets state when destroyed", async () => {
    const provider = createProvider();
    const engine = createGeospatialEngine(provider);
    await engine.initialize({
      containerId: "map",
      center: { latitude: -13.3833, longitude: -38.9167 },
      zoom: 14,
    });

    await engine.destroy();

    expect(engine.initialized).toBe(false);
    expect(provider.destroy).toHaveBeenCalledOnce();
  });
});
