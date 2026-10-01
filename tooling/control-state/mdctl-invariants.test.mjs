import assert from "node:assert/strict";
import test from "node:test";
import { evaluateInvariants, loadInvariantContextAtMain } from "../mdctl/invariants.mjs";

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
  const candidateSha = "cccccccccccccccccccccccccccccccccccccccc";
  const report = evaluateInvariants(
    context({
      releaseState: {
        candidateSha,
        trustedValidatorIndependenceState: "VERIFIED",
        trustedValidatorIndependenceEvidenceSha: candidateSha,
        trustedValidatorIndependenceRunId: "101",
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


test("verified critical evidence cannot be reused across candidate identities", () => {
  const candidateSha = "cccccccccccccccccccccccccccccccccccccccc";
  const staleSha = "dddddddddddddddddddddddddddddddddddddddd";
  const report = evaluateInvariants(
    context({
      releaseState: {
        candidateSha,
        trustedValidatorIndependenceState: "VERIFIED",
        trustedValidatorIndependenceEvidenceSha: staleSha,
        trustedValidatorIndependenceRunId: "101",
        tenantIsolationState: "VERIFIED",
        tenantIsolationEvidenceSha: staleSha,
        tenantIsolationRunId: "102",
        destinationIsolationState: "VERIFIED",
        destinationIsolationEvidenceSha: staleSha,
        destinationIsolationRunId: "103",
      },
    }),
  );
  for (const id of ["INV-005", "INV-010", "INV-011"]) {
    assert.equal(
      report.checks.find((check) => check.id === id).status,
      "FAIL",
    );
  }
});

test("candidate-bound critical evidence requires exact SHA and proof run identity", () => {
  const candidateSha = "cccccccccccccccccccccccccccccccccccccccc";
  const report = evaluateInvariants(
    context({
      releaseState: {
        candidateSha,
        trustedValidatorIndependenceState: "VERIFIED",
        trustedValidatorIndependenceEvidenceSha: candidateSha,
        trustedValidatorIndependenceRunId: "201",
        tenantIsolationState: "VERIFIED",
        tenantIsolationEvidenceSha: candidateSha,
        tenantIsolationRunId: "202",
        destinationIsolationState: "VERIFIED",
        destinationIsolationEvidenceSha: candidateSha,
        destinationIsolationRunId: "203",
      },
    }),
  );
  for (const id of ["INV-005", "INV-010", "INV-011"]) {
    assert.equal(
      report.checks.find((check) => check.id === id).status,
      "PASS",
    );
  }
});

test("exact-main control projection loader rechecks main after projection reads", async () => {
  const mainSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const movedSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const content = (value) => ({
    encoding: "base64",
    content: Buffer.from(JSON.stringify(value)).toString("base64"),
  });
  const api = async (endpoint) => {
    if (endpoint.endsWith("/commits/main")) return { sha: movedSha };
    if (endpoint.includes("integration-queue.json"))
      return content({ version: 1, batches: [] });
    if (endpoint.includes("release-state.json"))
      return content({ schemaVersion: 1, candidateSha: null });
    if (endpoint.includes("ownership.json"))
      return content({ version: 2, domains: [] });
    throw new Error("UNEXPECTED_ENDPOINT");
  };

  await assert.rejects(
    loadInvariantContextAtMain({
      repository: "fixture/repo",
      mainSha,
      api,
    }),
    /MAIN_CHANGED_DURING_CONTROL_PROJECTION_LOAD/u,
  );
});

test("exact-main control projection loader exposes the stable terminal main identity", async () => {
  const mainSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const content = (value) => ({
    encoding: "base64",
    content: Buffer.from(JSON.stringify(value)).toString("base64"),
  });
  const api = async (endpoint) => {
    if (endpoint.endsWith("/commits/main")) return { sha: mainSha };
    if (endpoint.includes("integration-queue.json"))
      return content({ version: 1, batches: [] });
    if (endpoint.includes("release-state.json"))
      return content({ schemaVersion: 1, candidateSha: null });
    if (endpoint.includes("ownership.json"))
      return content({ version: 2, domains: [] });
    throw new Error("UNEXPECTED_ENDPOINT");
  };

  const loaded = await loadInvariantContextAtMain({
    repository: "fixture/repo",
    mainSha,
    api,
  });
  assert.equal(loaded.projectionSha, mainSha);
  assert.equal(loaded.projectionMainShaAtEnd, mainSha);
});
