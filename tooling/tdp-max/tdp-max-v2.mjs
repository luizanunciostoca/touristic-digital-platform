import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const SHA = /^[0-9a-f]{40}$/u;
const EVIDENCE_STATUSES = new Set(
  "VERIFIED INFERRED UNKNOWN STALE HISTORICAL SUPERSEDED CONFLICT N/A".split(
    " ",
  ),
);
const PROFILES = new Set(["engineering", "cross-system", "release"]);
const RELEASE_BLOCKERS = new Set([
  "RUNTIME_NOT_CONFIGURED",
  "RUNTIME_UNHEALTHY_OR_UNVERIFIED",
  "EXPECTED_CERTIFIED_RELEASE_NOT_CONFIGURED",
  "RUNTIME_CERTIFIED_RELEASE_DRIFT",
]);
const RELEASE_INVARIANTS = new Set(["INV-013"]);

function iso(value, code) {
  const timestamp = Date.parse(value ?? "");
  assert.ok(Number.isFinite(timestamp), code);
  return new Date(timestamp).toISOString();
}

function evidenceFresh(item, nowMs) {
  if (item.status !== "VERIFIED") return item.status;
  const observed = Date.parse(item.observedAt);
  if (!Number.isFinite(observed)) return "UNKNOWN";
  if (!Number.isInteger(item.freshnessSeconds) || item.freshnessSeconds < 0) {
    return "UNKNOWN";
  }
  if (observed > nowMs + 300000) return "UNKNOWN";
  return nowMs - observed <= item.freshnessSeconds * 1000
    ? "VERIFIED"
    : "STALE";
}

export function validateExternalEvidenceBundle(bundle, now = Date.now()) {
  assert.equal(bundle?.schemaVersion, 1, "TDP_MAX_EXTERNAL_SCHEMA");
  iso(bundle?.capturedAt, "TDP_MAX_EXTERNAL_CAPTURED_AT");
  assert.ok(Array.isArray(bundle?.items), "TDP_MAX_EXTERNAL_ITEMS");
  assert.ok(Array.isArray(bundle?.unknowns), "TDP_MAX_EXTERNAL_UNKNOWNS");
  assert.ok(Array.isArray(bundle?.conflicts), "TDP_MAX_EXTERNAL_CONFLICTS");

  const ids = new Set();
  const items = bundle.items.map((item) => {
    assert.ok(typeof item?.id === "string" && item.id, "TDP_MAX_EXTERNAL_ID");
    assert.equal(ids.has(item.id), false, "TDP_MAX_EXTERNAL_DUPLICATE_ID");
    ids.add(item.id);
    assert.ok(
      typeof item?.domain === "string" && item.domain,
      "TDP_MAX_EXTERNAL_DOMAIN",
    );
    assert.ok(
      typeof item?.source === "string" && item.source,
      "TDP_MAX_EXTERNAL_SOURCE",
    );
    assert.ok(
      typeof item?.producer === "string" && item.producer,
      "TDP_MAX_EXTERNAL_PRODUCER",
    );
    assert.ok(EVIDENCE_STATUSES.has(item?.status), "TDP_MAX_EXTERNAL_STATUS");
    assert.ok(
      typeof item?.identity === "string" && item.identity,
      "TDP_MAX_EXTERNAL_IDENTITY",
    );
    assert.ok(
      typeof item?.assertion === "string" && item.assertion,
      "TDP_MAX_EXTERNAL_ASSERTION",
    );
    iso(item?.observedAt, "TDP_MAX_EXTERNAL_OBSERVED_AT");
    assert.ok(
      Number.isInteger(item?.freshnessSeconds) &&
        item.freshnessSeconds >= 0 &&
        item.freshnessSeconds <= 604800,
      "TDP_MAX_EXTERNAL_FRESHNESS",
    );
    return { ...item, status: evidenceFresh(item, now) };
  });
  return { ...bundle, items };
}

function hasEnterpriseAuthority(authorityMap) {
  const value = authorityMap?.authorities?.enterpriseOs;
  return Boolean(
    authorityMap?.mode === "projection" &&
    value?.type === "google-drive-live" &&
    value?.entry === "AI_START_HERE" &&
    value?.authorityMatrix === "SOURCE_OF_TRUTH_MATRIX",
  );
}

