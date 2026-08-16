import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  normalizeTicketingCheckoutHandoff,
  type TicketingCheckoutApplicationRequest,
  type ValidatedTicketingCheckoutHandoff,
} from "@touristic/ordering/ticketing-checkout";

import {
  normalizeCheckoutRequestContext,
  type CheckoutRequestContext,
} from "./checkout-security.js";

const ACTOR_SUBJECT = /^[A-Za-z0-9][A-Za-z0-9@._:-]{1,159}$/u;
const DESTINATION_ID = /^[a-z0-9][a-z0-9_-]{1,119}$/u;

export interface TicketingCheckoutHandoffCapabilityOptions {
  readonly nowEpochSeconds?: number;
  readonly ttlSeconds?: number;
}

export interface VerifyTicketingCheckoutHandoffCapabilityOptions {
  readonly nowEpochSeconds?: number;
  readonly maxTtlSeconds?: number;
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return "";
  const forbidden = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  return forbidden ? "" : normalized;
}

function normalizedSecret(value: unknown): string {
  const secret = boundedText(value, 1_024);
  return secret.length >= 32 ? secret : "";
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signature(part: string, secret: string): string {
  return createHmac("sha256", secret).update(part).digest("base64url");
}

function canonicalHandoff(handoff: ValidatedTicketingCheckoutHandoff): string {
  return JSON.stringify({
    reservationReference: handoff.reservationReference,
    customer: {
      name: handoff.customer.name,
      email: handoff.customer.email,
      phone: handoff.customer.phone,
      document: handoff.customer.document,
    },
    returnUrl: handoff.returnUrl,
    requiresPaymentsCapability: handoff.requiresPaymentsCapability,
  });
}

export function ticketingCheckoutHandoffFingerprint(
  handoff: ValidatedTicketingCheckoutHandoff,
): string {
  return createHash("sha256").update(canonicalHandoff(handoff)).digest("hex");
}

export function ticketingCheckoutRequestFingerprint(
  handoff: ValidatedTicketingCheckoutHandoff,
  context: CheckoutRequestContext,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        handoff: canonicalHandoff(handoff),
        requesterKind: context.requesterKind,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
      }),
    )
    .digest("hex");
}

export function createTicketingCheckoutHandoffCapability(
  input:
    TicketingCheckoutApplicationRequest | ValidatedTicketingCheckoutHandoff,
  contextInput: Readonly<{
    actorSubject?: unknown;
    destinationId?: unknown;
  }>,
  secretInput: unknown,
  options: TicketingCheckoutHandoffCapabilityOptions = {},
): string | null {
  const handoff = normalizeTicketingCheckoutHandoff(input);
  const actorSubject = boundedText(contextInput.actorSubject, 160);
  const destinationId = boundedText(
    contextInput.destinationId,
    120,
  ).toLowerCase();
  const secret = normalizedSecret(secretInput);
  const nowEpochSeconds = Math.floor(
    options.nowEpochSeconds ?? Date.now() / 1_000,
  );
  const ttlSeconds = options.ttlSeconds ?? 10 * 60;
  if (
    !handoff ||
    !ACTOR_SUBJECT.test(actorSubject) ||
    !DESTINATION_ID.test(destinationId) ||
    !secret ||
    !Number.isSafeInteger(nowEpochSeconds) ||
    nowEpochSeconds < 0 ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 60 ||
    ttlSeconds > 30 * 60
  ) {
    return null;
  }
  const part = Buffer.from(
    JSON.stringify({
      v: 1,
      fp: ticketingCheckoutHandoffFingerprint(handoff),
      sub: actorSubject,
      did: destinationId,
      rid: handoff.reservationReference,
      iat: nowEpochSeconds,
      exp: nowEpochSeconds + ttlSeconds,
    }),
  ).toString("base64url");
  return part + "." + signature(part, secret);
}

export function verifyTicketingCheckoutHandoffCapability(
  tokenInput: unknown,
  input:
    TicketingCheckoutApplicationRequest | ValidatedTicketingCheckoutHandoff,
  secretInput: unknown,
  options: VerifyTicketingCheckoutHandoffCapabilityOptions = {},
): CheckoutRequestContext | null {
  const token = boundedText(tokenInput, 2_048);
  const handoff = normalizeTicketingCheckoutHandoff(input);
  const secret = normalizedSecret(secretInput);
  const nowEpochSeconds = Math.floor(
    options.nowEpochSeconds ?? Date.now() / 1_000,
  );
  const maxTtlSeconds = options.maxTtlSeconds ?? 30 * 60;
  if (
    !token ||
    !handoff ||
    !secret ||
    !Number.isSafeInteger(nowEpochSeconds) ||
    !Number.isSafeInteger(maxTtlSeconds) ||
    maxTtlSeconds < 60 ||
    maxTtlSeconds > 30 * 60
  ) {
    return null;
  }
  const [part, providedSignature, ...rest] = token.split(".");
  if (!part || !providedSignature || rest.length > 0) return null;
  if (!safeEqual(providedSignature, signature(part, secret))) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const issuedAt = payload.iat;
    const expiresAt = payload.exp;
    const actorSubject = boundedText(payload.sub, 160);
    const destinationId = boundedText(payload.did, 120).toLowerCase();
    const context = normalizeCheckoutRequestContext({
      requesterKind: "authenticated",
      actorSubject,
      destinationId,
      tenantId: null,
    });
    if (
      payload.v !== 1 ||
      typeof payload.fp !== "string" ||
      payload.fp.length !== 64 ||
      payload.rid !== handoff.reservationReference ||
      !ACTOR_SUBJECT.test(actorSubject) ||
      !DESTINATION_ID.test(destinationId) ||
      typeof issuedAt !== "number" ||
      typeof expiresAt !== "number" ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      issuedAt > nowEpochSeconds + 30 ||
      expiresAt <= nowEpochSeconds ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > maxTtlSeconds ||
      !context ||
      !safeEqual(payload.fp, ticketingCheckoutHandoffFingerprint(handoff))
    ) {
      return null;
    }
    return context;
  } catch {
    return null;
  }
}
