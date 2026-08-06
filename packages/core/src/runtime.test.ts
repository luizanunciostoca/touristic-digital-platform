import { describe, expect, it, vi } from "vitest";

import { createPlatformRuntime, EventBus, ModuleRegistry } from "./runtime.js";

describe("platform runtime", () => {
  it("publishes immutable event envelopes", async () => {
    const events = new EventBus();
    const handler = vi.fn();
    events.subscribe("DestinationLoaded", handler);

    await events.publish("DestinationLoaded", { destinationId: "morro" });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      type: "DestinationLoaded",
      payload: { destinationId: "morro" },
    });
    expect(Object.isFrozen(handler.mock.calls[0]?.[0])).toBe(true);
  });

  it("loads only modules enabled by the destination", () => {
    const registry = new ModuleRegistry();
    registry.register({ id: "geospatial", version: "0.1.0", enabled: true });
    registry.register({
      id: "marketplace",
      version: "0.1.0",
      dependencies: ["geospatial"],
      enabled: true,
    });
    registry.register({ id: "crm", version: "0.1.0", enabled: true });

    const runtime = createPlatformRuntime({
      destination: {
        id: "morro-de-sao-paulo",
        name: "Morro de São Paulo",
        locale: "pt-BR",
        enabledModules: ["geospatial", "marketplace"],
      },
      registry,
    });

    expect(runtime.modules.map((module) => module.id)).toEqual([
      "geospatial",
      "marketplace",
    ]);
    expect(Object.isFrozen(runtime.destination.enabledModules)).toBe(true);
    expect(Object.isFrozen(runtime.modules[1]?.dependencies)).toBe(true);
  });

  it("rejects an enabled module with an unavailable dependency", () => {
    const registry = new ModuleRegistry();
    registry.register({
      id: "marketplace",
      version: "0.1.0",
      dependencies: ["geospatial"],
      enabled: true,
    });

    expect(() =>
      createPlatformRuntime({
        destination: {
          id: "morro-de-sao-paulo",
          name: "Morro de São Paulo",
          locale: "pt-BR",
          enabledModules: ["marketplace"],
        },
        registry,
      }),
    ).toThrow("requires unavailable dependency geospatial");
  });
});
