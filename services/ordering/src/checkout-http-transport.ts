import {
  createCheckoutProviderRequest,
  normalizeCheckoutProviderSession,
  normalizeFinancialTimestamp,
  type FinancialCheckoutProviderPort,
  type Payment,
  type PaymentRepositoryPort,
  type VerifiedPaymentResultRepositoryPort,
} from "@touristic/financial";
import {
  CheckoutApplicationError,
  createBusinessOrderRequestKey,
  normalizeBusinessCheckoutHandoff,
  normalizeOrderId,
  type CheckoutApplicationRequest,
  type Order,
  type OrderRepositoryPort,
  type ProviderNeutralCheckoutApplicationService,
  type ValidatedBusinessCheckoutHandoff,
} from "@touristic/ordering";

import {
  createCheckoutAccessRecord,
  sameCheckoutAccessAuthority,
  type CheckoutAccessRecord,
  type CheckoutAccessRepositoryPort,
} from "./checkout-access.js";
import {
  checkoutRequestFingerprint,
  normalizeCheckoutCorrelationId,
  normalizeCheckoutRequestContext,
  type CheckoutRequestContext,
  type CheckoutReturnUrlPolicy,
  type CheckoutStatusCapability,
} from "./checkout-security.js";

export interface CheckoutHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
  readonly clientIp?: string;
  readonly correlationId?: string;
}

export interface CheckoutHttpResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
}

export type CheckoutHttpAuthorizationDenialReason =
  | "authentication_required"
  | "invalid_guest_capability"
  | "business_access_denied"
  | "read_only_role"
  | "cross_origin_request"
  | "invalid_csrf"
  | "missing_context";

export type CheckoutHttpAuthorizationDecision =
  | {
      readonly allowed: true;
      readonly context: CheckoutRequestContext;
    }
  | {
      readonly allowed: false;
      readonly reason: CheckoutHttpAuthorizationDenialReason;
    };

export interface CheckoutHttpAuthorizationPort {
  authorizeCreate(
    request: CheckoutHttpRequest,
    handoff: ValidatedBusinessCheckoutHandoff,
  ): Promise<CheckoutHttpAuthorizationDecision>;
}

export type CheckoutRateLimitBucket = "checkout-create" | "checkout-status";

export interface CheckoutRateLimitRequest {
  readonly bucket: CheckoutRateLimitBucket;
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly nowMs: number;
}

export interface CheckoutRateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface CheckoutHttpRateLimitPort {
  consume(input: CheckoutRateLimitRequest): Promise<CheckoutRateLimitDecision>;
}

export interface CheckoutHttpAuditEvent {
  readonly action: "checkout.create" | "checkout.status";
  readonly result: "success" | "denied" | "failure";
  readonly reason: string;
  readonly correlationId: string;
  readonly actorSubject: string | null;
  readonly destinationId: string | null;
  readonly tenantId: string | null;
  readonly orderId: string | null;
}

export interface CheckoutHttpAuditPort {
  record(event: CheckoutHttpAuditEvent): Promise<void>;
}

export interface CheckoutHttpClockPort {
  now(): unknown;
}

export interface CheckoutHttpTransportDependencies {
  readonly application: ProviderNeutralCheckoutApplicationService;
  readonly orders: OrderRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly paymentResults?: VerifiedPaymentResultRepositoryPort;
  readonly access: CheckoutAccessRepositoryPort;
  readonly provider: FinancialCheckoutProviderPort;
  readonly webhookUrl: string;
  readonly authorization: CheckoutHttpAuthorizationPort;
  readonly returnUrls: CheckoutReturnUrlPolicy;
  readonly statusCapabilities: CheckoutStatusCapability;
  readonly rateLimits: CheckoutHttpRateLimitPort;
  readonly audit: CheckoutHttpAuditPort;
  readonly clock: CheckoutHttpClockPort;
  readonly statusTtlSeconds?: number;
}

const checkoutPrefix = "/api/payments/v1/checkouts";
const createRateLimit = 12;
const statusRateLimit = 60;
const rateWindowMs = 60_000;

type CheckoutRoute =
  | { readonly kind: "collection" }
  | { readonly kind: "status"; readonly orderId: string };

