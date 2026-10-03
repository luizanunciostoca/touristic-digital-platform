import assert from "node:assert/strict";
import test from "node:test";
import {
  fingerprint,
  recordOccurrence,
  promoteGuard,
  closeIncident,
  evaluateGuards,
} from "./engine.mjs";
const base = {
  failureClass: "EXECUTOR_AUTH_UNAVAILABLE",
  domain: "engineering",
  environment: "termux-debian",
  operation: "codex-dispatch",
  expected: "authenticated executor",
  observed: "HTTP 401",
};
test("fingerprint is stable across timestamps and transient ids", () => {
  assert.equal(
    fingerprint({ ...base, observedAt: "2026-01-01", occurrenceId: "a" }),
    fingerprint({ ...base, observedAt: "2026-02-01", occurrenceId: "b" }),
  );
});
test("occurrence replay is idempotent and counters monotonic", () => {
  let x = recordOccurrence(null, {
    ...base,
    occurrenceId: "o1",
    observedAt: "2026-10-03T10:00:00Z",
  });
  let y = recordOccurrence(x, {
    ...base,
    occurrenceId: "o1",
    observedAt: "2026-10-03T10:00:00Z",
  });
  assert.deepEqual(y, x);
  let z = recordOccurrence(x, {
    ...base,
    occurrenceId: "o2",
    observedAt: "2026-10-03T09:00:00Z",
  });
  assert.equal(z.lastOccurrence, x.lastOccurrence);
  assert.equal(z.metrics.occurrencesBeforeGuard, 2);
});
test("guard promotion requires prevention proof", () => {
  assert.throws(() =>
    promoteGuard(
      { ...base, state: "PREVENTION_PROVEN", rootCause: "missing preflight" },
      {},
    ),
  );
  let x = promoteGuard(
    { ...base, state: "PREVENTION_PROVEN", rootCause: "missing preflight" },
    {
      guardId: "AR-022",
      regressionTest:
        "https://github.com/o/r/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/tooling/failure-learning/engine.test.mjs",
      independentProof: "https://github.com/o/r/actions/runs/123",
      candidateBinding: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      freshness: "FRESH",
      validatorRevision: "sha256:" + "b".repeat(64),
      activatedAt: "2026-10-03T11:00:00Z",
      independentProofCandidate: "a".repeat(40),
      independentProofResult: "PASS",
      independentProofAssertion: "GUARD_PREVENTION_PROVEN",
    },
  );
  assert.equal(x.state, "ACTIVE_GUARD");
});
test("recurrence after active guard reopens cause and marks ineffective", () => {
  let x = recordOccurrence(
    {
      ...base,
      fingerprint: fingerprint(base),
      state: "ACTIVE_GUARD",
      guardActivationAt: "2026-10-03T11:00:00Z",
      occurrenceIds: [],
      metrics: {},
    },
    { ...base, occurrenceId: "o2", observedAt: "2026-10-03T12:00:00Z" },
  );
  assert.equal(x.recurrenceAfterGuard, true);
  assert.equal(x.state, "ROOT_CAUSE_CONFIRMED");
  assert.equal(x.metrics.guardEffectiveness, "INEFFECTIVE");
});
test("no silent failure requires material outcome", () => {
  assert.throws(() => closeIncident({ ...base }, {}));
  assert.equal(
    closeIncident(
      { ...base },
      {
        state: "TRANSIENT_RESOLVED",
        materialOutcome: "retry succeeded after provider recovery",
      },
    ).state,
    "TRANSIENT_RESOLVED",
  );
});
test("critical missing detector fails closed and caller cannot override", () => {
  const registry = [
    {
      id: "AR-X",
      class: "STALE_HEAD",
      severity: "critical",
      operations: ["merge"],
    },
  ];
  let r = evaluateGuards({
    operation: "merge",
    domain: "ci-release",
    detectors: {},
    registry,
    observation: { STALE_HEAD: "PASS" },
  });
  assert.equal(r[0].result, "NOT_PROVEN");
});
test("codex dispatch preflight blocks installed but unauthenticated executor", async () => {
  const { codexAuthPreflight, authorizeDispatch } =
    await import("./executor-preflight.mjs");
  const fake = () => ({ status: 0, stdout: "Not logged in\n", stderr: "" });
  const p = codexAuthPreflight(fake);
  assert.equal(p.authenticated, false);
  assert.deepEqual(authorizeDispatch(p), {
    result: "BLOCK",
    failureClass: "EXECUTOR_AUTH_UNAVAILABLE",
    rootCause: "EXECUTOR_AUTH_PREFLIGHT_MISSING",
  });
});
test("all canonical anti-recurrence classes have executable detectors", async () => {
  const { detectors } = await import("./detectors.mjs");
  const { readFile } = await import("node:fs/promises");
  const registry = JSON.parse(
    await readFile(
      ".github/morro-control/tdp-max/anti-recurrence.json",
      "utf8",
    ),
  );
  const executable = new Set(Object.keys(detectors));
  for (const failure of registry.failures)
    assert.ok(executable.has(failure.class));
  for (const detector of Object.values(detectors))
    assert.ok(
      ["PASS", "BLOCK", "NOT_PROVEN"].includes(detector({ observation: {} })),
    );
});

