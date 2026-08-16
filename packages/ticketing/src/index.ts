import { createHmac, timingSafeEqual } from "node:crypto";

import {
  createMoney,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  type Money,
  type PaymentId,
} from "@touristic/financial";
import { normalizeOrderId, type OrderId } from "@touristic/ordering";

export * from "./offline-device-credential.js";

const ID_BODY = /^[A-Za-z0-9_-]+$/u;
const TICKET_CODE = /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/u;
const QR_SIGNATURE = /^[a-f0-9]{64}$/u;
const QR_PAYLOAD = /^tck\.v1\.([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/u;
const DESTINATION_REFERENCE = /^[A-Za-z0-9:_-]{2,120}$/u;
const PRODUCT_REFERENCE = /^[A-Za-z0-9:_-]{2,120}$/u;
const HOLDER_NAME = /^[\p{L}][\p{L}\p{M}' .-]{1,159}$/u;

const ticketIdBrand: unique symbol = Symbol("TicketId");
const ticketCheckInIdBrand: unique symbol = Symbol("TicketCheckInId");
const ticketOfflineEnvelopeIdBrand: unique symbol = Symbol(
  "TicketOfflineEnvelopeId",
);
const ticketSecretBrand: unique symbol = Symbol("TicketSigningSecret");

export type TicketId = string & { readonly [ticketIdBrand]: true };
export type TicketCheckInId = string & {
  readonly [ticketCheckInIdBrand]: true;
};
export type TicketOfflineEnvelopeId = string & {
  readonly [ticketOfflineEnvelopeIdBrand]: true;
};
export type TicketSigningSecret = string & {
  readonly [ticketSecretBrand]: true;
};

export const ticketStatuses = Object.freeze([
  "issued",
  "validated",
  "used",
  "cancelled",
] as const);
export type TicketStatus = (typeof ticketStatuses)[number];

export const ticketCheckInResults = Object.freeze([
  "validated",
  "used",
  "cancelled",
] as const);
export type TicketCheckInResult = (typeof ticketCheckInResults)[number];

export const ticketOfflineOperations = Object.freeze([
  "validate",
  "use",
  "cancel",
] as const);
export type TicketOfflineOperation = (typeof ticketOfflineOperations)[number];

export interface TicketProductReference {
  readonly kind: "tour" | "business_experience";
  readonly reference: string;
}

export interface Ticket {
  readonly id: TicketId;
  readonly orderId: OrderId;
  readonly paymentId: PaymentId;
  readonly destinationId: string;
  readonly product: TicketProductReference;
  readonly holderName: string;
  readonly quantity: number;
  readonly amount: Money;
  readonly code: string;
  readonly status: TicketStatus;
  readonly issuedAt: string;
  readonly validatedAt: string | null;
  readonly usedAt: string | null;
  readonly cancelledAt: string | null;
  readonly updatedAt: string;
}

export interface TicketCheckIn {
  readonly id: TicketCheckInId;
  readonly ticketId: TicketId;
  readonly result: TicketCheckInResult;
  readonly channel: "online" | "offline_sync";
  readonly operatorReference: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
}

export interface TicketIssueRequest {
  readonly orderId: unknown;
  readonly paymentId: unknown;
  readonly destinationId: unknown;
  readonly product: unknown;
  readonly holderName: unknown;
  readonly quantity: unknown;
  readonly amount: unknown;
  readonly issuedAt: unknown;
}

export interface TicketRepositoryPort {
  findById(ticketId: TicketId): Promise<Ticket | null>;
  findByCode(code: string): Promise<Ticket | null>;
  findByOrderId(orderId: OrderId): Promise<readonly Ticket[]>;
  save(ticket: Ticket): Promise<Ticket>;
}

export interface TicketCheckInRepositoryPort {
  append(checkIn: TicketCheckIn): Promise<void>;
  listByTicketId(ticketId: TicketId): Promise<readonly TicketCheckIn[]>;
}

export interface TicketOfflineEnvelope {
  readonly id: TicketOfflineEnvelopeId;
  readonly ticketId: TicketId;
  readonly operation: TicketOfflineOperation;
  readonly payload: string;
  readonly signature: string;
  readonly queuedAt: string;
}

export interface TicketOfflineSyncResult {
  readonly envelope: TicketOfflineEnvelope;
  readonly ticket: Ticket;
  readonly checkIn: TicketCheckIn;
  readonly replayed: boolean;
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

function normalizePrefixedId(
  value: unknown,
  prefix: string,
  maxLength = 120,
): string {
  const normalized = normalizeString(value, maxLength);
  if (!normalized.startsWith(prefix)) return "";
  const body = normalized.slice(prefix.length);
  if (body.length < 8 || !ID_BODY.test(body)) return "";
  return normalized;
}

export function normalizeTicketId(value: unknown): TicketId | null {
  const normalized = normalizePrefixedId(value, "tck_");
  return normalized ? (normalized as TicketId) : null;
}

export function normalizeTicketCheckInId(
  value: unknown,
): TicketCheckInId | null {
  const normalized = normalizePrefixedId(value, "tci_");
  return normalized ? (normalized as TicketCheckInId) : null;
}

export function normalizeTicketOfflineEnvelopeId(
  value: unknown,
): TicketOfflineEnvelopeId | null {
  const normalized = normalizePrefixedId(value, "toe_");
  return normalized ? (normalized as TicketOfflineEnvelopeId) : null;
}

export function normalizeTicketSigningSecret(
  value: unknown,
): TicketSigningSecret | null {
  const normalized = normalizeString(value, 200);
  return normalized.length >= 32 ? (normalized as TicketSigningSecret) : null;
}

export function normalizeTicketCode(value: unknown): string | null {
  const normalized = normalizeString(value, 24).toUpperCase();
  return TICKET_CODE.test(normalized) ? normalized : null;
}

export function normalizeTicketProductReference(
  value: unknown,
): TicketProductReference | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const input = value as Record<string, unknown>;
  const kind =
    input.kind === "tour" || input.kind === "business_experience"
      ? input.kind
      : null;
  const reference = normalizeString(input.reference, 120);
  if (!kind || !PRODUCT_REFERENCE.test(reference)) return null;
  return Object.freeze({ kind, reference });
}

export function createTicketCode(value: unknown): string | null {
  const normalized = normalizeString(value, 64).toUpperCase();
  if (!normalized) return null;
  const compact = normalized.replace(/[^A-Z0-9]/gu, "");
  if (compact.length < 16) return null;
  const candidate = compact.slice(0, 16);
  const formatted = [
    candidate.slice(0, 4),
    candidate.slice(4, 8),
    candidate.slice(8, 12),
    candidate.slice(12, 16),
  ].join("-");
  return normalizeTicketCode(formatted);
}

export function createTicketQrPayload(
  ticketIdInput: unknown,
  secretInput: TicketSigningSecret,
): string | null {
  const ticketId = normalizeTicketId(ticketIdInput);
  const secret = normalizeTicketSigningSecret(secretInput);
  if (!ticketId || !secret) return null;
  const signature = createHmac("sha256", secret)
    .update(`ticket:v1:${ticketId}`)
    .digest("hex");
  return `tck.v1.${ticketId}.${signature}`;
}

export function verifyTicketQrPayload(
  payloadInput: unknown,
  secretInput: TicketSigningSecret,
): { readonly ticketId: TicketId; readonly signature: string } | null {
  const payload = normalizeString(payloadInput, 400);
  const secret = normalizeTicketSigningSecret(secretInput);
  if (!payload || !secret) return null;
  const match = QR_PAYLOAD.exec(payload);
  if (!match) return null;
  const ticketId = normalizeTicketId(match[1]);
  const signature = match[2];
  if (!ticketId || !signature || !QR_SIGNATURE.test(signature)) return null;
  const expected = createHmac("sha256", secret)
    .update(`ticket:v1:${ticketId}`)
    .digest("hex");
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return null;
  return Object.freeze({ ticketId, signature });
}

export function createTicket(input: {
  readonly id: unknown;
  readonly orderId: unknown;
  readonly paymentId: unknown;
  readonly destinationId: unknown;
  readonly product: unknown;
  readonly holderName: unknown;
  readonly quantity: unknown;
  readonly amount: unknown;
  readonly code: unknown;
  readonly status?: unknown;
  readonly issuedAt: unknown;
  readonly validatedAt?: unknown;
  readonly usedAt?: unknown;
  readonly cancelledAt?: unknown;
  readonly updatedAt?: unknown;
}): Ticket | null {
  const id = normalizeTicketId(input.id);
  const orderId = normalizeOrderId(input.orderId);
  const paymentId = normalizePaymentId(input.paymentId);
  const destinationId = normalizeString(input.destinationId, 120);
  const product = normalizeTicketProductReference(input.product);
  const holderName = normalizeString(input.holderName, 160);
  const amountInput = input.amount as Partial<Money> | null | undefined;
  const amount = createMoney(amountInput?.minorUnits, amountInput?.currency);
  const code = normalizeTicketCode(input.code);
  const status =
    typeof input.status === "string" &&
    ticketStatuses.includes(input.status as TicketStatus)
      ? (input.status as TicketStatus)
      : "issued";
  const issuedAt = normalizeFinancialTimestamp(input.issuedAt);
  const validatedAt =
    input.validatedAt === null || input.validatedAt === undefined
      ? null
      : normalizeFinancialTimestamp(input.validatedAt);
  const usedAt =
    input.usedAt === null || input.usedAt === undefined
      ? null
      : normalizeFinancialTimestamp(input.usedAt);
  const cancelledAt =
    input.cancelledAt === null || input.cancelledAt === undefined
      ? null
      : normalizeFinancialTimestamp(input.cancelledAt);
  const updatedAt = normalizeFinancialTimestamp(
    input.updatedAt ?? input.issuedAt,
  );
  if (
    !id ||
    !orderId ||
    !paymentId ||
    !DESTINATION_REFERENCE.test(destinationId) ||
    !product ||
    !HOLDER_NAME.test(holderName) ||
    typeof input.quantity !== "number" ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 20 ||
    !amount ||
    amount.minorUnits <= 0 ||
    !code ||
    !issuedAt ||
    !updatedAt ||
    Date.parse(updatedAt) < Date.parse(issuedAt) ||
    (validatedAt !== null && Date.parse(validatedAt) < Date.parse(issuedAt)) ||
    (usedAt !== null && Date.parse(usedAt) < Date.parse(issuedAt)) ||
    (cancelledAt !== null && Date.parse(cancelledAt) < Date.parse(issuedAt)) ||
    (status === "issued" &&
      (validatedAt !== null || usedAt !== null || cancelledAt !== null)) ||
    (status === "validated" && validatedAt === null) ||
    (status === "used" && usedAt === null) ||
    (status === "cancelled" && cancelledAt === null)
  ) {
    return null;
  }
  return Object.freeze({
    id,
    orderId,
    paymentId,
    destinationId,
    product,
    holderName,
    quantity: input.quantity,
    amount,
    code,
    status,
    issuedAt: new Date(issuedAt).toISOString(),
    validatedAt:
      validatedAt === null ? null : new Date(validatedAt).toISOString(),
    usedAt: usedAt === null ? null : new Date(usedAt).toISOString(),
    cancelledAt:
      cancelledAt === null ? null : new Date(cancelledAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  });
}

export function isTicketTransitionAllowed(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  if (from === to) return true;
  if (from === "issued") return to === "validated" || to === "cancelled";
  if (from === "validated") return to === "used" || to === "cancelled";
  return false;
}

export function assertTicketTransition(
  from: TicketStatus,
  to: TicketStatus,
): void {
  if (!isTicketTransitionAllowed(from, to)) {
    throw new Error(`TICKETING_INVALID_TRANSITION:${from}:${to}`);
  }
}

export function applyTicketCheckIn(
  ticket: Ticket,
  input: {
    readonly result: unknown;
    readonly occurredAt: unknown;
  },
): Ticket {
  const result =
    typeof input.result === "string" &&
    ticketCheckInResults.includes(input.result as TicketCheckInResult)
      ? (input.result as TicketCheckInResult)
      : null;
  const occurredAt = normalizeFinancialTimestamp(input.occurredAt);
  if (!result || !occurredAt) {
    throw new Error("TICKETING_CHECKIN_INVALID");
  }
  const targetStatus: TicketStatus =
    result === "validated"
      ? "validated"
      : result === "used"
        ? "used"
        : "cancelled";
  assertTicketTransition(ticket.status, targetStatus);
  return Object.freeze({
    ...ticket,
    status: targetStatus,
    validatedAt:
      targetStatus === "validated"
        ? new Date(occurredAt).toISOString()
        : ticket.validatedAt,
    usedAt:
      targetStatus === "used"
        ? new Date(occurredAt).toISOString()
        : ticket.usedAt,
    cancelledAt:
      targetStatus === "cancelled"
        ? new Date(occurredAt).toISOString()
        : ticket.cancelledAt,
    updatedAt: new Date(occurredAt).toISOString(),
  });
}

export function createTicketCheckIn(input: {
  readonly id: unknown;
  readonly ticketId: unknown;
  readonly result: unknown;
  readonly channel: unknown;
  readonly operatorReference: unknown;
  readonly occurredAt: unknown;
  readonly recordedAt: unknown;
}): TicketCheckIn | null {
  const id = normalizeTicketCheckInId(input.id);
  const ticketId = normalizeTicketId(input.ticketId);
  const result =
    typeof input.result === "string" &&
    ticketCheckInResults.includes(input.result as TicketCheckInResult)
      ? (input.result as TicketCheckInResult)
      : null;
  const channel =
    input.channel === "online" || input.channel === "offline_sync"
      ? input.channel
      : null;
  const operatorReference = normalizeString(input.operatorReference, 120);
  const occurredAt = normalizeFinancialTimestamp(input.occurredAt);
  const recordedAt = normalizeFinancialTimestamp(input.recordedAt);
  if (
    !id ||
    !ticketId ||
    !result ||
    !channel ||
    !operatorReference ||
    !ID_BODY.test(operatorReference) ||
    !occurredAt ||
    !recordedAt ||
    Date.parse(recordedAt) < Date.parse(occurredAt)
  ) {
    return null;
  }
  return Object.freeze({
    id,
    ticketId,
    result,
    channel,
    operatorReference,
    occurredAt: new Date(occurredAt).toISOString(),
    recordedAt: new Date(recordedAt).toISOString(),
  });
}

export function createTicketOfflineEnvelope(input: {
  readonly id: unknown;
  readonly ticketId: unknown;
  readonly operation: unknown;
  readonly payload: unknown;
  readonly signature: unknown;
  readonly queuedAt: unknown;
}): TicketOfflineEnvelope | null {
  const id = normalizeTicketOfflineEnvelopeId(input.id);
  const ticketId = normalizeTicketId(input.ticketId);
  const operation =
    typeof input.operation === "string" &&
    ticketOfflineOperations.includes(input.operation as TicketOfflineOperation)
      ? (input.operation as TicketOfflineOperation)
      : null;
  const payload = normalizeString(input.payload, 400);
  const signature = normalizeString(input.signature, 64);
  const queuedAt = normalizeFinancialTimestamp(input.queuedAt);
  if (
    !id ||
    !ticketId ||
    !operation ||
    !payload ||
    !QR_SIGNATURE.test(signature) ||
    !queuedAt
  ) {
    return null;
  }
  return Object.freeze({
    id,
    ticketId,
    operation,
    payload,
    signature,
    queuedAt: new Date(queuedAt).toISOString(),
  });
}

export function createTicketOfflineEnvelopeSignature(
  input: {
    readonly ticketId: unknown;
    readonly operation: unknown;
    readonly payload: unknown;
    readonly queuedAt: unknown;
  },
  secretInput: TicketSigningSecret,
): string | null {
  const ticketId = normalizeTicketId(input.ticketId);
  const operation =
    typeof input.operation === "string" &&
    ticketOfflineOperations.includes(input.operation as TicketOfflineOperation)
      ? (input.operation as TicketOfflineOperation)
      : null;
  const payload = normalizeString(input.payload, 400);
  const queuedAt = normalizeFinancialTimestamp(input.queuedAt);
  const secret = normalizeTicketSigningSecret(secretInput);
  if (!ticketId || !operation || !payload || !queuedAt || !secret) return null;
  return createHmac("sha256", secret)
    .update(
      `ticket-offline:v1:${ticketId}:${operation}:${payload}:${new Date(queuedAt).toISOString()}`,
    )
    .digest("hex");
}

export function verifyTicketOfflineEnvelope(
  envelopeInput: TicketOfflineEnvelope,
  secretInput: TicketSigningSecret,
): TicketOfflineEnvelope | null {
  const envelope = createTicketOfflineEnvelope(envelopeInput);
  const secret = normalizeTicketSigningSecret(secretInput);
  if (!envelope || !secret) return null;
  const expected = createTicketOfflineEnvelopeSignature(
    {
      ticketId: envelope.ticketId,
      operation: envelope.operation,
      payload: envelope.payload,
      queuedAt: envelope.queuedAt,
    },
    secret,
  );
  if (!expected) return null;
  const left = Buffer.from(envelope.signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return null;
  return envelope;
}
