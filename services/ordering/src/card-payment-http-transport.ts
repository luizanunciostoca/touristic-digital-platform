import {
  createCardPaymentIdempotencyKey,
  createCardPaymentProviderRequest,
  type FinancialCardPaymentProviderPort,
} from "@touristic/financial/card-payment";
import {
  normalizeFinancialTimestamp,
  type Payment,
  type PaymentRepositoryPort,
} from "@touristic/financial";
import {
  normalizeOrderId,
  type Order,
  type OrderRepositoryPort,
} from "@touristic/ordering";

import type { CheckoutAccessRepositoryPort } from "./checkout-access.js";
import type {
  CheckoutHttpRateLimitPort,
  CheckoutHttpRequest,
  CheckoutHttpResponse,
} from "./checkout-http-transport.js";
import {
  normalizeCheckoutCorrelationId,
  type CheckoutStatusCapability,
} from "./checkout-security.js";

export const cardPaymentHttpPrefix = "/api/payments/v1/checkouts";
const cardSubmitRateLimit = 8;
const rateWindowMs = 60_000;

export interface CardPaymentHttpAuditEvent {
  readonly action: "checkout.card_submit";
  readonly result: "success" | "denied" | "failure";
  readonly reason: string;
  readonly correlationId: string;
  readonly actorSubject: string | null;
  readonly destinationId: string | null;
  readonly tenantId: string | null;
  readonly orderId: string | null;
  readonly paymentId: string | null;
}

export interface CardPaymentHttpAuditPort {
  record(event: CardPaymentHttpAuditEvent): Promise<void>;
}

export interface CardPaymentHttpClockPort {
  now(): unknown;
}

export interface CardPaymentHttpTransportDependencies {
  readonly orders: OrderRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly access: CheckoutAccessRepositoryPort;
  readonly statusCapabilities: CheckoutStatusCapability;
  readonly rateLimits: CheckoutHttpRateLimitPort;
  readonly provider: FinancialCardPaymentProviderPort;
  readonly audit: CardPaymentHttpAuditPort;
  readonly clock: CardPaymentHttpClockPort;
  readonly webhookUrl: string;
}

