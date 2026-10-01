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
      ...overrides.releaseState,
    },
    ownership: {
      domains: [
        {
          id: "payments",
          pathPrefixes: ["packages/financial/", "services/financial/"],
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

test("expired merged claim still fails stale active declaration", () => {
  const report = evaluateInvariants(
    context({
      observed: {
        snapshotStartedAt: "2026-10-01T07:00:00Z",
        mainSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        runtimeHealth: {},
        observedClaims: [
          {
            id: "MD-STALE-MERGED",
            declaredState: "IMPLEMENTING",
            expiresAt: "2026-09-30T00:00:00Z",
            observedState: "MERGED",
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
        artifactDigest:
          "sha256:" +
          "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
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

test("active candidate requires trusted validator independence", () => {
  const report = evaluateInvariants(
    context({
      releaseState: {
        candidateSha: "cccccccccccccccccccccccccccccccccccccccc",
      },
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-005").status,
    "FAIL",
  );
});

test("candidate acceptance requires tenant and destination isolation proof", () => {
  const report = evaluateInvariants(
    context({
      releaseState: {
        candidateSha: "cccccccccccccccccccccccccccccccccccccccc",
        trustedValidatorIndependenceState: "VERIFIED",
      },
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-010").status,
    "FAIL",
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-011").status,
    "FAIL",
  );
});

test("docs-only main advance does not create runtime drift", () => {
  const runtimeSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const report = evaluateInvariants(
    context({
      observed: {
        mainSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        snapshotStartedAt: "2026-10-01T07:00:00Z",
        observedClaims: [],
        runtimeHealth: {
          production: {
            state: "HEALTHY",
            releaseSha: runtimeSha,
          },
        },
      },
      releaseState: {
        candidateSha: null,
        expectedCertifiedReleaseSha: runtimeSha,
        tenantIsolationState: "VERIFIED",
        destinationIsolationState: "VERIFIED",
      },
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-013").status,
    "PASS",
  );
});

test("healthy runtime without expected certified release fails closed", () => {
  const report = evaluateInvariants(
    context({
      observed: {
        mainSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        snapshotStartedAt: "2026-10-01T07:00:00Z",
        observedClaims: [],
        runtimeHealth: {
          production: {
            state: "HEALTHY",
            releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        },
      },
      releaseState: {
        candidateSha: null,
        tenantIsolationState: "VERIFIED",
        destinationIsolationState: "VERIFIED",
      },
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-013").status,
    "FAIL",
  );
});

test("control projection identity mismatch fails closed", () => {
  const report = evaluateInvariants(
    context({
      projectionAuthority: "GITHUB_EXACT_MAIN",
      projectionSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-000").status,
    "FAIL",
  );
});
