import { createHash } from "node:crypto";

import {
  normalizeFinancialTimestamp,
  type FinancialWebhookVerifierPort,
  type PaymentRepositoryPort,
  type ProviderPaymentStatus,
  type VerifiedProviderPaymentEvent,
} from "@touristic/financial";

import type {
  ProviderWebhookEventRepositoryPort,
  ProviderWebhookReceipt,
} from "./mysql-provider-webhook-event-repository.js";
import type {
  VerifiedPaymentOutcomeApplicationPort,
  VerifiedPaymentOutcomeDisposition,
} from "./verified-payment-outcome-service.js";
import type {
  VerifiedPaymentAccountingApplicationPort,
  VerifiedPaymentAccountingDisposition,
} from "./verified-payment-accounting-service.js";

export const sandboxWebhookPath = "/api/payments/v1/webhooks/sandbox";

export interface FinancialWebhookHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly rawBody: Uint8Array;
  readonly correlationId: string;
}

export interface FinancialWebhookHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface FinancialWebhookAuditEvent {
  readonly action: "webhook.receive";
  readonly result: "success" | "denied" | "failure";
  readonly reason: string;
  readonly correlationId: string;
  readonly providerEventId: string | null;
  readonly status: ProviderPaymentStatus | null;
  readonly matched: boolean | null;
  readonly replayed: boolean | null;
  readonly outcome: VerifiedPaymentOutcomeDisposition | null;
  readonly accounting: VerifiedPaymentAccountingDisposition | null;
}

export interface FinancialWebhookAuditPort {
  record(event: FinancialWebhookAuditEvent): Promise<void>;
}

export interface FinancialWebhookClockPort {
  now(): string;
}

export interface FinancialWebhookHttpTransportDependencies {
  readonly verifier: FinancialWebhookVerifierPort;
  readonly events: ProviderWebhookEventRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly outcomes: VerifiedPaymentOutcomeApplicationPort;
  readonly accounting: VerifiedPaymentAccountingApplicationPort;
  readonly audit: FinancialWebhookAuditPort;
  readonly clock: FinancialWebhookClockPort;
}

function firstHeader(value: unknown): string {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(
  headers: Readonly<Record<string, unknown>>,
  name: string,
): string {
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
  additionalHeaders: Readonly<Record<string, string>> = {},
): FinancialWebhookHttpResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlationId,
      ...additionalHeaders,
    }),
    body: Object.freeze(body),
  });
}

async function audit(
  port: FinancialWebhookAuditPort,
  event: FinancialWebhookAuditEvent,
): Promise<void> {
  try {
    await port.record(Object.freeze({ ...event }));
  } catch {
    // Audit delivery cannot change webhook acknowledgement semantics.
  }
}

function now(clock: FinancialWebhookClockPort): string {
  const value = normalizeFinancialTimestamp(clock.now());
  if (!value) throw new Error("FINANCIAL_WEBHOOK_INVALID_CLOCK");
  return new Date(value).toISOString();
}

export class FinancialWebhookHttpTransport {
  constructor(
    private readonly dependencies: FinancialWebhookHttpTransportDependencies,
  ) {}

  matches(pathname: string): boolean {
    return pathname === sandboxWebhookPath;
  }

  async handle(
    request: FinancialWebhookHttpRequest,
  ): Promise<FinancialWebhookHttpResponse> {
    const correlationId = request.correlationId;
    if (!this.matches(request.pathname)) {
      return response(404, { error: "WEBHOOK_NOT_FOUND" }, correlationId);
    }
    if (request.method.toUpperCase() !== "POST") {
      return response(405, { error: "METHOD_NOT_ALLOWED" }, correlationId, {
        Allow: "POST",
      });
    }

    const signature = header(request.headers, "x-sandbox-signature");
    let event: VerifiedProviderPaymentEvent | null;
    try {
      event = signature
        ? await this.dependencies.verifier.verify(request.rawBody, signature)
        : null;
    } catch {
      await audit(this.dependencies.audit, {
        action: "webhook.receive",
        result: "failure",
        reason: "verifier_unavailable",
        correlationId,
        providerEventId: null,
        status: null,
        matched: null,
        replayed: null,
        outcome: null,
        accounting: null,
      });
      return response(503, { error: "WEBHOOK_UNAVAILABLE" }, correlationId);
    }
    if (!event) {
      await audit(this.dependencies.audit, {
        action: "webhook.receive",
        result: "denied",
        reason: "signature_or_payload_invalid",
        correlationId,
        providerEventId: null,
        status: null,
        matched: null,
        replayed: null,
        outcome: null,
        accounting: null,
      });
      return response(401, { error: "WEBHOOK_UNAUTHORIZED" }, correlationId);
    }

    try {
      const payment = await this.dependencies.payments.findById(
        event.externalReference,
      );
      const receipt: ProviderWebhookReceipt = Object.freeze({
        event,
        payloadSha256: createHash("sha256")
          .update(request.rawBody)
          .digest("hex"),
        receivedAt: now(this.dependencies.clock),
        matchedPaymentId: payment?.id ?? null,
      });
      const claim = await this.dependencies.events.claim(receipt);
      const matched = claim.receipt.matchedPaymentId !== null;
      const replayed = !claim.claimed;
      const outcome = matched
        ? await this.dependencies.outcomes.apply(claim.receipt.event)
        : Object.freeze({
            disposition: "unmatched" as const,
            payment: null,
            result: null,
          });
      if (matched && outcome.disposition === "unmatched") {
        throw new Error("FINANCIAL_MATCHED_PAYMENT_DISAPPEARED");
      }
      const accounting =
        outcome.payment && outcome.result
          ? await this.dependencies.accounting.apply(
              outcome.payment,
              outcome.result,
            )
          : Object.freeze({
              disposition: "not_applicable" as const,
              transactions: Object.freeze([]),
            });
      await audit(this.dependencies.audit, {
        action: "webhook.receive",
        result: "success",
        reason: matched ? "accepted_matched" : "accepted_unmatched",
        correlationId,
        providerEventId: event.providerEventId,
        status: event.status,
        matched,
        replayed,
        outcome: outcome.disposition,
        accounting: accounting.disposition,
      });
      return response(
        202,
        {
          data: Object.freeze({
            accepted: true,
            matched,
            replayed,
            outcome: outcome.disposition,
            accounting: accounting.disposition,
          }),
        },
        correlationId,
      );
    } catch (error) {
      const collision =
        error instanceof Error &&
        error.message === "FINANCIAL_PROVIDER_EVENT_COLLISION";
      await audit(this.dependencies.audit, {
        action: "webhook.receive",
        result: "failure",
        reason: collision ? "event_collision" : "persistence_unavailable",
        correlationId,
        providerEventId: event.providerEventId,
        status: event.status,
        matched: null,
        replayed: null,
        outcome: null,
        accounting: null,
      });
      return response(
        collision ? 409 : 503,
        {
          error: collision ? "WEBHOOK_EVENT_CONFLICT" : "WEBHOOK_UNAVAILABLE",
        },
        correlationId,
      );
    }
  }
}
