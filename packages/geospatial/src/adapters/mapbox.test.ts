import { describe, expect, it } from "vitest";
import {
  createMapboxAdapter,
  type MapboxDriver,
  type MapboxMapHandle,
  type MapboxMarkerHandle,
} from "./mapbox.js";

type CreateMapInput = Parameters<MapboxDriver["createMap"]>[0];
type CreateMarkerInput = Parameters<MapboxDriver["createMarker"]>[0];

function createDriver(options: { readonly failMarkerId?: string } = {}) {
  const events: string[] = [];
  const createdMaps: CreateMapInput[] = [];
  const createdMarkers: CreateMarkerInput[] = [];
  const centers: [number, number][] = [];
  const markerPositions = new Map<string, [number, number]>();
  const attachedMaps = new Map<string, MapboxMapHandle>();
  const removedMarkers: string[] = [];
  const state = { mapRemoveCount: 0 };

  const map: MapboxMapHandle = {
    setCenter(center): void {
      centers.push(center);
    },
    remove(): void {
      state.mapRemoveCount += 1;
    },
  };

  const driver: MapboxDriver = {
    createMap(input): MapboxMapHandle {
      createdMaps.push(input);
      return map;
    },
    createMarker(input): MapboxMarkerHandle {
      createdMarkers.push(input);
      const handle: MapboxMarkerHandle = {
        setLngLat(position): MapboxMarkerHandle {
          markerPositions.set(input.id, position);
          return handle;
        },
        addTo(activeMap): MapboxMarkerHandle {
          events.push(`add:${input.id}`);
          if (input.id === options.failMarkerId) {
            throw new Error(`Failed to add marker: ${input.id}`);
          }
          attachedMaps.set(input.id, activeMap);
          return handle;
        },
        remove(): void {
          events.push(`remove:${input.id}`);
          removedMarkers.push(input.id);
        },
      };
      return handle;
    },
  };

  return {
    driver,
    events,
    map,
    state,
    createdMaps,
    createdMarkers,
    centers,
    markerPositions,
    attachedMaps,
    removedMarkers,
  };
}

describe("createMapboxAdapter", () => {
  it("translates platform coordinates to Mapbox longitude-latitude order", async () => {
    const fixture = createDriver();
    const adapter = createMapboxAdapter({
      driver: fixture.driver,
      style: "mapbox://styles/example",
    });

    await adapter.initialize({
      containerId: "map",
      center: { latitude: -13.3833, longitude: -38.9167 },
      zoom: 14,
    });
    await adapter.setCenter({ latitude: -13.38, longitude: -38.91 });

    expect(fixture.createdMaps).toEqual([
      {
        container: "map",
        center: [-38.9167, -13.3833],
        zoom: 14,
        style: "mapbox://styles/example",
      },
    ]);
    expect(fixture.centers).toEqual([[-38.91, -13.38]]);
  });

  it("creates and removes markers without exposing Mapbox handles", async () => {
    const fixture = createDriver();
    const adapter = createMapboxAdapter({ driver: fixture.driver });
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

    expect(fixture.createdMarkers).toEqual([{ id: "poi-1", label: "Farol" }]);
    expect(fixture.markerPositions.get("poi-1")).toEqual([-38.91, -13.38]);
    expect(fixture.attachedMaps.get("poi-1")).toBe(fixture.map);
    expect(fixture.removedMarkers).toEqual(["poi-1"]);
    expect(fixture.state.mapRemoveCount).toBe(1);
  });

  it("replaces markers only after the complete replacement is attached", async () => {
    const fixture = createDriver();
    const adapter = createMapboxAdapter({ driver: fixture.driver });
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

    expect(fixture.events.indexOf("add:new-marker")).toBeLessThan(
      fixture.events.indexOf("remove:old-marker"),
    );
    expect(fixture.removedMarkers).toContain("old-marker");
    expect(fixture.removedMarkers).not.toContain("new-marker");
  });

  it("preserves current markers when a replacement cannot be attached", async () => {
    const fixture = createDriver({ failMarkerId: "replacement-2" });
    const adapter = createMapboxAdapter({ driver: fixture.driver });
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

    expect(fixture.removedMarkers).not.toContain("current-marker");
    expect(fixture.removedMarkers).toContain("replacement-1");
    expect(fixture.removedMarkers).toContain("replacement-2");
  });

  it("blocks operations before initialization and duplicate initialization", async () => {
    const fixture = createDriver();
    const adapter = createMapboxAdapter({ driver: fixture.driver });

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
