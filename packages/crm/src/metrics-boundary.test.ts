import { describe, expect, it, vi } from "vitest";

import type { AuthSessionIdentity } from "@touristic/auth";

import {
  CrmMetricsServerBoundary,
  type CrmDashboardMetrics,
  type CrmMetricsAuditEvent,
} from "./metrics-boundary.js";

const now = new Date("2026-08-15T05:00:00.000Z");

function session(
  expiresAt = Math.floor(now.getTime() / 1000) + 300,
): AuthSessionIdentity {
  return {
    subject: "crm-viewer",
    email: "viewer@example.com",
    role: "viewer",
    businessIds: ["crm-placeholder"],
    issuedAt: Math.floor(now.getTime() / 1000) - 60,
    expiresAt,
    sessionId: "session-viewer",
  };
}

const snapshot: CrmDashboardMetrics = {
  total: 4,
  active: 3,
  converted: 1,
  lost: 1,
  conversionRate: 25,
  totalRevenue: "299.00",
  stageGroups: {
    new_lead: 1,
    first_contact: 0,
    meeting_scheduled: 1,
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
    active_client: 1,
    churned: 0,
    lost: 1,
  },
  stageConversion: [],
  recentLeads: [],
  recentInteractions: [],
};

describe("CRM M138 dashboard metrics boundary", () => {
  it("fails closed and audits unauthenticated reads", async () => {
    const readSnapshot = vi.fn(async () => snapshot);
    const events: CrmMetricsAuditEvent[] = [];
    const boundary = new CrmMetricsServerBoundary(
      { readSnapshot },
      { record: async (event) => void events.push(event) },
      () => now,
    );

    await expect(boundary.read(null)).resolves.toEqual({
      ok: false,
      reason: "authentication_required",
    });
    expect(readSnapshot).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        operation: "dashboard.metrics.read",
        allowed: false,
        reason: "authentication_required",
        actorSubject: null,
        leadId: null,
      },
    ]);
  });

  it("rejects an expired session before reading persisted metrics", async () => {
    const readSnapshot = vi.fn(async () => snapshot);
    const boundary = new CrmMetricsServerBoundary(
      { readSnapshot },
      { record: async () => undefined },
      () => now,
    );

    const result = await boundary.read(
      session(Math.floor(now.getTime() / 1000)),
    );
    expect(result).toEqual({ ok: false, reason: "session_expired" });
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("allows the existing read-only viewer role and returns repository authority unchanged", async () => {
    const readSnapshot = vi.fn(async () => snapshot);
    const record = vi.fn(async () => undefined);
    const boundary = new CrmMetricsServerBoundary(
      { readSnapshot },
      { record },
      () => now,
    );

    await expect(boundary.read(session())).resolves.toEqual({
      ok: true,
      value: snapshot,
    });
    expect(readSnapshot).toHaveBeenCalledTimes(1);
    expect(record).not.toHaveBeenCalled();
  });
});
