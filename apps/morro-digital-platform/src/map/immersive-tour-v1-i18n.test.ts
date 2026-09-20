import { describe, expect, it } from "vitest";

import { getV1ImmersiveTourCopy } from "./immersive-tour-v1-i18n.js";

describe("V1 immersive tour presentation copy", () => {
  it("preserves the canonical Portuguese V1 controls and interpolation", () => {
    const copy = getV1ImmersiveTourCopy("pt-BR");

    expect([copy.start, copy.seeStops, copy.cancel]).toEqual([
      "▶️ Iniciar o tour",
      "📋 Ver todas as paradas",
      "❌ Cancelar",
    ]);
    expect(copy.stopLabel(2, 8)).toBe("Parada 2 de 8");
    expect(copy.stopsOf("Passeio Volta à Ilha")).toBe(
      "Paradas do Passeio Volta à Ilha:",
    );
    expect(copy.completedDescription(8, "Passeio Volta à Ilha")).toContain(
      "8 paradas",
    );
  });

  it.each([
    ["en-US", "▶️ Start tour", "⛵ See other tours"],
    ["es-AR", "▶️ Iniciar tour", "⛵ Ver otros paseos"],
    ["he-IL", "▶️ התחל סיור", "⛵ ראה סיורים אחרים"],
  ])(
    "keeps the V1 localized tour controls for %s",
    (locale, start, seeTours) => {
      const copy = getV1ImmersiveTourCopy(locale);
      expect(copy.start).toBe(start);
      expect(copy.seeTours).toBe(seeTours);
    },
  );
});
