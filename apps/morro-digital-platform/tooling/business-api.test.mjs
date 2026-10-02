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
