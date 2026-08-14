import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  normalizeBusinessCheckoutHandoff,
  normalizeOrderId,
  type CheckoutApplicationRequest,
  type OrderId,
  type ValidatedBusinessCheckoutHandoff,
} from "@touristic/ordering";

const CONTEXT_ID = /^[a-z0-9][a-z0-9_-]{1,119}$/u;
const ACTOR_SUBJECT = /^[A-Za-z0-9][A-Za-z0-9@._:-]{1,159}$/u;
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;

export type CheckoutRequesterKind = "authenticated" | "guest_capability";

export interface CheckoutRequestContext {
  readonly requesterKind: CheckoutRequesterKind;
  readonly actorSubject: string;
  readonly destinationId: string;
  readonly tenantId: string | null;
}

export interface CheckoutStatusCapability {
  issue(orderId: OrderId): Readonly<{
    token: string;
    tokenHash: string;
  }>;
  verify(orderId: OrderId, token: unknown, storedTokenHash: unknown): boolean;
}

export interface CheckoutReturnUrlPolicy {
  allows(returnUrl: string, context: CheckoutRequestContext): boolean;
}

export interface CheckoutReturnUrlEnvironment {
  readonly PAYMENTS_RETURN_URL_ORIGINS?: string;
  readonly NODE_ENV?: string;
}

export interface CheckoutHandoffCapabilityOptions {
  readonly nowEpochSeconds?: number;
  readonly ttlSeconds?: number;
}

