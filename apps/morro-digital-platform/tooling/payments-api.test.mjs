import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  createCheckoutHandoffCapability,
  createTicketingCheckoutHandoffCapability,
} from "@touristic/ordering-server";

import {
  createPaymentsApi,
  createPaymentsCheckoutAuthorizationPort,
  createPaymentsReconciliationAuthorizationPort,
  createPaymentsRefundAuthorizationPort,
} from "./payments-api.mjs";

function request({ method = "GET", headers = {}, body } = {}) {
  const stream = Readable.from(body === undefined ? [] : [body]);
  stream.method = method;
  stream.headers = headers;
  stream.socket = { remoteAddress: "203.0.113.20" };
  return stream;
}

function responseCapture() {
  const headers = new Map();
  return {
    statusCode: 0,
    payload: "",
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    end(value = "") {
      this.payload = String(value);
    },
    header(name) {
      return headers.get(name.toLowerCase());
    },
  };
}

function ticketingCheckoutHandoff() {
  return {
    reservationReference: "trv_runtime_guest_0001",
    customer: {
      name: "Runtime Guest",
      email: "runtime@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    returnUrl: "https://morro.digital/tickets.html",
    requiresPaymentsCapability: true,
  };
}

function checkoutHandoff() {
  return {
    sessionId: "runtime_guest_session",
    planId: "growth",
    contractor: {
      name: "Runtime Guest",
      email: "runtime@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    businessDraft: {
      demoBusinessId: "runtime-demo",
      displayName: "Runtime Business",
      categoryId: "restaurant",
      specialty: "Local",
      environment: "sandbox",
      publishable: false,
    },
    acceptedTerms: [
      {
        type: "terms",
        version: "terms_v1",
        acceptedAt: "2026-08-14T22:55:00Z",
      },
      {
        type: "privacy",
        version: "privacy_v1",
        acceptedAt: "2026-08-14T22:55:00Z",
      },
    ],
    returnUrl: "https://morro.digital/checkout/return",
    tutorial: false,
    requiresPaymentsCapability: true,
  };
}

describe("M139/M141 payments API runtime boundary", () => {
  it("stays fail-closed when operational configuration is absent", async () => {
    const api = createPaymentsApi({
      authApi: {},
      getEnvironmentValue: () => "",
      audit: () => undefined,
    });
    await expect(api.start()).resolves.toBe(false);
    const response = responseCapture();

    await api.handle(
      request(),
      response,
      new URL("http://localhost/api/payments/v1/checkouts/ord_missing_123"),
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload)).toEqual({
      error: "CHECKOUT_UNAVAILABLE",
    });
    expect(response.header("cache-control")).toBe("no-store");
    expect(response.header("x-correlation-id")).toMatch(/^corr_/u);
  });

  it("exposes bounded owner-backed admin reads without transport or SQL access", async () => {
    const api = createPaymentsApi({
      adminRead: {
        orders: {
          findById(id) {
            return Promise.resolve(
              id === "ord_admin_0001"
                ? {
                    id,
                    status: "pending_payment",
                    pricing: {
                      amount: { minorUnits: 5000, currency: "BRL" },
                    },
                  }
                : null,
            );
          },
        },
        payments: {
          findById(id) {
            return Promise.resolve(
              id === "pay_admin_0001"
                ? {
                    id,
                    status: "confirmed",
                    amount: { minorUnits: 5000, currency: "BRL" },
                  }
                : null,
            );
          },
        },
        checkoutAccess: {
          findByOrderId(orderId) {
            return Promise.resolve(
              orderId === "ord_admin_0001"
                ? {
                    orderId,
                    paymentId: "pay_admin_0001",
                    tenantId: "business-admin-0001",
                  }
                : null,
            );
          },
        },
        ledger: {
          findByExternalKey(key) {
            if (key === "bad key") {
              throw new Error("FINANCIAL_INVALID_LEDGER_EXTERNAL_KEY");
            }
            return Promise.resolve(
              key === "payment_approved_pay_admin_0001"
                ? {
                    id: "ltx_admin_0001",
                    externalKey: key,
                    occurredAt: "2026-09-20T12:00:00.000Z",
                    postings: [],
                  }
                : null,
            );
          },
        },
      },
      audit: () => undefined,
    });

    await expect(api.adminFindOrder("ord_admin_0001")).resolves.toMatchObject({
      status: "found",
      data: { id: "ord_admin_0001" },
    });
    await expect(api.adminFindOrder("ord_admin_missing")).resolves.toEqual({
      status: "not_found",
      data: null,
    });
    await expect(api.adminFindOrder("!")).resolves.toEqual({
      status: "invalid",
      data: null,
    });

    await expect(api.adminFindPayment("pay_admin_0001")).resolves.toMatchObject({
      status: "found",
      data: { id: "pay_admin_0001" },
    });
    await expect(api.adminFindPayment("pay_admin_missing")).resolves.toEqual({
      status: "not_found",
      data: null,
    });
    await expect(
      api.adminResolvePaymentTenant("pay_admin_0001"),
    ).resolves.toEqual({
      status: "found",
      tenantId: "business-admin-0001",
    });
    await expect(
      api.adminResolvePaymentTenant("pay_admin_missing"),
    ).resolves.toEqual({
      status: "not_found",
      tenantId: null,
    });

    await expect(
      api.adminFindLedger("payment_approved_pay_admin_0001"),
    ).resolves.toMatchObject({
      status: "found",
      data: { id: "ltx_admin_0001" },
    });
    await expect(api.adminFindLedger("bad key")).resolves.toEqual({
      status: "invalid",
      data: null,
    });
  });

  it("parses bounded JSON and propagates a server correlation ID", async () => {
    let captured;
    const api = createPaymentsApi({
      transport: {
        handle(input) {
          captured = input;
          return Promise.resolve({
            status: 201,
            body: { data: { checkoutId: "ord_runtime_123" } },
            headers: { "Cache-Control": "no-store" },
          });
        },
      },
      audit: () => undefined,
    });
    const response = responseCapture();
    const body = JSON.stringify({ sessionId: "runtime_session" });

    await api.handle(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": String(Buffer.byteLength(body)),
        },
        body,
      }),
      response,
      new URL("http://localhost/api/payments/v1/checkouts"),
    );

    expect(response.statusCode).toBe(201);
    expect(captured).toMatchObject({
      method: "POST",
      pathname: "/api/payments/v1/checkouts",
      body: { sessionId: "runtime_session" },
      clientIp: "203.0.113.20",
    });
    expect(captured.correlationId).toMatch(/^corr_/u);
    expect(response.header("x-correlation-id")).toBe(captured.correlationId);
  });

  it("preserves exact raw webhook bytes and signature headers", async () => {
    let captured;
    const api = createPaymentsApi({
      transport: { handle: () => Promise.reject(new Error("UNEXPECTED")) },
      webhookTransport: {
        handle(input) {
          captured = input;
          return Promise.resolve({
            status: 202,
            body: {
              data: { accepted: true, matched: false, replayed: false },
            },
            headers: { "Cache-Control": "no-store" },
          });
        },
      },
      audit: () => undefined,
    });
    const response = responseCapture();
    const body = '{ "version": 1, "eventId": "pwe_runtime_00000001" }';

    expect(api.matches("/api/payments/v1/webhooks/sandbox")).toBe(true);
    await api.handle(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          "x-sandbox-signature": "t=1786748400,v1=" + "a".repeat(64),
        },
        body,
      }),
      response,
      new URL("http://localhost/api/payments/v1/webhooks/sandbox"),
    );

    expect(response.statusCode).toBe(202);
    expect(Buffer.from(captured.rawBody).toString("utf8")).toBe(body);
    expect(captured).toMatchObject({
      method: "POST",
      pathname: "/api/payments/v1/webhooks/sandbox",
      headers: {
        "x-sandbox-signature": "t=1786748400,v1=" + "a".repeat(64),
      },
    });
    expect(captured).not.toHaveProperty("body");
  });

  it("rejects unsupported content types before the transport", async () => {
    let calls = 0;
    const api = createPaymentsApi({
      transport: {
        handle() {
          calls += 1;
          return Promise.reject(new Error("UNEXPECTED_CALL"));
        },
      },
      audit: () => undefined,
    });
    const response = responseCapture();

    await api.handle(
      request({
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
      response,
      new URL("http://localhost/api/payments/v1/checkouts"),
    );

    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.payload)).toEqual({
      error: "UNSUPPORTED_MEDIA_TYPE",
    });
    expect(calls).toBe(0);
  });

  it("binds authenticated mutations to CSRF, role and business scope", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const active = Object.freeze({
      subject: "user-runtime",
      email: "owner@example.com",
      role: "owner",
      businessIds: Object.freeze(["business-1"]),
      issuedAt: now - 60,
      expiresAt: now + 3_600,
      sessionId: "session-runtime",
    });
    const port = createPaymentsCheckoutAuthorizationPort({
      authApi: {
        resolveSession: () => active,
        authorizeMutation: () => ({ allowed: true }),
      },
      destinationId: "morro",
      handoffSecret: "runtime-handoff-secret-with-thirty-two-characters",
      origins: new Set(["https://morro.digital"]),
      production: true,
    });

    await expect(
      port.authorizeCreate(
        {
          headers: {
            "x-business-id": "business-1",
            origin: "https://morro.digital",
          },
        },
        checkoutHandoff(),
      ),
    ).resolves.toEqual({
      allowed: true,
      context: {
        requesterKind: "authenticated",
        actorSubject: "user-runtime",
        destinationId: "morro",
        tenantId: "business-1",
      },
    });

    const viewerPort = createPaymentsCheckoutAuthorizationPort({
      authApi: {
        resolveSession: () => ({ ...active, role: "viewer" }),
        authorizeMutation: () => ({ allowed: true }),
      },
      destinationId: "morro",
      handoffSecret: "runtime-handoff-secret-with-thirty-two-characters",
      origins: new Set(["https://morro.digital"]),
      production: true,
    });
    await expect(
      viewerPort.authorizeCreate(
        { headers: { "x-business-id": "business-1" } },
        checkoutHandoff(),
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "read_only_role",
    });

    const csrfPort = createPaymentsCheckoutAuthorizationPort({
      authApi: {
        resolveSession: () => active,
        authorizeMutation: () => ({
          allowed: false,
          reason: "invalid_csrf",
        }),
      },
      destinationId: "morro",
      handoffSecret: "runtime-handoff-secret-with-thirty-two-characters",
      origins: new Set(["https://morro.digital"]),
      production: true,
    });
    await expect(
      csrfPort.authorizeCreate(
        { headers: { "x-business-id": "business-1" } },
        checkoutHandoff(),
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "invalid_csrf",
    });
  });

  it("accepts only an exact signed guest handoff from an allowed origin", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const secret = "runtime-handoff-secret-with-thirty-two-characters";
    const token = createCheckoutHandoffCapability(
      checkoutHandoff(),
      { destinationId: "morro", tenantId: null },
      secret,
      { nowEpochSeconds: now, ttlSeconds: 300 },
    );
    if (!token) throw new Error("GUEST_TOKEN_FIXTURE_INVALID");
    const port = createPaymentsCheckoutAuthorizationPort({
      authApi: {
        resolveSession: () => null,
        authorizeMutation: () => ({ allowed: false }),
      },
      destinationId: "morro",
      handoffSecret: secret,
      origins: new Set(["https://morro.digital"]),
      production: true,
    });
    const headers = {
      "x-checkout-handoff-token": token,
      origin: "https://morro.digital",
    };

    await expect(
      port.authorizeCreate({ headers }, checkoutHandoff()),
    ).resolves.toMatchObject({
      allowed: true,
      context: {
        requesterKind: "guest_capability",
        actorSubject: "guest:runtime_guest_session",
        destinationId: "morro",
        tenantId: null,
      },
    });
    await expect(
      port.authorizeCreate(
        { headers: { ...headers, origin: "https://evil.example" } },
        checkoutHandoff(),
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "cross_origin_request",
    });
    await expect(
      port.authorizeCreate(
        { headers },
        {
          ...checkoutHandoff(),
          contractor: {
            ...checkoutHandoff().contractor,
            email: "changed@example.com",
          },
        },
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "invalid_guest_capability",
    });
  });

  it("accepts an exact signed guest Ticketing handoff without dashboard auth", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const secret = "runtime-handoff-secret-with-thirty-two-characters";
    const handoff = ticketingCheckoutHandoff();
    const token = createTicketingCheckoutHandoffCapability(
      handoff,
      {
        actorSubject: "guest:0123456789abcdef0123456789abcdef",
        destinationId: "morro",
        requesterKind: "guest_capability",
      },
      secret,
      { nowEpochSeconds: now, ttlSeconds: 300 },
    );
    if (!token) throw new Error("TICKETING_GUEST_TOKEN_FIXTURE_INVALID");

    const port = createPaymentsCheckoutAuthorizationPort({
      authApi: {
        resolveSession: () => null,
        authorizeMutation: () => ({ allowed: false }),
      },
      destinationId: "morro",
      handoffSecret: secret,
      origins: new Set(["https://morro.digital"]),
      production: true,
    });
    const headers = {
      "x-checkout-handoff-token": token,
      origin: "https://morro.digital",
    };

    await expect(
      port.authorizeTicketingCreate({ headers }, handoff),
    ).resolves.toEqual({
      allowed: true,
      context: {
        requesterKind: "guest_capability",
        actorSubject: "guest:0123456789abcdef0123456789abcdef",
        destinationId: "morro",
        tenantId: null,
      },
    });

    await expect(
      port.authorizeTicketingCreate(
        { headers: { ...headers, origin: "https://evil.example" } },
        handoff,
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "cross_origin_request",
    });

    await expect(
      port.authorizeTicketingCreate(
        { headers },
        {
          ...handoff,
          customer: { ...handoff.customer, email: "changed@example.com" },
        },
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "invalid_guest_capability",
    });
  });

  it("keeps authenticated Ticketing checkout bound to session and CSRF", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const secret = "runtime-handoff-secret-with-thirty-two-characters";
    const active = Object.freeze({
      subject: "user-ticketing-runtime",
      email: "owner@example.com",
      role: "owner",
      businessIds: Object.freeze(["business-1"]),
      issuedAt: now - 60,
      expiresAt: now + 3_600,
      sessionId: "session-ticketing-runtime",
    });
    const handoff = ticketingCheckoutHandoff();
    const token = createTicketingCheckoutHandoffCapability(
      handoff,
      {
        actorSubject: active.subject,
        destinationId: "morro",
        requesterKind: "authenticated",
      },
      secret,
      { nowEpochSeconds: now, ttlSeconds: 300 },
    );
    if (!token) throw new Error("TICKETING_AUTH_TOKEN_FIXTURE_INVALID");

    const port = createPaymentsCheckoutAuthorizationPort({
      authApi: {
        resolveSession: () => active,
        authorizeMutation: () => ({ allowed: true }),
      },
      destinationId: "morro",
      handoffSecret: secret,
      origins: new Set(["https://morro.digital"]),
      production: true,
    });

    await expect(
      port.authorizeTicketingCreate(
        {
          headers: {
            "x-checkout-handoff-token": token,
            origin: "https://morro.digital",
          },
        },
        handoff,
      ),
    ).resolves.toEqual({
      allowed: true,
      context: {
        requesterKind: "authenticated",
        actorSubject: active.subject,
        destinationId: "morro",
        tenantId: null,
      },
    });

    const csrfPort = createPaymentsCheckoutAuthorizationPort({
      authApi: {
        resolveSession: () => active,
        authorizeMutation: () => ({
          allowed: false,
          reason: "invalid_csrf",
        }),
      },
      destinationId: "morro",
      handoffSecret: secret,
      origins: new Set(["https://morro.digital"]),
      production: true,
    });
    await expect(
      csrfPort.authorizeTicketingCreate(
        {
          headers: {
            "x-checkout-handoff-token": token,
            origin: "https://morro.digital",
          },
        },
        handoff,
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "invalid_csrf",
    });
  });

  it("routes bounded refund JSON to the dedicated transport", async () => {
    let captured;
    const api = createPaymentsApi({
      refundTransport: {
        handle(input) {
          captured = input;
          return Promise.resolve({
            status: 202,
            body: {
              data: {
                refundId: "rfd_runtime_00000001",
                status: "AWAITING_VERIFIED_EVENT",
              },
            },
            headers: { "Cache-Control": "no-store" },
          });
        },
      },
      audit: () => undefined,
    });
    const response = responseCapture();
    const body = JSON.stringify({ reason: "requested_by_business" });
    const pathname = "/api/payments/v1/payments/pay_runtime_00000001/refunds";

    expect(api.matches(pathname)).toBe(true);
    await api.handle(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          "idempotency-key": "refund:v1:pay_runtime_00000001",
        },
        body,
      }),
      response,
      new URL("http://localhost" + pathname),
    );

    expect(response.statusCode).toBe(202);
    expect(captured).toMatchObject({
      method: "POST",
      pathname,
      body: { reason: "requested_by_business" },
      clientIp: "203.0.113.20",
    });
    expect(captured.correlationId).toMatch(/^corr_/u);
  });

  it("binds refund authority to active session, CSRF and checkout tenant", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const active = Object.freeze({
      subject: "user-refund-runtime",
      email: "owner@example.com",
      role: "owner",
      businessIds: Object.freeze(["business-1"]),
      issuedAt: now - 60,
      expiresAt: now + 3_600,
      sessionId: "session-refund-runtime",
    });
    const payment = {
      id: "pay_refund_runtime_0001",
      subject: { kind: "order", reference: "ord_refund_runtime_0001" },
    };
    const base = {
      authApi: {
        resolveSession: () => active,
        authorizeMutation: () => ({ allowed: true }),
      },
      payments: {
        findById: () => Promise.resolve(payment),
      },
      access: {
        findByOrderId: () =>
          Promise.resolve({
            orderId: payment.subject.reference,
            paymentId: payment.id,
            tenantId: "business-1",
          }),
      },
    };
    const port = createPaymentsRefundAuthorizationPort(base);

    await expect(
      port.authorizeRefund(
        { headers: { "x-business-id": "business-1" } },
        payment.id,
      ),
    ).resolves.toEqual({
      allowed: true,
      context: {
        actorSubject: "user-refund-runtime",
        tenantId: "business-1",
      },
    });

    const mismatched = createPaymentsRefundAuthorizationPort({
      ...base,
      access: {
        findByOrderId: () =>
          Promise.resolve({
            orderId: payment.subject.reference,
            paymentId: payment.id,
            tenantId: "business-2",
          }),
      },
    });
    await expect(
      mismatched.authorizeRefund(
        { headers: { "x-business-id": "business-1" } },
        payment.id,
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "business_access_denied",
    });

    const guest = createPaymentsRefundAuthorizationPort({
      ...base,
      authApi: {
        resolveSession: () => null,
        authorizeMutation: () => ({ allowed: false }),
      },
    });
    await expect(
      guest.authorizeRefund(
        { headers: { "x-business-id": "business-1" } },
        payment.id,
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "authentication_required",
    });
  });

  it("routes bounded reconciliation JSON to the admin transport", async () => {
    let captured;
    const api = createPaymentsApi({
      reconciliationTransport: {
        handle(input) {
          captured = input;
          return Promise.resolve({
            status: 201,
            body: {
              data: {
                runId: "rrn_runtime_reconciliation_0001",
                findingCount: 0,
              },
            },
            headers: { "Cache-Control": "no-store" },
          });
        },
      },
      audit: () => undefined,
    });
    const response = responseCapture();
    const body = JSON.stringify({
      runId: "rrn_runtime_reconciliation_0001",
    });
    const pathname =
      "/api/payments/v1/reconciliation/payments/" +
      "pay_runtime_reconciliation_0001/runs";

    expect(api.matches(pathname)).toBe(true);
    await api.handle(
      request({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          "idempotency-key":
            "reconciliation:v1:rrn_runtime_reconciliation_0001",
        },
        body,
      }),
      response,
      new URL("http://localhost" + pathname),
    );

    expect(response.statusCode).toBe(201);
    expect(captured).toMatchObject({
      method: "POST",
      pathname,
      body: { runId: "rrn_runtime_reconciliation_0001" },
      clientIp: "203.0.113.20",
    });
  });

  it("restricts reconciliation reads and mutations to active admins", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const admin = Object.freeze({
      subject: "admin-reconciliation-runtime",
      email: "admin@example.com",
      role: "admin",
      businessIds: Object.freeze([]),
      issuedAt: now - 60,
      expiresAt: now + 3_600,
      sessionId: "session-reconciliation-runtime",
    });
    let mutationCalls = 0;
    const port = createPaymentsReconciliationAuthorizationPort({
      authApi: {
        resolveSession: () => admin,
        authorizeMutation: () => {
          mutationCalls += 1;
          return { allowed: true };
        },
      },
    });

    await expect(port.authorize({}, "reconciliation.read")).resolves.toEqual({
      allowed: true,
      actorSubject: "admin-reconciliation-runtime",
    });
    expect(mutationCalls).toBe(0);
    await expect(port.authorize({}, "reconciliation.run")).resolves.toEqual({
      allowed: true,
      actorSubject: "admin-reconciliation-runtime",
    });
    expect(mutationCalls).toBe(1);

    const owner = createPaymentsReconciliationAuthorizationPort({
      authApi: {
        resolveSession: () => ({ ...admin, role: "owner" }),
        authorizeMutation: () => ({ allowed: true }),
      },
    });
    await expect(owner.authorize({}, "reconciliation.read")).resolves.toEqual({
      allowed: false,
      reason: "admin_required",
    });

    const csrf = createPaymentsReconciliationAuthorizationPort({
      authApi: {
        resolveSession: () => admin,
        authorizeMutation: () => ({
          allowed: false,
          reason: "invalid_csrf",
        }),
      },
    });
    await expect(
      csrf.authorize({}, "reconciliation.acknowledge"),
    ).resolves.toEqual({
      allowed: false,
      reason: "invalid_csrf",
    });
  });
});
