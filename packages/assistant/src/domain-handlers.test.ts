import { describe, expect, it, vi } from "vitest";

import { createDefaultAssistantContext } from "./context-manager.js";
import { createAssistantDomainHandlers } from "./domain-handlers.js";
import type { AssistantDialogIntentHandlerContext } from "./dialog-controller.js";

function request(
  intent: AssistantDialogIntentHandlerContext["intent"]["intent"],
  options: {
    place?: string;
    lastPlace?: string;
    category?: string;
  } = {},
): AssistantDialogIntentHandlerContext {
  return {
    input: intent,
    intent: {
      intent,
      confidence: 1,
      entities: {
        ...(options.place ? { place: options.place } : {}),
        ...(options.category ? { category: options.category } : {}),
      },
      normalized: intent,
      modifiers: [],
    },
    context: {
      ...createDefaultAssistantContext(() => 1),
      lastPlace: options.lastPlace ?? null,
    },
  };
}

function createPorts() {
  return {
    weather: vi.fn(() => ({ text: "weather" })),
    myLocation: vi.fn(() => ({ text: "location" })),
    photos: vi.fn((place: string) => ({ text: `photos:${place}` })),
    price: vi.fn((place: string) => ({ text: `price:${place}` })),
    hours: vi.fn((place: string) => ({ text: `hours:${place}` })),
    moreInfo: vi.fn((place: string) => ({ text: `info:${place}` })),
    nearby: vi.fn(() => ({ text: "nearby" })),
    favorites: vi.fn(() => ({ text: "favorites" })),
    help: vi.fn(() => ({ text: "help" })),
  };
}

describe("assistant domain handlers", () => {
  it("delegates non-place domain intents through explicit ports", async () => {
    const ports = createPorts();
    const handlers = createAssistantDomainHandlers({ ports });

    await expect(handlers.weather(request("weather"))).resolves.toEqual({
      text: "weather",
    });
    await expect(handlers.my_location(request("my_location"))).resolves.toEqual(
      { text: "location" },
    );
    await expect(handlers.nearby(request("nearby"))).resolves.toEqual({
      text: "nearby",
    });
    await expect(handlers.favorites(request("favorites"))).resolves.toEqual({
      text: "favorites",
    });
    await expect(handlers.help(request("help"))).resolves.toEqual({
      text: "help",
    });
  });

  it("uses the explicit place entity before conversational context", async () => {
    const ports = createPorts();
    const handlers = createAssistantDomainHandlers({ ports });

    await handlers.photos(
      request("photos", { place: "Segunda Praia", lastPlace: "Quarta Praia" }),
    );

    expect(ports.photos).toHaveBeenCalledWith(
      "Segunda Praia",
      expect.objectContaining({ input: "photos" }),
    );
  });

  it("falls back to lastPlace for contextual place-detail intents", async () => {
    const ports = createPorts();
    const handlers = createAssistantDomainHandlers({ ports });

    await expect(
      handlers.price(request("price", { lastPlace: "Toca do Morcego" })),
    ).resolves.toEqual({ text: "price:Toca do Morcego" });
    await expect(
      handlers.hours(request("hours", { lastPlace: "Basílico" })),
    ).resolves.toEqual({ text: "hours:Basílico" });
    await expect(
      handlers.more_info(request("more_info", { lastPlace: "Farol do Morro" })),
    ).resolves.toEqual({ text: "info:Farol do Morro" });
  });

  it("asks for a place instead of invoking a place port without context", async () => {
    const ports = createPorts();
    const handlers = createAssistantDomainHandlers({ ports });

    const response = await handlers.photos(request("photos"));

    expect(response).toEqual({
      text: "De qual local você quer ver fotos?",
      metadata: { domain: "photos", state: "awaiting_place" },
    });
    expect(ports.photos).not.toHaveBeenCalled();
  });

  it("allows product-specific copy to replace the default prompt", async () => {
    const ports = createPorts();
    const handlers = createAssistantDomainHandlers({
      ports,
      copy: {
        askPlace: (intent) => ({ text: `ask:${intent}` }),
      },
    });

    await expect(handlers.hours(request("hours"))).resolves.toEqual({
      text: "ask:hours",
    });
  });
});
