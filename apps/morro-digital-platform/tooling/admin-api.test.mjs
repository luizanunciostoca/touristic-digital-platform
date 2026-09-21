import { describe, expect, it } from "vitest";

import { createAdminApi } from "./admin-api.mjs";

function responseRecorder() {
  return {
    statusCode: 0,
    headers: new Map(),
    body: "",
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), value);
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

function request(url, { method = "GET", headers = {}, body } = {}) {
  const chunks =
    body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")];
  return {
    url,
    method,
    headers,
    morroCorrelationId: "corr_test",
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

const platformOwner = Object.freeze({
  subject: "platform-owner",
  email: "owner@morro.invalid",
  role: "PLATFORM_OWNER",
  businessIds: Object.freeze([]),
  issuedAt: 1,
  expiresAt: 9_999_999_999,
  sessionId: "session-owner",
});

const businessOwner = Object.freeze({
  id: "business-owner",
  email: "business@morro.invalid",
  role: "BUSINESS_OWNER",
  businessIds: Object.freeze(["toca-do-morcego"]),
});

function fixture(session = platformOwner, options = {}) {
  const events = [];
  const adminState = new Map();
  const users = [
    {
      id: platformOwner.subject,
      email: platformOwner.email,
      role: platformOwner.role,
      businessIds: platformOwner.businessIds,
    },
    businessOwner,
  ];

  function effectiveUser(user) {
    const state = adminState.get(user.id) ?? {};
    const role = state.role ?? user.role;
    return {
      ...user,
      role,
      configuredRole: user.role,
      configuredCanonicalRole: user.role,
      status: state.status ?? "active",
      policyUpdatedAt: state.updatedAt ?? null,
      policyUpdatedBy: state.updatedBy ?? null,
    };
  }

  const authApi = {
    async resolveSession() {
      return session;
    },
    authorizeMutation() {
      return { allowed: true };
    },
    reauthenticate(userId, credential) {
      return (
        userId === platformOwner.subject && credential === "fixture-secret"
      );
    },
    listConfiguredUsers() {
      return users;
    },
    findConfiguredUser(id) {
      return users.find((user) => user.id === id) ?? null;
    },
    async listAdminUsers() {
      return users.map(effectiveUser);
    },
    async findAdminUser(id) {
      const user = users.find((candidate) => candidate.id === id);
      return user ? effectiveUser(user) : null;
    },
    async updateUserStatus(id, status, actorSubject) {
      const user = users.find((candidate) => candidate.id === id);
      if (!user) return null;
      const previousState = effectiveUser(user);
      adminState.set(id, {
        ...(adminState.get(id) ?? {}),
        status,
        updatedAt: 100,
        updatedBy: actorSubject,
      });
      return {
        previousState,
        newState: effectiveUser(user),
        revokedSessions: status === "blocked" ? 1 : 0,
      };
    },
    async updateUserRole(id, role, actorSubject) {
      const user = users.find((candidate) => candidate.id === id);
      if (!user) return null;
      const previousState = effectiveUser(user);
      adminState.set(id, {
        ...(adminState.get(id) ?? {}),
        role,
        updatedAt: 101,
        updatedBy: actorSubject,
      });
      return {
        previousState,
        newState: effectiveUser(user),
        revokedSessions: 1,
      };
    },
    async listUserSessions(id) {
      if (id !== businessOwner.id) return [];
      return [
        {
          handle: "a".repeat(64),
          subject: businessOwner.id,
          issuedAt: 100,
          expiresAt: 1_000,
          revokedAt: null,
          active: true,
        },
      ];
    },
    async revokeUserSession(id, handle) {
      return {
        found: id === businessOwner.id && handle === "a".repeat(64),
        alreadyRevoked: false,
      };
    },
  };

  const platformOperations = {
    service: "morro-digital-platform",
    destinationId: "morro-de-sao-paulo",
    release: {
      sha: "test-sha",
      version: "test-version",
      deploymentId: "test-deployment",
    },
    healthSnapshot() {
      return { readiness: "ready", checks: [] };
    },
    emit(event) {
      events.push(event);
    },
  };

  return {
    api: createAdminApi({
      authApi,
      platformOperations,
      getEnvironmentValue(key) {
        if (key === "NODE_ENV") {
          return options.production ? "production" : "development";
        }
        if (
          key === "CONTROL_CENTER_SUPPORT_SECRET" ||
          key === "CONTROL_CENTER_STEP_UP_SECRET"
        ) {
          return "x".repeat(64);
        }
        return "";
      },
      domainAdapters: options.domainAdapters ?? {},
    }),
    events,
  };
}

describe("Control Center Admin API", () => {
  it("exposes a capability-backed PLATFORM_OWNER session", async () => {
    const { api } = fixture();
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/session"),
      response,
      new URL("http://localhost/api/admin/v1/session"),
    );

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.actor.canonicalRole).toBe("PLATFORM_OWNER");
    expect(payload.actor.capabilities).toContain("system.manage");
    expect(payload.actor.capabilities).toContain("support.impersonate");
  });

  it("denies a BUSINESS_OWNER from platform dashboard authority", async () => {
    const { api } = fixture({
      ...platformOwner,
      role: "BUSINESS_OWNER",
      businessIds: ["toca-do-morcego"],
    });
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/dashboard"),
      response,
      new URL("http://localhost/api/admin/v1/dashboard"),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "ADMIN_SURFACE_DENIED",
      capability: "platform.read",
      reason: "platform_admin_surface_required",
    });
  });

  it("projects the full Control Center completion matrix on the dashboard", async () => {
    const available = (coverage) => ({ state: "available", coverage });
    const domainAdapters = {
      businesses: available(["profile"]),
      affiliates: available(["list", "detail"]),
      crm: available(["leads", "search"]),
      products: available(["list", "create-offer", "disable-offer"]),
      reservations: available(["list", "cancel-held"]),
      ticketing: available([
        "operator/check-in",
        "operator/offline-devices/provision",
        "operator/offline-devices/revoke",
      ]),
      orders: available(["orders-by-id"]),
      financial: available(["payments-by-id", "refund"]),
      content: available(["list", "lifecycle-transition"]),
      destinations: { state: "ready", coverage: ["list", "replace", "status"] },
    };
    const { api } = fixture(platformOwner, { domainAdapters });
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/dashboard"),
      response,
      new URL("http://localhost/api/admin/v1/dashboard"),
    );

    expect(response.statusCode).toBe(200);
    const modules = JSON.parse(response.body).modules;
    expect(Object.keys(modules).sort()).toEqual(
      [
        "affiliates",
        "audit",
        "businesses",
        "content",
        "crm",
        "destinations",
        "financial",
        "orders",
        "permissions",
        "products",
        "reservations",
        "settings",
        "support",
        "system",
        "ticketing",
        "users",
      ].sort(),
    );
    for (const name of [
      "businesses",
      "users",
      "affiliates",
      "crm",
      "products",
      "reservations",
      "ticketing",
      "orders",
      "financial",
      "content",
      "support",
      "permissions",
      "system",
      "settings",
    ]) {
      expect(modules[name].state).toBe("available");
    }
    expect(modules.destinations.state).toBe("ready");
    expect(modules.audit.state).toBe("runtime-projection");
  });

  it("passes the authenticated request into domain universal-search adapters", async () => {
    let received;
    const crm = {
      async search(input) {
        received = input;
        return [
          {
            type: "lead",
            id: "42",
            title: "Toca do Morcego",
            context: "proposal_sent",
            href: "/apps/admin-crm/public/lead-detail.html?id=42",
          },
        ];
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { crm },
    });
    const req = request("/api/admin/v1/search?q=toca");
    const response = responseRecorder();

    await api.handle(
      req,
      response,
      new URL("http://localhost/api/admin/v1/search?q=toca"),
    );

    expect(response.statusCode).toBe(200);
    expect(received).toMatchObject({
      query: "toca",
      actor: { subject: "platform-owner" },
      request: req,
      effectiveUser: null,
    });
    expect(JSON.parse(response.body).results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "lead",
          title: "Toca do Morcego",
          domain: "crm",
        }),
      ]),
    );
  });

  it("groups and paginates owner-backed universal-search results with stable deep links", async () => {
    const { api } = fixture(platformOwner, {
      domainAdapters: {
        affiliates: {
          searchCapability: "affiliate.read",
          searchDestinationAware: true,
          async search() {
            return [
              {
                type: "affiliate",
                id: "aff_00000001",
                title: "Afiliado Alfa",
                context: "active",
                href: "#affiliates:aff_00000001",
              },
            ];
          },
        },
        products: {
          searchCapability: "business.read",
          searchDestinationAware: true,
          async search() {
            return [
              {
                type: "product",
                id: "tour-alpha",
                title: "Passeio Alfa",
                href: "#products:offer-alpha",
                destinationId: "morro-de-sao-paulo",
              },
              {
                type: "offer",
                id: "offer-alpha",
                title: "Oferta Alfa",
                href: "#products:offer-alpha",
                destinationId: "morro-de-sao-paulo",
              },
            ];
          },
        },
      },
    });
    const response = responseRecorder();
    const url = new URL(
      "http://localhost/api/admin/v1/search?q=alfa&limit=2&offset=0",
    );

    await api.handle(request(url.pathname + url.search), response, url);

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.results).toHaveLength(2);
    expect(payload.pagination).toMatchObject({
      limit: 2,
      offset: 0,
      hasMore: true,
    });
    expect(payload.groups.map((group) => group.type)).toEqual([
      "affiliate",
      "product",
    ]);
    expect(payload.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "affiliate",
          href: "#affiliates:aff_00000001",
        }),
        expect.objectContaining({
          type: "product",
          href: "#products:offer-alpha",
        }),
      ]),
    );
  });

  it("passes explicit destinationId to capable owners and suppresses mismatched or unscoped results", async () => {
    let received;
    const products = {
      searchCapability: "business.read",
      searchDestinationAware: true,
      async search(input) {
        received = input;
        return [
          {
            type: "product",
            id: "product-morro",
            title: "Produto Morro",
            href: "#products:offer-morro",
            destinationId: "morro-de-sao-paulo",
          },
          {
            type: "product",
            id: "product-itacare",
            title: "Produto Itacaré",
            href: "#products:offer-itacare",
            destinationId: "itacare",
          },
        ];
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { products },
    });
    const response = responseRecorder();
    const url = new URL(
      "http://localhost/api/admin/v1/search?q=produto&destinationId=morro-de-sao-paulo",
    );

    await api.handle(request(url.pathname + url.search), response, url);

    const payload = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(received.destinationId).toBe("morro-de-sao-paulo");
    expect(payload.results).toEqual([
      expect.objectContaining({
        id: "product-morro",
        destinationId: "morro-de-sao-paulo",
      }),
    ]);
    expect(payload.partial).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "users",
          reason: "destination_scope_unavailable",
        }),
        expect.objectContaining({
          domain: "businesses",
          reason: "destination_scope_unavailable",
        }),
        expect.objectContaining({
          domain: "crm",
          reason: "destination_scope_unavailable",
        }),
        expect.objectContaining({
          domain: "financial",
          reason: "destination_scope_unavailable",
        }),
      ]),
    );
  });

  it("suppresses a search owner when its own required capability is not granted", async () => {
    let called = false;
    const restricted = {
      searchCapability: "system.manage",
      searchDestinationAware: false,
      async search() {
        called = true;
        return [
          {
            type: "lead",
            id: "99",
            title: "Should never be visible",
            href: "/apps/admin-crm/public/lead-detail.html?id=99",
          },
        ];
      },
    };
    const { api } = fixture(
      { ...platformOwner, role: "PLATFORM_ADMIN" },
      { domainAdapters: { crm: restricted } },
    );
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/search?q=never"),
      response,
      new URL("http://localhost/api/admin/v1/search?q=never"),
    );

    expect(response.statusCode).toBe(200);
    expect(called).toBe(false);
    expect(JSON.parse(response.body).results).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "99" }),
      ]),
    );
  });

  it("keeps owner failures partial instead of turning the whole search into an API failure", async () => {
    const { api } = fixture(platformOwner, {
      domainAdapters: {
        crm: {
          searchCapability: "crm.read",
          searchDestinationAware: false,
          async search() {
            throw new Error("CRM_OWNER_DOWN");
          },
        },
      },
    });
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/search?q=owner"),
      response,
      new URL("http://localhost/api/admin/v1/search?q=owner"),
    );

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.state).toBe("partial");
    expect(payload.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "user", title: "owner@morro.invalid" }),
      ]),
    );
    expect(payload.partial).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "crm",
          reason: "owner_search_failed",
        }),
      ]),
    );
  });

  it("treats empty queries as idle and normalizes identity case safely", async () => {
    let calls = 0;
    const adapter = {
      async search() {
        calls += 1;
        return [];
      },
    };
    const idleFixture = fixture(platformOwner, {
      domainAdapters: { crm: adapter },
    });
    let response = responseRecorder();
    await idleFixture.api.handle(
      request("/api/admin/v1/search?q="),
      response,
      new URL("http://localhost/api/admin/v1/search?q="),
    );
    expect(JSON.parse(response.body)).toMatchObject({
      state: "idle",
      results: [],
    });
    expect(calls).toBe(0);

    response = responseRecorder();
    await idleFixture.api.handle(
      request("/api/admin/v1/search?q=OWNER%40MORRO.INVALID"),
      response,
      new URL(
        "http://localhost/api/admin/v1/search?q=OWNER%40MORRO.INVALID",
      ),
    );
    expect(JSON.parse(response.body).results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "user",
          title: "owner@morro.invalid",
        }),
      ]),
    );
  });

  it("preserves special characters as bounded owner input without interpreting them", async () => {
    let receivedQuery;
    const crm = {
      async search({ query }) {
        receivedQuery = query;
        return [];
      },
    };
    const { api } = fixture(platformOwner, { domainAdapters: { crm } });
    const query = "%_'\"><script>";
    const url = new URL(
      "http://localhost/api/admin/v1/search?q=" + encodeURIComponent(query),
    );
    const response = responseRecorder();

    await api.handle(request(url.pathname + url.search), response, url);

    expect(response.statusCode).toBe(200);
    expect(receivedQuery).toBe(query);
  });

  it("rate-limits repeated universal-search floods per actor", async () => {
    const { api } = fixture();
    for (let index = 0; index < 40; index += 1) {
      const response = responseRecorder();
      await api.handle(
        request("/api/admin/v1/search?q=flood"),
        response,
        new URL("http://localhost/api/admin/v1/search?q=flood"),
      );
      expect(response.statusCode).toBe(200);
    }
    const limited = responseRecorder();
    await api.handle(
      request("/api/admin/v1/search?q=flood"),
      limited,
      new URL("http://localhost/api/admin/v1/search?q=flood"),
    );
    expect(limited.statusCode).toBe(429);
    expect(JSON.parse(limited.body).error).toBe("SEARCH_RATE_LIMITED");
  });

  it("blocks business identities from every admin namespace before domain adapters", async () => {
    const { api } = fixture({
      ...platformOwner,
      role: "BUSINESS_OWNER",
      businessIds: ["toca-do-morcego"],
    });
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/businesses/toca-do-morcego/profile", {
        method: "PUT",
      }),
      response,
      new URL(
        "http://localhost/api/admin/v1/businesses/toca-do-morcego/profile",
      ),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "ADMIN_SURFACE_DENIED",
      capability: "business.update",
    });
  });

  it("lists identity projections without password or secret material", async () => {
    const { api } = fixture();
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/users"),
      response,
      new URL("http://localhost/api/admin/v1/users"),
    );

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.users).toHaveLength(2);
    expect(JSON.stringify(payload)).not.toContain("password");
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("governs account block, reactivate and role changes behind step-up", async () => {
    const { api } = fixture();
    const path = "/api/admin/v1/users/business-owner/block";

    const withoutStepUp = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        body: {
          reason: "Conta comprometida em investigação administrativa",
          confirmation: "BLOQUEAR",
        },
      }),
      withoutStepUp,
      new URL("http://localhost" + path),
    );
    expect(withoutStepUp.statusCode).toBe(403);
    expect(JSON.parse(withoutStepUp.body).error).toBe("STEP_UP_REQUIRED");

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const blocked = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Conta comprometida em investigação administrativa",
          confirmation: "BLOQUEAR",
        },
      }),
      blocked,
      new URL("http://localhost" + path),
    );
    expect(blocked.statusCode).toBe(200);
    expect(JSON.parse(blocked.body)).toMatchObject({
      success: true,
      user: { id: "business-owner", status: "blocked" },
      revokedSessions: 1,
    });

    const reactivated = responseRecorder();
    const reactivatePath = "/api/admin/v1/users/business-owner/reactivate";
    await api.handle(
      request(reactivatePath, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Investigação concluída e acesso liberado",
          confirmation: "REATIVAR",
        },
      }),
      reactivated,
      new URL("http://localhost" + reactivatePath),
    );
    expect(reactivated.statusCode).toBe(200);
    expect(JSON.parse(reactivated.body).user.status).toBe("active");

    const roleChanged = responseRecorder();
    const rolePath = "/api/admin/v1/users/business-owner/role";
    await api.handle(
      request(rolePath, {
        method: "POST",
        headers: { cookie },
        body: {
          role: "BUSINESS_MANAGER",
          reason: "Ajuste de autoridade solicitado pela operação",
          confirmation: "ALTERAR PERFIL",
        },
      }),
      roleChanged,
      new URL("http://localhost" + rolePath),
    );
    expect(roleChanged.statusCode).toBe(200);
    expect(JSON.parse(roleChanged.body)).toMatchObject({
      user: {
        id: "business-owner",
        role: "BUSINESS_MANAGER",
        configuredRole: "BUSINESS_OWNER",
      },
      revokedSessions: 1,
    });
  });

  it("governs Ticketing check-in and offline device lifecycle behind step-up", async () => {
    const calls = [];
    const ticketing = {
      async handle({ request: ownerRequest, response, requestUrl }) {
        const chunks = [];
        for await (const chunk of ownerRequest) chunks.push(chunk);
        const body = chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
          : {};
        calls.push({ pathname: requestUrl.pathname, body });

        if (requestUrl.pathname.endsWith("/operator/check-in")) {
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ data: { status: "checked_in" } }));
          return;
        }
        if (
          requestUrl.pathname.endsWith("/operator/offline-devices") &&
          !requestUrl.pathname.endsWith("/revoke")
        ) {
          response.statusCode = 201;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              data: {
                token: "device-token-one-time",
                claims: {
                  deviceId: "tdv_device_0001",
                  destinationId: "morro-de-sao-paulo",
                },
              },
            }),
          );
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            data: {
              deviceId: "tdv_device_0001",
              revokedAt: "2026-09-21T12:00:00.000Z",
            },
          }),
        );
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { ticketing },
    });

    const checkInPath = "/api/admin/v1/ticketing/operator/check-in";
    const withoutStepUp = responseRecorder();
    await api.handle(
      request(checkInPath, {
        method: "POST",
        body: {
          qrPayload: "ticketing:qr:fixture",
          reason: "Validar ticket apresentado na operação",
          confirmation: "VALIDAR CHECK-IN",
        },
      }),
      withoutStepUp,
      new URL("http://localhost" + checkInPath),
    );
    expect(withoutStepUp.statusCode).toBe(403);
    expect(JSON.parse(withoutStepUp.body).error).toBe("STEP_UP_REQUIRED");
    expect(calls).toHaveLength(0);

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const stepUpCookie = String(stepUp.headers.get("set-cookie")).split(
      ";",
      1,
    )[0];

    const checkIn = responseRecorder();
    await api.handle(
      request(checkInPath, {
        method: "POST",
        headers: { cookie: stepUpCookie },
        body: {
          qrPayload: "ticketing:qr:fixture",
          reason: "Validar ticket apresentado na operação",
          confirmation: "VALIDAR CHECK-IN",
        },
      }),
      checkIn,
      new URL("http://localhost" + checkInPath),
    );
    expect(checkIn.statusCode).toBe(200);

    const provisionPath = "/api/admin/v1/ticketing/operator/offline-devices";
    const provision = responseRecorder();
    await api.handle(
      request(provisionPath, {
        method: "POST",
        headers: { cookie: stepUpCookie },
        body: {
          deviceId: "tdv_device_0001",
          destinationId: "morro-de-sao-paulo",
          ttlSeconds: 3600,
          reason: "Provisionar dispositivo autorizado para check-in offline",
          confirmation: "PROVISIONAR DISPOSITIVO",
        },
      }),
      provision,
      new URL("http://localhost" + provisionPath),
    );
    expect(provision.statusCode).toBe(201);
    expect(JSON.parse(provision.body).data.token).toBe("device-token-one-time");

    const revokePath =
      "/api/admin/v1/ticketing/operator/offline-devices/tdv_device_0001/revoke";
    const revoke = responseRecorder();
    await api.handle(
      request(revokePath, {
        method: "POST",
        headers: { cookie: stepUpCookie },
        body: {
          reason: "Revogar dispositivo após encerramento da operação",
          confirmation: "REVOGAR DISPOSITIVO",
        },
      }),
      revoke,
      new URL("http://localhost" + revokePath),
    );
    expect(revoke.statusCode).toBe(200);

    expect(calls).toEqual([
      {
        pathname: checkInPath,
        body: { qrPayload: "ticketing:qr:fixture" },
      },
      {
        pathname: provisionPath,
        body: {
          deviceId: "tdv_device_0001",
          destinationId: "morro-de-sao-paulo",
          ttlSeconds: 3600,
        },
      },
      {
        pathname: revokePath,
        body: {},
      },
    ]);

    const support = responseRecorder();
    await api.handle(
      request("/api/admin/v1/support/session", {
        method: "POST",
        body: {
          effectiveUserId: "business-owner",
          reason: "Investigar operação sem assumir autoridade crítica",
        },
      }),
      support,
      new URL("http://localhost/api/admin/v1/support/session"),
    );
    expect(support.statusCode).toBe(201);
    const supportCookie = String(support.headers.get("set-cookie")).split(
      ";",
      1,
    )[0];

    const deniedInSupport = responseRecorder();
    await api.handle(
      request(checkInPath, {
        method: "POST",
        headers: {
          cookie: `${supportCookie}; ${stepUpCookie}`,
        },
        body: {
          qrPayload: "ticketing:qr:fixture",
          reason: "Ação crítica deve ser negada durante suporte",
          confirmation: "VALIDAR CHECK-IN",
        },
      }),
      deniedInSupport,
      new URL("http://localhost" + checkInPath),
    );
    expect(deniedInSupport.statusCode).toBe(403);
    expect(JSON.parse(deniedInSupport.body).error).toBe(
      "SUPPORT_MODE_CRITICAL_ACTION_DENIED",
    );
    expect(calls).toHaveLength(3);
  });

  it("creates and disables Ticketing offers only through governed owner commands", async () => {
    const calls = [];
    const products = {
      async readOffer(inventoryId) {
        return {
          status: "found",
          data: {
            projection: {
              businessId: "business-owner",
              offer: { id: inventoryId, enabled: true },
            },
          },
        };
      },
      async createBusinessOffer(input) {
        calls.push({ operation: "create", input });
        return {
          status: "created",
          data: {
            id: "mpi_admin_created_0000000000000000",
            businessId: input.businessId,
            enabled: true,
          },
        };
      },
      async disableBusinessOffer(input) {
        calls.push({ operation: "disable", input });
        return {
          status: "updated",
          data: {
            id: input.inventoryId,
            businessId: input.businessId,
            enabled: false,
          },
        };
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { products },
    });

    const createPath = "/api/admin/v1/products/offers";
    const noStepUp = responseRecorder();
    await api.handle(
      request(createPath, {
        method: "POST",
        body: {
          businessId: "business-owner",
          requestKey: "offer_admin_0001",
          offer: { productKind: "tour" },
          reason: "Criar oferta aprovada pela operação comercial",
          confirmation: "CRIAR OFERTA",
        },
      }),
      noStepUp,
      new URL("http://localhost" + createPath),
    );
    expect(noStepUp.statusCode).toBe(403);
    expect(JSON.parse(noStepUp.body).error).toBe("STEP_UP_REQUIRED");
    expect(calls).toHaveLength(0);

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const created = responseRecorder();
    await api.handle(
      request(createPath, {
        method: "POST",
        headers: { cookie },
        body: {
          businessId: "business-owner",
          requestKey: "offer_admin_0001",
          offer: {
            productKind: "tour",
            productReference: "volta-a-ilha-admin",
            label: "Volta a Ilha Admin",
          },
          reason: "Criar oferta aprovada pela operação comercial",
          confirmation: "CRIAR OFERTA",
        },
      }),
      created,
      new URL("http://localhost" + createPath),
    );
    expect(created.statusCode).toBe(201);
    expect(JSON.parse(created.body)).toMatchObject({
      data: {
        businessId: "business-owner",
        enabled: true,
      },
    });

    const disablePath =
      "/api/admin/v1/products/mpi_admin_created_0000000000000000/disable";
    const disabled = responseRecorder();
    await api.handle(
      request(disablePath, {
        method: "POST",
        headers: { cookie },
        body: {
          businessId: "business-owner",
          reason: "Encerrar oferta sem reescrever histórico comercial",
          confirmation: "DESATIVAR OFERTA",
        },
      }),
      disabled,
      new URL("http://localhost" + disablePath),
    );
    expect(disabled.statusCode).toBe(200);
    expect(JSON.parse(disabled.body).data.enabled).toBe(false);
    expect(calls.map((entry) => entry.operation)).toEqual([
      "create",
      "disable",
    ]);
  });

  it("fails closed when a product offer is attributed to another business", async () => {
    const calls = [];
    const { api } = fixture(platformOwner, {
      domainAdapters: {
        products: {
          async readOffer(inventoryId) {
            return {
              status: "found",
              data: {
                projection: {
                  businessId: "business-other",
                  offer: { id: inventoryId, enabled: true },
                },
              },
            };
          },
          async createBusinessOffer(input) {
            calls.push(input);
            return { status: "created", data: {} };
          },
          async disableBusinessOffer(input) {
            calls.push(input);
            return { status: "updated", data: {} };
          },
        },
      },
    });

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const path =
      "/api/admin/v1/products/mpi_admin_foreign_0000000000000000/disable";
    const response = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          businessId: "business-owner",
          reason: "Tentativa deve respeitar vínculo owner da oferta",
          confirmation: "DESATIVAR OFERTA",
        },
      }),
      response,
      new URL("http://localhost" + path),
    );
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe(
      "BUSINESS_OFFER_SCOPE_MISMATCH",
    );
    expect(calls).toHaveLength(0);
  });

  it("cancels only held reservations behind step-up and owner authority", async () => {
    const calls = [];
    const reservations = {
      async readReservation(reservationId) {
        return {
          status: "found",
          data: {
            reservation: {
              id: reservationId,
              status: "held",
            },
          },
        };
      },
      async cancelHeldReservation(input) {
        calls.push(input);
        return {
          status: "updated",
          data: {
            previousState: { id: input.reservationId, status: "held" },
            newState: { id: input.reservationId, status: "cancelled" },
            replayed: false,
          },
        };
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { reservations },
    });
    const path = "/api/admin/v1/reservations/trv_admin_held_0001/cancel";

    const withoutStepUp = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        body: {
          reason: "Cancelar hold solicitado antes da confirmação financeira",
          confirmation: "CANCELAR RESERVA",
        },
      }),
      withoutStepUp,
      new URL("http://localhost" + path),
    );
    expect(withoutStepUp.statusCode).toBe(403);
    expect(JSON.parse(withoutStepUp.body).error).toBe("STEP_UP_REQUIRED");
    expect(calls).toHaveLength(0);

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const wrongConfirmation = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Cancelar hold solicitado antes da confirmação financeira",
          confirmation: "CANCELAR",
        },
      }),
      wrongConfirmation,
      new URL("http://localhost" + path),
    );
    expect(wrongConfirmation.statusCode).toBe(400);
    expect(JSON.parse(wrongConfirmation.body).error).toBe(
      "TEXT_CONFIRMATION_REQUIRED",
    );
    expect(calls).toHaveLength(0);

    const cancelled = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Cancelar hold solicitado antes da confirmação financeira",
          confirmation: "CANCELAR RESERVA",
        },
      }),
      cancelled,
      new URL("http://localhost" + path),
    );
    expect(cancelled.statusCode).toBe(200);
    expect(JSON.parse(cancelled.body)).toMatchObject({
      data: {
        previousState: { status: "held" },
        newState: { status: "cancelled" },
      },
    });
    expect(calls).toEqual([
      {
        reservationId: "trv_admin_held_0001",
        actorReference: "platform-owner",
      },
    ]);
  });

  it("rejects administrative cancellation after a reservation leaves held state", async () => {
    const calls = [];
    const { api } = fixture(platformOwner, {
      domainAdapters: {
        reservations: {
          async readReservation(reservationId) {
            return {
              status: "found",
              data: {
                reservation: { id: reservationId, status: "confirmed" },
              },
            };
          },
          async cancelHeldReservation(input) {
            calls.push(input);
            return { status: "updated", data: {} };
          },
        },
      },
    });

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];
    const path = "/api/admin/v1/reservations/trv_admin_confirmed_0001/cancel";
    const response = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Tentativa deve respeitar o estado owner confirmado",
          confirmation: "CANCELAR RESERVA",
        },
      }),
      response,
      new URL("http://localhost" + path),
    );

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe(
      "TICKETING_RESERVATION_NOT_HELD",
    );
    expect(calls).toHaveLength(0);
  });

  it("fails closed when a domain admin contract is not registered", async () => {
    const { api } = fixture();
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/financial"),
      response,
      new URL("http://localhost/api/admin/v1/financial"),
    );

    expect(response.statusCode).toBe(501);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED",
      domain: "financial",
      invariant: "NO_DIRECT_TABLE_BYPASS",
    });
  });

  it("requires reauthentication before issuing a step-up session", async () => {
    const { api } = fixture();

    const denied = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "incorrect-fixture-value" },
      }),
      denied,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    expect(denied.statusCode).toBe(403);
    expect(JSON.parse(denied.body).error).toBe(
      "STEP_UP_REAUTHENTICATION_FAILED",
    );

    const accepted = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      accepted,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    expect(accepted.statusCode).toBe(201);
    expect(accepted.headers.get("set-cookie")).toContain("md_control_step_up=");
    expect(JSON.parse(accepted.body).stepUp.method).toBe("password");
  });

  it("lists user sessions without exposing raw session identifiers", async () => {
    const { api } = fixture();
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/users/business-owner/sessions"),
      response,
      new URL("http://localhost/api/admin/v1/users/business-owner/sessions"),
    );

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0].handle).toBe("a".repeat(64));
    expect(JSON.stringify(payload)).not.toContain("sessionId");
  });

  it("requires step-up and reason before revoking a user session", async () => {
    const { api } = fixture();
    const sessionHandle = "a".repeat(64);

    const withoutStepUp = responseRecorder();
    await api.handle(
      request(
        `/api/admin/v1/users/business-owner/sessions/${sessionHandle}/revoke`,
        {
          method: "POST",
          body: {
            reason: "Support investigation requires session revocation",
            confirmation: "REVOGAR",
          },
        },
      ),
      withoutStepUp,
      new URL(
        `http://localhost/api/admin/v1/users/business-owner/sessions/${sessionHandle}/revoke`,
      ),
    );
    expect(withoutStepUp.statusCode).toBe(403);
    expect(JSON.parse(withoutStepUp.body).error).toBe("STEP_UP_REQUIRED");

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const withoutConfirmation = responseRecorder();
    await api.handle(
      request(
        `/api/admin/v1/users/business-owner/sessions/${sessionHandle}/revoke`,
        {
          method: "POST",
          headers: { cookie },
          body: {
            reason: "Support investigation requires session revocation",
            confirmation: "WRONG",
          },
        },
      ),
      withoutConfirmation,
      new URL(
        `http://localhost/api/admin/v1/users/business-owner/sessions/${sessionHandle}/revoke`,
      ),
    );
    expect(withoutConfirmation.statusCode).toBe(400);
    expect(JSON.parse(withoutConfirmation.body).error).toBe(
      "TEXT_CONFIRMATION_REQUIRED",
    );

    const revoked = responseRecorder();
    await api.handle(
      request(
        `/api/admin/v1/users/business-owner/sessions/${sessionHandle}/revoke`,
        {
          method: "POST",
          headers: { cookie },
          body: {
            reason: "Support investigation requires session revocation",
            confirmation: "REVOGAR",
          },
        },
      ),
      revoked,
      new URL(
        `http://localhost/api/admin/v1/users/business-owner/sessions/${sessionHandle}/revoke`,
      ),
    );

    expect(revoked.statusCode).toBe(200);
    expect(JSON.parse(revoked.body)).toMatchObject({
      success: true,
      userId: "business-owner",
      sessionHandle,
      alreadyRevoked: false,
    });
  });

  it("requires step-up and exact confirmation before delegating a refund", async () => {
    const calls = [];
    const financial = {
      async resolvePaymentTenant() {
        return { status: "found", tenantId: "toca-do-morcego" };
      },
      async refund(input) {
        calls.push(input);
        input.response.statusCode = 202;
        input.response.end(
          JSON.stringify({
            data: {
              refundId: "rfd_admin_0001",
              paymentId: input.paymentId,
              status: "PENDING",
              replayed: false,
            },
          }),
        );
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { financial },
    });
    const path = "/api/admin/v1/financial/refunds/pay_admin_0001";

    const withoutStepUp = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        body: {
          reason: "Customer requested a verified administrative refund",
          confirmation: "REFUNDAR",
        },
      }),
      withoutStepUp,
      new URL("http://localhost" + path),
    );
    expect(withoutStepUp.statusCode).toBe(403);
    expect(JSON.parse(withoutStepUp.body).error).toBe("STEP_UP_REQUIRED");
    expect(calls).toHaveLength(0);

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const wrongConfirmation = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Customer requested a verified administrative refund",
          confirmation: "WRONG",
        },
      }),
      wrongConfirmation,
      new URL("http://localhost" + path),
    );
    expect(wrongConfirmation.statusCode).toBe(400);
    expect(JSON.parse(wrongConfirmation.body).error).toBe(
      "TEXT_CONFIRMATION_REQUIRED",
    );
    expect(calls).toHaveLength(0);

    const accepted = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Customer requested a verified administrative refund",
          confirmation: "REFUNDAR",
        },
      }),
      accepted,
      new URL("http://localhost" + path),
    );
    expect(accepted.statusCode).toBe(202);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      paymentId: "pay_admin_0001",
      reason: "Customer requested a verified administrative refund",
    });
  });

  it("denies financial mutations when Support Mode tenant differs from the resource tenant", async () => {
    const calls = [];
    const financial = {
      async resolvePaymentTenant() {
        return { status: "found", tenantId: "other-business" };
      },
      async refund(input) {
        calls.push(input);
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { financial },
    });

    const supportResponse = responseRecorder();
    await api.handle(
      request("/api/admin/v1/support/session", {
        method: "POST",
        body: {
          effectiveUserId: "business-owner",
          reason: "Reproduzir problema financeiro reportado pela empresa",
        },
      }),
      supportResponse,
      new URL("http://localhost/api/admin/v1/support/session"),
    );
    expect(supportResponse.statusCode).toBe(201);
    const supportCookie = String(
      supportResponse.headers.get("set-cookie"),
    ).split(";", 1)[0];

    const stepUpResponse = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUpResponse,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    expect(stepUpResponse.statusCode).toBe(201);
    const stepUpCookie = String(stepUpResponse.headers.get("set-cookie")).split(
      ";",
      1,
    )[0];

    const response = responseRecorder();
    const path = "/api/admin/v1/financial/refunds/pay_admin_0001";
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie: `${supportCookie}; ${stepUpCookie}` },
        body: {
          reason: "Attempt against a different tenant must fail closed",
          confirmation: "REFUNDAR",
        },
      }),
      response,
      new URL("http://localhost" + path),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toBe("SUPPORT_SCOPE_MISMATCH");
    expect(calls).toHaveLength(0);
  });

  it("denies Control Center financial effects in production even after step-up", async () => {
    const calls = [];
    const { api } = fixture(platformOwner, {
      production: true,
      domainAdapters: {
        financial: {
          async refund(input) {
            calls.push(input);
          },
        },
      },
    });

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    expect(stepUp.statusCode).toBe(201);
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const response = responseRecorder();
    const path = "/api/admin/v1/financial/refunds/pay_admin_0001";
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Production refund must remain explicitly unauthorized",
          confirmation: "REFUNDAR",
        },
      }),
      response,
      new URL("http://localhost" + path),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toBe(
      "PRODUCTION_FINANCIAL_EFFECT_NOT_AUTHORIZED",
    );
    expect(calls).toHaveLength(0);
  });

  it("requires step-up before Destination mutations and persists owner audit metadata", async () => {
    const calls = [];
    const destination = {
      async handle({ response }) {
        calls.push("mutation");
        response.statusCode = 200;
        response.end(JSON.stringify({ status: "updated" }));
        return {
          reason: "Manutenção programada",
          entityType: "destination",
          entityId: "morro-de-sao-paulo",
          previousState: { status: "active", version: 1 },
          newState: { status: "suspended", version: 2 },
        };
      },
    };
    const { api, events } = fixture(platformOwner, {
      domainAdapters: { destinations: destination },
    });
    const path = "/api/admin/v1/destinations/morro-de-sao-paulo";

    const withoutStepUp = responseRecorder();
    await api.handle(
      request(path, {
        method: "PATCH",
        body: {
          status: "suspended",
          reason: "Manutenção programada",
        },
      }),
      withoutStepUp,
      new URL("http://localhost" + path),
    );
    expect(withoutStepUp.statusCode).toBe(403);
    expect(JSON.parse(withoutStepUp.body).error).toBe("STEP_UP_REQUIRED");
    expect(calls).toHaveLength(0);

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const accepted = responseRecorder();
    await api.handle(
      request(path, {
        method: "PATCH",
        headers: { cookie },
        body: {
          status: "suspended",
          reason: "Manutenção programada",
        },
      }),
      accepted,
      new URL("http://localhost" + path),
    );

    expect(accepted.statusCode).toBe(200);
    expect(calls).toEqual(["mutation"]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "audit",
          attributes: expect.objectContaining({
            action: "control-center.destinations.mutation.complete",
            entityType: "destination",
            entityId: "morro-de-sao-paulo",
            reason: "Manutenção programada",
            result: "success",
          }),
        }),
      ]),
    );
  });

  it("derives the business directory from identity memberships only", async () => {
    const { api } = fixture();
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/businesses"),
      response,
      new URL("http://localhost/api/admin/v1/businesses"),
    );

    const payload = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(payload.authority).toBe("read-only-directory");
    expect(payload.mutationContract).toBe("BUSINESS_ADMIN_CONTRACT_REQUIRED");
    expect(payload.businesses[0].id).toBe("toca-do-morcego");
  });
});

