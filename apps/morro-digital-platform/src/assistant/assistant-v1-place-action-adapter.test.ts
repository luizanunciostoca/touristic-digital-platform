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
    ["avaliações", "Morena Bela", "restaurants", "restaurant_reviews"],
    ["ver quartos", "Pousada Natureza", "hotels", "accommodation_rooms"],
    ["reservar", "Pousada Natureza", "hotels", "accommodation_booking"],
    ["compartilhar", "Pousada Natureza", "hotels", "accommodation_share"],
    [
      "reservar passeio",
      "Passeio de Barco Volta à Ilha",
      "tours",
      "tour_booking",
    ],
    [
      "ponto de encontro",
      "Passeio de Barco Volta à Ilha",
      "tours",
      "tour_meeting_point",
    ],
    ["contato", "Passeio de Barco Volta à Ilha", "tours", "tour_contact"],
    ["condições da praia", "Primeira Praia", "beaches", "beach_conditions"],
    [
      "solicitar transporte",
      "Píer de Morro de São Paulo",
      "transport",
      "transport_request",
    ],
    ["tarifas", "Píer de Morro de São Paulo", "transport", "transport_fares"],
    ["contato", "Píer de Morro de São Paulo", "transport", "transport_contact"],
    [
      "horários",
      "Píer de Morro de São Paulo",
      "transport",
      "transport_schedules",
    ],
    ["pontos", "Píer de Morro de São Paulo", "transport", "transport_points"],
    [
      "área atendida",
      "Píer de Morro de São Paulo",
      "transport",
      "transport_service_area",
    ],
    [
      "avaliações",
      "Píer de Morro de São Paulo",
      "transport",
      "transport_reviews",
    ],
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

  it("keeps review/share secondary actions deterministic and localized", () => {
    expect(
      resolve("reviews", "Morena Bela", "restaurants", "en")?.response,
    ).toMatchObject({
      text: "No reviews are registered for this restaurant yet.",
      metadata: { action: "restaurant_reviews", deterministic: true },
    });
    expect(
      resolve("share", "Pousada Natureza", "hotels", "en")?.response,
    ).toMatchObject({
      text: "Sharing this accommodation is not available in the assistant yet.",
      metadata: { action: "accommodation_share", deterministic: true },
    });
  });

  it.each([
    ["mais opções", "pt"],
    ["outras opções", "pt"],
    ["more options", "en"],
    ["más opciones", "es"],
    ["אפשרויות נוספות", "he"],
  ] as const)(
    "routes the %s secondary-menu alias deterministically",
    (input, language) => {
      expect(
        resolve(input, "Morena Bela", "restaurants", language)?.response
          .metadata,
      ).toMatchObject({
        action: "restaurant_more_options",
        deterministic: true,
      });
    },
  );

  it.each([
    [
      "location",
      "en",
      "Would you like to start navigation to Píer de Morro de São Paulo?",
      "Yes",
      "No",
    ],
    [
      "ubicación",
      "es",
      "¿Deseas iniciar la navegación hasta Píer de Morro de São Paulo?",
      "Sí",
      "No",
    ],
    [
      "מיקום",
      "he",
      "האם תרצה להתחיל ניווט אל Píer de Morro de São Paulo?",
      "כן",
      "לא",
    ],
  ] as const)(
    "localizes transport confirmation for %s",
    (input, language, text, yes, no) => {
      const result = resolve(
        input,
        "Píer de Morro de São Paulo",
        "transport",
        language,
      );
      expect(result?.response.text).toBe(text);
      expect(result?.response.options).toEqual([
        { label: yes, value: "sim" },
        { label: no, value: "não" },
      ]);
      expect(result?.response.metadata).toMatchObject({
        action: "transport_location",
        navigation: "awaiting_confirmation",
        deterministic: true,
      });
    },
  );

  it("keeps deterministic place-action options in the active locale", () => {
    const result = resolve("menu", "Morena Bela", "restaurants", "en");
    expect(result?.response.options?.map(({ label }) => label)).toEqual([
      "🍴 Menu",
      "📍 Directions",
      "📸 View photos",
      "📞 Contact",
      "More options",
      "⬅️ Back",
    ]);
  });

  it("localizes secondary place-action presentation without changing values", () => {
    const result = resolve("more options", "Morena Bela", "restaurants", "en");
    expect(
      result?.response.options?.map(({ label, value }) => ({ label, value })),
    ).toEqual([
      { label: "ℹ️ Information", value: "mais detalhes" },
      { label: "🕒 Hours", value: "horário de funcionamento" },
      { label: "💰 Price range", value: "quanto custa" },
      { label: "⭐ Reviews", value: "avaliações" },
      { label: "❤️ Favorite", value: "adicionar aos favoritos" },
      { label: "⬅️ Back", value: "Morena Bela" },
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
    expect(result?.navigationDestination).toMatchObject({
      name: "Píer de Morro de São Paulo",
      category: "transport",
    });
    expect(
      Number.isFinite(result?.navigationDestination?.latitude ?? Number.NaN),
    ).toBe(true);
    expect(
      Number.isFinite(result?.navigationDestination?.longitude ?? Number.NaN),
    ).toBe(true);
    expect(result?.response).toMatchObject({
      text: "Deseja iniciar a navegação até Píer de Morro de São Paulo?",
      options: [
        { label: "Sim", value: "sim" },
        { label: "Não", value: "não" },
      ],
      metadata: {
        navigation: "awaiting_confirmation",
        action: "transport_location",
      },
    });
    expect(result?.response.metadata?.pendingRoute).toEqual(
      result?.navigationDestination,
    );
  });

  it("preserves the V1 multilingual unavailable copy", () => {
    expect(
      resolve("beach conditions", "Primeira Praia", "beaches", "en")?.response
        .text,
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
