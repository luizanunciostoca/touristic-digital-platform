import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  TicketingPublicHttpTransport as AuthenticatedTicketingPublicHttpTransport,
  ticketingHttpPrefix,
  type TicketingHttpActor,
  type TicketingHttpAuthorizationDecision,
  type TicketingHttpAuthorizationPort,
  type TicketingHttpRequest,
  type TicketingHttpResponse,
  type TicketingPublicHttpTransportDependencies,
} from "./public-http-transport.js";

const COMMERCE_SESSION_COOKIE = "morro_commerce_session";
const COMMERCE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const COMMERCE_SESSION_VERSION = 1;
const PUBLIC_CATALOG_SUBJECT = "public:catalog";
const GUEST_SUBJECT = /^guest:[a-f0-9]{32}$/u;

type CommerceSessionClaims = Readonly<{
  version: 1;
  subject: string;
  issuedAt: number;
  expiresAt: number;
}>;

type CommerceSession = Readonly<{
  claims: CommerceSessionClaims;
  token: string;
  csrfToken: string;
}>;

function firstHeader(value: unknown): string {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(request: TicketingHttpRequest, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === target) return firstHeader(value);
  }
  return "";
}

function parseCookies(value: string): Readonly<Record<string, string>> {
  const parsed: Record<string, string> = {};
  for (const segment of value.split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const cookieValue = segment.slice(separator + 1).trim();
    if (!name || !cookieValue) continue;
    try {
      parsed[name] = decodeURIComponent(cookieValue);
    } catch {
      // Invalid cookie encoding is ignored and never becomes authority.
    }
  }
  return Object.freeze(parsed);
}

function deriveKey(rootSecret: string): Buffer {
  return createHmac("sha256", rootSecret)
    .update("morro-digital:ticketing:commerce-session:key:v1")
    .digest();
}

