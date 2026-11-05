import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBootstrapReport,
  buildReconcileReport,
  evaluateFinalGate,
} from "./tdp-max-v2.mjs";
import { ENGINEERING_CI_WORKFLOWS } from "../control-state/status.mjs";

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
        ["main", "mainRecheck", "recentCi", "activeCi"].map((name) => [
          name,
          { state: "AVAILABLE" },
        ]),
      ),
      ...patch,
    },
    invariants: { criticalFailures },
    termux: { state: "HEALTHY" },
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
    headSha: CANDIDATE,
    baseSha: MAIN,
    branch: BRANCH,
    changeSetId,
    state: "POLICY_SATISFIED",
    trustAuthority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
    invalid: null,
    ...patch,
  };
}

function pr(patch = {}) {
  return {
    number: 703,
    headSha: CANDIDATE,
    baseSha: MAIN,
    repository: REPOSITORY,
    branch: BRANCH,
    ...patch,
  };
}

function ci(conclusion = "success", patch = {}) {
  return {
    id: 123,
    workflowId: 10,
    path: ENGINEERING_CI_WORKFLOWS[0],
    headSha: CANDIDATE,
    branch: BRANCH,
    event: "pull_request",
    runAttempt: 1,
    createdAt: "2026-10-03T08:58:00Z",
    updatedAt: "2026-10-03T08:59:00Z",
    pullRequests: [{ number: 703, headSha: CANDIDATE, baseSha: MAIN }],
    status: "completed",
    conclusion,
    requiredJobVerified: true,
    ...patch,
  };
}
const mergeCi = () =>
  ci("success", { id: 124, workflowId: 11, path: ENGINEERING_CI_WORKFLOWS[1] });

function live(patch = {}, criticalFailures = []) {
  const available = { state: "AVAILABLE" };
  return {
    kind: "TDP_MDCTL_BOOTSTRAP",
    observed: {
      repository: REPOSITORY,
      generatedAt: "2026-10-03T09:00:00Z",
      mainSha: MAIN,
      mainShaAtEnd: MAIN,
      collectionState: "CAPTURED",
      blockers: [],
      activePrs: [pr()],
      ci: {
        activeRuns: [],
        recentRuns: [ci()],
        candidateRuns: [ci(), mergeCi()],
      },
      sources: Object.fromEntries(
        [
          "main",
          "mainRecheck",
          "pullRequests",
          "recentCi",
          "activeCi",
          "candidateCi:703",
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

test("selected GitHub control does not require the unused Termux fallback", () => {
  const mdctl = collector();
  mdctl.termux = { state: "UNAVAILABLE" };
  assert.equal(bootstrapResult(mdctl), "READY");
  mdctl.executor = { target: "termux" };
  assert.equal(bootstrapResult(mdctl), "BLOCKED");
  mdctl.termux = { state: "HEALTHY" };
  assert.equal(bootstrapResult(mdctl), "READY");
  mdctl.executor = { target: "unknown" };
  assert.equal(bootstrapResult(mdctl), "BLOCKED");
});

test("final gate uses current applicable CI instead of the global historical sample", () => {
  const status = live({
    ci: {
      activeRuns: [],
      recentRuns: [ci("failure")],
      candidateRuns: [
        ci("failure", { id: 122, createdAt: "2026-10-03T08:55:00Z" }),
        ci(),
        mergeCi(),
      ],
    },
  });
  const result = gate({ liveStatus: status });
  assert.equal(result.taskVerdict, "COMPLETE");
  assert.deepEqual(result.liveProof.ciRunIds, [123, 124]);
  status.observed.ci.candidateRuns.push(
    ci("failure", {
      id: 125,
      createdAt: "2026-10-03T08:59:30Z",
    }),
  );
  assert.equal(gate({ liveStatus: status }).taskVerdict, "NOT_PROVEN");
});

test("engineering completion requires exact candidate and LIVE remote proof", () => {
  assert.equal(gate().taskVerdict, "COMPLETE");
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
      live({ liveSchedulerWork: [work(CHANGESET, { headSha: OTHER })] }),
      "NOT_PROVEN",
    ],
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
    [live({}, [{ id: "INV-013", status: "FAIL" }]), "COMPLETE"],
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
  delete incomplete.observed.sources.recentCi;
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
