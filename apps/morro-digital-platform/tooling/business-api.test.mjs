import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { createBusinessApi } from "./business-api.mjs";

const session = Object.freeze({
  subject: "owner-1",
  email: "owner@example.com",
  role: "owner",
  businessIds: Object.freeze(["toca-do-morcego"]),
  issuedAt: 1_700_000_000,
  expiresAt: 4_000_000_000,
  sessionId: "business-profile-test-session",
});

function request(method, body) {
  const stream = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")],
  );
  stream.method = method;
  stream.headers = {};
  return stream;
}

function responseCapture() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = "") {
      this.body = String(value);
    },
    json() {
      return this.body ? JSON.parse(this.body) : null;
    },
    header(name) {
      return headers.get(String(name).toLowerCase());
    },
  };
}

function authApi() {
  return {
    authorizeBusinessRequest: vi.fn(
      async (_request, _response, businessId) => ({
        session,
        businessId,
      }),
    ),
  };
}

describe("Business profile persistence selection", () => {
  it("delegates profile reads and writes to the durable owner when Business DB is configured", async () => {
    const profile = Object.freeze({
      id: "toca-do-morcego",
      name: "Toca do Morcego",
      categoryLabel: "Experiência",
      specialty: "Sunset",
      description: "Experiência ao pôr do sol",
      cta: "Ver empresa",
      locationLabel: "Morro de São Paulo",
      locationIsExample: false,
      promotion: null,
      tutorial: false,
      excludeFromBusinessMetrics: false,
    });
    const runtime = {
      readinessCheck: () => ({ status: "pass" }),
      getLegacyBusinessProfile: vi.fn(async () => profile),
      updateLegacyBusinessProfile: vi.fn(async () => profile),
    };
    const api = createBusinessApi({
      authApi: authApi(),
      getPlacePlatformRuntime: () => runtime,
      getEnvironmentValue: (key) =>
        key === "BUSINESS_DATABASE_URL" ? "mysql://business" : "",
    });

    const putResponse = responseCapture();
    await api.handle(
      request("PUT", { name: "Toca do Morcego" }),
      putResponse,
      "/api/business/toca-do-morcego/profile",
    );
    expect(putResponse.statusCode).toBe(200);
    expect(runtime.updateLegacyBusinessProfile).toHaveBeenCalledWith(
      session,
      "toca-do-morcego",
      { name: "Toca do Morcego" },
    );

    const getResponse = responseCapture();
    await api.handle(
      request("GET"),
      getResponse,
      "/api/business/toca-do-morcego/profile",
    );
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().profile).toEqual(profile);
    expect(runtime.getLegacyBusinessProfile).toHaveBeenCalledWith(
      "toca-do-morcego",
    );
  });

  it("fails closed instead of falling back to memory when durable persistence is configured but unavailable", async () => {
    const api = createBusinessApi({
      authApi: authApi(),
      getPlacePlatformRuntime: () => ({
        readinessCheck: () => ({ status: "fail" }),
      }),
      getEnvironmentValue: (key) =>
        key === "BUSINESS_DATABASE_URL" ? "mysql://business" : "",
    });
    const response = responseCapture();

    await api.handle(
      request("GET"),
      response,
      "/api/business/toca-do-morcego/profile",
    );

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "BUSINESS_PROFILE_PERSISTENCE_UNAVAILABLE",
    });
  });

  it("keeps the in-memory repository only as an explicit no-database development fallback", async () => {
    const api = createBusinessApi({
      authApi: authApi(),
      getPlacePlatformRuntime: () => null,
      getEnvironmentValue: () => "",
    });

    const putResponse = responseCapture();
    await api.handle(
      request("PUT", {
        name: "Fallback local",
        promotion: { title: "Oferta local" },
      }),
      putResponse,
      "/api/business/toca-do-morcego/profile",
    );
    expect(putResponse.statusCode).toBe(200);

    const getResponse = responseCapture();
    await api.handle(
      request("GET"),
      getResponse,
      "/api/business/toca-do-morcego/profile",
    );
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().profile).toMatchObject({
      id: "toca-do-morcego",
      name: "Fallback local",
      promotion: { title: "Oferta local" },
    });
  });
});

function locationPlace(overrides = {}) {
  return Object.freeze({
    id: "place-toca",
    businessId: "toca-do-morcego",
    destinationId: "morro-de-sao-paulo",
    name: "Toca do Morcego",
    publicationState: "draft",
    categoryId: "nightlife",
    location: Object.freeze({
      latitude: -13.3766,
      longitude: -38.9172,
      address: "Morro de São Paulo",
      area: "Centro",
      source: "imported",
      externalProvider: "morro-v1-catalog",
      externalPlaceId: null,
      verifiedAt: null,
      verifiedBy: null,
    }),
    ...overrides,
  });
}

function locationAdapterFixture({
  candidates = [],
  saved = locationPlace(),
} = {}) {
  return {
    search: vi.fn(async () => Object.freeze(candidates)),
    confirmCandidate: vi.fn(async () => saved),
    confirmSelection: vi.fn(async () => saved),
    requestDeviceLocation: vi.fn(),
    createManualSelection: vi.fn((latitude, longitude, metadata = {}) =>
      Object.freeze({
        source: metadata.source === "device" ? "device" : "manual",
        latitude,
        longitude,
        address: metadata.address ?? "",
        area: metadata.area ?? "",
        externalProvider: null,
        externalPlaceId: null,
      }),
    ),
  };
}

function locationRuntimeFixture(place = locationPlace()) {
  return {
    readinessCheck: () => ({ status: "pass" }),
    getBusinessLocationPlace: vi.fn(async () => place),
    listLocationDiscoveryPlaces: vi.fn(async () => Object.freeze([place])),
    updateLocation: vi.fn(async () => ({ placeId: place.id })),
  };
}

