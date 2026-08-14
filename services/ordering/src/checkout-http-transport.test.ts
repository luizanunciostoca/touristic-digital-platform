import { describe, expect, it } from "vitest";

import {
  createPendingPayment,
  type Payment,
  type PaymentId,
  type PaymentRepositoryPort,
} from "@touristic/financial";
import {
  CheckoutApplicationError,
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type CheckoutApplicationRequest,
  type Order,
  type OrderId,
  type OrderRepositoryPort,
  type OrderRequestKey,
  type ProviderNeutralCheckoutApplicationService,
} from "@touristic/ordering";

import {
  sameCheckoutAccessAuthority,
  type CheckoutAccessRecord,
  type CheckoutAccessRepositoryPort,
} from "./checkout-access.js";
import {
  CheckoutHttpTransport,
  type CheckoutHttpAuditEvent,
  type CheckoutHttpAuthorizationPort,
  type CheckoutHttpRateLimitPort,
} from "./checkout-http-transport.js";
import { createInMemoryCheckoutRateLimitPort } from "./checkout-rate-limit.js";
import {
  createCheckoutStatusCapability,
  normalizeCheckoutRequestContext,
} from "./checkout-security.js";

function handoff(): CheckoutApplicationRequest {
  return {
    sessionId: "http_session_12345678",
    planId: "growth",
    contractor: {
      name: "Cliente HTTP",
      email: "http@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    businessDraft: {
      demoBusinessId: "demo_http_123",
      displayName: "Negócio HTTP",
      categoryId: "restaurant",
      specialty: "Local",
      environment: "sandbox",
      publishable: false,
    },
    acceptedTerms: [
      {
        type: "terms",
        version: "terms_v1",
        acceptedAt: "2026-08-14T22:30:00Z",
      },
      {
        type: "privacy",
        version: "privacy_v1",
        acceptedAt: "2026-08-14T22:30:00Z",
      },
    ],
    returnUrl: "https://morro.digital/checkout/return",
    tutorial: false,
    requiresPaymentsCapability: true,
  };
}

function fixtures(): { order: Order; payment: Payment } {
  const id = normalizeOrderId("ord_http_12345678");
  const requestKey = createBusinessOrderRequestKey(
    "http_session_12345678",
    "growth",
  );
  const source = normalizeOrderSourceReference("http_session_12345678");
  const quote = createPricingQuote({
    planId: "growth",
    planName: "Crescimento",
    minorUnits: 49_900,
    currency: "BRL",
    pricingVersion: "plans_http_v1",
  });
  if (!id || !requestKey || !source || !quote) {
    throw new Error("FIXTURE_INVALID");
  }
  const pricing = capturePricingSnapshot(quote, "2026-08-14T22:30:00Z");
  if (!pricing) throw new Error("FIXTURE_INVALID");
  const order = createOrder({
    id,
    requestKey,
    source,
    status: "pending_payment",
    pricing,
    createdAt: "2026-08-14T22:30:00Z",
    updatedAt: "2026-08-14T22:30:00.001Z",
  });
  const payment = createPendingPayment({
    id: "pay_http_12345678",
    orderReference: id,
    amount: pricing.amount,
    createdAt: "2026-08-14T22:30:00Z",
  });
  if (!order || !payment) throw new Error("FIXTURE_INVALID");
  return { order, payment };
}

class MemoryOrders implements OrderRepositoryPort {
  constructor(readonly order: Order) {}

  findById(orderId: OrderId): Promise<Order | null> {
    return Promise.resolve(orderId === this.order.id ? this.order : null);
  }

  findByRequestKey(requestKey: OrderRequestKey): Promise<Order | null> {
    return Promise.resolve(
      requestKey === this.order.requestKey ? this.order : null,
    );
  }

  save(order: Order): Promise<Order> {
    return Promise.resolve(order);
  }
}

class MemoryPayments implements PaymentRepositoryPort {
  constructor(readonly payment: Payment) {}

  findById(paymentId: PaymentId): Promise<Payment | null> {
    return Promise.resolve(paymentId === this.payment.id ? this.payment : null);
  }

  save(payment: Payment): Promise<Payment> {
    return Promise.resolve(payment);
  }
}

class MemoryAccess implements CheckoutAccessRepositoryPort {
  current: CheckoutAccessRecord | null = null;

  findByOrderId(orderId: OrderId): Promise<CheckoutAccessRecord | null> {
    return Promise.resolve(
      this.current?.orderId === orderId ? this.current : null,
    );
  }

