import { createHash } from "node:crypto";
import type { AffiliateApplicationService } from "./affiliate-application-service.js";

export const affiliatesHttpPrefix = "/api/affiliates/v1";

export interface AffiliateHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
  readonly correlationId?: string;
  readonly destinationId?: string;
}

export interface AffiliateHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface AffiliateHttpActor {
  readonly subject: string;
  readonly role: "admin" | "affiliate" | "service";
  readonly affiliateId?: string;
  readonly destinationId: string;
}

export interface AffiliateHttpAuthorizationPort {
  authorize(
    request: AffiliateHttpRequest,
    input: Readonly<{
      mutation: boolean;
      admin?: boolean;
      destinationId: string;
    }>,
  ): Promise<
    | { readonly allowed: true; readonly actor: AffiliateHttpActor }
    | {
        readonly allowed: false;
        readonly reason:
          | "authentication_required"
          | "invalid_csrf"
          | "origin_denied"
          | "forbidden";
      }
  >;
}

export interface AffiliateReadProjectionPort {
  readAffiliate(
    input: Readonly<{ affiliateId: string; destinationId: string }>,
  ): Promise<Readonly<Record<string, unknown>> | null>;
}

export interface AffiliateHttpDependencies {
  readonly authorization: AffiliateHttpAuthorizationPort;
  readonly reads: AffiliateReadProjectionPort;
  readonly application: Pick<
    AffiliateApplicationService,
    "recordReferralAndEstablishAttribution"
  >;
  readonly clock: { now(): string };
}

function header(request: AffiliateHttpRequest, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === target && typeof value === "string")
      return value.trim();
  }
  return "";
}

function correlationId(request: AffiliateHttpRequest): string {
  const candidate =
    request.correlationId ?? header(request, "x-correlation-id");
  if (/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(candidate)) return candidate;
  return `acr_${createHash("sha256").update(`${request.method}:${request.pathname}`).digest("hex").slice(0, 24)}`;
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
  correlation: string,
): AffiliateHttpResponse {
  return {
    status,
    headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlation },
    body,
  };
}

function authFailure(
  reason:
    "authentication_required" | "invalid_csrf" | "origin_denied" | "forbidden",
  correlation: string,
): AffiliateHttpResponse {
  if (reason === "authentication_required")
    return response(401, { error: "AUTH_REQUIRED" }, correlation);
  if (reason === "invalid_csrf")
    return response(403, { error: "INVALID_CSRF" }, correlation);
  if (reason === "origin_denied")
    return response(403, { error: "ORIGIN_DENIED" }, correlation);
  return response(403, { error: "FORBIDDEN" }, correlation);
}

function bodyRecord(body: unknown): Readonly<Record<string, unknown>> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Readonly<Record<string, unknown>>;
}

function bounded(value: unknown, max = 180): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function field(value: unknown, max = 180): string {
  return bounded(value, max) ? value : "";
}

export async function handleAffiliateHttpRequest(
  request: AffiliateHttpRequest,
  dependencies: AffiliateHttpDependencies,
): Promise<AffiliateHttpResponse> {
  const correlation = correlationId(request);
  const destinationId =
    request.destinationId ?? header(request, "x-destination-id");
  if (!bounded(destinationId, 80))
    return response(400, { error: "DESTINATION_REQUIRED" }, correlation);

  const mutation = request.method !== "GET";
  const admin = request.pathname.includes("/admin/");
  const decision = await dependencies.authorization.authorize(request, {
    mutation,
    admin,
    destinationId,
  });
  if (!decision.allowed) return authFailure(decision.reason, correlation);

  if (
    request.method === "GET" &&
    request.pathname === `${affiliatesHttpPrefix}/me`
  ) {
    if (!decision.actor.affiliateId)
      return response(404, { error: "AFFILIATE_NOT_FOUND" }, correlation);
    const projection = await dependencies.reads.readAffiliate({
      affiliateId: decision.actor.affiliateId,
      destinationId,
    });
    return projection
      ? response(200, { affiliate: projection }, correlation)
      : response(404, { error: "AFFILIATE_NOT_FOUND" }, correlation);
  }

  if (
    request.method === "POST" &&
    request.pathname === `${affiliatesHttpPrefix}/referrals`
  ) {
    const body = bodyRecord(request.body);
    if (!body || !decision.actor.affiliateId)
      return response(400, { error: "INVALID_REFERRAL_REQUEST" }, correlation);
    if (
      body.amount !== undefined ||
      body.currency !== undefined ||
      body.payout !== undefined ||
      body.providerToken !== undefined
    ) {
      return response(
        400,
        { error: "MONETARY_AUTHORITY_FORBIDDEN" },
        correlation,
      );
    }
    const source = body.source;
    if (
      source !== "platform_link" &&
      source !== "platform_qr" &&
      source !== "checkout_code" &&
      source !== "server_referral"
    ) {
      return response(400, { error: "INVALID_REFERRAL_SOURCE" }, correlation);
    }
    try {
      const result =
        await dependencies.application.recordReferralAndEstablishAttribution({
          evidenceId: field(body.evidenceId),
          attributionId: field(body.attributionId),

          affiliateId: decision.actor.affiliateId,
          programId: field(body.programId),
          subjectId: field(body.subjectId),

          source,
          evidenceFingerprint: field(body.evidenceFingerprint, 64),
          serverObservedAt: dependencies.clock.now(),
          receivedAt: dependencies.clock.now(),
          actorReference: decision.actor.subject,
          correlationId: correlation,
        });
      return response(
        200,
        { attributionId: result.attribution.id, replayed: result.replayed },
        correlation,
      );
    } catch {
      return response(
        409,
        { error: "AFFILIATE_REFERRAL_CONFLICT" },
        correlation,
      );
    }
  }

  return response(404, { error: "NOT_FOUND" }, correlation);
}