function enterpriseEvidence(external) {
  return external?.items?.find(
    (item) =>
      item.id === "enterprise-os-live" || item.domain === "enterprise-os",
  );
}

function schedulerViolations(observed) {
  return Array.isArray(observed?.liveSchedulerPlan?.violations)
    ? observed.liveSchedulerPlan.violations
    : null;
}

export function buildBootstrapReport({
  mdctl,
  authorityMap,
  externalEvidence = null,
  profile = "engineering",
  objective = "tdp-max-bootstrap",
  now = Date.now(),
}) {
  assert.ok(PROFILES.has(profile), "TDP_MAX_PROFILE_INVALID");
  const observed = mdctl?.observed;
  assert.ok(observed && typeof observed === "object", "TDP_MAX_MDCTL_REQUIRED");
  assert.match(observed.mainSha ?? "", SHA, "TDP_MAX_MAIN_SHA_INVALID");

  const external = externalEvidenceSummary(externalEvidence, now);
  const blockers = [];
  const warnings = [];
  const checks = {};

  const mainStable =
    observed.mainShaAtEnd === observed.mainSha &&
    observed.collectionState === "CAPTURED";
  checks["live-main"] = mainStable ? "PASS" : "BLOCKED";
  if (!mainStable) blockers.push("MAIN_CHANGED_OR_COLLECTION_INCOMPLETE");

  checks["enterprise-authority-registered"] = hasEnterpriseAuthority(
    authorityMap,
  )
    ? "PASS"
    : "BLOCKED";
  if (checks["enterprise-authority-registered"] === "BLOCKED") {
    blockers.push("ENTERPRISE_AUTHORITY_NOT_REGISTERED");
  }

  const liveViolations = schedulerViolations(observed);
  if (liveViolations === null) {
    checks["integration-authority"] = "NOT_PROVEN";
  } else {
    checks["integration-authority"] =
      liveViolations.length === 0 ? "PASS" : "BLOCKED";
    for (const violation of liveViolations) {
      blockers.push(
        "SCHEDULER:" +
          String(violation.code ?? "UNKNOWN") +
          ":" +
          String(violation.reason ?? violation.prNumber ?? ""),
      );
    }
  }

  const rawBlockers = Array.isArray(observed.blockers)
    ? observed.blockers
    : null;
  if (rawBlockers === null) {
    checks["control-blockers-collected"] = "NOT_PROVEN";
    checks["control-blockers"] = "NOT_PROVEN";
    checks["release-runtime"] = "NOT_PROVEN";
  } else {
    checks["control-blockers-collected"] = "PASS";
    const releaseBlockers = rawBlockers.filter((item) =>
      RELEASE_BLOCKERS.has(item?.code),
    );
    const nonReleaseBlockers = rawBlockers.filter(
      (item) => !RELEASE_BLOCKERS.has(item?.code),
    );
    checks["control-blockers"] =
      nonReleaseBlockers.length === 0 ? "PASS" : "BLOCKED";
    for (const item of nonReleaseBlockers) {
      blockers.push(
        String(item.code ?? "CONTROL_BLOCKER") +
          ":" +
          String(item.subject ?? ""),
      );
    }
    if (releaseBlockers.length === 0) {
      checks["release-runtime"] = "PASS";
    } else if (profile === "release") {
      checks["release-runtime"] = "BLOCKED";
      for (const item of releaseBlockers) {
        blockers.push(String(item.code) + ":" + String(item.subject ?? ""));
      }
    } else {
      checks["release-runtime"] = "WARN";
      for (const item of releaseBlockers) {
        warnings.push(String(item.code) + ":" + String(item.subject ?? ""));
      }
    }
  }

  const critical = Array.isArray(mdctl?.invariants?.criticalFailures)
    ? mdctl.invariants.criticalFailures
    : null;
  if (critical === null) {
    checks["critical-invariants"] = "NOT_PROVEN";
  } else {
    const relevantCritical = critical.filter(
      (item) => !(profile !== "release" && RELEASE_INVARIANTS.has(item?.id)),
    );
    checks["critical-invariants"] =
      relevantCritical.length === 0 ? "PASS" : "BLOCKED";
    for (const item of relevantCritical) {
      blockers.push("INVARIANT:" + String(item.id ?? "UNKNOWN"));
    }
    if (
      profile !== "release" &&
      critical.some((item) => RELEASE_INVARIANTS.has(item?.id))
    ) {
      warnings.push("RELEASE_INVARIANT_NOT_TASK_BLOCKING:INV-013");
    }
  }

  const termuxHealthy = mdctl?.termux?.state === "HEALTHY";
  checks["termux-fallback"] = termuxHealthy ? "PASS" : "BLOCKED";
  if (!termuxHealthy) blockers.push("TERMUX_FALLBACK_NOT_HEALTHY");

  const enterprise = enterpriseEvidence(external);
  if (profile === "cross-system") {
    checks["enterprise-os-live"] = "NOT_PROVEN";
  } else if (enterprise) {
    checks["enterprise-os-live"] =
      enterprise.status === "VERIFIED" ? "PASS" : "WARN";
    if (enterprise.status !== "VERIFIED") {
      warnings.push("ENTERPRISE_OS_EVIDENCE:" + enterprise.status);
    }
  } else {
    checks["enterprise-os-live"] = "N/A";
  }

  const externalConflicts = [
    ...(external?.conflicts ?? []),
    ...(external?.items
      ?.filter((item) => item.status === "CONFLICT")
      .map((item) => item.id) ?? []),
  ];
  checks["external-conflicts"] =
    externalConflicts.length === 0 ? "PASS" : "BLOCKED";
  for (const conflict of externalConflicts) {
    blockers.push("EXTERNAL_CONFLICT:" + conflict);
  }
  if (external?.unknowns?.length) {
    for (const unknown of external.unknowns)
      warnings.push("EXTERNAL_UNKNOWN:" + unknown);
  }

  let result = "READY";
  const values = Object.values(checks);
  if (values.includes("BLOCKED")) result = "BLOCKED";
  else if (values.includes("NOT_PROVEN")) result = "NOT_PROVEN";
  else if (values.includes("WARN") || warnings.length > 0) {
    result = "READY_WITH_WARNINGS";
  }

  return {
    schemaVersion: 1,
    kind: "TDP_MAX_BOOTSTRAP_V2",
    capturedAt: observed.generatedAt ?? new Date(now).toISOString(),
    objective,
    repository:
      observed.repository ?? "luizanunciostoca/touristic-digital-platform",
    mainSha: observed.mainSha,
    profile,
    checks,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    result,
  };
}

