import { describe, expect, it } from "vitest";

import { createBusinessOnboardingAdapters } from "./business-onboarding-adapters.js";

describe("M54/M57 Business onboarding adapters", () => {
  it("binds Business discovery to the shared V1 Search catalog", async () => {
    const ports = createBusinessOnboardingAdapters();
    const results = await ports.discovery.searchBusiness("Toca do Morcego");
    const coordinates = results[0]?.coordinates;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toBe("Toca do Morcego");
    expect(typeof coordinates?.latitude).toBe("number");
    expect(typeof coordinates?.longitude).toBe("number");
    expect(Number.isFinite(coordinates?.latitude)).toBe(true);
    expect(Number.isFinite(coordinates?.longitude)).toBe(true);
  });

  it("resolves an existing Business location through Search-backed geospatial coordinates", async () => {
    const ports = createBusinessOnboardingAdapters();
    const location =
      await ports.location.findExistingLocation("Toca do Morcego");

    expect(location?.name).toBe("Toca do Morcego");
    expect(location?.source).toBe("catalog");
    expect(typeof location?.coordinates.latitude).toBe("number");
    expect(typeof location?.coordinates.longitude).toBe("number");
    expect(Number.isFinite(location?.coordinates.latitude)).toBe(true);
    expect(Number.isFinite(location?.coordinates.longitude)).toBe(true);
  });

  it("keeps device location behind the browser geolocation port", async () => {
    let observedOptions: PositionOptions | undefined;
    const ports = createBusinessOnboardingAdapters({
      geolocation: {
        getCurrentPosition(success, error, options) {
          void error;
          observedOptions = options;
          success({
            coords: {
              accuracy: 9,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: -13.377,
              longitude: -38.914,
              speed: null,
            },
            timestamp: 1,
          } as GeolocationPosition);
        },
      },
    });

    const location = await ports.location.requestDeviceLocation();

    expect(location).toEqual({
      name: "device-location",
      category: "device",
      coordinates: { latitude: -13.377, longitude: -38.914 },
      source: "device",
      accuracy: 9,
    });
    expect(observedOptions).toEqual({
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 10_000,
    });
  });

  it("binds the Business Assistant port to the real Assistant dialog controller", async () => {
    const ports = createBusinessOnboardingAdapters();
    const response = await ports.assistant.ask("ajuda", "pt");

    expect(response.metadata).toEqual(
      expect.objectContaining({ domain: "help" }),
    );
    expect(response.onboardingLocale).toBe("pt");
    expect(response.options?.length).toBeGreaterThan(0);
  });

  it("fails device location safely when the browser capability is absent", async () => {
    const ports = createBusinessOnboardingAdapters();
    await expect(ports.location.requestDeviceLocation()).resolves.toBeNull();
  });

  it("verifies an onboarding route through the shared Navigation routing contract", async () => {
    let observedUrl = "";
    let observedPayload: unknown;
    const ports = createBusinessOnboardingAdapters({
      fetch: async (input, init) => {
        observedUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (typeof init?.body !== "string") {
          throw new Error("Expected JSON routing request body");
        }
        observedPayload = JSON.parse(init.body) as unknown;
        return new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [-38.914, -13.377],
                    [-38.912, -13.375],
                  ],
                },
                properties: {
                  summary: { distance: 310, duration: 240 },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await ports.route.showRoute({
      origin: { latitude: -13.377, longitude: -38.914 },
      destination: { latitude: -13.375, longitude: -38.912 },
      destinationName: "Toca do Morcego",
      language: "pt",
    });

    expect(observedUrl).toBe("/api/routing/directions");
    expect(observedPayload).toEqual({
      coordinates: [
        [-38.914, -13.377],
        [-38.912, -13.375],
      ],
      profile: "foot-walking",
      language: "pt",
      instructions: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        code: "ROUTE_VERIFIED",
        distanceMeters: 310,
        durationSeconds: 240,
        tutorial: true,
        excludeFromBusinessMetrics: true,
      }),
    );
  });

  it("keeps the route port fail-closed when Navigation rejects the route", async () => {
    const ports = createBusinessOnboardingAdapters({
      fetch: async () =>
        new Response(
          JSON.stringify({ error: "ROUTING_UNAVAILABLE", message: "offline" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      routeTimeoutMs: 1_000,
    });

    const result = await ports.route.showRoute({
      origin: { latitude: -13.377, longitude: -38.914 },
      destination: { latitude: -13.375, longitude: -38.912 },
      destinationName: "Toca do Morcego",
    });

    expect(result).toEqual({
      success: false,
      code: "ROUTING_UNAVAILABLE",
      distanceMeters: 0,
      durationSeconds: 0,
      route: null,
      tutorial: true,
      excludeFromBusinessMetrics: true,
    });
  });
});
