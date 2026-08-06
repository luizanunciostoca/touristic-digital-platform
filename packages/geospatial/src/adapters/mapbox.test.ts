import { describe, expect, it, vi } from "vitest";
import { createMapboxAdapter, type MapboxDriver } from "./mapbox.js";

function createDriver() {
  const map = { setCenter: vi.fn(), remove: vi.fn() };
  const marker = {
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
  const driver: MapboxDriver = {
    createMap: vi.fn(() => map),
    createMarker: vi.fn(() => marker),
  };
  return { driver, map, marker };
}

describe("createMapboxAdapter", () => {
  it("translates platform coordinates to Mapbox longitude-latitude order", async () => {
    const { driver, map } = createDriver();
    const adapter = createMapboxAdapter({
      driver,
      style: "mapbox://styles/example",
    });

    await adapter.initialize({
      containerId: "map",
      center: { latitude: -13.3833, longitude: -38.9167 },
      zoom: 14,
    });
    await adapter.setCenter({ latitude: -13.38, longitude: -38.91 });

    expect(driver.createMap).toHaveBeenCalledWith({
      container: "map",
      center: [-38.9167, -13.3833],
      zoom: 14,
      style: "mapbox://styles/example",
    });
    expect(map.setCenter).toHaveBeenCalledWith([-38.91, -13.38]);
  });

  it("creates and removes markers without exposing Mapbox handles", async () => {
    const { driver, map, marker } = createDriver();
    const adapter = createMapboxAdapter({ driver });
    await adapter.initialize({
      containerId: "map",
      center: { latitude: 0, longitude: 0 },
      zoom: 10,
    });

    await adapter.addMarkers([
      {
        id: "poi-1",
        label: "Farol",
        position: { latitude: -13.38, longitude: -38.91 },
      },
    ]);
    await adapter.destroy();

    expect(driver.createMarker).toHaveBeenCalledWith({
      id: "poi-1",
      label: "Farol",
    });
    expect(marker.setLngLat).toHaveBeenCalledWith([-38.91, -13.38]);
    expect(marker.addTo).toHaveBeenCalledWith(map);
    expect(marker.remove).toHaveBeenCalledOnce();
    expect(map.remove).toHaveBeenCalledOnce();
  });

  it("blocks operations before initialization and duplicate initialization", async () => {
    const { driver } = createDriver();
    const adapter = createMapboxAdapter({ driver });

    await expect(
      adapter.setCenter({ latitude: 0, longitude: 0 }),
    ).rejects.toThrow("Mapbox adapter is not initialized.");

    await adapter.initialize({
      containerId: "map",
      center: { latitude: 0, longitude: 0 },
      zoom: 10,
    });

    await expect(
      adapter.initialize({
        containerId: "map-2",
        center: { latitude: 0, longitude: 0 },
        zoom: 10,
      }),
    ).rejects.toThrow("Mapbox adapter is already initialized.");
  });
});
