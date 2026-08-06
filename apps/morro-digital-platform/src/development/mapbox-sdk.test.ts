import { describe, expect, it } from "vitest";
import {
  createDevelopmentMapboxSdk,
  type DevelopmentMapElement,
} from "./mapbox-sdk.js";

function createElement(): DevelopmentMapElement & {
  readonly attributes: Map<string, string>;
} {
  const attributes = new Map<string, string>();
  return {
    attributes,
    textContent: null,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
}

describe("createDevelopmentMapboxSdk", () => {
  it("renders, recenters and removes the development map", () => {
    const element = createElement();
    const sdk = createDevelopmentMapboxSdk({
      getElementById: (id) => (id === "map" ? element : null),
    });
    const map = new sdk.Map({
      container: "map",
      center: [-38.9167, -13.3833],
      zoom: 14,
    });

    expect(element.textContent).toContain("Morro de São Paulo");
    expect(element.attributes.get("data-development-center")).toBe(
      "-13.3833, -38.9167",
    );

    map.setCenter([-38.91, -13.38]);
    expect(element.attributes.get("data-development-center")).toBe(
      "-13.3800, -38.9100",
    );

    map.remove();
    expect(element.textContent).toBeNull();
    expect(element.attributes.has("data-development-map")).toBe(false);
  });

  it("rejects a missing container", () => {
    const sdk = createDevelopmentMapboxSdk({ getElementById: () => null });

    expect(
      () =>
        new sdk.Map({
          container: "missing",
          center: [0, 0],
          zoom: 10,
        }),
    ).toThrow("Development map container was not found: missing.");
  });
});
