import { describe, expect, it, vi } from "vitest";

import {
  createAffiliateAdminAdapter,
  createBusinessAdminAdapter,
  createContentAdminAdapter,
  createCrmAdminAdapter,
  createFinancialAdminAdapter,
  createDestinationAdminAdapter,
  createProductsAdminAdapter,
  createReservationsAdminAdapter,
  createTicketingAdminAdapter,
} from "./admin-domain-adapters.mjs";

function responseCapture() {
  const headers = new Map();
  return {
    statusCode: 0,
    payload: "",
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = "") {
      this.payload = String(value);
    },
    header(name) {
      return headers.get(String(name).toLowerCase());
    },
  };
}

function request(method = "GET") {
  return {
    method,
    headers: Object.freeze({
      cookie: "md_session=fixture",
      "x-csrf-token": "csrf-fixture",
    }),
    socket: Object.freeze({ remoteAddress: "203.0.113.20" }),
    morroCorrelationId: "corr_financial_admin_test",
  };
}

async function readBody(source) {
  const chunks = [];
  for await (const chunk of source) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function fixture() {
  const handle = vi.fn(async (req, response, url) => {
    const body = req.method === "POST" ? await readBody(req) : null;
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true }));
    return { req, url, body };
  });

  const paymentsApi = {
    handle,
    adminFindOrder: vi.fn(async (id) => ({
      status: id === "ord_admin_0001" ? "found" : "not_found",
      data: id === "ord_admin_0001" ? { id, status: "pending_payment" } : null,
    })),
    adminFindPayment: vi.fn(async (id) => ({
      status: id === "pay_admin_0001" ? "found" : "not_found",
      data: id === "pay_admin_0001" ? { id, status: "confirmed" } : null,
    })),
    adminResolvePaymentTenant: vi.fn(async (id) => ({
      status: id === "pay_admin_0001" ? "found" : "not_found",
      tenantId: id === "pay_admin_0001" ? "business-admin-0001" : null,
    })),
    adminResolveFindingTenant: vi.fn(async (id) => ({
      status: id === "rcf_admin_00000001" ? "found" : "not_found",
      tenantId: id === "rcf_admin_00000001" ? "business-admin-0001" : null,
      paymentId: id === "rcf_admin_00000001" ? "pay_admin_0001" : null,
    })),
    adminFindLedger: vi.fn(async (key) => ({
      status: key === "payment_approved_pay_admin_0001" ? "found" : "not_found",
      data:
        key === "payment_approved_pay_admin_0001"
          ? { id: "ltx_admin_0001", externalKey: key }
          : null,
    })),
  };

  return {
    adapter: createFinancialAdminAdapter(paymentsApi),
    paymentsApi,
    handle,
  };
}