test("active guard cannot bypass promotion and malformed timestamps fail closed", async () => {
  assert.throws(() =>
    closeIncident(
      { state: "OBSERVED" },
      { state: "ACTIVE_GUARD", materialOutcome: "done" },
    ),
  );
  assert.throws(() =>
    promoteGuard(
      { ...base, state: "PREVENTION_PROVEN", rootCause: "x" },
      {
        regressionTest: "t",
        independentProof: "p",
        candidateBinding: "sha",
        freshness: "fresh",
        validatorRevision: "v1",
        guardId: "AR-X",
        activatedAt: "bad",
      },
    ),
  );
  const { detectors } = await import("./detectors.mjs");
  assert.equal(
    detectors.STALE_CLAIM({
      observation: { claimExpiresAt: "bad", now: "bad" },
    }),
    "NOT_PROVEN",
  );
  assert.equal(
    detectors.STALE_DR_PROOF({
      observation: { drProofAt: "bad", lastDrInvalidationAt: "bad" },
    }),
    "NOT_PROVEN",
  );
});

test("invalid occurrence time and named AI authority fail closed", async () => {
  assert.throws(
    () =>
      recordOccurrence(
        {
          ...base,
          fingerprint: fingerprint(base),
          state: "ACTIVE_GUARD",
          guardActivationAt: "2026-10-03T11:00:00Z",
          occurrenceIds: [],
          metrics: {},
        },
        { ...base, occurrenceId: "bad-time", observedAt: "bad" },
      ),
    /OCCURRENCE_TIMESTAMP_INVALID/,
  );
  const { detectors } = await import("./detectors.mjs");
  for (const authority of ["AI", "ai", "CHATGPT", "COPILOT", "CODEX"])
    assert.equal(
      detectors.AI_AS_AUTHORITY({ observation: { finalAuthority: authority } }),
      "BLOCK",
    );
});

test("occurrence replay conflict, metadata overwrite and out-of-order history are safe", () => {
  let x = recordOccurrence(null, {
    ...base,
    occurrenceId: "a",
    observedAt: "2026-10-03T12:00:00Z",
  });
  assert.throws(
    () =>
      recordOccurrence(x, {
        ...base,
        occurrenceId: "a",
        observedAt: "2026-10-03T13:00:00Z",
      }),
    /OCCURRENCE_REPLAY_CONFLICT/,
  );
  x = {
    ...x,
    state: "ACTIVE_GUARD",
    guardId: "AR-X",
    guardActivationAt: "2026-10-03T11:00:00Z",
    proofReference: "proof",
  };
  let y = recordOccurrence(x, {
    ...base,
    occurrenceId: "b",
    observedAt: "2026-10-03T12:30:00Z",
    guardActivationAt: "2099-01-01T00:00:00Z",
    guardId: "evil",
  });
  assert.equal(y.guardId, "AR-X");
  assert.equal(y.guardActivationAt, "2026-10-03T11:00:00Z");
  assert.equal(y.recurrenceAfterGuard, true);
  let z = recordOccurrence(y, {
    ...base,
    occurrenceId: "c",
    observedAt: "2026-10-03T10:00:00Z",
  });
  assert.equal(z.recurrenceAfterGuard, true);
  assert.equal(z.firstOccurrence, "2026-10-03T10:00:00Z");
  assert.equal(z.lastOccurrence, "2026-10-03T12:30:00Z");
});

