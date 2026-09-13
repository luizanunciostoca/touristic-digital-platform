import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { installThreeDimensionalMapControl } from "./three-dimensional-map-control.js";

describe("installThreeDimensionalMapControl", () => {
  it("injects the frozen V1 control and toggles 3D Mapbox camera state", () => {
    const dom = new JSDOM(`<!doctype html><body><div id="map" data-map-provider="mapbox"></div><div id="globe-map-control"><button id="toggle-globe-view"></button></div></body>`);
    const easeTo = vi.fn();
    const map = { setCenter: vi.fn(), remove: vi.fn(), easeTo };
    const control = installThreeDimensionalMapControl({
      document: dom.window.document,
      resolveMap: () => map,
      pitch: 55,
      durationMs: 10,
    });
    const button = dom.window.document.getElementById(
      "toggle-3d-mode",
    ) as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    button.click();
    expect(control.active).toBe(true);
    expect(button.classList.contains("active")).toBe(true);
    expect(dom.window.document.body.classList.contains("map-3d-mode")).toBe(true);
    expect(
      dom.window.document.body.classList.contains("navigation-3d-active"),
    ).toBe(true);
    expect(
      dom.window.document.getElementById("map")?.getAttribute("data-3d-view"),
    ).toBe("true");
    expect(easeTo).toHaveBeenLastCalledWith({
      pitch: 55,
      bearing: 0,
      duration: 10,
      essential: true,
    });

    button.click();
    expect(control.active).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(easeTo).toHaveBeenLastCalledWith({
      pitch: 0,
      bearing: 0,
      duration: 10,
      essential: true,
    });
  });

  it("fails closed for a known non-Mapbox fallback provider", () => {
    const dom = new JSDOM(`<!doctype html><body><div id="map" data-map-provider="leaflet"></div><div id="globe-map-control"></div></body>`);
    const control = installThreeDimensionalMapControl({
      document: dom.window.document,
      resolveMap: () => undefined,
    });
    const button = dom.window.document.getElementById(
      "toggle-3d-mode",
    ) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    button.click();
    expect(control.active).toBe(false);
  });

  it("cleans up V1 3D state when destroyed", () => {
    const dom = new JSDOM(`<!doctype html><body><div id="map" data-map-provider="mapbox"></div><div id="globe-map-control"></div></body>`);
    const easeTo = vi.fn();
    const control = installThreeDimensionalMapControl({
      document: dom.window.document,
      resolveMap: () => ({ setCenter: vi.fn(), remove: vi.fn(), easeTo }),
    });
    const button = dom.window.document.getElementById(
      "toggle-3d-mode",
    ) as HTMLButtonElement;

    button.click();
    control.destroy();

    expect(control.active).toBe(false);
    expect(button.disabled).toBe(true);
    expect(dom.window.document.body.classList.contains("map-3d-mode")).toBe(false);
    expect(
      dom.window.document.body.classList.contains("navigation-3d-active"),
    ).toBe(false);
  });
});