function supportResponseRecorder() {
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

function supportDelegationBoundary() {
  const calls = [];
  return {
    calls,
    authApi: {
      async withDelegatedSession(request, effectiveUserId, operation) {
        calls.push({ request, effectiveUserId });
        return operation();
      },
    },
  };
}

describe("Control Center domain support delegation", () => {
  it("delegates Business owner-contract execution only when effectiveUser exists", async () => {
    const req = { method: "GET" };
    const response = supportResponseRecorder();
    const handle = vi.fn(async (_request, targetResponse, pathname) => {
      targetResponse.statusCode = 200;
      targetResponse.end(JSON.stringify({ pathname }));
    });
    const adminReadProfile = vi.fn(async (businessId) => ({
      id: businessId,
      name: "Toca do Morcego",
      destinationId: "morro-de-sao-paulo",
    }));
    const { authApi, calls } = supportDelegationBoundary();
    const adapter = createBusinessAdminAdapter(
      { handle, adminReadProfile },
      authApi,
    );
    await expect(
      adapter.readDirectoryProfile("toca-do-morcego"),
    ).resolves.toMatchObject({
      id: "toca-do-morcego",
      destinationId: "morro-de-sao-paulo",
    });
    expect(adapter.coverage).toContain("destination-owner-projection");

    await adapter.handle({
      request: req,
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/businesses/toca-do-morcego/profile",
      ),
      effectiveUser: { id: "business-owner" },
    });

    expect(calls).toEqual([
      { request: req, effectiveUserId: "business-owner" },
    ]);
    expect(handle).toHaveBeenCalledWith(
      req,
      response,
      "/api/business/toca-do-morcego/profile",
    );

    calls.length = 0;
    handle.mockClear();
    await adapter.handle({
      request: req,
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/businesses/toca-do-morcego/profile",
      ),
      effectiveUser: null,
    });
    expect(calls).toEqual([]);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("delegates CRM and Ticketing through the same Auth boundary", async () => {
    const req = { method: "GET" };
    const response = supportResponseRecorder();
    const { authApi, calls } = supportDelegationBoundary();
    const crmHandle = vi.fn(async () => undefined);
    const ticketingHandle = vi.fn(async () => undefined);
    const crm = createCrmAdminAdapter({ handle: crmHandle }, authApi);
    const ticketing = createTicketingAdminAdapter(
      { handle: ticketingHandle },
      authApi,
    );

    await crm.handle({
      request: req,
      response,
      requestUrl: new URL("http://localhost/api/admin/v1/crm/leads"),
      effectiveUser: { id: "business-owner" },
    });
    await ticketing.handle({
      request: req,
      response,
      requestUrl: new URL("http://localhost/api/admin/v1/ticketing/inventory"),
      effectiveUser: { id: "business-owner" },
    });

    expect(calls.map((entry) => entry.effectiveUserId)).toEqual([
      "business-owner",
      "business-owner",
    ]);
    expect(crmHandle).toHaveBeenCalledTimes(1);
    expect(ticketingHandle).toHaveBeenCalledTimes(1);
  });

  it("searches CRM leads through the owner HTTP boundary and preserves support delegation", async () => {
    const req = request("GET");
    const { authApi, calls } = supportDelegationBoundary();
    const crmHandle = vi.fn(async (_request, response, requestUrl) => {
      expect(requestUrl.pathname).toBe("/api/crm/leads");
      expect(requestUrl.searchParams.get("search")).toBe("toca");
      expect(requestUrl.searchParams.get("limit")).toBe("20");
      expect(requestUrl.searchParams.get("destinationId")).toBe(
        "morro-de-sao-paulo",
      );
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          data: [
            {
              id: 42,
              destinationId: "morro-de-sao-paulo",
              companyName: "Toca do Morcego",
              contactName: "Operação",
              email: "crm@example.com",
              stage: "proposal_sent",
              status: "active",
            },
          ],
        }),
      );
    });
    const adapter = createCrmAdminAdapter({ handle: crmHandle }, authApi);

    await expect(
      adapter.search({
        query: "toca",
        destinationId: "morro-de-sao-paulo",
        request: req,
        effectiveUser: { id: "business-owner" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        type: "crm-lead",
        id: "42",
        title: "Toca do Morcego",
        context: expect.stringContaining("morro-de-sao-paulo"),
        href: "#crm",
      }),
    ]);
    expect(calls).toEqual([
      { request: req, effectiveUserId: "business-owner" },
    ]);
  });

  it("allows the full governed Ticketing operator route set including offline revoke", async () => {
    const req = request("POST");
    const response = supportResponseRecorder();
    const { authApi } = supportDelegationBoundary();
    const handle = vi.fn(async (_request, targetResponse, targetUrl) => {
      targetResponse.statusCode = 200;
      targetResponse.end(JSON.stringify({ targetUrl: String(targetUrl) }));
    });
    const adapter = createTicketingAdminAdapter({ handle }, authApi);

    for (const pathname of [
      "/api/admin/v1/ticketing/operator/check-in",
      "/api/admin/v1/ticketing/operator/offline-devices",
      "/api/admin/v1/ticketing/operator/offline-devices/tdv_device_0001/revoke",
    ]) {
      await adapter.handle({
        request: req,
        response,
        requestUrl: new URL("http://localhost" + pathname),
        effectiveUser: null,
      });
    }

    expect(handle).toHaveBeenCalledTimes(3);
    expect(
      handle.mock.calls.map((call) =>
        String(call[2] instanceof URL ? call[2].pathname : call[2]),
      ),
    ).toEqual([
      "/api/ticketing/v1/operator/check-in",
      "/api/ticketing/v1/operator/offline-devices",
      "/api/ticketing/v1/operator/offline-devices/tdv_device_0001/revoke",
    ]);
  });

  it("fails closed when the internal Auth delegation boundary is absent", () => {
    expect(() =>
      createBusinessAdminAdapter({ handle: async () => undefined }),
    ).toThrow("ADMIN_SUPPORT_DELEGATION_BOUNDARY_REQUIRED");
  });
});

