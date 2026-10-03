import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBootstrapReport,
  buildReconcileReport,
  evaluateFinalGate,
  validateExternalEvidenceBundle,
} from "./tdp-max-v2.mjs";

const MAIN = "a".repeat(40);
const CANDIDATE = "b".repeat(40);
const OTHER = "c".repeat(40);
const NOW = Date.parse("2026-10-03T09:00:00Z");
const CHANGESET = "MD-TDP-MAX-002";
const REPOSITORY = "luizanunciostoca/touristic-digital-platform";
const finalGate = {
  mode: "projection",
  lifecycleAuthority: ".morro/fabric.json",
  engineeringAuthority: "MDCTL_LIVE_EXACT_HEAD_TRUST",
  releaseAuthority: "DELEGATED_TO_FABRIC_RELEASE_PLANE",
};
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

function collector({ blockers = [], criticalFailures = [] } = {}) {
  return {
    observed: {
      repository: "luizanunciostoca/touristic-digital-platform",
      mainSha: MAIN,
      mainShaAtEnd: MAIN,
      collectionState: "CAPTURED",
      generatedAt: "2026-10-03T09:00:00Z",
      blockers,
      liveSchedulerPlan: { violations: [] },
      runtimeHealth: { staging: null, production: null },
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

function manifest(profile = "engineering") {
  return {
    profile,
    finalMain: MAIN,
    candidateSha: CANDIDATE,
    changeSetId: CHANGESET,
    evidence: [],
    unknowns: [],
    conflicts: [],
  };
}

function live(patch = {}, criticalFailures = []) {
  const source = { state: "AVAILABLE" };
  return {
    kind: "TDP_MDCTL_BOOTSTRAP",
    observed: {
      repository: REPOSITORY,
      snapshotStartedAt: "2026-10-03T08:59:30Z",
      generatedAt: "2026-10-03T09:00:00Z",
      mainSha: MAIN,
      mainShaAtEnd: MAIN,
      collectionState: "CAPTURED",
      blockers: [],
      activePrs: [
        {
          number: 703,
          headSha: CANDIDATE,
          baseSha: MAIN,
          repository: REPOSITORY,
        },
      ],
      ci: { activeRuns: [] },
      sources: Object.fromEntries(
        ["main", "mainRecheck", "pullRequests", "recentCi", "activeCi"].map(
          (name) => [name, source],
        ),
      ),
      liveSchedulerPlan: { violations: [] },
      liveSchedulerWork: [
        {
          prNumber: 703,
          changeSetId: CHANGESET,
          state: "REMOTE_PROVEN",
          trustAuthority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
          invalid: null,
        },
      ],
      ...patch,
    },
    invariants: { criticalFailures },
  };
}

function gate({
  profile = "engineering",
  liveStatus = live(),
  externalEvidence = null,
  requestedProfile = profile,
} = {}) {
  return evaluateFinalGate({
    manifest: manifest(profile),
    finalGate,
    liveStatus,
    externalEvidence,
    requestedProfile,
    expectedRepository: REPOSITORY,
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
  assert.equal(
    buildBootstrapReport({
      mdctl: collector(),
      authorityMap,
      externalEvidence: enterprise(),
      profile: "cross-system",
      now: NOW,
    }).result,
    "READY",
  );
});

test("engineering completion requires LIVE exact-head remote proof", () => {
  assert.equal(gate().taskVerdict, "COMPLETE");
  const cases = [
    [
      live({
        liveSchedulerWork: [
          {
            prNumber: 703,
            changeSetId: CHANGESET,
            state: "LOCAL_PROVEN",
            trustAuthority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
            invalid: null,
          },
        ],
      }),
      "NOT_PROVEN",
    ],
    [
      live({ activePrs: [{ number: 703, headSha: OTHER, baseSha: MAIN }] }),
      "NOT_PROVEN",
    ],
    [
      live({
        liveSchedulerWork: [
          {
            prNumber: 703,
            changeSetId: CHANGESET,
            state: "REMOTE_PROVEN",
            trustAuthority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
            invalid: "CHANGESET_AUTHORITY_DIVERGED_FROM_MAIN",
          },
        ],
      }),
      "NOT_PROVEN",
    ],
    [live({ ci: { activeRuns: [{ headSha: CANDIDATE }] } }), "NOT_PROVEN"],
    [live({ repository: undefined }), "NOT_PROVEN"],
    [
      live({
        activePrs: [{ number: 703, headSha: CANDIDATE, baseSha: MAIN }],
      }),
      "NOT_PROVEN",
    ],
    [live({ mainShaAtEnd: OTHER }), "BLOCKED"],
    [live({}, [{ id: "INV-X", status: "FAIL" }]), "BLOCKED"],
  ];
  for (const [liveStatus, expected] of cases) {
    assert.equal(gate({ liveStatus }).taskVerdict, expected);
  }
});

test("self-authored, stale or incomplete evidence cannot complete", () => {
  const incomplete = live();
  delete incomplete.observed.sources.recentCi;
  assert.equal(gate({ liveStatus: incomplete }).taskVerdict, "NOT_PROVEN");

  const stale = live({
    snapshotStartedAt: "2026-10-03T07:00:00Z",
    generatedAt: "2026-10-03T07:00:10Z",
  });
  assert.equal(gate({ liveStatus: stale }).taskVerdict, "NOT_PROVEN");
});

test("external/release authority remains delegated", () => {
  assert.equal(
    gate({
      profile: "cross-system",
      externalEvidence: enterprise(),
    }).taskVerdict,
    "NOT_PROVEN",
  );
  const conflicted = gate({
    profile: "cross-system",
    externalEvidence: enterprise(["drive-conflict"]),
  });
  assert.equal(conflicted.taskVerdict, "BLOCKED");
  assert.notEqual(conflicted.capabilityState, "PROVEN");
  assert.equal(
    gate({
      liveStatus: live({
        blockers: [{ code: "CONTROL_CONFLICT" }],
        liveSchedulerPlan: { violations: [{ code: "LIVE_WORK_ITEM_INVALID" }] },
      }),
    }).taskVerdict,
    "BLOCKED",
  );
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
