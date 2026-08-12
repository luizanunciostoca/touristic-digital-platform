import type {
  CrmContractBoundaryResult,
  CrmContractCreateInput,
  CrmContractServerBoundary,
} from "@touristic/crm/contracts-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const contractsPrefix = "/api/crm/contracts";

function resultResponse<T>(
  result: CrmContractBoundaryResult<T>,
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

type ContractRoute =
  | { readonly kind: "collection" }
  | { readonly kind: "send"; readonly id: string }
  | { readonly kind: "sign"; readonly id: string }
  | { readonly kind: "cancel"; readonly id: string };

function route(pathname: string): ContractRoute | null {
  if (pathname === contractsPrefix) return { kind: "collection" };
  if (!pathname.startsWith(`${contractsPrefix}/`)) return null;
  const parts = pathname
    .slice(contractsPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (parts[1] === "send") return { kind: "send", id: parts[0] };
  if (parts[1] === "sign") return { kind: "sign", id: parts[0] };
  if (parts[1] === "cancel") return { kind: "cancel", id: parts[0] };
  return null;
}

function normalizeHttpId(value: unknown): unknown {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

function contractCreateInput(body: unknown): CrmContractCreateInput {
  const value = crmObjectBody(body);
  return {
    leadId: normalizeHttpId(value.leadId),
    proposalId:
      value.proposalId === undefined || value.proposalId === null
        ? value.proposalId
        : normalizeHttpId(value.proposalId),
    title: value.title,
    content: value.content,
    monthlyValue: value.monthlyValue,
  };
}

export class CrmContractHttpTransport {
  constructor(
    private readonly boundary: CrmContractServerBoundary,
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
          request.query?.leadId === undefined
            ? undefined
            : normalizeHttpId(request.query.leadId),
        ),
      );
    }
    if (matched.kind === "collection" && request.method === "POST") {
      return resultResponse(
        await this.boundary.create(session, contractCreateInput(request.body)),
      );
    }
    if (matched.kind === "send" && request.method === "POST") {
      return resultResponse(
        await this.boundary.send(session, { id: normalizeHttpId(matched.id) }),
      );
    }
    if (matched.kind === "sign" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.sign(session, {
          id: normalizeHttpId(matched.id),
          signatureData: body.signatureData,
        }),
      );
    }
    if (matched.kind === "cancel" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.cancel(session, {
          id: normalizeHttpId(matched.id),
          reason: body.reason,
        }),
      );
    }

    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
