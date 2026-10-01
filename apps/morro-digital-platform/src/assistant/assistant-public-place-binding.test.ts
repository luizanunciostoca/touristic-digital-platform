import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_PROFILE_STORAGE_KEY,
  createDefaultAssistantContext,
  type AssistantDialogIntentHandlerContext,
} from "@touristic/assistant";
import type { DestinationId } from "@touristic/core";

import {
  resolveAssistantCanonicalPhotos,
} from "./assistant-canonical-photo-adapter.js";
import {
  createAssistantBrowserDomainHandlers,
} from "./assistant-domain-adapter.js";
import {
  fetchAssistantPlaceDetails,
} from "./assistant-place-details-adapter.js";
import { createAssistantSearchHandler } from "./assistant-search-adapter.js";
import {
  createPublicPlaceReadContextFromDestination,
  resolvePublicPlaceReadContext,
  type PublicPlaceReadContext,
} from "../runtime/public-place-read-context.js";

const ITACARE_CONTEXT: PublicPlaceReadContext = Object.freeze({
  destinationId: "itacare",
  bbox: Object.freeze([-39.08, -14.33, -38.95, -14.24] as const),
  zoom: 13,
});

type TestLanguage = "pt" | "en" | "es" | "he";

function request(
  input: string,
  language: TestLanguage = "pt",
): AssistantDialogIntentHandlerContext {
  return {
    input,
    intent: {
      intent: "place_search",
      confidence: 1,
      entities: { searchQuery: input, language },
      normalized: input,
      modifiers: [],
    },
    context: createDefaultAssistantContext(() => 1),
  };
}

function inputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function mapResponse(): Response {
  return new Response(
    JSON.stringify({
      items: [
        {
          id: "place-concha",
          name: "Praia da Concha",
          category: "beaches",
          lat: -14.278,
          lng: -38.986,
          presentation: { markerKey: "beach", priority: 1 },
        },
      ],
      nextCursor: null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function detailResponse(
  destinationId: string,
  withMedia = false,
): Response {
  return new Response(
    JSON.stringify({
      profile: {
        id: "place-concha",
        destinationId,
        name: "Praia da Concha",
        slug: "praia-da-concha",
        categoryId: "beaches",
        subcategoryIds: [],
        shortDescription: "",
        description: "",
        location: {
          latitude: -14.278,
          longitude: -38.986,
          address: "Itacaré",
          area: "Centro",
        },
        contact: {
          phone: null,
          whatsapp: null,
          email: null,
          website: null,
        },
        openingHours: null,
        amenities: [],
        tags: [],
        capabilities: ["directions"],
      },
      media: withMedia
        ? {
            placeId: "place-concha",
            coverImage: {
              providerReference: "/media/concha.webp",
            },
            gallery: [],
          }
        : null,
      commerce: null,
      actions: {
        placeId: "place-concha",
        businessId: "business-concha",
        destinationId,
        primaryAction: null,
        secondaryActions: [],
      },
      partial: {
        media: withMedia ? "ready" : "unavailable",
        commerce: "ready",
        actions: "ready",
      },
      revision: {
        id: "place-concha:r1",
        number: 1,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("Phase20 public Place + Assistant binding", () => {
  it("derives a destination-scoped read context", () => {
    expect(resolvePublicPlaceReadContext(ITACARE_CONTEXT)).toEqual(
      ITACARE_CONTEXT,
    );

    expect(() =>
      resolvePublicPlaceReadContext({
        ...ITACARE_CONTEXT,
        destinationId: "../itacare",
      }),
    ).toThrow("PUBLIC_PLACE_INVALID_DESTINATION");

    const derived = createPublicPlaceReadContextFromDestination({
      id: "itacare" as DestinationId,
      center: {
        latitude: -14.278,
        longitude: -38.995,
      },
      radiusMeters: 20_000,
    });

    expect(derived.destinationId).toBe("itacare");
    expect(derived.bbox[0]).toBeLessThan(-38.995);
    expect(derived.bbox[2]).toBeGreaterThan(-38.995);
  });

  it("uses same-origin Place reads for Itacare", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(
      async (input, init) => {
        expect(init?.method).toBe("GET");
        const url = inputUrl(input);
        expect(url.startsWith("/api/places/v1/map?")).toBe(true);
        return mapResponse();
      },
    );

    const handler = createAssistantSearchHandler({
      fetch: fetcher,
      mapboxAccessToken: "pk.must-not-be-used",
      publicPlaceReadContext: ITACARE_CONTEXT,
    });

    const response = await handler(request("Praia da Concha"));
    expect(response?.metadata).toMatchObject({
      domain: "search",
      deterministic: true,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const rawUrl = inputUrl(fetcher.mock.calls[0]![0]);
    const url = new URL(rawUrl, "https://local.test");
    expect(url.pathname).toBe("/api/places/v1/map");
    expect(url.searchParams.get("destinationId")).toBe("itacare");

    const usedMapbox = fetcher.mock.calls.some(([input]) =>
      inputUrl(input).startsWith("https://api.mapbox.com/"),
    );
    expect(usedMapbox).toBe(false);
  });

  it("rejects cross-destination canonical detail", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = inputUrl(input);
      if (url.startsWith("/api/places/v1/map?")) {
        return mapResponse();
      }
      return detailResponse("morro-de-sao-paulo");
    });

    const result = fetchAssistantPlaceDetails("Praia da Concha", {
      fetch: fetcher,
      accessToken: "pk.must-not-be-used",
      publicPlaceReadContext: ITACARE_CONTEXT,
    });
    await expect(result).resolves.toBeNull();

    const usedMapbox = fetcher.mock.calls.some(([input]) =>
      inputUrl(input).startsWith("https://api.mapbox.com/"),
    );
    expect(usedMapbox).toBe(false);
  });

  it("keeps all supported locales destination-scoped", async () => {
    const cases = [
      ["pt", "pt-BR"],
      ["en", "en-US"],
      ["es", "es-ES"],
      ["he", "he-IL"],
    ] as const;

    for (const [language, locale] of cases) {
      const calls: string[] = [];
      const fetcher = vi.fn<typeof globalThis.fetch>(
        async (input) => {
          const url = inputUrl(input);
          calls.push(url);
          if (url.startsWith("/api/places/v1/map?")) {
            return mapResponse();
          }
          return detailResponse("itacare");
        },
      );

      const result = await fetchAssistantPlaceDetails(
        "Praia da Concha",
        {
          fetch: fetcher,
          language,
          publicPlaceReadContext: ITACARE_CONTEXT,
        },
      );

      expect(result?.source).toBe("canonical");
      const localeParam = "locale=" + encodeURIComponent(locale);
      expect(calls.some((url) => url.includes(localeParam))).toBe(true);
      const sameOrigin = calls.every((url) =>
        url.startsWith("/api/places/v1/"),
      );
      expect(sameOrigin).toBe(true);
    }
  });

  it("rejects cross-destination canonical media", async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = inputUrl(input);
      if (url.startsWith("/api/places/v1/map?")) {
        return mapResponse();
      }
      return detailResponse("morro-de-sao-paulo", true);
    });

    const result = resolveAssistantCanonicalPhotos(
      "Praia da Concha",
      fetcher,
      "pt",
      ITACARE_CONTEXT,
    );
    await expect(result).resolves.toBeNull();
  });

  it("keeps favorites client-local", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("client-local state must not call an endpoint");
    });

    const handlers = createAssistantBrowserDomainHandlers({
      storage,
      fetch: fetcher,
      publicPlaceReadContext: ITACARE_CONTEXT,
    });

    const favoriteRequest: AssistantDialogIntentHandlerContext = {
      input: "adicionar aos favoritos",
      intent: {
        intent: "favorites",
        confidence: 1,
        entities: {
          place: "Praia da Concha",
          language: "pt",
        },
        normalized: "adicionar aos favoritos",
        modifiers: [],
      },
      context: createDefaultAssistantContext(() => 1),
    };

    const response = await handlers.favorites?.(favoriteRequest);
    expect(response?.metadata).toMatchObject({
      domain: "favorites",
      state: "added",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(values.has(ASSISTANT_PROFILE_STORAGE_KEY)).toBe(true);
  });
});
