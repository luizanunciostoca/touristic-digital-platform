import {
  NODE_MODE,
  STAGING_SERVICE,
  STAGING_URL,
  configurationFingerprint,
} from "./staging-node-contracts.mjs";

export const sha = "a".repeat(40),
  tree = "b".repeat(40);
export const now = "2026-10-23T04:20:00Z";
export function fixture() {
  const workflow = {
    event: "workflow_dispatch",
    path: ".github/workflows/staging-render-promotion.yml",
    runId: 12,
    runAttempt: 1,
    callerRunId: 10,
    callerRunAttempt: 1,
    headSha: sha,
    requestId: "request-10-1",
  };
  const artifact = {
    id: 99,
    name: "node-evidence-12-1",
    runId: 12,
    runAttempt: 1,
  };
  const fingerprint = "sha256:" + "c".repeat(64);
  const origin = {
    kind: "authenticated-render-connector-observation",
    reference: "render-connector-observation-1",
    verificationLocation: "external-to-github-actions",
    verifiedByActions: false,
    observedAt: "2026-10-23T04:19:30Z",
  };
  const externalEvidence = {
    schemaVersion: 1,
    capturedAt: origin.observedAt,
    unknowns: [],
    conflicts: [],
    items: [
      {
        id: "render-readback-1",
        domain: "runtime",
        source: origin.reference,
        producer: "ORCHESTRATOR_CONNECTOR_READBACK",
        status: "VERIFIED",
        identity: STAGING_SERVICE + ":dep-new:" + sha,
        assertion: "render-node-deployment-live",
        observedAt: origin.observedAt,
        freshnessSeconds: 300,
      },
    ],
  };
  const evidence = {
    schemaVersion: 1,
    mode: NODE_MODE,
    environment: "staging",
    productionEligible: false,
    pagesEligible: false,
    sourceSha: sha,
    treeSha: tree,
    serviceId: STAGING_SERVICE,
    canonicalUrl: STAGING_URL,
    origin,
    externalEvidence,
    workflow,
    artifact,
    authorizationId: "one-staging-publication",
    reservationId: "reservation-1",
    provider: {
      deploymentId: "dep-new",
      latestDeploymentId: "dep-new",
      serviceId: STAGING_SERVICE,
      commitSha: sha,
      status: "live",
      runtime: "node",
      configurationFingerprint: fingerprint,
      createdAt: "2026-10-23T04:18:01Z",
      liveAt: "2026-10-23T04:19:00Z",
    },
    runtime: {
      releaseSha: sha,
      healthy: true,
      ready: true,
      identityKind: "application-runtime-identity",
      identity: "instance-new",
      observedAt: "2026-10-23T04:19:40Z",
    },
  };
  const expected = {
    sourceSha: sha,
    treeSha: tree,
    workflow: structuredClone(workflow),
    artifact: structuredClone(artifact),
    artifactCount: 1,
    authorizationId: evidence.authorizationId,
    reservationId: evidence.reservationId,
    reservationConsumed: false,
    providerDeploymentId: "dep-new",
    configurationFingerprint: fingerprint,
    dispatchAt: "2026-10-23T04:18:00Z",
    previousRuntime: { releaseSha: "d".repeat(40), identity: "instance-old" },
    verificationBarrier: {
      artifactId: 90,
      jobId: 8,
      sha256: "c".repeat(64),
      recordedAt: "2026-10-23T04:19:20Z",
    },
    receiptObservedAt: "2026-10-23T04:19:50Z",
  };
  return { evidence, expected };
}

// Explicitly fictitious test evidence; never an operator receipt.
export function preflightFixture() {
  const serviceSnapshot = {
    serviceId: STAGING_SERVICE,
    runtime: "node",
    url: STAGING_URL,
    repository:
      "https://github.com/luizanunciostoca/touristic-digital-platform",
    branch: "main",
    autoDeploy: false,
    diskId: "dsk-dbbd6stg1s2s738h3i4g",
    diskMountPath: "/var/data",
    diskSizeGB: 1,
    plan: "starter",
    region: "ohio",
    instances: 1,
    healthCheckPath: "/readyz",
    buildCommand:
      "corepack pnpm install --frozen-lockfile && corepack pnpm build",
    preDeployCommand:
      "node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/staging-predeploy.mjs",
    startCommand:
      "node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/dev-server.mjs",
  };
  return {
    serviceSnapshot,
    configurationFingerprint: configurationFingerprint(serviceSnapshot),
    previousProviderDeploymentId: "dep-fixture",
    previousRuntime: {
      releaseSha: "d".repeat(40),
      identity: "fixture-runtime",
    },
    recovery: {
      status: "PROVEN",
      candidateSha: sha,
      retainedBackup: true,
      wrapperAndPredeployCovered: true,
      codeRollbackDoesNotUndoData: true,
      backupRef: "fixture://backup",
      restoreRef: "fixture://restore",
      rollbackRef: "fixture://rollback",
      mutationInventoryRef: "fixture://mutation-inventory",
    },
  };
}