export function buildStatusReport({ bootstrap, mdctl }) {
  const observed = mdctl.observed ?? {};
  return {
    schemaVersion: 1,
    kind: "TDP_MAX_STATUS_V2",
    capturedAt: bootstrap.capturedAt,
    profile: bootstrap.profile,
    mainSha: bootstrap.mainSha,
    result: bootstrap.result,
    checks: bootstrap.checks,
    blockers: bootstrap.blockers,
    warnings: bootstrap.warnings,
    openPullRequests: observed.activePrs ?? [],
    activeClaims: observed.activeClaims ?? [],
    schedulerViolations: schedulerViolations(observed),
    staging: observed.runtimeHealth?.staging ?? null,
    production: observed.runtimeHealth?.production ?? null,
    criticalInvariantFailures: mdctl.invariants?.criticalFailures ?? [],
  };
}

export function buildReconcileReport({
  projection,
  bootstrap,
  externalEvidence = null,
  now = Date.now(),
}) {
  assert.match(
    projection?.currentMain ?? "",
    SHA,
    "TDP_MAX_RECONCILE_MAIN_INVALID",
  );
  const external = externalEvidenceSummary(externalEvidence, now);
  const drift = [];
  const actions = [];

  if (bootstrap?.mainSha !== projection.currentMain) {
    drift.push("RECONCILE_CAPTURE_MAIN_MISMATCH");
  }
  if (bootstrap?.result !== "READY") {
    drift.push("BOOTSTRAP_NOT_READY:" + String(bootstrap?.result ?? "UNKNOWN"));
  }
  for (const [id, state] of Object.entries(bootstrap?.checks ?? {})) {
    if (state === "NOT_PROVEN") drift.push("BOOTSTRAP_NOT_PROVEN:" + id);
  }

  if (projection.backlog?.anchorMatchesMain === false) {
    drift.push("BACKLOG_MAIN_ANCHOR_STALE");
    actions.push("REGENERATE_BACKLOG_PROJECTION_FROM_CURRENT_MAIN");
  }
  for (const id of projection.claims?.staleCandidates ?? []) {
    drift.push("STALE_CLAIM:" + id);
    actions.push("REVIEW_CLAIM_RETIREMENT:" + id);
  }
  for (const blocker of bootstrap?.blockers ?? []) {
    drift.push("CONTROL_BLOCKER:" + blocker);
  }
  for (const warning of bootstrap?.warnings ?? []) {
    if (warning.startsWith("RUNTIME_CERTIFIED_RELEASE_DRIFT")) {
      actions.push("RECAPTURE_RELEASE_STATE_BEFORE_RELEASE_MUTATION");
    }
  }
  for (const conflict of external.conflicts)
    drift.push("EXTERNAL_CONFLICT:" + conflict);
  for (const unknown of external.unknowns)
    drift.push("EXTERNAL_UNKNOWN:" + unknown);

  return {
    schemaVersion: 1,
    kind: "TDP_MAX_RECONCILIATION_V2",
    mode: "PLAN_ONLY",
    capturedAt: bootstrap?.capturedAt ?? new Date(now).toISOString(),
    currentMain: projection.currentMain,
    drift: [...new Set(drift)],
    actions: [...new Set(actions)],
    mutationAllowed: false,
    reason:
      "Reconciliation derives a plan from LIVE authority; writes require a separately authorized claimed ChangeSet.",
  };
}

