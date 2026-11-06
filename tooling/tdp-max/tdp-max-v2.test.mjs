import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBootstrapReport,
  buildReconcileReport,
  deriveLiveEngineeringProof,
  evaluateFinalGate,
} from "./tdp-max-v2.mjs";
import { parseArgs } from "./cli.mjs";

const MAIN = "a".repeat(40);
const CANDIDATE = "b".repeat(40);
const OTHER = "c".repeat(40);
const NOW = Date.parse("2026-10-03T09:00:00Z");
const CHANGESET = "MD-TDP-MAX-002";
const REPOSITORY = "luizanunciostoca/touristic-digital-platform";
const BRANCH = "infra/tdp-max-002-impl-20261003";
const finalGate = { mode: "projection" };
const authorityMap = {
  mode: "projection",
  authorities: {
    enterpriseOs: {
      type: "google-drive-live",
      entry: "AI_START_HERE",
      authorityMatrix: "SOURCE_OF_TRUTH_MATRIX",
    },
  },
};

function collector(patch = {}, criticalFailures = []) {
  return {
    observed: {
      repository: REPOSITORY,
      mainSha: MAIN,
      mainShaAtEnd: MAIN,
      collectionState: "CAPTURED",
      generatedAt: "2026-10-03T09:00:00Z",
      blockers: [],
      liveSchedulerPlan: { violations: [] },
      sources: Object.fromEntries(
        [
          "main",
          "mainRecheck",
          "pullRequests",
          "pullRequestsRecheck",
          "claims",
        ].map((name) => [name, { state: "AVAILABLE" }]),
      ),
      ...patch,
    },
    invariants: { criticalFailures },
    termux: { state: "HEALTHY" },
    executor: { target: "github" },
  };
}

function enterprise(conflicts = [], observedAt = "2026-10-03T08:59:00Z") {
  return {
    schemaVersion: 1,
    capturedAt: observedAt,
    items: [
      {
        id: "enterprise-os-live",
        domain: "enterprise-os",
        source: "Google Drive LIVE",
        producer: "google-drive",
        status: "VERIFIED",
        observedAt,
        freshnessSeconds: 600,
        identity: "AI_START_HERE+SOURCE_OF_TRUTH_MATRIX",
        assertion: "Enterprise OS authorities read LIVE",
      },
    ],
    unknowns: [],
    conflicts,
  };
}

function manifest(profile = "engineering", patch = {}) {
  return {
    profile,
    finalMain: MAIN,
    candidateSha: CANDIDATE,
    changeSetId: CHANGESET,
    conflicts: [],
    unknowns: [],
    ...patch,
  };
}

function work(changeSetId = CHANGESET, patch = {}) {
  return {
    prNumber: 703,
    repository: REPOSITORY,
    headSha: CANDIDATE,
    branch: BRANCH,
    baseSha: MAIN,
    changeSetId,
    claimExpiresAt: "2026-10-03T10:00:00Z",
    state: "POLICY_SATISFIED",
    trustAuthority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
    trust: {
      trusted: true,
      authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
      headSha: CANDIDATE,
    },
    invalid: null,
    ...patch,
  };
}

function pr(patch = {}) {
  return {
    number: 703,
    headSha: CANDIDATE,
    baseSha: MAIN,
    baseRef: "main",
    baseRepository: REPOSITORY,
    state: "open",
    draft: false,
    repository: REPOSITORY,
    branch: BRANCH,
    ...patch,
  };
}

// These are diagnostic fixtures, not canonical captures or provider evidence.
function ci(conclusion = "success", patch = {}) {
  return {
    id: 123,
    workflowId: 10,
    path: ".github/workflows/quality.yml",
    headSha: CANDIDATE,
    branch: BRANCH,
    event: "pull_request",
    runAttempt: 1,
    status: "completed",
    conclusion,
    createdAt: "2026-10-03T08:59:00Z",
    updatedAt: "2026-10-03T09:00:00Z",
    pullRequests: [{ number: 703, headSha: CANDIDATE, baseSha: MAIN }],
    requiredJobVerified: true,
    ...patch,
  };
}