import { createHash } from "node:crypto";
import { receiptBody } from "./staging-node-receipts.mjs";
import { verificationBarrierBinding } from "./staging-node-barrier.mjs";

export function receiptFixture() {
  const expected = {
    phase: "pre-deploy",
    authorizationId: "one-staging-publication",
    requestId: "request-10-1",
    sourceSha: sha,
    treeSha: tree,
    runId: 12,
    runAttempt: 1,
    callerRunId: 10,
    callerRunAttempt: 1,
  };
  const actor = { id: 318748875, login: "luizanunciostoca", appId: null };
  const body = receiptBody({
    ...expected,
    schemaVersion: 1,
    producer: "ORCHESTRATOR_CONNECTOR_READBACK",
    serviceId: STAGING_SERVICE,
    mode: NODE_MODE,
    maximumDeployments: 1,
    observedAt: "2026-10-23T04:19:30Z",
  });
  const comment = {
    id: 123,
    body,
    user: { id: actor.id, login: actor.login },
    performed_via_github_app: null,
    created_at: "2026-10-23T04:19:40Z",
    updated_at: "2026-10-23T04:19:40Z",
    issue_url:
      "https://api.github.com/repos/luizanunciostoca/touristic-digital-platform/issues/1072",
  };
  const reference = {
    commentId: 123,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
  return {
    comment,
    reference,
    options: {
      actor,
      expected,
      now,
      fetchComment: async () => structuredClone(comment),
      listComments: async () => ({
        complete: true,
        comments: [structuredClone(comment)],
      }),
    },
  };
}
export function postFixture() {
  const f = receiptFixture();
  const base = JSON.parse(f.comment.body.split("\n").slice(1).join("\n"));
  const verification = {
    runId: 14,
    runAttempt: 1,
    callerRunId: 11,
    callerRunAttempt: 1,
  };
  const barrier = barrierFixture(verification);
  const observation = fixture().evidence;
  const payload = {
    ...base,
    phase: "post-deploy",
    verification,
    verificationBarrier: barrier.binding,
    verificationId: "14:1",
    supersedesReceiptId: null,
    preReceiptId: 120,
    preReceiptSha256: "d".repeat(64),
    dispatchArtifactId: 99,
    dispatchSha256: "e".repeat(64),
    observation,
  };
  f.comment.body = receiptBody(payload);
  f.reference.sha256 = createHash("sha256")
    .update(f.comment.body)
    .digest("hex");
  f.options.expected = {
    ...f.options.expected,
    phase: "post-deploy",
    verification: structuredClone(verification),
    verificationBarrier: barrier.binding,
  };
  const comments = [f.comment];
  f.options.listComments = async () => ({
    complete: true,
    comments: structuredClone(comments),
  });
  f.options.fetchComment = async (id) =>
    structuredClone(comments.find((c) => c.id === id));
  return { ...f, payload, comments, barrier };
}
export function barrierFixture(
  verification = {
    runId: 14,
    runAttempt: 1,
    callerRunId: 11,
    callerRunAttempt: 1,
  },
) {
  const marker = {
    schemaVersion: 1,
    kind: "STAGING_NODE_VERIFICATION_BARRIER",
    sourceSha: sha,
    treeSha: tree,
    authorizationId: "one-staging-publication",
    requestId: "request-10-1",
    verification,
    jobKey: "verify",
    jobName: "staging / external provider and runtime verification",
    jobId: 888,
    jobStartedAt: "2026-10-23T04:19:15Z",
    recordedAt: "2026-10-23T04:19:20Z",
  };
  const raw = JSON.stringify(marker);
  const job = {
    id: 888,
    name: marker.jobName,
    run_id: verification.runId,
    run_attempt: verification.runAttempt,
    head_sha: sha,
    started_at: marker.jobStartedAt,
    status: "completed",
    conclusion: "success",
  };
  const artifact = {
    id: 199,
    name: `staging-node-verification-barrier-${verification.runId}-${verification.runAttempt}`,
    expired: false,
    created_at: "2026-10-23T04:19:21Z",
    workflow_run: { id: verification.runId, head_sha: sha },
  };
  const expected = {
    sourceSha: sha,
    treeSha: tree,
    authorizationId: marker.authorizationId,
    requestId: marker.requestId,
    verification,
  };
  const binding = verificationBarrierBinding({
    raw,
    job,
    artifact,
    attemptJobs: [job],
    expected,
    now,
  });
  return { marker, raw, job, artifact, attemptJobs: [job], expected, binding };
}
