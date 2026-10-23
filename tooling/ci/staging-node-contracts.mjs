import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { validateExternalEvidenceBundle } from "../tdp-max/tdp-max-v2.mjs";

export const NODE_MODE = "staging-node-rebuild";
export const STAGING_SERVICE = "srv-da4hb6c9v7es7386ttt0";
export const STAGING_URL = "https://morro-digital-v2-staging.onrender.com";
const SHA = /^[a-f0-9]{40}$/u;
const integer = (v) => Number.isSafeInteger(v) && v > 0;
const time = (v) => {
  assert.equal(typeof v, "string", "TIMESTAMP_REQUIRED");
  const value = Date.parse(v);
  assert.ok(Number.isFinite(value), "TIMESTAMP_INVALID");
  return value;
};
const nonempty = (v) => typeof v === "string" && v.trim().length > 0;
function noOciIdentity(e) {
  for (const key of [
    "digest",
    "image",
    "imageDigest",
    "imageRunId",
    "image_run_id",
  ])
    assert.equal(Object.hasOwn(e, key), false, "NODE_OCI_IDENTITY_MIXED");
}

/**
 * Structural validation only. Connector observations are NOT authenticated by
 * accepting JSON, a URL, or a caller-supplied "verified" flag. The external
 * authority/transport adapter must be approved separately before publication.
 */
