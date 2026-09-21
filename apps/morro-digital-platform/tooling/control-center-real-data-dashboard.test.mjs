import { describe, expect, it, vi } from "vitest";

import { createAdminApi } from "./admin-api.mjs";

const platformOwner = Object.freeze({
  subject: "platform-owner",
  email: "owner@morro.invalid",
  role: "PLATFORM_OWNER",
  businessIds: Object.freeze([]),
  issuedAt: 1,
  expiresAt: 9_999_999_999,
  sessionId: "session-owner",
});

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

function request(url) {
  return {
    url,
    method: "GET",
    headers: {},
    morroCorrelationId: "corr_real_data",
    async *[Symbol.asyncIterator]() {},
  };
}

function authApi(session = platformOwner) {
  const users = [
    {
      id: platformOwner.subject,
      email: platformOwner.email,
      role: platformOwner.role,
      businessIds: [],
    },
  ];
  return {
    async resolveSession() {
      return session;
    },
    authorizeMutation() {
      return { allowed: true };
    },
    async reauthenticate() {
      return true;
    },
    listConfiguredUsers() {
      return users;
    },
    findConfiguredUser(id) {
      return users.find((user) => user.id === id) ?? null;
    },
    async listAdminUsers() {
      return users;
    },
    async findAdminUser(id) {
      return users.find((user) => user.id === id) ?? null;
    },
    async updateUserStatus() {
      return null;
    },
    async updateUserRole() {
      return null;
    },
    async listUserSessions() {
      return [];
    },
    async revokeUserSession() {
      return { found: false, alreadyRevoked: false };
    },
  };
}

function platformOperations(checks = []) {
  return {
    destinationId: "morro-de-sao-paulo",
    release: {
      sha: "test-sha",
      version: "test-version",
      deploymentId: "test-deployment",
    },
    healthSnapshot() {
      return { readiness: "ready", checks };
    },
    emit() {},
  };
}

function destination(id, name) {
  return Object.freeze({
    id,
    status: "active",
    branding: { name, shortName: name },
  });
}

function financialDestination(
  destinationId,
  {
    revenueStatus = "READY",
    minorUnits = "0",
    paymentCount = 0,
    attentionStatus = "READY",
    attentionCount = 0,
  } = {},
) {
  return Object.freeze({
    destinationId,
    status:
      revenueStatus === "PARTIAL" || attentionStatus === "PARTIAL"
        ? "PARTIAL"
        : "READY",
    revenue: Object.freeze({
      status: revenueStatus,
      currencies: Object.freeze([
        { currency: "BRL", minorUnits, paymentCount },
      ]),
      scannedPayments: paymentCount,
      complete: revenueStatus === "READY",
    }),
    financialAttention: Object.freeze({
      status: attentionStatus,
      count: attentionStatus === "READY" ? attentionCount : null,
      knownCount: attentionCount,
      items: Object.freeze(
        attentionCount
          ? [
              {
                id: `finding-${destinationId}`,
                destinationId,
                paymentId: `payment-${destinationId}`,
                kind: "amount_mismatch",
                severity: "critical",
                state: "open",
              },
            ]
          : [],
      ),
      itemsTruncated: false,
      complete: attentionStatus === "READY",
    }),
  });
}

async function getDashboard({ url = "/api/admin/v1/dashboard", domains = {}, checks = [], session } = {}) {
  const api = createAdminApi({
    authApi: authApi(session),
    platformOperations: platformOperations(checks),
    getEnvironmentValue: () => "",
    domainAdapters: domains,
  });
  const response = responseRecorder();
  await api.handle(request(url), response, new URL("http://localhost" + url));
  return {
    response,
    payload: response.body ? JSON.parse(response.body) : null,
  };
}

