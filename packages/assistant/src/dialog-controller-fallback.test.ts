import { describe, expect, it, vi } from "vitest";

import {
  createAssistantDialogController,
  type AssistantDialogContextPort,
} from "./dialog-controller.js";
import { createDefaultAssistantContext } from "./context-manager.js";

function contextPort(initialFallbackCount = 0): AssistantDialogContextPort {
  let context = createDefaultAssistantContext(() => 1_000);
  context.fallbackCount = initialFallbackCount;
  return {
    getContext: () => structuredClone(context),
    updateContext: (updates) => {
      context = { ...context, ...updates };
    },
    addToHistory: (entry) => {
      context.history = [
        ...context.history,
        {
          input: entry.input ?? "",
          response: entry.response ?? "",
          timestamp: entry.timestamp ?? 1_000,
        },
      ];
    },
  };
}

describe("assistant V1 fallback recovery lifecycle", () => {
  it("increments fallbackCount when deterministic and LLM handling both fail", async () => {
    const context = contextPort();
    const llm = vi.fn(async () => null);
    const controller = createAssistantDialogController({
      context,
      llm,
      defaultResponse: () => ({ text: "Não entendi." }),
    });

    const response = await controller.processUserInput(
      "xyz qwerty incompreensivel",
    );

    expect(response.text).toBe("Não entendi.");
    expect(llm).toHaveBeenCalledOnce();
    expect(context.getContext().fallbackCount).toBe(1);
  });

  it("escalates after the V1 threshold and resets the counter", async () => {
    const context = contextPort(3);
    const controller = createAssistantDialogController({
      context,
      llm: async () => null,
      defaultResponse: () => ({ text: "Não entendi." }),
    });

    const response = await controller.processUserInput(
      "outra mensagem desconhecida",
    );

    expect(response.metadata).toEqual({
      domain: "fallback",
      state: "escalated",
    });
    expect(response.options?.map((option) => option.value)).toEqual([
      "Ajuda",
      "Praias",
      "Restaurantes",
    ]);
    expect(context.getContext().fallbackCount).toBe(0);
  });

  it("resets fallbackCount after a recognized local response", async () => {
    const context = contextPort(2);
    const controller = createAssistantDialogController({
      context,
      handlers: {
        help: () => ({ text: "Ajuda local." }),
      },
    });

    const response = await controller.processUserInput("ajuda");

    expect(response.text).toBe("Ajuda local.");
    expect(context.getContext().fallbackCount).toBe(0);
  });

  it("preserves the user's canonical casing when recording a known place", async () => {
    const context = contextPort();
    const recordInteraction = vi.fn();
    const controller = createAssistantDialogController({
      context,
      profile: { recordInteraction },
      handlers: {
        more_info: () => ({ text: "Detalhes." }),
      },
    });

    await controller.processUserInput("Fale sobre Primeira Praia");

    expect(recordInteraction).toHaveBeenCalledWith(
      "Fale sobre Primeira Praia",
      "beaches",
      { name: "Primeira Praia", category: "beaches" },
    );
  });
});
