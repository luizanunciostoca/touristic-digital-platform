import { createHash } from "node:crypto";

import {
  createMoney,
  normalizeFinancialTimestamp,
  type Money,
  type PaymentRepositoryPort,
} from "@touristic/financial";
import { type OrderRepositoryPort } from "@touristic/ordering";
import {
  applyTicketCheckIn,
  createTicket,
  createTicketCheckIn,
  createTicketCode,
  createTicketQrPayload,
  normalizeTicketCheckInId,
  normalizeTicketId,
  normalizeTicketSigningSecret,
  verifyTicketOfflineEnvelope,
  verifyTicketQrPayload,
  type Ticket,
  type TicketCheckIn,
  type TicketCheckInRepositoryPort,
  type TicketIssueRequest,
  type TicketOfflineEnvelope,
  type TicketOfflineSyncResult,
  type TicketRepositoryPort,
  type TicketSigningSecret,
} from "@touristic/ticketing";

export type TicketingApplicationErrorCode =
  | "TICKETING_ORDER_NOT_FOUND"
  | "TICKETING_PAYMENT_NOT_FOUND"
  | "TICKETING_PAYMENT_NOT_CONFIRMED"
  | "TICKETING_FINANCIAL_AUTHORITY_MISMATCH"
  | "TICKETING_TICKET_CONFLICT"
  | "TICKETING_TICKET_NOT_FOUND"
  | "TICKETING_CHECKIN_INVALID"
  | "TICKETING_OFFLINE_ENVELOPE_INVALID";

export class TicketingApplicationError extends Error {
  constructor(readonly code: TicketingApplicationErrorCode) {
    super(code);
    this.name = "TicketingApplicationError";
  }
}

export interface TicketingIssueResult {
  readonly ticket: Ticket;
  readonly qrPayload: string;
  readonly replayed: boolean;
}

export interface TicketingCheckInResult {
  readonly ticket: Ticket;
  readonly checkIn: TicketCheckIn;
  readonly replayed: boolean;
}

export interface TicketingApplicationService {
  issueTicket(input: TicketIssueRequest): Promise<TicketingIssueResult>;
  checkInByQr(input: {
    readonly qrPayload: unknown;
    readonly operatorReference: unknown;
    readonly occurredAt: unknown;
  }): Promise<TicketingCheckInResult>;
  checkInByCode(input: {
    readonly code: unknown;
    readonly result: unknown;
    readonly operatorReference: unknown;
    readonly occurredAt: unknown;
  }): Promise<TicketingCheckInResult>;
  syncOfflineEnvelope(input: {
    readonly envelope: TicketOfflineEnvelope;
    readonly operatorReference: unknown;
    readonly recordedAt: unknown;
  }): Promise<TicketOfflineSyncResult>;
}

export interface TicketingApplicationServiceDependencies {
  readonly orders: OrderRepositoryPort;
  readonly payments: PaymentRepositoryPort;
  readonly tickets: TicketRepositoryPort;
  readonly checkIns: TicketCheckInRepositoryPort;
  readonly offline: {
    enqueue(envelope: TicketOfflineEnvelope): Promise<void>;
    findById(envelopeId: string): Promise<TicketOfflineEnvelope | null>;
    markSynced(
      envelopeId: string,
      checkInId: string,
      syncedAt: string,
    ): Promise<void>;
  };
  readonly signingSecret: TicketSigningSecret;
  readonly clock: { now(): string };
}

function canonicalNow(clock: { now(): string }): string {
  const value = normalizeFinancialTimestamp(clock.now());
  if (!value) throw new Error("TICKETING_CLOCK_INVALID");
  return new Date(value).toISOString();
}

function deterministicTicketId(
  orderReference: string,
  productReference: string,
) {
  const digest = createHash("sha256")
    .update(`ticket:v1:${orderReference}:${productReference}`)
    .digest("hex")
    .slice(0, 32);
  const id = normalizeTicketId(`tck_${digest}`);
  if (!id) throw new Error("TICKETING_TICKET_ID_INVALID");
  return id;
}

