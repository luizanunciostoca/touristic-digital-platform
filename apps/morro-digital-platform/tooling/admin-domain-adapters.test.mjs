import { describe, expect, it, vi } from "vitest";

import {
  createBusinessAdminAdapter,
  createCrmAdminAdapter,
  createFinancialAdminAdapter,
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
    const { authApi, calls } = supportDelegationBoundary();
    const adapter = createBusinessAdminAdapter({ handle }, authApi);

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
