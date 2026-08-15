import {
  createRefundIdempotencyKey,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type PaymentId,
} from "@touristic/financial";

import {
  RefundApplicationError,
  type RefundApplicationService,
} from "./refund-application-service.js";

export const refundHttpPrefix = "/api/payments/v1/payments";

export interface RefundHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
  readonly clientIp?: string;
  readonly correlationId?: string;
}

export interface RefundHttpResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
}

export type RefundHttpAuthorizationDenialReason =
  | "authentication_required"
  | "business_access_denied"
  | "read_only_role"
  | "cross_origin_request"
  | "invalid_csrf"
  | "missing_context";

export interface RefundHttpAuthorizationContext {
  readonly actorSubject: string;
  readonly tenantId: string;
}

export type RefundHttpAuthorizationDecision =
  | {
      readonly allowed: true;
      readonly context: RefundHttpAuthorizationContext;
    }
  | {
      readonly allowed: false;
      readonly reason: RefundHttpAuthorizationDenialReason;
    };

export interface RefundHttpAuthorizationPort {
  authorizeRefund(
    request: RefundHttpRequest,
    paymentId: PaymentId,
  ): Promise<RefundHttpAuthorizationDecision>;
}

export interface RefundHttpRateLimitPort {
  consume(input: {
    readonly bucket: "refund-create";
    readonly key: string;
    readonly limit: number;
    readonly windowMs: number;
    readonly nowMs: number;
  }): Promise<{
    readonly allowed: boolean;
    readonly retryAfterSeconds: number;
  }>;
}

export interface RefundHttpAuditPort {
  record(event: {
    readonly action: "payment.refund";
    readonly result: "success" | "denied" | "failure";
    readonly reason: string;
    readonly correlationId: string;
    readonly actorSubject: string | null;
    readonly tenantId: string | null;
    readonly paymentId: string | null;
  }): Promise<void>;
}

export interface RefundHttpTransportDependencies {
  readonly application: RefundApplicationService;
  readonly authorization: RefundHttpAuthorizationPort;
  readonly rateLimits: RefundHttpRateLimitPort;
  readonly audit: RefundHttpAuditPort;
  readonly clock: { now(): unknown };
}

const refundRateLimit = 6;
const rateWindowMs = 60_000;
const correlationIdPattern = /^[A-Za-z0-9_-]{8,128}$/u;

function firstHeader(value: unknown): string {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(request: RefundHttpRequest, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === target) return firstHeader(value);
  }
  return "";
}

function route(pathname: string): PaymentId | null {
  if (!pathname.startsWith(refundHttpPrefix + "/")) return null;
  const parts = pathname
    .slice(refundHttpPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  return parts.length === 2 && parts[1] === "refunds"
    ? normalizePaymentId(parts[0])
    : null;
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
  correlationId: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): RefundHttpResponse {
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
  extraHeaders?: Readonly<Record<string, string>>,
): RefundHttpResponse {
  return response(status, { error }, correlationId, extraHeaders);
}

function normalizeContext(
  value: RefundHttpAuthorizationContext,
): RefundHttpAuthorizationContext | null {
  const actorSubject = value.actorSubject?.trim();
  const tenantId = value.tenantId?.trim();
  if (
    !actorSubject ||
    actorSubject.length > 200 ||
    !tenantId ||
    tenantId.length > 160
  ) {
    return null;
  }
  return Object.freeze({ actorSubject, tenantId });
}

function normalizeCorrelationId(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return correlationIdPattern.test(normalized) ? normalized : null;
}

function canonicalNow(clock: { now(): unknown }): string {
  const normalized = normalizeFinancialTimestamp(clock.now());
  if (!normalized) throw new Error("REFUND_HTTP_INVALID_CLOCK");
  return new Date(normalized).toISOString();
}

function clientKey(request: RefundHttpRequest): string {
  const value =
    typeof request.clientIp === "string"
      ? request.clientIp.trim().slice(0, 100)
      : "";
  return value || "unknown";
}

function validBody(body: unknown): boolean {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    return false;
  }
  const record = body as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    record.reason === "requested_by_business"
  );
}