const REMOTE_PROVEN_STATES = new Set(
  "REMOTE_PROVEN COMPOSITION_PROVEN POLICY_SATISFIED MERGE_READY MERGED POST_MERGE_PROVEN RELEASE_CANDIDATE STAGING_PROVEN CERTIFIED RELEASED PRODUCTION_VERIFIED".split(
    " ",
  ),
);

function sourceAvailable(observed, name) {
  return observed?.sources?.[name]?.state === "AVAILABLE";
}

function findCandidatePr(
  observed,
  { expectedRepository, expectedCandidateSha, expectedBranch },
) {
  const matches = (observed?.activePrs ?? []).filter(
    (pr) =>
      pr?.repository === expectedRepository &&
      pr?.headSha === expectedCandidateSha &&
      pr?.branch === expectedBranch &&
      pr?.baseSha === observed?.mainSha,
  );
  return matches.length === 1 ? matches[0] : null;
}

function findCandidateWork(observed, manifest, pr) {
  if (!pr) return null;
  return (
    (observed?.liveSchedulerWork ?? []).find(
      (item) =>
        item?.prNumber === pr.number &&
        item?.changeSetId === manifest.changeSetId,
    ) ?? null
  );
}

export function deriveLiveEngineeringProof({
  liveStatus,
  manifest,
  expectedRepository,
  expectedCandidateSha,
  expectedBranch,
  now = Date.now(),
}) {
  const observed = liveStatus?.observed;
  const checks = {};
  const failures = [];

  const generatedAt = Date.parse(observed?.generatedAt ?? "");
  const snapshotFresh =
    Number.isFinite(generatedAt) &&
    generatedAt <= now + 300000 &&
    now - generatedAt <= 600000;
  checks["live-snapshot-fresh"] = snapshotFresh ? "PASS" : "NOT_PROVEN";
  if (!snapshotFresh) failures.push("LIVE_SNAPSHOT_STALE_OR_UNKNOWN");

  const mainStable =
    liveStatus?.kind === "TDP_MDCTL_BOOTSTRAP" &&
    observed?.collectionState === "CAPTURED" &&
    SHA.test(observed?.mainSha ?? "") &&
    observed.mainSha === observed.mainShaAtEnd &&
    sourceAvailable(observed, "main") &&
    sourceAvailable(observed, "mainRecheck");
  checks["live-main-stable"] = mainStable ? "PASS" : "NOT_PROVEN";
  if (!mainStable) failures.push("LIVE_MAIN_NOT_STABLE");

  const sourceSet = ["pullRequests", "recentCi", "activeCi"];
  const sourcesComplete = sourceSet.every((name) =>
    sourceAvailable(observed, name),
  );
  checks["live-proof-sources"] = sourcesComplete ? "PASS" : "NOT_PROVEN";
  if (!sourcesComplete) failures.push("LIVE_PROOF_SOURCES_INCOMPLETE");

  const blockers = Array.isArray(observed?.blockers) ? observed.blockers : null;
  const relevantBlockers = blockers?.filter(
    (item) =>
      manifest.profile === "release" || !RELEASE_BLOCKERS.has(item?.code),
  );
  const blockersClear =
    relevantBlockers !== null && relevantBlockers?.length === 0;
  checks["live-control-blockers"] =
    blockers === null ? "NOT_PROVEN" : blockersClear ? "PASS" : "BLOCKED";
  if (blockers === null) failures.push("LIVE_CONTROL_BLOCKERS_UNKNOWN");
  else if (!blockersClear) failures.push("LIVE_CONTROL_BLOCKERS_PRESENT");

  const violations = Array.isArray(observed?.liveSchedulerPlan?.violations)
    ? observed.liveSchedulerPlan.violations
    : null;
  const schedulerClear = violations !== null && violations.length === 0;
  checks["live-scheduler"] =
    violations === null ? "NOT_PROVEN" : schedulerClear ? "PASS" : "BLOCKED";
  if (violations === null) failures.push("LIVE_SCHEDULER_UNKNOWN");
  else if (!schedulerClear) failures.push("LIVE_SCHEDULER_VIOLATIONS");

  const currentMainMatches =
    mainStable && manifest?.finalMain === observed.mainSha;
  checks["manifest-main-binding"] = currentMainMatches ? "PASS" : "BLOCKED";
  if (!currentMainMatches) failures.push("FINAL_MAIN_MOVED_OR_UNBOUND");

  const repositoryBound =
    typeof expectedRepository === "string" &&
    expectedRepository.length > 0 &&
    observed?.repository === expectedRepository;
  checks["live-repository-binding"] = repositoryBound ? "PASS" : "NOT_PROVEN";
  if (!repositoryBound) failures.push("LIVE_REPOSITORY_NOT_PROVEN");

  const manifestCandidateMatches =
    manifest.candidateSha === expectedCandidateSha;
  checks["manifest-candidate-binding"] = manifestCandidateMatches
    ? "PASS"
    : "BLOCKED";
  if (!manifestCandidateMatches) failures.push("MANIFEST_CANDIDATE_MISMATCH");

  const workspaceCandidateBound =
    repositoryBound &&
    SHA.test(expectedCandidateSha ?? "") &&
    typeof expectedBranch === "string" &&
    expectedBranch.length > 0;
  checks["workspace-candidate-binding"] = workspaceCandidateBound
    ? "PASS"
    : "NOT_PROVEN";
  if (!workspaceCandidateBound) failures.push("WORKSPACE_CANDIDATE_NOT_PROVEN");

  const pr = findCandidatePr(observed, {
    expectedRepository,
    expectedCandidateSha,
    expectedBranch,
  });
  const exactCandidate = workspaceCandidateBound && Boolean(pr);
  checks["live-candidate-exact-head"] = exactCandidate ? "PASS" : "NOT_PROVEN";
  if (!exactCandidate) failures.push("LIVE_EXACT_HEAD_NOT_PROVEN");

  const work = findCandidateWork(observed, manifest, pr);
  const workValid =
    Boolean(work) &&
    work.invalid == null &&
    work.trustAuthority === "TRUSTED_CLAIM_GUARD_EXACT_HEAD";
  checks["live-candidate-authority"] = workValid ? "PASS" : "NOT_PROVEN";
  if (!workValid) failures.push("LIVE_CANDIDATE_AUTHORITY_NOT_TRUSTED");

  const remoteProven =
    workValid &&
    REMOTE_PROVEN_STATES.has(work.state) &&
    work.state !== "REMOTE_PROVEN" &&
    work.state !== "COMPOSITION_PROVEN";
  checks["live-remote-proof"] = remoteProven ? "PASS" : "NOT_PROVEN";
  if (!remoteProven) failures.push("REMOTE_PROOF_NOT_ACCEPTED");

  const criticalFailures = Array.isArray(
    liveStatus?.invariants?.criticalFailures,
  )
    ? liveStatus.invariants.criticalFailures.filter(
        (item) =>
          manifest.profile === "release" || !RELEASE_INVARIANTS.has(item?.id),
      )
    : null;
  const invariantsClear =
    criticalFailures !== null && criticalFailures.length === 0;
  checks["live-critical-invariants"] =
    criticalFailures === null
      ? "NOT_PROVEN"
      : invariantsClear
        ? "PASS"
        : "BLOCKED";
  if (criticalFailures === null) failures.push("LIVE_INVARIANTS_UNKNOWN");
  else if (!invariantsClear) {
    failures.push("LIVE_CRITICAL_INVARIANTS_UNRESOLVED");
  }

  const activeRuns = Array.isArray(observed?.ci?.activeRuns)
    ? observed.ci.activeRuns
    : null;
  const recentRuns = Array.isArray(observed?.ci?.recentRuns)
    ? observed.ci.recentRuns
    : null;
  const activeCandidateRuns =
    activeRuns?.filter((run) => run?.headSha === expectedCandidateSha) ?? [];
  const candidateRuns =
    recentRuns?.filter((run) => run?.headSha === expectedCandidateSha) ?? [];
  const completed = candidateRuns.filter((run) => run.status === "completed");
  const ciSettled =
    activeRuns !== null &&
    recentRuns !== null &&
    activeCandidateRuns.length === 0 &&
    candidateRuns.every((run) => run.status === "completed");
  const ciSucceeded =
    candidateRuns.length > 0 &&
    completed.length === candidateRuns.length &&
    completed.every(
      (run) => run.conclusion === "success" && Number.isSafeInteger(run.id),
    );
  checks["live-ci-settled"] = ciSettled ? "PASS" : "NOT_PROVEN";
  checks["live-ci-result"] = ciSucceeded ? "PASS" : "NOT_PROVEN";
  if (!ciSettled) failures.push("CANDIDATE_CI_STILL_ACTIVE_OR_UNKNOWN");
  if (!ciSucceeded) failures.push("CANDIDATE_CI_RESULT_NOT_PROVEN");

  const controlsClear = blockersClear && schedulerClear && invariantsClear;

  return {
    schemaVersion: 1,
    kind: "TDP_MAX_LIVE_ENGINEERING_PROOF_V1",
    repository: observed?.repository ?? null,
    mainSha: observed?.mainSha ?? null,
    prNumber: pr?.number ?? null,
    changeSetState: work?.state ?? null,
    trustAuthority: work?.trustAuthority ?? null,
    ciRunIds: completed.map((run) => run.id),
    ciHeadSha: expectedCandidateSha,
    checks,
    failures: [...new Set(failures)],
    currentMainMatches,
    exactCandidate,
    remoteProven,
    controlsClear,
    proven:
      snapshotFresh &&
      mainStable &&
      sourcesComplete &&
      blockersClear &&
      schedulerClear &&
      currentMainMatches &&
      manifestCandidateMatches &&
      exactCandidate &&
      workValid &&
      remoteProven &&
      invariantsClear &&
      ciSettled &&
      ciSucceeded,
  };
}

