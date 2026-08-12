import type { AuthSessionIdentity } from "@touristic/auth";

export interface CrmHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
  readonly clientIp?: string;
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

export function crmHttpResponse(
  status: number,
  body: Readonly<Record<string, unknown>>,
): CrmHttpResponse {
  return Object.freeze({ status, body: Object.freeze({ ...body }) });
}

export function crmIsMutation(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

export function crmObjectBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? { ...(body as Record<string, unknown>) }
    : {};
}

export async function crmResolveTransportSecurity(
  request: CrmHttpRequest,
  auth: CrmTransportAuthPort,
): Promise<
  | {
      readonly session: AuthSessionIdentity | null;
      readonly denial: null;
    }
  | {
      readonly session: AuthSessionIdentity;
      readonly denial: CrmHttpResponse;
    }
> {
  const session = await auth.resolveSession(request);
  if (!session || !crmIsMutation(request.method)) {
    return { session, denial: null };
  }

  const security = await auth.authorizeMutation(request, session);
  if (security.allowed) return { session, denial: null };
  const error =
    security.reason === "invalid_csrf" ? "INVALID_CSRF" : "ORIGIN_DENIED";
  return {
    session,
    denial: crmHttpResponse(403, { error, reason: security.reason }),
  };
}
