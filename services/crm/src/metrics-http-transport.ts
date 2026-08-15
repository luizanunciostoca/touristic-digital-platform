import type {
  CrmMetricsBoundaryResult,
  CrmMetricsServerBoundary,
} from "@touristic/crm/metrics-boundary";

import {
  crmHttpResponse,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const metricsPath = "/api/crm/metrics/funnel";

function resultResponse<T>(result: CrmMetricsBoundaryResult<T>): CrmHttpResponse {
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
  return crmHttpResponse(403, { error: "ACCESS_DENIED", reason: result.reason });
}

export class CrmMetricsHttpTransport {
  constructor(
    private readonly boundary: CrmMetricsServerBoundary,
    private readonly auth: CrmTransportAuthPort,
  ) {}

  matches(pathname: string): boolean {
    return pathname === metricsPath;
  }

  async handle(request: CrmHttpRequest): Promise<CrmHttpResponse> {
    if (!this.matches(request.pathname)) {
      return crmHttpResponse(404, { error: "NOT_FOUND" });
    }
    if (request.method !== "GET") {
      return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
    }

    const security = await crmResolveTransportSecurity(request, this.auth);
    if (security.denial) return security.denial;
    return resultResponse(await this.boundary.read(security.session));
  }
}

export type {
  CrmHttpRequest,
  CrmHttpResponse,
  CrmTransportAuthPort,
} from "./http-transport.js";