describe("Control Center Affiliates critical actions", () => {
  it("requires step-up and exact confirmation before suspending an Affiliate membership", async () => {
    const calls = [];
    const affiliates = {
      async changeMembershipStatus(input) {
        calls.push(input);
        return {
          status: "updated",
          data: {
            membership: {
              affiliateId: input.affiliateId,
              programId: input.programId,
              status: input.status,
            },
          },
        };
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { affiliates },
    });
    const path =
      "/api/admin/v1/affiliates/aff_admin_0001/memberships/prog_admin_0001/suspend";

    const withoutStepUp = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        body: {
          reason: "Suspender membership durante investigação administrativa",
          confirmation: "SUSPENDER",
        },
      }),
      withoutStepUp,
      new URL("http://localhost" + path),
    );
    expect(withoutStepUp.statusCode).toBe(403);
    expect(JSON.parse(withoutStepUp.body).error).toBe("STEP_UP_REQUIRED");
    expect(calls).toHaveLength(0);

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    expect(stepUp.statusCode).toBe(201);
    const cookie = String(stepUp.headers.get("set-cookie")).split(";", 1)[0];

    const wrongConfirmation = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Suspender membership durante investigação administrativa",
          confirmation: "WRONG",
        },
      }),
      wrongConfirmation,
      new URL("http://localhost" + path),
    );
    expect(wrongConfirmation.statusCode).toBe(400);
    expect(JSON.parse(wrongConfirmation.body).error).toBe(
      "TEXT_CONFIRMATION_REQUIRED",
    );
    expect(calls).toHaveLength(0);

    const accepted = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie },
        body: {
          reason: "Suspender membership durante investigação administrativa",
          confirmation: "SUSPENDER",
        },
      }),
      accepted,
      new URL("http://localhost" + path),
    );
    expect(accepted.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      affiliateId: "aff_admin_0001",
      programId: "prog_admin_0001",
      status: "suspended",
      correlationId: "corr_test",
    });
  });

  it("blocks Affiliate critical actions while Support Mode is active", async () => {
    const calls = [];
    const affiliates = {
      async changeMembershipStatus(input) {
        calls.push(input);
        return { status: "updated", data: input };
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { affiliates },
    });

    const support = responseRecorder();
    await api.handle(
      request("/api/admin/v1/support/session", {
        method: "POST",
        body: {
          effectiveUserId: "business-owner",
          reason:
            "Investigar painel empresarial sem assumir autoridade crítica",
        },
      }),
      support,
      new URL("http://localhost/api/admin/v1/support/session"),
    );
    expect(support.statusCode).toBe(201);
    const supportCookie = String(support.headers.get("set-cookie")).split(
      ";",
      1,
    )[0];

    const stepUp = responseRecorder();
    await api.handle(
      request("/api/admin/v1/step-up", {
        method: "POST",
        body: { password: "fixture-secret" },
      }),
      stepUp,
      new URL("http://localhost/api/admin/v1/step-up"),
    );
    const stepUpCookie = String(stepUp.headers.get("set-cookie")).split(
      ";",
      1,
    )[0];

    const path =
      "/api/admin/v1/affiliates/aff_admin_0001/memberships/prog_admin_0001/suspend";
    const response = responseRecorder();
    await api.handle(
      request(path, {
        method: "POST",
        headers: { cookie: `${supportCookie}; ${stepUpCookie}` },
        body: {
          reason: "This critical action must be denied in Support Mode",
          confirmation: "SUSPENDER",
        },
      }),
      response,
      new URL("http://localhost" + path),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toBe(
      "SUPPORT_MODE_CRITICAL_ACTION_DENIED",
    );
    expect(calls).toHaveLength(0);
  });
});

