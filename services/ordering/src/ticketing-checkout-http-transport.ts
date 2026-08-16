import { createHash } from "node:crypto";

import {
  createCheckoutProviderRequest,
  normalizeCheckoutProviderSession,
  normalizeFinancialTimestamp,
  type FinancialCheckoutProviderPort,
} from "@touristic/financial";
import { createTicketingOrderRequestKey } from "@touristic/ordering";
import {
  normalizeTicketingCheckoutHandoff,
  type TicketingCheckoutApplicationRequest,
  type TicketingCheckoutApplicationService,
  type ValidatedTicketingCheckoutHandoff,
} from "@touristic/ordering/ticketing-checkout";

import {
  createCheckoutAccessRecord,
  sameCheckoutAccessAuthority,
  type CheckoutAccessRecord,
  type CheckoutAccessRepositoryPort,
} from "./checkout-access.js";
import type {
  CheckoutHttpAuditPort,
  CheckoutHttpAuthorizationDecision,
  CheckoutHttpRateLimitPort,
  CheckoutHttpRequest,
  CheckoutHttpResponse,
} from "./checkout-http-transport.js";
import {
  normalizeCheckoutCorrelationId,
  normalizeCheckoutRequestContext,
  type CheckoutRequestContext,
  type CheckoutReturnUrlPolicy,
  type CheckoutStatusCapability,
} from "./checkout-security.js";

export const ticketingCheckoutPath =
  "/api/payments/v1/checkouts/ticketing-reservations";
const createRateLimit = 12;
const rateWindowMs = 60_000;

export interface TicketingCheckoutHttpAuthorizationPort {
  authorizeCreate(
    request: CheckoutHttpRequest,
    handoff: ValidatedTicketingCheckoutHandoff,
  ): Promise<CheckoutHttpAuthorizationDecision>;
}

export interface TicketingCheckoutHttpTransportDependencies {
  readonly application: TicketingCheckoutApplicationService;
  readonly access: CheckoutAccessRepositoryPort;
  readonly provider: FinancialCheckoutProviderPort;
  readonly webhookUrl: string;
  readonly authorization: TicketingCheckoutHttpAuthorizationPort;
  readonly returnUrls: CheckoutReturnUrlPolicy;
  readonly statusCapabilities: CheckoutStatusCapability;
  readonly rateLimits: CheckoutHttpRateLimitPort;
  readonly audit: CheckoutHttpAuditPort;
  readonly clock: { now(): unknown };
  readonly statusTtlSeconds?: number;
}

function firstHeader(value: unknown): string {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(request: CheckoutHttpRequest, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
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
  extraHeaders: Readonly<Record<string, string>> = {},
): CheckoutHttpResponse {
  return response(status, { error }, correlationId, extraHeaders);
}

function canonicalNow(clock: { now(): unknown }): string {
  const value = normalizeFinancialTimestamp(clock.now());
  if (!value) throw new Error("CHECKOUT_HTTP_INVALID_CLOCK");
  return new Date(value).toISOString();
}

function fingerprint(
  handoff: ValidatedTicketingCheckoutHandoff,
  context: CheckoutRequestContext,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        reservationReference: handoff.reservationReference,
        customer: handoff.customer,
        returnUrl: handoff.returnUrl,
        requesterKind: context.requesterKind,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
      }),
    )
    .digest("hex");
}

function clientKey(request: CheckoutHttpRequest): string {
  const value =
    typeof request.clientIp === "string" ? request.clientIp.trim().slice(0, 100) : "";
  return value || "unknown";
}

function accessMatches(
  access: CheckoutAccessRecord,
  paymentId: string,
  requestFingerprint: string,
  context: CheckoutRequestContext,
  tokenHash: string,
): boolean {
  const proposed = createCheckoutAccessRecord({
    orderId: access.orderId,
    paymentId,
    requestFingerprint,
    tokenHash,
    context,
    correlationId: access.correlationId,
    createdAt: access.createdAt,
    expiresAt: access.expiresAt,
  });
  return Boolean(proposed && sameCheckoutAccessAuthority(access, proposed));
}

function authorizationError(
  reason: string,
  correlationId: string,
): CheckoutHttpResponse {
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
  return errorResponse(403, "TICKETING_ACCESS_DENIED", correlationId);
}

export class TicketingCheckoutHttpTransport {
  private readonly statusTtlSeconds: number;

  constructor(
    private readonly dependencies: TicketingCheckoutHttpTransportDependencies,
  ) {
    const ttl = dependencies.statusTtlSeconds ?? 24 * 60 * 60;
    if (!Number.isSafeInteger(ttl) || ttl < 10 * 60 || ttl > 7 * 24 * 60 * 60) {
      throw new Error("CHECKOUT_STATUS_TTL_INVALID");
    }
    this.statusTtlSeconds = ttl;
  }