export function validateExternalNodeObservation(e, expected, { now } = {}) {
  const bundle = validateExternalEvidenceBundle(e?.externalEvidence, time(now));
  assert.deepEqual(bundle.unknowns, [], "NODE_EXTERNAL_UNKNOWNS");
  assert.deepEqual(bundle.conflicts, [], "NODE_EXTERNAL_CONFLICTS");
  assert.equal(bundle.items.length, 1, "NODE_EXTERNAL_AMBIGUOUS");
  const item = bundle.items[0];
  assert.equal(item.domain, "runtime", "NODE_EXTERNAL_DOMAIN");
  assert.equal(
    item.producer,
    "ORCHESTRATOR_CONNECTOR_READBACK",
    "NODE_EXTERNAL_PRODUCER",
  );
  assert.equal(item.status, "VERIFIED", "NODE_EXTERNAL_NOT_VERIFIED");
  assert.equal(item.source, e.origin?.reference, "NODE_EXTERNAL_SOURCE");
  assert.equal(
    item.identity,
    [STAGING_SERVICE, e.provider?.deploymentId, e.sourceSha].join(":"),
    "NODE_EXTERNAL_IDENTITY",
  );
  assert.equal(
    item.assertion,
    "render-node-deployment-live",
    "NODE_EXTERNAL_ASSERTION",
  );
  assert.equal(item.observedAt, e.origin?.observedAt, "NODE_EXTERNAL_TIME");
  assert.equal(e?.schemaVersion, 1, "NODE_EVIDENCE_VERSION");
  assert.equal(e.mode, NODE_MODE, "NODE_EVIDENCE_MODE");
  assert.equal(e.environment, "staging", "NODE_STAGING_ONLY");
  assert.equal(e.productionEligible, false, "NODE_PRODUCTION_FORBIDDEN");
  assert.equal(e.pagesEligible, false, "NODE_PAGES_FORBIDDEN");
  noOciIdentity(e);
  noOciIdentity(e.provider ?? {});
  assert.match(e.sourceSha ?? "", SHA, "NODE_SOURCE_REQUIRED");
  assert.match(e.treeSha ?? "", SHA, "NODE_TREE_REQUIRED");
  assert.equal(e.sourceSha, expected.sourceSha, "NODE_SOURCE_MISMATCH");
  assert.equal(e.treeSha, expected.treeSha, "NODE_TREE_MISMATCH");
  assert.equal(e.serviceId, STAGING_SERVICE, "NODE_SERVICE_MISMATCH");
  assert.equal(e.canonicalUrl, STAGING_URL, "NODE_URL_MISMATCH");
  assert.equal(
    e.origin?.kind,
    "authenticated-render-connector-observation",
    "NODE_ORIGIN_KIND",
  );
  assert.ok(nonempty(e.origin?.reference), "NODE_ORIGIN_REFERENCE_REQUIRED");
  assert.equal(
    e.origin?.verificationLocation,
    "external-to-github-actions",
    "NODE_ORIGIN_LOCATION",
  );
  assert.equal(e.origin?.verifiedByActions, false, "NODE_FALSE_CI_ATTESTATION");
  assert.equal(e.workflow?.event, "workflow_dispatch", "NODE_WORKFLOW_EVENT");
  assert.equal(
    e.workflow?.path,
    ".github/workflows/staging-render-promotion.yml",
    "NODE_WORKFLOW_PATH",
  );
  for (const key of [
    "runId",
    "runAttempt",
    "callerRunId",
    "callerRunAttempt",
  ]) {
    assert.ok(integer(e.workflow[key]), "NODE_RUN_IDENTITY_REQUIRED");
    assert.equal(
      e.workflow[key],
      expected.workflow[key],
      "NODE_RUN_IDENTITY_MISMATCH",
    );
  }
  assert.equal(e.workflow.headSha, e.sourceSha, "NODE_WORKFLOW_HEAD_MISMATCH");
  assert.equal(
    e.workflow.requestId,
    expected.workflow.requestId,
    "NODE_REQUEST_MISMATCH",
  );
  assert.ok(nonempty(e.workflow.requestId), "NODE_REQUEST_REQUIRED");
  assert.ok(nonempty(e.authorizationId), "NODE_AUTHORIZATION_REQUIRED");
  assert.equal(
    e.authorizationId,
    expected.authorizationId,
    "NODE_AUTHORIZATION_MISMATCH",
  );
  assert.equal(
    e.reservationId,
    expected.reservationId,
    "NODE_RESERVATION_MISMATCH",
  );
  assert.ok(nonempty(e.reservationId), "NODE_RESERVATION_REQUIRED");
  assert.equal(expected.reservationConsumed, false, "NODE_REPLAY_REJECTED");
  assert.ok(integer(e.artifact?.id), "NODE_ARTIFACT_ID_REQUIRED");
  assert.equal(e.artifact.id, expected.artifact.id, "NODE_ARTIFACT_MISMATCH");
  assert.equal(
    e.artifact.name,
    expected.artifact.name,
    "NODE_ARTIFACT_MISMATCH",
  );
  assert.equal(
    e.artifact.runId,
    e.workflow.runId,
    "NODE_ARTIFACT_RUN_MISMATCH",
  );
  assert.equal(
    e.artifact.runAttempt,
    e.workflow.runAttempt,
    "NODE_ARTIFACT_ATTEMPT_MISMATCH",
  );
  assert.equal(expected.artifactCount, 1, "NODE_ARTIFACT_AMBIGUOUS");
  assert.match(
    e.provider?.deploymentId ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "NODE_PROVIDER_ID_REQUIRED",
  );
  assert.equal(
    e.provider.deploymentId,
    expected.providerDeploymentId,
    "NODE_PROVIDER_ID_MISMATCH",
  );
  assert.equal(
    e.provider.serviceId,
    STAGING_SERVICE,
    "NODE_PROVIDER_SERVICE_MISMATCH",
  );
  assert.equal(
    e.provider.commitSha,
    e.sourceSha,
    "NODE_PROVIDER_COMMIT_MISMATCH",
  );
  assert.equal(e.provider.status, "live", "NODE_PROVIDER_NOT_LIVE");
  assert.equal(
    e.provider.latestDeploymentId,
    e.provider.deploymentId,
    "NODE_INTERVENING_DEPLOYMENT",
  );
  assert.equal(e.provider.runtime, "node", "NODE_PROVIDER_RUNTIME_MISMATCH");
  assert.equal(
    e.provider.configurationFingerprint,
    expected.configurationFingerprint,
    "NODE_CONFIGURATION_CHANGED",
  );
  assert.match(
    e.provider.configurationFingerprint ?? "",
    /^sha256:[a-f0-9]{64}$/u,
    "NODE_CONFIG_PROOF_REQUIRED",
  );
  assertObservationAfterBarrier(
    e,
    expected.receiptObservedAt,
    expected.verificationBarrier,
  );
  const dispatchAt = time(expected.dispatchAt);
  const createdAt = time(e.provider.createdAt);
  const liveAt = time(e.provider.liveAt);
  const observedAt = time(e.origin.observedAt);
  const nowMs = time(now);
  assert.ok(
    createdAt >= dispatchAt && liveAt >= createdAt && observedAt >= liveAt,
    "NODE_PROVIDER_TIME_ORDER",
  );
  assert.ok(
    observedAt <= nowMs && nowMs - observedAt <= 300_000,
    "NODE_OBSERVATION_STALE",
  );
  assert.equal(e.runtime?.releaseSha, e.sourceSha, "NODE_RUNTIME_SHA_MISMATCH");
  assert.equal(e.runtime?.healthy, true, "NODE_RUNTIME_UNHEALTHY");
  assert.equal(e.runtime?.ready, true, "NODE_RUNTIME_UNREADY");
  assert.equal(
    e.runtime?.identityKind,
    "application-runtime-identity",
    "NODE_RUNTIME_IDENTITY_KIND",
  );
  assert.ok(
    nonempty(e.runtime.identity) && e.runtime.identity !== "unknown",
    "NODE_RUNTIME_IDENTITY_REQUIRED",
  );
  assert.ok(
    time(e.runtime.observedAt) >= liveAt && time(e.runtime.observedAt) <= nowMs,
    "NODE_RUNTIME_TIME_ORDER",
  );
  assert.ok(
    nonempty(expected.previousRuntime?.identity),
    "NODE_BASELINE_REQUIRED",
  );
  assert.match(
    expected.previousRuntime?.releaseSha ?? "",
    SHA,
    "NODE_BASELINE_REQUIRED",
  );
  assert.ok(
    expected.previousRuntime.releaseSha !== e.sourceSha ||
      expected.previousRuntime.identity !== e.runtime.identity,
    "NODE_SAME_SHA_OLD_RUNTIME",
  );
  return Object.freeze({
    contractValid: true,
    originAuthenticated: false,
    publicationAuthorized: false,
    mode: NODE_MODE,
    sourceSha: e.sourceSha,
    providerDeploymentId: e.provider.deploymentId,
    runtimeIdentity: e.runtime.identity,
  });
}

