import { describe, expect, it } from "vitest";

import {
  createMoney,
  createRefundIdempotencyKey,
  normalizePaymentId,
  normalizeRefundRequest,
} from "@touristic/financial";

import {
  RefundApplicationError,
  type RefundApplicationService,
} from "./refund-application-service.js";
import {
  RefundHttpTransport,
  refundHttpPrefix,
  type RefundHttpAuthorizationPort,
} from "./refund-http-transport.js";

function fixture() {
  const paymentId = normalizePaymentId("pay_http_refund_00000001");
  const amount = createMoney(49_900, "BRL");
  const request = normalizeRefundRequest({
    id: "rfd_http_refund_00000001",
    idempotencyKey: createRefundIdempotencyKey(paymentId),
    paymentId,
    approvedResultId: "fev_http_refund_approved_0001",
    amount,
    providerPaymentReference: "provider_payment_secret_0001",
    status: "provider_accepted",
    providerRefundReference: "provider_refund_secret_0001",
    createdAt: "2026-08-15T01:00:00Z",
    updatedAt: "2026-08-15T01:00:01Z",
  });
  if (!paymentId || !request) throw new Error("FIXTURE_INVALID");
  return { paymentId, request };
}

function httpRequest(
  overrides: Partial<{
    method: string;
    pathname: string;
    headers: Record<string, unknown>;
    body: unknown;
    clientIp: string;
    correlationId: string;
  }> = {},
) {
  const { paymentId } = fixture();
  return {
    method: "POST",
    pathname: refundHttpPrefix + "/" + paymentId + "/refunds",
    headers: {
      "idempotency-key": "refund:v1:" + paymentId,
    },
    body: { reason: "requested_by_business" },
    clientIp: "203.0.113.44",
    correlationId: "corr_refund_http_0001",
    ...overrides,
  };
}

function harness(
  options: {
    application?: RefundApplicationService;
    authorization?: RefundHttpAuthorizationPort;
    rateAllowed?: boolean;
  } = {},
) {
  const { request } = fixture();
  const audit: unknown[] = [];
  let applicationCalls = 0;
  let authorizationCalls = 0;
  const application: RefundApplicationService = options.application ?? {
    requestFullRefund() {
      applicationCalls += 1;
      return Promise.resolve({
        request,
        status: "AWAITING_VERIFIED_EVENT" as const,
        replayed: false,
      });
    },
  };
  const authorization: RefundHttpAuthorizationPort = options.authorization ?? {
    authorizeRefund() {
      authorizationCalls += 1;
      return Promise.resolve({
        allowed: true as const,
        context: {
          actorSubject: "user-refund-http",
          tenantId: "business-refund-http",
        },
      });
    },
  };
  const transport = new RefundHttpTransport({
    application,
    authorization,
    rateLimits: {
      consume() {
        return Promise.resolve({
          allowed: options.rateAllowed ?? true,
          retryAfterSeconds: 30,
        });
      },
    },
    audit: {
      record(event) {
        audit.push(event);
        return Promise.resolve();
      },
    },
    clock: { now: () => "2026-08-15T01:00:02Z" },
  });
  return {
    transport,
    audit,
    applicationCalls: () => applicationCalls,
    authorizationCalls: () => authorizationCalls,
  };
}

describe("M144 authenticated refund HTTP boundary", () => {
  it("returns only a safe pending result after provider acceptance", async () => {
    const { paymentId } = fixture();
    const { transport, audit, applicationCalls } = harness();

    expect(
      transport.matches(refundHttpPrefix + "/" + paymentId + "/refunds"),
    ).toBe(true);
    await expect(transport.handle(httpRequest())).resolves.toEqual({
      status: 202,
      body: {
        data: {
          refundId: "rfd_http_refund_00000001",
          paymentId,
          status: "AWAITING_VERIFIED_EVENT",
          replayed: false,
        },
      },
      headers: {
        "Cache-Control": "no-store",
        "X-Correlation-ID": "corr_refund_http_0001",
      },
    });
    expect(applicationCalls()).toBe(1);
    expect(JSON.stringify(audit)).not.toContain("provider_refund_secret");
  });

  it("requires an exact body and payment-bound idempotency key", async () => {
    const { transport, applicationCalls, authorizationCalls } = harness();

    await expect(
      transport.handle(
        httpRequest({
          body: {
            reason: "requested_by_business",
            amount: { minorUnits: 1, currency: "BRL" },
          },
        }),
      ),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: "INVALID_REFUND_REQUEST" },
    });
    await expect(
      transport.handle(
        httpRequest({
          headers: { "idempotency-key": "refund:v1:pay_other_00000001" },
        }),
      ),
    ).resolves.toMatchObject({
      status: 409,
      body: { error: "IDEMPOTENCY_KEY_MISMATCH" },
    });
    expect(authorizationCalls()).toBe(0);
    expect(applicationCalls()).toBe(0);
  });

  it("rejects guest and read-only authority before the command", async () => {
    const guest = harness({
      authorization: {
        authorizeRefund: () =>
          Promise.resolve({
            allowed: false as const,
            reason: "authentication_required" as const,
          }),
      },
    });
    await expect(guest.transport.handle(httpRequest())).resolves.toMatchObject({
      status: 401,
      body: { error: "AUTH_REQUIRED" },
    });
    expect(guest.applicationCalls()).toBe(0);

    const viewer = harness({
      authorization: {
        authorizeRefund: () =>
          Promise.resolve({
            allowed: false as const,
            reason: "read_only_role" as const,
          }),
      },
    });
    await expect(viewer.transport.handle(httpRequest())).resolves.toMatchObject(
      {
        status: 403,
        body: { error: "READ_ONLY_ROLE" },
      },
    );
    expect(viewer.applicationCalls()).toBe(0);
  });

  it("maps financial preconditions conservatively and rate limits mutations", async () => {
    const notReady = harness({
      application: {
        requestFullRefund: () =>
          Promise.reject(
            new RefundApplicationError("REFUND_APPROVAL_LEDGER_MISSING"),
          ),
      },
    });
    await expect(
      notReady.transport.handle(httpRequest()),
    ).resolves.toMatchObject({
      status: 409,
      body: { error: "REFUND_NOT_READY" },
    });

    const limited = harness({ rateAllowed: false });
    await expect(
      limited.transport.handle(httpRequest()),
    ).resolves.toMatchObject({
      status: 429,
      body: { error: "RATE_LIMITED" },
      headers: { "Retry-After": "30" },
    });
    expect(limited.applicationCalls()).toBe(0);
  });
});
