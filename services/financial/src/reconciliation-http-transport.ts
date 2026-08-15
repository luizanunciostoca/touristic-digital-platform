import {
  normalizePaymentId,
  normalizeReconciliationFindingId,
  normalizeReconciliationRunId,
  type PaymentId,
  type ReconciliationFinding,
  type ReconciliationFindingId,
} from "@touristic/financial";

import {
  ReconciliationApplicationError,
  type ReconciliationApplicationService,
} from "./reconciliation-application-service.js";

export const reconciliationHttpPrefix = "/api/payments/v1/reconciliation";

export interface ReconciliationHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
  readonly clientIp?: string;
  readonly correlationId?: string;
}

export interface ReconciliationHttpResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
}

export type ReconciliationHttpAction =
  "reconciliation.run" | "reconciliation.read" | "reconciliation.acknowledge";

export type ReconciliationHttpAuthorizationDecision =
  | {
      readonly allowed: true;
      readonly actorSubject: string;
    }
  | {
      readonly allowed: false;
      readonly reason:
        | "authentication_required"
        | "admin_required"
        | "invalid_csrf"
        | "cross_origin_request";
    };

export interface ReconciliationHttpAuthorizationPort {
  authorize(
    request: ReconciliationHttpRequest,
    action: ReconciliationHttpAction,
  ): Promise<ReconciliationHttpAuthorizationDecision>;
}

export interface ReconciliationHttpRateLimitPort {
  consume(input: {
    readonly bucket:
      "reconciliation-run" | "reconciliation-read" | "reconciliation-ack";
    readonly key: string;
    readonly limit: number;
    readonly windowMs: number;
    readonly nowMs: number;
  }): Promise<{
    readonly allowed: boolean;
    readonly retryAfterSeconds: number;
  }>;
}

export interface ReconciliationHttpAuditPort {
  record(event: {
    readonly action: ReconciliationHttpAction;
    readonly result: "success" | "denied" | "failure";
    readonly reason: string;
    readonly correlationId: string;
    readonly actorSubject: string | null;
    readonly resourceId: string | null;
  }): Promise<void>;
}

export interface ReconciliationHttpTransportDependencies {
  readonly application: ReconciliationApplicationService;
  readonly authorization: ReconciliationHttpAuthorizationPort;
  readonly rateLimits: ReconciliationHttpRateLimitPort;
  readonly audit: ReconciliationHttpAuditPort;
  readonly clock: { now(): string };
}

type Route =
  | { readonly kind: "run"; readonly paymentId: PaymentId }
  | { readonly kind: "list"; readonly paymentId: PaymentId }
  | {
      readonly kind: "acknowledge";
      readonly findingId: ReconciliationFindingId;
    };

const correlationIdPattern = /^[A-Za-z0-9_-]{8,128}$/u;
const windowMs = 60_000;

function firstHeader(value: unknown): string {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(request: ReconciliationHttpRequest, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === target) return firstHeader(value);
  }
  return "";
}

function route(pathname: string): Route | null {
  if (!pathname.startsWith(reconciliationHttpPrefix + "/")) return null;
  const parts = pathname.slice(reconciliationHttpPrefix.length + 1).split("/");
  if (parts.length === 3 && parts[0] === "payments" && parts[2] === "runs") {
    const paymentId = normalizePaymentId(parts[1]);
    return paymentId ? { kind: "run", paymentId } : null;
  }
  if (
    parts.length === 3 &&
    parts[0] === "payments" &&
    parts[2] === "findings"
  ) {
    const paymentId = normalizePaymentId(parts[1]);
    return paymentId ? { kind: "list", paymentId } : null;
  }
  if (
    parts.length === 3 &&
    parts[0] === "findings" &&
    parts[2] === "acknowledgements"
  ) {
    const findingId = normalizeReconciliationFindingId(parts[1]);
    return findingId ? { kind: "acknowledge", findingId } : null;
  }
  return null;
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
  correlationId: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): ReconciliationHttpResponse {
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
): ReconciliationHttpResponse {
  return response(status, { error }, correlationId, extraHeaders);
}

