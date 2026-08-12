import type {
  CrmProposalBoundaryResult,
  CrmProposalCreateInput,
  CrmProposalServerBoundary,
} from "@touristic/crm/proposals-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const proposalsPrefix = "/api/crm/proposals";

function resultResponse<T>(
  result: CrmProposalBoundaryResult<T>,
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
  if (result.reason === "invalid_transition" || result.reason === "expired") {
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

type ProposalRoute =
  | { readonly kind: "collection" }
  | { readonly kind: "accepted" }
  | { readonly kind: "send"; readonly id: string }
  | { readonly kind: "respond"; readonly id: string };

function route(pathname: string): ProposalRoute | null {
  if (pathname === proposalsPrefix) return { kind: "collection" };
  if (pathname === `${proposalsPrefix}/accepted`) return { kind: "accepted" };
  if (!pathname.startsWith(`${proposalsPrefix}/`)) return null;
  const parts = pathname
    .slice(proposalsPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (parts[1] === "send") return { kind: "send", id: parts[0] };
  if (parts[1] === "respond") return { kind: "respond", id: parts[0] };
  return null;
}

function normalizeHttpId(value: unknown): unknown {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

function proposalCreateInput(body: unknown): CrmProposalCreateInput {
  const value = crmObjectBody(body);
  return {
    leadId: normalizeHttpId(value.leadId),
    title: value.title,
    monthlyValue: value.monthlyValue,
    planName: value.planName,
    setupFee: value.setupFee,
    trialDays: value.trialDays,
    features: value.features,
    customMessage: value.customMessage,
    validUntil: value.validUntil,
  };
}

export class CrmProposalHttpTransport {
  constructor(
    private readonly boundary: CrmProposalServerBoundary,
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
        await this.boundary.create(session, proposalCreateInput(request.body)),
      );
    }
    if (matched.kind === "accepted" && request.method === "GET") {
      return resultResponse(
        await this.boundary.getAccepted(
          session,
          normalizeHttpId(request.query?.leadId),
        ),
      );
    }
    if (matched.kind === "send" && request.method === "POST") {
      return resultResponse(
        await this.boundary.send(session, { id: normalizeHttpId(matched.id) }),
      );
    }
    if (matched.kind === "respond" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.respond(session, {
          id: normalizeHttpId(matched.id),
          accepted: body.accepted,
        }),
      );
    }

    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
