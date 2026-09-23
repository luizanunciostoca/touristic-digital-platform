import { describe, expect, it } from "vitest";

import { getV1ExplorePlaceActionOptions } from "./explore-location-actions-v1.js";

const values = (category: string): readonly string[] =>
  getV1ExplorePlaceActionOptions(category).map(({ value }) => value);

const labels = (category: string): readonly string[] =>
  getV1ExplorePlaceActionOptions(category).map(({ label }) => label);

describe("category-aware place actions", () => {
  it.each([
    [
      "restaurants",
      ["ver cardápio", "reservar mesa", "como chegar", "ver fotos", "whatsapp"],
    ],
    [
      "nightlife",
      [
        "comprar ingressos",
        "ver cardápio",
        "como chegar",
        "ver fotos",
        "programação",
        "whatsapp",
      ],
    ],
    [
      "hotels",
      ["ver acomodações", "reservar", "como chegar", "ver fotos", "whatsapp"],
    ],
    [
      "tours",
      [
        "saiba mais",
        "reservar passeio",
        "ver horários",
        "ponto de encontro",
        "ver fotos",
        "fazer tour interativo",
        "whatsapp",
      ],
    ],
    [
      "beaches",
      ["saiba mais", "como chegar", "ver fotos", "adicionar aos favoritos"],
    ],
    [
      "attractions",
      ["saiba mais", "como chegar", "ver fotos", "adicionar aos favoritos"],
    ],
    [
      "transport",
      [
        "saiba mais",
        "solicitar transporte",
        "comprar passagem",
        "ver ponto",
        "horários",
        "whatsapp",
      ],
    ],
    [
      "shops",
      [
        "saiba mais",
        "ver produtos",
        "horários",
        "whatsapp",
        "como chegar",
        "adicionar aos favoritos",
      ],
    ],
    [
      "emergencies",
      [
        "saiba mais",
        "horários",
        "whatsapp",
        "como chegar",
        "adicionar aos favoritos",
      ],
    ],
  ])("uses the canonical action sequence for %s", (category, expected) => {
    expect(values(category)).toEqual(expected);
  });

  it("uses stable action ids independently from translated labels", () => {
    expect(
      getV1ExplorePlaceActionOptions("restaurants").map(
        ({ actionId }) => actionId,
      ),
    ).toEqual([
      "restaurant.menu",
      "restaurant.reserve",
      "place.directions",
      "place.photos",
      "place.whatsapp",
    ]);
  });

  it("renders the exact Portuguese restaurant labels", () => {
    expect(labels("restaurants")).toEqual([
      "🍽️ Ver cardápio",
      "📅 Reservar mesa",
      "📍 Como chegar",
      "📸 Ver fotos",
      "💬 WhatsApp",
    ]);
  });

  it("localizes labels without changing action values or ids", () => {
    const pt = getV1ExplorePlaceActionOptions("transport", "pt");
    const en = getV1ExplorePlaceActionOptions("transport", "en");
    expect(en.map(({ value }) => value)).toEqual(pt.map(({ value }) => value));
    expect(en.map(({ actionId }) => actionId)).toEqual(
      pt.map(({ actionId }) => actionId),
    );
    expect(en.map(({ label }) => label)).toEqual([
      "ℹ️ Learn more",
      "🚕 Request transport",
      "🎫 Buy ticket",
      "📍 View stop",
      "🕐 Hours",
      "💬 WhatsApp",
    ]);
  });

  it("keeps a safe generic fallback for unknown categories", () => {
    expect(values("unknown")).toEqual([
      "saiba mais",
      "como chegar",
      "ver fotos",
      "adicionar aos favoritos",
    ]);
  });
});