export function requireOciAcceptance(evidence, consumer) {
  assert.ok(
    ["production", "pages", "oci"].includes(consumer),
    "ACCEPTANCE_CONSUMER_INVALID",
  );
  assert.equal(evidence?.mode, "oci-immutable", "OCI_ACCEPTANCE_REQUIRED");
  assert.equal(
    evidence?.[consumer === "pages" ? "pagesEligible" : "productionEligible"],
    true,
    "ACCEPTANCE_DESTINATION_FORBIDDEN",
  );
  assert.match(
    evidence?.imageDigest ?? "",
    /^sha256:[a-f0-9]{64}$/u,
    "OCI_DIGEST_REQUIRED",
  );
  assert.match(
    String(evidence?.imageRunId ?? ""),
    /^[1-9][0-9]*$/u,
    "OCI_RUN_REQUIRED",
  );
  return true;
}

export function requireNodePublicationAuthority() {
  throw new Error("EXTERNAL_EVIDENCE_AUTHORITY_NOT_CONFIGURED");
}
function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function configurationFingerprint(snapshot) {
  return (
    "sha256:" + createHash("sha256").update(stable(snapshot)).digest("hex")
  );
}
export function validateNodePreflight(preflight, sourceSha) {
  const s = preflight?.serviceSnapshot;
  assert.equal(s?.serviceId, STAGING_SERVICE, "NODE_SNAPSHOT_SERVICE");
  assert.equal(s?.runtime, "node", "NODE_SNAPSHOT_RUNTIME");
  assert.equal(s?.url, STAGING_URL, "NODE_SNAPSHOT_URL");
  assert.equal(
    s?.repository,
    "https://github.com/luizanunciostoca/touristic-digital-platform",
    "NODE_SNAPSHOT_REPOSITORY",
  );
  assert.equal(s?.branch, "main", "NODE_SNAPSHOT_BRANCH");
  assert.equal(s?.autoDeploy, false, "NODE_AUTODEPLOY_FORBIDDEN");
  assert.equal(s?.diskId, "dsk-dbbd6stg1s2s738h3i4g", "NODE_DISK_CHANGED");
  assert.equal(s?.diskMountPath, "/var/data", "NODE_DISK_MOUNT_CHANGED");
  assert.equal(s?.diskSizeGB, 1, "NODE_DISK_SIZE_CHANGED");
  assert.equal(s?.plan, "starter", "NODE_PLAN_CHANGED");
  assert.equal(s?.region, "ohio", "NODE_REGION_CHANGED");
  assert.equal(s?.instances, 1, "NODE_INSTANCE_COUNT_CHANGED");
  assert.equal(s?.healthCheckPath, "/readyz", "NODE_HEALTH_PATH_CHANGED");
  assert.equal(
    s?.buildCommand,
    "corepack pnpm install --frozen-lockfile && corepack pnpm build",
    "NODE_BUILD_CHANGED",
  );
  assert.equal(
    s?.preDeployCommand,
    "node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/staging-predeploy.mjs",
    "NODE_PREDEPLOY_CHANGED",
  );
  assert.equal(
    s?.startCommand,
    "node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/dev-server.mjs",
    "NODE_START_CHANGED",
  );
  assert.equal(
    preflight.configurationFingerprint,
    configurationFingerprint(s),
    "NODE_SNAPSHOT_FINGERPRINT",
  );
  assert.match(
    preflight.previousProviderDeploymentId ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "NODE_PREVIOUS_DEPLOY_REQUIRED",
  );
  assert.match(
    preflight.previousRuntime?.releaseSha ?? "",
    SHA,
    "NODE_PREVIOUS_SHA_REQUIRED",
  );
  assert.ok(
    nonempty(preflight.previousRuntime?.identity),
    "NODE_PREVIOUS_RUNTIME_REQUIRED",
  );
  assert.equal(
    preflight.recovery?.status,
    "PROVEN",
    "NODE_RECOVERY_NOT_PROVEN",
  );
  assert.equal(
    preflight.recovery.candidateSha,
    sourceSha,
    "NODE_RECOVERY_CANDIDATE",
  );
  assert.equal(
    preflight.recovery.retainedBackup,
    true,
    "NODE_BACKUP_NOT_RETAINED",
  );
  assert.equal(
    preflight.recovery.wrapperAndPredeployCovered,
    true,
    "NODE_MUTATION_CLOSURE_REQUIRED",
  );
  assert.equal(
    preflight.recovery.codeRollbackDoesNotUndoData,
    true,
    "NODE_DATA_RECOVERY_REQUIRED",
  );
  for (const key of [
    "backupRef",
    "restoreRef",
    "rollbackRef",
    "mutationInventoryRef",
  ])
    assert.ok(
      nonempty(preflight.recovery[key]),
      "NODE_RECOVERY_REFERENCE_REQUIRED",
    );
  return preflight;
}
export function assertObservationAfterBarrier(
  observation,
  receiptObservedAt,
  barrier,
) {
  assert.ok(
    integer(barrier?.artifactId) && integer(barrier?.jobId),
    "NODE_VERIFICATION_BARRIER_REQUIRED",
  );
  assert.match(
    barrier?.sha256 ?? "",
    /^[a-f0-9]{64}$/u,
    "NODE_VERIFICATION_BARRIER_DIGEST",
  );
  const acquired = time(barrier.recordedAt);
  assert.ok(
    time(receiptObservedAt) >= acquired,
    "NODE_RECEIPT_PREDATES_VERIFICATION_BARRIER",
  );
  assert.ok(
    time(observation.origin.observedAt) >= acquired,
    "NODE_PROVIDER_OBSERVATION_PREDATES_VERIFICATION_BARRIER",
  );
  assert.ok(
    time(observation.runtime.observedAt) >= acquired,
    "NODE_RUNTIME_OBSERVATION_PREDATES_VERIFICATION_BARRIER",
  );
}

export { SHA, integer, time, nonempty, noOciIdentity, stable };