function live(patch = {}, criticalFailures = []) {
  const available = { state: "AVAILABLE" };
  return {
    kind: "TDP_MDCTL_BOOTSTRAP",
    executor: { target: "github" },
    observed: {
      repository: REPOSITORY,
      generatedAt: "2026-10-03T09:00:00Z",
      mainSha: MAIN,
      mainShaAtEnd: MAIN,
      collectionState: "CAPTURED",
      blockers: [],
      activePrs: [pr()],
      activeClaims: [
        {
          id: CHANGESET,
          branch: BRANCH,
          baseSha: MAIN,
          activeByRegistry: true,
          expiresAt: "2026-10-03T10:00:00Z",
        },
      ],
      localWorkspace: { headSha: CANDIDATE, branch: BRANCH, dirty: false },
      ci: {
        activeRuns: [],
        recentRuns: [ci()],
        candidateRuns: [
          ci(),
          ci("success", {
            id: 124,
            workflowId: 11,
            path: ".github/workflows/morro-merge-gate.yml",
          }),
        ],
      },
      sources: Object.fromEntries(
        [
          "main",
          "mainRecheck",
          "pullRequests",
          "pullRequestsRecheck",
          "claims",
          "candidateCi:703",
          "recentCi",
          "activeCi",
        ].map((name) => [name, available]),
      ),
      liveSchedulerPlan: { violations: [] },
      liveSchedulerWork: [work()],
      ...patch,
    },
    invariants: { criticalFailures },
  };
}

function gate({
  profile = "engineering",
  manifestValue = manifest(profile),
  liveStatus = live(),
  externalEvidence = null,
  requestedProfile = profile,
  expectedCandidateSha = CANDIDATE,
  expectedBranch = BRANCH,
} = {}) {
  return evaluateFinalGate({
    manifest: manifestValue,
    finalGate,
    liveStatus,
    externalEvidence,
    requestedProfile,
    expectedRepository: REPOSITORY,
    expectedCandidateSha,
    expectedBranch,
    now: NOW,
  });
}

function bootstrapResult(mdctl, profile = "engineering", externalEvidence) {
  return buildBootstrapReport({
    mdctl,
    authorityMap,
    profile,
    externalEvidence,
    now: NOW,
  }).result;
}

test("cross-system bootstrap cannot self-prove from external JSON", () => {
  assert.equal(
    bootstrapResult(collector(), "cross-system", enterprise()),
    "NOT_PROVEN",
  );
});

test("engineering diagnostic JSON cannot self-prove canonical LIVE authority", () => {
  assert.equal(gate().taskVerdict, "NOT_PROVEN");
  assert.equal(gate().capabilityState, "OBSERVED");
  assert.ok(
    gate().liveProof.failures.includes("CANONICAL_LIVE_CAPTURE_REQUIRED"),
  );
  assert.equal(
    gate({ manifestValue: manifest("engineering", { conflicts: undefined }) })
      .taskVerdict,
    "NOT_PROVEN",
  );
  assert.equal(
    gate({
      liveStatus: live({
        ci: { activeRuns: [], recentRuns: [ci(), ci("startup_failure")] },
      }),
    }).taskVerdict,
    "NOT_PROVEN",
  );
  const cases = [
    [
      live({ liveSchedulerWork: [work(CHANGESET, { state: "LOCAL_PROVEN" })] }),
      "NOT_PROVEN",
    ],
    [live({ activePrs: [pr({ headSha: OTHER })] }), "NOT_PROVEN"],
    [
      live({ liveSchedulerWork: [work(CHANGESET, { invalid: "DIVERGED" })] }),
      "NOT_PROVEN",
    ],
    [live({ ci: { activeRuns: [{ headSha: CANDIDATE }] } }), "NOT_PROVEN"],
    [
      live({
        ci: {
          activeRuns: [],
          recentRuns: [ci(), { id: 124, headSha: CANDIDATE, status: "queued" }],
        },
      }),
      "NOT_PROVEN",
    ],
    [live({ repository: undefined }), "NOT_PROVEN"],
    [live({ mainShaAtEnd: OTHER }), "BLOCKED"],
    [live({}, [{ id: "INV-X", status: "FAIL" }]), "BLOCKED"],
    [live({}, [{ id: "INV-013", status: "FAIL" }]), "NOT_PROVEN"],
  ];
  for (const [index, [liveStatus, expected]] of cases.entries()) {
    assert.equal(gate({ liveStatus }).taskVerdict, expected, "case " + index);
  }
});

