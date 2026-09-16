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

  it("persists awaiting_place and routes the next turn to the requested intent", async () => {
    const photos = vi
      .fn<
        (request: AssistantDialogIntentHandlerContext) => {
          text: string;
          metadata?: Record<string, unknown>;
        }
      >()
      .mockImplementationOnce(() => ({
        text: "De qual local você quer ver fotos?",
        metadata: { domain: "photos", state: "awaiting_place" },
      }))
      .mockImplementationOnce((request) => ({
        text: `photos:${request.intent.entities.place}`,
      }));
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      handlers: { photos },
    });

    await controller.processUserInput("fotos");
    expect(context.getContext().awaiting).toEqual({
      type: "awaiting_place",
      intent: "photos",
    });

    await expect(
      controller.processUserInput("Primeira Praia"),
    ).resolves.toEqual({ text: "photos:Primeira Praia" });
    expect(photos).toHaveBeenCalledTimes(2);
    const secondPhotoRequest = photos.mock.calls[1]?.[0];
    expect(secondPhotoRequest?.intent.intent).toBe("photos");
    expect(secondPhotoRequest?.intent.contextual).toBe(true);
    expect(secondPhotoRequest?.intent.entities.place).toBe("Primeira Praia");
    expect(context.getContext().lastPlace).toBe("Primeira Praia");
    expect(context.getContext().awaiting).toBeNull();
  });

  it("persists an awaiting destination and treats the next free-text turn as the destination", async () => {
    const navigate = vi
      .fn<
        (request: AssistantDialogIntentHandlerContext) => {
          text: string;
          metadata?: Record<string, unknown>;
        }
      >()
      .mockImplementationOnce(() => ({
        text: "Para onde você quer ir?",
        metadata: { navigation: "awaiting_destination" },
      }))
      .mockImplementationOnce((request) => ({
        text: `navigate:${request.intent.entities.place}`,
      }));
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      handlers: { navigate },
    });

    await controller.processUserInput("como chegar");
    expect(context.getContext().awaiting).toEqual({
      type: "awaiting_destination",
      intent: "navigate",
    });

    await expect(
      controller.processUserInput("Farol do Morro"),
    ).resolves.toEqual({ text: "navigate:Farol do Morro" });
    const secondNavigateRequest = navigate.mock.calls[1]?.[0];
    expect(secondNavigateRequest?.intent.intent).toBe("navigate");
    expect(secondNavigateRequest?.intent.contextual).toBe(true);
    expect(secondNavigateRequest?.intent.entities.place).toBe("Farol do Morro");
    expect(context.getContext().awaiting).toBeNull();
  });

  it("lets an explicit domain command interrupt an awaiting place slot", async () => {
    const photos = vi.fn(() => ({ text: "photos" }));
    const hours = vi.fn(() => ({ text: "hours" }));
    const context = createContextPort({
      awaiting: { type: "awaiting_place", intent: "photos" },
    });
    const controller = createAssistantDialogController({
      context,
      handlers: { photos, hours },
    });

    await expect(controller.processUserInput("horário")).resolves.toEqual({
      text: "hours",
    });
    expect(hours).toHaveBeenCalledOnce();
    expect(photos).not.toHaveBeenCalled();
  });

  it("does not reinterpret a fresh navigation command as an awaited destination", async () => {
    let captured: AssistantDialogIntentHandlerContext | undefined;
    const navigate = vi.fn((request: AssistantDialogIntentHandlerContext) => {
      captured = request;
      return {
        text: "destination?",
        metadata: { navigation: "awaiting_destination" },
      };
    });
    const context = createContextPort({
      awaiting: { type: "awaiting_destination", intent: "navigate" },
    });
    const controller = createAssistantDialogController({
      context,
      handlers: { navigate },
    });

    await controller.processUserInput("como chegar");
    expect(captured?.intent.intent).toBe("navigate");
    expect(captured?.intent.entities.place).toBeUndefined();
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

  it("records an explicit place in the user profile", async () => {
    const recordInteraction = vi.fn();
    const controller = createAssistantDialogController({
      context: createContextPort(),
      profile: { recordInteraction },
      handlers: {
        more_info: () => ({ text: "details" }),
      },
    });

    await controller.processUserInput("Fale sobre Primeira Praia");

    expect(recordInteraction).toHaveBeenCalledWith(
      "Fale sobre Primeira Praia",
      "beaches",
      expect.objectContaining({ name: "Primeira Praia", category: "beaches" }),
    );
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