describe("Control Center real-data dashboard contract", () => {
  it("projects owner-backed destination revenue and partial attention without turning gaps into zero", async () => {
    const aggregate = vi.fn(async ({ destinationIds }) => ({
      status: "found",
      data: {
        destinations: destinationIds.map((id) =>
          id === "morro-de-sao-paulo"
            ? financialDestination(id, {
                minorUnits: "12500",
                paymentCount: 5,
                attentionCount: 1,
              })
            : financialDestination(id),
        ),
      },
    }));
    const domains = {
      destinations: {
        state: "ready",
        coverage: ["list"],
        async listOwnerDestinations() {
          return {
            status: "found",
            data: [
              destination("morro-de-sao-paulo", "Morro de São Paulo"),
              destination("itacare", "Itacaré"),
            ],
          };
        },
      },
      financial: {
        state: "available",
        coverage: ["destination-revenue", "destination-attention"],
        aggregateDestinations: aggregate,
      },
    };

    const { response, payload } = await getDashboard({
      domains,
      checks: [
        {
          name: "payments-runtime",
          status: "fail",
          critical: true,
          detail: "owner unavailable",
        },
      ],
    });

    expect(response.statusCode).toBe(200);
    expect(aggregate).toHaveBeenCalledWith({
      destinationIds: ["morro-de-sao-paulo", "itacare"],
    });
    expect(payload.summary).toMatchObject({
      alerts: null,
      alertsKnownCount: 2,
      alertsStatus: "PARTIAL",
    });
    expect(payload.attention.status).toBe("PARTIAL");
    expect(payload.attention.sources.businessApprovals.status).toBe(
      "NOT_SUPPORTED",
    );
    expect(payload.attention.sources.supportRequests.status).toBe(
      "NOT_SUPPORTED",
    );
    expect(payload.attention.sources.refundReview.status).toBe("NOT_SUPPORTED");

    const byId = new Map(
      payload.destinationSummary.items.map((item) => [
        item.destinationId,
        item,
      ]),
    );
    expect(byId.get("morro-de-sao-paulo").revenue).toMatchObject({
      status: "READY",
      currencies: [
        { currency: "BRL", minorUnits: "12500", paymentCount: 5 },
      ],
    });
    expect(byId.get("morro-de-sao-paulo").alerts).toMatchObject({
      status: "PARTIAL",
      count: null,
      knownCount: 2,
    });
    expect(byId.get("itacare").alerts.sources.incidents.status).toBe(
      "NOT_SUPPORTED",
    );
    expect(
      byId
        .get("itacare")
        .alerts.items.some(
          (item) => item.destinationId === "morro-de-sao-paulo",
        ),
    ).toBe(false);
  });

  it("uses only canonical destination IDs and never infers ownership from labels", async () => {
    const aggregate = vi.fn(async ({ destinationIds }) => ({
      status: "found",
      data: {
        destinations: destinationIds.map((id) => financialDestination(id)),
      },
    }));
    const domains = {
      destinations: {
        async listOwnerDestinations() {
          return {
            status: "found",
            data: [
              destination("morro-de-sao-paulo", "Morro de São Paulo"),
              destination("itacare", "Itacaré"),
            ],
          };
        },
      },
      financial: { aggregateDestinations: aggregate },
    };

    const labelAttempt = await getDashboard({
      domains,
      url: "/api/admin/v1/dashboard?destinationId=Morro%20de%20S%C3%A3o%20Paulo",
    });
    expect(labelAttempt.response.statusCode).toBe(404);
    expect(labelAttempt.payload).toEqual({ error: "DESTINATION_NOT_FOUND" });
    expect(aggregate).not.toHaveBeenCalled();

    const scoped = await getDashboard({
      domains,
      url: "/api/admin/v1/dashboard?destinationId=itacare",
      checks: [{ name: "morro-only", status: "fail", critical: true }],
    });
    expect(scoped.response.statusCode).toBe(200);
    expect(aggregate).toHaveBeenLastCalledWith({ destinationIds: ["itacare"] });
    expect(scoped.payload.destinationSummary.items).toHaveLength(1);
    expect(scoped.payload.destinationSummary.items[0].destinationId).toBe(
      "itacare",
    );
    expect(
      scoped.payload.destinationSummary.items[0].alerts.sources.incidents.status,
    ).toBe("NOT_SUPPORTED");
    expect(scoped.payload.destinationSummary.items[0].alerts.knownCount).toBe(0);
  });

  it("preserves UNAVAILABLE instead of manufacturing a zero when destination authority is down", async () => {
    const { response, payload } = await getDashboard();

    expect(response.statusCode).toBe(200);
    expect(payload.summary).toMatchObject({
      alerts: null,
      alertsKnownCount: null,
      alertsStatus: "UNAVAILABLE",
    });
    expect(payload.attention.status).toBe("UNAVAILABLE");
    expect(payload.attention.count).toBeNull();
    expect(payload.destinationSummary).toEqual({
      status: "UNAVAILABLE",
      items: null,
      reason: "DESTINATION_OWNER_UNAVAILABLE",
    });
  });

  it("keeps platform dashboard authorization server-side", async () => {
    const denied = {
      ...platformOwner,
      role: "BUSINESS_OWNER",
      businessIds: ["tenant-a"],
    };
    const { response, payload } = await getDashboard({ session: denied });

    expect(response.statusCode).toBe(403);
    expect(payload).toMatchObject({
      error: "ADMIN_SURFACE_DENIED",
      capability: "platform.read",
    });
  });
});
