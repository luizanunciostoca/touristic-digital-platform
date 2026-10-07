const AI_AUTHORITIES = new Set(["AI", "CHATGPT", "COPILOT", "CODEX"]);

export function evaluateAntiRecurrence(input = {}) {
  const detected = new Set();

  if (
    input.evidenceSha &&
    input.currentMainSha &&
    input.evidenceSha !== input.currentMainSha
  )
    detected.add("STALE_HEAD");

  if (
    input.workflowConclusion === "success" &&
    input.requirementProven !== true
  )
    detected.add("FALSE_CI_GREEN");

  if (input.workflowConclusion === "success" && input.jobsRun === 0)
    detected.add("NO_JOBS_RUN");

  if (
    input.requiredJobConclusion === "skipped" &&
    input.requirementCritical === true
  )
    detected.add("SKIPPED_AS_PASS");

  if (
    (input.expectedEnvironment &&
      input.observedEnvironment &&
      input.expectedEnvironment !== input.observedEnvironment) ||
    (input.expectedServiceId &&
      input.observedServiceId &&
      input.expectedServiceId !== input.observedServiceId)
  )
    detected.add("WRONG_RENDER_TARGET");

  if (AI_AUTHORITIES.has(String(input.finalAuthority ?? "").toUpperCase()))
    detected.add("AI_AS_AUTHORITY");

  if (
    input.tabletDeclaredUnreachable === true &&
    Array.isArray(input.validTransportHealthy) &&
    input.validTransportHealthy.some(Boolean)
  )
    detected.add("REMOTE_TRANSPORT_MISCLASSIFIED");

  if (Array.isArray(input.drEvidence) && input.drEvidence.length) {
    const ordered = [...input.drEvidence].sort(
      (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
    );
    const latest = ordered.at(-1);
    const hadEarlierPass = ordered
      .slice(0, -1)
      .some((item) => item.status === "PASS");
    if (
      hadEarlierPass &&
      latest?.status === "FAIL" &&
      input.drReconciled !== true
    )
      detected.add("STALE_DR_PROOF");
  }

  if (
    input.certifiedDigest &&
    input.runtimeDigest &&
    input.certifiedDigest !== input.runtimeDigest
  )
    detected.add("WRONG_ARTIFACT");

  if (
    input.deployDeclaredSuccessful === true &&
    input.terminalDeployState !== "LIVE"
  )
    detected.add("DEPLOY_NOT_LIVE");

  if (
    input.remoteDeclaredSuccessful === true &&
    (input.remoteExitCode !== 0 || input.postconditionVerified !== true)
  )
    detected.add("REMOTE_RESULT_FALSE_POSITIVE");

  if (
    input.executorDispatchSelected === true &&
    input.executorAuthenticated !== true
  )
    detected.add("EXECUTOR_AUTH_UNAVAILABLE");

  if (
    input.attemptedProductionPromotion === true &&
    input.technicallyReady === true &&
    input.authorizedToRelease !== true
  )
    detected.add("TECHNICALLY_READY_NOT_AUTHORIZED");

  if (input.pushAttempted === true && input.admissionPassed !== true)
    detected.add("PRE_PUSH_ADMISSION_BYPASS");

  if (input.prReadyAttempted === true && input.remoteProofPassed !== true)
    detected.add("PREMATURE_PR_READY");

  if (
    input.certifiedCandidateSha &&
    input.currentCandidateSha &&
    input.certifiedCandidateSha !== input.currentCandidateSha
  )
    detected.add("CANDIDATE_MUTATED_AFTER_CERTIFICATION");

  if (
    input.reviewFindingsCorrected === true &&
    Number.isInteger(input.unresolvedReviewThreads) &&
    input.unresolvedReviewThreads > 0
  )
    detected.add("STALE_REVIEW_RECONCILIATION");

  if (
    ["FORMAT_FAILURE", "DIFF_CHECK_FAILURE"].includes(
      String(input.remoteFailureClass ?? ""),
    ) &&
    input.localAdmissionRan !== true
  )
    detected.add("REMOTE_CI_USED_AS_LOCAL_LINTER");

  if (
    input.workerExecutionStarted === true &&
    input.workspaceExecutable !== true
  )
    detected.add("WORKSPACE_BOOTSTRAP_INCOMPLETE");

  if (
    input.projectionDriftDetected === true &&
    input.projectionReconciled !== true
  )
    detected.add("CONTROL_PROJECTION_DRIFT");

  if (
    input.pushAttempted === true &&
    Number.isInteger(input.reviewFindingsTotal) &&
    input.reviewFindingsTotal > 1 &&
    Number.isInteger(input.reviewFindingsRemaining) &&
    input.reviewFindingsRemaining > 0
  )
    detected.add("PARTIAL_REVIEW_FIX_LOOP");

  const extra = [
    [
      "ACTIVE_CLAIM_IDLE_WITH_HEALTHY_EXECUTOR",
      input.activeClaim === true &&
        input.workerStarted === false &&
        input.executorHealthy === true,
    ],
    [
      "METADATA_ONLY_CODE_PROOF_RERUN",
      input.metadataOnly === true && input.codeProofRerun === true,
    ],
    [
      "STALE_RUN_CONTINUED_AFTER_HEAD_ADVANCE",
      input.runHead &&
        input.currentHead &&
        input.runHead !== input.currentHead &&
        input.expensiveProofContinued === true,
    ],
    [
      "LATE_CLAIM_SCOPE_EXPANSION",
      input.writeStarted === true &&
        input.scopeExpanded === true &&
        input.envelopeUpdatedBeforeWrite !== true,
    ],
    [
      "EVIDENCE_OVER_INVALIDATION",
      input.semanticIntersection === false &&
        Number.isInteger(input.invalidatedEvidenceCount) &&
        input.invalidatedEvidenceCount > 0,
    ],
    [
      "UNNECESSARY_REANCHOR",
      input.mainAdvanced === true &&
        input.semanticIntersection === false &&
        input.claimReanchored === true,
    ],
    [
      "DISPATCH_NOT_READ_BACK",
      input.dispatchAttempted === true && input.workerStartReadback !== true,
    ],
    [
      "PROJECTION_STALE_USED_FOR_SCHEDULING",
      input.projectionStale === true && input.schedulingUsedProjection === true,
    ],
    [
      "TRANSPORT_AUTHORITY_CONFLICT",
      input.contractTransport &&
        input.runtimeTransport &&
        input.contractTransport !== input.runtimeTransport &&
        input.transportConflictResolved !== true,
    ],
    ["RISK_POLICY_COVERAGE_GAP", input.riskPolicyCoverageComplete === false],
  ];
  for (const [name, condition] of extra) if (condition) detected.add(name);

  return [...detected].sort();
}
