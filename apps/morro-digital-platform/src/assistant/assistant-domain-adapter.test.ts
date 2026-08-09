import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_PROFILE_STORAGE_KEY,
  createDefaultAssistantContext,
  type AssistantDialogIntentHandlerContext,
} from "@touristic/assistant";
import { createAssistantBrowserDomainHandlers } from "./assistant-domain-adapter.js";

function request(
  intent: AssistantDialogIntentHandlerContext["intent"]["intent"],
): AssistantDialogIntentHandlerContext {
  return {
    input: intent,
    intent: {
      intent,
      confidence: 1,
      entities: {},
      normalized: intent,
      modifiers: [],
    },
    context: createDefaultAssistantContext(() => 1),
  };
}

describe("assistant browser domain adapter", () => {
  it("returns a useful empty favorites state", () => {
    const handlers = createAssistantBrowserDomainHandlers();
    expect(handlers.favorites?.(request("favorites"))).toEqual({
      text: "Você ainda não adicionou lugares aos favoritos.",
      metadata: { domain: "favorites", count: 0 },
    });
  });

  it("reads persisted favorites from the V2 profile", async () => {
    const store = new Map<string, string>();
    store.set(
      ASSISTANT_PROFILE_STORAGE_KEY,
      JSON.stringify({
        favoritePlaces: [
          { name: "Toca do Morcego" },
          { name: "Segunda Praia" },
        ],
      }),
    );
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const handlers = createAssistantBrowserDomainHandlers({ storage });
    const response = await handlers.favorites?.(request("favorites"));
    expect(response).toEqual({
      text: "Seus favoritos: Toca do Morcego, Segunda Praia.",
      options: [
        { label: "Toca do Morcego", value: "Toca do Morcego" },
        { label: "Segunda Praia", value: "Segunda Praia" },
      ],
      metadata: { domain: "favorites", count: 2 },
    });
  });

  it("resolves browser geolocation without leaking browser APIs into domain", async () => {
    const position: GeolocationPosition = {
      coords: {
        latitude: -13.376,
        longitude: -38.917,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: 1,
      toJSON: () => ({}),
    };
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success(position);
      }),
    };
    const handlers = createAssistantBrowserDomainHandlers({ geolocation });
    const response = await handlers.my_location?.(request("my_location"));
    expect(response).toEqual({
      text: "Localização atualizada com sucesso.",
      metadata: {
        domain: "my_location",
        state: "resolved",
        location: { lat: -13.376, lon: -38.917, accuracy: 10 },
      },
    });
  });

  it("keeps help local and deterministic", async () => {
    const handlers = createAssistantBrowserDomainHandlers();
    const response = await handlers.help?.(request("help"));
    expect(response).toEqual({
      text: "Posso ajudar com praias, restaurantes, pousadas, atrações, passeios, vida noturna, localização, favoritos e rotas.",
      options: [
        { label: "Praias", value: "praias" },
        { label: "Restaurantes", value: "restaurantes" },
        { label: "Pousadas", value: "pousadas" },
        { label: "Atrações", value: "atrações" },
      ],
      metadata: { domain: "help" },
    });
  });
});