function signature(payload: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

function csrfForToken(token: string, key: Buffer): string {
  return createHmac("sha256", key)
    .update(`morro-digital:ticketing:commerce-session:csrf:v1:${token}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function unixSeconds(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error("TICKETING_CLOCK_INVALID");
  }
  return Math.floor(milliseconds / 1_000);
}

function sameOrigin(request: TicketingHttpRequest): boolean {
  const origin = header(request, "origin");
  const host = header(request, "x-forwarded-host") || header(request, "host");
  const forwardedProto = header(request, "x-forwarded-proto").split(",", 1)[0];
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.host !== host) return false;
    if (forwardedProto && parsed.protocol !== `${forwardedProto}:`) return false;
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function secureRequest(request: TicketingHttpRequest): boolean {
  const forwardedProto = header(request, "x-forwarded-proto").split(",", 1)[0];
  if (forwardedProto) return forwardedProto === "https";
  try {
    return new URL(header(request, "origin")).protocol === "https:";
  } catch {
    return false;
  }
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
  correlationId: string,
  headers: Readonly<Record<string, string>> = {},
): TicketingHttpResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlationId,
      ...headers,
    }),
    body: Object.freeze({ ...body }),
  });
}

class CommerceSessionAuthority {
  private readonly key: Buffer;

  constructor(
    rootSecret: string,
    private readonly clock: { now(): string },
  ) {
    if (rootSecret.trim().length < 32) {
      throw new Error("TICKETING_COMMERCE_SESSION_SECRET_INVALID");
    }
    this.key = deriveKey(rootSecret);
  }

  issue(request: TicketingHttpRequest): CommerceSession {
    const issuedAt = unixSeconds(this.clock.now());
    const claims: CommerceSessionClaims = Object.freeze({
      version: COMMERCE_SESSION_VERSION,
      subject: `guest:${randomBytes(16).toString("hex")}`,
      issuedAt,
      expiresAt: issuedAt + COMMERCE_SESSION_TTL_SECONDS,
    });
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString(
      "base64url",
    );
    const token = `${payload}.${signature(payload, this.key).toString("base64url")}`;
    return Object.freeze({
      claims,
      token,
      csrfToken: csrfForToken(token, this.key),
    });
  }

  resolve(request: TicketingHttpRequest): CommerceSession | null {
    const token = parseCookies(header(request, "cookie"))[COMMERCE_SESSION_COOKIE];
    if (!token || token.length > 1_024) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, suppliedSignature] = parts;
    const expectedSignature = signature(payload, this.key).toString("base64url");
    if (!safeEqual(suppliedSignature, expectedSignature)) return null;
    let claims: unknown;
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const value = claims as Record<string, unknown>;
    const now = unixSeconds(this.clock.now());
    if (
      value.version !== COMMERCE_SESSION_VERSION ||
      typeof value.subject !== "string" ||
      !GUEST_SUBJECT.test(value.subject) ||
      typeof value.issuedAt !== "number" ||
      !Number.isSafeInteger(value.issuedAt) ||
      typeof value.expiresAt !== "number" ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.issuedAt > now + 60 ||
      value.expiresAt <= now ||
      value.expiresAt - value.issuedAt !== COMMERCE_SESSION_TTL_SECONDS
    ) {
      return null;
    }
    const normalized: CommerceSessionClaims = Object.freeze({
      version: COMMERCE_SESSION_VERSION,
      subject: value.subject,
      issuedAt: value.issuedAt,
      expiresAt: value.expiresAt,
    });
    return Object.freeze({
      claims: normalized,
      token,
      csrfToken: csrfForToken(token, this.key),
    });
  }

  mutationAllowed(request: TicketingHttpRequest, session: CommerceSession): boolean {
    return (
      sameOrigin(request) &&
      safeEqual(header(request, "x-csrf-token"), session.csrfToken)
    );
  }

  cookie(request: TicketingHttpRequest, session: CommerceSession): string {
    const secure = secureRequest(request) ? "; Secure" : "";
    return `${COMMERCE_SESSION_COOKIE}=${encodeURIComponent(session.token)}; Path=/; Max-Age=${COMMERCE_SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure}`;
  }
}

class CommerceAwareAuthorization implements TicketingHttpAuthorizationPort {
  constructor(
    private readonly base: TicketingHttpAuthorizationPort,
    private readonly sessions: CommerceSessionAuthority,
  ) {}

  async authorize(
    request: TicketingHttpRequest,
    input: { readonly mutation: boolean; readonly admin?: boolean },
  ): Promise<TicketingHttpAuthorizationDecision> {
    const relative = request.pathname.slice(ticketingHttpPrefix.length);
    if (relative === "/inventory" && request.method.toUpperCase() === "GET") {
      return Object.freeze({
        allowed: true,
        actor: Object.freeze({
          subject: PUBLIC_CATALOG_SUBJECT,
          role: "viewer" as const,
        }),
      });
    }

    const baseDecision = await this.base.authorize(request, input);
    if (baseDecision.allowed || baseDecision.reason !== "authentication_required") {
      return baseDecision;
    }
    if (input.admin) return baseDecision;

    const session = this.sessions.resolve(request);
    if (!session) return baseDecision;
    if (input.mutation && !sameOrigin(request)) {
      return Object.freeze({ allowed: false, reason: "cross_origin_request" });
    }
    if (input.mutation && !this.sessions.mutationAllowed(request, session)) {
      return Object.freeze({ allowed: false, reason: "invalid_csrf" });
    }
    return Object.freeze({
      allowed: true,
      actor: Object.freeze({
        subject: session.claims.subject,
        // The legacy transport only consumes role for typing; the wrapper
        // has already constrained guest authority to non-admin commerce routes.
        role: "editor" as const,
      }),
    });
  }
}

export class TicketingCommerceHttpTransport {
  private readonly legacy: AuthenticatedTicketingPublicHttpTransport;
  private readonly sessions: CommerceSessionAuthority | null;

  constructor(dependencies: TicketingPublicHttpTransportDependencies) {
    if (!dependencies.enabled) {
      this.sessions = null;
      this.legacy = new AuthenticatedTicketingPublicHttpTransport(dependencies);
      return;
    }
    this.sessions = new CommerceSessionAuthority(
      dependencies.offlineProvisioningSecret,
      dependencies.clock,
    );
    this.legacy = new AuthenticatedTicketingPublicHttpTransport({
      ...dependencies,
      authorization: new CommerceAwareAuthorization(
        dependencies.authorization,
        this.sessions,
      ),
    });
  }

  matches(pathname: string): boolean {
    return this.legacy.matches(pathname);
  }

  async handle(request: TicketingHttpRequest): Promise<TicketingHttpResponse> {
    if (!this.sessions) return this.legacy.handle(request);
    const relative = request.pathname.slice(ticketingHttpPrefix.length);
    if (relative !== "/consumer-session") {
      return this.legacy.handle(request);
    }

    const correlationId =
      request.correlationId || header(request, "x-correlation-id") || "commerce";
    if (request.method.toUpperCase() !== "POST") {
      return response(405, { error: "METHOD_NOT_ALLOWED" }, correlationId, {
        Allow: "POST",
      });
    }
    if (!sameOrigin(request)) {
      return response(403, { error: "ORIGIN_DENIED" }, correlationId);
    }

    const session = this.sessions.resolve(request) ?? this.sessions.issue(request);
    return response(
      200,
      {
        data: Object.freeze({
          subject: session.claims.subject,
          csrfToken: session.csrfToken,
          expiresAt: new Date(session.claims.expiresAt * 1_000).toISOString(),
        }),
      },
      correlationId,
      {
        "Set-Cookie": this.sessions.cookie(request, session),
        Vary: "Cookie",
      },
    );
  }
}

export { COMMERCE_SESSION_COOKIE, COMMERCE_SESSION_TTL_SECONDS };