function authorizationError(
  reason: RefundHttpAuthorizationDenialReason,
  correlationId: string,
): RefundHttpResponse {
  if (reason === "authentication_required") {
    return errorResponse(401, "AUTH_REQUIRED", correlationId);
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
  if (reason === "missing_context") {
    return errorResponse(400, "REFUND_CONTEXT_REQUIRED", correlationId);
  }
  return errorResponse(403, "BUSINESS_ACCESS_DENIED", correlationId);
}

function applicationError(
  error: RefundApplicationError,
  correlationId: string,
): RefundHttpResponse {
  if (error.code === "REFUND_PAYMENT_NOT_FOUND") {
    return errorResponse(404, "PAYMENT_NOT_FOUND", correlationId);
  }
  if (error.code === "REFUND_NOT_ALLOWED") {
    return errorResponse(409, "REFUND_NOT_ALLOWED", correlationId);
  }
  if (error.code === "REFUND_REQUEST_CONFLICT") {
    return errorResponse(409, "REFUND_CONFLICT", correlationId);
  }
  if (
    error.code === "REFUND_APPROVAL_RESULT_MISSING" ||
    error.code === "REFUND_APPROVAL_LEDGER_MISSING" ||
    error.code === "REFUND_PROVIDER_REFERENCE_MISSING"
  ) {
    return errorResponse(409, "REFUND_NOT_READY", correlationId);
  }
  return errorResponse(503, "REFUND_UNAVAILABLE", correlationId);
}

export class RefundHttpTransport {
  constructor(private readonly dependencies: RefundHttpTransportDependencies) {}

  matches(pathname: string): boolean {
    return route(pathname) !== null;
  }

  async handle(request: RefundHttpRequest): Promise<RefundHttpResponse> {
    const correlationId = normalizeCorrelationId(
      request.correlationId ?? header(request, "x-correlation-id"),
    );
    if (!correlationId) {
      return errorResponse(400, "CORRELATION_ID_REQUIRED", "corr_invalid");
    }
    const paymentId = route(request.pathname);
    if (!paymentId) {
      return errorResponse(404, "NOT_FOUND", correlationId);
    }
    if (request.method.toUpperCase() !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", correlationId);
    }

    try {
      return await this.create(request, paymentId, correlationId);
    } catch {
      return errorResponse(503, "REFUND_UNAVAILABLE", correlationId);
    }
  }

  private async create(
    request: RefundHttpRequest,
    paymentId: PaymentId,
    correlationId: string,
  ): Promise<RefundHttpResponse> {
    if (!validBody(request.body)) {
      return errorResponse(400, "INVALID_REFUND_REQUEST", correlationId);
    }
    const expectedIdempotency = createRefundIdempotencyKey(paymentId);
    const providedIdempotency = header(request, "idempotency-key");
    if (!providedIdempotency) {
      return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", correlationId);
    }
    if (!expectedIdempotency || providedIdempotency !== expectedIdempotency) {
      return errorResponse(409, "IDEMPOTENCY_KEY_MISMATCH", correlationId);
    }

    const authorization = await this.dependencies.authorization.authorizeRefund(
      request,
      paymentId,
    );
    if (!authorization.allowed) {
      await this.dependencies.audit.record({
        action: "payment.refund",
        result: "denied",
        reason: authorization.reason,
        correlationId,
        actorSubject: null,
        tenantId: null,
        paymentId,
      });
      return authorizationError(authorization.reason, correlationId);
    }
    const context = normalizeContext(authorization.context);
    if (!context) {
      return authorizationError("missing_context", correlationId);
    }

    const now = canonicalNow(this.dependencies.clock);
    const rate = await this.dependencies.rateLimits.consume({
      bucket: "refund-create",
      key:
        context.actorSubject +
        ":" +
        context.tenantId +
        ":" +
        clientKey(request),
      limit: refundRateLimit,
      windowMs: rateWindowMs,
      nowMs: Date.parse(now),
    });
    if (!rate.allowed) {
      await this.dependencies.audit.record({
        action: "payment.refund",
        result: "denied",
        reason: "rate_limited",
        correlationId,
        actorSubject: context.actorSubject,
        tenantId: context.tenantId,
        paymentId,
      });
      return errorResponse(429, "RATE_LIMITED", correlationId, {
        "Retry-After": String(rate.retryAfterSeconds),
      });
    }

    try {
      const result =
        await this.dependencies.application.requestFullRefund(paymentId);
      await this.dependencies.audit.record({
        action: "payment.refund",
        result: "success",
        reason: result.replayed ? "replayed" : "provider_accepted",
        correlationId,
        actorSubject: context.actorSubject,
        tenantId: context.tenantId,
        paymentId,
      });
      return response(
        result.status === "COMPLETED" ? 200 : 202,
        {
          data: Object.freeze({
            refundId: result.request.id,
            paymentId,
            status: result.status,
            replayed: result.replayed,
          }),
        },
        correlationId,
      );
    } catch (error) {
      await this.dependencies.audit.record({
        action: "payment.refund",
        result: "failure",
        reason:
          error instanceof RefundApplicationError
            ? error.code
            : "internal_failure",
        correlationId,
        actorSubject: context.actorSubject,
        tenantId: context.tenantId,
        paymentId,
      });
      return error instanceof RefundApplicationError
        ? applicationError(error, correlationId)
        : errorResponse(503, "REFUND_UNAVAILABLE", correlationId);
    }
  }
}
