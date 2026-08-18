import { describe, expect, it } from "vitest";

import {
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
  normalizeVerifiedProviderPaymentEvent,
  type Payment,
  type PaymentId,
  type PaymentRepositoryPort,
} from "@touristic/financial";

import { FinancialWebhookHttpTransport } from "./webhook-http-transport.js";
import type {
  ProviderWebhookEventClaim,
  ProviderWebhookEventRepositoryPort,
  ProviderWebhookReceipt,
} from "./mysql-provider-webhook-event-repository.js";

function payment(): Payment {
  const id = normalizePaymentId("pay_mercado_transport_0001");
  const key = createPaymentIdempotencyKey("ord_mercado_transport_0001");
  const amount = createMoney(49_900, "BRL");
  if (!id || !key || !amount) throw new Error("FIXTURE_INVALID");
  return {
    id,
    idempotencyKey: key,
    subject: { kind: "order", reference: "ord_mercado_transport_0001" },
    amount,
    status: "pending",
    providerReference: null,
    createdAt: "2026-08-17T23:00:00Z",
    updatedAt: "2026-08-17T23:00:00Z",
    confirmedAt: null,
    refundedAt: null,
  };
}

class MemoryPayments implements PaymentRepositoryPort {
  findById(id: PaymentId): Promise<Payment | null> {
    const value = payment();
    return Promise.resolve(value.id === id ? value : null);
  }

  save(): Promise<Payment> {
    return Promise.reject(new Error("PAYMENT_MUTATION_FORBIDDEN"));
  }
}

class MemoryEvents implements ProviderWebhookEventRepositoryPort {
  readonly receipts: ProviderWebhookReceipt[] = [];

  claim(receipt: ProviderWebhookReceipt): Promise<ProviderWebhookEventClaim> {
    this.receipts.push(receipt);
    return Promise.resolve({ claimed: true, receipt });
  }
}

function request() {
  return {
    method: "POST",
    pathname: "/api/payments/v1/webhooks/sandbox",
    headers: {
      "X-Signature": `ts=1787018400,v1=${"a".repeat(64)}`,
      "X-Request-Id": "request-mp-transport-0001",
      "X-Morro-Provider-Data-Id": "123456789",
    },
    rawBody: Buffer.from(
      JSON.stringify({ action: "payment.updated", data: { id: "123456789" } }),
    ),
    correlationId: "corr_mp_transport_0001",
  };
}

function terminalEvent() {
  const value = normalizeVerifiedProviderPaymentEvent({
    providerEventId: "pwe_mp_transport_0001",
    externalReference: "pay_mercado_transport_0001",
    providerPaymentReference: "123456789",
    status: "paid",
    occurredAt: "2026-08-17T23:00:01Z",
  });
  if (!value) throw new Error("EVENT_FIXTURE_INVALID");
  return value;
}

function transport(input: {
  readonly event: ReturnType<typeof terminalEvent> | null;
  readonly authentic?: boolean;
}) {
  const events = new MemoryEvents();
  const audits: Array<{ reason: string; result: string }> = [];
  const verifier = {
    verify: () => Promise.resolve(input.event),
    verifyAuthenticity: () => Promise.resolve(input.authentic ?? false),
  };
  return {
    events,
    audits,
    transport: new FinancialWebhookHttpTransport({
      verifier,
      events,
      payments: new MemoryPayments(),
      outcomes: {
        apply: () =>
          Promise.resolve({
            disposition: "applied" as const,
            payment: payment(),
            result: null,
          }),
      },
      accounting: {
        apply: () => Promise.reject(new Error("ACCOUNTING_NOT_EXPECTED")),
      },
      audit: {
        record(event) {
          audits.push({ reason: event.reason, result: event.result });
          return Promise.resolve();
        },
      },
      clock: { now: () => "2026-08-17T23:00:02Z" },
    }),
  };
}

describe("Mercado Pago webhook transport", () => {
  it("acknowledges an authentic non-terminal notification with HTTP 200 without financial mutation", async () => {
    const harness = transport({ event: null, authentic: true });
    await expect(harness.transport.handle(request())).resolves.toEqual({
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Correlation-ID": "corr_mp_transport_0001",
      },
      body: { data: { accepted: true, terminal: false } },
    });
    expect(harness.events.receipts).toHaveLength(0);
    expect(harness.audits.at(-1)).toEqual({
      reason: "accepted_non_terminal",
      result: "success",
    });
  });

  it("acknowledges a terminal verified notification with HTTP 200 and preserves durable Financial flow", async () => {
    const harness = transport({ event: terminalEvent() });
    await expect(harness.transport.handle(request())).resolves.toMatchObject({
      status: 200,
      body: {
        data: {
          accepted: true,
          matched: true,
          replayed: false,
          outcome: "applied",
          accounting: "not_applicable",
        },
      },
    });
    expect(harness.events.receipts).toHaveLength(1);
  });

  it("keeps invalid Mercado Pago signatures fail-closed", async () => {
    const harness = transport({ event: null, authentic: false });
    await expect(harness.transport.handle(request())).resolves.toMatchObject({
      status: 401,
      body: { error: "WEBHOOK_UNAUTHORIZED" },
    });
    expect(harness.events.receipts).toHaveLength(0);
  });
});
