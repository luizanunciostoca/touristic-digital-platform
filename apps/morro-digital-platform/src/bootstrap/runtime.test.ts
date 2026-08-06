import type { GeospatialEngine } from "@touristic/geospatial";
import { describe, expect, it, vi } from "vitest";
import { bootstrapMorroDigital } from "./runtime.js";

describe("bootstrapMorroDigital", () => {
  it("loads Morro de São Paulo with geospatial and marketplace", async () => {
    const result = await bootstrapMorroDigital();

    expect(result.runtime.destination.id).toBe("morro-de-sao-paulo");
    expect(result.runtime.destination.locale).toBe("pt-BR");
    expect(result.startedModules).toEqual(["geospatial", "marketplace"]);
  });

  it("keeps marketplace dependency available", async () => {
    const result = await bootstrapMorroDigital();
    const marketplace = result.runtime.modules.find(
      (module) => module.id === "marketplace",
    );

    expect(marketplace?.dependencies).toEqual(["geospatial"]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("runs the configured geospatial initializer with the runtime event bus", async () => {
    const engine: GeospatialEngine = {
      providerId: "mapbox",
      initialized: true,
      initialize: vi.fn(async () => undefined),
      setCenter: vi.fn(async () => undefined),
      addMarkers: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
    };
    const initializeGeospatial = vi.fn(async () => engine);

    const result = await bootstrapMorroDigital({ initializeGeospatial });

    expect(initializeGeospatial).toHaveBeenCalledWith(result.runtime.events);
    expect(result.geospatialEngine).toBe(engine);
  });
});
