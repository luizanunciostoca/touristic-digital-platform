import type {
  CrmFollowUpBoundaryResult,
  CrmFollowUpServerBoundary,
} from "@touristic/crm/followups-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const followUpsPrefix = "/api/crm/follow-ups";

type FollowUpRoute =
  | { readonly kind: "collection" }
  | { readonly kind: "settings" }
  | { readonly kind: "pending" }
  | { readonly kind: "sent"; readonly id: string }
  | { readonly kind: "responded"; readonly id: string };

function resultResponse<T>(
  result: CrmFollowUpBoundaryResult<T>,
): CrmHttpResponse {
  if (result.ok) return crmHttpResponse(200, { data: result.value });
  if (
    result.reason === "authentication_required" ||
    result.reason === "session_expired"
  ) {
    return crmHttpResponse(401, {
      error: "AUTH_REQUIRED",
      reason: result.reason,
    });
  }
  if (result.reason === "read_only_role") {
    return crmHttpResponse(403, {
      error: "READ_ONLY_ROLE",
      reason: result.reason,
    });
  }
  if (result.reason === "not_found") {
    return crmHttpResponse(404, { error: "NOT_FOUND", reason: result.reason });
  }
  if (result.reason === "invalid_transition") {
    return crmHttpResponse(409, {
      error: "INVALID_TRANSITION",
      reason: result.reason,
    });
  }
  return crmHttpResponse(400, {
    error: "INVALID_INPUT",
    reason: result.reason,
  });
}

function route(pathname: string): FollowUpRoute | null {
  if (pathname === followUpsPrefix) return { kind: "collection" };
  if (!pathname.startsWith(`${followUpsPrefix}/`)) return null;
  const parts = pathname
    .slice(followUpsPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  if (parts.length === 1 && parts[0] === "settings") {
    return { kind: "settings" };
  }
  if (parts.length === 1 && parts[0] === "pending") {
    return { kind: "pending" };
  }
  if (parts.length === 2 && parts[0] && parts[1] === "sent") {
    return { kind: "sent", id: parts[0] };
  }
  if (parts.length === 2 && parts[0] && parts[1] === "responded") {
    return { kind: "responded", id: parts[0] };
  }
  return null;
}

function normalizeHttpId(value: unknown): unknown {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

export class CrmFollowUpHttpTransport {
  constructor(
    private readonly boundary: CrmFollowUpServerBoundary,
    private readonly auth: CrmTransportAuthPort,
  ) {}

  matches(pathname: string): boolean {
    return route(pathname) !== null;
  }

  async handle(request: CrmHttpRequest): Promise<CrmHttpResponse> {
    const matched = route(request.pathname);
    if (!matched) return crmHttpResponse(404, { error: "NOT_FOUND" });

    const security = await crmResolveTransportSecurity(request, this.auth);
    if (security.denial) return security.denial;
    const { session } = security;

    if (matched.kind === "settings" && request.method === "GET") {
      return resultResponse(await this.boundary.listSettings(session));
    }
    if (matched.kind === "settings" && request.method === "PUT") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.saveSetting(session, {
          id: body.id,
          name: body.name,
          intervalDays: body.intervalDays,
          maxAttempts: body.maxAttempts,
          messageTemplate: body.messageTemplate,
          isActive: body.isActive,
        }),
      );
    }
    if (matched.kind === "pending" && request.method === "GET") {
      return resultResponse(await this.boundary.pending(session));
    }
    if (matched.kind === "collection" && request.method === "GET") {
      return resultResponse(
        await this.boundary.list(
          session,
          normalizeHttpId(request.query?.leadId),
        ),
      );
    }
    if (matched.kind === "collection" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.create(session, {
          leadId: body.leadId,
          settingId: body.settingId,
          scheduledAt: body.scheduledAt,
          attemptNumber: body.attemptNumber,
        }),
      );
    }
    if (matched.kind === "sent" && request.method === "POST") {
      return resultResponse(
        await this.boundary.markSent(session, {
          id: normalizeHttpId(matched.id),
        }),
      );
    }
    if (matched.kind === "responded" && request.method === "POST") {
      return resultResponse(
        await this.boundary.markResponded(session, {
          id: normalizeHttpId(matched.id),
        }),
      );
    }

    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