test("manifest cannot redirect proof to another trusted candidate", () => {
  const status = live({
    activePrs: [
      pr(),
      pr({ number: 704, headSha: OTHER, branch: "other-branch" }),
    ],
    liveSchedulerWork: [work(), work("MD-OTHER", { prNumber: 704 })],
  });
  const report = gate({
    manifestValue: manifest("engineering", {
      candidateSha: OTHER,
      changeSetId: "MD-OTHER",
    }),
    liveStatus: status,
  });
  assert.equal(report.taskVerdict, "BLOCKED");
});

test("stale, incomplete, external and release authority cannot self-complete", () => {
  const incomplete = live();
  delete incomplete.observed.sources["candidateCi:703"];
  assert.equal(gate({ liveStatus: incomplete }).taskVerdict, "NOT_PROVEN");
  assert.equal(
    gate({
      liveStatus: live({ generatedAt: "2026-10-03T07:00:10Z" }),
    }).taskVerdict,
    "NOT_PROVEN",
  );
  assert.equal(
    gate({
      profile: "cross-system",
      externalEvidence: enterprise(),
    }).taskVerdict,
    "NOT_PROVEN",
  );
  const conflict = gate({
    profile: "cross-system",
    externalEvidence: enterprise(["drive-conflict"]),
  });
  assert.equal(conflict.taskVerdict, "BLOCKED");
  assert.notEqual(conflict.capabilityState, "PROVEN");
  const unknown = enterprise();
  unknown.unknowns = ["drive-unknown"];
  assert.equal(gate({ externalEvidence: unknown }).taskVerdict, "NOT_PROVEN");
  assert.equal(
    gate({
      requestedProfile: "cross-system",
    }).taskVerdict,
    "BLOCKED",
  );
  const control = gate({
    liveStatus: live({
      blockers: [{ code: "CONTROL_CONFLICT" }],
      liveSchedulerPlan: { violations: [{ code: "LIVE_WORK_ITEM_INVALID" }] },
    }),
  });
  assert.equal(control.taskVerdict, "BLOCKED");
  const release = gate({ profile: "release" });
  assert.equal(release.taskVerdict, "NOT_PROVEN");
  assert.equal(release.releaseDecisionAllowed, false);
});

test("reconciliation treats backlog anchor as provenance and accepts engineering warnings", () => {
  const report = buildReconcileReport({
    projection: {
      currentMain: MAIN,
      backlog: {
        versionedAnchor: OTHER,
        versionedAnchorValid: true,
        anchorMatchesMain: false,
      },
      claims: { staleCandidates: [] },
    },
    bootstrap: {
      mainSha: MAIN,
      result: "READY_WITH_WARNINGS",
      checks: {},
      blockers: [],
      warnings: ["RUNTIME_NOT_CONFIGURED:staging"],
    },
    now: NOW,
  });
  assert.deepEqual([report.mode, report.mutationAllowed], ["PLAN_ONLY", false]);
  assert.deepEqual(report.drift, []);
  assert.deepEqual(report.actions, []);
});

