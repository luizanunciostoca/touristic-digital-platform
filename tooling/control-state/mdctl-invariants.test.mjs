import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateInvariants,
  executorControlState,
} from "../mdctl/invariants.mjs";
import { selectAuthorizedExecutor } from "../failure-learning/executor-preflight.mjs";

function context(overrides = {}) {
  return {
    observed: {
      snapshotStartedAt: "2026-10-01T07:00:00Z",
      mainSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      mainShaAtEnd: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sources: Object.fromEntries(
        [
          "main",
          "mainRecheck",
          "pullRequests",
          "pullRequestsRecheck",
          "claims",
        ].map((name) => [name, { state: "AVAILABLE" }]),
      ),
      observedClaims: [],
      runtimeHealth: {},
      ...overrides.observed,
    },
    termux: {
      state: "HEALTHY",
      openHeartbeatCount: 1,
      details: [{ fields: { heartbeat_utc: new Date().toISOString() } }],
    },
    executor: { target: "github" },
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

test("selected GitHub control does not require an unselected Termux heartbeat", () => {
  const mainSha = "b".repeat(40);
  const report = evaluateInvariants(
    context({
      executor: { target: "github" },
      termux: { state: "UNHEALTHY_OR_UNVERIFIED" },
      observed: {
        mainSha,
        mainShaAtEnd: mainSha,
        sources: Object.fromEntries(
          [
            "main",
            "mainRecheck",
            "pullRequests",
            "pullRequestsRecheck",
            "claims",
          ].map((name) => [name, { state: "AVAILABLE" }]),
        ),
      },
    }),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-001").status,
    "PASS",
  );
});

test("selected transport needs its actual control capabilities", () => {
  const input = context();
  assert.equal(executorControlState(input), "PASS");
  assert.equal(
    executorControlState({ ...input, executor: { target: "termux" } }),
    "PASS",
  );
  for (const termux of [
    undefined,
    { state: "NOT_REQUIRED" },
    { state: "UNHEALTHY_OR_UNVERIFIED" },
  ]) {
    assert.equal(executorControlState({ ...input, termux }), "PASS");
    assert.equal(
      executorControlState({
        ...input,
        executor: { target: "termux" },
        termux,
      }),
      "BLOCKED",
    );
  }
  for (const executor of [undefined, {}, { target: "unknown" }])
    assert.equal(executorControlState({ ...input, executor }), "BLOCKED");
  for (const heartbeat_utc of [
    undefined,
    "unknown",
    new Date(Date.now() - 600000).toISOString(),
    new Date(Date.now() + 600000).toISOString(),
  ]) {
    const stale = {
      ...input,
      executor: { target: "termux" },
      termux: { state: "HEALTHY", details: [{ fields: { heartbeat_utc } }] },
    };
    assert.equal(executorControlState(stale), "BLOCKED");
  }
  for (const target of ["github", "termux"]) {
    for (const name of Object.keys(input.observed.sources)) {
      const copy = structuredClone(input);
      copy.executor.target = target;
      delete copy.observed.sources[name];
      assert.equal(executorControlState(copy), "NOT_PROVEN");
    }
    assert.equal(
      executorControlState({
        ...input,
        executor: { target },
        observed: { ...input.observed, mainShaAtEnd: "c".repeat(40) },
      }),
      "NOT_PROVEN",
    );
  }
});

test("healthy selected control never substitutes executor authorization or authentication", () => {
  const control = context({ termux: { state: "UNHEALTHY_OR_UNVERIFIED" } });
  assert.equal(executorControlState(control), "PASS");
  const executor = {
    executor: "codex",
    installed: true,
    authenticated: true,
    functional: true,
    authorized: true,
  };
  for (const patch of [
    { authorized: false },
    { authenticated: false },
    { functional: false },
  ]) {
    assert.notEqual(
      selectAuthorizedExecutor([{ ...executor, ...patch }]).result,
      "PASS",
    );
  }
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
