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
  const users = [
    {
      id: platformOwner.subject,
      email: platformOwner.email,
      role: platformOwner.role,
      businessIds: platformOwner.businessIds,
    },
    businessOwner,
  ];

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
      new URL(
        "http://localhost/api/admin/v1/content/content-audit-0001",
      ),
    );

    expect(mutationResponse.statusCode).toBe(200);

    const auditResponse = responseRecorder();
    await api.handle(
      request("/api/admin/v1/audit"),
      auditResponse,
      new URL("http://localhost/api/admin/v1/audit"),
    );
    const complete = JSON.parse(auditResponse.body).entries.find(
      (entry) =>
        entry.action === "control-center.content.mutation.complete",
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
      new URL(
        "http://localhost/api/admin/v1/content/content-audit-0001",
      ),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "CAPABILITY_DENIED",
      capability: "content.manage",
    });
    expect(called).toBe(false);
  });
});
