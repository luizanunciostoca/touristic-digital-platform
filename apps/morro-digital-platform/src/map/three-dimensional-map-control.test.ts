import { describe, expect, it, vi } from "vitest";

import { installThreeDimensionalMapControl } from "./three-dimensional-map-control.js";

function createClassList() {
  const values = new Set<string>();
  return {
    toggle(token: string, force?: boolean) {
      const enabled = force ?? !values.has(token);
      if (enabled) values.add(token);
      else values.delete(token);
      return enabled;
    },
    contains(token: string) {
      return values.has(token);
    },
  };
}

function createElement(tagName = "DIV") {
  const listeners = new Map<string, EventListener>();
  const attributes = new Map<string, string>();
  const element = {
    tagName,
    id: "",
    type: "",
    className: "",
    title: "",
    innerHTML: "",
    disabled: false,
    classList: createClassList(),
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
    click() {
      listeners.get("click")?.({} as Event);
    },
    prepend(child: { id?: string }) {
      if (child.id) {
        elements.set(child.id, child as ReturnType<typeof createElement>);
      }
    },
  };
  return element;
}

const elements = new Map<string, ReturnType<typeof createElement>>();

function fixture(provider: "mapbox" | "leaflet") {
  elements.clear();
  const body = createElement("BODY");
  const mapElement = createElement();
  mapElement.id = "map";
  mapElement.setAttribute("data-map-provider", provider);
  const controls = createElement();
  controls.id = "globe-map-control";
  elements.set(mapElement.id, mapElement);
  elements.set(controls.id, controls);

  const document = {
    body,
    defaultView: null,
    getElementById(id: string) {
      return elements.get(id) ?? null;
    },
    createElement(tagName: string) {
      return createElement(tagName.toUpperCase());
    },
  } as unknown as Document;

  return { document, body, mapElement };
}

describe("installThreeDimensionalMapControl", () => {
  it("injects the V1 control and toggles the existing Mapbox camera", () => {
    const view = fixture("mapbox");
    const easeTo = vi.fn();
    const control = installThreeDimensionalMapControl({
      document: view.document,
      resolveMap: () => ({ setCenter: vi.fn(), remove: vi.fn(), easeTo }),
      pitch: 55,
      durationMs: 10,
    });
    const button = view.document.getElementById(
      "toggle-3d-mode",
    ) as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    button.click();
    expect(control.active).toBe(true);
    expect(button.classList.contains("active")).toBe(true);
    expect(view.body.classList.contains("map-3d-mode")).toBe(true);
    expect(view.body.classList.contains("navigation-3d-active")).toBe(true);
    expect(view.mapElement.getAttribute("data-3d-view")).toBe("true");
    expect(easeTo).toHaveBeenLastCalledWith({
      pitch: 55,
      bearing: 0,
      duration: 10,
      essential: true,
    });

    button.click();
    expect(control.active).toBe(false);
    expect(easeTo).toHaveBeenLastCalledWith({
      pitch: 0,
      bearing: 0,
      duration: 10,
      essential: true,
    });
  });

  it("fails closed for a known non-Mapbox fallback provider", () => {
    const view = fixture("leaflet");
    const control = installThreeDimensionalMapControl({
      document: view.document,
      resolveMap: () => undefined,
    });
    const button = view.document.getElementById(
      "toggle-3d-mode",
    ) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    button.click();
    expect(control.active).toBe(false);
  });

  it("cleans up V1 3D state when destroyed", () => {
    const view = fixture("mapbox");
    const easeTo = vi.fn();
    const control = installThreeDimensionalMapControl({
      document: view.document,
      resolveMap: () => ({ setCenter: vi.fn(), remove: vi.fn(), easeTo }),
    });
    const button = view.document.getElementById(
      "toggle-3d-mode",
    ) as HTMLButtonElement;

    button.click();
    control.destroy();

    expect(control.active).toBe(false);
    expect(button.disabled).toBe(true);
    expect(view.body.classList.contains("map-3d-mode")).toBe(false);
    expect(view.body.classList.contains("navigation-3d-active")).toBe(false);
  });
});