function locationLoader(adapter) {
  return vi.fn(async () => ({
    destination: Object.freeze({
      id: "morro-de-sao-paulo",
      center: Object.freeze({ latitude: -13.3833, longitude: -38.9167 }),
      radiusMeters: 15_000,
    }),
    createBusinessLocationDiscoveryAdapter: vi.fn(() => adapter),
  }));
}

describe("Business location self-service boundary", () => {
  it("serves the current canonical location through a read-only business authorization", async () => {
    const place = locationPlace();
    const runtime = locationRuntimeFixture(place);
    const adapter = locationAdapterFixture();
    const auth = authApi();
    const api = createBusinessApi({
      authApi: auth,
      getPlacePlatformRuntime: () => runtime,
      loadLocationDiscoveryRuntime: locationLoader(adapter),
    });
    const response = responseCapture();
    const req = request("GET");

    await api.handle(req, response, "/api/business/toca-do-morcego/location");

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      placeId: "place-toca",
      businessId: "toca-do-morcego",
      destinationId: "morro-de-sao-paulo",
      publicationState: "draft",
      location: {
        source: "imported",
        latitude: -13.3766,
        longitude: -38.9172,
      },
    });
    expect(auth.authorizeBusinessRequest).toHaveBeenCalledWith(
      req,
      response,
      "toca-do-morcego",
      expect.objectContaining({
        mutation: false,
        auditAction: "business.location.read",
      }),
    );
  });

  it("searches candidates without persisting or confirming any result", async () => {
    const place = locationPlace();
    const candidate = Object.freeze({
      candidateId: "canonical:place-toca",
      source: "canonical",
      name: "Toca do Morcego",
      address: "Morro de São Paulo",
      category: "nightlife",
      latitude: -13.3766,
      longitude: -38.9172,
      distanceMeters: 100,
      confidence: 1,
      eligible: true,
      rejectionReason: null,
    });
    const runtime = locationRuntimeFixture(place);
    const adapter = locationAdapterFixture({ candidates: [candidate] });
    const api = createBusinessApi({
      authApi: authApi(),
      getPlacePlatformRuntime: () => runtime,
      loadLocationDiscoveryRuntime: locationLoader(adapter),
    });
    const response = responseCapture();
    const req = request("GET");
    req.url = "/api/business/toca-do-morcego/location/candidates?q=Toca";

    await api.handle(
      req,
      response,
      "/api/business/toca-do-morcego/location/candidates",
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([candidate]);
    expect(adapter.search).toHaveBeenCalledOnce();
    expect(adapter.confirmCandidate).not.toHaveBeenCalled();
    expect(adapter.confirmSelection).not.toHaveBeenCalled();
    expect(runtime.updateLocation).not.toHaveBeenCalled();
  });

  it("confirms a selected candidate only behind mutation authorization", async () => {
    const place = locationPlace();
    const candidate = Object.freeze({
      candidateId: "mapbox:mbx.toca:-13.3766:-38.9172",
      source: "mapbox",
      name: "Toca do Morcego",
      address: "Morro de São Paulo",
      category: "nightlife",
      latitude: -13.3766,
      longitude: -38.9172,
      distanceMeters: 100,
      confidence: 0.9,
      eligible: true,
      rejectionReason: null,
    });
    const saved = locationPlace({
      location: Object.freeze({
        ...place.location,
        source: "mapbox",
        externalProvider: "mapbox",
        externalPlaceId: "mbx.toca",
        verifiedAt: "2026-10-02T21:00:00.000Z",
        verifiedBy: "owner-1",
      }),
    });
    const runtime = locationRuntimeFixture(place);
    const adapter = locationAdapterFixture({ candidates: [candidate], saved });
    const auth = authApi();
    const api = createBusinessApi({
      authApi: auth,
      getPlacePlatformRuntime: () => runtime,
      loadLocationDiscoveryRuntime: locationLoader(adapter),
    });
    const response = responseCapture();
    const req = request("POST", {
      query: "Toca",
      candidateId: candidate.candidateId,
    });

    await api.handle(
      req,
      response,
      "/api/business/toca-do-morcego/location/confirm",
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data.location).toMatchObject({
      source: "mapbox",
      externalProvider: "mapbox",
      externalPlaceId: "mbx.toca",
    });
    expect(auth.authorizeBusinessRequest).toHaveBeenCalledWith(
      req,
      response,
      "toca-do-morcego",
      expect.objectContaining({
        mutation: true,
        auditAction: "business.location.write",
      }),
    );
    expect(adapter.confirmCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "toca-do-morcego",
        candidate,
        verifiedBy: "owner-1",
      }),
    );
  });

  it("fails closed before Place access when the Business auth boundary denies scope", async () => {
    const runtime = locationRuntimeFixture();
    const deniedAuth = {
      authorizeBusinessRequest: vi.fn(async () => null),
    };
    const api = createBusinessApi({
      authApi: deniedAuth,
      getPlacePlatformRuntime: () => runtime,
      loadLocationDiscoveryRuntime: locationLoader(locationAdapterFixture()),
    });
    const response = responseCapture();

    await api.handle(
      request("GET"),
      response,
      "/api/business/other-business/location",
    );

    expect(deniedAuth.authorizeBusinessRequest).toHaveBeenCalled();
    expect(runtime.getBusinessLocationPlace).not.toHaveBeenCalled();
    expect(runtime.listLocationDiscoveryPlaces).not.toHaveBeenCalled();
    expect(runtime.updateLocation).not.toHaveBeenCalled();
  });
});
