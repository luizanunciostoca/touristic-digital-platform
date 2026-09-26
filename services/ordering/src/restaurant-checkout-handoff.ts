import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  normalizeRestaurantCheckoutHandoff,
  type RestaurantCheckoutApplicationRequest,
  type ValidatedRestaurantCheckoutHandoff,
} from "@touristic/ordering/restaurant-checkout";

import {
  normalizeCheckoutRequestContext,
  type CheckoutRequesterKind,
  type CheckoutRequestContext,
} from "./checkout-security.js";

const ACTOR_SUBJECT = /^[A-Za-z0-9][A-Za-z0-9@._:-]{1,159}$/u;
const DESTINATION_ID = /^[a-z0-9][a-z0-9_-]{1,119}$/u;
const TENANT_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : "";
}

function secret(value: unknown): string {
  const normalized = text(value, 1_024);
  return normalized.length >= 32 ? normalized : "";
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(part: string, key: string): string {
  return createHmac("sha256", key).update(part).digest("base64url");
}

function canonical(handoff: ValidatedRestaurantCheckoutHandoff): string {
  return JSON.stringify({
    reservationReference: handoff.reservationReference,
    customer: handoff.customer,
    returnUrl: handoff.returnUrl,
    requiresPaymentsCapability: handoff.requiresPaymentsCapability,
  });
}

export function restaurantCheckoutHandoffFingerprint(
  handoff: ValidatedRestaurantCheckoutHandoff,
): string {
  return createHash("sha256").update(canonical(handoff)).digest("hex");
}

export function restaurantCheckoutRequestFingerprint(
  handoff: ValidatedRestaurantCheckoutHandoff,
  context: CheckoutRequestContext,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        handoff: canonical(handoff),
        requesterKind: context.requesterKind,
        actorSubject: context.actorSubject,
        destinationId: context.destinationId,
        tenantId: context.tenantId,
      }),
    )
    .digest("hex");
}

export function createRestaurantCheckoutHandoffCapability(
  input:
    RestaurantCheckoutApplicationRequest | ValidatedRestaurantCheckoutHandoff,
  contextInput: Readonly<{
    actorSubject?: unknown;
    destinationId?: unknown;
    tenantId?: unknown;
    requesterKind?: CheckoutRequesterKind;
  }>,
  secretInput: unknown,
  options: Readonly<{
    nowEpochSeconds?: number;
    ttlSeconds?: number;
  }> = {},
): string | null {
  const handoff = normalizeRestaurantCheckoutHandoff(input);
  const actorSubject = text(contextInput.actorSubject, 160);
  const destinationId = text(contextInput.destinationId, 120).toLowerCase();
  const tenantId = text(contextInput.tenantId, 120);
  const key = secret(secretInput);
  const requesterKind = contextInput.requesterKind ?? "authenticated";
  const nowEpochSeconds = Math.floor(
    options.nowEpochSeconds ?? Date.now() / 1_000,
  );
  const ttlSeconds = options.ttlSeconds ?? 10 * 60;
  if (
    !handoff ||
    !ACTOR_SUBJECT.test(actorSubject) ||
    !DESTINATION_ID.test(destinationId) ||
    !TENANT_ID.test(tenantId) ||
    !key ||
    (requesterKind !== "authenticated" &&
      requesterKind !== "guest_capability") ||
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
      fp: restaurantCheckoutHandoffFingerprint(handoff),
      sub: actorSubject,
      did: destinationId,
      tid: tenantId,
      rk: requesterKind,
      rid: handoff.reservationReference,
      iat: nowEpochSeconds,
      exp: nowEpochSeconds + ttlSeconds,
    }),
  ).toString("base64url");
  return part + "." + signature(part, key);
}

export function verifyRestaurantCheckoutHandoffCapability(
  tokenInput: unknown,
  input:
    RestaurantCheckoutApplicationRequest | ValidatedRestaurantCheckoutHandoff,
  secretInput: unknown,
  options: Readonly<{
    nowEpochSeconds?: number;
    maxTtlSeconds?: number;
  }> = {},
): CheckoutRequestContext | null {
  const token = text(tokenInput, 2_048);
  const handoff = normalizeRestaurantCheckoutHandoff(input);
  const key = secret(secretInput);
  const nowEpochSeconds = Math.floor(
    options.nowEpochSeconds ?? Date.now() / 1_000,
  );
  const maxTtlSeconds = options.maxTtlSeconds ?? 30 * 60;
  if (
    !token ||
    !handoff ||
    !key ||
    !Number.isSafeInteger(nowEpochSeconds) ||
    !Number.isSafeInteger(maxTtlSeconds) ||
    maxTtlSeconds < 60 ||
    maxTtlSeconds > 30 * 60
  ) {
    return null;
  }
  const [part, provided, ...rest] = token.split(".");
  if (!part || !provided || rest.length > 0) return null;
  if (!safeEqual(provided, signature(part, key))) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const actorSubject = text(payload.sub, 160);
    const destinationId = text(payload.did, 120).toLowerCase();
    const tenantId = text(payload.tid, 120);
    const requesterKind: CheckoutRequesterKind | null =
      payload.rk === "guest_capability"
        ? "guest_capability"
        : payload.rk === "authenticated"
          ? "authenticated"
          : null;
    const issuedAt = payload.iat;
    const expiresAt = payload.exp;
    if (
      payload.v !== 1 ||
      payload.rid !== handoff.reservationReference ||
      typeof payload.fp !== "string" ||
      payload.fp.length !== 64 ||
      !ACTOR_SUBJECT.test(actorSubject) ||
      !DESTINATION_ID.test(destinationId) ||
      !TENANT_ID.test(tenantId) ||
      !requesterKind ||
      typeof issuedAt !== "number" ||
      typeof expiresAt !== "number" ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      issuedAt > nowEpochSeconds + 30 ||
      expiresAt <= nowEpochSeconds ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > maxTtlSeconds ||
      !safeEqual(payload.fp, restaurantCheckoutHandoffFingerprint(handoff))
    ) {
      return null;
    }
    return normalizeCheckoutRequestContext({
      requesterKind,
      actorSubject,
      destinationId,
      tenantId,
    });
  } catch {
    return null;
  }
}
