import type { AuthSessionIdentity } from "@touristic/auth";
import {
  CrmMetricsServerBoundary,
  type CrmDashboardMetrics,
  type CrmMetricsAuditEvent,
} from "@touristic/crm/metrics-boundary";
import { describe, expect, it } from "vitest";

import {
  CrmMetricsHttpTransport,
  type CrmTransportAuthPort,
} from "./metrics-http-transport.js";
import { MySqlCrmMetricsAuditPort } from "./mysql-metrics-audit-port.js";

const now = new Date("2026-08-15T05:00:00.000Z");

function session(): AuthSessionIdentity {
  return {
    subject: "crm-viewer",
    email: "viewer@example.com",
    role: "viewer",
    businessIds: [],
    issuedAt: Math.floor(now.getTime() / 1000) - 60,
    expiresAt: Math.floor(now.getTime() / 1000) + 3600,
    sessionId: "session-viewer",
  };
}

const snapshot: CrmDashboardMetrics = {
  total: 1,
  active: 1,
  converted: 0,
  lost: 0,
  conversionRate: 0,
  totalRevenue: "0.00",
  stageGroups: {
    new_lead: 1,
    first_contact: 0,
    meeting_scheduled: 0,
    proposal_sent: 0,
    trial: 0,
    contract_sent: 0,
    contract_signed: 0,
    payment_pending: 0,
    payment_done: 0,
    onboarding: 0,
    photo_visit_scheduled: 0,
    photo_visit_done: 0,
    published: 0,
    announced: 0,
    feedback: 0,
    active_client: 0,
    churned: 0,
    lost: 0,
  },
  stageConversion: [],
  recentLeads: [],
  recentInteractions: [],
};

function fixture(authenticated: boolean) {
  const audits: CrmMetricsAuditEvent[] = [];
  const boundary = new CrmMetricsServerBoundary(
    { readSnapshot: async () => snapshot },
    { record: async (event) => void audits.push(event) },
    () => now,
  );
  const auth: CrmTransportAuthPort = {
    resolveSession: async () => (authenticated ? session() : null),
    authorizeMutation: async () => ({ allowed: true }),
  };
  return {
    audits,
    transport: new CrmMetricsHttpTransport(boundary, auth),
  };
}

describe("CRM M138 dashboard metrics HTTP transport", () => {
  it("requires the shared platform session for the frozen metrics endpoint", async () => {
    const { transport, audits } = fixture(false);
    const result = await transport.handle({
      method: "GET",
      pathname: "/api/crm/metrics/funnel",
    });
    expect(result.status).toBe(401);
    expect(result.body.error).toBe("AUTH_REQUIRED");
    expect(audits[0]?.operation).toBe("dashboard.metrics.read");
    expect(audits[0]?.reason).toBe("authentication_required");
  });

  it("returns the server-owned snapshot to an authenticated viewer", async () => {
    const { transport } = fixture(true);
    const result = await transport.handle({
      method: "GET",
      pathname: "/api/crm/metrics/funnel",
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: snapshot });
  });

  it("keeps the metrics surface read-only", async () => {
    const { transport } = fixture(true);
    const result = await transport.handle({
      method: "POST",
      pathname: "/api/crm/metrics/funnel",
      body: {},
    });
    expect(result.status).toBe(405);
    expect(result.body.error).toBe("METHOD_NOT_ALLOWED");
  });

  it("persists denied metrics reads with prepared audit parameters", async () => {
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const audit = new MySqlCrmMetricsAuditPort({
      execute: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return [[], []];
      },
    } as never);

    await audit.record({
      operation: "dashboard.metrics.read",
      allowed: false,
      reason: "authentication_required",
      actorSubject: null,
      leadId: null,
    });
    expect(calls[0]?.sql).toContain("VALUES (?, ?, ?, ?, ?)");
    expect(calls[0]?.values).toEqual([
      "dashboard.metrics.read",
      false,
      "authentication_required",
      null,
      null,
    ]);
  });
});
