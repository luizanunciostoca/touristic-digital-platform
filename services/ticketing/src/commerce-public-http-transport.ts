import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { TicketingBusinessInventoryRepositoryPort } from "./business-inventory-repository.js";
import {
  TicketingPublicHttpTransport,
  ticketingHttpPrefix,
  type TicketingHttpActor,
  type TicketingHttpAuthorizationDecision,
  type TicketingHttpAuthorizationPort,
  type TicketingHttpRequest,
  type TicketingHttpResponse,
  type TicketingPublicHttpTransportDependencies,
} from "./public-http-transport.js";

const SESSION_COOKIE = "morro_commerce_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_VERSION = 1;
const BUSINESS_ID = /^[a-z0-9][a-z0-9_-]{0,119}$/u;
const INVENTORY_ID = /^mpi_[a-f0-9]{32}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,120}$/u;

interface CommerceSessionClaims {
  readonly version: 1;
  readonly subject: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

interface CommerceSession {
  readonly claims: CommerceSessionClaims;
  readonly token: string;
  readonly csrfToken: string;
}

interface ScopedTicketingActor extends TicketingHttpActor {
  readonly businessIds?: readonly string[];
}

export interface TicketingCommerceHttpTransportDependencies extends TicketingPublicHttpTransportDependencies {
  readonly businessInventory: TicketingBusinessInventoryRepositoryPort;
  readonly destinationId: string;
}

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

function denied(
  decision: Extract<TicketingHttpAuthorizationDecision, { allowed: false }>,
  correlationId: string,
): TicketingHttpResponse {
  if (decision.reason === "authentication_required") {
    return response(401, { error: "AUTH_REQUIRED" }, correlationId);
  }
  if (decision.reason === "invalid_csrf") {
    return response(403, { error: "INVALID_CSRF" }, correlationId);
  }
  if (decision.reason === "cross_origin_request") {
    return response(403, { error: "ORIGIN_DENIED" }, correlationId);
  }
  if (decision.reason === "admin_required") {
    return response(403, { error: "ADMIN_REQUIRED" }, correlationId);
  }
  return response(403, { error: "READ_ONLY_ROLE" }, correlationId);
}

function correlationId(request: TicketingHttpRequest): string {
  const value = request.correlationId ?? header(request, "x-correlation-id");
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(value)
    ? value
    : "commerce:request";
}

function cookieValue(request: TicketingHttpRequest, name: string): string {
  const source = header(request, "cookie");
  for (const part of source.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    if (part.slice(0, index).trim() === name)
      return part.slice(index + 1).trim();
  }
  return "";
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requestOrigin(request: TicketingHttpRequest): URL | null {
  const value = header(request, "origin");
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function forwardedProtocol(request: TicketingHttpRequest): string {
  return (
    header(request, "x-forwarded-proto")
      .split(",", 1)[0]
      ?.trim()
      .toLowerCase() ?? ""
  );
}

function sameOrigin(request: TicketingHttpRequest): boolean {
  const origin = requestOrigin(request);
  const host = header(request, "host").toLowerCase();
  if (!origin || !host || origin.host.toLowerCase() !== host) return false;
  const forwardedProto = forwardedProtocol(request);
  return !forwardedProto || `${forwardedProto}:` === origin.protocol;
}

function secureRequest(request: TicketingHttpRequest): boolean {
  const forwardedProto = forwardedProtocol(request);
  if (forwardedProto) return forwardedProto === "https";
  return requestOrigin(request)?.protocol === "https:";
}

function consumerRouteAllowed(pathname: string, method: string): boolean {
  const relative = pathname.slice(ticketingHttpPrefix.length);
  if (relative === "/reservations")
    return method === "GET" || method === "POST";
  if (/^\/reservations\/trv_[A-Za-z0-9_-]+$/u.test(relative))
    return method === "GET";
  if (/^\/reservations\/trv_[A-Za-z0-9_-]+\/ticket$/u.test(relative))
    return method === "GET";
  if (/^\/reservations\/trv_[A-Za-z0-9_-]+\/cancel$/u.test(relative))
    return method === "POST";
  return false;
}

class CommerceSessionAuthority {
  private readonly key: Buffer;

  constructor(rootSecret: string) {
    if (rootSecret.length < 32)
      throw new Error("TICKETING_COMMERCE_SESSION_SECRET_REQUIRED");
    this.key = createHmac("sha256", rootSecret)
      .update("morro-digital:commerce-session:v1")
      .digest();
  }

  private signature(payload: string): string {
    return createHmac("sha256", this.key).update(payload).digest("base64url");
  }

  private csrf(token: string): string {
    return createHmac("sha256", this.key)
      .update(`csrf:${token}`)
      .digest("base64url");
  }

  issue(nowMs = Date.now()): CommerceSession {
    const issuedAt = Math.floor(nowMs / 1_000);
    const claims: CommerceSessionClaims = Object.freeze({
      version: SESSION_VERSION,
      subject: `guest:${randomBytes(16).toString("hex")}`,
      issuedAt,
      expiresAt: issuedAt + SESSION_TTL_SECONDS,
    });
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const token = `${payload}.${this.signature(payload)}`;
    return Object.freeze({ claims, token, csrfToken: this.csrf(token) });
  }

  resolve(token: string, nowMs = Date.now()): CommerceSession | null {
    const [payload, signature, extra] = token.split(".");
    if (
      !payload ||
      !signature ||
      extra ||
      !safeEqual(this.signature(payload), signature)
    )
      return null;
    try {
      const parsed = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as Partial<CommerceSessionClaims>;
      const now = Math.floor(nowMs / 1_000);
      if (
        parsed.version !== SESSION_VERSION ||
        typeof parsed.subject !== "string" ||
        !/^guest:[a-f0-9]{32}$/u.test(parsed.subject) ||
        !Number.isSafeInteger(parsed.issuedAt) ||
        !Number.isSafeInteger(parsed.expiresAt) ||
        (parsed.issuedAt as number) > now + 30 ||
        (parsed.expiresAt as number) <= now ||
        (parsed.expiresAt as number) - (parsed.issuedAt as number) !==
          SESSION_TTL_SECONDS
      ) {
        return null;
      }
      const claims = Object.freeze(parsed as CommerceSessionClaims);
      return Object.freeze({ claims, token, csrfToken: this.csrf(token) });
    } catch {
      return null;
    }
  }

  fromRequest(request: TicketingHttpRequest): CommerceSession | null {
    const token = cookieValue(request, SESSION_COOKIE);
    return token ? this.resolve(token) : null;
  }

  cookie(session: CommerceSession, secure: boolean): string {
    return [
      `${SESSION_COOKIE}=${session.token}`,
      "Path=/",
      `Max-Age=${SESSION_TTL_SECONDS}`,
      "HttpOnly",
      "SameSite=Strict",
      ...(secure ? ["Secure"] : []),
    ].join("; ");
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
    const method = request.method.toUpperCase();
    if (
      request.pathname === `${ticketingHttpPrefix}/inventory` &&
      method === "GET"
    ) {
      return Object.freeze({
        allowed: true,
        actor: Object.freeze({
          subject: "public:catalog",
          role: "viewer" as const,
        }),
      });
    }

    const authenticated = await this.base.authorize(request, input);
    if (
      authenticated.allowed ||
      authenticated.reason !== "authentication_required"
    ) {
      return authenticated;
    }
    if (input.admin || !consumerRouteAllowed(request.pathname, method))
      return authenticated;

    const session = this.sessions.fromRequest(request);
    if (!session) return authenticated;
    if (input.mutation) {
      if (!sameOrigin(request)) {
        return Object.freeze({
          allowed: false,
          reason: "cross_origin_request" as const,
        });
      }
      if (!safeEqual(header(request, "x-csrf-token"), session.csrfToken)) {
        return Object.freeze({
          allowed: false,
          reason: "invalid_csrf" as const,
        });
      }
    }
    return Object.freeze({
      allowed: true,
      actor: Object.freeze({
        subject: session.claims.subject,
        role: "editor" as const,
      }),
    });
  }
}

export class TicketingCommerceHttpTransport {
  private readonly sessions: CommerceSessionAuthority;
  private readonly legacy: TicketingPublicHttpTransport;

  constructor(
    private readonly dependencies: TicketingCommerceHttpTransportDependencies,
  ) {
    this.sessions = new CommerceSessionAuthority(
      dependencies.offlineProvisioningSecret,
    );
    this.legacy = new TicketingPublicHttpTransport({
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

  private async handleBusinessInventory(
    request: TicketingHttpRequest,
    businessId: string,
    inventoryId?: string,
  ): Promise<TicketingHttpResponse> {
    const correlation = correlationId(request);
    const method = request.method.toUpperCase();
    const decision = await this.dependencies.authorization.authorize(request, {
      mutation: method !== "GET",
    });
    if (!decision.allowed) return denied(decision, correlation);
    const actor = decision.actor as ScopedTicketingActor;
    const scopedBusinessIds = Object.freeze(
      (actor.businessIds ?? []).map((value) => value.trim().toLowerCase()),
    );
    if (actor.role !== "admin" && !scopedBusinessIds.includes(businessId)) {
      return response(404, { error: "NOT_FOUND" }, correlation);
    }

    try {
      if (!inventoryId && method === "GET") {
        const offers =
          await this.dependencies.businessInventory.listByBusiness(businessId);
        return response(200, { data: offers }, correlation);
      }
      if (!inventoryId && method === "POST") {
        const requestKey = header(request, "idempotency-key");
        if (!IDEMPOTENCY_KEY.test(requestKey)) {
          return response(
            400,
            { error: "INVALID_IDEMPOTENCY_KEY" },
            correlation,
          );
        }
        const created =
          await this.dependencies.businessInventory.createForBusiness({
            businessId,
            destinationId: this.dependencies.destinationId,
            requestKey,
            actorSubject: actor.subject,
            offer: request.body,
            recordedAt: this.dependencies.clock.now(),
          });
        return response(
          created.replayed ? 200 : 201,
          { data: created.offer },
          correlation,
        );
      }
      if (inventoryId && method === "POST") {
        const disabled =
          await this.dependencies.businessInventory.disableForBusiness({
            businessId,
            inventoryId,
            actorSubject: actor.subject,
            recordedAt: this.dependencies.clock.now(),
          });
        return disabled
          ? response(200, { data: disabled }, correlation)
          : response(404, { error: "NOT_FOUND" }, correlation);
      }
      return response(405, { error: "METHOD_NOT_ALLOWED" }, correlation);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "MORRO_PRO_INVENTORY_UNAVAILABLE";
      const invalid = message.includes("INVALID");
      return response(
        invalid ? 400 : 503,
        { error: invalid ? message : "MORRO_PRO_INVENTORY_UNAVAILABLE" },
        correlation,
      );
    }
  }

  async handle(request: TicketingHttpRequest): Promise<TicketingHttpResponse> {
    const correlation = correlationId(request);
    const method = request.method.toUpperCase();
    const relative = request.pathname.slice(ticketingHttpPrefix.length);

    if (relative === "/consumer-session" && method === "POST") {
      if (!sameOrigin(request))
        return response(403, { error: "ORIGIN_DENIED" }, correlation);
      const current = this.sessions.fromRequest(request);
      const session = current ?? this.sessions.issue();
      return response(
        current ? 200 : 201,
        {
          data: Object.freeze({
            subject: session.claims.subject,
            csrfToken: session.csrfToken,
            expiresAt: new Date(session.claims.expiresAt * 1_000).toISOString(),
          }),
        },
        correlation,
        {
          "Set-Cookie": this.sessions.cookie(session, secureRequest(request)),
          Vary: "Cookie, Origin",
        },
      );
    }

    const businessMatch =
      /^\/operator\/businesses\/([a-z0-9][a-z0-9_-]{0,119})\/inventory(?:\/(mpi_[a-f0-9]{32})\/disable)?$/u.exec(
        relative,
      );
    if (businessMatch?.[1] && BUSINESS_ID.test(businessMatch[1])) {
      const inventoryId = businessMatch[2];
      if (inventoryId && !INVENTORY_ID.test(inventoryId)) {
        return response(404, { error: "NOT_FOUND" }, correlation);
      }
      return this.handleBusinessInventory(
        request,
        businessMatch[1],
        inventoryId,
      );
    }

    return this.legacy.handle(request);
  }
}

export {
  SESSION_COOKIE as commerceSessionCookieName,
  SESSION_TTL_SECONDS as commerceSessionTtlSeconds,
};
