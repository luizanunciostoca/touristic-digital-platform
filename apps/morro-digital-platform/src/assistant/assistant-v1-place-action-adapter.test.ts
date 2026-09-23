import { describe, expect, it } from "vitest";

import { resolveAssistantV1PlaceAction } from "./assistant-v1-place-action-adapter.js";

function resolve(
  input: string,
  lastPlace: string,
  lastCategory: string,
  language: "pt" | "en" | "es" | "he" = "pt",
) {
  return resolveAssistantV1PlaceAction({
    input,
    lastPlace,
    lastCategory,
    language,
  });
}

describe("assistant category place actions", () => {
  it.each([
    ["ver cardápio", "Morena Bela", "restaurants", "restaurant_menu"],
    ["reservar mesa", "Morena Bela", "restaurants", "restaurant_booking"],
    ["whatsapp", "Morena Bela", "restaurants", "place_whatsapp"],
    ["ver cardápio", "Toca do Morcego", "nightlife", "nightlife_menu"],
    ["programação", "Toca do Morcego", "nightlife", "nightlife_schedule"],
    ["whatsapp", "Toca do Morcego", "nightlife", "place_whatsapp"],
    ["ver acomodações", "Hotel Vista Mar", "hotels", "accommodation_rooms"],
    ["reservar", "Hotel Vista Mar", "hotels", "accommodation_booking"],
    ["whatsapp", "Hotel Vista Mar", "hotels", "place_whatsapp"],
    ["saiba mais", "Passeio de Barco Volta à Ilha", "tours", "place_info"],
    ["reservar passeio", "Passeio de Barco Volta à Ilha", "tours", "tour_booking"],
    ["ver horários", "Passeio de Barco Volta à Ilha", "tours", "tour_schedule"],
    ["ponto de encontro", "Passeio de Barco Volta à Ilha", "tours", "tour_meeting_point"],
    ["fazer tour interativo", "Passeio de Barco Volta à Ilha", "tours", "tour_interactive"],
    ["whatsapp", "Passeio de Barco Volta à Ilha", "tours", "place_whatsapp"],
    ["saiba mais", "Primeira Praia", "beaches", "place_info"],
    ["saiba mais", "Píer de Morro de São Paulo", "transport", "place_info"],
    ["solicitar transporte", "Píer de Morro de São Paulo", "transport", "transport_request"],
    ["comprar passagem", "Píer de Morro de São Paulo", "transport", "transport_ticket"],
    ["ver ponto", "Píer de Morro de São Paulo", "transport", "transport_stop"],
    ["horários", "Píer de Morro de São Paulo", "transport", "transport_schedules"],
    ["whatsapp", "Píer de Morro de São Paulo", "transport", "place_whatsapp"],
    ["saiba mais", "Absolute", "shops", "place_info"],
    ["ver produtos", "Absolute", "shops", "shop_products"],
    ["horários", "Absolute", "shops", "shop_hours"],
    ["whatsapp", "Absolute", "shops", "place_whatsapp"],
    ["saiba mais", "Posto de Saúde de Morro de São Paulo", "emergencies", "place_info"],
    ["horários", "Posto de Saúde de Morro de São Paulo", "emergencies", "emergency_hours"],
    ["whatsapp", "Posto de Saúde de Morro de São Paulo", "emergencies", "place_whatsapp"],
  ])("routes %s for %s", (input, place, category, action) => {
    const result = resolve(input, place, category);
    expect(result).not.toBeNull();
    expect(result?.response.metadata).toMatchObject({
      domain: "v1_place_action",
      action,
      place,
      category,
      deterministic: true,
    });
  });

  it("returns the canonical category actions after an unavailable action", () => {
    const result = resolve("reservar mesa", "Morena Bela", "restaurants");
    expect(result?.response.options?.map(({ value }) => value)).toEqual([
      "ver cardápio",
      "reservar mesa",
      "como chegar",
      "ver fotos",
      "whatsapp",
    ]);
  });

  it("localizes canonical actions without changing their values", () => {
    const result = resolve("menu", "Morena Bela", "restaurants", "en");
    expect(result?.response.options?.map(({ label }) => label)).toEqual([
      "🍽️ View menu",
      "📅 Reserve a table",
      "📍 Directions",
      "📸 View photos",
      "💬 WhatsApp",
    ]);
    expect(result?.response.options?.map(({ value }) => value)).toEqual([
      "ver cardápio",
      "reservar mesa",
      "como chegar",
      "ver fotos",
      "whatsapp",
    ]);
  });

  it("keeps transport location navigation compatibility", () => {
    const result = resolve(
      "localização",
      "Píer de Morro de São Paulo",
      "transport",
    );
    expect(result?.navigationDestination).toMatchObject({
      name: "Píer de Morro de São Paulo",
      category: "transport",
    });
    expect(result?.response.metadata).toMatchObject({
      action: "transport_location",
      navigation: "awaiting_confirmation",
      deterministic: true,
    });
  });

  it("does not steal commands when the place context is missing or mismatched", () => {
    expect(resolve("ver cardápio", "Primeira Praia", "beaches")).toBeNull();
    expect(
      resolveAssistantV1PlaceAction({
        input: "ver cardápio",
        lastPlace: null,
        lastCategory: "restaurants",
      }),
    ).toBeNull();
  });
});
