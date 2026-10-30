import { expect, it, vi } from "vitest";
import { createLeafletCompatibilitySdk } from "../development/leaflet-compatibility-sdk.js";

function fixture() {
  const nativeMap = {
    attributionControl: { setPosition: vi.fn() },
    setView: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
  const tiles = { addTo: vi.fn().mockReturnThis() };
  const leaflet = {
    map: vi.fn(() => nativeMap),
    tileLayer: vi.fn(() => tiles),
    marker: vi.fn(),
  };
  const sdk = createLeafletCompatibilitySdk({ L: leaflet });
  const map = new sdk.Map({
    container: "map",
    center: [-38.9167, -13.3833],
    zoom: 14,
    style: "development://morro-digital",
  });
  return { map, nativeMap, tiles, leaflet };
}

it("loads canonical OSM tiles with an origin-only referrer and visible attribution", () => {
  const { nativeMap, tiles, leaflet } = fixture();
  expect(leaflet.map).toHaveBeenCalledWith("map", {
    zoomControl: false,
    attributionControl: true,
  });
  expect(nativeMap.attributionControl.setPosition).toHaveBeenCalledWith(
    "topright",
  );
  expect(leaflet.tileLayer).toHaveBeenCalledWith(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      referrerPolicy: "strict-origin",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  );
  expect(tiles.addTo).toHaveBeenCalledWith(nativeMap);
});

it("preserves coordinate order, navigation and cleanup when WebGL is unavailable", () => {
  const { map, nativeMap } = fixture();
  expect(nativeMap.setView).toHaveBeenCalledWith([-13.3833, -38.9167], 14);
  map.setCenter([-38.92, -13.39]);
  expect(nativeMap.setView).toHaveBeenLastCalledWith([-13.39, -38.92], 14, {
    animate: false,
  });
  const navigationMap = map as typeof map & {
    easeTo(input: {
      center: [number, number];
      zoom: number;
      duration: number;
    }): void;
  };
  navigationMap.easeTo({ center: [-38.93, -13.4], zoom: 16, duration: 500 });
  expect(nativeMap.setView).toHaveBeenLastCalledWith([-13.4, -38.93], 16, {
    animate: true,
    duration: 0.5,
  });
  map.remove();
  expect(nativeMap.remove).toHaveBeenCalledOnce();
});
