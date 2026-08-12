import type {
  CrmTrialBoundaryResult,
  CrmTrialServerBoundary,
} from "@touristic/crm/trials-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const trialsPrefix = "/api/crm/trials";

type TrialAction = "convert" | "cancel" | "expire";

function resultResponse<T>(result: CrmTrialBoundaryResult<T>): CrmHttpResponse {
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

function route(pathname: string):
  | { readonly kind: "collection" }
  | {
      readonly kind: "action";
      readonly id: string;
      readonly action: TrialAction;
    }
  | null {
  if (pathname === trialsPrefix) return { kind: "collection" };
  if (!pathname.startsWith(`${trialsPrefix}/`)) return null;

  const parts = pathname
    .slice(trialsPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2 || !parts[0]) return null;
  const action = parts[1];
  if (action !== "convert" && action !== "cancel" && action !== "expire") {
    return null;
  }
  return { kind: "action", id: parts[0], action };
}

function normalizeHttpId(value: unknown): unknown {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

export class CrmTrialHttpTransport {
  constructor(
    private readonly boundary: CrmTrialServerBoundary,
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
          durationDays: body.durationDays,
          startDate: body.startDate,
        }),
      );
    }

    if (matched.kind === "action" && request.method === "POST") {
      const input = { id: normalizeHttpId(matched.id) };
      if (matched.action === "convert") {
        return resultResponse(await this.boundary.convert(session, input));
      }
      if (matched.action === "cancel") {
        return resultResponse(await this.boundary.cancel(session, input));
      }
      return resultResponse(await this.boundary.expire(session, input));
    }

    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