test("reconciliation requests regeneration only for invalid backlog provenance", () => {
  const report = buildReconcileReport({
    projection: {
      currentMain: MAIN,
      backlog: {
        versionedAnchor: null,
        versionedAnchorValid: false,
        anchorMatchesMain: false,
      },
      claims: { staleCandidates: [] },
    },
    bootstrap: {
      mainSha: MAIN,
      result: "READY",
      checks: {},
      blockers: [],
      warnings: [],
    },
    now: NOW,
  });
  assert.ok(report.drift.includes("BACKLOG_PROVENANCE_INVALID"));
  assert.deepEqual(report.actions, [
    "REGENERATE_BACKLOG_PROJECTION_FROM_CURRENT_MAIN",
  ]);
});

function diagnosticProof(status) {
  return deriveLiveEngineeringProof({
    liveStatus: status,
    manifest: manifest(),
    expectedRepository: REPOSITORY,
    expectedCandidateSha: CANDIDATE,
    expectedBranch: BRANCH,
    now: NOW,
  });
}

test("the consumer uses current A0 selection while keeping diagnostic JSON untrusted", () => {
  const status = live();
  const old = ci("failure", { id: 122, createdAt: "2026-10-03T08:00:00Z" });
  status.observed.ci.candidateRuns.unshift(old);
  status.observed.ci.activeRuns = [
    { id: 100, headSha: CANDIDATE, status: "in_progress" },
  ];
  status.observed.ci.recentRuns = [old];
  let result = diagnosticProof(status);
  assert.equal(result.ciSelection.succeeded, true);
  assert.deepEqual(result.ciRunIds, [123, 124]);
  assert.deepEqual(result.supersededCiRunIds, [122]);
  assert.equal(result.proven, false);
  assert.equal(result.evidenceMode, "UNTRUSTED_DIAGNOSTIC");
  assert.equal(Object.values(result.checks).includes("PASS"), false);

  status.observed.ci.candidateRuns[0] = {
    ...old,
    runAttempt: 9,
    status: "queued",
    conclusion: null,
    updatedAt: "2026-10-03T09:00:01Z",
  };
  result = diagnosticProof(status);
  assert.equal(
    result.ciSelection.succeeded,
    true,
    "an old invocation rerun cannot replace the current invocation",
  );
  assert.deepEqual(result.ciRunIds, [123, 124]);
});

test("new failing, pending, ambiguous or unproved workflow inputs defeat the old green", async (t) => {
  const variants = {
    failure: ci("failure", { id: 125, createdAt: "2026-10-03T09:00:00Z" }),
    cancelled: ci("cancelled", { id: 125, createdAt: "2026-10-03T09:00:00Z" }),
    pending: ci(null, {
      id: 125,
      createdAt: "2026-10-03T09:00:00Z",
      status: "in_progress",
    }),
    unbound: ci("success", {
      id: 125,
      createdAt: "2026-10-03T09:00:00Z",
      pullRequests: [],
    }),
    missingJobProof: ci("success", {
      id: 125,
      createdAt: "2026-10-03T09:00:00Z",
      requiredJobVerified: undefined,
    }),
    negativeJobProof: ci("success", {
      id: 125,
      createdAt: "2026-10-03T09:00:00Z",
      requiredJobVerified: false,
    }),
  };
  for (const [name, run] of Object.entries(variants))
    await t.test(name, () => {
      const status = live();
      status.observed.ci.candidateRuns.push(run);
      const result = diagnosticProof(status);
      assert.equal(result.ciSelection.succeeded, false);
      assert.ok(result.failures.includes("CANDIDATE_CI_RESULT_NOT_PROVEN"));
      assert.notEqual(gate({ liveStatus: status }).taskVerdict, "COMPLETE");
    });
  const missing = live();
  delete missing.observed.sources["candidateCi:703"];
  assert.ok(
    diagnosticProof(missing).failures.includes(
      "CANDIDATE_CI_RESULT_NOT_PROVEN",
    ),
  );
});