function normalizeCorrelationId(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return correlationIdPattern.test(normalized) ? normalized : null;
}

function bodyRecord(body: unknown): Record<string, unknown> | null {
  return body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.getPrototypeOf(body) === Object.prototype
    ? (body as Record<string, unknown>)
    : null;
}

function clientKey(request: ReconciliationHttpRequest): string {
  const value =
    typeof request.clientIp === "string"
      ? request.clientIp.trim().slice(0, 100)
      : "";
  return value || "unknown";
}

function findingProjection(finding: ReconciliationFinding) {
  return Object.freeze({
    id: finding.id,
    paymentId: finding.paymentId,
    kind: finding.kind,
    severity: finding.severity,
    state: finding.state,
    expected: finding.expected,
    observed: finding.observed,
    firstSeenAt: finding.firstSeenAt,
    lastSeenAt: finding.lastSeenAt,
    acknowledgedAt: finding.acknowledgedAt,
    acknowledgedBy: finding.acknowledgedBy,
    resolvedAt: finding.resolvedAt,
  });
}

function authorizationError(
  decision: Exclude<
    ReconciliationHttpAuthorizationDecision,
    { readonly allowed: true }
  >,
  correlationId: string,
): ReconciliationHttpResponse {
  if (decision.reason === "authentication_required") {
    return errorResponse(401, "AUTH_REQUIRED", correlationId);
  }
  if (decision.reason === "invalid_csrf") {
    return errorResponse(403, "INVALID_CSRF", correlationId);
  }
  if (decision.reason === "cross_origin_request") {
    return errorResponse(403, "ORIGIN_DENIED", correlationId);
  }
  return errorResponse(403, "ADMIN_REQUIRED", correlationId);
}

function applicationError(
  error: ReconciliationApplicationError,
  correlationId: string,
): ReconciliationHttpResponse {
  if (error.code === "RECONCILIATION_PAYMENT_NOT_FOUND") {
    return errorResponse(404, "PAYMENT_NOT_FOUND", correlationId);
  }
  if (error.code === "RECONCILIATION_RUN_INVALID") {
    return errorResponse(400, "INVALID_RECONCILIATION_RUN", correlationId);
  }
  if (error.code === "RECONCILIATION_PROVIDER_INVALID_RESPONSE") {
    return errorResponse(502, "PROVIDER_INVALID_RESPONSE", correlationId);
  }
  if (error.code === "RECONCILIATION_PROVIDER_REFERENCE_MISSING") {
    return errorResponse(409, "PAYMENT_NOT_RECONCILABLE", correlationId);
  }
  return errorResponse(400, "INVALID_RECONCILIATION_FINDING", correlationId);
}

export class ReconciliationHttpTransport {
  constructor(
    private readonly dependencies: ReconciliationHttpTransportDependencies,
  ) {}

  matches(pathname: string): boolean {
    return route(pathname) !== null;
  }

  async handle(
    request: ReconciliationHttpRequest,
  ): Promise<ReconciliationHttpResponse> {
    const correlationId = normalizeCorrelationId(
      request.correlationId ?? header(request, "x-correlation-id"),
    );
    if (!correlationId) {
      return errorResponse(400, "CORRELATION_ID_REQUIRED", "corr_invalid");
    }
    const matched = route(request.pathname);
    if (!matched) return errorResponse(404, "NOT_FOUND", correlationId);

    const method = request.method.toUpperCase();
    if (matched.kind === "list" && method === "GET") {
      return this.list(request, matched.paymentId, correlationId);
    }
    if (matched.kind === "run" && method === "POST") {
      return this.run(request, matched.paymentId, correlationId);
    }
    if (matched.kind === "acknowledge" && method === "POST") {
      return this.acknowledge(request, matched.findingId, correlationId);
    }
    return errorResponse(405, "METHOD_NOT_ALLOWED", correlationId);
  }

