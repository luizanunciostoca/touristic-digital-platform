import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmTrial } from "@touristic/crm";
import {
  CrmTrialServerBoundary,
  type CrmTrialBoundaryRepository,
} from "@touristic/crm/trials-boundary";

import type { CrmTransportAuthPort } from "./http-transport.js";
import { CrmTrialHttpTransport } from "./trials-http-transport.js";

const now = new Date("2026-08-12T12:00:00.000Z");

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

function trial(overrides: Partial<CrmTrial> = {}): CrmTrial {
  return {
    id: 21,
    leadId: 7,
    startDate: now,
    endDate: new Date("2026-09-11T12:00:00.000Z"),
    durationDays: 30,
    status: "active",
    convertedAt: null,
    notifiedAt: null,
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
    initialStatus?: CrmTrial["status"];
  } = {},
) {
  let current = trial({ status: options.initialStatus ?? "active" });
  const repository: CrmTrialBoundaryRepository = {
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    create: async (record) => {
      current = trial({
        leadId: record.leadId,
        startDate: record.startDate,
        endDate: record.endDate,
        durationDays: record.durationDays,
        status: record.status,
      });
      return current;
    },
    markConverted: async (_id, convertedAt) => {
      current = trial({ ...current, status: "converted", convertedAt });
      return current;
    },
    markCancelled: async () => {
      current = trial({ ...current, status: "cancelled" });
      return current;
    },
    markExpired: async () => {
      current = trial({ ...current, status: "expired" });
      return current;
    },
    updateLeadStage: async () => {},
    appendInteraction: async () => {},
  };
  const boundary = new CrmTrialServerBoundary(
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
  return new CrmTrialHttpTransport(boundary, auth);
}

describe("CRM M91 trials HTTP transport", () => {
  it("requires authentication for collection reads", async () => {
    const transport = harness({ sessionPresent: false });
    expect(
      await transport.handle({ method: "GET", pathname: "/api/crm/trials" }),
    ).toMatchObject({ status: 401, body: { error: "AUTH_REQUIRED" } });
  });

  it("lists trials with an optional prepared domain lead filter", async () => {
    const transport = harness({ role: "viewer" });
    const result = await transport.handle({
      method: "GET",
      pathname: "/api/crm/trials",
      query: { leadId: "7" },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([expect.objectContaining({ leadId: 7 })]);
  });

  it("creates a V1-compatible trial with the boundary defaults", async () => {
    const transport = harness({ role: "owner" });
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/trials",
      body: { leadId: 7 },
    });
    expect(result).toMatchObject({
      status: 200,
      body: { data: { leadId: 7, durationDays: 30, status: "active" } },
    });
  });

  it.each([
    ["convert", "converted"],
    ["cancel", "cancelled"],
    ["expire", "expired"],
  ] as const)(
    "executes explicit %s lifecycle action",
    async (action, status) => {
      const transport = harness({ role: "manager" });
      const result = await transport.handle({
        method: "POST",
        pathname: `/api/crm/trials/21/${action}`,
      });
      expect(result).toMatchObject({
        status: 200,
        body: { data: { id: 21, status } },
      });
    },
  );

  it("maps terminal lifecycle mutation to an HTTP conflict", async () => {
    const transport = harness({ role: "owner", initialStatus: "cancelled" });
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/trials/21/convert",
    });
    expect(result).toMatchObject({
      status: 409,
      body: { error: "INVALID_TRANSITION", reason: "invalid_transition" },
    });
  });

  it("denies viewer mutations through the CRM authorization boundary", async () => {
    const transport = harness({ role: "viewer" });
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/trials/21/cancel",
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
      pathname: "/api/crm/trials",
      body: { leadId: 7 },
    });
    expect(result).toMatchObject({
      status: 403,
      body: { error, reason },
    });
  });

  it("rejects generic PATCH and DELETE instead of bypassing the frozen lifecycle", async () => {
    const transport = harness({ role: "owner" });
    expect(
      await transport.handle({
        method: "PATCH",
        pathname: "/api/crm/trials/21/convert",
      }),
    ).toMatchObject({ status: 405, body: { error: "METHOD_NOT_ALLOWED" } });
    expect(
      await transport.handle({
        method: "DELETE",
        pathname: "/api/crm/trials/21/cancel",
      }),
    ).toMatchObject({ status: 405, body: { error: "METHOD_NOT_ALLOWED" } });
  });
});
