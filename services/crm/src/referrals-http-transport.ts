import type {
  CrmReferralBoundaryResult,
  CrmReferralServerBoundary,
} from "@touristic/crm/referrals-boundary";

import {
  crmHttpResponse,
  crmObjectBody,
  crmResolveTransportSecurity,
  type CrmHttpRequest,
  type CrmHttpResponse,
  type CrmTransportAuthPort,
} from "./http-transport.js";

const referralsPrefix = "/api/crm/referrals";

type ReferralAction = "contact" | "convert" | "lose" | "link-lead" | "grant-benefit";

type ReferralRoute =
  | { readonly kind: "collection" }
  | { readonly kind: "referral"; readonly id: string }
  | {
      readonly kind: "action";
      readonly id: string;
      readonly action: ReferralAction;
    };

function resultResponse<T>(
  result: CrmReferralBoundaryResult<T>,
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

function route(pathname: string): ReferralRoute | null {
  if (pathname === referralsPrefix) return { kind: "collection" };
  if (!pathname.startsWith(`${referralsPrefix}/`)) return null;
  const parts = pathname
    .slice(referralsPrefix.length + 1)
    .split("/")
    .filter(Boolean);
  if (parts.length === 1 && parts[0]) {
    return { kind: "referral", id: parts[0] };
  }
  if (parts.length !== 2 || !parts[0]) return null;
  const action = parts[1];
  if (
    action !== "contact" &&
    action !== "convert" &&
    action !== "lose" &&
    action !== "link-lead" &&
    action !== "grant-benefit"
  ) {
    return null;
  }
  return { kind: "action", id: parts[0], action };
}

function normalizeHttpId(value: unknown): unknown {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

export class CrmReferralHttpTransport {
  constructor(
    private readonly boundary: CrmReferralServerBoundary,
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
          normalizeHttpId(request.query?.referrerLeadId),
        ),
      );
    }
    if (matched.kind === "collection" && request.method === "POST") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.create(session, {
          referrerLeadId: body.referrerLeadId,
          referredName: body.referredName,
          referredPhone: body.referredPhone,
          referredEmail: body.referredEmail,
          notes: body.notes,
        }),
      );
    }
    if (matched.kind === "referral" && request.method === "PATCH") {
      const body = crmObjectBody(request.body);
      return resultResponse(
        await this.boundary.edit(session, {
          id: normalizeHttpId(matched.id),
          referredName: body.referredName,
          referredPhone: body.referredPhone,
          referredEmail: body.referredEmail,
          notes: body.notes,
        }),
      );
    }
    if (matched.kind === "action" && request.method === "POST") {
      const id = normalizeHttpId(matched.id);
      if (matched.action === "contact") {
        return resultResponse(await this.boundary.contact(session, { id }));
      }
      if (matched.action === "convert") {
        return resultResponse(await this.boundary.convert(session, { id }));
      }
      if (matched.action === "lose") {
        return resultResponse(await this.boundary.lose(session, { id }));
      }
      const body = crmObjectBody(request.body);
      if (matched.action === "link-lead") {
        return resultResponse(
          await this.boundary.linkLead(session, {
            id,
            referredLeadId: body.referredLeadId,
          }),
        );
      }
      return resultResponse(
        await this.boundary.grantBenefit(session, {
          id,
          benefitDescription: body.benefitDescription,
        }),
      );
    }
    return crmHttpResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }
}
