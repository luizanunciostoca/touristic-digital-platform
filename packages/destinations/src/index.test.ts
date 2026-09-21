import { describe, expect, it } from "vitest";
import { sanitizeDestinationInput } from "./index.js";

describe("Destination owner contract", () => {
  it("accepts a complete governed destination", () => {
    expect(
      sanitizeDestinationInput({
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
      }),
    ).not.toBeNull();
  });

  it("rejects unsafe or structurally invalid configuration", () => {
    expect(
      sanitizeDestinationInput({
        id: "../production",
        status: "active",
        locale: "pt-BR",
        timezone: "America/Bahia",
        currency: "BRL",
        branding: { name: "Morro", shortName: "Morro", tagline: "Morro" },
        center: { lat: 200, lng: -38, zoom: 13 },
        modules: [],
        featureFlags: {},
      }),
    ).toBeNull();
  });
});