function deterministicTicketCode(
  orderReference: string,
  productReference: string,
): string {
  const digest = createHash("sha256")
    .update(`ticket-code:v1:${orderReference}:${productReference}`)
    .digest("hex")
    .toUpperCase();
  const code = createTicketCode(digest);
  if (!code) throw new Error("TICKETING_TICKET_CODE_INVALID");
  return code;
}

function deterministicCheckInId(
  ticketId: string,
  result: string,
  occurredAt: string,
) {
  const digest = createHash("sha256")
    .update(`ticket-checkin:v1:${ticketId}:${result}:${occurredAt}`)
    .digest("hex")
    .slice(0, 32);
  const id = normalizeTicketCheckInId(`tci_${digest}`);
  if (!id) throw new Error("TICKETING_CHECKIN_ID_INVALID");
  return id;
}

function sameMoney(left: Money, right: Money): boolean {
  return (
    left.minorUnits === right.minorUnits && left.currency === right.currency
  );
}

function requestedMoney(value: unknown): Money | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const input = value as { readonly minorUnits?: unknown; readonly currency?: unknown };
  return createMoney(input.minorUnits, input.currency);
}

function sameTicketAuthority(left: Ticket, right: Ticket): boolean {
  return (
    left.id === right.id &&
    left.orderId === right.orderId &&
    left.paymentId === right.paymentId &&
    left.destinationId === right.destinationId &&
    left.product.kind === right.product.kind &&
    left.product.reference === right.product.reference &&
    left.holderName === right.holderName &&
    left.quantity === right.quantity &&
    left.amount.minorUnits === right.amount.minorUnits &&
    left.amount.currency === right.amount.currency &&
    left.code === right.code &&
    left.issuedAt === right.issuedAt
  );
}

