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

import {
  FinancialWebhookHttpTransport,
  type FinancialWebhookAuditEvent,
} from "./webhook-http-transport.js";
import type {
  ProviderWebhookEventClaim,
  ProviderWebhookEventRepositoryPort,
  ProviderWebhookReceipt,
} from "./mysql-provider-webhook-event-repository.js";

function payment(): Payment {
  const id = normalizePaymentId("pay_webhook_transport_0001");
  const key = createPaymentIdempotencyKey("ord_webhook_transport_0001");
  const amount = createMoney(49_900, "BRL");
  if (!id || !key || !amount) throw new Error("FIXTURE_INVALID");
  return {
    id,
    idempotencyKey: key,
    subject: { kind: "order", reference: "ord_webhook_transport_0001" },
    amount,
    status: "pending",
    providerReference: null,
    createdAt: "2026-08-14T23:00:00Z",
    updatedAt: "2026-08-14T23:00:00Z",
    confirmedAt: null,
    refundedAt: null,
  };
}

function event() {
  const value = normalizeVerifiedProviderPaymentEvent({
    providerEventId: "pwe_webhook_transport_0001",
    externalReference: "pay_webhook_transport_0001",
    providerPaymentReference: "sandbox_payment_transport_0001",
    status: "paid",
    occurredAt: "2026-08-14T23:00:01Z",
  });
  if (!value) throw new Error("EVENT_FIXTURE_INVALID");
  return value;
}

class MemoryPayments implements PaymentRepositoryPort {
  constructor(private readonly value: Payment | null) {}

  findById(id: PaymentId): Promise<Payment | null> {
    return Promise.resolve(this.value?.id === id ? this.value : null);
  }

  save(): Promise<Payment> {
    return Promise.reject(new Error("PAYMENT_MUTATION_FORBIDDEN"));
  }
}

class MemoryEvents implements ProviderWebhookEventRepositoryPort {
  readonly receipts: ProviderWebhookReceipt[] = [];

  constructor(
    private readonly claimed = true,
    private readonly failure: Error | null = null,
  ) {}

  claim(receipt: ProviderWebhookReceipt): Promise<ProviderWebhookEventClaim> {
    if (this.failure) return Promise.reject(this.failure);
    this.receipts.push(receipt);
    return Promise.resolve({
      claimed: this.claimed,
      receipt: this.receipts[0] ?? receipt,
    });
  }
}

function harness(
  options: {
    readonly matched?: boolean;
    readonly verified?: ReturnType<typeof event> | null;
    readonly claimed?: boolean;
    readonly failure?: Error | null;
  } = {},
) {
  const audits: FinancialWebhookAuditEvent[] = [];
  const events = new MemoryEvents(
    options.claimed ?? true,
    options.failure ?? null,
  );
  const verified =
    options.verified === undefined ? event() : options.verified;
  const value = options.matched === false ? null : payment();
  const transport = new FinancialWebhookHttpTransport({
    verifier: {
      verify: () => Promise.resolve(verified),
    },
    events,
    payments: new MemoryPayments(value),
    audit: {
      record(value) {
        audits.push(value);
        return Promise.resolve();
      },
    },
    clock: { now: () => "2026-08-14T23:00:02Z" },
  });
  return { transport, events, audits };
}

function request(rawBody = Buffer.from('{"verified":"bytes"}')) {
  return {
    method: "POST",
    pathname: "/api/payments/v1/webhooks/sandbox",
    headers: {
      "X-Sandbox-Signature": "t=1786748400,v1=" + "a".repeat(64),
    },
    rawBody,
    correlationId: "corr_webhook_transport_0001",
  };
}

describe("M141 verified webhook HTTP transport", () => {
  it("durably claims a matched event without mutating Payment", async () => {
    const { transport, events, audits } = harness();
    const rawBody = Buffer.from('{"verified":"exact bytes"}');

    await expect(transport.handle(request(rawBody))).resolves.toEqual({
      status: 202,
      headers: {
        "Cache-Control": "no-store",
        "X-Correlation-ID": "corr_webhook_transport_0001",
      },
      body: {
        data: { accepted: true, matched: true, replayed: false },
      },
    });
    expect(events.receipts).toHaveLength(1);
    expect(events.receipts[0]).toMatchObject({
      payloadSha256:
        "d24bbc9440833f333fedf33049a5bf3cdfe756c0e6a49bf5092d7b0fb5aa3ae3",
      receivedAt: "2026-08-14T23:00:02.000Z",
      matchedPaymentId: "pay_webhook_transport_0001",
    });
    expect(audits.at(-1)).toMatchObject({
      result: "success",
      reason: "accepted_matched",
      matched: true,
      replayed: false,
    });
  });

  it("acknowledges a valid unknown event and an exact replay", async () => {
    const unknown = harness({ matched: false });
    await expect(
      unknown.transport.handle(request()),
    ).resolves.toMatchObject({
      status: 202,
      body: {
        data: { accepted: true, matched: false, replayed: false },
      },
    });

    const replay = harness({ claimed: false });
    await expect(
      replay.transport.handle(request()),
    ).resolves.toMatchObject({
      status: 202,
      body: {
        data: { accepted: true, matched: true, replayed: true },
      },
    });
  });

  it("rejects unverified input and normalizes event collisions", async () => {
    const denied = harness({ verified: null });
    await expect(
      denied.transport.handle(request()),
    ).resolves.toMatchObject({
      status: 401,
      body: { error: "WEBHOOK_UNAUTHORIZED" },
    });
    expect(denied.events.receipts).toHaveLength(0);

    const collision = harness({
      failure: new Error("FINANCIAL_PROVIDER_EVENT_COLLISION"),
    });
    await expect(
      collision.transport.handle(request()),
    ).resolves.toMatchObject({
      status: 409,
      body: { error: "WEBHOOK_EVENT_CONFLICT" },
    });
    expect(JSON.stringify(collision.audits)).not.toContain(
      "sandbox_payment_transport_0001",
    );
  });

  it("allows only POST on the exact versioned path", async () => {
    const { transport } = harness();
    await expect(
      transport.handle({ ...request(), method: "GET" }),
    ).resolves.toMatchObject({
      status: 405,
      headers: { Allow: "POST" },
    });
    await expect(
      transport.handle({
        ...request(),
        pathname: "/api/payments/v1/webhooks/other",
      }),
    ).resolves.toMatchObject({ status: 404 });
  });
});
