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
import type { TicketingTransactionalCommandPort } from "./mysql-ticketing-transaction.js";

class MemoryOrders implements OrderRepositoryPort {
  constructor(private readonly current: Order | null) {}
  findById(orderId: string) { return Promise.resolve(this.current?.id === orderId ? this.current : null); }
  findByRequestKey() { return Promise.resolve(this.current); }
  save(order: Order) { return Promise.resolve(order); }
}

class MemoryPayments implements PaymentRepositoryPort {
  constructor(private readonly current: Payment | null) {}
  findById(paymentId: string) { return Promise.resolve(this.current?.id === paymentId ? this.current : null); }
  save(payment: Payment) { return Promise.resolve(payment); }
}

class MemoryTickets implements TicketRepositoryPort {
  readonly values = new Map<string, Ticket>();
  findById(ticketId: string) { return Promise.resolve(this.values.get(ticketId) ?? null); }
  findByCode(code: string) { return Promise.resolve([...this.values.values()].find((ticket) => ticket.code === code) ?? null); }
  findByOrderId(orderId: string) { return Promise.resolve([...this.values.values()].filter((ticket) => ticket.orderId === orderId)); }
  save(ticket: Ticket) { this.values.set(ticket.id, ticket); return Promise.resolve(ticket); }
}

class MemoryCheckIns implements TicketCheckInRepositoryPort {
  readonly values: TicketCheckIn[] = [];
  append(checkIn: TicketCheckIn) { this.values.push(checkIn); return Promise.resolve(); }
  listByTicketId(ticketId: string) { return Promise.resolve(this.values.filter((entry) => entry.ticketId === ticketId)); }
}

class MemoryOffline {
  readonly values = new Map<string, TicketOfflineEnvelope>();
  findById(id: string) { return Promise.resolve(this.values.get(id) ?? null); }
}

class MemoryTransactions implements TicketingTransactionalCommandPort {
  constructor(
    private readonly tickets: MemoryTickets,
    private readonly checkIns: MemoryCheckIns,
    private readonly offline: MemoryOffline,
  ) {}
  async commitCheckIn(input: { before: Ticket; after: Ticket; checkIn: TicketCheckIn }) {
    const replay = this.checkIns.values.find((entry) => entry.id === input.checkIn.id);
    if (replay) return { ticket: this.tickets.values.get(input.before.id)!, checkIn: replay, replayed: true };
    this.tickets.values.set(input.after.id, input.after);
    this.checkIns.values.push(input.checkIn);
    return { ticket: input.after, checkIn: input.checkIn, replayed: false };
  }
  async commitOfflineSync(input: {
    before: Ticket;
    after: Ticket;
    checkIn: TicketCheckIn;
    envelope: TicketOfflineEnvelope;
    syncedAt: string;
  }) {
    const existingEnvelope = this.offline.values.get(input.envelope.id);
    if (existingEnvelope) {
      const replay = this.checkIns.values.find((entry) => entry.id === input.checkIn.id);
      if (!replay) throw new Error("OFFLINE_REPLAY_INCOMPLETE");
      return { envelope: existingEnvelope, ticket: this.tickets.values.get(input.before.id)!, checkIn: replay, replayed: true };
    }
    this.offline.values.set(input.envelope.id, input.envelope);
    this.tickets.values.set(input.after.id, input.after);
    this.checkIns.values.push(input.checkIn);
    return { envelope: input.envelope, ticket: input.after, checkIn: input.checkIn, replayed: false };
  }
}