test("candidate work identity is unique and keeps the producer's actual trust", async (t) => {
  const variants = {
    duplicate: [work(), work()],
    contradiction: [work(), work(CHANGESET, { invalid: "DIVERGED" })],
    anotherPrForSameChangeSet: [work(), work(CHANGESET, { prNumber: 704 })],
    anotherManifestForSamePr: [work(), work("MD-OTHER")],
    otherHead: [work(CHANGESET, { headSha: OTHER })],
    otherBase: [work(CHANGESET, { baseSha: OTHER })],
    otherBranch: [work(CHANGESET, { branch: "infra/other" })],
    otherRepository: [work(CHANGESET, { repository: "other/repo" })],
    onlyMainTrust: [work(CHANGESET, { trustAuthority: "GITHUB_EXACT_MAIN" })],
    rejectedProducer: [
      work(CHANGESET, {
        trust: {
          trusted: false,
          authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
          headSha: CANDIDATE,
        },
      }),
    ],
    wrongTrustHead: [
      work(CHANGESET, {
        trust: {
          trusted: true,
          authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
          headSha: OTHER,
        },
      }),
    ],
  };
  for (const [name, items] of Object.entries(variants))
    await t.test(name, () => {
      const result = diagnosticProof(live({ liveSchedulerWork: items }));
      assert.ok(
        result.failures.includes("LIVE_CANDIDATE_AUTHORITY_NOT_TRUSTED"),
      );
      assert.equal(result.proven, false);
    });
  const duplicatePr = live({ activePrs: [pr(), pr({ headSha: OTHER })] });
  assert.ok(
    diagnosticProof(duplicatePr).failures.includes(
      "LIVE_EXACT_HEAD_NOT_PROVEN",
    ),
  );
});

test("canonical reanchor keeps historical registry base without weakening candidate base", () => {
  const status = live();
  status.observed.activeClaims[0].baseSha = OTHER;
  const result = diagnosticProof(status);
  assert.equal(
    result.failures.includes("LIVE_CANDIDATE_CLAIM_EXPIRED_OR_UNKNOWN"),
    false,
    "the immutable producer validates the current candidate reanchor",
  );
  assert.equal(result.failures.includes("REMOTE_PROOF_NOT_ACCEPTED"), false);
  assert.equal(
    result.proven,
    false,
    "diagnostic fixtures still lack provenance",
  );
  status.observed.liveSchedulerWork[0].baseSha = OTHER;
  assert.ok(
    diagnosticProof(status).failures.includes(
      "LIVE_CANDIDATE_AUTHORITY_NOT_TRUSTED",
    ),
  );
});

