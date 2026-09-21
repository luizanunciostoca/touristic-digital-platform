import { describe, expect, it } from "vitest";

import { MySqlDestinationRepository } from "./mysql-destination-repository.js";

function row(overrides = {}) {
  return {
    destination_id: "morro-de-sao-paulo",
    status: "active",
    locale: "pt-BR",
    timezone: "America/Bahia",
    currency: "BRL",
    branding_json: JSON.stringify({
      name: "Morro Digital",
      shortName: "Morro",
      tagline: "Descubra Morro",
    }),
    center_json: JSON.stringify({ lat: -13.3781, lng: -38.9132, zoom: 13.5 }),
    modules_json: JSON.stringify(["explore", "navigation"]),
    feature_flags_json: JSON.stringify({ assistant: true }),
    version: 1,
    created_at: "2026-09-20T23:00:00.000Z",
    updated_at: "2026-09-20T23:00:00.000Z",
    ...overrides,
  };
}

describe("MySqlDestinationRepository", () => {
  it("rehydrates and revalidates persisted JSON", async () => {
    const pool = {
      execute: async () => [[row()], []],
      query: async () => [[row()], []],
    };
    const repository = new MySqlDestinationRepository(pool as never);
    await expect(repository.get("morro-de-sao-paulo")).resolves.toMatchObject({
      id: "morro-de-sao-paulo",
      version: 1,
      center: { lat: -13.3781 },
    });
  });

  it("fails closed for corrupted persisted configuration", async () => {
    const pool = {
      execute: async () => [
        [row({ center_json: JSON.stringify({ lat: 999, lng: 0, zoom: 1 }) })],
        [],
      ],
    };
    const repository = new MySqlDestinationRepository(pool as never);
    await expect(repository.get("morro-de-sao-paulo")).rejects.toThrow(
      "DESTINATION_INVALID_PERSISTED_DOCUMENT",
    );
  });

  it("uses compare-and-swap version on replacement", async () => {
    const calls: unknown[][] = [];
    const pool = {
      execute: async (_sql: string, values: unknown[]) => {
        calls.push(values);
        return [{ affectedRows: 1 }, []];
      },
    };
    const repository = new MySqlDestinationRepository(pool as never);
    const current = {
      id: "morro-de-sao-paulo",
      status: "active",
      locale: "pt-BR",
      timezone: "America/Bahia",
      currency: "BRL",
      branding: {
        name: "Morro Digital",
        shortName: "Morro",
        tagline: "Descubra Morro",
      },
      center: { lat: -13.3781, lng: -38.9132, zoom: 13.5 },
      modules: ["explore"],
      featureFlags: { assistant: true },
      version: 1,
      createdAt: "2026-09-20T23:00:00.000Z",
      updatedAt: "2026-09-20T23:00:00.000Z",
    } as const;
    await expect(
      repository.replace(current, { ...current, version: 2 }),
    ).resolves.toBe(true);
    expect(calls[0]?.at(-1)).toBe(1);
  });
});
