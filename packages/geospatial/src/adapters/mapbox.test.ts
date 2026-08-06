import { describe, expect, it, vi } from "vitest";
import {
  createMapboxAdapter,
  type MapboxDriver,
  type MapboxMarkerHandle,
} from "./mapbox.js";

function createDriver(options: { readonly failMarkerId?: string } = {}) {
  const events: string[] = [];
  const map = { setCenter: vi.fn(), remove: vi.fn() };
  const markers = new Map<string, MapboxMarkerHandle>();
  const driver: MapboxDriver = {
    createMap: vi.fn(() => map),
    createMarker: vi.fn((input) => {
      let handle: MapboxMarkerHandle;
      handle = {
        setLngLat: vi.fn(() => handle),
        addTo: vi.fn(() => {
          events.push(`add:${input.id}`);
          if (input.id === options.failMarkerId) {
            throw new Error(`Failed to add marker: ${input.id}`);
          }
          return handle;
        }),
        remove: vi.fn(() => {
          events.push(`remove:${input.id}`);
        }),
      };
      markers.set(input.id, handle);
      return handle;
    }),
  };
  return { driver, events, map, markers };
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
    const { driver, map, markers } = createDriver();
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

    const marker = markers.get("poi-1");
    expect(driver.createMarker).toHaveBeenCalledWith({
      id: "poi-1",
      label: "Farol",
    });
    expect(marker?.setLngLat).toHaveBeenCalledWith([-38.91, -13.38]);
    expect(marker?.addTo).toHaveBeenCalledWith(map);
    expect(marker?.remove).toHaveBeenCalledOnce();
    expect(map.remove).toHaveBeenCalledOnce();
  });

  it("replaces markers only after the complete replacement is attached", async () => {
    const { driver, events, markers } = createDriver();
    const adapter = createMapboxAdapter({ driver });
    await adapter.initialize({
      containerId: "map",
      center: { latitude: 0, longitude: 0 },
      zoom: 10,
    });
    await adapter.addMarkers([
      {
        id: "old-marker",
        position: { latitude: -13.38, longitude: -38.91 },
      },
    ]);

    await adapter.replaceMarkers([
      {
        id: "new-marker",
        position: { latitude: -13.39, longitude: -38.92 },
      },
    ]);

    expect(events.indexOf("add:new-marker")).toBeLessThan(
      events.indexOf("remove:old-marker"),
    );
    expect(markers.get("old-marker")?.remove).toHaveBeenCalledOnce();
    expect(markers.get("new-marker")?.remove).not.toHaveBeenCalled();
  });

  it("preserves current markers when a replacement cannot be attached", async () => {
    const { driver, markers } = createDriver({
      failMarkerId: "replacement-2",
    });
    const adapter = createMapboxAdapter({ driver });
    await adapter.initialize({
      containerId: "map",
      center: { latitude: 0, longitude: 0 },
      zoom: 10,
    });
    await adapter.addMarkers([
      {
        id: "current-marker",
        position: { latitude: -13.38, longitude: -38.91 },
      },
    ]);

    await expect(
      adapter.replaceMarkers([
        {
          id: "replacement-1",
          position: { latitude: -13.39, longitude: -38.92 },
        },
        {
          id: "replacement-2",
          position: { latitude: -13.4, longitude: -38.93 },
        },
      ]),
    ).rejects.toThrow("Failed to add marker: replacement-2");

    expect(markers.get("current-marker")?.remove).not.toHaveBeenCalled();
    expect(markers.get("replacement-1")?.remove).toHaveBeenCalledOnce();
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
