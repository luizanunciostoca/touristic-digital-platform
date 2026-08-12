import type {
  CrmContractPublicBoundary,
  CrmContractPublicResult,
} from "@touristic/crm/contracts-public-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  type CrmHttpRequest,
  type CrmHttpResponse,
} from "./http-transport.js";

const publicContractsPrefix = "/api/crm/public/contracts";

type PublicContractRoute =
  | { readonly kind: "view"; readonly token: string }
  | { readonly kind: "sign"; readonly token: string };

function route(pathname: string): PublicContractRoute | null {
  if (!pathname.startsWith(`${publicContractsPrefix}/`)) return null;
  const parts = pathname
    .slice(publicContractsPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  if (parts.length === 1 && parts[0]) {
    return { kind: "view", token: parts[0] };
  }
  if (parts.length === 2 && parts[0] && parts[1] === "sign") {
    return { kind: "sign", token: parts[0] };
  }
  return null;
}

function resultResponse<T>(
  result: CrmContractPublicResult<T>,
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
  return crmHttpResponse(400, {
    error:
      result.reason === "invalid_token" ? "INVALID_TOKEN" : "INVALID_INPUT",
    reason: result.reason,
  });
}

export class CrmContractPublicHttpTransport {
  constructor(private readonly boundary: CrmContractPublicBoundary) {}

  matches(pathname: string): boolean {
    return route(pathname) !== null;
  }

  async handle(request: CrmHttpRequest): Promise<CrmHttpResponse> {
    const matched = route(request.pathname);
    if (!matched) return crmHttpResponse(404, { error: "NOT_FOUND" });

    if (matched.kind === "view" && request.method === "GET") {
      return resultResponse(await this.boundary.view(matched.token));
    }
    if (matched.kind === "sign" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.sign({
          token: matched.token,
          signatureData: body.signatureData,
          signerName: body.signerName,
          signerIp: request.clientIp,
        }),
      );
    }
    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