function route(pathname: string): CheckoutRoute | null {
  if (pathname === checkoutPrefix) return { kind: "collection" };
  if (!pathname.startsWith(checkoutPrefix + "/")) return null;
  const parts = pathname
    .slice(checkoutPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  return parts.length === 1 && parts[0]
    ? { kind: "status", orderId: parts[0] }
    : null;
}

function firstHeader(value: unknown): string {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(request: CheckoutHttpRequest, name: string): string {
  const headers = request.headers ?? {};
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return firstHeader(value);
  }
  return "";
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
  correlationId: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): CheckoutHttpResponse {
  return Object.freeze({
    status,
    body: Object.freeze({ ...body }),
    headers: Object.freeze({
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlationId,
      ...extraHeaders,
    }),
  });
}

function errorResponse(
  status: number,
  error: string,
  correlationId: string,
  reason?: string,
  headers?: Readonly<Record<string, string>>,
): CheckoutHttpResponse {
  return response(
    status,
    {
      error,
      ...(reason ? { reason } : {}),
    },
    correlationId,
    headers,
  );
}

function normalizeWebhookUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) return "";
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function canonicalNow(clock: CheckoutHttpClockPort): string {
  const normalized = normalizeFinancialTimestamp(clock.now());
  if (!normalized) throw new Error("CHECKOUT_HTTP_INVALID_CLOCK");
  return new Date(normalized).toISOString();
}

function clientKey(request: CheckoutHttpRequest): string {
  const value =
    typeof request.clientIp === "string"
      ? request.clientIp.trim().slice(0, 100)
      : "";
  return value || "unknown";
}

function publicPaymentStatus(payment: Payment, order: Order): string {
  if (payment.status === "confirmed") return "CONFIRMED";
  if (payment.status === "failed") return "FAILED";
  if (payment.status === "cancelled") return "CANCELLED";
  if (payment.status === "expired") return "EXPIRED";
  if (payment.status === "refunded") return "REFUNDED";
  return order.status === "cancelled" ? "CANCELLED" : "PENDING";
}

function authorizationError(
  reason: CheckoutHttpAuthorizationDenialReason,
  correlationId: string,
): CheckoutHttpResponse {
  if (
    reason === "authentication_required" ||
    reason === "invalid_guest_capability"
  ) {
    return errorResponse(401, "AUTH_REQUIRED", correlationId);
  }
  if (reason === "missing_context") {
    return errorResponse(400, "CHECKOUT_CONTEXT_REQUIRED", correlationId);
  }
  if (reason === "invalid_csrf") {
    return errorResponse(403, "INVALID_CSRF", correlationId);
  }
  if (reason === "cross_origin_request") {
    return errorResponse(403, "ORIGIN_DENIED", correlationId);
  }
  if (reason === "read_only_role") {
    return errorResponse(403, "READ_ONLY_ROLE", correlationId);
  }
  return errorResponse(403, "BUSINESS_ACCESS_DENIED", correlationId);
}

function applicationError(
  error: CheckoutApplicationError,
  correlationId: string,
): CheckoutHttpResponse {
  if (error.code === "CHECKOUT_INVALID_HANDOFF") {
    return errorResponse(400, "INVALID_CHECKOUT_REQUEST", correlationId);
  }
  if (error.code === "CHECKOUT_PLAN_NOT_CONFIGURED") {
    return errorResponse(503, "CHECKOUT_NOT_CONFIGURED", correlationId);
  }
  if (error.code === "CHECKOUT_ORDER_NOT_REUSABLE") {
    return errorResponse(409, "CHECKOUT_NOT_REUSABLE", correlationId);
  }
  if (
    error.code === "CHECKOUT_ORDER_CONFLICT" ||
    error.code === "CHECKOUT_PAYMENT_CONFLICT"
  ) {
    return errorResponse(409, "CHECKOUT_CONFLICT", correlationId);
  }
  return errorResponse(503, "CHECKOUT_UNAVAILABLE", correlationId);
}

function accessMatches(
  access: CheckoutAccessRecord,
  paymentId: string,
  fingerprint: string,
  context: CheckoutRequestContext,
  tokenHash: string,
): boolean {
  const proposed = createCheckoutAccessRecord({
    orderId: access.orderId,
    paymentId,
    requestFingerprint: fingerprint,
    tokenHash,
    context,
    correlationId: access.correlationId,
    createdAt: access.createdAt,
    expiresAt: access.expiresAt,
  });
  return Boolean(proposed && sameCheckoutAccessAuthority(access, proposed));
}

async function recordAudit(
  port: CheckoutHttpAuditPort,
  event: CheckoutHttpAuditEvent,
): Promise<void> {
  await port.record(Object.freeze({ ...event }));
}

export class CheckoutHttpTransport {
  private readonly statusTtlSeconds: number;
  private readonly webhookUrl: string;

