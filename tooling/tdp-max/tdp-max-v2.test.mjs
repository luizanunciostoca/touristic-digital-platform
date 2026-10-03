import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBootstrapReport,
  buildReconcileReport,
  evaluateFinalGate,
} from "./tdp-max-v2.mjs";

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
    changeSetId,
    state: "REMOTE_PROVEN",
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

function ci(conclusion = "success") {
  return { headSha: CANDIDATE, status: "completed", conclusion };
}

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
      ci: { activeRuns: [], recentRuns: [ci()] },
      sources: Object.fromEntries(
        ["main", "mainRecheck", "pullRequests", "recentCi", "activeCi"].map(
          (name) => [name, available],
        ),
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

test("bootstrap profiles and external evidence fail closed", () => {
  assert.equal(
    buildBootstrapReport({
      mdctl: collector({ blockers: [{ code: "CONTROL_CONFLICT" }] }),
      authorityMap,
      profile: "engineering",
      now: NOW,
    }).result,
    "BLOCKED",
  );
  const missing = collector();
  delete missing.observed.blockers;
  delete missing.observed.liveSchedulerPlan;
  delete missing.invariants.criticalFailures;
  assert.notEqual(
    buildBootstrapReport({
      mdctl: missing,
      authorityMap,
      profile: "engineering",
      now: NOW,
    }).result,
    "READY",
  );
  const fresh = enterprise();
  assert.equal(
    buildBootstrapReport({
      mdctl: collector(),
      authorityMap,
      externalEvidence: fresh,
      profile: "cross-system",
      now: NOW,
    }).result,
    "NOT_PROVEN",
  );
});

test("engineering completion requires exact candidate and LIVE remote proof", () => {
  assert.equal(gate().taskVerdict, "COMPLETE");
  assert.equal(gate({ manifestValue: manifest("engineering", { conflicts: undefined }) }).taskVerdict, "NOT_PROVEN");
  assert.equal(gate({ liveStatus: live({ ci: { activeRuns: [], recentRuns: [ci(), ci("startup_failure")] } }) }).taskVerdict, "NOT_PROVEN");
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
      live({ ci: { activeRuns: [], recentRuns: [ci("failure")] } }),
      "NOT_PROVEN",
    ],
    [live({ repository: undefined }), "NOT_PROVEN"],
    [live({ activePrs: [pr({ repository: undefined })] }), "NOT_PROVEN"],
    [live({ mainShaAtEnd: OTHER }), "BLOCKED"],
    [live({}, [{ id: "INV-X", status: "FAIL" }]), "BLOCKED"],
  ];
  for (const [index, [liveStatus, expected]] of cases.entries()) {
    assert.equal(gate({ liveStatus }).taskVerdict, expected, "case " + index);
  }
});

test("manifest cannot redirect proof to another trusted candidate", () => {
  const status = live({
    activePrs: [
      pr(),
      pr({
        number: 704,
        headSha: OTHER,
        branch: "other-branch",
      }),
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
  assert.equal(
    report.liveProof.checks["manifest-candidate-binding"],
    "BLOCKED",
  );
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

test("reconciliation stays plan-only", () => {
  const report = buildReconcileReport({
    projection: {
      currentMain: MAIN,
      backlog: { anchorMatchesMain: false },
      claims: { staleCandidates: ["MD-OLD"] },
    },
    bootstrap: {
      capturedAt: "2026-10-03T09:00:00Z",
      blockers: [],
      warnings: [],
    },
    now: NOW,
  });
  assert.equal(report.mode, "PLAN_ONLY");
  assert.equal(report.mutationAllowed, false);
});
