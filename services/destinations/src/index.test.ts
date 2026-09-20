import { describe, expect, it } from "vitest";
import {
  DestinationAdminService,
  MemoryDestinationRepository,
  bootstrapMorroDeSaoPauloDestination,
} from "./index.js";

const fixture = {
  id: "morro-de-sao-paulo",
  status: "active",
  locale: "pt-BR",
  timezone: "America/Bahia",
  currency: "BRL",
  branding: {
    name: "Morro Digital",
    shortName: "Morro",
    tagline: "Morro de São Paulo na palma da sua mão",
  },
  center: { lat: -13.3781, lng: -38.9132, zoom: 13.5 },
  modules: ["explore", "navigation"],
  featureFlags: { assistant: true },
} as const;

describe("Destination owner service", () => {
  it("creates, reads and updates a versioned destination", async () => {
    let now = "2026-09-20T23:00:00.000Z";
    const service = new DestinationAdminService(
      new MemoryDestinationRepository(),
      { now: () => now },
    );
    const created = await service.create(fixture);
    expect(created).toMatchObject({ status: "created", data: { version: 1 } });

    now = "2026-09-20T23:05:00.000Z";
    const updated = await service.replace(fixture.id, {
      ...fixture,
      branding: { ...fixture.branding, tagline: "Destino atualizado" },
    });
    expect(updated).toMatchObject({
      status: "updated",
      data: { version: 2, branding: { tagline: "Destino atualizado" } },
    });
    expect(await service.read(fixture.id)).toMatchObject({
      status: "found",
      data: { version: 2 },
    });
  });

  it("rejects duplicate creation and invalid identifiers", async () => {
    const service = new DestinationAdminService(
      new MemoryDestinationRepository(),
    );
    expect((await service.create(fixture)).status).toBe("created");
    expect((await service.create(fixture)).status).toBe("conflict");
    expect(await service.read("../root")).toEqual({
      status: "invalid",
      error: "DESTINATION_INVALID_ID",
    });
  });
});

describe("Morro destination bootstrap", () => {
  it("is idempotent and preserves an existing governed destination", async () => {
    const service = new DestinationAdminService(
      new MemoryDestinationRepository(),
    );
    const first = await bootstrapMorroDeSaoPauloDestination(service);
    const second = await bootstrapMorroDeSaoPauloDestination(service);
    expect(first.status).toBe("created");
    expect(second).toMatchObject({ status: "found", data: { version: 1 } });
    expect(await service.list()).toHaveLength(1);
  });
});
