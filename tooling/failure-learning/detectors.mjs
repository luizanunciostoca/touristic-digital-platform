const pass = (condition, unknown = false) =>
  unknown ? "NOT_PROVEN" : condition ? "BLOCK" : "PASS";
const rawDetectors = {
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
  STALE_CLAIM: ({ observation: o }) => {
    const expiry = Date.parse(o.claimExpiresAt),
      now = Date.parse(o.now);
    return pass(
      expiry <= now,
      !Number.isFinite(expiry) || !Number.isFinite(now),
    );
  },
  FALSE_CI_GREEN: ({ observation: o }) =>
    pass(o.ciGreen === true && o.semanticProof !== true, o.ciGreen == null),
  NO_JOBS_RUN: ({ observation: o }) =>
    pass(o.requiredJobs === 0, o.requiredJobs == null),
  SKIPPED_AS_PASS: ({ observation: o }) =>
    pass((o.skippedRequired ?? 0) > 0, o.skippedRequired == null),
  AI_AS_AUTHORITY: ({ observation: o }) => {
    if (o.finalAuthority == null) return "NOT_PROVEN";
    return ["AI", "CHATGPT", "COPILOT", "CODEX"].includes(
      String(o.finalAuthority).trim().toUpperCase(),
    )
      ? "BLOCK"
      : "PASS";
  },
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
  STALE_DR_PROOF: ({ observation: o }) => {
    const proof = Date.parse(o.drProofAt),
      invalidated = Date.parse(o.lastDrInvalidationAt);
    return pass(
      proof < invalidated,
      !Number.isFinite(proof) || !Number.isFinite(invalidated),
    );
  },
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

// Validate observation types before predicates; JavaScript coercion is not proof.
const shapes = {
  STALE_HEAD: { expectedHead: "sha", observedHead: "sha" },
  STALE_BASE: { expectedBase: "sha", observedBase: "sha" },
  DIRTY_SHARED_WORKTREE: { worktreeDirty: "boolean" },
  STALE_CLAIM: { claimExpiresAt: "timestamp", now: "timestamp" },
  FALSE_CI_GREEN: { ciGreen: "boolean", semanticProof: "?boolean" },
  NO_JOBS_RUN: { requiredJobs: "count" },
  SKIPPED_AS_PASS: { skippedRequired: "count" },
  AI_AS_AUTHORITY: { finalAuthority: "text" },
  ASSUMED_TOOL_PERMISSION: {
    toolAvailable: "boolean",
    permissionVerified: "?boolean",
  },
  WRONG_RENDER_TARGET: {
    expectedRenderTarget: "text",
    observedRenderTarget: "text",
  },
  WRONG_ARTIFACT: { expectedArtifact: "text", observedArtifact: "text" },
  DEPLOY_NOT_LIVE: { deployTriggered: "boolean", runtimeLive: "?boolean" },
  DATABASE_OOM: { databaseOom: "boolean" },
  SCHEMA_DRIFT: { expectedSchema: "text", observedSchema: "text" },
  DUPLICATE_IMPLEMENTATION: { implementationCount: "count" },
  DUPLICATE_WORKFLOW: { workflowCount: "count" },
  MONOLITHIC_REMOTE_JOB: {
    remoteJobSteps: "count",
    maxRemoteJobSteps: "positiveCount",
  },
  REMOTE_TRANSPORT_MISCLASSIFIED: {
    transportFailure: "boolean",
    hostUnreachable: "?boolean",
    alternateTransportHealthy: "?boolean",
  },
  REMOTE_RESULT_FALSE_POSITIVE: {
    remoteExit: "count",
    postcondition: "?boolean",
  },
  STALE_DR_PROOF: { drProofAt: "timestamp", lastDrInvalidationAt: "timestamp" },
  TECHNICALLY_READY_NOT_AUTHORIZED: {
    technicallyReady: "boolean",
    authorized: "?boolean",
  },
  EXECUTOR_AUTH_UNAVAILABLE: {
    executorInstalled: "boolean",
    executorAuthenticated: "?boolean",
  },
};
function valid(value, type) {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "count" || type === "positiveCount")
    return (
      Number.isSafeInteger(value) && value >= (type === "positiveCount" ? 1 : 0)
    );
  if (typeof value !== "string" || !value.trim()) return false;
  if (type === "sha") return /^[0-9a-f]{40}$/.test(value);
  if (type === "timestamp") return Number.isFinite(Date.parse(value));
  return type === "text";
}
export const detectors = Object.freeze(
  Object.fromEntries(
    Object.entries(rawDetectors).map(([name, detector]) => [
      name,
      (input) => {
        try {
          const o = input?.observation;
          if (!o || typeof o !== "object" || Array.isArray(o))
            return "NOT_PROVEN";
          for (const [key, shape] of Object.entries(shapes[name])) {
            const optional = shape.startsWith("?");
            if (!Object.hasOwn(o, key)) {
              if (optional) continue;
              return "NOT_PROVEN";
            }
            if (!valid(o[key], optional ? shape.slice(1) : shape))
              return "NOT_PROVEN";
          }
          return detector(input);
        } catch {
          return "NOT_PROVEN";
        }
      },
    ]),
  ),
);
