import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { installThreeDimensionalMapControl } from "./three-dimensional-map-control.js";

describe("installThreeDimensionalMapControl", () => {
  it("toggles the frozen V1 3D states and Mapbox camera pitch", () => {
    const dom = new JSDOM(`<!doctype html><body><div id="map"></div><button id="toggle-3d-mode"></button></body>`);
    const easeTo = vi.fn();
    const map = { setCenter: vi.fn(), remove: vi.fn(), easeTo };
    const control = installThreeDimensionalMapControl({
      document: dom.window.document,
      map,
      pitch: 55,
      durationMs: 10,
    });
    const button = dom.window.document.getElementById("toggle-3d-mode") as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    button.click();
    expect(control.active).toBe(true);
    expect(button.classList.contains("active")).toBe(true);
    expect(dom.window.document.body.classList.contains("map-3d-mode")).toBe(true);
    expect(dom.window.document.body.classList.contains("navigation-3d-active")).toBe(true);
    expect(dom.window.document.getElementById("map")?.getAttribute("data-3d-view")).toBe("true");
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

  it("fails closed when the active provider cannot change pitch", () => {
    const dom = new JSDOM(`<!doctype html><body><div id="map"></div><button id="toggle-3d-mode"></button></body>`);
    const control = installThreeDimensionalMapControl({
      document: dom.window.document,
      map: { setCenter: vi.fn(), remove: vi.fn() },
    });
    const button = dom.window.document.getElementById("toggle-3d-mode") as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    button.click();
    expect(control.active).toBe(false);
  });
});
