import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmReferral } from "@touristic/crm";
import {
  CrmReferralServerBoundary,
  type CrmReferralBoundaryRepository,
} from "@touristic/crm/referrals-boundary";

import type { CrmTransportAuthPort } from "./http-transport.js";
import { CrmReferralHttpTransport } from "./referrals-http-transport.js";

const now = new Date("2026-08-13T15:00:00.000Z");

function session(role: AuthRole): AuthSessionIdentity {
  return {
    subject: `crm-${role}`,
    email: `${role}@example.com`,
    role,
    businessIds: [],
    issuedAt: 1_000,
    expiresAt: 9_999_999_999,
    sessionId: `session-${role}`,
  };
}

function referral(overrides: Partial<CrmReferral> = {}): CrmReferral {
  return {
    id: 41,
    referrerLeadId: 7,
    referredLeadId: null,
    referredName: "Maria Silva",
    referredPhone: "71999999999",
    referredEmail: "maria@example.com",
    status: "pending",
    benefitDescription: null,
    benefitGrantedAt: null,
    notes: "Cliente indicado",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(
  options: {
    role?: AuthRole;
    sessionPresent?: boolean;
    mutationAllowed?: boolean;
    mutationReason?: "cross_origin_request" | "invalid_csrf";
  } = {},
) {
  let current = referral();
  const repository: CrmReferralBoundaryRepository = {
    list: async (referrerLeadId) =>
      referrerLeadId === undefined || referrerLeadId === current.referrerLeadId
        ? [current]
        : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7 || leadId === 33,
    create: async (record) => {
      current = referral({ ...record });
      return current;
    },
    update: async (_id, patch) => {
      current = referral({ ...current, ...patch, updatedAt: now });
      return current;
    },
    appendInteraction: async () => {},
  };
  const boundary = new CrmReferralServerBoundary(
    repository,
    { record: async () => {} },
    () => now,
  );
  const activeSession =
    options.sessionPresent === false ? null : session(options.role ?? "owner");
  const auth: CrmTransportAuthPort = {
    resolveSession: async () => activeSession,
    authorizeMutation: async () =>
      options.mutationAllowed === false
        ? {
            allowed: false,
            reason: options.mutationReason ?? "invalid_csrf",
          }
        : { allowed: true },
  };
  return new CrmReferralHttpTransport(boundary, auth);
}

describe("CRM M100 referrals HTTP transport", () => {
  it("requires authentication for collection reads", async () => {
    const transport = harness({ sessionPresent: false });
    expect(
      await transport.handle({
        method: "GET",
        pathname: "/api/crm/referrals",
      }),
    ).toMatchObject({ status: 401, body: { error: "AUTH_REQUIRED" } });
  });

  it("lists referrals with an optional referrer lead filter", async () => {
    const transport = harness({ role: "viewer" });
    const result = await transport.handle({
      method: "GET",
      pathname: "/api/crm/referrals",
      query: { referrerLeadId: "7" },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([
      expect.objectContaining({ id: 41, referrerLeadId: 7 }),
    ]);
  });

  it("creates and edits referrals through the frozen boundary", async () => {
    const transport = harness({ role: "owner" });
    const created = await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals",
      body: {
        referrerLeadId: 7,
        referredName: "Ana Costa",
        referredPhone: "71988888888",
      },
    });
    expect(created).toMatchObject({
      status: 200,
      body: { data: { referredName: "Ana Costa", status: "pending" } },
    });

    const edited = await transport.handle({
      method: "PATCH",
      pathname: "/api/crm/referrals/41",
      body: { notes: "Contato prioritário" },
    });
    expect(edited).toMatchObject({
      status: 200,
      body: { data: { id: 41, notes: "Contato prioritário" } },
    });
  });

  it("exposes explicit lifecycle actions without generic status mutation", async () => {
    const transport = harness({ role: "manager" });
    const contacted = await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals/41/contact",
    });
    expect(contacted).toMatchObject({
      status: 200,
      body: { data: { id: 41, status: "contacted" } },
    });

    const converted = await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals/41/convert",
    });
    expect(converted).toMatchObject({
      status: 200,
      body: { data: { id: 41, status: "converted" } },
    });
  });

  it("links a referred lead and grants a benefit through dedicated actions", async () => {
    const transport = harness({ role: "owner" });
    const linked = await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals/41/link-lead",
      body: { referredLeadId: 33 },
    });
    expect(linked).toMatchObject({
      status: 200,
      body: { data: { referredLeadId: 33 } },
    });

    const benefit = await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals/41/grant-benefit",
      body: { benefitDescription: "1 mês grátis" },
    });
    expect(benefit).toMatchObject({
      status: 200,
      body: {
        data: {
          benefitDescription: "1 mês grátis",
          benefitGrantedAt: now,
        },
      },
    });
  });

  it("maps invalid lifecycle transitions to conflict", async () => {
    const transport = harness({ role: "owner" });
    await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals/41/convert",
    });
    const repeated = await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals/41/convert",
    });
    expect(repeated).toMatchObject({
      status: 409,
      body: { error: "INVALID_TRANSITION" },
    });
  });

  it("denies viewer mutations through the CRM authorization boundary", async () => {
    const transport = harness({ role: "viewer" });
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals/41/contact",
    });
    expect(result).toMatchObject({
      status: 403,
      body: { error: "READ_ONLY_ROLE" },
    });
  });

  it.each([
    ["invalid_csrf", "INVALID_CSRF"],
    ["cross_origin_request", "ORIGIN_DENIED"],
  ] as const)("denies mutation security failure %s", async (reason, error) => {
    const transport = harness({
      role: "owner",
      mutationAllowed: false,
      mutationReason: reason,
    });
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/referrals",
      body: {},
    });
    expect(result).toMatchObject({
      status: 403,
      body: { error, reason },
    });
  });

  it("rejects unsupported methods and unknown referral actions", async () => {
    const transport = harness({ role: "owner" });
    expect(
      await transport.handle({
        method: "DELETE",
        pathname: "/api/crm/referrals/41",
      }),
    ).toMatchObject({
      status: 405,
      body: { error: "METHOD_NOT_ALLOWED" },
    });
    expect(transport.matches("/api/crm/referrals/41/archive")).toBe(false);
  });
});
