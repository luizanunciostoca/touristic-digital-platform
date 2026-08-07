import { describe, expect, it } from "vitest";
import {
  defineTourRoute,
  getMorroTourById,
  morroTourCatalog,
} from "./tour-catalog.js";

describe("morroTourCatalog", () => {
  it("preserves the three V1 tour structures and stop counts", () => {
    expect(
      morroTourCatalog.map((tour) => ({
        id: tour.id,
        stops: tour.stops.length,
      })),
    ).toEqual([
      { id: "volta-a-ilha", stops: 8 },
      { id: "trilha-gamboa", stops: 5 },
      { id: "passeio-quadriciclo", stops: 5 },
    ]);
  });

  it("preserves representative V1 coordinates and terminology", () => {
    const voltaAIlha = getMorroTourById("volta-a-ilha");
    const trilhaGamboa = getMorroTourById("trilha-gamboa");
    const passeioQuadriciclo = getMorroTourById("passeio-quadriciclo");

    expect(voltaAIlha?.stops[1]).toMatchObject({
      title: "Piscinas Naturais de Garapuá",
      position: { latitude: -13.4769538, longitude: -38.9165457 },
    });
    expect(trilhaGamboa?.stops[3]).toMatchObject({
      title: "Paredão de Argila",
      position: { latitude: -13.388765, longitude: -38.934567 },
    });
    expect(passeioQuadriciclo?.stops[3]).toMatchObject({
      title: "Mirante do Zimbo",
      position: { latitude: -13.418765, longitude: -38.915432 },
    });
  });

  it("deep-freezes routes, stops and positions", () => {
    expect(Object.isFrozen(morroTourCatalog)).toBe(true);

    for (const tour of morroTourCatalog) {
      expect(Object.isFrozen(tour)).toBe(true);
      expect(Object.isFrozen(tour.startPoint)).toBe(true);
      expect(Object.isFrozen(tour.stops)).toBe(true);
      for (const stop of tour.stops) {
        expect(Object.isFrozen(stop)).toBe(true);
        expect(Object.isFrozen(stop.position)).toBe(true);
      }
    }
  });

  it("returns undefined for an unknown tour", () => {
    expect(getMorroTourById("unknown-tour")).toBeUndefined();
  });

  it("rejects duplicate stop ids and non-sequential orders", () => {
    const route = {
      id: "invalid-route",
      titleKey: "invalid_title",
      title: "Invalid route",
      descriptionKey: "invalid_desc",
      description: "Invalid route for validation.",
      durationKey: "invalid_duration",
      duration: "1 hour",
      transportKey: "invalid_transport",
      transport: "Walking",
      startPoint: { latitude: -13.38, longitude: -38.91 },
      stops: [
        {
          id: "stop-1",
          order: 2,
          titleKey: "invalid_stop_title",
          title: "Invalid stop",
          position: { latitude: -13.38, longitude: -38.91 },
          photoPath: "./invalid.jpg",
          photoAlt: "Invalid stop",
        },
        {
          id: "stop-1",
          order: 2,
          titleKey: "invalid_stop_title_2",
          title: "Invalid stop 2",
          position: { latitude: -13.39, longitude: -38.92 },
          photoPath: "./invalid-2.jpg",
          photoAlt: "Invalid stop 2",
        },
      ],
    } as const;

    expect(() => defineTourRoute(route)).toThrow("duplicate stop ids");
  });
});