  matches(pathname: string): boolean {
    return pathname === ticketingCheckoutPath;
  }

  async handle(request: CheckoutHttpRequest): Promise<CheckoutHttpResponse> {
    const correlationId = normalizeCheckoutCorrelationId(
      request.correlationId ?? header(request, "x-correlation-id"),
    );
    if (!correlationId) {
      return errorResponse(400, "CORRELATION_ID_REQUIRED", "corr_invalid");
    }
    if (request.pathname !== ticketingCheckoutPath) {
      return errorResponse(404, "NOT_FOUND", correlationId);
    }
    if (request.method.toUpperCase() !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", correlationId);
    }

    const handoff = normalizeTicketingCheckoutHandoff(
      request.body as TicketingCheckoutApplicationRequest,
    );
    if (!handoff) {
      return errorResponse(400, "INVALID_CHECKOUT_REQUEST", correlationId);
    }
    const expectedIdempotency = createTicketingOrderRequestKey(
      handoff.reservationReference,
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
      return authorizationError(authorization.reason, correlationId);
    }
    const context = normalizeCheckoutRequestContext(authorization.context);
    if (!context) return errorResponse(400, "CHECKOUT_CONTEXT_REQUIRED", correlationId);
    if (!this.dependencies.returnUrls.allows(handoff.returnUrl, context)) {
      return errorResponse(400, "RETURN_URL_DENIED", correlationId);
    }

    const now = canonicalNow(this.dependencies.clock);
    const rate = await this.dependencies.rateLimits.consume({
      bucket: "checkout-create",
      key: `${context.actorSubject}:${context.destinationId}:${clientKey(request)}`,
      limit: createRateLimit,
      windowMs: rateWindowMs,
      nowMs: Date.parse(now),
    });
    if (!rate.allowed) {
      return errorResponse(429, "RATE_LIMITED", correlationId, {
        "Retry-After": String(rate.retryAfterSeconds),
      });
    }

    try {
      const result = await this.dependencies.application.startCheckout(handoff);
      const requestFingerprint = fingerprint(handoff, context);
      const capability = this.dependencies.statusCapabilities.issue(result.order.id);
      const existing = await this.dependencies.access.findByOrderId(result.order.id);
      let replayed = result.replayed;
      let access: CheckoutAccessRecord;
      if (existing) {
        if (
          !accessMatches(
            existing,
            result.payment.id,
            requestFingerprint,
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
          requestFingerprint,
          tokenHash: capability.tokenHash,
          context,
          correlationId,
          createdAt: now,
          expiresAt,
        });
        if (!proposed) throw new Error("ORDERING_INVALID_CHECKOUT_ACCESS");
        access = await this.dependencies.access.claim(proposed);
        if (
          !accessMatches(
            access,
            result.payment.id,
            requestFingerprint,
            context,
            capability.tokenHash,
          )
        ) {
          throw new Error("ORDERING_CHECKOUT_ACCESS_CONFLICT");
        }
      }

      const providerRequest = createCheckoutProviderRequest({
        paymentId: result.payment.id,
        idempotencyKey: result.payment.idempotencyKey,
        amount: result.payment.amount,
        description: result.order.pricing.planName,
        returnUrl: handoff.returnUrl,
        webhookUrl: this.dependencies.webhookUrl,
        customer: handoff.customer,
        metadata: {
          orderId: result.order.id,
          paymentId: result.payment.id,
          reservationReference: handoff.reservationReference,
          destinationId: context.destinationId,
          ...(context.tenantId ? { tenantId: context.tenantId } : {}),
        },
      });
      if (!providerRequest) throw new Error("CHECKOUT_PROVIDER_REQUEST_INVALID");
      const providerSession = normalizeCheckoutProviderSession(
        await this.dependencies.provider.createCheckout(providerRequest),
      );
      if (!providerSession) throw new Error("CHECKOUT_PROVIDER_SESSION_INVALID");

      await this.dependencies.audit.record({
        action: "checkout.create",
        result: "success",
        reason: replayed ? "ticketing_replayed" : "ticketing_created",
        correlationId,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
        orderId: result.order.id,
      });
      return response(replayed ? 200 : 201, {
        data: Object.freeze({
          checkoutId: result.order.id,
          paymentId: result.payment.id,
          status: result.payment.status === "confirmed" ? "CONFIRMED" : "PENDING",
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
      }, correlationId);
    } catch {
      await this.dependencies.audit.record({
        action: "checkout.create",
        result: "failure",
        reason: "ticketing_checkout_failure",
        correlationId,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
        orderId: null,
      });
      return errorResponse(503, "CHECKOUT_UNAVAILABLE", correlationId);
    }
  }
}
