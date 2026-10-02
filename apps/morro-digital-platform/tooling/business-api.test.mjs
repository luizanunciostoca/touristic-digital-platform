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

function request(method, body, url = "") {
  const stream = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")],
  );
  stream.method = method;
  stream.url = url;
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

function authApi(sessionValue = session) {
  return {
    authorizeBusinessRequest: vi.fn(
      async (_request, _response, businessId) => ({
        session: sessionValue,
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

describe("Morro Pro governed location API", () => {
  const place = Object.freeze({
    id: "place-toca-do-morcego",
    businessId: "toca-do-morcego",
    destinationId: "morro-de-sao-paulo",
    name: "Toca do Morcego",
    publicationState: "draft",
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
  });

  function locationFixture({ sessionValue = session } = {}) {
    const auth = authApi(sessionValue);
    const runtime = {
      readinessCheck: () => ({ status: "pass" }),
      getBusinessLocationPlace: vi.fn(async () => place),
      listLocationDiscoveryPlaces: vi.fn(async () => [place]),
      updateLocation: vi.fn(async () => ({
        editableRevision: { revision: 2 },
      })),
    };
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
    const saved = Object.freeze({
      ...place,
      location: Object.freeze({
        ...place.location,
        source: "mapbox",
        externalProvider: "mapbox",
        externalPlaceId: "mbx.toca",
        verifiedAt: "2026-10-02T21:00:00.000Z",
        verifiedBy: sessionValue.subject,
      }),
    });
    const adapter = {
      search: vi.fn(async () => [candidate]),
      confirmCandidate: vi.fn(async () => saved),
      createManualSelection: vi.fn((latitude, longitude, extra) => ({
        latitude,
        longitude,
        address: extra.address,
        area: extra.area,
        source: extra.source,
        externalProvider: null,
        externalPlaceId: null,
      })),
      confirmSelection: vi.fn(async () => ({
        ...saved,
        location: Object.freeze({
          ...saved.location,
          source: "manual",
          externalProvider: null,
          externalPlaceId: null,
        }),
      })),
    };
    const api = createBusinessApi({
      authApi: auth,
      getPlacePlatformRuntime: () => runtime,
      getEnvironmentValue: () => "",
      loadLocationDiscoveryRuntime: async () => ({
        destination: { id: "morro-de-sao-paulo" },
        createBusinessLocationDiscoveryAdapter: () => adapter,
      }),
    });
    return { api, auth, runtime, adapter, candidate };
  }

  it("reads the current canonical editable location without mutating it", async () => {
    const fixture = locationFixture();
    const response = responseCapture();

    await fixture.api.handle(
      request("GET"),
      response,
      "/api/business/toca-do-morcego/location",
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      placeId: "place-toca-do-morcego",
      businessId: "toca-do-morcego",
      destinationId: "morro-de-sao-paulo",
      publicationState: "draft",
    });
    expect(fixture.adapter.search).not.toHaveBeenCalled();
    expect(fixture.runtime.updateLocation).not.toHaveBeenCalled();
  });

  it("searches candidates without persistence and confirms only a re-read candidate", async () => {
    const fixture = locationFixture();
    const searchResponse = responseCapture();

    await fixture.api.handle(
      request(
        "GET",
        undefined,
        "/api/business/toca-do-morcego/location/candidates?q=Toca",
      ),
      searchResponse,
      "/api/business/toca-do-morcego/location/candidates",
    );

    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().data).toHaveLength(1);
    expect(fixture.runtime.updateLocation).not.toHaveBeenCalled();

    const confirmResponse = responseCapture();
    await fixture.api.handle(
      request("POST", {
        query: "Toca",
        candidateId: fixture.candidate.candidateId,
      }),
      confirmResponse,
      "/api/business/toca-do-morcego/location/confirm",
    );

    expect(confirmResponse.statusCode).toBe(200);
    expect(fixture.adapter.search).toHaveBeenCalledTimes(2);
    expect(fixture.adapter.confirmCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "toca-do-morcego",
        destinationId: "morro-de-sao-paulo",
        candidate: fixture.candidate,
        verifiedBy: session.subject,
      }),
    );
  });

  it("accepts manual/device coordinates only through the mutation boundary", async () => {
    const fixture = locationFixture();
    const response = responseCapture();

    await fixture.api.handle(
      request("PUT", {
        latitude: -13.3766,
        longitude: -38.9172,
        address: "Morro de São Paulo",
        area: "Centro",
        source: "manual",
      }),
      response,
      "/api/business/toca-do-morcego/location",
    );

    expect(response.statusCode).toBe(200);
    expect(fixture.adapter.createManualSelection).toHaveBeenCalledWith(
      -13.3766,
      -38.9172,
      expect.objectContaining({ source: "manual" }),
    );
    expect(fixture.adapter.confirmSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "toca-do-morcego",
        destinationId: "morro-de-sao-paulo",
        verifiedBy: session.subject,
      }),
    );
    expect(fixture.auth.authorizeBusinessRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "toca-do-morcego",
      expect.objectContaining({
        mutation: true,
        auditAction: "business.location.write",
      }),
    );
  });

  it("fails closed for platform roles even when the lower auth port returns access", async () => {
    const platformSession = Object.freeze({
      ...session,
      role: "admin",
      businessIds: Object.freeze([]),
    });
    const fixture = locationFixture({ sessionValue: platformSession });
    const response = responseCapture();

    await fixture.api.handle(
      request("GET"),
      response,
      "/api/business/toca-do-morcego/location",
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "MORRO_PRO_ROLE_DENIED" });
    expect(fixture.runtime.getBusinessLocationPlace).not.toHaveBeenCalled();
  });
});
