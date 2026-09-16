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

describe("assistant V1 place action parity", () => {
  it.each([
    ["cardápio", "Morena Bela", "restaurants", "restaurant_menu"],
    ["contato", "Morena Bela", "restaurants", "restaurant_contact"],
    ["ver quartos", "Pousada Natureza", "hotels", "accommodation_rooms"],
    ["reservar", "Pousada Natureza", "hotels", "accommodation_booking"],
    ["reservar passeio", "Passeio de Barco Volta à Ilha", "tours", "tour_booking"],
    ["ponto de encontro", "Passeio de Barco Volta à Ilha", "tours", "tour_meeting_point"],
    ["contato", "Passeio de Barco Volta à Ilha", "tours", "tour_contact"],
    ["condições da praia", "Primeira Praia", "beaches", "beach_conditions"],
    ["solicitar transporte", "Píer de Morro de São Paulo", "transport", "transport_request"],
    ["tarifas", "Píer de Morro de São Paulo", "transport", "transport_fares"],
    ["contato", "Píer de Morro de São Paulo", "transport", "transport_contact"],
    ["horários", "Píer de Morro de São Paulo", "transport", "transport_schedules"],
    ["pontos", "Píer de Morro de São Paulo", "transport", "transport_points"],
    ["área atendida", "Píer de Morro de São Paulo", "transport", "transport_service_area"],
    ["avaliações", "Píer de Morro de São Paulo", "transport", "transport_reviews"],
  ])("routes %s deterministically for %s", (input, place, category, action) => {
    const result = resolve(input, place, category);
    expect(result).not.toBeNull();
    expect(result?.response.metadata).toMatchObject({
      domain: "v1_place_action",
      action,
      place,
      category,
      deterministic: true,
    });
    expect(result?.response.options?.length).toBeGreaterThan(0);
  });

  it("keeps the V1 restaurant secondary menu deterministic", () => {
    const result = resolve("mais opções", "Morena Bela", "restaurants");
    expect(result?.response.text).toBe("Outras informações disponíveis:");
    expect(result?.response.options?.map((option) => option.value)).toEqual([
      "mais detalhes",
      "horário de funcionamento",
      "quanto custa",
      "avaliações",
      "adicionar aos favoritos",
      "Morena Bela",
    ]);
  });

  it("keeps unavailable transport secondary information explicit", () => {
    const result = resolve(
      "mais opções",
      "Píer de Morro de São Paulo",
      "transport",
    );
    expect(result?.response).toMatchObject({
      text: "Ainda não há informações adicionais cadastradas para este transporte.",
      options: [{ label: "⬅️ Voltar", value: "Píer de Morro de São Paulo" }],
      metadata: {
        state: "unavailable",
        action: "transport_more_options",
      },
    });
  });

  it("turns the V1 transport location action into navigation confirmation", () => {
    const result = resolve(
      "localização",
      "Píer de Morro de São Paulo",
      "transport",
    );
    expect(result?.navigationDestination).toEqual({
      name: "Píer de Morro de São Paulo",
      latitude: expect.any(Number),
      longitude: expect.any(Number),
      category: "transport",
    });
    expect(result?.response).toMatchObject({
      text: "Deseja iniciar a navegação até Píer de Morro de São Paulo?",
      options: [
        { label: "Sim", value: "sim" },
        { label: "Não", value: "não" },
      ],
      metadata: {
        navigation: "awaiting_confirmation",
        action: "transport_location",
        pendingRoute: {
          name: "Píer de Morro de São Paulo",
          latitude: expect.any(Number),
          longitude: expect.any(Number),
          category: "transport",
        },
      },
    });
  });

  it("preserves the V1 multilingual unavailable copy", () => {
    expect(
      resolve("beach conditions", "Primeira Praia", "beaches", "en")?.response.text,
    ).toBe(
      "There are no reliable beach conditions registered yet. Check weather, tide and local warnings before swimming.",
    );
    expect(
      resolve("menu", "Morena Bela", "restaurants", "es")?.response.text,
    ).toBe("Este restaurante aún no tiene menú digital.");
  });

  it("does not steal unrelated commands or mismatched place context", () => {
    expect(resolve("como chegar", "Morena Bela", "restaurants")).toBeNull();
    expect(resolve("cardápio", "Primeira Praia", "beaches")).toBeNull();
    expect(
      resolveAssistantV1PlaceAction({
        input: "cardápio",
        lastPlace: null,
        lastCategory: "restaurants",
      }),
    ).toBeNull();
  });
});
