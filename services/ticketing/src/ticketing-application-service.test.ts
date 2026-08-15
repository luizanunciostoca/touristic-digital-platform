import { describe, expect, it } from "vitest";

import {
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
  type Payment,
  type PaymentRepositoryPort,
} from "@touristic/financial";
import {
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  type Order,
  type OrderRepositoryPort,
} from "@touristic/ordering";
import {
  createTicketOfflineEnvelope,
  createTicketOfflineEnvelopeSignature,
  normalizeTicketSigningSecret,
  type Ticket,
  type TicketCheckIn,
  type TicketCheckInRepositoryPort,
  type TicketOfflineEnvelope,
  type TicketRepositoryPort,
} from "@touristic/ticketing";

import { createTicketingApplicationService } from "./ticketing-application-service.js";

class MemoryOrders implements OrderRepositoryPort {
  constructor(private readonly current: Order | null) {}
  findById(orderId: string): Promise<Order | null> {
    return Promise.resolve(this.current?.id === orderId ? this.current : null);
  }
  findByRequestKey(): Promise<Order | null> {
    return Promise.resolve(this.current);
  }
  save(order: Order): Promise<Order> {
    return Promise.resolve(order);
  }
}

class MemoryPayments implements PaymentRepositoryPort {
  constructor(private readonly current: Payment | null) {}
  findById(paymentId: string): Promise<Payment | null> {
    return Promise.resolve(
      this.current?.id === paymentId ? this.current : null,
    );
  }
  save(payment: Payment): Promise<Payment> {
    return Promise.resolve(payment);
  }
}

class MemoryTickets implements TicketRepositoryPort {
  readonly values = new Map<string, Ticket>();
  findById(ticketId: string): Promise<Ticket | null> {
    return Promise.resolve(this.values.get(ticketId) ?? null);
  }
  findByCode(code: string): Promise<Ticket | null> {
    return Promise.resolve(
      [...this.values.values()].find((ticket) => ticket.code === code) ?? null,
    );
  }
  findByOrderId(orderId: string): Promise<readonly Ticket[]> {
    return Promise.resolve(
      [...this.values.values()].filter((ticket) => ticket.orderId === orderId),
    );
  }
  save(ticket: Ticket): Promise<Ticket> {
    this.values.set(ticket.id, ticket);
    return Promise.resolve(ticket);
  }
}

class MemoryCheckIns implements TicketCheckInRepositoryPort {
  readonly values: TicketCheckIn[] = [];
  append(checkIn: TicketCheckIn): Promise<void> {
    this.values.push(checkIn);
    return Promise.resolve();
  }
  listByTicketId(ticketId: string): Promise<readonly TicketCheckIn[]> {
    return Promise.resolve(
      this.values.filter((checkIn) => checkIn.ticketId === ticketId),
    );
  }
}

class MemoryOffline {
  readonly values = new Map<string, TicketOfflineEnvelope>();
  readonly synced = new Map<string, string>();
  enqueue(envelope: TicketOfflineEnvelope): Promise<void> {
    this.values.set(envelope.id, envelope);
    return Promise.resolve();
  }
  findById(envelopeId: string): Promise<TicketOfflineEnvelope | null> {
    return Promise.resolve(this.values.get(envelopeId) ?? null);
  }
  markSynced(envelopeId: string, checkInId: string): Promise<void> {
    this.synced.set(envelopeId, checkInId);
    return Promise.resolve();
  }
}

function fixtures() {
  const orderId = normalizeOrderId("ord_ticketing_service_0001");
  const paymentId = normalizePaymentId("pay_ticketing_service_0001");
  const amount = createMoney(18_900, "BRL");
  const secret = normalizeTicketSigningSecret(
    "ticketing-service-signing-secret-0001",
  );
  if (!orderId || !paymentId || !amount || !secret) {
    throw new Error("FIXTURE_INVALID");
  }
  const pricing = createPricingQuote({
    planId: "tour_volta_ilha",
    planName: "Passeio Volta à Ilha",
    minorUnits: amount.minorUnits,
    currency: amount.currency,
    pricingVersion: "2026-08",
  });
  if (!pricing) throw new Error("FIXTURE_INVALID");
  const requestKey = createBusinessOrderRequestKey(
    "session_ticketing_0001",
    "tour_volta_ilha",
  );
  if (!requestKey) throw new Error("FIXTURE_INVALID");
  const order = createOrder({
    id: orderId,
    requestKey,
    source: {
      kind: "business_onboarding",
      reference: "session_ticketing_0001",
    },
    status: "payment_confirmed",
    pricing: {
      ...pricing,
      capturedAt: "2026-08-15T09:00:00Z",
    },
    createdAt: "2026-08-15T09:00:00Z",
    updatedAt: "2026-08-15T09:05:00Z",
  });
  const payment: Payment = {
    id: paymentId,
    idempotencyKey: createPaymentIdempotencyKey(orderId)!,
    subject: { kind: "order", reference: orderId },
    amount,
    status: "confirmed",
    providerReference: "sandbox_ticketing_0001",
    createdAt: "2026-08-15T09:01:00Z",
    updatedAt: "2026-08-15T09:06:00Z",
    confirmedAt: "2026-08-15T09:06:00Z",
    refundedAt: null,
  };
  if (!order) throw new Error("FIXTURE_INVALID");
  return { order, payment, amount, secret };
}