  private async authorize(
    request: ReconciliationHttpRequest,
    action: ReconciliationHttpAction,
    resourceId: string,
    correlationId: string,
  ): Promise<
    | { readonly actorSubject: string }
    | { readonly response: ReconciliationHttpResponse }
  > {
    const decision = await this.dependencies.authorization.authorize(
      request,
      action,
    );
    if (!decision.allowed) {
      await this.dependencies.audit.record({
        action,
        result: "denied",
        reason: decision.reason,
        correlationId,
        actorSubject: null,
        resourceId,
      });
      return { response: authorizationError(decision, correlationId) };
    }
    const actorSubject = decision.actorSubject.trim();
    if (!actorSubject || actorSubject.length > 200) {
      await this.dependencies.audit.record({
        action,
        result: "denied",
        reason: "invalid_actor_subject",
        correlationId,
        actorSubject: null,
        resourceId,
      });
      return {
        response: errorResponse(403, "ADMIN_REQUIRED", correlationId),
      };
    }
    return { actorSubject };
  }

  private async rate(
    request: ReconciliationHttpRequest,
    bucket: "reconciliation-run" | "reconciliation-read" | "reconciliation-ack",
    action: ReconciliationHttpAction,
    actorSubject: string,
    resourceId: string,
    correlationId: string,
  ): Promise<ReconciliationHttpResponse | null> {
    const now = Date.parse(this.dependencies.clock.now());
    if (!Number.isFinite(now)) {
      await this.dependencies.audit.record({
        action,
        result: "failure",
        reason: "clock_invalid",
        correlationId,
        actorSubject,
        resourceId,
      });
      return errorResponse(503, "RECONCILIATION_UNAVAILABLE", correlationId);
    }
    try {
      const decision = await this.dependencies.rateLimits.consume({
        bucket,
        key: actorSubject + ":" + clientKey(request),
        limit: bucket === "reconciliation-read" ? 60 : 20,
        windowMs,
        nowMs: now,
      });
      if (decision.allowed) return null;
      await this.dependencies.audit.record({
        action,
        result: "denied",
        reason: "rate_limited",
        correlationId,
        actorSubject,
        resourceId,
      });
      return errorResponse(429, "RATE_LIMITED", correlationId, {
        "Retry-After": String(decision.retryAfterSeconds),
      });
    } catch {
      await this.dependencies.audit.record({
        action,
        result: "failure",
        reason: "rate_limit_failure",
        correlationId,
        actorSubject,
        resourceId,
      });
      return errorResponse(503, "RECONCILIATION_UNAVAILABLE", correlationId);
    }
  }

  private async run(
    request: ReconciliationHttpRequest,
    paymentId: PaymentId,
    correlationId: string,
  ): Promise<ReconciliationHttpResponse> {
    const body = bodyRecord(request.body);
    const runId =
      body && Object.keys(body).length === 1
        ? normalizeReconciliationRunId(body.runId)
        : null;
    if (!runId) {
      return errorResponse(400, "INVALID_RECONCILIATION_RUN", correlationId);
    }
    if (header(request, "idempotency-key") !== "reconciliation:v1:" + runId) {
      return errorResponse(409, "IDEMPOTENCY_KEY_MISMATCH", correlationId);
    }
    const authorized = await this.authorize(
      request,
      "reconciliation.run",
      paymentId,
      correlationId,
    );
    if ("response" in authorized) return authorized.response;
    const limited = await this.rate(
      request,
      "reconciliation-run",
      "reconciliation.run",
      authorized.actorSubject,
      paymentId,
      correlationId,
    );
    if (limited) return limited;

    try {
      const result = await this.dependencies.application.reconcilePayment(
        paymentId,
        runId,
      );
      await this.dependencies.audit.record({
        action: "reconciliation.run",
        result: "success",
        reason: result.replayed ? "replayed" : "recorded",
        correlationId,
        actorSubject: authorized.actorSubject,
        resourceId: paymentId,
      });
      return response(
        result.replayed ? 200 : 201,
        {
          data: Object.freeze({
            runId: result.run.id,
            paymentId,
            observedAt: result.run.observedAt,
            recordedAt: result.run.recordedAt,
            findingCount: result.run.findingCount,
            findings: Object.freeze(result.findings.map(findingProjection)),
            replayed: result.replayed,
          }),
        },
        correlationId,
      );
    } catch (error) {
      await this.dependencies.audit.record({
        action: "reconciliation.run",
        result: "failure",
        reason:
          error instanceof ReconciliationApplicationError
            ? error.code
            : "internal_failure",
        correlationId,
        actorSubject: authorized.actorSubject,
        resourceId: paymentId,
      });
      return error instanceof ReconciliationApplicationError
        ? applicationError(error, correlationId)
        : errorResponse(503, "RECONCILIATION_UNAVAILABLE", correlationId);
    }
  }