  constructor(
    private readonly dependencies: CheckoutHttpTransportDependencies,
  ) {
    const ttl = dependencies.statusTtlSeconds ?? 24 * 60 * 60;
    if (!Number.isSafeInteger(ttl) || ttl < 10 * 60 || ttl > 7 * 24 * 60 * 60) {
      throw new Error("CHECKOUT_STATUS_TTL_INVALID");
    }
    const webhookUrl = normalizeWebhookUrl(dependencies.webhookUrl);
    if (!webhookUrl) throw new Error("CHECKOUT_WEBHOOK_URL_INVALID");
    this.statusTtlSeconds = ttl;
    this.webhookUrl = webhookUrl;
  }

  matches(pathname: string): boolean {
    return (
      pathname === checkoutPrefix || pathname.startsWith(checkoutPrefix + "/")
    );
  }

  async handle(request: CheckoutHttpRequest): Promise<CheckoutHttpResponse> {
    const correlationId = normalizeCheckoutCorrelationId(
      request.correlationId ?? header(request, "x-correlation-id"),
    );
    if (!correlationId) {
      return errorResponse(400, "CORRELATION_ID_REQUIRED", "corr_invalid");
    }

    const matched = route(request.pathname);
    if (!matched) {
      return errorResponse(404, "NOT_FOUND", correlationId);
    }

    const method = request.method.toUpperCase();
    try {
      if (matched.kind === "collection" && method === "POST") {
        return await this.create(request, correlationId);
      }
      if (matched.kind === "status" && method === "GET") {
        return await this.status(request, matched.orderId, correlationId);
      }
      return errorResponse(405, "METHOD_NOT_ALLOWED", correlationId);
    } catch {
      return errorResponse(503, "CHECKOUT_UNAVAILABLE", correlationId);
    }
  }