test("claim expiry, Draft, workspace drift and missing terminal source remain fail closed", () => {
  const baseline = live();
  for (const expiresAt of [
    "2026-10-03T08:59:59Z",
    "2026-10-03T09:00:00Z",
    "unknown",
  ]) {
    const status = structuredClone(baseline);
    status.observed.activeClaims[0].expiresAt = expiresAt;
    assert.ok(
      diagnosticProof(status).failures.includes(
        "LIVE_CANDIDATE_CLAIM_EXPIRED_OR_UNKNOWN",
      ),
    );
  }
  const ambiguous = structuredClone(baseline);
  ambiguous.observed.activeClaims.push(ambiguous.observed.activeClaims[0]);
  assert.ok(
    diagnosticProof(ambiguous).failures.includes(
      "LIVE_CANDIDATE_CLAIM_EXPIRED_OR_UNKNOWN",
    ),
  );
  for (const expiresAt of [
    "2026-10-03T08:59:59Z",
    "2026-10-03T09:00:00Z",
    "2026-10-03T11:00:00Z",
    undefined,
  ]) {
    const status = structuredClone(baseline);
    status.observed.liveSchedulerWork[0].claimExpiresAt = expiresAt;
    assert.ok(
      diagnosticProof(status).failures.includes(
        "LIVE_CANDIDATE_CLAIM_EXPIRED_OR_UNKNOWN",
      ),
    );
  }
  const draft = live({ activePrs: [pr({ draft: true })] });
  assert.ok(
    diagnosticProof(draft).failures.includes("REMOTE_PROOF_NOT_ACCEPTED"),
  );
  const closed = live({ activePrs: [pr({ state: "closed" })] });
  assert.ok(
    diagnosticProof(closed).failures.includes("LIVE_EXACT_HEAD_NOT_PROVEN"),
  );
  for (const workspace of [
    { headSha: OTHER, branch: BRANCH, dirty: false },
    { headSha: CANDIDATE, branch: "other", dirty: false },
    { headSha: CANDIDATE, branch: BRANCH, dirty: true },
  ]) {
    assert.ok(
      diagnosticProof(live({ localWorkspace: workspace })).failures.includes(
        "WORKSPACE_CANDIDATE_NOT_PROVEN",
      ),
    );
  }
  const incomplete = live();
  delete incomplete.observed.sources.pullRequestsRecheck;
  assert.ok(
    diagnosticProof(incomplete).failures.includes(
      "LIVE_PROOF_SOURCES_INCOMPLETE",
    ),
  );
});

test("final-gate CLI has no serialized snapshot or caller-transport input flag", () => {
  for (const flag of [
    "--live-status",
    "--snapshot",
    "--api",
    "--now",
    "--canonical-capture",
  ]) {
    assert.throws(
      () => parseArgs(["final-gate", flag, "payload.json"]),
      /TDP_MAX_ARGUMENT_INVALID/u,
    );
  }
  const parsed = parseArgs([
    "final-gate",
    "--manifest",
    "manifest.json",
    "--profile",
    "engineering",
  ]);
  assert.equal(parsed.command, "final-gate");
  assert.equal(parsed.profile, "engineering");
  assert.equal(parsed.executorTarget, "github");
  assert.equal(
    parseArgs(["status", "--executor", "termux"]).executorTarget,
    "termux",
  );
  assert.throws(
    () => parseArgs(["status", "--executor", "unknown"]),
    /EXECUTOR_TARGET_INVALID/u,
  );
  assert.equal(
    parseArgs(["final-gate", "--manifest", "manifest.json"]).profile,
    null,
  );
});

test("bootstrap and final proof require only the selected transport without minting authority", () => {
  const github = collector();
  github.termux = { state: "UNHEALTHY_OR_UNVERIFIED" };
  assert.equal(bootstrapResult(github), "READY");
  const termux = { ...github, executor: { target: "termux" } };
  assert.equal(bootstrapResult(termux), "BLOCKED");
  assert.equal(
    bootstrapResult({
      ...termux,
      termux: {
        state: "HEALTHY",
        details: [{ fields: { heartbeat_utc: new Date().toISOString() } }],
      },
    }),
    "READY",
  );
  assert.equal(
    bootstrapResult({ ...github, executor: { target: "unknown" } }),
    "BLOCKED",
  );
  const missing = structuredClone(github);
  delete missing.observed.sources.claims;
  assert.equal(bootstrapResult(missing), "NOT_PROVEN");
  const candidate = live();
  candidate.termux = { state: "UNHEALTHY_OR_UNVERIFIED" };
  assert.equal(
    diagnosticProof(candidate).failures.includes(
      "SELECTED_EXECUTOR_CONTROL_NOT_PROVEN",
    ),
    false,
  );
  candidate.executor.target = "termux";
  assert.ok(
    diagnosticProof(candidate).failures.includes(
      "SELECTED_EXECUTOR_CONTROL_NOT_PROVEN",
    ),
  );
  assert.equal(gate({ liveStatus: candidate }).capabilityState, "OBSERVED");
});
