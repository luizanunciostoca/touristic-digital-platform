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

function confirmationIntent(intent: "confirm" | "deny"): AssistantIntentResult {
  return {
    intent,
    confidence: 1,
    entities: {},
    normalized: intent === "confirm" ? "sim" : "não",
    modifiers: [],
    contextual: true,
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

  it("resolves an explicit place and requests confirmation before starting navigation", async () => {
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
    expect(startNavigation).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      options: [
        { label: "Sim", value: "sim" },
        { label: "Não", value: "não" },
      ],
      metadata: {
        navigation: "awaiting_confirmation",
        destination: "Farol do Morro",
        pendingRoute: destination,
      },
    });
  });

  it("starts only the pending route when the contextual confirmation is affirmative", async () => {
    const destination = {
      name: "Farol do Morro",
      latitude: -13.376,
      longitude: -38.913,
      category: "attractions",
    };
    const startNavigation = vi.fn();
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination: vi.fn(),
        startNavigation,
        cancelNavigation: vi.fn(),
      },
    });
    const confirmation = request(confirmationIntent("confirm"));
    confirmation.context.awaiting = {
      type: "confirmar_navegacao",
      intent: "navigate",
    };
    confirmation.context.pendingRoute = destination;

    const response = await handlers.confirm(confirmation);

    expect(startNavigation).toHaveBeenCalledOnce();
    expect(startNavigation).toHaveBeenCalledWith(destination);
    expect(response).toMatchObject({
      metadata: {
        navigation: "started",
        destination: "Farol do Morro",
      },
    });
  });

  it("declines and does not start the pending route when confirmation is negative", async () => {
    const destination = {
      name: "Toca do Morcego",
      latitude: -13.377,
      longitude: -38.915,
    };
    const startNavigation = vi.fn();
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination: vi.fn(),
        startNavigation,
        cancelNavigation: vi.fn(),
      },
    });
    const denial = request(confirmationIntent("deny"));
    denial.context.awaiting = {
      type: "confirmar_navegacao",
      intent: "navigate",
    };
    denial.context.pendingRoute = destination;

    const response = await handlers.deny(denial);

    expect(startNavigation).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      metadata: {
        navigation: "declined",
        destination: "Toca do Morcego",
      },
    });
  });

  it("does not interpret a generic confirmation as navigation without a pending route", async () => {
    const startNavigation = vi.fn();
    const handlers = createAssistantNavigationHandlers({
      ports: {
        resolveDestination: vi.fn(),
        startNavigation,
        cancelNavigation: vi.fn(),
      },
    });

    await expect(
      handlers.confirm(request(confirmationIntent("confirm"))),
    ).resolves.toBeNull();
    expect(startNavigation).not.toHaveBeenCalled();
  });

  it("falls back to the last contextual place before requesting confirmation", async () => {
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

    const response = await handlers.navigate(
      request(navigationIntent(), "Toca do Morcego"),
    );

    expect(resolveDestination).toHaveBeenCalledWith("Toca do Morcego");
    expect(response).toMatchObject({
      metadata: { navigation: "awaiting_confirmation" },
    });
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
