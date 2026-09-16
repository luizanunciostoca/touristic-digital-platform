import { describe, expect, it, vi } from "vitest";

import {
  createAssistantDialogController,
  type AssistantDialogContextPort,
} from "./dialog-controller.js";
import { createDefaultAssistantContext } from "./context-manager.js";
import { createAssistantNavigationHandlers } from "./navigation-handlers.js";

function createContextPort(): AssistantDialogContextPort {
  let state = createDefaultAssistantContext(() => 1000);
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

describe("assistant contextual navigation confirmation", () => {
  it("persists a resolved route, starts it only after sim, then clears pending state", async () => {
    const context = createContextPort();
    const destination = {
      name: "Primeira Praia",
      latitude: -13.379,
      longitude: -38.914,
      category: "beaches",
    };
    const startNavigation = vi.fn();
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination: vi.fn(() => destination),
        startNavigation,
        cancelNavigation: vi.fn(),
      },
    });
    const controller = createAssistantDialogController({ context, handlers });

    const requested = await controller.processUserInput(
      "me leve para Primeira Praia",
    );

    expect(startNavigation).not.toHaveBeenCalled();
    expect(requested.metadata).toMatchObject({
      navigation: "awaiting_confirmation",
      destination: "Primeira Praia",
    });
    expect(context.getContext()).toMatchObject({
      awaiting: { type: "confirmar_navegacao", intent: "navigate" },
      pendingRoute: destination,
      selectedDestination: destination,
    });

    const confirmed = await controller.processUserInput("sim");

    expect(startNavigation).toHaveBeenCalledOnce();
    expect(startNavigation).toHaveBeenCalledWith(destination);
    expect(confirmed.metadata).toMatchObject({ navigation: "started" });
    expect(context.getContext().awaiting).toBeNull();
    expect(context.getContext().pendingRoute).toBeNull();
    expect(context.getContext().selectedDestination).toEqual(destination);
  });

  it("clears the pending route when the user denies confirmation", async () => {
    const context = createContextPort();
    const destination = {
      name: "Toca do Morcego",
      latitude: -13.377,
      longitude: -38.915,
      category: "nightlife",
    };
    const startNavigation = vi.fn();
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination: vi.fn(() => destination),
        startNavigation,
        cancelNavigation: vi.fn(),
      },
    });
    const controller = createAssistantDialogController({ context, handlers });

    await controller.processUserInput("me leve para Toca do Morcego");
    const denied = await controller.processUserInput("não");

    expect(startNavigation).not.toHaveBeenCalled();
    expect(denied.metadata).toMatchObject({ navigation: "declined" });
    expect(context.getContext().awaiting).toBeNull();
    expect(context.getContext().pendingRoute).toBeNull();
    expect(context.getContext().selectedDestination).toBeNull();
  });
});