  private async create(
    request: CheckoutHttpRequest,
    correlationId: string,
  ): Promise<CheckoutHttpResponse> {
    const handoff = normalizeBusinessCheckoutHandoff(
      request.body as CheckoutApplicationRequest,
    );
    if (!handoff) {
      await recordAudit(this.dependencies.audit, {
        action: "checkout.create",
        result: "denied",
        reason: "invalid_handoff",
        correlationId,
        actorSubject: null,
        destinationId: null,
        tenantId: null,
        orderId: null,
      });
      return errorResponse(400, "INVALID_CHECKOUT_REQUEST", correlationId);
    }

    const expectedIdempotency = createBusinessOrderRequestKey(
      handoff.sessionId,
      handoff.planId,
    );
    const providedIdempotency = header(request, "idempotency-key");
    if (!providedIdempotency) {
      return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", correlationId);
    }
    if (!expectedIdempotency || providedIdempotency !== expectedIdempotency) {
      return errorResponse(409, "IDEMPOTENCY_KEY_MISMATCH", correlationId);
    }

    const authorization = await this.dependencies.authorization.authorizeCreate(
      request,
      handoff,
    );
    if (!authorization.allowed) {
      await recordAudit(this.dependencies.audit, {
        action: "checkout.create",
        result: "denied",
        reason: authorization.reason,
        correlationId,
        actorSubject: null,
        destinationId: null,
        tenantId: null,
        orderId: null,
      });
      return authorizationError(authorization.reason, correlationId);
    }
    const context = normalizeCheckoutRequestContext(authorization.context);
    if (!context) {
      return authorizationError("missing_context", correlationId);
    }

    if (!this.dependencies.returnUrls.allows(handoff.returnUrl, context)) {
      await recordAudit(this.dependencies.audit, {
        action: "checkout.create",
        result: "denied",
        reason: "return_url_denied",
        correlationId,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
        orderId: null,
      });
      return errorResponse(400, "RETURN_URL_DENIED", correlationId);
    }

    const now = canonicalNow(this.dependencies.clock);
    const rate = await this.dependencies.rateLimits.consume({
      bucket: "checkout-create",
      key:
        context.actorSubject +
        ":" +
        context.destinationId +
        ":" +
        clientKey(request),
      limit: createRateLimit,
      windowMs: rateWindowMs,
      nowMs: Date.parse(now),
    });
    if (!rate.allowed) {
      await recordAudit(this.dependencies.audit, {
        action: "checkout.create",
        result: "denied",
        reason: "rate_limited",
        correlationId,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
        orderId: null,
      });
      return errorResponse(429, "RATE_LIMITED", correlationId, undefined, {
        "Retry-After": String(rate.retryAfterSeconds),
      });
    }

    try {
      const result = await this.dependencies.application.startCheckout(handoff);
      const fingerprint = checkoutRequestFingerprint(handoff, context);
      const capability = this.dependencies.statusCapabilities.issue(
        result.order.id,
      );
      const existing = await this.dependencies.access.findByOrderId(
        result.order.id,
      );
      let access: CheckoutAccessRecord;
      let replayed = result.replayed;

      if (existing) {
        if (
          !accessMatches(
            existing,
            result.payment.id,
            fingerprint,
            context,
            capability.tokenHash,
          )
        ) {
          throw new Error("ORDERING_CHECKOUT_ACCESS_CONFLICT");
        }
        access = existing;
        replayed = true;
      } else {
        const expiresAt = new Date(
          Date.parse(now) + this.statusTtlSeconds * 1_000,
        ).toISOString();
        const proposed = createCheckoutAccessRecord({
          orderId: result.order.id,
          paymentId: result.payment.id,
          requestFingerprint: fingerprint,
          tokenHash: capability.tokenHash,
          context,
          correlationId,
          createdAt: now,
          expiresAt,
        });
        if (!proposed) {
          throw new Error("ORDERING_INVALID_CHECKOUT_ACCESS");
        }
        access = await this.dependencies.access.claim(proposed);
        if (
          !accessMatches(
            access,
            result.payment.id,
            fingerprint,
            context,
            capability.tokenHash,
          )
        ) {
          throw new Error("ORDERING_CHECKOUT_ACCESS_CONFLICT");
        }
      }

      if (Date.parse(access.expiresAt) <= Date.parse(now)) {
        await recordAudit(this.dependencies.audit, {
          action: "checkout.create",
          result: "denied",
          reason: "status_capability_expired",
          correlationId,
          actorSubject: context.actorSubject,
          destinationId: context.destinationId,
          tenantId: context.tenantId,
          orderId: result.order.id,
        });
        return errorResponse(409, "STATUS_CAPABILITY_EXPIRED", correlationId);
      }

      const providerRequest = createCheckoutProviderRequest({
        paymentId: result.payment.id,
        idempotencyKey: result.payment.idempotencyKey,
        amount: result.payment.amount,
        description: result.order.pricing.planName,
        returnUrl: handoff.returnUrl,
        webhookUrl: this.webhookUrl,
        customer: handoff.contractor,
        metadata: {
          orderId: result.order.id,
          paymentId: result.payment.id,
          sessionId: handoff.sessionId,
          destinationId: context.destinationId,
          ...(context.tenantId ? { tenantId: context.tenantId } : {}),
        },
      });
      if (!providerRequest) {
        throw new Error("CHECKOUT_PROVIDER_REQUEST_INVALID");
      }
      const providerSession = normalizeCheckoutProviderSession(
        await this.dependencies.provider.createCheckout(providerRequest),
      );
      if (!providerSession) {
        throw new Error("CHECKOUT_PROVIDER_SESSION_INVALID");
      }

      await recordAudit(this.dependencies.audit, {
        action: "checkout.create",
        result: "success",
        reason: replayed ? "replayed" : "created",
        correlationId,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
        orderId: result.order.id,
      });
      return response(
        replayed ? 200 : 201,
        {
          data: Object.freeze({
            checkoutId: result.order.id,
            paymentId: result.payment.id,
            status: publicPaymentStatus(result.payment, result.order),
            plan: Object.freeze({
              id: result.order.pricing.planId,
              name: result.order.pricing.planName,
              amount: result.order.pricing.amount,
              pricingVersion: result.order.pricing.pricingVersion,
            }),
            statusToken: capability.token,
            statusExpiresAt: access.expiresAt,
            checkoutUrl: providerSession.checkoutUrl,
            replayed,
          }),
        },
        correlationId,
      );
    } catch (error) {
      const mapped =
        error instanceof CheckoutApplicationError
          ? applicationError(error, correlationId)
          : error instanceof Error &&
              error.message === "ORDERING_CHECKOUT_ACCESS_CONFLICT"
            ? errorResponse(409, "IDEMPOTENCY_CONFLICT", correlationId)
            : errorResponse(503, "CHECKOUT_UNAVAILABLE", correlationId);
      await recordAudit(this.dependencies.audit, {
        action: "checkout.create",
        result: "failure",
        reason:
          error instanceof CheckoutApplicationError
            ? error.code
            : "internal_failure",
        correlationId,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
        orderId: null,
      });
      return mapped;
    }
  }

