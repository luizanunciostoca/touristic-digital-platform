import type {
  CrmLeadDetailBoundaryResult,
  CrmLeadDetailServerBoundary,
} from "@touristic/crm/lead-detail-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const leadsPrefix = "/api/crm/leads";

function resultResponse<T>(
  result: CrmLeadDetailBoundaryResult<T>,
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
  return crmHttpResponse(400, {
    error: "INVALID_INPUT",
    reason: result.reason,
  });
}

function route(
  pathname: string,
):
  | { readonly kind: "detail"; readonly leadId: string }
  | {
      readonly kind: "checklist";
      readonly leadId: string;
      readonly itemId: string;
    }
  | { readonly kind: "interactions"; readonly leadId: string }
  | null {
  if (!pathname.startsWith(`${leadsPrefix}/`)) return null;
  const parts = pathname.slice(leadsPrefix.length + 1).split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] && parts[1] === "detail") {
    return { kind: "detail", leadId: parts[0] };
  }
  if (parts.length === 2 && parts[0] && parts[1] === "interactions") {
    return { kind: "interactions", leadId: parts[0] };
  }
  if (
    parts.length === 3 &&
    parts[0] &&
    parts[1] === "checklist" &&
    parts[2]
  ) {
    return { kind: "checklist", leadId: parts[0], itemId: parts[2] };
  }
  return null;
}

export class CrmLeadDetailHttpTransport {
  constructor(
    private readonly boundary: CrmLeadDetailServerBoundary,
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

    if (matched.kind === "detail" && request.method === "GET") {
      return resultResponse(await this.boundary.get(session, matched.leadId));
    }
    if (matched.kind === "checklist" && request.method === "PATCH") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.toggleChecklist(session, {
          leadId: matched.leadId,
          id: matched.itemId,
          completed: body.completed,
        }),
      );
    }
    if (matched.kind === "interactions" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.addInteraction(session, {
          leadId: matched.leadId,
          type: body.type,
          content: body.content,
        }),
      );
    }

    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