test("guard proof identities and executor positive auth are fail closed", async () => {
  const valid = {
    regressionTest:
      "https://github.com/o/r/blob/" +
      "a".repeat(40) +
      "/tooling/failure-learning/engine.test.mjs",
    independentProof: "https://github.com/o/r/actions/runs/123",
    candidateBinding: "a".repeat(40),
    freshness: "FRESH",
    validatorRevision: "sha256:" + "b".repeat(64),
    guardId: "AR-X",
    activatedAt: "2026-10-03T11:00:00Z",
  };
  const incident = { ...base, state: "PREVENTION_PROVEN", rootCause: "x" };
  assert.throws(
    () =>
      promoteGuard(incident, {
        ...valid,
        regressionTest:
          "https://github.com/o/r/blob/" +
          "c".repeat(40) +
          "/tooling/failure-learning/engine.test.mjs",
      }),
    /GUARD_REGRESSION_CANDIDATE_MISMATCH/,
  );
  assert.throws(
    () =>
      promoteGuard(incident, {
        ...valid,
        independentProofCandidate: "c".repeat(40),
      }),
    /GUARD_INDEPENDENT_PROOF_CANDIDATE_MISMATCH/,
  );
  assert.throws(
    () => promoteGuard(incident, { ...valid, independentProofResult: "FAIL" }),
    /GUARD_INDEPENDENT_PROOF_NOT_PASS/,
  );
  for (const key of [
    "regressionTest",
    "independentProof",
    "candidateBinding",
    "freshness",
    "validatorRevision",
  ])
    assert.throws(() =>
      promoteGuard(incident, { ...valid, [key]: "placeholder" }),
    );
  const { codexAuthPreflight, authorizeDispatch } =
    await import("./executor-preflight.mjs");
  assert.equal(
    codexAuthPreflight(() => ({ status: 0, stdout: "", stderr: "" }))
      .authenticated,
    false,
  );
  assert.equal(
    authorizeDispatch(
      codexAuthPreflight(() => ({
        status: 0,
        stdout: "Logged in",
        stderr: "",
      })),
    ).result,
    "PASS",
  );
});

test("occurrence evidence is immutable history and cannot overwrite incident lifecycle", () => {
  let x = recordOccurrence(
    {
      incidentId: "INC-1",
      rootCause: "confirmed",
      rootCauseFingerprint: "sha256:" + "a".repeat(64),
      preventionState: "PROVEN",
      fingerprint: fingerprint(base),
      occurrenceIds: [],
      occurrences: [],
      metrics: {},
      state: "ROOT_CAUSE_CONFIRMED",
    },
    {
      ...base,
      occurrenceId: "e1",
      observedAt: "2026-10-03T12:00:00Z",
      severity: "high",
      sources: [{ producer: "github" }],
      evidenceRefs: ["run:1"],
      rootCause: null,
      incidentId: "EVIL",
    },
  );
  assert.equal(x.incidentId, "INC-1");
  assert.equal(x.rootCause, "confirmed");
  assert.equal(x.preventionState, "PROVEN");
  assert.equal(x.occurrences[0].severity, "high");
  assert.deepEqual(x.occurrences[0].evidenceRefs, ["run:1"]);
  assert.throws(
    () =>
      recordOccurrence(x, {
        ...base,
        occurrenceId: "e1",
        observedAt: "2026-10-03T12:00:00Z",
        severity: "low",
        sources: [{ producer: "github" }],
        evidenceRefs: ["run:1"],
      }),
    /OCCURRENCE_REPLAY_CONFLICT/,
  );
});