describe("Control Center Financial owner adapter", () => {
  it("projects exact Order, Payment and Ledger reads through Payments owner methods", async () => {
    const { adapter, paymentsApi } = fixture();

    const orderResponse = responseCapture();
    await adapter.handle({
      request: request(),
      response: orderResponse,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/orders/ord_admin_0001",
      ),
    });
    expect(orderResponse.statusCode).toBe(200);
    expect(JSON.parse(orderResponse.payload).data.id).toBe("ord_admin_0001");
    expect(paymentsApi.adminFindOrder).toHaveBeenCalledWith("ord_admin_0001");

    const paymentResponse = responseCapture();
    await adapter.handle({
      request: request(),
      response: paymentResponse,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/payments/pay_admin_0001",
      ),
    });
    expect(paymentResponse.statusCode).toBe(200);
    expect(JSON.parse(paymentResponse.payload).data.id).toBe("pay_admin_0001");

    const ledgerResponse = responseCapture();
    await adapter.handle({
      request: request(),
      response: ledgerResponse,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/financial/ledger/payment_approved_pay_admin_0001",
      ),
    });
    expect(ledgerResponse.statusCode).toBe(200);
    expect(JSON.parse(ledgerResponse.payload).data.id).toBe("ltx_admin_0001");
  });

  it("delegates reconciliation reads to the canonical Payments route", async () => {
    const { adapter, handle } = fixture();
    const response = responseCapture();

    await adapter.handle({
      request: request(),
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/financial/reconciliation/payments/pay_admin_0001/findings",
      ),
    });

    expect(handle).toHaveBeenCalledTimes(1);
    const [, , delegatedUrl] = handle.mock.calls[0];
    expect(delegatedUrl.pathname).toBe(
      "/api/payments/v1/reconciliation/payments/pay_admin_0001/findings",
    );
  });

  it("resolves payment and finding tenant scope only through the Payments owner facade", async () => {
    const { adapter, paymentsApi } = fixture();

    await expect(
      adapter.resolvePaymentTenant("pay_admin_0001"),
    ).resolves.toEqual({
      status: "found",
      tenantId: "business-admin-0001",
    });
    await expect(
      adapter.resolveFindingTenant("rcf_admin_00000001"),
    ).resolves.toEqual({
      status: "found",
      tenantId: "business-admin-0001",
      paymentId: "pay_admin_0001",
    });

    expect(paymentsApi.adminResolvePaymentTenant).toHaveBeenCalledWith(
      "pay_admin_0001",
    );
    expect(paymentsApi.adminResolveFindingTenant).toHaveBeenCalledWith(
      "rcf_admin_00000001",
    );
  });

  it("generates the Financial-owned refund idempotency and immutable provider reason", async () => {
    const { adapter, handle } = fixture();
    const response = responseCapture();

    await adapter.refund({
      request: request("POST"),
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/financial/refunds/pay_admin_0001",
      ),
      paymentId: "pay_admin_0001",
    });

    const [delegated, , delegatedUrl] = handle.mock.calls[0];
    expect(delegatedUrl.pathname).toBe(
      "/api/payments/v1/payments/pay_admin_0001/refunds",
    );
    expect(delegated.headers["idempotency-key"]).toBe(
      "refund:v1:pay_admin_0001",
    );
    expect(delegated.headers["x-business-id"]).toBe("business-admin-0001");
    await expect(readBody(delegated)).resolves.toEqual({
      reason: "requested_by_business",
    });
  });

  it("generates reconciliation run and acknowledgement idempotency keys", async () => {
    const { adapter, handle } = fixture();

    const runResponse = responseCapture();
    await adapter.reconciliationRun({
      request: request("POST"),
      response: runResponse,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/financial/reconciliation/payments/pay_admin_0001/runs",
      ),
      paymentId: "pay_admin_0001",
      runId: "rrn_admin_00000001",
    });

    let [delegated, , delegatedUrl] = handle.mock.calls[0];
    expect(delegatedUrl.pathname).toBe(
      "/api/payments/v1/reconciliation/payments/pay_admin_0001/runs",
    );
    expect(delegated.headers["idempotency-key"]).toBe(
      "reconciliation:v1:rrn_admin_00000001",
    );
    await expect(readBody(delegated)).resolves.toEqual({
      runId: "rrn_admin_00000001",
    });

    const acknowledgementResponse = responseCapture();
    await adapter.reconciliationAcknowledge({
      request: request("POST"),
      response: acknowledgementResponse,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/financial/reconciliation/findings/rcf_admin_00000001/acknowledge",
      ),
      findingId: "rcf_admin_00000001",
    });

    [delegated, , delegatedUrl] = handle.mock.calls[1];
    expect(delegatedUrl.pathname).toBe(
      "/api/payments/v1/reconciliation/findings/rcf_admin_00000001/acknowledgements",
    );
    expect(delegated.headers["idempotency-key"]).toBe(
      "reconciliation-ack:v1:rcf_admin_00000001",
    );
    await expect(readBody(delegated)).resolves.toEqual({});
  });
});

