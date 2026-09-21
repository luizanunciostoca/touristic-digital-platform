import { describe, expect, it } from "vitest";

import {
  createDestination,
  reviseDestination,
  toCoreDestinationConfig,
  transitionDestination,
} from "./index.js";

const fixture = {
  id: "morro-de-sao-paulo",
  name: "Morro Digital",
  countryCode: "br",
  timezone: "America/Bahia",
  currency: "brl",
  defaultLocale: "pt-br",
  locales: ["pt-BR", "en-US", "pt-BR"],
  domains: ["morro.example.com"],
  center: { latitude: -13.3833, longitude: -38.9167 },
  radiusMeters: 15_000,
  branding: {
    displayName: "Morro Digital",
    shortName: "Morro",
  },
  modules: { map: true, assistant: true },
  featureFlags: { "premium-ux": true },
  createdAt: "2026-09-21T00:00:00-03:00",
} as const;

function destinationFixture() {
  const destination = createDestination(fixture);
  if (!destination) throw new Error("DESTINATION_FIXTURE_INVALID");
  return destination;
}

describe("destination domain model", () => {
  it("creates a normalized immutable draft", () => {
    const destination = destinationFixture();

    expect(destination).toMatchObject({
      id: "morro-de-sao-paulo",
      slug: "morro-de-sao-paulo",
      countryCode: "BR",
      currency: "BRL",
      defaultLocale: "pt-BR",
      locales: ["pt-BR", "en-US"],
      status: "draft",
      version: 1,
      createdAt: "2026-09-21T03:00:00.000Z",
      updatedAt: "2026-09-21T03:00:00.000Z",
    });
    expect(Object.isFrozen(destination)).toBe(true);
  });

  it("fails closed for malformed destination input", () => {
    expect(createDestination({ ...fixture, id: "../root" })).toBeNull();
    expect(
      createDestination({
        ...fixture,
        defaultLocale: "es-ES",
        locales: ["pt-BR"],
      }),
    ).toBeNull();
    expect(
      createDestination({
        ...fixture,
        center: { latitude: 91, longitude: -38.9167 },
      }),
    ).toBeNull();
    expect(
      createDestination({
        ...fixture,
        domains: ["https://morro.example.com"],
      }),
    ).toBeNull();
  });

  it("revises governed fields and increments version", () => {
    const current = destinationFixture();
    const revised = reviseDestination(
      current,
      {
        name: "Morro Digital Premium",
        modules: { map: true, assistant: false },
      },
      "2026-09-21T04:00:00.000Z",
    );

    expect(revised).toMatchObject({
      id: current.id,
      slug: current.slug,
      name: "Morro Digital Premium",
      version: 2,
      updatedAt: "2026-09-21T04:00:00.000Z",
      modules: { map: true, assistant: false },
    });
  });

  it("enforces lifecycle transitions and terminal archive state", () => {
    const draft = destinationFixture();
    expect(
      transitionDestination(draft, {
        status: "suspended",
        transitionedAt: "2026-09-21T04:00:00.000Z",
      }),
    ).toBeNull();

    const active = transitionDestination(draft, {
      status: "active",
      transitionedAt: "2026-09-21T04:00:00.000Z",
    });
    if (!active) throw new Error("DESTINATION_ACTIVATION_FAILED");
    expect(active).toMatchObject({
      status: "active",
      version: 2,
      activatedAt: "2026-09-21T04:00:00.000Z",
    });

    const archived = transitionDestination(active, {
      status: "archived",
      transitionedAt: "2026-09-21T05:00:00.000Z",
    });
    if (!archived) throw new Error("DESTINATION_ARCHIVE_FAILED");
    expect(archived.status).toBe("archived");
    expect(
      reviseDestination(
        archived,
        { name: "Mutation after archive" },
        "2026-09-21T06:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("projects the governed record into the core destination contract", () => {
    const destination = destinationFixture();
    expect(toCoreDestinationConfig(destination)).toMatchObject({
      id: destination.id,
      name: destination.name,
      countryCode: "BR",
      timezone: "America/Bahia",
      currency: "BRL",
      center: destination.center,
      radiusMeters: 15_000,
      modules: { map: true, assistant: true },
    });
  });
});