function externalEvidenceSummary(externalEvidence, now) {
  if (!externalEvidence) {
    return { conflicts: [], unknowns: [] };
  }
  const validated = validateExternalEvidenceBundle(externalEvidence, now);
  const conflicts = [
    ...(validated.conflicts ?? []),
    ...(validated.items ?? [])
      .filter((item) => item.status === "CONFLICT")
      .map((item) => item.id),
  ];
  const unknowns = [
    ...(validated.unknowns ?? []),
    ...(validated.items ?? [])
      .filter((item) =>
        ["UNKNOWN", "STALE", "INFERRED", "HISTORICAL", "SUPERSEDED"].includes(
          item.status,
        ),
      )
      .map((item) => item.id),
  ];
  return {
    items: validated.items ?? [],
    conflicts: [...new Set(conflicts)],
    unknowns: [...new Set(unknowns)],
  };
}

export function evaluateFinalGate({
  manifest,
  finalGate,
  liveStatus,
  externalEvidence = null,
  requestedProfile = null,
  expectedRepository,
  expectedCandidateSha,
  expectedBranch,
  now = Date.now(),
}) {
  assert.equal(finalGate?.mode, "projection", "TDP_MAX_FINAL_MODE_INVALID");
  assert.ok(
    typeof expectedRepository === "string" && expectedRepository.length > 0,
    "TDP_MAX_FINAL_REPOSITORY_REQUIRED",
  );
  assert.match(
    expectedCandidateSha ?? "",
    SHA,
    "TDP_MAX_FINAL_EXPECTED_CANDIDATE_REQUIRED",
  );
  assert.ok(
    typeof expectedBranch === "string" && expectedBranch.length > 0,
    "TDP_MAX_FINAL_EXPECTED_BRANCH_REQUIRED",
  );
  assert.ok(PROFILES.has(manifest?.profile), "TDP_MAX_FINAL_PROFILE_INVALID");
  assert.ok(
    PROFILES.has(requestedProfile),
    "TDP_MAX_FINAL_REQUESTED_PROFILE_INVALID",
  );
  assert.ok(
    typeof manifest?.changeSetId === "string" &&
      manifest.changeSetId.length > 0,
    "TDP_MAX_FINAL_CHANGESET_REQUIRED",
  );
  assert.match(
    manifest?.candidateSha ?? "",
    SHA,
    "TDP_MAX_FINAL_CANDIDATE_REQUIRED",
  );

  const profileMismatch = requestedProfile !== manifest.profile;
  const liveProof = deriveLiveEngineeringProof({
    liveStatus,
    manifest,
    expectedRepository,
    expectedCandidateSha,
    expectedBranch,
    now,
  });
  const manifestEvidenceCollected =
    Array.isArray(manifest?.conflicts) && Array.isArray(manifest?.unknowns);
  const manifestConflicts = manifestEvidenceCollected ? manifest.conflicts : [];
  const manifestUnknowns = manifestEvidenceCollected ? manifest.unknowns : [];
  const external = externalEvidenceSummary(externalEvidence, now);

  const enterpriseRequired = manifest.profile === "cross-system";
  const releaseDelegated = manifest.profile === "release";
  const externalAuthorityDelegated = enterpriseRequired;

  const blockingFailures = liveProof.failures.filter((failure) =>
    [
      "FINAL_MAIN_MOVED_OR_UNBOUND",
      "LIVE_CRITICAL_INVARIANTS_UNRESOLVED",
      "LIVE_CONTROL_BLOCKERS_PRESENT",
      "LIVE_SCHEDULER_VIOLATIONS",
      "MANIFEST_CANDIDATE_MISMATCH",
    ].includes(failure),
  );

  if (profileMismatch) blockingFailures.push("REQUESTED_PROFILE_MISMATCH");
  if (external.conflicts.length > 0) {
    blockingFailures.push("EXTERNAL_EVIDENCE_CONFLICT");
  }

  const noTaskConflict =
    manifestEvidenceCollected &&
    manifestConflicts.length === 0 &&
    manifestUnknowns.length === 0 &&
    external.conflicts.length === 0 &&
    external.unknowns.length === 0 &&
    !profileMismatch;
  const implemented =
    liveProof.exactCandidate &&
    liveProof.currentMainMatches &&
    liveProof.controlsClear;
  const integrated =
    implemented &&
    liveProof.trustAuthority === "TRUSTED_CLAIM_GUARD_EXACT_HEAD";
  const technicallyReady = liveProof.proven && noTaskConflict;

  const capabilityState =
    technicallyReady && !enterpriseRequired && !releaseDelegated
      ? "PROVEN"
      : integrated
        ? "INTEGRATED"
        : implemented
          ? "IMPLEMENTED"
          : "OBSERVED";

  const taskVerdict =
    blockingFailures.length > 0 ||
    manifestConflicts.length > 0 ||
    external.conflicts.length > 0
      ? "BLOCKED"
      : releaseDelegated || externalAuthorityDelegated
        ? "NOT_PROVEN"
        : technicallyReady
          ? "COMPLETE"
          : "NOT_PROVEN";

  return {
    schemaVersion: 1,
    kind: "TDP_MAX_FINAL_GATE_V2",
    authorityMode: "MDCTL_LIVE_PROJECTION",
    lifecycleAuthority: finalGate.lifecycleAuthority,
    releaseAuthority: finalGate.releaseAuthority,
    profile: manifest.profile,
    requestedProfile,
    profileMismatch,
    currentMainSha: liveProof.mainSha,
    candidateSha: manifest.candidateSha,
    changeSetId: manifest.changeSetId,
    liveProof,
    enterpriseAuthority: {
      required: enterpriseRequired,
      delegated: externalAuthorityDelegated,
      localEvidence: external,
      proven: false,
      decisionAuthority: "ORCHESTRATOR_CONNECTOR_READBACK",
    },
    technicallyReady,
    taskVerdict,
    capabilityState,
    authorizationState: releaseDelegated ? "NOT_AUTHORIZED" : "NOT_APPLICABLE",
    releaseDelegated,
    externalAuthorityDelegated,
    releaseDecisionAllowed: false,
  };
}