describe("Control Center Affiliates owner adapter", () => {
  function affiliateFixture() {
    const runtime = {
      adminList: vi.fn(async (_actor, input) => ({
        status: "found",
        data: [
          {
            affiliateId: "aff_admin_0001",
            identityReference: "affiliate-admin@example.com",
            status: "active",
            roleCategory: "creator",
            approvedMembershipCount: 1,
            suspendedMembershipCount: 0,
            conversionCount: 2,
            query: input?.query ?? "",
          },
        ],
      })),
      adminRead: vi.fn(async (_actor, id) => ({
        status: id === "aff_admin_0001" ? "found" : "not_found",
        data:
          id === "aff_admin_0001"
            ? {
                affiliate: {
                  affiliateId: id,
                  identityReference: "affiliate-admin@example.com",
                  status: "active",
                },
                memberships: [
                  {
                    programId: "prog_admin_0001",
                    destinationId: "morro-de-sao-paulo",
                    status: "approved",
                  },
                ],
              }
            : null,
      })),
      adminChangeMembershipStatus: vi.fn(async (_actor, input) => ({
        status: "updated",
        data: { membership: input },
      })),
    };
    return {
      runtime,
      adapter: createAffiliateAdminAdapter(runtime),
      actor: {
        subject: "platform-owner",
        role: "PLATFORM_OWNER",
      },
    };
  }

  it("lists and searches affiliates only through the Affiliates owner runtime", async () => {
    const { adapter, runtime, actor } = affiliateFixture();
    const response = responseCapture();
    await adapter.handle({
      request: request(),
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/affiliates?query=creator&limit=10",
      ),
      actor,
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).data[0].affiliateId).toBe(
      "aff_admin_0001",
    );
    expect(runtime.adminList).toHaveBeenCalledWith(actor, {
      query: "creator",
      destinationId: "",
      limit: "10",
    });

    const results = await adapter.search({ query: "affiliate-admin", actor });
    expect(results).toEqual([
      expect.objectContaining({
        type: "affiliate",
        id: "aff_admin_0001",
        href: "#affiliates:aff_admin_0001",
      }),
    ]);
  });

  it("derives membership destination from owner detail before changing status", async () => {
    const { adapter, runtime, actor } = affiliateFixture();
    const result = await adapter.changeMembershipStatus({
      actor,
      affiliateId: "aff_admin_0001",
      programId: "prog_admin_0001",
      status: "suspended",
      correlationId: "corr_affiliate_admin_test",
    });

    expect(result.status).toBe("updated");
    expect(runtime.adminChangeMembershipStatus).toHaveBeenCalledWith(actor, {
      affiliateId: "aff_admin_0001",
      programId: "prog_admin_0001",
      destinationId: "morro-de-sao-paulo",
      status: "suspended",
      correlationId: "corr_affiliate_admin_test",
    });
  });

  it("does not call a mutation when the requested membership is not owner-backed", async () => {
    const { adapter, runtime, actor } = affiliateFixture();
    const result = await adapter.changeMembershipStatus({
      actor,
      affiliateId: "aff_admin_0001",
      programId: "prog_unknown_0001",
      status: "suspended",
      correlationId: "corr_affiliate_admin_test",
    });

    expect(result.status).toBe("not_found");
    expect(runtime.adminChangeMembershipStatus).not.toHaveBeenCalled();
  });
});

