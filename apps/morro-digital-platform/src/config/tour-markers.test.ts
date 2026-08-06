import { describe, expect, it } from "vitest";
import { createMorroTourMarkers } from "./tour-markers.js";

describe("createMorroTourMarkers", () => {
  it("projects the complete Volta à Ilha route into ordered markers", () => {
    const markers = createMorroTourMarkers("volta-a-ilha");

    expect(markers).toHaveLength(8);
    expect(markers[0]).toEqual({
      id: "volta-a-ilha:stop-1",
      label: "1. Partida: Terceira Praia",
      position: { latitude: -13.3839443, longitude: -38.9084472 },
    });
    expect(markers[7]).toEqual({
      id: "volta-a-ilha:stop-8",
      label: "8. Retorno no Pôr do Sol",
      position: { latitude: -13.376845, longitude: -38.917543 },
    });
  });

  it("keeps projected marker data immutable", () => {
    const markers = createMorroTourMarkers("trilha-gamboa");

    expect(Object.isFrozen(markers)).toBe(true);
    for (const marker of markers) {
      expect(Object.isFrozen(marker)).toBe(true);
      expect(Object.isFrozen(marker.position)).toBe(true);
    }
  });

  it("rejects an unknown route", () => {
    expect(() => createMorroTourMarkers("unknown-tour")).toThrow(
      "Unknown Morro tour: unknown-tour.",
    );
  });
});
