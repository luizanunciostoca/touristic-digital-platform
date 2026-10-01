import assert from "node:assert/strict";
import test from "node:test";
import { evaluateInvariants } from "../mdctl/invariants.mjs";

function context(overrides = {}) {
  return {
    observed: {
      snapshotStartedAt: "2026-10-01T07:00:00Z",
      mainSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      observedClaims: [],
      runtimeHealth: {},
      ...overrides.observed,
    },
    termux: { state: "HEALTHY", openHeartbeatCount: 1 },
    integrationQueue: { batches: [] },
    releaseState: {
      candidateSha: null,
      artifactDigest: null,
      stagingState: "UNVERIFIED",
      productionState: "UNVERIFIED",
    },
    ownership: {
      domains: [
        {
          id: "payments",
          pathPrefixes: [
            "packages/financial/",
            "services/financial/",
          ],
        },
      ],
    },
    ...overrides,
  };
}

test("healthy baseline has no critical failures", () => {
  const report = evaluateInvariants(context());
  assert.equal(report.fail, 0);
  assert.deepEqual(report.criticalFailures, []);
});

test("expired unmerged active claim fails closed", () => {
  const report = evaluateInvariants(
    context({
      observed: {
        snapshotStartedAt: "2026-10-01T07:00:00Z",
        mainSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        runtimeHealth: {},
        observedClaims: [
          {
            id: "MD-EXPIRED",
            declaredState: "IMPLEMENTING",
            expiresAt: "2026-09-30T00:00:00Z",
            observedState: "UNVERIFIED",
          },
        ],
      },
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-002").status,
    "FAIL",
  );
});

test("HTTP 200 degraded runtime cannot be accepted", () => {
  const report = evaluateInvariants(
    context({
      observed: {
        snapshotStartedAt: "2026-10-01T07:00:00Z",
        mainSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        observedClaims: [],
        runtimeHealth: {
          production: {
            healthHttpStatus: 200,
            readinessHttpStatus: 200,
            status: "degraded",
            state: "UNHEALTHY_OR_UNVERIFIED",
          },
        },
      },
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-012").status,
    "FAIL",
  );
});

test("production before staging fails", () => {
  const report = evaluateInvariants(
    context({
      releaseState: {
        candidateSha: "cccccccccccccccccccccccccccccccccccccccc",
        artifactDigest: "sha256:" + "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        stagingState: "UNVERIFIED",
        productionState: "VERIFIED",
      },
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-008").status,
    "FAIL",
  );
});
