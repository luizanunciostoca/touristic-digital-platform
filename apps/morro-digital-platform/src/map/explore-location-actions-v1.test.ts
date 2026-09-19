import { describe, expect, it } from "vitest";

import { getV1ExplorePlaceActionOptions } from "./explore-location-actions-v1.js";

function values(category: string): readonly string[] {
  return getV1ExplorePlaceActionOptions(category).map(({ value }) => value);
}

describe("V1 explore post-detail actions", () => {
  it.each([
    [
      "restaurants",
      [
        "cardápio",
        "como chegar",
        "ver fotos",
        "contato",
        "mais opções",
        "[sub]restaurants",
      ],
    ],
    [
      "hotels",
      [
        "ver quartos",
        "reservar",
        "como chegar",
        "ver fotos",
        "mais opções",
        "[sub]hotels",
      ],
    ],
    [
      "beaches",
      [
        "condições da praia",
        "como chegar",
        "ver fotos",
        "informações",
        "mais opções",
        "[sub]beaches",
      ],
    ],
  ])("preserves the non-commerce V1 action sequence for %s", (category, expected) => {
    expect(values(category)).toEqual(expected);
  });

  it.each([
    [
      "tours",
      [
        "ponto de encontro",
        "ver fotos",
        "contato",
        "adicionar aos favoritos",
      ],
    ],
    [
      "nightlife",
      [
        "como chegar",
        "ver fotos",
        "mais detalhes",
        "adicionar aos favoritos",
      ],
    ],
    [
      "transport",
      [
        "localização",
        "tarifas",
        "contato",
        "adicionar aos favoritos",
      ],
    ],
  ])(
    "keeps a four-action 2x2 information grid for commerce category %s",
    (category, expected) => {
      expect(values(category)).toEqual(expected);
    },
  );

  it.each(["shops", "attractions", "emergencies"])(
    "uses the V1 generic fallback for %s",
    (category) => {
      expect(values(category)).toEqual([
        "como chegar",
        "ver fotos",
        "mais detalhes",
        "adicionar aos favoritos",
      ]);
    },
  );

  it.each([
    [
      "en",
      [
        "🍴 Menu",
        "📍 Directions",
        "📸 View photos",
        "📞 Contact",
        "More options",
        "⬅️ Back",
      ],
    ],
    [
      "es",
      [
        "🍴 Menú",
        "📍 Cómo llegar",
        "📸 Ver fotos",
        "📞 Contacto",
        "Más opciones",
        "⬅️ Volver",
      ],
    ],
    [
      "he",
      [
        "🍴 תפריט",
        "📍 איך להגיע",
        "📸 צפה תמונות",
        "📞 יצירת קשר",
        "אפשרויות נוספות",
        "⬅️ חזרה",
      ],
    ],
  ] as const)(
    "localizes restaurant place actions for %s",
    (locale, expected) => {
      expect(
        getV1ExplorePlaceActionOptions("restaurants", locale).map(
          ({ label }) => label,
        ),
      ).toEqual(expected);
      expect(values("restaurants")).toEqual(
        getV1ExplorePlaceActionOptions("restaurants", locale).map(
          ({ value }) => value,
        ),
      );
    },
  );

  it("localizes the four commerce-grid actions without changing their command values", () => {
    expect(
      getV1ExplorePlaceActionOptions("tours", "en").map(({ label }) => label),
    ).toEqual([
      "📍 Meeting point",
      "📸 View photos",
      "📞 Contact",
      "❤️ Favorite",
    ]);
    expect(values("tours")).toEqual([
      "ponto de encontro",
      "ver fotos",
      "contato",
      "adicionar aos favoritos",
    ]);
  });

  it("preserves the exact user-visible restaurant labels", () => {
    expect(
      getV1ExplorePlaceActionOptions("restaurants").map(({ label }) => label),
    ).toEqual([
      "🍴 Cardápio",
      "📍 Como chegar",
      "📸 Ver fotos",
      "📞 Contato",
      "Mais opções",
      "⬅️ Voltar",
    ]);
  });
});
