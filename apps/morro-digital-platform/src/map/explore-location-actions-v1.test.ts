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
    [
      "tours",
      [
        "reservar passeio",
        "ponto de encontro",
        "ver fotos",
        "contato",
        "mais opções",
        "[sub]tours",
      ],
    ],
    [
      "transport",
      [
        "solicitar transporte",
        "localização",
        "tarifas",
        "contato",
        "mais opções",
        "[sub]transport",
      ],
    ],
  ])("preserves the exact V1 action sequence for %s", (category, expected) => {
    expect(values(category)).toEqual(expected);
  });

  it.each(["shops", "attractions", "nightlife", "emergencies"])(
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