  claim(record: CheckoutAccessRecord): Promise<CheckoutAccessRecord> {
    if (!this.current) this.current = record;
    if (!sameCheckoutAccessAuthority(this.current, record)) {
      return Promise.reject(new Error("ORDERING_CHECKOUT_ACCESS_CONFLICT"));
    }
    return Promise.resolve(this.current);
  }
}

function createRequest(
  overrides: Partial<{
    method: string;
    pathname: string;
    body: unknown;
    headers: Record<string, unknown>;
    clientIp: string;
    correlationId: string;
  }> = {},
) {
  return {
    method: "POST",
    pathname: "/api/payments/v1/checkouts",
    body: handoff(),
    headers: {
      "Idempotency-Key": "business:http_session_12345678:growth",
    },
    clientIp: "203.0.113.10",
    correlationId: "corr_http_12345678",
    ...overrides,
  };
}

function harness(
  options: {
    readonly authorization?: CheckoutHttpAuthorizationPort;
    readonly rateLimits?: CheckoutHttpRateLimitPort;
    readonly application?: ProviderNeutralCheckoutApplicationService;
  } = {},
) {
  const { order, payment } = fixtures();
  const access = new MemoryAccess();
  const audits: CheckoutHttpAuditEvent[] = [];
  const context = normalizeCheckoutRequestContext({
    requesterKind: "authenticated",
    actorSubject: "user-123",
    destinationId: "morro",
    tenantId: "business-123",
  });
  if (!context) throw new Error("FIXTURE_INVALID");
  const application: ProviderNeutralCheckoutApplicationService =
    options.application ?? {
      startCheckout: () => Promise.resolve({ order, payment, replayed: false }),
    };
  const transport = new CheckoutHttpTransport({
    application,
    orders: new MemoryOrders(order),
    payments: new MemoryPayments(payment),
    access,
    authorization: options.authorization ?? {
      authorizeCreate: () => Promise.resolve({ allowed: true, context }),
    },
    returnUrls: {
      allows: (returnUrl) => returnUrl.startsWith("https://morro.digital/"),
    },
    statusCapabilities: createCheckoutStatusCapability(
      "http-status-secret-with-at-least-thirty-two-characters",
    ),
    rateLimits: options.rateLimits ?? createInMemoryCheckoutRateLimitPort(),
    audit: {
      record: (event) => {
        audits.push(event);
        return Promise.resolve();
      },
    },
    clock: { now: () => "2026-08-14T22:30:00Z" },
    statusTtlSeconds: 3_600,
  });
  return { transport, access, audits, order, payment };
}