describe("Control Center generic domain mutation audit", () => {
  it("persists adapter reason and state transition in the append-only audit projection", async () => {
    const contentAdapter = {
      state: "partial",
      coverage: ["detail", "revise-draft-preview"],
      async handle({ response }) {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ data: { id: "content-audit-0001" } }));
        return {
          audit: {
            reason: "Correção editorial aprovada",
            entityType: "content_document",
            entityId: "content-audit-0001",
            previousState: { status: "draft", version: 1 },
            newState: { status: "preview", version: 1 },
          },
        };
      },
    };
    const { api } = fixture(platformOwner, {
      domainAdapters: { content: contentAdapter },
    });
    const mutationResponse = responseRecorder();

    await api.handle(
      request("/api/admin/v1/content/content-audit-0001", {
        method: "PATCH",
        body: { fields: { title: "Atualizado" } },
      }),
      mutationResponse,
      new URL("http://localhost/api/admin/v1/content/content-audit-0001"),
    );

    expect(mutationResponse.statusCode).toBe(200);

    const auditResponse = responseRecorder();
    await api.handle(
      request("/api/admin/v1/audit"),
      auditResponse,
      new URL("http://localhost/api/admin/v1/audit"),
    );
    const complete = JSON.parse(auditResponse.body).entries.find(
      (entry) => entry.action === "control-center.content.mutation.complete",
    );
    expect(complete).toMatchObject({
      result: "success",
      reason: "Correção editorial aprovada",
      entityType: "content_document",
      entityId: "content-audit-0001",
      previousState: { status: "draft", version: 1 },
      newState: { status: "preview", version: 1 },
    });
  });

  it("denies SUPPORT Content mutation before invoking the owner adapter", async () => {
    let called = false;
    const supportSession = {
      ...platformOwner,
      subject: "support-operator",
      email: "support@morro.invalid",
      role: "SUPPORT",
      sessionId: "session-support",
    };
    const { api } = fixture(supportSession, {
      domainAdapters: {
        content: {
          async handle() {
            called = true;
          },
        },
      },
    });
    const response = responseRecorder();

    await api.handle(
      request("/api/admin/v1/content/content-audit-0001", {
        method: "PATCH",
        body: { fields: { title: "Bloqueado" } },
      }),
      response,
      new URL("http://localhost/api/admin/v1/content/content-audit-0001"),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "CAPABILITY_DENIED",
      capability: "content.manage",
    });
    expect(called).toBe(false);
  });
});
