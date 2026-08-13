import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";

import type { CrmReferral } from "./index.js";
import {
  CrmReferralServerBoundary,
  type CrmReferralAuditEvent,
  type CrmReferralBoundaryRepository,
} from "./referrals-boundary.js";

const now = new Date("2026-08-13T03:30:00.000Z");

function session(role: AuthRole = "owner"): AuthSessionIdentity {
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
    id: 21,
    referrerLeadId: 7,
    referredLeadId: null,
    referredName: "Maria Silva",
    referredPhone: null,
    referredEmail: null,
    status: "pending",
    benefitDescription: null,
    benefitGrantedAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(
  options: {
    readonly initial?: CrmReferral;
    readonly leadExists?: boolean;
  } = {},
) {
  let current = options.initial ?? referral();
  const calls: string[] = [];
  const auditEvents: CrmReferralAuditEvent[] = [];
  const repository: CrmReferralBoundaryRepository = {
    list: async (referrerLeadId) =>
      referrerLeadId === undefined || referrerLeadId === current.referrerLeadId
        ? [current]
        : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async () => options.leadExists !== false,
    create: async (record) => {
      calls.push("create");
      current = referral({ ...record, id: 22 });
      return current;
    },
    update: async (_id, patch) => {
      calls.push(`update:${patch.status ?? "fields"}`);
      current = referral({ ...current, ...patch });
      return current;
    },
    appendInteraction: async ({ content }) => {
      calls.push(`interaction:${content}`);
    },
  };
  const boundary = new CrmReferralServerBoundary(
    repository,
    { record: async (event) => void auditEvents.push(event) },
    () => now,
  );
  return { boundary, calls, auditEvents, getCurrent: () => current };
}

describe("CRM M98 referrals lifecycle boundary", () => {
  it("requires authentication for reads", async () => {
    const { boundary, auditEvents } = harness();
    await expect(boundary.list(null)).resolves.toEqual({
      ok: false,
      reason: "authentication_required",
    });
    expect(auditEvents).toEqual([
      expect.objectContaining({ operation: "referral.list", allowed: false }),
    ]);
  });

  it("allows viewer reads and denies viewer mutations", async () => {
    const { boundary, auditEvents } = harness();
    await expect(boundary.list(session("viewer"), 7)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      boundary.create(session("viewer"), {
        referrerLeadId: 7,
        referredName: "Maria Silva",
      }),
    ).resolves.toEqual({ ok: false, reason: "read_only_role" });
    expect(auditEvents.at(-1)).toMatchObject({
      operation: "referral.create",
      reason: "read_only_role",
    });
  });

  it("creates a V1-compatible pending referral and records the referrer interaction", async () => {
    const { boundary, calls } = harness();
    await expect(
      boundary.create(session(), {
        referrerLeadId: 7,
        referredName: " Maria Silva ",
        referredPhone: " 71999999999 ",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        id: 22,
        referrerLeadId: 7,
        referredName: "Maria Silva",
        referredPhone: "71999999999",
        status: "pending",
      },
    });
    expect(calls).toEqual([
      "create",
      "interaction:Indicação registrada: Maria Silva",
    ]);
  });

  it("rejects creation when the referrer lead does not exist", async () => {
    const { boundary } = harness({ leadExists: false });
    await expect(
      boundary.create(session(), {
        referrerLeadId: 404,
        referredName: "Maria Silva",
      }),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("supports explicit contacted -> converted lifecycle transitions", async () => {
    const { boundary, getCurrent } = harness();
    await expect(
      boundary.contact(session(), { id: 21 }),
    ).resolves.toMatchObject({
      ok: true,
      value: { status: "contacted" },
    });
    await expect(
      boundary.convert(session(), { id: 21 }),
    ).resolves.toMatchObject({
      ok: true,
      value: { status: "converted" },
    });
    expect(getCurrent().status).toBe("converted");
  });

  it("rejects terminal referral transitions", async () => {
    const { boundary } = harness({ initial: referral({ status: "lost" }) });
    await expect(boundary.convert(session(), { id: 21 })).resolves.toEqual({
      ok: false,
      reason: "invalid_transition",
    });
  });

  it("links an existing referred lead", async () => {
    const { boundary } = harness();
    await expect(
      boundary.linkLead(session(), { id: 21, referredLeadId: 33 }),
    ).resolves.toMatchObject({
      ok: true,
      value: { referredLeadId: 33 },
    });
  });

  it("grants the referral benefit once with a durable timestamp", async () => {
    const { boundary, getCurrent, calls } = harness();
    await expect(
      boundary.grantBenefit(session(), {
        id: 21,
        benefitDescription: "1 mês grátis",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        benefitDescription: "1 mês grátis",
        benefitGrantedAt: now,
      },
    });
    expect(getCurrent().benefitGrantedAt).toEqual(now);
    expect(calls.at(-1)).toBe(
      "interaction:Benefício de indicação concedido: 1 mês grátis",
    );
    await expect(
      boundary.grantBenefit(session(), {
        id: 21,
        benefitDescription: "duplicado",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("edits referral identity fields without changing lifecycle state", async () => {
    const { boundary } = harness();
    await expect(
      boundary.edit(session(), {
        id: 21,
        referredName: "Maria Souza",
        referredEmail: "maria@example.com",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        referredName: "Maria Souza",
        referredEmail: "maria@example.com",
        status: "pending",
      },
    });
  });
});
