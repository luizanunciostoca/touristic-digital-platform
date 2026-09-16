import { describe, expect, it } from "vitest";

import { resolveAssistantV1History } from "./assistant-v1-history-adapter.js";

describe("V1 history command parity", () => {
  it("ignores non-history input", () => {
    expect(resolveAssistantV1History("praias", [], "pt")).toBeNull();
  });

  it.each([
    ["pt", "Seu histórico está vazio. Gostaria de começar uma nova busca?"],
    ["en", "Your history is empty. Would you like to start a new search?"],
    [
      "es",
      "Tu historial está vacío. ¿Te gustaría comenzar una nueva búsqueda?",
    ],
    ["he", "ההיסטוריה שלך ריקה. האם תרצה להתחיל חיפוש חדש?"],
  ] as const)("localizes the empty state in %s", (language, expected) => {
    expect(resolveAssistantV1History("meu histórico", [], language)?.text).toBe(
      expected,
    );
  });

  it("preserves the canonical V1 last-five formatting", () => {
    const history = Array.from({ length: 7 }, (_, index) => ({
      input: `pergunta ${index + 1}`,
      response: `resposta ${index + 1}`,
      timestamp: index + 1,
    }));
    const response = resolveAssistantV1History("historico", history, "pt");
    expect(response?.text).toContain("Seu histórico recente:");
    expect(response?.text).not.toContain("pergunta 1");
    expect(response?.text).not.toContain("pergunta 2");
    expect(response?.text).toContain(
      "Você: pergunta 3\nAssistente: resposta 3",
    );
    expect(response?.text).toContain(
      "Você: pergunta 7\nAssistente: resposta 7",
    );
    expect(response?.text).toContain(
      "Deseja saber mais sobre algum desses locais?",
    );
    expect(response?.metadata?.count).toBe(5);
  });
});
