import type { AuthSessionIdentity } from "@touristic/auth";
import type {
  CrmLeadBoundaryResult,
  CrmLeadCreateInput,
  CrmLeadServerBoundary,
} from "@touristic/crm/leads-boundary";

export interface CrmHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
}

export interface CrmHttpResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface CrmTransportAuthPort {
  readonly resolveSession: (
    request: CrmHttpRequest,
  ) => Promise<AuthSessionIdentity | null>;
  readonly authorizeMutation: (
    request: CrmHttpRequest,
    session: AuthSessionIdentity,
  ) => Promise<
    | { readonly allowed: true }
    | {
        readonly allowed: false;
        readonly reason: "cross_origin_request" | "invalid_csrf";
      }
  >;
}

const leadsPrefix = "/api/crm/leads";

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
): CrmHttpResponse {
  return Object.freeze({ status, body: Object.freeze({ ...body }) });
}

function resultResponse<T>(result: CrmLeadBoundaryResult<T>): CrmHttpResponse {
  if (result.ok) {
    return response(200, { data: result.value });
  }

  if (
    result.reason === "authentication_required" ||
    result.reason === "session_expired"
  ) {
    return response(401, { error: "AUTH_REQUIRED", reason: result.reason });
  }
  if (result.reason === "read_only_role") {
    return response(403, { error: "READ_ONLY_ROLE", reason: result.reason });
  }
  if (result.reason === "not_found") {
    return response(404, { error: "NOT_FOUND", reason: result.reason });
  }
  return response(400, { error: "INVALID_INPUT", reason: result.reason });
}

function route(pathname: string):
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

function isMutation(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function objectBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? { ...(body as Record<string, unknown>) }
    : {};
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
    if (!matched) return response(404, { error: "NOT_FOUND" });

    const session = await this.auth.resolveSession(request);
    if (session && isMutation(request.method)) {
      const security = await this.auth.authorizeMutation(request, session);
      if (!security.allowed) {
        const error =
          security.reason === "invalid_csrf" ? "INVALID_CSRF" : "ORIGIN_DENIED";
        return response(403, { error, reason: security.reason });
      }
    }

    if (matched.kind === "collection" && request.method === "GET") {
      return resultResponse(await this.boundary.list(session, request.query));
    }
    if (matched.kind === "collection" && request.method === "POST") {
      const body = objectBody(request.body);
      return resultResponse(
        await this.boundary.create(session, body as CrmLeadCreateInput),
      );
    }
    if (matched.kind === "lead" && request.method === "GET") {
      return resultResponse(await this.boundary.get(session, matched.id));
    }
    if (matched.kind === "lead" && request.method === "PATCH") {
      const body = objectBody(request.body);
      return resultResponse(
        await this.boundary.update(session, { ...body, id: matched.id }),
      );
    }
    if (matched.kind === "lead" && request.method === "DELETE") {
      return resultResponse(await this.boundary.delete(session, { id: matched.id }));
    }
    if (matched.kind === "stage" && request.method === "POST") {
      const body = objectBody(request.body);
      return resultResponse(
        await this.boundary.updateStage(session, {
          id: matched.id,
          stage: body.stage,
        }),
      );
    }

    return response(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