describe("Control Center Content owner adapter", () => {
  function bodyRequest(method, body) {
    const chunks = [Buffer.from(JSON.stringify(body), "utf8")];
    return {
      method,
      headers: {},
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
      },
    };
  }

  function contentRuntimeFixture() {
    const document = Object.freeze({
      id: "content-admin-0001",
      destinationId: "morro-de-sao-paulo",
      kind: "place",
      locale: "pt-BR",
      status: "draft",
      version: 1,
      fields: Object.freeze({ title: "Segunda Praia" }),
      createdAt: "2026-09-20T20:00:00.000Z",
      updatedAt: "2026-09-20T20:00:00.000Z",
    });
    return {
      document,
      runtime: {
        adminList: vi.fn(async () => ({ status: "found", data: [document] })),
        adminRead: vi.fn(async () => ({ status: "found", data: document })),
        adminCreate: vi.fn(async () => ({ status: "created", data: document })),
        adminRevise: vi.fn(async () => ({
          status: "updated",
          data: { ...document, version: 2 },
        })),
        adminTransition: vi.fn(async () => ({
          status: "updated",
          data: { ...document, status: "preview" },
        })),
      },
    };
  }

  it("searches through the Content owner contract", async () => {
    const { runtime } = contentRuntimeFixture();
    const adapter = createContentAdminAdapter(runtime);
    const results = await adapter.search({
      query: "Segunda",
      destinationId: "morro-de-sao-paulo",
    });

    expect(runtime.adminList).toHaveBeenCalledWith({
      query: "Segunda",
      destinationId: "morro-de-sao-paulo",
      limit: 20,
    });
    expect(results).toEqual([
      expect.objectContaining({
        type: "content",
        id: "content-admin-0001",
        title: "Segunda Praia",
        href: "#content:content-admin-0001",
      }),
    ]);
  });

  it("surfaces Content owner failures instead of reporting an empty search", async () => {
    const { runtime } = contentRuntimeFixture();
    runtime.adminList.mockResolvedValueOnce({
      status: "unavailable",
      data: null,
      error: "CONTENT_DB_DOWN",
    });
    const adapter = createContentAdminAdapter(runtime);

    await expect(
      adapter.search({
        query: "Segunda",
        destinationId: "morro-de-sao-paulo",
      }),
    ).rejects.toThrow("CONTENT_DB_DOWN");
  });

  it("requires an administrative reason before owner mutation", async () => {
    const { runtime } = contentRuntimeFixture();
    const adapter = createContentAdminAdapter(runtime);
    const response = responseCapture();

    await adapter.handle({
      request: bodyRequest("POST", {
        id: "content-admin-0001",
        destinationId: "morro-de-sao-paulo",
        kind: "place",
        locale: "pt-BR",
        fields: { title: "Segunda Praia" },
        reason: "curto",
      }),
      response,
      requestUrl: new URL("http://localhost/api/admin/v1/content"),
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload)).toEqual({ error: "REASON_REQUIRED" });
    expect(runtime.adminCreate).not.toHaveBeenCalled();
  });

  it("returns immutable-audit context for successful Content mutations", async () => {
    const { runtime, document } = contentRuntimeFixture();
    const adapter = createContentAdminAdapter(runtime);
    const response = responseCapture();

    const outcome = await adapter.handle({
      request: bodyRequest("PATCH", {
        fields: { title: "Segunda Praia revisada" },
        reason: "Correção editorial solicitada",
      }),
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/content/content-admin-0001",
      ),
    });

    expect(response.statusCode).toBe(200);
    expect(runtime.adminRead).toHaveBeenCalledWith("content-admin-0001");
    expect(runtime.adminRevise).toHaveBeenCalledWith("content-admin-0001", {
      title: "Segunda Praia revisada",
    });
    expect(outcome.audit).toMatchObject({
      reason: "Correção editorial solicitada",
      entityType: "content_document",
      entityId: "content-admin-0001",
      previousState: document,
    });
    expect(outcome.audit.newState.version).toBe(2);
  });
});

