import { describe, expect, it, vi } from "vitest";

import { createDefaultAssistantContext } from "./context-manager.js";
import type { AssistantDialogIntentHandlerContext } from "./dialog-controller.js";
import type { AssistantIntentResult } from "./intent-engine.js";
import { createAssistantNavigationHandlers } from "./navigation-handlers.js";

function request(
  intent: AssistantIntentResult,
  lastPlace: string | null = null,
): AssistantDialogIntentHandlerContext {
  const context = createDefaultAssistantContext(() => 1000);
  context.lastPlace = lastPlace;
  return { input: intent.normalized, intent, context };
}

function navigationIntent(place?: string): AssistantIntentResult {
  return {
    intent: "navigate",
    confidence: 0.95,
    entities: place ? { place } : {},
    normalized: place ? `ir para ${place}` : "como chegar",
    modifiers: [],
  };
}

describe("assistant navigation intent handlers", () => {
  it("asks for a destination when neither intent nor context has one", async () => {
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination: vi.fn(),
        startNavigation: vi.fn(),
        cancelNavigation: vi.fn(),
      },
    });

    const response = await handlers.navigate(request(navigationIntent()));

    expect(response).toMatchObject({
      metadata: { navigation: "awaiting_destination" },
    });
  });

  it("resolves the explicit place and starts navigation through the public port", async () => {
    const destination = {
      name: "Farol do Morro",
      latitude: -13.376,
      longitude: -38.913,
      category: "attractions",
    };
    const resolveDestination = vi.fn(() => destination);
    const startNavigation = vi.fn();
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination,
        startNavigation,
        cancelNavigation: vi.fn(),
      },
    });

    const response = await handlers.navigate(
      request(navigationIntent("Farol do Morro")),
    );

    expect(resolveDestination).toHaveBeenCalledWith("Farol do Morro");
    expect(startNavigation).toHaveBeenCalledWith(destination);
    expect(response).toMatchObject({
      metadata: {
        navigation: "started",
        destination: "Farol do Morro",
      },
    });
  });

  it("falls back to the last contextual place", async () => {
    const resolveDestination = vi.fn(() => ({
      name: "Toca do Morcego",
      latitude: -13.377,
      longitude: -38.915,
    }));
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination,
        startNavigation: vi.fn(),
        cancelNavigation: vi.fn(),
      },
    });

    await handlers.navigate(request(navigationIntent(), "Toca do Morcego"));

    expect(resolveDestination).toHaveBeenCalledWith("Toca do Morcego");
  });

  it("does not start navigation when destination resolution fails", async () => {
    const startNavigation = vi.fn();
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination: vi.fn(() => null),
        startNavigation,
        cancelNavigation: vi.fn(),
      },
    });

    const response = await handlers.navigate(
      request(navigationIntent("Lugar inexistente")),
    );

    expect(startNavigation).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      metadata: {
        navigation: "destination_not_found",
        query: "Lugar inexistente",
      },
    });
  });

  it("cancels navigation through the public port", async () => {
    const cancelNavigation = vi.fn();
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination: vi.fn(),
        startNavigation: vi.fn(),
        cancelNavigation,
      },
    });
    const intent: AssistantIntentResult = {
      intent: "cancel_navigation",
      confidence: 1,
      entities: {},
      normalized: "cancelar navegacao",
      modifiers: [],
    };

    const response = await handlers.cancel_navigation(request(intent));

    expect(cancelNavigation).toHaveBeenCalledOnce();
    expect(response).toMatchObject({ metadata: { navigation: "cancelled" } });
  });
});
