import { describe, expect, it, vi } from "vitest";

import {
  createDefaultAssistantContext,
  type AssistantDialogIntentHandlerContext,
} from "@touristic/assistant";
import { createAssistantBrowserDomainHandlers } from "./assistant-domain-adapter.js";

function request(
  intent: AssistantDialogIntentHandlerContext["intent"]["intent"],
  language: "pt" | "en" | "es" | "he",
  options: { place?: string; category?: string } = {},
): AssistantDialogIntentHandlerContext {
  return {
    input: intent,
    intent: {
      intent,
      confidence: 1,
      entities: {
        language,
        ...(options.place ? { place: options.place } : {}),
        ...(options.category ? { category: options.category } : {}),
      },
      normalized: intent,
      modifiers: [],
    },
    context: createDefaultAssistantContext(() => 1),
  };
}

function mapboxDetailsResponse(openNow: boolean): Response {
  return new Response(
    JSON.stringify({
      features: [
        {
          geometry: { coordinates: [-38.9118443, -13.3800508] },
          properties: {
            mapbox_id: "poi.segunda-praia",
            full_address: "Segunda Praia, Morro de São Paulo",
            poi_category: ["beach"],
            metadata: { open_hours: { open_now: openNow } },
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("assistant domain i18n integration", () => {
  it("routes English help through the real browser domain handler", async () => {
    const handlers = createAssistantBrowserDomainHandlers();

    const response = await handlers.help?.(request("help", "en"));

    expect(response?.text).toContain("beaches");
    expect(response?.options).toEqual(
      expect.arrayContaining([
        { label: "Beaches", value: "beaches" },
        { label: "Restaurants", value: "restaurants" },
      ]),
    );
    expect(response?.metadata).toEqual({ domain: "help" });
  });

  it("localizes the generic awaiting-place prompt in Hebrew without metadata drift", async () => {
    const handlers = createAssistantBrowserDomainHandlers();

    const response = await handlers.photos?.(request("photos", "he"));

    expect(response?.text).toContain("תמונות");
    expect(response?.metadata).toEqual({
      domain: "photos",
      state: "awaiting_place",
    });
  });

  it("localizes Spanish location failure through the browser adapter", async () => {
    const handlers = createAssistantBrowserDomainHandlers();

    const response = await handlers.my_location?.(
      request("my_location", "es"),
    );

    expect(response?.text).toContain("ubicación");
    expect(response?.metadata).toEqual({
      domain: "my_location",
      state: "unavailable",
    });
  });

  it("localizes Hebrew price guidance while preserving the existing price contract", async () => {
    const handlers = createAssistantBrowserDomainHandlers();

    const response = await handlers.price?.(
      request("price", "he", { place: "Segunda Praia" }),
    );

    expect(response?.text).toContain("Segunda Praia");
    expect(response?.text).toContain("R$ 80-150");
    expect(response?.options?.[0]?.label).toBe("איך מגיעים");
    expect(response?.metadata).toEqual({
      domain: "price",
      state: "v1_guidance",
      place: "Segunda Praia",
    });
  });

  it("localizes live opening-hours output in English", async () => {
    const fetchImplementation: typeof globalThis.fetch = async () =>
      mapboxDetailsResponse(false);
    const handlers = createAssistantBrowserDomainHandlers({
      fetch: fetchImplementation,
      mapboxAccessToken: "pk.test",
    });

    const response = await handlers.hours?.(
      request("hours", "en", { place: "Segunda Praia" }),
    );

    expect(response?.text).toBe("Segunda Praia is closed now.");
    expect(response?.options?.[0]).toEqual({
      label: "How to get there",
      value: "how to get there",
    });
    expect(response?.metadata).toEqual({
      domain: "hours",
      state: "resolved",
      place: "Segunda Praia",
      openNow: false,
    });
  });

  it("localizes nearby category discovery in Spanish before geolocation", async () => {
    const geolocation = {
      getCurrentPosition: vi.fn(),
    };
    const handlers = createAssistantBrowserDomainHandlers({ geolocation });

    const response = await handlers.nearby?.(request("nearby", "es"));

    expect(response?.text).toContain("categoría");
    expect(response?.options).toEqual(
      expect.arrayContaining([
        { label: "Playas", value: "playas cerca de mí" },
        { label: "Restaurantes", value: "restaurantes cerca de mí" },
      ]),
    );
    expect(response?.metadata).toEqual({
      domain: "nearby",
      state: "awaiting_category",
    });
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });
});
