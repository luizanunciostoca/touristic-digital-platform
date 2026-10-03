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
    input.attemptedProductionPromotion === true &&
    input.technicallyReady === true &&
    input.authorizedToRelease !== true
  )
    detected.add("TECHNICALLY_READY_NOT_AUTHORIZED");

  return [...detected].sort();
}
