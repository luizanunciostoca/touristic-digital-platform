import { describe, expect, it } from "vitest";
import { morroInitialMapMarkers } from "./map-markers.js";

describe("morroInitialMapMarkers", () => {
  it("preserves the first V1-derived Morro de São Paulo points", () => {
    expect(morroInitialMapMarkers).toEqual([
      {
        id: "terceira-praia",
        label: "Partida: Terceira Praia",
        position: { latitude: -13.3839443, longitude: -38.9084472 },
      },
      {
        id: "fonte-grande",
        label: "Início: Fonte Grande",
        position: { latitude: -13.376543, longitude: -38.918765 },
      },
      {
        id: "retorno-por-do-sol",
        label: "Retorno no Pôr do Sol",
        position: { latitude: -13.376845, longitude: -38.917543 },
      },
    ]);
  });

  it("keeps marker identifiers unique and data immutable", () => {
    const ids = morroInitialMapMarkers.map((marker) => marker.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.isFrozen(morroInitialMapMarkers)).toBe(true);
    for (const marker of morroInitialMapMarkers) {
      expect(Object.isFrozen(marker)).toBe(true);
      expect(Object.isFrozen(marker.position)).toBe(true);
    }
  });
});