interface CardSubmissionInput {
  readonly token: string;
  readonly installments: number;
  readonly paymentMethodId: string;
  readonly issuerId: string | null;
  readonly email: string;
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
  headers?: Readonly<Record<string, string>>,
): CheckoutHttpResponse {
  return response(status, { error }, correlationId, headers);
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

function clientKey(request: CheckoutHttpRequest): string {
  const value =
    typeof request.clientIp === "string"
      ? request.clientIp.trim().slice(0, 100)
      : "";
  return value || "unknown";
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

function canonicalNow(clock: CardPaymentHttpClockPort): string {
  const normalized = normalizeFinancialTimestamp(clock.now());
  if (!normalized) throw new Error("CARD_PAYMENT_HTTP_INVALID_CLOCK");
  return new Date(normalized).toISOString();
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return "";
  const hasControl = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  return hasControl ? "" : normalized;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedCardSubmission(body: unknown): CardSubmissionInput | null {
  const input = record(body);
  if (!input) return null;
  const payer = record(input.payer);
  const token = boundedText(input.token, 512);
  const paymentMethodId = boundedText(
    input.payment_method_id ?? input.paymentMethodId,
    80,
  );
  const issuerRaw = input.issuer_id ?? input.issuerId;
  const issuerId =
    issuerRaw === null || issuerRaw === undefined || issuerRaw === ""
      ? null
      : boundedText(issuerRaw, 80);
  const email = boundedText(payer?.email ?? input.email, 200).toLowerCase();
  const installments = input.installments;
  if (
    !token ||
    !paymentMethodId ||
    (issuerRaw !== null &&
      issuerRaw !== undefined &&
      issuerRaw !== "" &&
      !issuerId) ||
    !email ||
    !/^\S+@\S+\.\S+$/u.test(email) ||
    typeof installments !== "number" ||
    !Number.isSafeInteger(installments) ||
    installments < 1 ||
    installments > 48
  ) {
    return null;
  }
  return Object.freeze({
    token,
    installments,
    paymentMethodId,
    issuerId,
    email,
  });
}

function localStatus(payment: Payment, order: Order): string {
  if (payment.status === "confirmed") return "CONFIRMED";
  if (payment.status === "failed") return "FAILED";
  if (payment.status === "cancelled") return "CANCELLED";
  if (payment.status === "expired") return "EXPIRED";
  if (payment.status === "refunded") return "REFUNDED";
  return order.status === "cancelled" ? "CANCELLED" : "PENDING";
}

function paymentMatchesOrder(payment: Payment, order: Order): boolean {
  return (
    payment.subject.kind === "order" &&
    payment.subject.reference === order.id &&
    payment.amount.minorUnits === order.pricing.amount.minorUnits &&
    payment.amount.currency === order.pricing.amount.currency
  );
}

function monotonicUpdatedAt(now: string, payment: Payment): string {
  const current = Date.parse(payment.updatedAt);
  const observed = Date.parse(now);
  if (!Number.isFinite(current) || !Number.isFinite(observed)) {
    throw new Error("CARD_PAYMENT_HTTP_INVALID_CLOCK");
  }
  return new Date(Math.max(observed, current + 1)).toISOString();
}

function orderIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(cardPaymentHttpPrefix + "/")) return null;
  const parts = pathname
    .slice(cardPaymentHttpPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  return parts.length === 2 && parts[1] === "card" && parts[0]
    ? parts[0]
    : null;
}

export class CardPaymentHttpTransport {
  private readonly webhookUrl: string;

  constructor(
    private readonly dependencies: CardPaymentHttpTransportDependencies,
  ) {
    const webhookUrl = normalizeWebhookUrl(dependencies.webhookUrl);
    if (!webhookUrl) throw new Error("CARD_PAYMENT_WEBHOOK_URL_INVALID");
    this.webhookUrl = webhookUrl;
  }

  matches(pathname: string): boolean {
    return orderIdFromPath(pathname) !== null;
  }

  async handle(request: CheckoutHttpRequest): Promise<CheckoutHttpResponse> {
    const correlationId = normalizeCheckoutCorrelationId(
      request.correlationId ?? header(request, "x-correlation-id"),
    );
    if (!correlationId) {
      return errorResponse(400, "CORRELATION_ID_REQUIRED", "corr_invalid");
    }
    const orderIdInput = orderIdFromPath(request.pathname);
    if (!orderIdInput) return errorResponse(404, "NOT_FOUND", correlationId);
    if (request.method.toUpperCase() !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", correlationId);
    }

    const orderId = normalizeOrderId(orderIdInput);
    const submission = normalizedCardSubmission(request.body);
    if (!orderId || !submission) {
      return errorResponse(400, "INVALID_CARD_PAYMENT_REQUEST", correlationId);
    }

    const now = canonicalNow(this.dependencies.clock);
    const access = await this.dependencies.access.findByOrderId(orderId);
    const statusToken = header(request, "x-checkout-token");
    if (
      !access ||
      Date.parse(access.expiresAt) <= Date.parse(now) ||
      !this.dependencies.statusCapabilities.verify(
        orderId,
        statusToken,
        access.tokenHash,
      )
    ) {
      await this.dependencies.audit.record({
        action: "checkout.card_submit",
        result: "denied",
        reason: "invalid_checkout_capability",
        correlationId,
        actorSubject: access?.actorSubject ?? null,
        destinationId: access?.destinationId ?? null,
        tenantId: access?.tenantId ?? null,
        orderId,
        paymentId: access?.paymentId ?? null,
      });
      return errorResponse(404, "CHECKOUT_NOT_FOUND", correlationId);
    }

    const rate = await this.dependencies.rateLimits.consume({
      bucket: "checkout-create",
      key: `${access.actorSubject}:${access.destinationId}:${clientKey(request)}:card`,
      limit: cardSubmitRateLimit,
      windowMs: rateWindowMs,
      nowMs: Date.parse(now),
    });
    if (!rate.allowed) {
      return errorResponse(429, "RATE_LIMITED", correlationId, {
        "Retry-After": String(rate.retryAfterSeconds),
      });
    }

    try {
      const [order, payment] = await Promise.all([
        this.dependencies.orders.findById(orderId),
        this.dependencies.payments.findById(access.paymentId),
      ]);
      if (
        !order ||
        !payment ||
        access.paymentId !== payment.id ||
        !paymentMatchesOrder(payment, order)
      ) {
        throw new Error("CARD_PAYMENT_AUTHORITY_MISMATCH");
      }

      if (payment.providerReference !== null) {
        await this.dependencies.audit.record({
          action: "checkout.card_submit",
          result: "success",
          reason: "replayed",
          correlationId,
          actorSubject: access.actorSubject,
          destinationId: access.destinationId,
          tenantId: access.tenantId,
          orderId,
          paymentId: payment.id,
        });
        return response(
          200,
          {
            data: Object.freeze({
              checkoutId: order.id,
              paymentId: payment.id,
              status: localStatus(payment, order),
              submitted: true,
              replayed: true,
            }),
          },
          correlationId,
        );
      }

      if (payment.status !== "pending" || order.status !== "pending_payment") {
        return errorResponse(
          409,
          "CARD_PAYMENT_NOT_SUBMITTABLE",
          correlationId,
        );
      }

      const idempotencyKey = createCardPaymentIdempotencyKey(payment.id);
      const providerRequest = createCardPaymentProviderRequest({
        paymentId: payment.id,
        idempotencyKey,
        amount: payment.amount,
        description: order.pricing.planName,
        token: submission.token,
        installments: submission.installments,
        paymentMethodId: submission.paymentMethodId,
        issuerId: submission.issuerId,
        webhookUrl: this.webhookUrl,
        customer: { email: submission.email },
        metadata: {
          orderId: order.id,
          paymentId: payment.id,
          destinationId: access.destinationId,
          ...(access.tenantId ? { tenantId: access.tenantId } : {}),
        },
      });
      if (!providerRequest) {
        return errorResponse(
          400,
          "INVALID_CARD_PAYMENT_REQUEST",
          correlationId,
        );
      }

      const receipt =
        await this.dependencies.provider.createCardPayment(providerRequest);
      const persisted = await this.dependencies.payments.save(
        Object.freeze({
          ...payment,
          providerReference: receipt.providerPaymentReference,
          updatedAt: monotonicUpdatedAt(now, payment),
        }),
      );
      if (persisted.providerReference !== receipt.providerPaymentReference) {
        throw new Error("CARD_PAYMENT_PROVIDER_REFERENCE_NOT_PERSISTED");
      }

      await this.dependencies.audit.record({
        action: "checkout.card_submit",
        result: "success",
        reason: `provider_${receipt.status}`,
        correlationId,
        actorSubject: access.actorSubject,
        destinationId: access.destinationId,
        tenantId: access.tenantId,
        orderId,
        paymentId: persisted.id,
      });
      return response(
        202,
        {
          data: Object.freeze({
            checkoutId: order.id,
            paymentId: persisted.id,
            status: localStatus(persisted, order),
            submitted: true,
            replayed: false,
          }),
        },
        correlationId,
      );
    } catch {
      await this.dependencies.audit.record({
        action: "checkout.card_submit",
        result: "failure",
        reason: "internal_failure",
        correlationId,
        actorSubject: access.actorSubject,
        destinationId: access.destinationId,
        tenantId: access.tenantId,
        orderId,
        paymentId: access.paymentId,
      });
      return errorResponse(503, "CARD_PAYMENT_UNAVAILABLE", correlationId);
    }
  }
}