describe("Control Center Destination owner adapter", () => {
  function destinationService() {
    let current = {
      id: "morro-de-sao-paulo",
      status: "active",
      locale: "pt-BR",
      timezone: "America/Bahia",
      currency: "BRL",
      branding: {
        name: "Morro de São Paulo",
        shortName: "Morro",
        tagline: "Descubra Morro",
      },
      center: { lat: -13.3833, lng: -38.9167, zoom: 13 },
      modules: ["map"],
      featureFlags: { map: true },
      version: 1,
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    };
    return {
      list: vi.fn(async () => [current]),
      read: vi.fn(async (id) =>
        id === current.id
          ? { status: "found", data: current }
          : { status: "not_found" },
      ),
      create: vi.fn(async (value) => ({ status: "created", data: value })),
      replace: vi.fn(async (_id, value) => {
        current = { ...current, ...value, version: current.version + 1 };
        return { status: "updated", data: current };
      }),
      setStatus: vi.fn(async (_id, status) => {
        current = { ...current, status, version: current.version + 1 };
        return { status: "updated", data: current };
      }),
    };
  }

  it("lists through the Destination owner service", async () => {
    const service = destinationService();
    const adapter = createDestinationAdminAdapter({ service });
    const response = responseCapture();
    await adapter.handle({
      request: request(),
      response,
      requestUrl: new URL("http://localhost/api/admin/v1/destinations"),
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).destinations[0].id).toBe(
      "morro-de-sao-paulo",
    );
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it("requires an administrative reason before mutation", async () => {
    const service = destinationService();
    const adapter = createDestinationAdminAdapter({ service });
    const response = responseCapture();
    const req = Object.assign(request("PATCH"), {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(
          JSON.stringify({ status: "suspended", reason: "curto" }),
        );
      },
    });
    await adapter.handle({
      request: req,
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/destinations/morro-de-sao-paulo",
      ),
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toBe("REASON_REQUIRED");
    expect(service.setStatus).not.toHaveBeenCalled();
  });

  it("returns previous/new state audit metadata after governed status change", async () => {
    const service = destinationService();
    const adapter = createDestinationAdminAdapter({ service });
    const response = responseCapture();
    const req = Object.assign(request("PATCH"), {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(
          JSON.stringify({
            status: "suspended",
            reason: "Manutenção programada",
          }),
        );
      },
    });
    const audit = await adapter.handle({
      request: req,
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/destinations/morro-de-sao-paulo",
      ),
    });
    expect(response.statusCode).toBe(200);
    expect(audit).toMatchObject({
      reason: "Manutenção programada",
      entityType: "destination",
      entityId: "morro-de-sao-paulo",
      previousState: { status: "active", version: 1 },
      newState: { status: "suspended", version: 2 },
    });
  });

  it("fails closed when the owner runtime is unavailable", async () => {
    const adapter = createDestinationAdminAdapter(null);
    const response = responseCapture();
    await adapter.handle({ response });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload).error).toBe(
      "DESTINATION_ADMIN_OWNER_UNAVAILABLE",
    );
  });
});

