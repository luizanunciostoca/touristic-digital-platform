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