export interface VerifyCheckoutHandoffCapabilityOptions {
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

function normalizeContextId(value: unknown): string {
  const normalized = boundedText(value, 120).toLowerCase();
  return CONTEXT_ID.test(normalized) ? normalized : "";
}

function normalizeActorSubject(value: unknown): string {
  const normalized = boundedText(value, 160);
  return ACTOR_SUBJECT.test(normalized) ? normalized : "";
}

export function normalizeCheckoutCorrelationId(value: unknown): string {
  const normalized = boundedText(value, 120);
  return CORRELATION_ID.test(normalized) ? normalized : "";
}

export function normalizeCheckoutRequestContext(
  input: Readonly<Partial<CheckoutRequestContext>>,
): CheckoutRequestContext | null {
  const requesterKind =
    input.requesterKind === "authenticated" ||
    input.requesterKind === "guest_capability"
      ? input.requesterKind
      : null;
  const actorSubject = normalizeActorSubject(input.actorSubject);
  const destinationId = normalizeContextId(input.destinationId);
  const tenantId =
    input.tenantId === null || input.tenantId === undefined
      ? null
      : normalizeContextId(input.tenantId);
  if (
    !requesterKind ||
    !actorSubject ||
    !destinationId ||
    (input.tenantId !== null && input.tenantId !== undefined && !tenantId)
  ) {
    return null;
  }
  return Object.freeze({
    requesterKind,
    actorSubject,
    destinationId,
    tenantId,
  });
}

function canonicalHandoff(handoff: ValidatedBusinessCheckoutHandoff): string {
  const acceptedTerms = [...handoff.acceptedTerms]
    .sort((left, right) => left.type.localeCompare(right.type))
    .map((acceptance) => ({
      type: acceptance.type,
      version: acceptance.version,
      acceptedAt: acceptance.acceptedAt,
    }));
  return JSON.stringify({
    sessionId: handoff.sessionId,
    planId: handoff.planId,
    contractor: {
      name: handoff.contractor.name,
      email: handoff.contractor.email,
      phone: handoff.contractor.phone,
      document: handoff.contractor.document,
    },
    businessDraft: {
      demoBusinessId: handoff.businessDraft.demoBusinessId,
      displayName: handoff.businessDraft.displayName,
      categoryId: handoff.businessDraft.categoryId,
      specialty: handoff.businessDraft.specialty,
      environment: handoff.businessDraft.environment,
      publishable: handoff.businessDraft.publishable,
    },
    acceptedTerms,
    returnUrl: handoff.returnUrl,
    tutorial: handoff.tutorial,
    requiresPaymentsCapability: handoff.requiresPaymentsCapability,
  });
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedSecret(value: unknown): string {
  const secret = boundedText(value, 1_024);
  return secret.length >= 32 ? secret : "";
}

function safeTextEqual(left: string, right: string): boolean {
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

function validatedHandoff(
  input: CheckoutApplicationRequest | ValidatedBusinessCheckoutHandoff,
): ValidatedBusinessCheckoutHandoff | null {
  return normalizeBusinessCheckoutHandoff(input);
}

export function checkoutHandoffFingerprint(
  handoff: ValidatedBusinessCheckoutHandoff,
): string {
  return sha256Hex(canonicalHandoff(handoff));
}

export function checkoutRequestFingerprint(
  handoff: ValidatedBusinessCheckoutHandoff,
  context: CheckoutRequestContext,
): string {
  return sha256Hex(
    JSON.stringify({
      handoff: canonicalHandoff(handoff),
      requesterKind: context.requesterKind,
      actorSubject: context.actorSubject,
      destinationId: context.destinationId,
      tenantId: context.tenantId,
    }),
  );
}

export function isCheckoutSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

export function createCheckoutStatusCapability(
  secretInput: unknown,
): CheckoutStatusCapability {
  const secret = normalizedSecret(secretInput);
  if (!secret) {
    throw new Error("PAYMENTS_STATUS_TOKEN_SECRET is required");
  }

  function issue(orderIdInput: OrderId) {
    const orderId = normalizeOrderId(orderIdInput);
    if (!orderId) throw new Error("ORDERING_INVALID_ORDER_ID");
    const token =
      "cst_v1_" +
      createHmac("sha256", secret)
        .update("checkout-status:v1:" + orderId)
        .digest("base64url");
    return Object.freeze({
      token,
      tokenHash: sha256Hex(token),
    });
  }

  return Object.freeze({
    issue,
    verify(
      orderIdInput: OrderId,
      tokenInput: unknown,
      storedTokenHashInput: unknown,
    ): boolean {
      const orderId = normalizeOrderId(orderIdInput);
      const token = boundedText(tokenInput, 256);
      const storedTokenHash = boundedText(storedTokenHashInput, 64);
      if (!orderId || !token || !isCheckoutSha256Hex(storedTokenHash)) {
        return false;
      }
      const expected = issue(orderId);
      const providedHash = sha256Hex(token);
      return (
        safeTextEqual(expected.tokenHash, storedTokenHash) &&
        safeTextEqual(providedHash, storedTokenHash)
      );
    },
  });
}

export function createCheckoutHandoffCapability(
  input: CheckoutApplicationRequest | ValidatedBusinessCheckoutHandoff,
  contextInput: Readonly<{
    destinationId?: unknown;
    tenantId?: unknown;
  }>,
  secretInput: unknown,
  options: CheckoutHandoffCapabilityOptions = {},
): string | null {
  const handoff = validatedHandoff(input);
  const secret = normalizedSecret(secretInput);
  const context = normalizeCheckoutRequestContext({
    requesterKind: "guest_capability",
    actorSubject: handoff ? "guest:" + handoff.sessionId : "",
    destinationId: contextInput.destinationId as string,
    tenantId:
      contextInput.tenantId === null || contextInput.tenantId === undefined
        ? null
        : (contextInput.tenantId as string),
  });
  const nowEpochSeconds = Math.floor(
    options.nowEpochSeconds ?? Date.now() / 1_000,
  );
  const ttlSeconds = options.ttlSeconds ?? 15 * 60;
  if (
    !handoff ||
    !secret ||
    !context ||
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
      fp: checkoutHandoffFingerprint(handoff),
      did: context.destinationId,
      tid: context.tenantId,
      iat: nowEpochSeconds,
      exp: nowEpochSeconds + ttlSeconds,
    }),
  ).toString("base64url");
  return part + "." + signature(part, secret);
}

export function verifyCheckoutHandoffCapability(
  tokenInput: unknown,
  input: CheckoutApplicationRequest | ValidatedBusinessCheckoutHandoff,
  secretInput: unknown,
  options: VerifyCheckoutHandoffCapabilityOptions = {},
): CheckoutRequestContext | null {
  const token = boundedText(tokenInput, 2_048);
  const handoff = validatedHandoff(input);
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
  if (!safeTextEqual(providedSignature, signature(part, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const issuedAt = payload.iat;
    const expiresAt = payload.exp;
    const context = normalizeCheckoutRequestContext({
      requesterKind: "guest_capability",
      actorSubject: "guest:" + handoff.sessionId,
      destinationId: payload.did as string,
      tenantId: payload.tid === null ? null : (payload.tid as string),
    });
    if (
      payload.v !== 1 ||
      typeof payload.fp !== "string" ||
      !isCheckoutSha256Hex(payload.fp) ||
      typeof issuedAt !== "number" ||
      typeof expiresAt !== "number" ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      issuedAt > nowEpochSeconds + 30 ||
      expiresAt <= nowEpochSeconds ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > maxTtlSeconds ||
      !context ||
      !safeTextEqual(payload.fp, checkoutHandoffFingerprint(handoff))
    ) {
      return null;
    }
    return context;
  } catch {
    return null;
  }
}

function configuredOrigin(value: string, production: boolean): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      (production && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function createCheckoutReturnUrlPolicyFromEnvironment(
  environment: CheckoutReturnUrlEnvironment,
): CheckoutReturnUrlPolicy {
  const production = environment.NODE_ENV === "production";
  const rawOrigins = boundedText(
    environment.PAYMENTS_RETURN_URL_ORIGINS,
    4_096,
  );
  const entries = rawOrigins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (entries.length === 0 || entries.length > 20) {
    throw new Error("PAYMENTS_RETURN_URL_ORIGINS is required");
  }
  const origins = entries.map((value) => configuredOrigin(value, production));
  if (origins.some((value) => value === null)) {
    throw new Error("PAYMENTS_RETURN_URL_ORIGINS is invalid");
  }
  const allowed = new Set(origins as string[]);

  return Object.freeze({
    allows(returnUrl: string): boolean {
      try {
        const url = new URL(returnUrl);
        if (
          (url.protocol !== "https:" && url.protocol !== "http:") ||
          (production && url.protocol !== "https:") ||
          url.username ||
          url.password
        ) {
          return false;
        }
        return allowed.has(url.origin);
      } catch {
        return false;
      }
    },
  });
}
