import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildBootstrapReport,
  buildReconcileReport,
  deriveLiveEngineeringProof,
  evaluateFinalGate,
  validateExternalEvidenceBundle,
} from "./tdp-max-v2.mjs";

const MAIN = "a".repeat(40);
const CANDIDATE = "b".repeat(40);
const OTHER = "c".repeat(40);
const NOW = Date.parse("2026-10-03T09:00:00Z");
const CHANGESET = "MD-TDP-MAX-002";
const finalGate = JSON.parse(
  readFileSync(".github/morro-control/tdp-max/final-gate.json", "utf8"),
);
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

function mdctl({
  blockers = [],
  criticalFailures = [],
  violations = [],
  includeSections = true,
} = {}) {
  const observed = {
    repository: "luizanunciostoca/touristic-digital-platform",
    mainSha: MAIN,
    mainShaAtEnd: MAIN,
    collectionState: "CAPTURED",
    generatedAt: "2026-10-03T09:00:00Z",
    runtimeHealth: { staging: null, production: null },
  };
  if (includeSections) {
    observed.blockers = blockers;
    observed.liveSchedulerPlan = { violations };
  }
  return {
    observed,
    invariants: includeSections ? { criticalFailures } : {},
    termux: { state: "HEALTHY" },
  };
}

function enterpriseBundle(observedAt = "2026-10-03T08:59:00Z") {
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
        assertion: "Enterprise OS authorities were read LIVE",
      },
    ],
    unknowns: [],
    conflicts: [],
  };
}

function manifest({
  profile = "engineering",
  finalMain = MAIN,
  candidateSha = CANDIDATE,
} = {}) {
  return {
    schemaVersion: 1,
    profile,
    riskLevel: "high",
    objective: "TDP-MAX V2",
    initialMain: MAIN,
    finalMain,
    candidateSha,
    artifactDigest: null,
    claimId: CHANGESET,
    changeSetId: CHANGESET,
    evidence: [],
    unknowns: [],
    conflicts: [],
    verdict: "PARTIAL",
  };
}

function sourceState() {
  return { state: "AVAILABLE", startedAt: "x", completedAt: "y" };
}

function liveStatus({
  mainSha = MAIN,
  mainShaAtEnd = MAIN,
  candidateSha = CANDIDATE,
  state = "REMOTE_PROVEN",
  invalid = null,
  activeRuns = [],
  criticalFailures = [],
  omitSource = null,
} = {}) {
  const sources = {
    main: sourceState(),
    mainRecheck: sourceState(),
    pullRequests: sourceState(),
    recentCi: sourceState(),
    activeCi: sourceState(),
  };
  if (omitSource) delete sources[omitSource];
  return {
    schemaVersion: 1,
    kind: "TDP_MDCTL_BOOTSTRAP",
    controlPlaneVersion: "3.2",
    observed: {
      mainSha,
      mainShaAtEnd,
      collectionState: "CAPTURED",
      activePrs: [
        {
          number: 703,
          branch: "infra/tdp-max-002-impl-20261003",
          headSha: candidateSha,
          baseSha: MAIN,
          draft: true,
        },
      ],
      ci: { activeRuns },
      sources,
      liveSchedulerWork: [
        {
          prNumber: 703,
          changeSetId: CHANGESET,
          state,
          trustAuthority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
          invalid,
        },
      ],
    },
    invariants: { criticalFailures },
  };
}

test("bootstrap fails closed on control blockers and missing collector sections", () => {
  const blocked = buildBootstrapReport({
    mdctl: mdctl({ blockers: [{ code: "CONTROL_CONFLICT", subject: "x" }] }),
    authorityMap,
    profile: "engineering",
    now: NOW,
  });
  assert.equal(blocked.result, "BLOCKED");
  const missing = buildBootstrapReport({
    mdctl: mdctl({ includeSections: false }),
    authorityMap,
    profile: "engineering",
    now: NOW,
  });
  assert.ok(["BLOCKED", "NOT_PROVEN"].includes(missing.result));
});

test("release-only drift warns engineering but blocks release", () => {
  const source = mdctl({
    blockers: [{ code: "RUNTIME_CERTIFIED_RELEASE_DRIFT", subject: "staging" }],
    criticalFailures: [{ id: "INV-013" }],
  });
  assert.equal(
    buildBootstrapReport({
      mdctl: source,
      authorityMap,
      profile: "engineering",
      now: NOW,
    }).result,
    "READY_WITH_WARNINGS",
  );
  assert.equal(
    buildBootstrapReport({
      mdctl: source,
      authorityMap,
      profile: "release",
      now: NOW,
    }).result,
    "BLOCKED",
  );
});

