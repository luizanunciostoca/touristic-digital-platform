import type {
  CrmProposalPublicBoundary,
  CrmProposalPublicResult,
} from "@touristic/crm/proposals-public-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  type CrmHttpRequest,
  type CrmHttpResponse,
} from "./http-transport.js";

const publicProposalsPrefix = "/api/crm/public/proposals";

type PublicProposalRoute =
  | { readonly kind: "view"; readonly token: string }
  | { readonly kind: "respond"; readonly token: string };

function route(pathname: string): PublicProposalRoute | null {
  if (!pathname.startsWith(`${publicProposalsPrefix}/`)) return null;
  const parts = pathname
    .slice(publicProposalsPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  if (parts.length === 1 && parts[0]) {
    return { kind: "view", token: parts[0] };
  }
  if (parts.length === 2 && parts[0] && parts[1] === "respond") {
    return { kind: "respond", token: parts[0] };
  }
  return null;
}

function resultResponse<T>(
  result: CrmProposalPublicResult<T>,
): CrmHttpResponse {
  if (result.ok) return crmHttpResponse(200, { data: result.value });
  if (result.reason === "not_found") {
    return crmHttpResponse(404, { error: "NOT_FOUND", reason: result.reason });
  }
  if (result.reason === "invalid_transition") {
    return crmHttpResponse(409, {
      error: "INVALID_TRANSITION",
      reason: result.reason,
    });
  }
  if (result.reason === "expired") {
    return crmHttpResponse(409, {
      error: "PROPOSAL_EXPIRED",
      reason: result.reason,
    });
  }
  return crmHttpResponse(400, {
    error:
      result.reason === "invalid_token" ? "INVALID_TOKEN" : "INVALID_INPUT",
    reason: result.reason,
  });
}

export class CrmProposalPublicHttpTransport {
  constructor(private readonly boundary: CrmProposalPublicBoundary) {}

  matches(pathname: string): boolean {
    return route(pathname) !== null;
  }

  async handle(request: CrmHttpRequest): Promise<CrmHttpResponse> {
    const matched = route(request.pathname);
    if (!matched) return crmHttpResponse(404, { error: "NOT_FOUND" });

    if (matched.kind === "view" && request.method === "GET") {
      return resultResponse(await this.boundary.view(matched.token));
    }
    if (matched.kind === "respond" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.respond({
          token: matched.token,
          accepted: body.accepted,
          respondentName: body.respondentName,
        }),
      );
    }
    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
