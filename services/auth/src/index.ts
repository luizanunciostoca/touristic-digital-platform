import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  normalizeAuthSessionIdentity,
  normalizeBusinessScopes,
  type AuthRole,
  type AuthSessionIdentity,
} from "@touristic/auth";

export * from "./credentials.js";
export * from "./revocation.js";
export * from "./security-state.js";

export const sessionCookieName = "md_dashboard_session";
export const defaultSessionTtlSeconds = 8 * 60 * 60;

export interface AuthSessionPrincipal {
  readonly subject: string;
  readonly email: string;
  readonly role: AuthRole;
  readonly businessIds: readonly string[];
}

export interface CreateSessionTokenOptions {
  readonly nowEpochSeconds?: number;
  readonly ttlSeconds?: number;
  readonly sessionId?: string;
}

export interface SessionCookieOptions {
  readonly maxAgeSeconds?: number;
  readonly secure?: boolean;
}

export interface SameOriginInput {
  readonly expectedOrigin: string;
  readonly origin?: string | null;
  readonly referer?: string | null;
  readonly production?: boolean;
}

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  }).join("");
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return stripControlCharacters(value)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizedSecret(value: unknown): string | null {
  const secret = safeString(value, 1000);
  return secret.length >= 32 ? secret : null;
}

function normalizedTtl(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultSessionTtlSeconds;
  }
  return Math.max(300, Math.min(7 * 24 * 60 * 60, Math.floor(value)));
}

function encodePayload(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signPart(part: string, secret: string): string {
  return createHmac("sha256", secret).update(part).digest("base64url");
}

function timingSafeTextEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = Buffer.from(left ?? "");
  const b = Buffer.from(right ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSessionToken(
  principal: AuthSessionPrincipal,
  secretInput: unknown,
  options: CreateSessionTokenOptions = {},
): string | null {
  const secret = normalizedSecret(secretInput);
  if (!secret) return null;

  const nowEpochSeconds = Math.floor(
    options.nowEpochSeconds ?? Date.now() / 1000,
  );
  if (!Number.isFinite(nowEpochSeconds) || nowEpochSeconds < 0) return null;

  const ttlSeconds = normalizedTtl(options.ttlSeconds);
  const session = normalizeAuthSessionIdentity({
    subject: principal.subject,
    email: principal.email,
    role: principal.role,
    businessIds: normalizeBusinessScopes(principal.businessIds),
    issuedAt: nowEpochSeconds,
    expiresAt: nowEpochSeconds + ttlSeconds,
    sessionId: options.sessionId ?? randomUUID(),
  });
  if (!session) return null;

  const part = encodePayload({
    sub: session.subject,
    email: session.email,
    role: session.role,
    businessIds: session.businessIds,
    iat: session.issuedAt,
    exp: session.expiresAt,
    jti: session.sessionId,
  });

  return `${part}.${signPart(part, secret)}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  secretInput: unknown,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): AuthSessionIdentity | null {
  const secret = normalizedSecret(secretInput);
  if (!secret || !Number.isFinite(nowEpochSeconds)) return null;

  const [part, signature, ...rest] = (token ?? "").split(".");
  if (!part || !signature || rest.length > 0) return null;
  if (!timingSafeTextEqual(signature, signPart(part, secret))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    const session = normalizeAuthSessionIdentity({
      subject: payload.sub,
      email: payload.email,
      role: payload.role,
      businessIds: payload.businessIds,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      sessionId: payload.jti,
    });

    if (!session || session.expiresAt <= nowEpochSeconds) return null;
    return session;
  } catch {
    return null;
  }
}

export function csrfTokenForSession(
  session: AuthSessionIdentity,
  secretInput: unknown,
): string | null {
  const secret = normalizedSecret(secretInput);
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(`csrf:${session.sessionId}`)
    .digest("base64url");
}

export function verifyCsrfToken(
  provided: string | null | undefined,
  session: AuthSessionIdentity,
  secretInput: unknown,
): boolean {
  const expected = csrfTokenForSession(session, secretInput);
  return Boolean(expected && timingSafeTextEqual(provided, expected));
}

export function parseCookies(
  header: string | null | undefined,
): Readonly<Record<string, string>> {
  const cookies: Record<string, string> = {};
  for (const pair of (header ?? "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const rawValue = pair.slice(separator + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }
  return Object.freeze(cookies);
}

export function serializeSessionCookie(
  token: string,
  options: SessionCookieOptions = {},
): string {
  const maxAge = normalizedTtl(options.maxAgeSeconds);
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function serializeClearedSessionCookie(secure = false): string {
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSameOriginAllowed(input: SameOriginInput): boolean {
  const expectedOrigin = safeString(input.expectedOrigin, 300);
  if (!expectedOrigin) return false;

  const origin = safeString(input.origin, 300);
  if (origin) return origin === expectedOrigin;

  const referer = safeString(input.referer, 500);
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return !input.production;
}

export function safeDashboardReturnPath(value: unknown): string {
  const fallback = "/dashboard/index-v3-improved.html";
  const raw = safeString(value, 300);
  if (!raw.startsWith("/dashboard/")) return fallback;
  if (raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
