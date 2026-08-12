import type {
  CrmMeetingBoundaryResult,
  CrmMeetingServerBoundary,
} from "@touristic/crm/meetings-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const meetingsPrefix = "/api/crm/meetings";

function resultResponse<T>(
  result: CrmMeetingBoundaryResult<T>,
): CrmHttpResponse {
  if (result.ok) {
    return crmHttpResponse(200, { data: result.value });
  }

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
  return crmHttpResponse(400, {
    error: "INVALID_INPUT",
    reason: result.reason,
  });
}

function route(
  pathname: string,
):
  | { readonly kind: "collection" }
  | { readonly kind: "meeting"; readonly id: string }
  | null {
  if (pathname === meetingsPrefix) return { kind: "collection" };
  if (!pathname.startsWith(`${meetingsPrefix}/`)) return null;
  const rest = pathname.slice(meetingsPrefix.length + 1);
  const parts = rest.split("/").filter(Boolean);
  return parts.length === 1 && parts[0]
    ? { kind: "meeting", id: parts[0] }
    : null;
}

export class CrmMeetingHttpTransport {
  constructor(
    private readonly boundary: CrmMeetingServerBoundary,
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
        await this.boundary.list(session, request.query?.leadId),
      );
    }
    if (matched.kind === "collection" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.create(session, {
          ...body,
          leadId: body.leadId,
          title: body.title,
          scheduledAt: body.scheduledAt,
          modality: body.modality,
        }),
      );
    }
    if (matched.kind === "meeting" && request.method === "PATCH") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.update(session, { ...body, id: matched.id }),
      );
    }

    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
