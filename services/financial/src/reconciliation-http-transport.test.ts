import { describe, expect, it } from "vitest";

import {
  normalizePaymentId,
  normalizeReconciliationFinding,
  normalizeReconciliationFindingId,
  normalizeReconciliationRun,
  normalizeReconciliationRunId,
} from "@touristic/financial";

import type { ReconciliationApplicationService } from "./reconciliation-application-service.js";
import {
  ReconciliationHttpTransport,
  reconciliationHttpPrefix,
} from "./reconciliation-http-transport.js";

function fixtures() {
  const paymentId = normalizePaymentId("pay_reconciliation_http_0001");
  const runId = normalizeReconciliationRunId("rrn_reconciliation_http_0001");
  const findingId = normalizeReconciliationFindingId(
    "rcf_reconciliation_http_0001",
  );
  const run = normalizeReconciliationRun({
    id: runId,
    paymentId,
    snapshotHash: "a".repeat(64),
    observedAt: "2026-08-15T02:30:00Z",
    recordedAt: "2026-08-15T02:30:01Z",
    findingCount: 1,
  });
  const finding = normalizeReconciliationFinding({
    id: findingId,
    paymentId,
    kind: "payment_status_mismatch",
    severity: "critical",
    evidenceHash: "b".repeat(64),
    expected: "status:confirmed",
    observed: "status:refunded",
    state: "open",
    firstSeenAt: "2026-08-15T02:30:01Z",
    lastSeenAt: "2026-08-15T02:30:01Z",
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
  });
  if (!paymentId || !runId || !findingId || !run || !finding) {
    throw new Error("FIXTURE_INVALID");
  }
  return { paymentId, runId, findingId, run, finding };
}

function harness(
  options: {
    allowed?: boolean;
    actorSubject?: string;
    rateAllowed?: boolean;
    acknowledgedBy?: string;
    application?: ReconciliationApplicationService;
  } = {},
) {
  const fixture = fixtures();
  const calls: string[] = [];
  const audit: unknown[] = [];
  const application =
    options.application ??
    ({
      reconcilePayment(paymentId, runId) {
        calls.push("run:" + paymentId + ":" + runId);
        return Promise.resolve({
          run: fixture.run,
          findings: [fixture.finding],
          replayed: false,
        });
      },
      listOpenFindings(paymentId) {
        calls.push("list:" + paymentId);
        return Promise.resolve([fixture.finding]);
      },
      acknowledgeFinding(findingId, actor) {
        calls.push("ack:" + findingId + ":" + actor);
        const acknowledged = normalizeReconciliationFinding({
          ...fixture.finding,
          state: "acknowledged",
          acknowledgedAt: "2026-08-15T02:30:02Z",
          acknowledgedBy: options.acknowledgedBy ?? actor,
        });
        if (!acknowledged) throw new Error("ACK_FIXTURE_INVALID");
        return Promise.resolve(acknowledged);
      },
    } satisfies ReconciliationApplicationService);
  const transport = new ReconciliationHttpTransport({
    application,
    authorization: {
      authorize: () =>
        Promise.resolve(
          options.allowed === false
            ? { allowed: false as const, reason: "admin_required" as const }
            : {
                allowed: true as const,
                actorSubject: options.actorSubject ?? "admin-reconciliation",
              },
        ),
    },
    rateLimits: {
      consume: () =>
        Promise.resolve({
          allowed: options.rateAllowed !== false,
          retryAfterSeconds: options.rateAllowed === false ? 30 : 0,
        }),
    },
    audit: {
      record(event) {
        audit.push(event);
        return Promise.resolve();
      },
    },
    clock: { now: () => "2026-08-15T02:30:03Z" },
  });
  return { transport, fixture, calls, audit };
}

