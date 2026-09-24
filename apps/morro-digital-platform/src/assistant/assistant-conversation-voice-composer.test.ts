import { describe, expect, it } from "vitest";

import { composeConversationVoice } from "./assistant-conversation-voice-composer.js";

describe("assistant conversation voice composer", () => {
  it("keeps PT-BR voice copy shorter and contextual", () => {
    const voice = composeConversationVoice({
      messageKey: "place_selected",
      language: "pt",
      fallback:
        "Essa é a Segunda Praia. Posso te levar até lá ou você pode ver mais informações primeiro.",
      place: "Segunda Praia",
    });

    expect(voice).toBe(
      "Essa é Segunda Praia. Posso mostrar detalhes ou preparar uma rota.",
    );
    expect(voice.length).toBeLessThan(90);
  });

  it("uses deterministic locale-specific navigation voice copy", () => {
    expect(
      composeConversationVoice({
        messageKey: "navigation_active",
        language: "en",
        fallback: "Navigation is active.",
        place: "Second Beach",
      }),
    ).toBe("We're on the way to Second Beach.");

    expect(
      composeConversationVoice({
        messageKey: "navigation_active",
        language: "es",
        fallback: "Navegación activa.",
        place: "Segunda Playa",
      }),
    ).toBe("Vamos camino a Segunda Playa.");
  });

  it("falls back only for unknown semantic message keys", () => {
    expect(
      composeConversationVoice({
        messageKey: "custom_unknown_state",
        language: "pt",
        fallback: "Resposta falada específica.",
      }),
    ).toBe("Resposta falada específica.");
  });
});
