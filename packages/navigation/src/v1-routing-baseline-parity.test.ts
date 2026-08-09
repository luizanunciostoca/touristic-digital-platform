import { describe, expect, it, vi } from "vitest";

import {
  createSameOriginRoutingProvider,
  normalizeCoordinatePair,
  normalizeRouteRequest,
  requestRoute,
  RoutingError,
  type FetchLike,
  type RouteFeatureCollection,
  type RoutingProvider,
} from "./routing.js";
import {
  V1_NAVIGATION_BASELINE_PROVENANCE,
  V1_ROUTING_FIXTURES,
} from "./v1-baseline-fixtures.js";

const VALID_ROUTE: RouteFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "LineString",
        coordinates: [V1_ROUTING_FIXTURES.start, V1_ROUTING_FIXTURES.end],
      },
      properties: {},
    },
  ],
};

describe("V1 frozen routing parity", () => {
  it("pins the audited V1 routing source and test blobs", () => {
    expect(V1_NAVIGATION_BASELINE_PROVENANCE.routingSource).toEqual({
      path: "js/navigation/navigationServices/routing-client.js",
      blobSha: "160dcf5478212f77267561d408a66156fa12ba8d",
    });
    expect(V1_NAVIGATION_BASELINE_PROVENANCE.routingTest).toEqual({
      path: "js/navigation/navigationServices/__tests__/routing-client.test.js",
      blobSha: "81630629512ebf322e6ab96290bdf239d4fe3127",
    });
  });

  it("normalizes coordinates and preserves the V1 profile/language fallback", () => {
    expect(
      normalizeCoordinatePair(V1_ROUTING_FIXTURES.stringCoordinatePair),
    ).toEqual(V1_ROUTING_FIXTURES.start);
    expect(
      normalizeCoordinatePair(V1_ROUTING_FIXTURES.invalidLongitudePair),
    ).toBeNull();

    expect(
      normalizeRouteRequest({
        start: V1_ROUTING_FIXTURES.start,
        end: V1_ROUTING_FIXTURES.end,
        ...V1_ROUTING_FIXTURES.unsupportedRequest,
      }),
    ).toEqual(V1_ROUTING_FIXTURES.normalizedRequest);
  });

  it("uses only the V1 same-origin proxy contract and sends no route credential", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(VALID_ROUTE),
    });
    const primaryProvider = createSameOriginRoutingProvider({ fetchImpl });

    await expect(
      requestRoute({
        start: V1_ROUTING_FIXTURES.start,
        end: V1_ROUTING_FIXTURES.end,
        primaryProvider,
      }),
    ).resolves.toEqual(VALID_ROUTE);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      V1_ROUTING_FIXTURES.sameOriginEndpoint,
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).not.toContain("api_key");
    expect(init?.body).not.toContain("access_token");
  });

  it("uses fallback for the frozen static-host availability failure", async () => {
    const primaryProvider: RoutingProvider = {
      request: vi.fn<RoutingProvider["request"]>().mockRejectedValue(
        new RoutingError("ROUTING_HTTP_ERROR", "Proxy unavailable", {
          status: V1_ROUTING_FIXTURES.staticHostFallbackStatus,
        }),
      ),
    };
    const fallbackProvider: RoutingProvider = {
      request: vi
        .fn<RoutingProvider["request"]>()
        .mockResolvedValue(VALID_ROUTE),
    };

    await expect(
      requestRoute({
        start: V1_ROUTING_FIXTURES.start,
        end: V1_ROUTING_FIXTURES.end,
        primaryProvider,
        fallbackProvider,
      }),
    ).resolves.toEqual(VALID_ROUTE);

    expect(fallbackProvider.request).toHaveBeenCalledTimes(1);
  });

  it("does not mask the frozen V1 backend-unavailable failure with fallback", async () => {
    const fixture = V1_ROUTING_FIXTURES.backendUnavailable;
    const primaryProvider: RoutingProvider = {
      request: vi.fn<RoutingProvider["request"]>().mockRejectedValue(
        new RoutingError(fixture.code, fixture.message, {
          status: fixture.status,
        }),
      ),
    };
    const fallbackProvider: RoutingProvider = {
      request: vi
        .fn<RoutingProvider["request"]>()
        .mockResolvedValue(VALID_ROUTE),
    };

    await expect(
      requestRoute({
        start: V1_ROUTING_FIXTURES.start,
        end: V1_ROUTING_FIXTURES.end,
        primaryProvider,
        fallbackProvider,
      }),
    ).rejects.toMatchObject({
      name: "RoutingError",
      code: fixture.code,
      status: fixture.status,
    });
    expect(fallbackProvider.request).not.toHaveBeenCalled();
  });

  it("rejects invalid V1 coordinates before any provider request", async () => {
    const primaryProvider: RoutingProvider = {
      request: vi
        .fn<RoutingProvider["request"]>()
        .mockResolvedValue(VALID_ROUTE),
    };

    await expect(
      requestRoute({
        start: V1_ROUTING_FIXTURES.invalidRequestPair,
        end: V1_ROUTING_FIXTURES.end,
        primaryProvider,
      }),
    ).rejects.toBeInstanceOf(RoutingError);
    expect(primaryProvider.request).not.toHaveBeenCalled();
  });
});
