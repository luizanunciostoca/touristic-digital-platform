import type {
  CrmLeadBoundaryResult,
  CrmLeadServerBoundary,
} from "@touristic/crm/leads-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const leadsPrefix = "/api/crm/leads";

function resultResponse<T>(result: CrmLeadBoundaryResult<T>): CrmHttpResponse {
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
  | { readonly kind: "lead"; readonly id: string }
  | { readonly kind: "stage"; readonly id: string }
  | null {
  if (pathname === leadsPrefix) return { kind: "collection" };
  if (!pathname.startsWith(`${leadsPrefix}/`)) return null;
  const rest = pathname.slice(leadsPrefix.length + 1);
  const parts = rest.split("/").filter(Boolean);
  if (parts.length === 1 && parts[0]) return { kind: "lead", id: parts[0] };
  if (parts.length === 2 && parts[0] && parts[1] === "stage") {
    return { kind: "stage", id: parts[0] };
  }
  return null;
}

export class CrmLeadHttpTransport {
  constructor(
    private readonly boundary: CrmLeadServerBoundary,
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
      return resultResponse(await this.boundary.list(session, request.query));
    }
    if (matched.kind === "collection" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.create(session, {
          ...body,
          companyName: body.companyName,
        }),
      );
    }
    if (matched.kind === "lead" && request.method === "GET") {
      return resultResponse(await this.boundary.get(session, matched.id));
    }
    if (matched.kind === "lead" && request.method === "PATCH") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.update(session, { ...body, id: matched.id }),
      );
    }
    if (matched.kind === "lead" && request.method === "DELETE") {
      return resultResponse(
        await this.boundary.delete(session, { id: matched.id }),
      );
    }
    if (matched.kind === "stage" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.updateStage(session, {
          id: matched.id,
          stage: body.stage,
        }),
      );
    }

    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}

export type {
  CrmHttpRequest,
  CrmHttpResponse,
  CrmTransportAuthPort,
} from "./http-transport.js";