  private async list(
    request: ReconciliationHttpRequest,
    paymentId: PaymentId,
    correlationId: string,
  ): Promise<ReconciliationHttpResponse> {
    const authorized = await this.authorize(
      request,
      "reconciliation.read",
      paymentId,
      correlationId,
    );
    if ("response" in authorized) return authorized.response;
    const limited = await this.rate(
      request,
      "reconciliation-read",
      "reconciliation.read",
      authorized.actorSubject,
      paymentId,
      correlationId,
    );
    if (limited) return limited;
    try {
      const findings =
        await this.dependencies.application.listOpenFindings(paymentId);
      await this.dependencies.audit.record({
        action: "reconciliation.read",
        result: "success",
        reason: "listed",
        correlationId,
        actorSubject: authorized.actorSubject,
        resourceId: paymentId,
      });
      return response(
        200,
        {
          data: Object.freeze({
            paymentId,
            findings: Object.freeze(findings.map(findingProjection)),
          }),
        },
        correlationId,
      );
    } catch (error) {
      await this.dependencies.audit.record({
        action: "reconciliation.read",
        result: "failure",
        reason:
          error instanceof ReconciliationApplicationError
            ? error.code
            : "internal_failure",
        correlationId,
        actorSubject: authorized.actorSubject,
        resourceId: paymentId,
      });
      return error instanceof ReconciliationApplicationError
        ? applicationError(error, correlationId)
        : errorResponse(503, "RECONCILIATION_UNAVAILABLE", correlationId);
    }
  }

  private async acknowledge(
    request: ReconciliationHttpRequest,
    findingId: ReconciliationFindingId,
    correlationId: string,
  ): Promise<ReconciliationHttpResponse> {
    const body = bodyRecord(request.body);
    if (!body || Object.keys(body).length !== 0) {
      return errorResponse(
        400,
        "INVALID_RECONCILIATION_ACKNOWLEDGEMENT",
        correlationId,
      );
    }
    if (
      header(request, "idempotency-key") !==
      "reconciliation-ack:v1:" + findingId
    ) {
      return errorResponse(409, "IDEMPOTENCY_KEY_MISMATCH", correlationId);
    }
    const authorized = await this.authorize(
      request,
      "reconciliation.acknowledge",
      findingId,
      correlationId,
    );
    if ("response" in authorized) return authorized.response;
    const limited = await this.rate(
      request,
      "reconciliation-ack",
      "reconciliation.acknowledge",
      authorized.actorSubject,
      findingId,
      correlationId,
    );
    if (limited) return limited;
    try {
      const finding = await this.dependencies.application.acknowledgeFinding(
        findingId,
        authorized.actorSubject,
      );
      await this.dependencies.audit.record({
        action: "reconciliation.acknowledge",
        result: "success",
        reason:
          finding.acknowledgedBy === authorized.actorSubject
            ? "acknowledged_or_replayed"
            : "already_acknowledged",
        correlationId,
        actorSubject: authorized.actorSubject,
        resourceId: findingId,
      });
      return response(
        200,
        {
          data: findingProjection(finding),
        },
        correlationId,
      );
    } catch (error) {
      await this.dependencies.audit.record({
        action: "reconciliation.acknowledge",
        result: "failure",
        reason:
          error instanceof ReconciliationApplicationError
            ? error.code
            : "internal_failure",
        correlationId,
        actorSubject: authorized.actorSubject,
        resourceId: findingId,
      });
      return error instanceof ReconciliationApplicationError
        ? applicationError(error, correlationId)
        : errorResponse(503, "RECONCILIATION_UNAVAILABLE", correlationId);
    }
  }
}
