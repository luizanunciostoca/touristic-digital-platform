import { describe, expect, it, vi } from "vitest";

import {
  createPlatformObservation,
  createPlatformRuntime,
  EventBus,
  ModuleRegistry,
} from "./runtime.js";

const FIXED_NOW = "2026-08-15T05:00:00.000Z";

function deterministicId(prefix: "evt" | "corr" | "obs"): string {
  return `${prefix}_contract_test`;
}

describe("platform runtime", () => {
  it("publishes the canonical immutable event envelope", async () => {
    const events = new EventBus({
      destinationId: "morro-de-sao-paulo",
      createId: deterministicId,
      now: () => FIXED_NOW,
    });
    const handler = vi.fn();
    events.subscribe("DestinationLoaded", handler);

    await events.publish(
      "DestinationLoaded",
      { modules: ["geospatial"] },
      {
        version: 2,
        tenantId: "tenant_toca",
        correlationId: "corr_bootstrap",
        causationId: "cmd_bootstrap",
      },
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toEqual({
      eventId: "evt_contract_test",
      type: "DestinationLoaded",
      version: 2,
      payload: { modules: ["geospatial"] },
      occurredAt: FIXED_NOW,
      destinationId: "morro-de-sao-paulo",
      tenantId: "tenant_toca",
      correlationId: "corr_bootstrap",
      causationId: "cmd_bootstrap",
    });
    expect(Object.isFrozen(handler.mock.calls[0]?.[0])).toBe(true);
  });

  it("fails closed when an event has no destination context", async () => {
    const events = new EventBus({
      createId: deterministicId,
      now: () => FIXED_NOW,
    });

    await expect(events.publish("UnscopedEvent", {})).rejects.toThrow(
      "Event destinationId is required.",
    );
  });

  it("does not trust destination or tenant scope embedded in event payload", async () => {
    const unscopedEvents = new EventBus({
      createId: deterministicId,
      now: () => FIXED_NOW,
    });

    await expect(
      unscopedEvents.publish("ForgedScope", {
        destinationId: "forged-destination",
        tenantId: "forged-tenant",
      }),
    ).rejects.toThrow("Event destinationId is required.");

    const scopedEvents = new EventBus({
      destinationId: "morro-de-sao-paulo",
      tenantId: "tenant_toca",
      createId: deterministicId,
      now: () => FIXED_NOW,
    });
    const handler = vi.fn();
    scopedEvents.subscribe("ForgedScope", handler);

    await scopedEvents.publish("ForgedScope", {
      destinationId: "forged-destination",
      tenantId: "forged-tenant",
    });

    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      destinationId: "morro-de-sao-paulo",
      tenantId: "tenant_toca",
    });
  });

  it("creates a structured observation with correlation context", () => {
    const observation = createPlatformObservation(
      {
        kind: "audit",
        name: "platform.contract.validated",
        severity: "info",
        destinationId: "morro-de-sao-paulo",
        tenantId: "tenant_toca",
        correlationId: "corr_contract_test",
        causationId: "evt_contract_test",
        attributes: {
          contractId: "PLATFORM-EVENT-ENVELOPE",
          valid: true,
          checkedFiles: 3,
        },
      },
      { createId: deterministicId, now: () => FIXED_NOW },
    );

    expect(observation).toEqual({
      observationId: "obs_contract_test",
      kind: "audit",
      name: "platform.contract.validated",
      severity: "info",
      occurredAt: FIXED_NOW,
      destinationId: "morro-de-sao-paulo",
      tenantId: "tenant_toca",
      correlationId: "corr_contract_test",
      causationId: "evt_contract_test",
      attributes: {
        contractId: "PLATFORM-EVENT-ENVELOPE",
        valid: true,
        checkedFiles: 3,
      },
    });
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.attributes)).toBe(true);
  });

  it("rejects forged observation vocabulary and non-primitive attributes", () => {
    const base = {
      kind: "audit",
      name: "platform.contract.validated",
      severity: "info",
      destinationId: "morro-de-sao-paulo",
      correlationId: "corr_contract_test",
    } as const;

    expect(() =>
      createPlatformObservation(
        { ...base, kind: "unknown" as "audit" },
        { createId: deterministicId, now: () => FIXED_NOW },
      ),
    ).toThrow("Observation kind is invalid.");

    expect(() =>
      createPlatformObservation(
        {
          ...base,
          attributes: { nested: { unsafe: true } } as never,
        },
        { createId: deterministicId, now: () => FIXED_NOW },
      ),
    ).toThrow("Observation attribute nested must be primitive.");
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
