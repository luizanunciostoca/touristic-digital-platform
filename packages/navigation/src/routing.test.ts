import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSameOriginRoutingProvider,
  isValidRouteFeatureCollection,
  normalizeCoordinatePair,
  normalizeRouteRequest,
  requestRoute,
  RoutingError,
  shouldUseRoutingFallback,
  type FetchLike,
  type RouteFeatureCollection,
  type RoutingProvider,
} from "./routing.js";

const VALID_ROUTE: RouteFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "LineString",
        coordinates: [
          [-38.91, -13.38],
          [-38.92, -13.39],
        ],
      },
      properties: {},
    },
  ],
};

function providerReturning(route = VALID_ROUTE): RoutingProvider {
  return {
    request: vi.fn<RoutingProvider["request"]>().mockResolvedValue(route),
  };
}

function abortAwareRequestSpy() {
  return vi.fn<RoutingProvider["request"]>().mockImplementation(
    (_payload, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener(
          "abort",
          () => {
            const error = new Error("Routing request aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("routing core", () => {
  it("normalizes coordinate pairs and rejects invalid bounds", () => {
    expect(normalizeCoordinatePair(["-38.91", "-13.38"])).toEqual([
      -38.91, -13.38,
    ]);
    expect(normalizeCoordinatePair([181, -13.38])).toBeNull();
    expect(normalizeCoordinatePair([-38.91, 91])).toBeNull();
    expect(normalizeCoordinatePair([-38.91])).toBeNull();
  });

  it("preserves the V1 profile/language allowlist and fallback", () => {
    expect(
      normalizeRouteRequest({
        start: [-38.91, -13.38],
        end: [-38.92, -13.39],
        profile: "driving-car",
        language: "fr",
      }),
    ).toEqual({
      coordinates: [
        [-38.91, -13.38],
        [-38.92, -13.39],
      ],
      profile: "foot-walking",
      language: "pt",
      instructions: true,
    });

    expect(
      normalizeRouteRequest({
        start: [-38.91, -13.38],
        end: [-38.92, -13.39],
        language: "he",
      }).language,
    ).toBe("he");
  });

  it("rejects invalid coordinates before invoking any provider", async () => {
    const primaryProvider = providerReturning();

    await expect(
      requestRoute({
        start: [999, 0],
        end: [-38.92, -13.39],
        primaryProvider,
      }),
    ).rejects.toMatchObject({ code: "INVALID_COORDINATES" });

    expect(primaryProvider.request).not.toHaveBeenCalled();
  });

  it("uses a same-origin POST transport without route credentials in the body", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(VALID_ROUTE),
    });
    const primaryProvider = createSameOriginRoutingProvider({ fetchImpl });

    await expect(
      requestRoute({
        start: [-38.91, -13.38],
        end: [-38.92, -13.39],
        primaryProvider,
      }),
    ).resolves.toEqual(VALID_ROUTE);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/routing/directions");
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(init?.body).not.toContain("api_key");
    expect(init?.body).not.toContain("access_token");
  });

  it("rejects an external primary endpoint", () => {
    const fetchImpl = vi.fn<FetchLike>();

    try {
      createSameOriginRoutingProvider({
        endpoint: "https://example.com/directions",
        fetchImpl,
      });
      throw new Error("Expected invalid endpoint rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutingError);
      if (!(error instanceof RoutingError)) throw error;
      expect(error.code).toBe("INVALID_ROUTING_ENDPOINT");
    }
  });

  it("validates the internal route feature collection contract", () => {
    expect(isValidRouteFeatureCollection(VALID_ROUTE)).toBe(true);
    expect(
      isValidRouteFeatureCollection({
        features: [{ geometry: { type: "Point", coordinates: [0, 0] } }],
      }),
    ).toBe(false);
    expect(isValidRouteFeatureCollection({ features: [] })).toBe(false);
  });

  it("uses a fallback provider only for V1-compatible proxy availability failures", async () => {
    const primaryProvider: RoutingProvider = {
      request: vi.fn<RoutingProvider["request"]>().mockRejectedValue(
        new RoutingError("ROUTING_HTTP_ERROR", "Proxy unavailable", {
          status: 405,
        }),
      ),
    };
    const fallbackProvider = providerReturning();

    await expect(
      requestRoute({
        start: [-38.91, -13.38],
        end: [-38.92, -13.39],
        primaryProvider,
        fallbackProvider,
      }),
    ).resolves.toEqual(VALID_ROUTE);

    expect(fallbackProvider.request).toHaveBeenCalledTimes(1);
    expect(
      shouldUseRoutingFallback(
        new RoutingError("INVALID_ROUTE_RESPONSE", "Invalid route"),
      ),
    ).toBe(true);
  });

  it("does not mask a real backend failure with fallback", async () => {
    const primaryProvider: RoutingProvider = {
      request: vi.fn<RoutingProvider["request"]>().mockRejectedValue(
        new RoutingError("ROUTING_NOT_CONFIGURED", "Unavailable", {
          status: 503,
        }),
      ),
    };
    const fallbackProvider = providerReturning();

    await expect(
      requestRoute({
        start: [-38.91, -13.38],
        end: [-38.92, -13.39],
        primaryProvider,
        fallbackProvider,
      }),
    ).rejects.toMatchObject({
      code: "ROUTING_NOT_CONFIGURED",
      status: 503,
    });
    expect(fallbackProvider.request).not.toHaveBeenCalled();
  });

  it("normalizes external cancellation", async () => {
    const controller = new AbortController();
    const request = abortAwareRequestSpy();
    const primaryProvider: RoutingProvider = { request };

    const result = requestRoute({
      start: [-38.91, -13.38],
      end: [-38.92, -13.39],
      primaryProvider,
      signal: controller.signal,
    });
    const rejection = expect(result).rejects.toMatchObject({
      code: "ROUTING_CANCELLED",
    });

    controller.abort();
    await rejection;
  });

  it("normalizes timeout and clamps very small timeout values to one second", async () => {
    vi.useFakeTimers();
    const request = abortAwareRequestSpy();
    const primaryProvider: RoutingProvider = { request };

    const result = requestRoute({
      start: [-38.91, -13.38],
      end: [-38.92, -13.39],
      primaryProvider,
      timeoutMs: 1,
    });
    const rejection = expect(result).rejects.toMatchObject({
      code: "ROUTING_TIMEOUT",
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
  });
});
