import assert from "node:assert/strict";

export const targets = Object.freeze({
  staging: Object.freeze({
    serviceId: "srv-da4hb6c9v7es7386ttt0",
    serviceName: "morro-digital-v2-staging",
    canonicalUrl: "https://morro-digital-v2-staging.onrender.com",
  }),
  production: Object.freeze({
    serviceId: "srv-daqgk83ncjis739tghig",
    serviceName: "morro-digital-v2",
    canonicalUrl: "https://morro-digital-v2.onrender.com",
  }),
});
export function targetFor(environment) {
  assert.ok(
    typeof environment === "string" && Object.hasOwn(targets, environment),
    "ENVIRONMENT_INVALID",
  );
  return targets[environment];
}
export function verifyRepository(repository) {
  assert.match(
    repository ?? "",
    /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/u,
    "GITHUB_REPOSITORY_INVALID",
  );
  return repository;
}
export function normalizeRunId(value, reason = "RUN_ID_INVALID") {
  assert.ok(
    typeof value === "string" || (Number.isSafeInteger(value) && value > 0),
    reason,
  );
  const id = String(value);
  assert.match(id, /^[1-9][0-9]*$/u, reason);
  return id;
}
export function normalizeDigest(value) {
  assert.equal(typeof value, "string", "IMAGE_DIGEST_MISSING");
  const digest = value.startsWith("sha256:") ? value : `sha256:${value}`;
  assert.match(digest, /^sha256:[0-9a-f]{64}$/u, "IMAGE_DIGEST_INVALID");
  return digest;
}
export function candidateIdentity({
  repository,
  sourceSha,
  treeSha,
  lockfileDigest,
  image,
  digest,
}) {
  const verifiedRepository = verifyRepository(repository);
  assert.match(sourceSha ?? "", /^[0-9a-f]{40}$/u, "SOURCE_SHA_INVALID");
  assert.match(treeSha ?? "", /^[0-9a-f]{40}$/u, "TREE_SHA_INVALID");
  assert.match(
    lockfileDigest ?? "",
    /^sha256:[0-9a-f]{64}$/u,
    "LOCKFILE_DIGEST_INVALID",
  );
  const [owner] = verifiedRepository.split("/");
  assert.equal(
    image,
    `ghcr.io/${owner.toLowerCase()}/morro-digital-v2`,
    "IMAGE_REPOSITORY_INVALID",
  );
  return {
    repository: verifiedRepository,
    sourceSha,
    treeSha,
    lockfileDigest,
    image,
    digest: normalizeDigest(digest),
  };
}
export function verifyWorkflowRun(
  run,
  { runId, workflow, repository, sourceSha },
) {
  verifyRepository(repository);
  assert.match(sourceSha ?? "", /^[0-9a-f]{40}$/u, "SOURCE_SHA_INVALID");
  normalizeRunId(runId, "WORKFLOW_RUN_ID_INVALID");
  assert.equal(
    normalizeRunId(run?.id),
    normalizeRunId(runId),
    "WORKFLOW_RUN_ID_MISMATCH",
  );
  assert.equal(
    run.repository?.full_name,
    repository,
    "WORKFLOW_REPOSITORY_MISMATCH",
  );
  assert.equal(
    run.head_repository?.full_name,
    repository,
    "WORKFLOW_HEAD_REPOSITORY_MISMATCH",
  );
  assert.equal(
    run.path?.split("@")[0],
    `.github/workflows/${workflow}`,
    "WORKFLOW_PATH_MISMATCH",
  );
  assert.equal(run.event, "workflow_dispatch", "WORKFLOW_EVENT_MISMATCH");
  assert.ok(
    run.head_branch === "main" || run.head_branch === `rc/${sourceSha}`,
    "WORKFLOW_CONTROL_REF_UNTRUSTED",
  );
  assert.match(
    run.head_sha ?? "",
    /^[0-9a-f]{40}$/u,
    "WORKFLOW_CONTROLLER_SHA_INVALID",
  );
  if (run.head_branch === `rc/${sourceSha}`)
    assert.equal(run.head_sha, sourceSha, "WORKFLOW_CANDIDATE_REF_MISMATCH");
  assert.equal(run.status, "completed", "WORKFLOW_INCOMPLETE");
  assert.equal(run.conclusion, "success", "WORKFLOW_NOT_SUCCESSFUL");
  // The caller additionally proves controller head ancestry against fetched main.
  // head_sha identifies controller code; artifact source_sha identifies the image.
  return run.head_sha;
}
export function verifyBuildProvenance(
  provenance,
  identity,
  { runId, repository },
) {
  verifyRepository(repository);
  normalizeRunId(runId, "BUILD_RUN_ID_INVALID");
  const expected = candidateIdentity(identity);
  assert.equal(
    provenance?.source_sha,
    expected.sourceSha,
    "BUILD_SOURCE_MISMATCH",
  );
  assert.equal(provenance.tree_sha, expected.treeSha, "BUILD_TREE_MISMATCH");
  assert.equal(
    provenance.lockfile_digest,
    expected.lockfileDigest,
    "BUILD_LOCKFILE_MISMATCH",
  );
  assert.equal(provenance.image, expected.image, "BUILD_IMAGE_MISMATCH");
  assert.equal(provenance.digest, expected.digest, "BUILD_DIGEST_MISMATCH");
  assert.equal(
    provenance.workflow_run,
    `https://github.com/${repository}/actions/runs/${runId}`,
    "BUILD_RUN_BINDING_MISMATCH",
  );
  return expected;
}
export function validateDeployHook(hook, environment) {
  const target = targetFor(environment);
  assert.ok(hook, "RENDER_DEPLOY_HOOK_MISSING");
  let url;
  try {
    url = new URL(hook);
  } catch {
    throw new Error("RENDER_DEPLOY_HOOK_INVALID");
  }
  assert.ok(
    !url.username && !url.password && !url.hash,
    "RENDER_DEPLOY_HOOK_INVALID",
  );
  assert.equal(url.protocol, "https:", "RENDER_DEPLOY_HOOK_PROTOCOL_INVALID");
  assert.equal(
    url.hostname,
    "api.render.com",
    "RENDER_DEPLOY_HOOK_HOST_INVALID",
  );
  assert.equal(url.port, "", "RENDER_DEPLOY_HOOK_PORT_INVALID");
  assert.equal(
    url.pathname,
    `/deploy/${target.serviceId}`,
    "RENDER_DEPLOY_HOOK_TARGET_MISMATCH",
  );
  return { serviceId: target.serviceId };
}
export function verifyImageService(service, { environment, image }) {
  const target = targetFor(environment);
  assert.equal(service?.id, target.serviceId, "RENDER_SERVICE_ID_MISMATCH");
  assert.equal(
    service.name,
    target.serviceName,
    "RENDER_SERVICE_NAME_MISMATCH",
  );
  assert.equal(service.type, "web_service", "RENDER_SERVICE_TYPE_MISMATCH");
  assert.equal(
    service.serviceDetails?.url,
    target.canonicalUrl,
    "RENDER_SERVICE_URL_MISMATCH",
  );
  assert.equal(
    service.serviceDetails?.runtime,
    "image",
    "RENDER_IMAGE_BACKED_SERVICE_REQUIRED",
  );
  assert.ok(!service.repo, "RENDER_GIT_BACKED_SERVICE_FORBIDDEN");
  assert.ok(
    typeof service.imagePath === "string" &&
      (service.imagePath.startsWith(image + "@sha256:") ||
        service.imagePath.startsWith(image + ":")),
    "RENDER_IMAGE_REPOSITORY_MISMATCH",
  );
  return { environment, ...target };
}
export function verifyObservedDeployment(
  deployment,
  identity,
  { environment, deployId, serviceId },
) {
  const target = targetFor(environment);
  assert.equal(serviceId, target.serviceId, "RENDER_SERVICE_TARGET_MISMATCH");
  assert.match(
    deployId ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "RENDER_DEPLOY_ID_INVALID",
  );
  assert.equal(deployment?.id, deployId, "RENDER_DEPLOY_ID_MISMATCH");
  assert.equal(deployment.status, "live", "RENDER_DEPLOY_NOT_LIVE");
  const expected = candidateIdentity(identity);
  assert.equal(
    deployment.image?.ref,
    `${expected.image}@${expected.digest}`,
    "RENDER_IMAGE_REF_MISMATCH",
  );
  assert.equal(
    normalizeDigest(deployment.image?.sha),
    expected.digest,
    "RENDER_OBSERVED_DIGEST_MISMATCH",
  );
  return { serviceId, deployId, observedDigest: expected.digest };
}
export function verifyRuntimeProof(
  runtime,
  sourceSha,
  { environment, deployId },
) {
  const target = targetFor(environment);
  assert.equal(
    runtime?.contract,
    "MORRO-DIGITAL-V2-RENDER-SMOKE",
    "RUNTIME_CONTRACT_INVALID",
  );
  assert.equal(runtime.contractVersion, 2, "RUNTIME_CONTRACT_VERSION_INVALID");
  assert.equal(runtime.releaseSha, sourceSha, "RUNTIME_SOURCE_MISMATCH");
  assert.equal(runtime.serviceId, target.serviceId, "RUNTIME_SERVICE_MISMATCH");
  assert.equal(
    runtime.canonicalUrl,
    target.canonicalUrl,
    "RUNTIME_TARGET_URL_MISMATCH",
  );
  assert.equal(runtime.deployId, deployId, "RUNTIME_DEPLOY_ID_MISMATCH");
  assert.equal(runtime.status, "pass", "RUNTIME_NOT_PASSED");
  assert.equal(runtime.readiness, "ready", "RUNTIME_NOT_READY");
  assert.ok(
    Array.isArray(runtime.checks) && runtime.checks.length > 0,
    "RUNTIME_CHECKS_MISSING",
  );
  const names = new Set();
  for (const check of runtime.checks) {
    assert.ok(
      typeof check.name === "string" &&
        /^[a-z][a-z0-9-]{0,79}$/u.test(check.name) &&
        !names.has(check.name),
      "RUNTIME_CHECK_IDENTITY_INVALID",
    );
    names.add(check.name);
    assert.equal(check.status, "pass", "RUNTIME_DEGRADED");
  }
  assert.ok(names.has("commerce-runtime"), "RUNTIME_COMMERCE_CHECK_MISSING");
  return {
    contract: runtime.contract,
    contractVersion: runtime.contractVersion,
    releaseSha: runtime.releaseSha,
    serviceId: runtime.serviceId,
    canonicalUrl: runtime.canonicalUrl,
    deployId: runtime.deployId,
    status: runtime.status,
    readiness: runtime.readiness,
    checks: runtime.checks.map(({ name, status }) => ({ name, status })),
  };
}
export function createDeploymentProof(
  identity,
  deployment,
  {
    environment,
    deployId,
    runtime,
    runId,
    buildRunId,
    verifiedAt = new Date().toISOString(),
  },
) {
  const target = targetFor(environment);
  const expected = candidateIdentity(identity);
  const observed = verifyObservedDeployment(deployment, expected, {
    environment,
    deployId,
    serviceId: target.serviceId,
  });
  const runtimeProof = verifyRuntimeProof(runtime, expected.sourceSha, {
    environment,
    deployId: observed.deployId,
  });
  normalizeRunId(runId, "DEPLOYMENT_RUN_ID_INVALID");
  normalizeRunId(buildRunId, "BUILD_RUN_ID_INVALID");
  assert.equal(typeof verifiedAt, "string", "DEPLOYMENT_TIMESTAMP_INVALID");
  assert.ok(
    Number.isFinite(Date.parse(verifiedAt)),
    "DEPLOYMENT_TIMESTAMP_INVALID",
  );
  return {
    schemaVersion: 2,
    result: "PASS",
    environment,
    ...expected,
    ...target,
    observedDigest: observed.observedDigest,
    deployId: observed.deployId,
    liveSha: runtime.releaseSha,
    runtime: runtimeProof,
    workflowRunId: String(runId),
    buildRunId: String(buildRunId),
    verifiedAt,
  };
}
export function verifyPromotionProof(
  proof,
  identity,
  { kind, runId, buildRunId },
) {
  const expected = candidateIdentity(identity);
  for (const value of [
    runId,
    buildRunId,
    proof?.workflowRunId,
    proof?.buildRunId,
  ]) {
    normalizeRunId(value, "PROMOTION_RUN_ID_INVALID");
  }
  assert.equal(proof?.schemaVersion, 2, "PROMOTION_PROOF_SCHEMA_INVALID");
  assert.equal(proof.result, "PASS", "PROMOTION_PROOF_NOT_PASSED");
  for (const [key, value] of Object.entries(expected))
    assert.equal(proof[key], value, `PROMOTION_${key}_MISMATCH`);
  assert.equal(
    String(proof.workflowRunId),
    String(runId),
    "PROMOTION_RUN_BINDING_MISMATCH",
  );
  assert.equal(
    String(proof.buildRunId),
    String(buildRunId),
    "PROMOTION_BUILD_RUN_MISMATCH",
  );
  if (kind === "staging") {
    assert.equal(proof.environment, "staging", "STAGING_ENVIRONMENT_MISMATCH");
    for (const [key, value] of Object.entries(targets.staging))
      assert.equal(proof[key], value, `STAGING_${key}_MISMATCH`);
    assert.equal(
      proof.observedDigest,
      expected.digest,
      "STAGING_OBSERVED_DIGEST_MISMATCH",
    );
    assert.equal(
      proof.liveSha,
      expected.sourceSha,
      "STAGING_RUNTIME_SHA_MISMATCH",
    );
    verifyRuntimeProof(proof.runtime, expected.sourceSha, {
      environment: "staging",
      deployId: proof.deployId,
    });
    assert.match(
      proof.deployId ?? "",
      /^dep-[A-Za-z0-9]+$/u,
      "STAGING_DEPLOY_ID_INVALID",
    );
    assert.equal(
      typeof proof.verifiedAt,
      "string",
      "STAGING_TIMESTAMP_INVALID",
    );
    assert.ok(
      Number.isFinite(Date.parse(proof.verifiedAt)),
      "STAGING_TIMESTAMP_INVALID",
    );
  } else assert.equal(kind, "gate", "PROMOTION_PROOF_KIND_INVALID");
  return expected;
}
