import { describe, expect, it, vi } from "vitest";

import {
  createAssistantDialogController,
  type AssistantDialogContextPort,
  type AssistantDialogIntentHandlerContext,
} from "./dialog-controller.js";
import { createDefaultAssistantContext } from "./context-manager.js";

function createContextPort(
  overrides: Partial<ReturnType<typeof createDefaultAssistantContext>> = {},
): AssistantDialogContextPort {
  let state = { ...createDefaultAssistantContext(() => 1000), ...overrides };
  return {
    getContext: () => structuredClone(state),
    updateContext: (updates) => {
      state = { ...state, ...updates };
    },
    addToHistory: (entry) => {
      state.history = [
        ...state.history,
        {
          input: entry.input ?? "",
          response: entry.response ?? "",
          timestamp: entry.timestamp ?? 1000,
        },
      ];
    },
  };
}

describe("assistant V1 dialog controller orchestration", () => {
  it("returns the default response for empty input", async () => {
    const controller = createAssistantDialogController({
      context: createContextPort(),
      defaultResponse: () => ({ text: "default" }),
    });

    await expect(controller.processUserInput("")).resolves.toEqual({
      text: "default",
    });
  });

  it("routes a local intent before considering LLM fallback", async () => {
    const local = vi.fn(() => ({ text: "local weather" }));
    const llm = vi.fn(() => ({ text: "llm" }));
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      handlers: { weather: local },
      llm,
    });

    await expect(
      controller.processUserInput("Como está o tempo?"),
    ).resolves.toEqual({
      text: "local weather",
    });
    expect(local).toHaveBeenCalledOnce();
    expect(llm).not.toHaveBeenCalled();
    expect(context.getContext().lastIntent).toBe("weather");
    expect(context.getContext().history.at(-1)?.response).toBe("local weather");
  });

  it("uses the LLM port only after local handling yields no response", async () => {
    const local = vi.fn(() => null);
    const llm = vi.fn(() => ({ text: "llm history" }));
    const controller = createAssistantDialogController({
      context: createContextPort(),
      handlers: { cultural_history: local },
      llm,
    });

    await expect(
      controller.processUserInput("Qual é a história do Forte de Tapirandu?"),
    ).resolves.toEqual({ text: "llm history" });
    expect(local).toHaveBeenCalledOnce();
    expect(llm).toHaveBeenCalledOnce();
  });

  it("preserves awaiting context when classifying confirmations", async () => {
    let captured: AssistantDialogIntentHandlerContext | undefined;
    const confirm = vi.fn((request: AssistantDialogIntentHandlerContext) => {
      captured = request;
      return { text: "confirmed" };
    });
    const context = createContextPort({
      awaiting: { type: "confirmar_navegacao" },
      lastPlace: "Farol do Morro",
    });
    const controller = createAssistantDialogController({
      context,
      handlers: { confirm },
    });

    await expect(controller.processUserInput("sim")).resolves.toEqual({
      text: "confirmed",
    });
    expect(captured?.intent.contextual).toBe(true);
    expect(captured?.context.lastPlace).toBe("Farol do Morro");
  });

  it("updates category context and records the user profile after classification", async () => {
    const recordInteraction = vi.fn();
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      profile: { recordInteraction },
      handlers: {
        category_beaches: () => ({ text: "beaches" }),
      },
    });

    await controller.processUserInput("praias");

    expect(recordInteraction).toHaveBeenCalledWith("praias", "beaches");
    expect(context.getContext().lastCategory).toBe("beaches");
    expect(context.getContext().lastIntent).toBe("category_beaches");
  });

  it("returns the error response without corrupting history when a port fails", async () => {
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      handlers: {
        help: () => {
          throw new Error("boom");
        },
      },
      errorResponse: () => ({ text: "error" }),
    });

    await expect(controller.processUserInput("ajuda")).resolves.toEqual({
      text: "error",
    });
    expect(context.getContext().history).toEqual([]);
  });
});
