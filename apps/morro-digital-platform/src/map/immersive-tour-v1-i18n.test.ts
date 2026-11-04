import { describe, expect, it } from "vitest";

import { getV1ImmersiveTourCopy } from "./immersive-tour-v1-i18n.js";

describe("V1 immersive tour presentation copy", () => {
  it("clarifies the Portuguese map presentation controls and preserves interpolation", () => {
    const copy = getV1ImmersiveTourCopy("pt-BR");

    expect([copy.start, copy.seeStops, copy.cancel]).toEqual([
      "▶️ Explorar roteiro no mapa",
      "📋 Ver todas as paradas",
      "❌ Cancelar",
    ]);
    expect(copy.next).toBe("➡️ Ver próxima parada");
    expect(copy.stopLabel(2, 8)).toBe("Parada 2 de 8");
    expect(copy.stopsOf("Passeio Volta à Ilha")).toBe(
      "Paradas do Passeio Volta à Ilha:",
    );
    expect(copy.completedDescription(8, "Passeio Volta à Ilha")).toContain(
      "8 paradas",
    );
  });

  it.each([
    [
      "en-US",
      "▶️ Explore itinerary on the map",
      "➡️ View next stop",
      "⛵ See other tours",
    ],
    [
      "es-AR",
      "▶️ Explorar el itinerario en el mapa",
      "➡️ Ver siguiente parada",
      "⛵ Ver otros paseos",
    ],
    [
      "he-IL",
      "▶️ חקור את המסלול במפה",
      "➡️ צפה בעצירה הבאה",
      "⛵ ראה סיורים אחרים",
    ],
  ])(
    "clarifies the localized map presentation controls for %s",
    (locale, start, next, seeTours) => {
      const copy = getV1ImmersiveTourCopy(locale);
      expect(copy.start).toBe(start);
      expect(copy.next).toBe(next);
      expect(copy.seeTours).toBe(seeTours);
    },
  );
});