function harness() {
  const fixture = fixtures();
  const tickets = new MemoryTickets();
  const checkIns = new MemoryCheckIns();
  const offline = new MemoryOffline();
  let tick = 0;
  const service = createTicketingApplicationService({
    orders: new MemoryOrders(fixture.order),
    payments: new MemoryPayments(fixture.payment),
    tickets,
    checkIns,
    offline,
    signingSecret: fixture.secret,
    clock: {
      now: () =>
        new Date(
          Date.parse("2026-08-15T10:00:00Z") + tick++ * 1000,
        ).toISOString(),
    },
  });
  return { service, tickets, checkIns, offline, fixture };
}

function issueInput(fixture: ReturnType<typeof fixtures>) {
  return {
    orderId: fixture.order.id,
    paymentId: fixture.payment.id,
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "volta-a-ilha" },
    holderName: "Luiz Silva",
    quantity: 2,
    amount: fixture.amount,
    issuedAt: "2026-08-15T10:00:00Z",
  };
}

describe("M147 ticketing application service", () => {
  it("issues a ticket only after persisted financial authority and replays safely", async () => {
    const { service, fixture } = harness();
    const issued = await service.issueTicket(issueInput(fixture));
    expect(issued.replayed).toBe(false);
    expect(issued.ticket.status).toBe("issued");
    expect(issued.ticket.amount).toEqual(fixture.payment.amount);
    expect(issued.qrPayload).toContain("tck.v1.");

    const replay = await service.issueTicket(issueInput(fixture));
    expect(replay.replayed).toBe(true);
    expect(replay.ticket.id).toBe(issued.ticket.id);
    expect(replay.ticket.code).toBe(issued.ticket.code);
  });

  it("rejects a caller amount that diverges from Order and Payment authority", async () => {
    const { service, fixture, tickets } = harness();
    const forgedAmount = createMoney(100, "BRL");
    expect(forgedAmount).not.toBeNull();

    await expect(
      service.issueTicket({
        ...issueInput(fixture),
        amount: forgedAmount,
      }),
    ).rejects.toMatchObject({
      code: "TICKETING_FINANCIAL_AUTHORITY_MISMATCH",
    });
    expect(tickets.values.size).toBe(0);
  });

  it("validates a ticket by QR and records an online check-in", async () => {
    const { service, fixture, checkIns } = harness();
    const issued = await service.issueTicket(issueInput(fixture));
    const checked = await service.checkInByQr({
      qrPayload: issued.qrPayload,
      operatorReference: "operator_001",
      occurredAt: "2026-08-15T10:30:00Z",
    });
    expect(checked.ticket.status).toBe("validated");
    expect(checked.checkIn.channel).toBe("online");
    expect(checkIns.values).toHaveLength(1);
  });

  it("syncs an offline envelope exactly once", async () => {
    const { service, fixture, offline } = harness();
    const issued = await service.issueTicket(issueInput(fixture));
    const signature = createTicketOfflineEnvelopeSignature(
      {
        ticketId: issued.ticket.id,
        operation: "validate",
        payload: issued.qrPayload,
        queuedAt: "2026-08-15T10:45:00Z",
      },
      fixture.secret,
    );
    const envelope = createTicketOfflineEnvelope({
      id: "toe_ticketing_service_0001",
      ticketId: issued.ticket.id,
      operation: "validate",
      payload: issued.qrPayload,
      signature,
      queuedAt: "2026-08-15T10:45:00Z",
    });
    if (!envelope) throw new Error("ENVELOPE_FIXTURE_INVALID");

    const synced = await service.syncOfflineEnvelope({
      envelope,
      operatorReference: "operator_002",
      recordedAt: "2026-08-15T10:46:00Z",
    });
    expect(synced.replayed).toBe(false);
    expect(synced.ticket.status).toBe("validated");
    expect(offline.synced.get(envelope.id)).toBe(synced.checkIn.id);

    const replay = await service.syncOfflineEnvelope({
      envelope,
      operatorReference: "operator_002",
      recordedAt: "2026-08-15T10:47:00Z",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.checkIn.id).toBe(synced.checkIn.id);
  });

  it("rejects an offline envelope whose signed payload is not the ticket QR", async () => {
    const { service, fixture } = harness();
    const issued = await service.issueTicket(issueInput(fixture));
    const forgedPayload = `tck.v1.tck_other_ticket_0001.${"a".repeat(64)}`;
    const signature = createTicketOfflineEnvelopeSignature(
      {
        ticketId: issued.ticket.id,
        operation: "validate",
        payload: forgedPayload,
        queuedAt: "2026-08-15T10:45:00Z",
      },
      fixture.secret,
    );
    const envelope = createTicketOfflineEnvelope({
      id: "toe_ticketing_service_0002",
      ticketId: issued.ticket.id,
      operation: "validate",
      payload: forgedPayload,
      signature,
      queuedAt: "2026-08-15T10:45:00Z",
    });
    if (!envelope) throw new Error("ENVELOPE_FIXTURE_INVALID");

    await expect(
      service.syncOfflineEnvelope({
        envelope,
        operatorReference: "operator_002",
        recordedAt: "2026-08-15T10:46:00Z",
      }),
    ).rejects.toMatchObject({ code: "TICKETING_OFFLINE_ENVELOPE_INVALID" });
  });
});
