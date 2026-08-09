import { describe, expect, it, vi } from "vitest";

import {
  createDefaultAssistantContext,
  type AssistantDialogIntentHandlerContext,
} from "@touristic/assistant";
import {
  resolveAssistantNearby,
  type AssistantNearbyGeolocationPort,
} from "./assistant-nearby-adapter.js";

function request(category?: string): AssistantDialogIntentHandlerContext {
  return {
    input: category ? `${category} perto de mim` : "perto de mim",
    intent: {
      intent: "nearby",
      confidence: 1,
      entities: category ? { category } : {},
      normalized: "perto de mim",
      modifiers: ["nearby"],
    },
    context: createDefaultAssistantContext(() => 1),
  };
}

function position(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 8,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: 1,
    toJSON: () => ({}),
  };
}

describe("assistant nearby browser adapter", () => {
  it("asks for a category before requesting geolocation", async () => {
    const getCurrentPosition =
      vi.fn<AssistantNearbyGeolocationPort["getCurrentPosition"]>();
    const geolocation: AssistantNearbyGeolocationPort = { getCurrentPosition };
    const response = await resolveAssistantNearby(request(), geolocation);

    expect(response).toEqual(
      expect.objectContaining({
        metadata: { domain: "nearby", state: "awaiting_category" },
        options: expect.arrayContaining([
          { label: "Praias", value: "praias perto de mim" },
          { label: "Restaurantes", value: "restaurantes perto de mim" },
        ]),
      }),
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("ranks the curated V1 catalog from the current browser position", async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success(position(-13.3800508, -38.9118443));
      }),
    };

    const response = await resolveAssistantNearby(
      request("beaches"),
      geolocation,
    );

    expect(response.metadata).toEqual(
      expect.objectContaining({
        domain: "nearby",
        state: "resolved",
        category: "beaches",
      }),
    );
    expect(response.options?.[0]).toEqual({
      label: "Segunda Praia",
      value: "Segunda Praia",
    });
    expect(response.text).toContain("Segunda Praia (0 m)");
  });

  it("returns a permission failure without inventing nearby results", async () => {
    const geolocation = {
      getCurrentPosition: vi.fn(
        (_success: PositionCallback, error?: PositionErrorCallback | null) => {
          error?.({} as GeolocationPositionError);
        },
      ),
    };

    const response = await resolveAssistantNearby(
      request("restaurants"),
      geolocation,
    );

    expect(response).toEqual({
      text: "Não consegui obter sua localização. Verifique a permissão de localização e tente novamente.",
      metadata: {
        domain: "nearby",
        state: "denied_or_failed",
        category: "restaurants",
      },
    });
  });
});