describe("Control Center Products and Reservations owner adapters", () => {
  it("projects Ticketing inventory through the Products admin contract", async () => {
    const ticketingApi = {
      adminListInventory: vi.fn(async () => ({
        status: "found",
        data: [
          {
            offer: {
              id: "tin_admin_0001",
              label: "Volta a Ilha",
              destinationId: "morro-de-sao-paulo",
              product: { kind: "tour", reference: "volta-a-ilha" },
            },
            businessId: "business-0001",
            availableQuantity: 8,
          },
        ],
      })),
      adminReadInventory: vi.fn(async () => ({
        status: "found",
        data: {
          projection: {
            offer: { id: "tin_admin_0001", label: "Volta a Ilha" },
            businessId: "business-0001",
          },
          availability: { remainingQuantity: 8 },
        },
      })),
      adminCreateBusinessOffer: vi.fn(async ({ businessId, offer }) => ({
        status: "created",
        data: {
          id: "mpi_admin_created_0000000000000000",
          businessId,
          ...offer,
          enabled: true,
        },
      })),
      adminDisableBusinessOffer: vi.fn(async ({ businessId, inventoryId }) => ({
        status: "updated",
        data: {
          id: inventoryId,
          businessId,
          enabled: false,
        },
      })),
    };
    const adapter = createProductsAdminAdapter(ticketingApi);
    const response = responseCapture();

    await adapter.handle({
      request: request(),
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/products?q=volta&businessId=business-0001",
      ),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).data[0]).toMatchObject({
      businessId: "business-0001",
      availableQuantity: 8,
    });
    expect(ticketingApi.adminListInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "volta",
        businessId: "business-0001",
      }),
    );

    const search = await adapter.search({
      query: "volta",
      destinationId: "morro-de-sao-paulo",
    });
    expect(search).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "product",
          id: "volta-a-ilha",
          href: "#products:tin_admin_0001",
          destinationId: "morro-de-sao-paulo",
        }),
        expect.objectContaining({
          type: "offer",
          id: "tin_admin_0001",
          href: "#products:tin_admin_0001",
          destinationId: "morro-de-sao-paulo",
        }),
      ]),
    );
    expect(ticketingApi.adminListInventory).toHaveBeenLastCalledWith({
      query: "volta",
      destinationId: "morro-de-sao-paulo",
      limit: 20,
    });

    ticketingApi.adminListInventory.mockResolvedValueOnce({
      status: "unavailable",
      data: null,
      error: "TICKETING_SEARCH_DOWN",
    });
    await expect(
      adapter.search({
        query: "volta",
        destinationId: "morro-de-sao-paulo",
      }),
    ).rejects.toThrow("TICKETING_SEARCH_DOWN");

    await expect(
      adapter.createBusinessOffer({
        request: request(),
        businessId: "business-0001",
        requestKey: "offer_admin_0001",
        offer: {
          productKind: "tour",
          productReference: "volta-a-ilha",
        },
      }),
    ).resolves.toMatchObject({
      status: "created",
      data: {
        businessId: "business-0001",
        enabled: true,
      },
    });

    await expect(
      adapter.disableBusinessOffer({
        request: request(),
        businessId: "business-0001",
        inventoryId: "tin_admin_0001",
      }),
    ).resolves.toMatchObject({
      status: "updated",
      data: {
        id: "tin_admin_0001",
        businessId: "business-0001",
        enabled: false,
      },
    });
  });

  it("projects global reservations and owner history without direct table access", async () => {
    const ticketingApi = {
      adminListReservations: vi.fn(async () => ({
        status: "found",
        data: [
          {
            reservation: {
              id: "trv_admin_0001",
              status: "confirmed",
              holderReference: "holder-0001",
              destinationId: "morro-de-sao-paulo",
            },
            businessId: "business-0001",
            inventoryLabel: "Volta a Ilha",
          },
        ],
      })),
      adminReadReservation: vi.fn(async () => ({
        status: "found",
        data: {
          reservation: {
            id: "trv_admin_0001",
            status: "confirmed",
            holderReference: "holder-0001",
          },
          businessId: "business-0001",
          inventoryLabel: "Volta a Ilha",
          events: [{ eventType: "confirmed" }],
        },
      })),
      adminCancelHeldReservation: vi.fn(async (input) => ({
        status: "updated",
        data: {
          previousState: { id: input.reservationId, status: "held" },
          newState: { id: input.reservationId, status: "cancelled" },
          replayed: false,
        },
      })),
    };
    const adapter = createReservationsAdminAdapter(ticketingApi);
    const response = responseCapture();

    await adapter.handle({
      request: request(),
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/reservations?status=confirmed&q=holder-0001",
      ),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).data[0]).toMatchObject({
      businessId: "business-0001",
      inventoryLabel: "Volta a Ilha",
    });
    expect(ticketingApi.adminListReservations).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "holder-0001",
        status: "confirmed",
      }),
    );

    const search = await adapter.search({
      query: "holder-0001",
      destinationId: "morro-de-sao-paulo",
    });
    expect(search).toEqual([
      expect.objectContaining({
        type: "reservation",
        id: "trv_admin_0001",
        href: "#reservations:trv_admin_0001",
        destinationId: "morro-de-sao-paulo",
      }),
    ]);
    expect(ticketingApi.adminListReservations).toHaveBeenLastCalledWith({
      query: "holder-0001",
      destinationId: "morro-de-sao-paulo",
      limit: 20,
    });

    ticketingApi.adminListReservations.mockResolvedValueOnce({
      status: "unavailable",
      data: null,
      error: "RESERVATION_SEARCH_DOWN",
    });
    await expect(
      adapter.search({
        query: "holder-0001",
        destinationId: "morro-de-sao-paulo",
      }),
    ).rejects.toThrow("RESERVATION_SEARCH_DOWN");

    await expect(
      adapter.cancelHeldReservation({
        reservationId: "trv_admin_0002",
        actorReference: "platform-owner",
      }),
    ).resolves.toMatchObject({
      status: "updated",
      data: {
        previousState: { status: "held" },
        newState: { status: "cancelled" },
      },
    });
    expect(ticketingApi.adminCancelHeldReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "trv_admin_0002",
        actorReference: "platform-owner",
      }),
    );
  });
});