describe("M145 admin reconciliation HTTP boundary", () => {
  it("runs reconciliation with exact request idempotency", async () => {
    const { transport, fixture, calls } = harness();
    const pathname =
      reconciliationHttpPrefix + "/payments/" + fixture.paymentId + "/runs";
    await expect(
      transport.handle({
        method: "POST",
        pathname,
        correlationId: "corr_reconciliation_http_0001",
        headers: {
          "idempotency-key": "reconciliation:v1:" + fixture.runId,
        },
        body: { runId: fixture.runId },
        clientIp: "203.0.113.50",
      }),
    ).resolves.toMatchObject({
      status: 201,
      body: {
        data: {
          runId: fixture.runId,
          paymentId: fixture.paymentId,
          findingCount: 1,
          findings: [
            {
              kind: "payment_status_mismatch",
              expected: "status:confirmed",
              observed: "status:refunded",
            },
          ],
          replayed: false,
        },
      },
    });
    expect(calls).toEqual(["run:" + fixture.paymentId + ":" + fixture.runId]);

    await expect(
      transport.handle({
        method: "POST",
        pathname,
        correlationId: "corr_reconciliation_http_0002",
        headers: { "idempotency-key": "wrong" },
        body: { runId: fixture.runId },
      }),
    ).resolves.toMatchObject({
      status: 409,
      body: { error: "IDEMPOTENCY_KEY_MISMATCH" },
    });
    expect(calls).toHaveLength(1);
  });

  it("lists bounded findings and acknowledges with exact authority", async () => {
    const { transport, fixture, calls, audit } = harness();
    await expect(
      transport.handle({
        method: "GET",
        pathname:
          reconciliationHttpPrefix +
          "/payments/" +
          fixture.paymentId +
          "/findings",
        correlationId: "corr_reconciliation_http_0003",
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        data: {
          paymentId: fixture.paymentId,
          findings: [{ id: fixture.findingId, state: "open" }],
        },
      },
    });

    await expect(
      transport.handle({
        method: "POST",
        pathname:
          reconciliationHttpPrefix +
          "/findings/" +
          fixture.findingId +
          "/acknowledgements",
        correlationId: "corr_reconciliation_http_0004",
        headers: {
          "idempotency-key": "reconciliation-ack:v1:" + fixture.findingId,
        },
        body: {},
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        data: {
          id: fixture.findingId,
          state: "acknowledged",
          acknowledgedBy: "admin-reconciliation",
        },
      },
    });
    expect(calls).toEqual([
      "list:" + fixture.paymentId,
      "ack:" + fixture.findingId + ":admin-reconciliation",
    ]);
    expect(audit).toEqual([
      expect.objectContaining({
        action: "reconciliation.read",
        result: "success",
        reason: "listed",
        resourceId: fixture.paymentId,
      }),
      expect.objectContaining({
        action: "reconciliation.acknowledge",
        result: "success",
        reason: "acknowledged_or_replayed",
        resourceId: fixture.findingId,
      }),
    ]);
  });

  it("rejects non-admin authority before reconciliation", async () => {
    const { transport, fixture, calls, audit } = harness({ allowed: false });
    await expect(
      transport.handle({
        method: "GET",
        pathname:
          reconciliationHttpPrefix +
          "/payments/" +
          fixture.paymentId +
          "/findings",
        correlationId: "corr_reconciliation_http_0005",
      }),
    ).resolves.toMatchObject({
      status: 403,
      body: { error: "ADMIN_REQUIRED" },
    });
    expect(calls).toHaveLength(0);
    expect(audit).toEqual([
      expect.objectContaining({
        action: "reconciliation.read",
        result: "denied",
        reason: "admin_required",
        resourceId: fixture.paymentId,
      }),
    ]);
  });

  it("audits rate limits before application access", async () => {
    const { transport, fixture, calls, audit } = harness({
      rateAllowed: false,
    });
    await expect(
      transport.handle({
        method: "GET",
        pathname:
          reconciliationHttpPrefix +
          "/payments/" +
          fixture.paymentId +
          "/findings",
        correlationId: "corr_reconciliation_http_0007",
        clientIp: "203.0.113.51",
      }),
    ).resolves.toMatchObject({
      status: 429,
      body: { error: "RATE_LIMITED" },
      headers: { "Retry-After": "30" },
    });
    expect(calls).toHaveLength(0);
    expect(audit).toEqual([
      expect.objectContaining({
        action: "reconciliation.read",
        result: "denied",
        reason: "rate_limited",
        resourceId: fixture.paymentId,
      }),
    ]);
  });

  it("does not reattribute an acknowledgement replay", async () => {
    const { transport, fixture, audit } = harness({
      actorSubject: "admin-second",
      acknowledgedBy: "admin-first",
    });
    await expect(
      transport.handle({
        method: "POST",
        pathname:
          reconciliationHttpPrefix +
          "/findings/" +
          fixture.findingId +
          "/acknowledgements",
        correlationId: "corr_reconciliation_http_0008",
        headers: {
          "idempotency-key": "reconciliation-ack:v1:" + fixture.findingId,
        },
        body: {},
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        data: {
          acknowledgedBy: "admin-first",
        },
      },
    });
    expect(audit).toEqual([
      expect.objectContaining({
        action: "reconciliation.acknowledge",
        result: "success",
        reason: "already_acknowledged",
        actorSubject: "admin-second",
      }),
    ]);
  });

  it("audits application failures for reads and acknowledgements", async () => {
    const failure = new Error("RECONCILIATION_STORAGE_DOWN");
    const { transport, fixture, audit } = harness({
      application: {
        reconcilePayment: () => Promise.reject(failure),
        listOpenFindings: () => Promise.reject(failure),
        acknowledgeFinding: () => Promise.reject(failure),
      },
    });
    await expect(
      transport.handle({
        method: "GET",
        pathname:
          reconciliationHttpPrefix +
          "/payments/" +
          fixture.paymentId +
          "/findings",
        correlationId: "corr_reconciliation_http_0009",
      }),
    ).resolves.toMatchObject({
      status: 503,
      body: { error: "RECONCILIATION_UNAVAILABLE" },
    });
    await expect(
      transport.handle({
        method: "POST",
        pathname:
          reconciliationHttpPrefix +
          "/findings/" +
          fixture.findingId +
          "/acknowledgements",
        correlationId: "corr_reconciliation_http_0010",
        headers: {
          "idempotency-key": "reconciliation-ack:v1:" + fixture.findingId,
        },
        body: {},
      }),
    ).resolves.toMatchObject({
      status: 503,
      body: { error: "RECONCILIATION_UNAVAILABLE" },
    });
    expect(audit).toEqual([
      expect.objectContaining({
        action: "reconciliation.read",
        result: "failure",
        reason: "internal_failure",
      }),
      expect.objectContaining({
        action: "reconciliation.acknowledge",
        result: "failure",
        reason: "internal_failure",
      }),
    ]);
  });

  it("rejects extra acknowledgement fields", async () => {
    const { transport, fixture, calls } = harness();
    await expect(
      transport.handle({
        method: "POST",
        pathname:
          reconciliationHttpPrefix +
          "/findings/" +
          fixture.findingId +
          "/acknowledgements",
        correlationId: "corr_reconciliation_http_0006",
        headers: {
          "idempotency-key": "reconciliation-ack:v1:" + fixture.findingId,
        },
        body: { resolution: "trust-provider" },
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: "INVALID_RECONCILIATION_ACKNOWLEDGEMENT" },
    });
    expect(calls).toHaveLength(0);
  });
});