function fixtures() {
  const orderId = normalizeOrderId("ord_ticketing_service_0001");
  const paymentId = normalizePaymentId("pay_ticketing_service_0001");
  const amount = createMoney(18_900, "BRL");
  const secret = normalizeTicketSigningSecret("ticketing-service-signing-secret-0001");
  if (!orderId || !paymentId || !amount || !secret) throw new Error("FIXTURE_INVALID");
  const pricing = createPricingQuote({ planId: "tour_volta_ilha", planName: "Passeio Volta à Ilha", minorUnits: amount.minorUnits, currency: amount.currency, pricingVersion: "2026-08" });
  const requestKey = createBusinessOrderRequestKey("session_ticketing_0001", "tour_volta_ilha");
  if (!pricing || !requestKey) throw new Error("FIXTURE_INVALID");
  const order = createOrder({
    id: orderId,
    requestKey,
    source: { kind: "business_onboarding", reference: "session_ticketing_0001" },
    status: "payment_confirmed",
    pricing: { ...pricing, capturedAt: "2026-08-15T09:00:00Z" },
    createdAt: "2026-08-15T09:00:00Z",
    updatedAt: "2026-08-15T09:05:00Z",
  });
  if (!order) throw new Error("FIXTURE_INVALID");
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
    transactions: new MemoryTransactions(tickets, checkIns, offline),
    signingSecret: fixture.secret,
    clock: { now: () => new Date(Date.parse("2026-08-15T10:00:00Z") + tick++ * 1000).toISOString() },
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

describe("M148 transactional ticketing application", () => {
  it("issues only from persisted financial authority and replays issuance", async () => {
    const { service, fixture } = harness();
    const issued = await service.issueTicket(issueInput(fixture));
    expect(issued.ticket.status).toBe("issued");
    expect((await service.issueTicket(issueInput(fixture))).replayed).toBe(true);
  });

  it("rejects caller money divergence", async () => {
    const { service, fixture, tickets } = harness();
    await expect(service.issueTicket({ ...issueInput(fixture), amount: createMoney(100, "BRL") })).rejects.toMatchObject({ code: "TICKETING_FINANCIAL_AUTHORITY_MISMATCH" });
    expect(tickets.values.size).toBe(0);
  });

  it("replays the same QR attempt instead of advancing validated to used", async () => {
    const { service, fixture, checkIns } = harness();
    const issued = await service.issueTicket(issueInput(fixture));
    const request = { qrPayload: issued.qrPayload, operatorReference: "operator_001", occurredAt: "2026-08-15T10:30:00Z" };
    const first = await service.checkInByQr(request);
    const replay = await service.checkInByQr(request);
    expect(first.ticket.status).toBe("validated");
    expect(replay.replayed).toBe(true);
    expect(replay.ticket.status).toBe("validated");
    expect(replay.checkIn.id).toBe(first.checkIn.id);
    expect(checkIns.values).toHaveLength(1);
  });

  it("syncs one offline envelope exactly once", async () => {
    const { service, fixture, checkIns } = harness();
    const issued = await service.issueTicket(issueInput(fixture));
    const queuedAt = "2026-08-15T10:45:00Z";
    const signature = createTicketOfflineEnvelopeSignature({ ticketId: issued.ticket.id, operation: "validate", payload: issued.qrPayload, queuedAt }, fixture.secret);
    const envelope = createTicketOfflineEnvelope({ id: "toe_ticketing_service_0001", ticketId: issued.ticket.id, operation: "validate", payload: issued.qrPayload, signature, queuedAt });
    if (!envelope) throw new Error("ENVELOPE_FIXTURE_INVALID");
    const input = { envelope, operatorReference: "operator_002", recordedAt: "2026-08-15T10:46:00Z" };
    const first = await service.syncOfflineEnvelope(input);
    const replay = await service.syncOfflineEnvelope(input);
    expect(first.ticket.status).toBe("validated");
    expect(replay.replayed).toBe(true);
    expect(checkIns.values).toHaveLength(1);
  });

  it("rejects an offline envelope whose nested QR belongs to another ticket", async () => {
    const { service, fixture } = harness();
    const issued = await service.issueTicket(issueInput(fixture));
    const payload = `tck.v1.tck_other_ticket_0001.${"a".repeat(64)}`;
    const queuedAt = "2026-08-15T10:45:00Z";
    const signature = createTicketOfflineEnvelopeSignature({ ticketId: issued.ticket.id, operation: "validate", payload, queuedAt }, fixture.secret);
    const envelope = createTicketOfflineEnvelope({ id: "toe_ticketing_service_0002", ticketId: issued.ticket.id, operation: "validate", payload, signature, queuedAt });
    if (!envelope) throw new Error("ENVELOPE_FIXTURE_INVALID");
    await expect(service.syncOfflineEnvelope({ envelope, operatorReference: "operator_002", recordedAt: "2026-08-15T10:46:00Z" })).rejects.toMatchObject({ code: "TICKETING_OFFLINE_ENVELOPE_INVALID" });
  });
});