test("cross-system bootstrap requires fresh Enterprise OS evidence", () => {
  const missing = buildBootstrapReport({
    mdctl: mdctl(),
    authorityMap,
    profile: "cross-system",
    now: NOW,
  });
  assert.equal(missing.result, "NOT_PROVEN");
  const proven = buildBootstrapReport({
    mdctl: mdctl(),
    authorityMap,
    externalEvidence: enterpriseBundle(),
    profile: "cross-system",
    now: NOW,
  });
  assert.equal(proven.result, "READY");
  assert.equal(
    validateExternalEvidenceBundle(
      enterpriseBundle("2026-10-03T07:00:00Z"),
      NOW,
    ).items[0].status,
    "STALE",
  );
});

test("LIVE proof requires exact candidate trust and REMOTE_PROVEN state", () => {
  const proof = deriveLiveEngineeringProof({
    liveStatus: liveStatus(),
    manifest: manifest(),
  });
  assert.equal(proof.proven, true);
  assert.equal(proof.exactCandidate, true);
  assert.equal(proof.remoteProven, true);
});

test("self-authored evidence cannot manufacture proof", () => {
  const m = manifest();
  m.evidence = [
    {
      id: "exact-head-proven",
      kind: "gate",
      status: "VERIFIED",
      source: "candidate",
      producer: "candidate",
      identity: "fake",
      observedAt: "2026-10-03T08:59:00Z",
      freshnessSeconds: 600,
      assertion: "fake",
      sha: CANDIDATE,
    },
  ];
  const report = evaluateFinalGate({
    manifest: m,
    finalGate,
    liveStatus: liveStatus({ state: "LOCAL_PROVEN" }),
  });
  assert.equal(report.taskVerdict, "NOT_PROVEN");
});

test("candidate mismatch, authority divergence and active CI fail closed", () => {
  assert.equal(
    evaluateFinalGate({
      manifest: manifest(),
      finalGate,
      liveStatus: liveStatus({ candidateSha: OTHER }),
    }).taskVerdict,
    "NOT_PROVEN",
  );
  assert.equal(
    evaluateFinalGate({
      manifest: manifest(),
      finalGate,
      liveStatus: liveStatus({
        invalid: "CHANGESET_AUTHORITY_DIVERGED_FROM_MAIN",
      }),
    }).taskVerdict,
    "NOT_PROVEN",
  );
  assert.equal(
    evaluateFinalGate({
      manifest: manifest(),
      finalGate,
      liveStatus: liveStatus({
        activeRuns: [{ headSha: CANDIDATE, status: "in_progress" }],
      }),
    }).taskVerdict,
    "NOT_PROVEN",
  );
});

test("main movement and critical invariant failures block", () => {
  assert.equal(
    evaluateFinalGate({
      manifest: manifest(),
      finalGate,
      liveStatus: liveStatus({ mainShaAtEnd: OTHER }),
    }).taskVerdict,
    "BLOCKED",
  );
  assert.equal(
    evaluateFinalGate({
      manifest: manifest(),
      finalGate,
      liveStatus: liveStatus({
        criticalFailures: [{ id: "INV-X", status: "FAIL" }],
      }),
    }).taskVerdict,
    "BLOCKED",
  );
});

test("missing mdctl proof source is NOT_PROVEN", () => {
  const report = evaluateFinalGate({
    manifest: manifest(),
    finalGate,
    liveStatus: liveStatus({ omitSource: "recentCi" }),
  });
  assert.equal(report.taskVerdict, "NOT_PROVEN");
});

test("engineering final gate completes only from LIVE proof", () => {
  const report = evaluateFinalGate({
    manifest: manifest(),
    finalGate,
    liveStatus: liveStatus(),
  });
  assert.equal(report.taskVerdict, "COMPLETE");
  assert.equal(report.capabilityState, "PROVEN");
  assert.equal(report.releaseDecisionAllowed, false);
});

test("cross-system final gate additionally requires Enterprise OS evidence", () => {
  const missing = evaluateFinalGate({
    manifest: manifest({ profile: "cross-system" }),
    finalGate,
    liveStatus: liveStatus(),
  });
  assert.equal(missing.taskVerdict, "NOT_PROVEN");
  const proven = evaluateFinalGate({
    manifest: manifest({ profile: "cross-system" }),
    finalGate,
    liveStatus: liveStatus(),
    externalEvidence: validateExternalEvidenceBundle(enterpriseBundle(), NOW),
  });
  assert.equal(proven.taskVerdict, "COMPLETE");
});

test("release profile delegates release authority", () => {
  const report = evaluateFinalGate({
    manifest: manifest({ profile: "release" }),
    finalGate,
    liveStatus: liveStatus(),
  });
  assert.equal(report.taskVerdict, "NOT_PROVEN");
  assert.equal(report.releaseDelegated, true);
  assert.equal(report.releaseDecisionAllowed, false);
});

test("reconciliation is plan-only", () => {
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
  assert.ok(report.drift.includes("BACKLOG_MAIN_ANCHOR_STALE"));
});