describe("M139 checkout HTTP/Auth/security transport", () => {
  it("creates a versioned checkout with bound idempotency and no PII projection", async () => {
    const { transport, access, audits } = harness();
    const result = await transport.handle(createRequest());

    expect(result.status).toBe(201);
    expect(result.headers).toEqual({
      "Cache-Control": "no-store",
      "X-Correlation-ID": "corr_http_12345678",
    });
    expect(result.body).toMatchObject({
      data: {
        checkoutId: "ord_http_12345678",
        paymentId: "pay_http_12345678",
        status: "PENDING",
        plan: {
          id: "growth",
          amount: { minorUnits: 49_900, currency: "BRL" },
        },
        replayed: false,
      },
    });
    expect(JSON.stringify(result.body)).not.toContain("http@example.com");
    expect(access.current).not.toHaveProperty("token");
    expect(access.current?.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(audits.at(-1)).toMatchObject({
      action: "checkout.create",
      result: "success",
      reason: "created",
    });
  });

  it("rejects absent and divergent logical idempotency before application execution", async () => {
    let calls = 0;
    const base = harness({
      application: {
        startCheckout: () => {
          calls += 1;
          return Promise.resolve({ ...fixtures(), replayed: false });
        },
      },
    });

    const missing = await base.transport.handle(createRequest({ headers: {} }));
    const divergent = await base.transport.handle(
      createRequest({
        headers: { "Idempotency-Key": "business:other:growth" },
      }),
    );

    expect(missing).toMatchObject({
      status: 400,
      body: { error: "IDEMPOTENCY_KEY_REQUIRED" },
    });
    expect(divergent).toMatchObject({
      status: 409,
      body: { error: "IDEMPOTENCY_KEY_MISMATCH" },
    });
    expect(calls).toBe(0);
  });

  it("maps auth, CSRF and return-origin denials before persistence", async () => {
    const denied = harness({
      authorization: {
        authorizeCreate: () =>
          Promise.resolve({
            allowed: false,
            reason: "invalid_csrf",
          }),
      },
    });
    await expect(
      denied.transport.handle(createRequest()),
    ).resolves.toMatchObject({
      status: 403,
      body: { error: "INVALID_CSRF" },
    });

    const returnDenied = await harness().transport.handle(
      createRequest({
        body: {
          ...handoff(),
          returnUrl: "https://evil.example/return",
        },
      }),
    );
    expect(returnDenied).toMatchObject({
      status: 400,
      body: { error: "RETURN_URL_DENIED" },
    });
  });

  it("returns the same deterministic status token on an exact replay", async () => {
    const { transport } = harness();
    const first = await transport.handle(createRequest());
    const second = await transport.handle(createRequest());

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((second.body.data as Record<string, unknown>).statusToken).toBe(
      (first.body.data as Record<string, unknown>).statusToken,
    );
    expect((second.body.data as Record<string, unknown>).replayed).toBe(true);
  });

  it("rejects a divergent handoff reusing the same logical Order", async () => {
    const { transport } = harness();
    await transport.handle(createRequest());
    const divergent = await transport.handle(
      createRequest({
        body: {
          ...handoff(),
          contractor: {
            ...(handoff().contractor as Record<string, unknown>),
            email: "other@example.com",
          },
        },
      }),
    );

    expect(divergent).toMatchObject({
      status: 409,
      body: { error: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("serves a minimal status only for the exact unexpired capability", async () => {
    const { transport, order } = harness();
    const created = await transport.handle(createRequest());
    const token = (created.body.data as Record<string, unknown>).statusToken;

    const valid = await transport.handle(
      createRequest({
        method: "GET",
        pathname: "/api/payments/v1/checkouts/" + order.id,
        body: undefined,
        headers: { "X-Checkout-Token": token },
        correlationId: "corr_status_12345678",
      }),
    );
    expect(valid).toEqual({
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Correlation-ID": "corr_status_12345678",
      },
      body: {
        data: {
          checkoutId: order.id,
          sessionId: "http_session_12345678",
          status: "PENDING",
          paymentReference: null,
          activationStatus: null,
          definitiveBusinessId: null,
        },
      },
    });

    for (const pathname of [
      "/api/payments/v1/checkouts/" + order.id,
      "/api/payments/v1/checkouts/ord_unknown_12345678",
    ]) {
      const denied = await transport.handle(
        createRequest({
          method: "GET",
          pathname,
          body: undefined,
          headers: { "X-Checkout-Token": "wrong" },
          correlationId: "corr_denied_12345678",
        }),
      );
      expect(denied).toMatchObject({
        status: 404,
        body: { error: "CHECKOUT_NOT_FOUND" },
      });
    }
  });

  it("enforces explicit route rate limits", async () => {
    const rateLimits: CheckoutHttpRateLimitPort = {
      consume: () =>
        Promise.resolve({
          allowed: false,
          retryAfterSeconds: 42,
        }),
    };
    const { transport } = harness({ rateLimits });

    const result = await transport.handle(createRequest());

    expect(result).toMatchObject({
      status: 429,
      body: { error: "RATE_LIMITED" },
      headers: { "Retry-After": "42" },
    });
  });

  it("maps application configuration and conflict failures without leaking internals", async () => {
    const notConfigured = harness({
      application: {
        startCheckout: () =>
          Promise.reject(
            new CheckoutApplicationError("CHECKOUT_PLAN_NOT_CONFIGURED"),
          ),
      },
    });
    const unavailable = await notConfigured.transport.handle(createRequest());

    expect(unavailable).toMatchObject({
      status: 503,
      body: { error: "CHECKOUT_NOT_CONFIGURED" },
    });
    expect(JSON.stringify(unavailable.body)).not.toContain(
      "CHECKOUT_PLAN_NOT_CONFIGURED",
    );
  });
});

describe("M139 in-memory rate limiter", () => {
  it("uses independent bounded windows per route bucket", async () => {
    const limiter = createInMemoryCheckoutRateLimitPort();
    const base = {
      bucket: "checkout-create" as const,
      key: "actor",
      limit: 2,
      windowMs: 1_000,
    };

    await expect(limiter.consume({ ...base, nowMs: 0 })).resolves.toMatchObject(
      { allowed: true },
    );
    await expect(
      limiter.consume({ ...base, nowMs: 100 }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(limiter.consume({ ...base, nowMs: 200 })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    await expect(
      limiter.consume({ ...base, nowMs: 1_001 }),
    ).resolves.toMatchObject({ allowed: true });
  });
});
