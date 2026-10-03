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
      regressionTest: "t",
      independentProof: "p",
      candidateBinding: "sha",
      freshness: "fresh",
      validatorRevision: "v1",
      activatedAt: "2026-10-03T11:00:00Z",
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
