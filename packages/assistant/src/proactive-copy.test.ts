import { describe, expect, it } from "vitest";

import { ASSISTANT_PROACTIVE_CONTENT_COPY } from "./proactive-copy.js";

describe("assistant V1 proactive copy contract", () => {
  it("locks the Portuguese contextual copy", () => {
    const copy = ASSISTANT_PROACTIVE_CONTENT_COPY.pt;

    expect(copy.returnToPlacePrefix).toBe("🔄 Voltar a ");
    expect(copy.labels.sunriseHike).toBe("Trilha ao nascer do sol");
    expect(copy.intro.sunset).toBe(
      "{timeGreeting}! Hora mágica do pôr do sol em Morro! Não perca 🌅",
    );
    expect(copy.smartOptions).toEqual([
      "Ver no mapa",
      "Como chegar",
      "Ver fotos",
      "Outras sugestões",
      "Voltar ao menu",
    ]);
  });

  it("locks the English V1 resume prefix and recommendation copy", () => {
    const copy = ASSISTANT_PROACTIVE_CONTENT_COPY.en;

    expect(copy.returnToPlacePrefix).toBe("🔄 Back to ");
    expect(copy.recommendations.toca).toBe(
      "🌇 **Toca do Morcego** — the island's best sunset, don't miss it!",
    );
    expect(copy.smartOptions[1]).toBe("Get directions");
  });

  it("locks the Spanish V1 place naming instead of Portuguese aliases", () => {
    const copy = ASSISTANT_PROACTIVE_CONTENT_COPY.es;

    expect(copy.labels.sunriseHike).toBe("Caminata al amanecer");
    expect(copy.recommendations.secondBeach).toContain("**Segunda Playa**");
    expect(copy.recommendations.fourthBeach).toContain("**Cuarta Playa**");
    expect(copy.smartOptions).toEqual([
      "Ver en el mapa",
      "Cómo llegar",
      "Ver fotos",
      "Otras sugerencias",
      "Volver al menú",
    ]);
  });

  it("locks the Hebrew V1 contextual copy", () => {
    const copy = ASSISTANT_PROACTIVE_CONTENT_COPY.he;

    expect(copy.returnToPlacePrefix).toBe("🔄 חזרה אל ");
    expect(copy.labels.rainyDay).toBe("יום גשום — מה לעשות?");
    expect(copy.smartOptions).toEqual([
      "הצג במפה",
      "איך להגיע",
      "צפה בתמונות",
      "הצעות נוספות",
      "חזרה לתפריט",
    ]);
  });
});