  private async status(
    request: CheckoutHttpRequest,
    orderIdInput: string,
    correlationId: string,
  ): Promise<CheckoutHttpResponse> {
    const now = canonicalNow(this.dependencies.clock);
    const rate = await this.dependencies.rateLimits.consume({
      bucket: "checkout-status",
      key: clientKey(request),
      limit: statusRateLimit,
      windowMs: rateWindowMs,
      nowMs: Date.parse(now),
    });
    if (!rate.allowed) {
      return errorResponse(429, "RATE_LIMITED", correlationId, undefined, {
        "Retry-After": String(rate.retryAfterSeconds),
      });
    }

    const orderId = normalizeOrderId(orderIdInput);
    const token = header(request, "x-checkout-token");
    if (!orderId || !token) {
      await recordAudit(this.dependencies.audit, {
        action: "checkout.status",
        result: "denied",
        reason: "not_found",
        correlationId,
        actorSubject: null,
        destinationId: null,
        tenantId: null,
        orderId: null,
      });
      return errorResponse(404, "CHECKOUT_NOT_FOUND", correlationId);
    }

    const access = await this.dependencies.access.findByOrderId(orderId);
    if (
      !access ||
      Date.parse(access.expiresAt) <= Date.parse(now) ||
      !this.dependencies.statusCapabilities.verify(
        orderId,
        token,
        access.tokenHash,
      )
    ) {
      await recordAudit(this.dependencies.audit, {
        action: "checkout.status",
        result: "denied",
        reason: "not_found",
        correlationId,
        actorSubject: null,
        destinationId: null,
        tenantId: null,
        orderId: null,
      });
      return errorResponse(404, "CHECKOUT_NOT_FOUND", correlationId);
    }

    const [order, payment] = await Promise.all([
      this.dependencies.orders.findById(orderId),
      this.dependencies.payments.findById(access.paymentId),
    ]);
    if (
      !order ||
      !payment ||
      payment.subject.kind !== "order" ||
      payment.subject.reference !== order.id
    ) {
      await recordAudit(this.dependencies.audit, {
        action: "checkout.status",
        result: "failure",
        reason: "inconsistent_state",
        correlationId,
        actorSubject: access.actorSubject,
        destinationId: access.destinationId,
        tenantId: access.tenantId,
        orderId,
      });
      return errorResponse(503, "CHECKOUT_UNAVAILABLE", correlationId);
    }

    const terminalStatus = payment.status === "pending" ? null : payment.status;
    const paymentResult =
      terminalStatus && this.dependencies.paymentResults
        ? await this.dependencies.paymentResults.findByPaymentStatus(
            payment.id,
            terminalStatus,
          )
        : null;
    if (
      paymentResult &&
      (paymentResult.paymentId !== payment.id ||
        paymentResult.orderReference !== order.id ||
        paymentResult.paymentStatus !== payment.status)
    ) {
      await recordAudit(this.dependencies.audit, {
        action: "checkout.status",
        result: "failure",
        reason: "inconsistent_verified_result",
        correlationId,
        actorSubject: access.actorSubject,
        destinationId: access.destinationId,
        tenantId: access.tenantId,
        orderId,
      });
      return errorResponse(503, "CHECKOUT_UNAVAILABLE", correlationId);
    }
    const approved =
      paymentResult?.kind === "approved" &&
      paymentResult.paymentStatus === "confirmed";
    const failed = paymentResult && !approved ? paymentResult : null;
    const verifiedPayment = approved
      ? Object.freeze({
          verified: true as const,
          sessionId: order.source.reference,
          reference: paymentResult.paymentReference ?? payment.id,
          definitiveBusinessId: null,
          activationStatus: "READY_TO_CONVERT" as const,
          resultId: paymentResult.resultId,
        })
      : null;
    const verifiedFailure = failed
      ? Object.freeze({
          verified: true as const,
          sessionId: order.source.reference,
          reason: failed.kind,
          resultId: failed.resultId,
        })
      : null;

    await recordAudit(this.dependencies.audit, {
      action: "checkout.status",
      result: "success",
      reason: "projected",
      correlationId,
      actorSubject: access.actorSubject,
      destinationId: access.destinationId,
      tenantId: access.tenantId,
      orderId,
    });
    return response(
      200,
      {
        data: Object.freeze({
          checkoutId: order.id,
          sessionId: order.source.reference,
          status: publicPaymentStatus(payment, order),
          paymentReference:
            payment.status === "confirmed" || payment.status === "refunded"
              ? payment.providerReference
              : null,
          activationStatus: approved ? "READY_TO_CONVERT" : null,
          definitiveBusinessId: null,
          verifiedPayment,
          verifiedFailure,
        }),
      },
      correlationId,
    );
  }
}
