import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmFollowUp, CrmFollowUpSetting } from "@touristic/crm";
import {
  CrmFollowUpServerBoundary,
  type CrmFollowUpBoundaryRepository,
} from "@touristic/crm/followups-boundary";

import { CrmFollowUpHttpTransport } from "./followups-http-transport.js";
import type { CrmTransportAuthPort } from "./http-transport.js";

const now = new Date("2026-08-12T21:00:00.000Z");

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

function setting(overrides: Partial<CrmFollowUpSetting> = {}): CrmFollowUpSetting {
  return {
    id: 3,
    name: "Follow-up comercial",
    intervalDays: 3,
    maxAttempts: 4,
    messageTemplate: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function followUp(overrides: Partial<CrmFollowUp> = {}): CrmFollowUp {
  return {
    id: 11,
    leadId: 7,
    settingId: 3,
    attemptNumber: 1,
    status: "pending",
    generatedMessage: null,
    scheduledAt: new Date("2026-08-15T15:00:00.000Z"),
    sentAt: null,
    respondedAt: null,
    scheduleCronTaskUid: null,
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
    initialStatus?: CrmFollowUp["status"];
  } = {},
) {
  let currentSetting = setting();
  let current = followUp({ status: options.initialStatus ?? "pending" });
  const repository: CrmFollowUpBoundaryRepository = {
    listSettings: async () => [currentSetting],
    upsertSetting: async (record) => {
      currentSetting = setting({
        id: record.id ?? 3,
        name: record.name,
        intervalDays: record.intervalDays,
        maxAttempts: record.maxAttempts,
        messageTemplate: record.messageTemplate,
        isActive: record.isActive,
      });
      return currentSetting;
    },
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    listPending: async () => (current.status === "pending" ? [current] : []),
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    settingExists: async (settingId) => settingId === 3,
    create: async (record) => {
      current = followUp({
        leadId: record.leadId,
        settingId: record.settingId,
        attemptNumber: record.attemptNumber,
        scheduledAt: record.scheduledAt,
        status: record.status,
      });
      return current;
    },
    markSent: async (_id, sentAt) => {
      current = followUp({ ...current, status: "sent", sentAt });
      return current;
    },
    markResponded: async (_id, respondedAt) => {
      current = followUp({ ...current, status: "responded", respondedAt });
      return current;
    },
    updateLeadLastContact: async () => {},
    appendInteraction: async () => {},
  };
  const boundary = new CrmFollowUpServerBoundary(
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
  return new CrmFollowUpHttpTransport(boundary, auth);
}

describe("CRM M86 follow-ups HTTP transport", () => {
  it("requires authentication for reads", async () => {
    expect(
      await harness({ sessionPresent: false }).handle({
        method: "GET",
        pathname: "/api/crm/follow-ups",
      }),
    ).toMatchObject({ status: 401, body: { error: "AUTH_REQUIRED" } });
  });

  it("supports settings, filtered list and pending reads for viewers", async () => {
    const transport = harness({ role: "viewer" });
    const settings = await transport.handle({
      method: "GET",
      pathname: "/api/crm/follow-ups/settings",
    });
    const list = await transport.handle({
      method: "GET",
      pathname: "/api/crm/follow-ups",
      query: { leadId: "7" },
    });
    const pending = await transport.handle({
      method: "GET",
      pathname: "/api/crm/follow-ups/pending",
    });
    expect(settings.status).toBe(200);
    expect(list.body.data).toEqual([expect.objectContaining({ leadId: 7 })]);
    expect(pending.body.data).toHaveLength(1);
  });

  it("saves settings and creates pending work for mutable roles", async () => {
    const transport = harness({ role: "owner" });
    const saved = await transport.handle({
      method: "PUT",
      pathname: "/api/crm/follow-ups/settings",
      body: {
        name: "Retorno comercial",
        intervalDays: 2,
        maxAttempts: 5,
        isActive: true,
      },
    });
    const created = await transport.handle({
      method: "POST",
      pathname: "/api/crm/follow-ups",
      body: {
        leadId: 7,
        settingId: 3,
        scheduledAt: "2026-08-16T15:00:00.000Z",
      },
    });
    expect(saved).toMatchObject({
      status: 200,
      body: { data: { name: "Retorno comercial", intervalDays: 2 } },
    });
    expect(created).toMatchObject({
      status: 200,
      body: { data: { leadId: 7, status: "pending" } },
    });
  });

  it("maps sent/responded lifecycle commands", async () => {
    const sentTransport = harness({ role: "manager" });
    const sent = await sentTransport.handle({
      method: "POST",
      pathname: "/api/crm/follow-ups/11/sent",
    });
    expect(sent).toMatchObject({ status: 200, body: { data: { status: "sent" } } });

    const respondedTransport = harness({ role: "manager", initialStatus: "sent" });
    const responded = await respondedTransport.handle({
      method: "POST",
      pathname: "/api/crm/follow-ups/11/responded",
    });
    expect(responded).toMatchObject({
      status: 200,
      body: { data: { status: "responded" } },
    });
  });

  it("denies viewer mutations through CRM authorization", async () => {
    const result = await harness({ role: "viewer" }).handle({
      method: "POST",
      pathname: "/api/crm/follow-ups",
      body: {},
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
    const result = await harness({
      mutationAllowed: false,
      mutationReason: reason,
    }).handle({
      method: "POST",
      pathname: "/api/crm/follow-ups",
      body: {},
    });
    expect(result).toMatchObject({ status: 403, body: { error, reason } });
  });

  it("maps invalid transitions and unsupported methods deterministically", async () => {
    const conflict = await harness({ role: "owner" }).handle({
      method: "POST",
      pathname: "/api/crm/follow-ups/11/responded",
    });
    expect(conflict).toMatchObject({
      status: 409,
      body: { error: "INVALID_TRANSITION" },
    });
    const unsupported = await harness({ role: "owner" }).handle({
      method: "DELETE",
      pathname: "/api/crm/follow-ups",
    });
    expect(unsupported).toMatchObject({
      status: 405,
      body: { error: "METHOD_NOT_ALLOWED" },
    });
  });
});
