import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";
import type { CrmMeeting } from "@touristic/crm";
import {
  CrmMeetingServerBoundary,
  type CrmMeetingBoundaryRepository,
} from "@touristic/crm/meetings-boundary";

import type { CrmTransportAuthPort } from "./http-transport.js";
import { CrmMeetingHttpTransport } from "./meetings-http-transport.js";

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

function meeting(overrides: Partial<CrmMeeting> = {}): CrmMeeting {
  return {
    id: 11,
    leadId: 7,
    title: "Reunião comercial",
    scheduledAt: new Date("2026-08-20T18:00:00.000Z"),
    modality: "online",
    meetingLink: "https://meet.example/abc",
    location: null,
    status: "scheduled",
    notes: null,
    createdById: null,
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
  let current = meeting();
  const repository: CrmMeetingBoundaryRepository = {
    list: async (leadId) =>
      leadId === undefined || leadId === current.leadId ? [current] : [],
    findById: async (id) => (id === current.id ? current : null),
    leadExists: async (leadId) => leadId === 7,
    create: async (record) => {
      current = meeting({
        leadId: record.leadId,
        title: record.title,
        scheduledAt: record.scheduledAt,
        modality: record.modality,
        meetingLink: record.meetingLink,
        location: record.location,
        status: record.status,
        notes: record.notes,
      });
      return current;
    },
    update: async (_id, patch) => {
      current = meeting({ ...current, ...patch, updatedAt: now });
      return current;
    },
    appendInteraction: async () => {},
  };
  const boundary = new CrmMeetingServerBoundary(
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
  return new CrmMeetingHttpTransport(boundary, auth);
}

describe("CRM M75 meetings HTTP transport", () => {
  it("requires authentication for collection reads", async () => {
    const transport = harness({ sessionPresent: false });
    expect(
      await transport.handle({
        method: "GET",
        pathname: "/api/crm/meetings",
      }),
    ).toMatchObject({ status: 401, body: { error: "AUTH_REQUIRED" } });
  });

  it("lists meetings with an optional lead filter", async () => {
    const transport = harness({ role: "viewer" });
    const result = await transport.handle({
      method: "GET",
      pathname: "/api/crm/meetings",
      query: { leadId: "7" },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([expect.objectContaining({ leadId: 7 })]);
  });

  it("creates a meeting for an authenticated mutable role", async () => {
    const transport = harness({ role: "owner" });
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/meetings",
      body: {
        leadId: 7,
        title: "Diagnóstico",
        scheduledAt: "2026-08-25T17:30:00.000Z",
        modality: "in_person",
        location: "Morro de São Paulo",
      },
    });
    expect(result).toMatchObject({
      status: 200,
      body: { data: { title: "Diagnóstico", status: "scheduled" } },
    });
  });

  it("updates the frozen meeting lifecycle", async () => {
    const transport = harness({ role: "manager" });
    const result = await transport.handle({
      method: "PATCH",
      pathname: "/api/crm/meetings/11",
      body: { status: "done" },
    });
    expect(result).toMatchObject({
      status: 200,
      body: { data: { id: 11, status: "done" } },
    });
  });

  it("denies viewer mutations through the CRM authorization boundary", async () => {
    const transport = harness({ role: "viewer" });
    const result = await transport.handle({
      method: "PATCH",
      pathname: "/api/crm/meetings/11",
      body: { status: "done" },
    });
    expect(result).toMatchObject({
      status: 403,
      body: { error: "READ_ONLY_ROLE" },
    });
  });

  it.each([
    ["invalid_csrf", "INVALID_CSRF"],
    ["cross_origin_request", "ORIGIN_DENIED"],
  ] as const)(
    "denies mutation security failure %s",
    async (reason, error) => {
      const transport = harness({
        role: "owner",
        mutationAllowed: false,
        mutationReason: reason,
      });
      const result = await transport.handle({
        method: "POST",
        pathname: "/api/crm/meetings",
        body: {},
      });
      expect(result).toMatchObject({ status: 403, body: { error, reason } });
    },
  );

  it("rejects unsupported methods without inventing meeting delete", async () => {
    const transport = harness({ role: "owner" });
    expect(
      await transport.handle({
        method: "DELETE",
        pathname: "/api/crm/meetings/11",
      }),
    ).toMatchObject({ status: 405, body: { error: "METHOD_NOT_ALLOWED" } });
  });
});
