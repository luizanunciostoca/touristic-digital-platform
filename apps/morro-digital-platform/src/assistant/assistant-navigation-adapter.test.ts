import { describe, expect, it, vi } from "vitest";

import { createDefaultAssistantContext } from "@touristic/assistant";
import type {
  AssistantDialogIntentHandlerContext,
  AssistantIntentResult,
} from "@touristic/assistant";

import { createAssistantNavigationAppHandlers } from "./assistant-navigation-adapter.js";

function request(
  intent: AssistantIntentResult,
): AssistantDialogIntentHandlerContext {
  return {
    input: intent.normalized,
    intent,
    context: createDefaultAssistantContext(() => 1000),
  };
}

describe("assistant navigation app adapter", () => {
  it("confirms before starting the real navigation boundary with normalized destination coordinates", async () => {
    const start = vi.fn(async () => ({
      type: "FeatureCollection",
      features: [],
    }));
    const destination = {
      name: "Farol do Morro",
      latitude: -13.376,
      longitude: -38.913,
    };
    const handlers = createAssistantNavigationAppHandlers({
      navigation: { start, stop: vi.fn() },
      resolver: { resolveDestination: vi.fn(() => destination) },
    });
    const navigateIntent: AssistantIntentResult = {
      intent: "navigate",
      confidence: 0.95,
      entities: { place: "Farol do Morro" },
      normalized: "ir para farol do morro",
      modifiers: [],
    };

    const pending = await handlers.navigate(request(navigateIntent));
    expect(start).not.toHaveBeenCalled();
    expect(pending).toMatchObject({
      metadata: {
        navigation: "awaiting_confirmation",
        pendingRoute: destination,
      },
    });

    const context = createDefaultAssistantContext(() => 1000);
    context.awaiting = { type: "confirmar_navegacao", intent: "navigate" };
    context.pendingRoute = destination;
    const confirmed = await handlers.confirm({
      input: "sim",
      intent: {
        intent: "confirm",
        confidence: 1,
        entities: {},
        normalized: "sim",
        modifiers: [],
        contextual: true,
      },
      context,
    });

    expect(start).toHaveBeenCalledWith({
      longitude: -38.913,
      latitude: -13.376,
    });
    expect(confirmed).toMatchObject({
      metadata: { navigation: "started", destination: "Farol do Morro" },
    });
  });

  it("stops the navigation bootstrap for cancel_navigation", async () => {
    const stop = vi.fn();
    const handlers = createAssistantNavigationAppHandlers({
      navigation: { start: vi.fn(), stop },
      resolver: { resolveDestination: vi.fn() },
    });
    const intent: AssistantIntentResult = {
      intent: "cancel_navigation",
      confidence: 1,
      entities: {},
      normalized: "cancelar navegacao",
      modifiers: [],
    };

    const response = await handlers.cancel_navigation(request(intent));

    expect(stop).toHaveBeenCalledOnce();
    expect(response).toMatchObject({ metadata: { navigation: "cancelled" } });
  });

  it("does not call bootstrap start when the app resolver cannot find a destination", async () => {
    const start = vi.fn();
    const handlers = createAssistantNavigationAppHandlers({
      navigation: { start, stop: vi.fn() },
      resolver: { resolveDestination: vi.fn(() => null) },
    });
    const intent: AssistantIntentResult = {
      intent: "navigate",
      confidence: 0.95,
      entities: { place: "Lugar inexistente" },
      normalized: "ir para lugar inexistente",
      modifiers: [],
    };

    const response = await handlers.navigate(request(intent));

    expect(start).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      metadata: { navigation: "destination_not_found" },
    });
  });
});