export function createTicketingApplicationService(
  dependencies: TicketingApplicationServiceDependencies,
): TicketingApplicationService {
  const secret = normalizeTicketSigningSecret(dependencies.signingSecret);
  if (!secret) throw new Error("TICKETING_SIGNING_SECRET_INVALID");

  return Object.freeze({
    async issueTicket(
      input: TicketIssueRequest,
    ): Promise<TicketingIssueResult> {
      const order = await dependencies.orders.findById(input.orderId as never);
      if (!order) {
        throw new TicketingApplicationError("TICKETING_ORDER_NOT_FOUND");
      }
      const payment = await dependencies.payments.findById(
        input.paymentId as never,
      );
      if (!payment) {
        throw new TicketingApplicationError("TICKETING_PAYMENT_NOT_FOUND");
      }
      if (
        payment.status !== "confirmed" ||
        payment.subject.reference !== order.id
      ) {
        throw new TicketingApplicationError("TICKETING_PAYMENT_NOT_CONFIRMED");
      }

      const requestedAmount = requestedMoney(input.amount);
      if (
        order.status !== "payment_confirmed" ||
        !sameMoney(payment.amount, order.pricing.amount) ||
        !requestedAmount ||
        !sameMoney(requestedAmount, payment.amount)
      ) {
        throw new TicketingApplicationError(
          "TICKETING_FINANCIAL_AUTHORITY_MISMATCH",
        );
      }

      const product = input.product as {
        readonly kind?: unknown;
        readonly reference?: unknown;
      } | null;
      const productReference =
        product && typeof product.reference === "string"
          ? product.reference
          : "";
      const ticketId = deterministicTicketId(order.id, productReference);
      const existing = await dependencies.tickets.findById(ticketId);
      const issuedAt = existing?.issuedAt ?? canonicalNow(dependencies.clock);
      const code = deterministicTicketCode(order.id, productReference);
      const ticket = createTicket({
        id: ticketId,
        orderId: order.id,
        paymentId: payment.id,
        destinationId: input.destinationId,
        product: input.product,
        holderName: input.holderName,
        quantity: input.quantity,
        amount: payment.amount,
        code,
        status: "issued",
        issuedAt,
        updatedAt: issuedAt,
      });
      if (!ticket) throw new Error("TICKETING_TICKET_INVALID");
      if (existing) {
        if (!sameTicketAuthority(existing, ticket)) {
          throw new TicketingApplicationError("TICKETING_TICKET_CONFLICT");
        }
        const qrPayload = createTicketQrPayload(existing.id, secret);
        if (!qrPayload) throw new Error("TICKETING_QR_INVALID");
        return Object.freeze({
          ticket: existing,
          qrPayload,
          replayed: true,
        });
      }

      const saved = await dependencies.tickets.save(ticket);
      const qrPayload = createTicketQrPayload(saved.id, secret);
      if (!qrPayload) throw new Error("TICKETING_QR_INVALID");
      return Object.freeze({
        ticket: saved,
        qrPayload,
        replayed: false,
      });
    },

    async checkInByQr(input: {
      readonly qrPayload: unknown;
      readonly operatorReference: unknown;
      readonly occurredAt: unknown;
    }): Promise<TicketingCheckInResult> {
      const verified = verifyTicketQrPayload(input.qrPayload, secret);
      if (!verified) {
        throw new TicketingApplicationError("TICKETING_CHECKIN_INVALID");
      }
      const ticket = await dependencies.tickets.findById(verified.ticketId);
      if (!ticket) {
        throw new TicketingApplicationError("TICKETING_TICKET_NOT_FOUND");
      }
      const occurredAt = normalizeFinancialTimestamp(input.occurredAt);
      if (!occurredAt) {
        throw new TicketingApplicationError("TICKETING_CHECKIN_INVALID");
      }
      const canonicalOccurredAt = new Date(occurredAt).toISOString();
      const result = ticket.status === "issued" ? "validated" : "used";
      const updated = applyTicketCheckIn(ticket, {
        result,
        occurredAt: canonicalOccurredAt,
      });
      const recordedAtCandidate = canonicalNow(dependencies.clock);
      const recordedAt =
        Date.parse(recordedAtCandidate) < Date.parse(canonicalOccurredAt)
          ? canonicalOccurredAt
          : recordedAtCandidate;
      const checkIn = createTicketCheckIn({
        id: deterministicCheckInId(ticket.id, result, canonicalOccurredAt),
        ticketId: ticket.id,
        result,
        channel: "online",
        operatorReference: input.operatorReference,
        occurredAt: canonicalOccurredAt,
        recordedAt,
      });
      if (!checkIn) {
        throw new TicketingApplicationError("TICKETING_CHECKIN_INVALID");
      }
      const existing = (
        await dependencies.checkIns.listByTicketId(ticket.id)
      ).find((entry) => entry.id === checkIn.id);
      if (existing) {
        return Object.freeze({ ticket, checkIn: existing, replayed: true });
      }
      const saved = await dependencies.tickets.save(updated);
      await dependencies.checkIns.append(checkIn);
      return Object.freeze({ ticket: saved, checkIn, replayed: false });
    },

    async checkInByCode(input: {
      readonly code: unknown;
      readonly result: unknown;
      readonly operatorReference: unknown;
      readonly occurredAt: unknown;
    }): Promise<TicketingCheckInResult> {
      const ticket = await dependencies.tickets.findByCode(input.code as never);
      if (!ticket) {
        throw new TicketingApplicationError("TICKETING_TICKET_NOT_FOUND");
      }
      const occurredAt = normalizeFinancialTimestamp(input.occurredAt);
      if (!occurredAt) {
        throw new TicketingApplicationError("TICKETING_CHECKIN_INVALID");
      }
      const result = typeof input.result === "string" ? input.result : null;
      if (!result) {
        throw new TicketingApplicationError("TICKETING_CHECKIN_INVALID");
      }
      const updated = applyTicketCheckIn(ticket, {
        result,
        occurredAt,
      });
      const checkIn = createTicketCheckIn({
        id: deterministicCheckInId(ticket.id, result, occurredAt),
        ticketId: ticket.id,
        result,
        channel: "online",
        operatorReference: input.operatorReference,
        occurredAt,
        recordedAt: canonicalNow(dependencies.clock),
      });
      if (!checkIn) {
        throw new TicketingApplicationError("TICKETING_CHECKIN_INVALID");
      }
      const existing = (
        await dependencies.checkIns.listByTicketId(ticket.id)
      ).find((entry) => entry.id === checkIn.id);
      if (existing) {
        return Object.freeze({ ticket, checkIn: existing, replayed: true });
      }
      const saved = await dependencies.tickets.save(updated);
      await dependencies.checkIns.append(checkIn);
      return Object.freeze({ ticket: saved, checkIn, replayed: false });
    },

    async syncOfflineEnvelope(input: {
      readonly envelope: TicketOfflineEnvelope;
      readonly operatorReference: unknown;
      readonly recordedAt: unknown;
    }): Promise<TicketOfflineSyncResult> {
      const envelope = verifyTicketOfflineEnvelope(input.envelope, secret);
      if (!envelope) {
        throw new TicketingApplicationError(
          "TICKETING_OFFLINE_ENVELOPE_INVALID",
        );
      }
      const ticket = await dependencies.tickets.findById(envelope.ticketId);
      if (!ticket) {
        throw new TicketingApplicationError("TICKETING_TICKET_NOT_FOUND");
      }
      const verifiedQr = verifyTicketQrPayload(envelope.payload, secret);
      if (!verifiedQr || verifiedQr.ticketId !== ticket.id) {
        throw new TicketingApplicationError(
          "TICKETING_OFFLINE_ENVELOPE_INVALID",
        );
      }
      const recordedAt = normalizeFinancialTimestamp(input.recordedAt);
      if (!recordedAt) {
        throw new TicketingApplicationError(
          "TICKETING_OFFLINE_ENVELOPE_INVALID",
        );
      }
      const existing = await dependencies.offline.findById(envelope.id);
      if (existing) {
        const checkIns = await dependencies.checkIns.listByTicketId(ticket.id);
        const existingCheckIn = checkIns.find(
          (entry) =>
            entry.channel === "offline_sync" &&
            entry.occurredAt === envelope.queuedAt,
        );
        if (!existingCheckIn) {
          throw new TicketingApplicationError(
            "TICKETING_OFFLINE_ENVELOPE_INVALID",
          );
        }
        return Object.freeze({
          envelope: existing,
          ticket,
          checkIn: existingCheckIn,
          replayed: true,
        });
      }

      const result =
        envelope.operation === "validate"
          ? "validated"
          : envelope.operation === "use"
            ? "used"
            : "cancelled";
      const updated = applyTicketCheckIn(ticket, {
        result,
        occurredAt: envelope.queuedAt,
      });
      const checkIn = createTicketCheckIn({
        id: deterministicCheckInId(ticket.id, result, envelope.queuedAt),
        ticketId: ticket.id,
        result,
        channel: "offline_sync",
        operatorReference: input.operatorReference,
        occurredAt: envelope.queuedAt,
        recordedAt,
      });
      if (!checkIn) {
        throw new TicketingApplicationError(
          "TICKETING_OFFLINE_ENVELOPE_INVALID",
        );
      }
      await dependencies.offline.enqueue(envelope);
      const saved = await dependencies.tickets.save(updated);
      await dependencies.checkIns.append(checkIn);
      await dependencies.offline.markSynced(
        envelope.id,
        checkIn.id,
        recordedAt,
      );
      return Object.freeze({
        envelope,
        ticket: saved,
        checkIn,
        replayed: false,
      });
    },
  });
}
