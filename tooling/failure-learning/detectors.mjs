const pass = (condition, unknown = false) =>
  unknown ? "NOT_PROVEN" : condition ? "BLOCK" : "PASS";
export const detectors = {
  STALE_HEAD: ({ observation: o }) =>
    pass(
      o.expectedHead !== o.observedHead,
      o.expectedHead == null || o.observedHead == null,
    ),
  STALE_BASE: ({ observation: o }) =>
    pass(
      o.expectedBase !== o.observedBase,
      o.expectedBase == null || o.observedBase == null,
    ),
  DIRTY_SHARED_WORKTREE: ({ observation: o }) =>
    pass(o.worktreeDirty === true, o.worktreeDirty == null),
  STALE_CLAIM: ({ observation: o }) =>
    pass(
      Date.parse(o.claimExpiresAt) <= Date.parse(o.now),
      !o.claimExpiresAt || !o.now,
    ),
  FALSE_CI_GREEN: ({ observation: o }) =>
    pass(o.ciGreen === true && o.semanticProof !== true, o.ciGreen == null),
  NO_JOBS_RUN: ({ observation: o }) =>
    pass(o.requiredJobs === 0, o.requiredJobs == null),
  SKIPPED_AS_PASS: ({ observation: o }) =>
    pass((o.skippedRequired ?? 0) > 0, o.skippedRequired == null),
  AI_AS_AUTHORITY: ({ observation: o }) =>
    pass(o.finalAuthority === "AI", o.finalAuthority == null),
  ASSUMED_TOOL_PERMISSION: ({ observation: o }) =>
    pass(
      o.toolAvailable === true && o.permissionVerified !== true,
      o.toolAvailable == null,
    ),
  WRONG_RENDER_TARGET: ({ observation: o }) =>
    pass(
      o.expectedRenderTarget !== o.observedRenderTarget,
      o.expectedRenderTarget == null || o.observedRenderTarget == null,
    ),
  WRONG_ARTIFACT: ({ observation: o }) =>
    pass(
      o.expectedArtifact !== o.observedArtifact,
      o.expectedArtifact == null || o.observedArtifact == null,
    ),
  DEPLOY_NOT_LIVE: ({ observation: o }) =>
    pass(
      o.deployTriggered === true && o.runtimeLive !== true,
      o.deployTriggered == null,
    ),
  DATABASE_OOM: ({ observation: o }) =>
    pass(o.databaseOom === true, o.databaseOom == null),
  SCHEMA_DRIFT: ({ observation: o }) =>
    pass(
      o.expectedSchema !== o.observedSchema,
      o.expectedSchema == null || o.observedSchema == null,
    ),
  DUPLICATE_IMPLEMENTATION: ({ observation: o }) =>
    pass((o.implementationCount ?? 0) > 1, o.implementationCount == null),
  DUPLICATE_WORKFLOW: ({ observation: o }) =>
    pass((o.workflowCount ?? 0) > 1, o.workflowCount == null),
  MONOLITHIC_REMOTE_JOB: ({ observation: o }) =>
    pass(
      (o.remoteJobSteps ?? 0) > o.maxRemoteJobSteps,
      o.remoteJobSteps == null || o.maxRemoteJobSteps == null,
    ),
  REMOTE_TRANSPORT_MISCLASSIFIED: ({ observation: o }) =>
    pass(
      o.transportFailure === true &&
        o.hostUnreachable === true &&
        o.alternateTransportHealthy === true,
      o.transportFailure == null,
    ),
  REMOTE_RESULT_FALSE_POSITIVE: ({ observation: o }) =>
    pass(o.remoteExit === 0 && o.postcondition !== true, o.remoteExit == null),
  STALE_DR_PROOF: ({ observation: o }) =>
    pass(
      Date.parse(o.drProofAt) < Date.parse(o.lastDrInvalidationAt),
      !o.drProofAt || !o.lastDrInvalidationAt,
    ),
  TECHNICALLY_READY_NOT_AUTHORIZED: ({ observation: o }) =>
    pass(
      o.technicallyReady === true && o.authorized !== true,
      o.technicallyReady == null,
    ),
  EXECUTOR_AUTH_UNAVAILABLE: ({ observation: o }) =>
    pass(
      o.executorInstalled === true && o.executorAuthenticated !== true,
      o.executorInstalled == null,
    ),
};
