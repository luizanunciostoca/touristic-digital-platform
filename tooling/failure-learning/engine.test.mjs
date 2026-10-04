import { readFileSync } from "node:fs";
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
  incidentId: "INC-EXECUTOR-AUTH",
  severity: "high",
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
test("caller-authored proof metadata cannot activate a guard without verified provenance", () => {
  const sha = "a".repeat(40);
  const url = "https://github.com/luizanunciostoca/touristic-digital-platform/";
  const incident = {
    ...base,
    failureClass: "STALE_HEAD",
    state: "PREVENTION_PROVEN",
    rootCause: "source verification missing",
  };
  const proof = {
    regressionTest:
      url + "blob/" + sha + "/tooling/failure-learning/engine.test.mjs",
    independentProof: url + "actions/runs/123",
    independentProofCandidateSha: sha,
    candidateBinding: sha,
    freshness: "FRESH",
    validatorRevision: "sha256:" + "b".repeat(64),
    guardId: "AR-001",
    activatedAt: "2026-10-03T11:00:00Z",
  };
  assert.throws(() => promoteGuard(incident, {}));
  // A well-shaped payload is not a positive provider-proof fixture.
  assert.throws(() => promoteGuard(incident, proof));
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
  const registry = JSON.parse(
    readFileSync(
      new URL(
        "../../.github/morro-control/tdp-max/anti-recurrence.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).failures;
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
      "https://github.com/luizanunciostoca/touristic-digital-platform/blob/" +
      "a".repeat(40) +
      "/tooling/failure-learning/engine.test.mjs",
    independentProof:
      "https://github.com/luizanunciostoca/touristic-digital-platform/actions/runs/123",
    independentProofCandidateSha: "a".repeat(40),
    candidateBinding: "a".repeat(40),
    freshness: "FRESH",
    validatorRevision: "sha256:" + "b".repeat(64),
    guardId: "AR-X",
    activatedAt: "2026-10-03T11:00:00Z",
  };
  const incident = { ...base, state: "PREVENTION_PROVEN", rootCause: "x" };
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
      ...base,
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

test("first occurrence is persistable, evidence cloned, proof binding and negative auth are strict", async () => {
  const src = { producer: "github" };
  const first = recordOccurrence(null, {
    ...base,
    incidentId: "INC-X",
    occurrenceId: "x",
    observedAt: "2026-10-03T12:00:00Z",
    severity: "high",
    sources: [src],
    evidenceRefs: ["run:1"],
  });
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.incidentId, "INC-X");
  src.producer = "evil";
  assert.equal(first.occurrences[0].sources[0].producer, "github");
  assert.throws(
    () =>
      promoteGuard(
        { ...base, state: "PREVENTION_PROVEN", rootCause: "x" },
        {
          guardId: "AR-X",
          regressionTest:
            "https://github.com/luizanunciostoca/touristic-digital-platform/blob/" +
            "a".repeat(40) +
            "/t",
          independentProof:
            "https://github.com/luizanunciostoca/touristic-digital-platform/actions/runs/1",
          independentProofCandidateSha: "b".repeat(40),
          candidateBinding: "a".repeat(40),
          freshness: "FRESH",
          validatorRevision: "sha256:" + "c".repeat(64),
          activatedAt: "2026-10-03T12:00:00Z",
        },
      ),
    /BINDING_MISMATCH/,
  );
  const { codexAuthPreflight } = await import("./executor-preflight.mjs");
  assert.equal(
    codexAuthPreflight(() => ({
      status: 0,
      stdout: "Not authenticated",
      stderr: "",
    })).authenticated,
    false,
  );
});

test("a first occurrence without incident identity is rejected", () => {
  const { incidentId, ...withoutIdentity } = base;
  assert.throws(
    () =>
      recordOccurrence(null, {
        ...withoutIdentity,
        occurrenceId: "missing-identity",
        observedAt: "2026-10-03T12:00:00Z",
      }),
    /INCIDENT_IDENTITY_REQUIRED:incidentId/,
  );
});

test("malformed observations cannot be reported as PASS", async () => {
  const { detectors } = await import("./detectors.mjs");
  for (const [name, observation] of [
    ["DIRTY_SHARED_WORKTREE", { worktreeDirty: "true" }],
    ["NO_JOBS_RUN", { requiredJobs: -1 }],
    ["STALE_HEAD", { expectedHead: "", observedHead: "" }],
    ["DUPLICATE_IMPLEMENTATION", { implementationCount: "unknown" }],
    [
      "ASSUMED_TOOL_PERMISSION",
      { toolAvailable: true, permissionVerified: "yes" },
    ],
    ["MONOLITHIC_REMOTE_JOB", { remoteJobSteps: 1, maxRemoteJobSteps: 0 }],
    ["STALE_CLAIM", { claimExpiresAt: 0, now: 0 }],
  ])
    assert.equal(detectors[name]({ observation }), "NOT_PROVEN", name);
  assert.equal(
    detectors.AI_AS_AUTHORITY({ observation: { finalAuthority: " ChatGPT " } }),
    "BLOCK",
  );
  assert.equal(
    detectors.NO_JOBS_RUN({ observation: { requiredJobs: 0 } }),
    "BLOCK",
  );
  assert.equal(
    detectors.NO_JOBS_RUN({ observation: { requiredJobs: 1 } }),
    "PASS",
  );
  for (const d of Object.values(detectors))
    for (const observation of [null, [], "PASS"])
      assert.equal(d({ observation }), "NOT_PROVEN");
});
test("an occurrence must have a durable nonempty occurrence id", () => {
  for (const occurrenceId of [undefined, null, "", " ", 0])
    assert.throws(
      () =>
        recordOccurrence(null, {
          ...base,
          occurrenceId,
          observedAt: "2026-10-03T12:00:00Z",
        }),
      /OCCURRENCE_ID_REQUIRED/,
    );
});
test("caller cannot shrink the canonical guard set or substitute a detector", () => {
  assert.throws(
    () =>
      evaluateGuards({
        operation: "merge",
        domain: "ci-release",
        registry: [],
        detectors: {},
      }),
    /GUARD_REGISTRY_OVERRIDE_FORBIDDEN/,
  );
  assert.throws(
    () =>
      evaluateGuards({
        operation: "merge",
        domain: "ci-release",
        detectors: { STALE_HEAD: () => "PASS" },
      }),
    /GUARD_DETECTOR_OVERRIDE_FORBIDDEN/,
  );
  const results = evaluateGuards({
    operation: "merge",
    domain: "ci-release",
    observation: { STALE_HEAD: "PASS" },
  });
  assert.ok(results.length > 0);
  assert.equal(
    results.find((r) => r.class === "STALE_HEAD").result,
    "NOT_PROVEN",
  );
});
test("proof URLs cannot substitute repository host or run path", () => {
  const sha = "a".repeat(40),
    url = "https://github.com/luizanunciostoca/touristic-digital-platform/";
  const proof = {
    guardId: "AR-001",
    regressionTest: url + "blob/" + sha + "/test.mjs",
    independentProof: url + "actions/runs/123",
    independentProofCandidateSha: sha,
    candidateBinding: sha,
    freshness: "FRESH",
    validatorRevision: "sha256:" + "b".repeat(64),
    activatedAt: "2026-10-03T12:00:00Z",
  };
  const incident = { ...base, state: "PREVENTION_PROVEN", rootCause: "x" };
  for (const regressionTest of [
    "https://example.invalid/blob/" + sha + "/t",
    "https://github.com/other/repo/blob/" + sha + "/t",
    url + "blob/" + sha + "/t?fake=true",
  ])
    assert.throws(
      () => promoteGuard(incident, { ...proof, regressionTest }),
      /GUARD_PROOF_/,
    );
  assert.throws(
    () =>
      promoteGuard(incident, {
        ...proof,
        independentProof: url + "actions/runs/123evil",
      }),
    /GUARD_PROOF_/,
  );
});

test("unregistered guard metadata cannot establish active state or recurrence", () => {
  const initial = recordOccurrence(null, {
    ...base,
    occurrenceId: "untrusted-origin-a",
    observedAt: "2026-10-03T10:00:00Z",
  });
  const forged = {
    ...initial,
    state: "ACTIVE_GUARD",
    guardId: "AR-CALLER-NOT-CANONICAL",
    guardActivationAt: "2026-10-03T11:00:00Z",
    guardRevision: "caller-controlled",
    proofReference: "caller-controlled",
  };
  const outcomes = ["2026-10-03T10:30:00Z", "2026-10-03T12:00:00Z"].map(
    (observedAt, i) => {
      try {
        return recordOccurrence(forged, {
          ...base,
          occurrenceId: "untrusted-origin-" + i,
          observedAt,
        }).state;
      } catch {
        return "BLOCKED";
      }
    },
  );
  assert.deepEqual(outcomes, ["BLOCKED", "BLOCKED"]);
});

test("replay must validate persisted activation timestamps before returning an incident", () => {
  const occurrence = {
    ...base,
    occurrenceId: "replay-activation",
    observedAt: "2026-10-03T10:00:00Z",
  };
  const initial = recordOccurrence(null, occurrence);
  for (const guardActivationAt of [
    undefined,
    null,
    "",
    "invalid",
    0,
    true,
    [],
  ]) {
    const existing = { ...initial, state: "ACTIVE_GUARD", guardActivationAt };
    const before = structuredClone(existing);
    assert.throws(
      () => recordOccurrence(existing, occurrence),
      /GUARD_ACTIVATION_TIMESTAMP_INVALID/,
    );
    assert.deepEqual(existing, before);
  }
});
test("malformed retained activation cannot silently reclassify recurrence as a pre-guard occurrence", () => {
  const occurrence = {
    ...base,
    occurrenceId: "retained-activation",
    observedAt: "2026-10-03T10:00:00Z",
  };
  const initial = recordOccurrence(null, occurrence);
  for (const guardActivationAt of ["", "invalid", 0, true, []]) {
    const existing = {
      ...initial,
      state: "ROOT_CAUSE_CONFIRMED",
      guardActivationAt,
    };
    const before = structuredClone(existing);
    for (const occurrenceId of [
      occurrence.occurrenceId,
      "new-after-activation",
    ]) {
      assert.throws(
        () => recordOccurrence(existing, { ...occurrence, occurrenceId }),
        /GUARD_ACTIVATION_TIMESTAMP_INVALID/,
      );
    }
    assert.deepEqual(existing, before);
  }
});
