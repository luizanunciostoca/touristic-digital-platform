import { describe, expect, it } from "vitest";
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
});
