import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  candidateIdentity,
  createDeploymentProof,
  targets,
  targetFor,
  validateDeployHook,
  verifyBuildProvenance,
  verifyImageService,
  verifyObservedDeployment,
  verifyPromotionProof,
  verifyWorkflowRun,
  verifyRepository,
} from "./oci-proof.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const jsonFile = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const gh = (...args) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

function context(env = process.env) {
  verifyRepository(env.GITHUB_REPOSITORY);
  assert.match(env.EXPECTED_SHA ?? "", /^[0-9a-f]{40}$/u, "SOURCE_SHA_INVALID");
  assert.equal(
    git("rev-parse", "HEAD"),
    env.EXPECTED_SHA,
    "SOURCE_CHECKOUT_MISMATCH",
  );
  return {
    repository: env.GITHUB_REPOSITORY,
    identity: candidateIdentity({
      sourceSha: env.EXPECTED_SHA,
      treeSha: git("rev-parse", `${env.EXPECTED_SHA}^{tree}`),
      image: env.IMAGE_REPOSITORY,
      digest: env.IMAGE_DIGEST,
    }),
    buildRunId: env.BUILD_RUN_ID,
  };
}

export async function renderRequest(
  path,
  { apiKey, method = "GET", fetcher = fetch } = {},
) {
  assert.ok(apiKey, "RENDER_API_KEY_REQUIRED");
  assert.match(
    path,
    /^\/services\/srv-[A-Za-z0-9]+(?:\/deploys\/dep-[A-Za-z0-9]+)?$/u,
    "RENDER_API_PATH_INVALID",
  );
  const response = await fetcher(`https://api.render.com/v1${path}`, {
    method,
    redirect: "error",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `RENDER_API_HTTP_${response.status}`);
  return response.json();
}

export async function proveImageTarget({
  environment,
  image,
  apiKey,
  hook,
  fetcher = fetch,
}) {
  const target = targetFor(environment);
  assert.ok(apiKey, "RENDER_API_KEY_REQUIRED");
  validateDeployHook(hook, environment);
  const service = await renderRequest(`/services/${target.serviceId}`, {
    apiKey,
    fetcher,
  });
  return verifyImageService(service, { environment, image });
}

function checkedRun(runId, workflow, ctx) {
  assert.match(String(runId), /^[1-9][0-9]*$/u, "WORKFLOW_RUN_ID_INVALID");
  const run = JSON.parse(
    gh("api", `repos/${ctx.repository}/actions/runs/${runId}`),
  );
  const controllerSha = verifyWorkflowRun(run, {
    runId,
    workflow,
    repository: ctx.repository,
    sourceSha: ctx.identity.sourceSha,
  });
  try {
    git(
      "merge-base",
      "--is-ancestor",
      controllerSha,
      "refs/remotes/origin/main",
    );
  } catch {
    throw new Error("WORKFLOW_CONTROLLER_NOT_ON_MAIN");
  }
  return run;
}

function downloadJson(runId, artifact, filename, repository) {
  const directory = mkdtempSync(join(tmpdir(), "morro-release-proof-"));
  try {
    gh(
      "run",
      "download",
      String(runId),
      "--repo",
      repository,
      "--name",
      artifact,
      "--dir",
      directory,
    );
    return readJson(join(directory, filename));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function proveBuild(ctx) {
  const run = checkedRun(ctx.buildRunId, "release-oci-image.yml", ctx);
  const provenance = downloadJson(
    ctx.buildRunId,
    `release-provenance-${ctx.identity.sourceSha}`,
    "release-provenance.json",
    ctx.repository,
  );
  verifyBuildProvenance(provenance, ctx.identity, {
    runId: ctx.buildRunId,
    repository: ctx.repository,
  });
  return {
    ...ctx.identity,
    buildRunId: String(ctx.buildRunId),
    controllerSha: run.head_sha,
  };
}

async function proveProductionPrerequisites(ctx, env) {
  checkedRun(env.OCI_GATE_RUN_ID, "oci-release-promotion-gate.yml", ctx);
  const gate = downloadJson(
    env.OCI_GATE_RUN_ID,
    `oci-release-proof-${env.OCI_GATE_RUN_ID}`,
    "oci-gate-proof.json",
    ctx.repository,
  );
  verifyPromotionProof(gate, ctx.identity, {
    kind: "gate",
    runId: env.OCI_GATE_RUN_ID,
    buildRunId: ctx.buildRunId,
  });
  checkedRun(env.STAGING_RUN_ID, "staging-oci-promotion.yml", ctx);
  const staging = downloadJson(
    env.STAGING_RUN_ID,
    `staging-oci-deployment-evidence-${env.STAGING_RUN_ID}`,
    "oci-deployment-evidence.json",
    ctx.repository,
  );
  verifyPromotionProof(staging, ctx.identity, {
    kind: "staging",
    runId: env.STAGING_RUN_ID,
    buildRunId: ctx.buildRunId,
  });
  // Re-observe the same deployment; a historical requested digest is not proof.
  const observed = await renderRequest(
    `/services/${targets.staging.serviceId}/deploys/${staging.deployId}`,
    { apiKey: env.RENDER_API_KEY },
  );
  verifyObservedDeployment(observed, ctx.identity, {
    environment: "staging",
    deployId: staging.deployId,
    serviceId: targets.staging.serviceId,
  });
}

export async function triggerImageDeploy({
  environment,
  identity,
  apiKey,
  hook,
  fetcher = fetch,
}) {
  const expected = candidateIdentity(identity);
  await proveImageTarget({
    environment,
    image: expected.image,
    apiKey,
    hook,
    fetcher,
  });
  const url = new URL(hook);
  url.searchParams.set("imgURL", `${expected.image}@${expected.digest}`);
  const response = await fetcher(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(
    response.status === 200 || response.status === 202,
    `RENDER_DEPLOY_HTTP_${response.status}`,
  );
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("RENDER_DEPLOY_RESPONSE_INVALID");
  }
  const deployId = body?.deploy?.id ?? body?.id;
  assert.match(
    deployId ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "RENDER_DEPLOY_ID_REQUIRED",
  );
  return deployId;
}

async function observe(ctx, env, wait = true) {
  const target = targetFor(env.DEPLOY_ENVIRONMENT);
  assert.match(
    env.DEPLOY_ID ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "RENDER_DEPLOY_ID_INVALID",
  );
  for (let attempt = 0; attempt < (wait ? 180 : 1); attempt++) {
    const deployment = await renderRequest(
      `/services/${target.serviceId}/deploys/${env.DEPLOY_ID}`,
      { apiKey: env.RENDER_API_KEY },
    );
    if (deployment.status === "live")
      return verifyObservedDeployment(deployment, ctx.identity, {
        environment: env.DEPLOY_ENVIRONMENT,
        deployId: env.DEPLOY_ID,
        serviceId: target.serviceId,
      });
    assert.ok(
      ![
        "build_failed",
        "pre_deploy_failed",
        "update_failed",
        "canceled",
        "deactivated",
      ].includes(deployment.status),
      "RENDER_DEPLOY_FAILED",
    );
    if (!wait) throw new Error("RENDER_DEPLOY_NOT_LIVE");
    await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
  }
  throw new Error("RENDER_DEPLOY_TIMEOUT");
}

export async function runOperation(
  command,
  env = process.env,
  dependencies = {},
) {
  const ctx = (dependencies.context ?? context)(env);
  if (command === "build-proof") return proveBuild(ctx);
  if (command === "preflight") {
    assert.equal(
      env.GITHUB_REF,
      "refs/heads/main",
      "DEPLOY_CONTROLLER_REF_INVALID",
    );
    assert.equal(env.CONFIRM_DEPLOY, "DEPLOY", "DEPLOY_CONFIRMATION_REQUIRED");
    const target = await (dependencies.proveImageTarget ?? proveImageTarget)({
      environment: env.DEPLOY_ENVIRONMENT,
      image: ctx.identity.image,
      apiKey: env.RENDER_API_KEY,
      hook: env.DEPLOY_HOOK,
    });
    await (dependencies.proveBuild ?? proveBuild)(ctx);
    if (env.DEPLOY_ENVIRONMENT === "production")
      await (
        dependencies.proveProductionPrerequisites ??
        proveProductionPrerequisites
      )(ctx, env);
    return { ...target, ...ctx.identity, result: "PASS" };
  }
  if (command === "trigger") {
    assert.equal(
      env.GITHUB_REF,
      "refs/heads/main",
      "DEPLOY_CONTROLLER_REF_INVALID",
    );
    assert.equal(env.CONFIRM_DEPLOY, "DEPLOY", "DEPLOY_CONFIRMATION_REQUIRED");
    assert.ok(env.GITHUB_OUTPUT, "GITHUB_OUTPUT_REQUIRED");
    await runOperation("preflight", env, dependencies);
    const deployId = await (
      dependencies.triggerImageDeploy ?? triggerImageDeploy
    )({
      environment: env.DEPLOY_ENVIRONMENT,
      identity: ctx.identity,
      apiKey: env.RENDER_API_KEY,
      hook: env.DEPLOY_HOOK,
    });
    appendFileSync(env.GITHUB_OUTPUT, `deploy_id=${deployId}\n`);
    return { deployId };
  }
  if (command === "observe") return observe(ctx, env);
  if (command === "publish") {
    const observed = await observe(ctx, env, false);
    const proof = createDeploymentProof(ctx.identity, observed, {
      environment: env.DEPLOY_ENVIRONMENT,
      runtime: readJson("oci-runtime-proof.json"),
      runId: env.GITHUB_RUN_ID,
      buildRunId: ctx.buildRunId,
    });
    jsonFile("oci-deployment-evidence.json", proof);
    return proof;
  }
  if (command === "gate-proof") {
    const smoke = readJson("oci-image-smoke.json");
    assert.equal(smoke.result, "PASS", "OCI_SMOKE_NOT_PASSED");
    assert.equal(
      smoke.sourceSha,
      ctx.identity.sourceSha,
      "OCI_SMOKE_SOURCE_MISMATCH",
    );
    assert.equal(
      smoke.digest,
      ctx.identity.digest,
      "OCI_SMOKE_DIGEST_MISMATCH",
    );
    proveBuild(ctx);
    const proof = {
      schemaVersion: 1,
      ...ctx.identity,
      workflowRunId: String(env.GITHUB_RUN_ID),
      buildRunId: String(ctx.buildRunId),
      result: "PASS",
    };
    jsonFile("oci-gate-proof.json", proof);
    return proof;
  }
  throw new Error("UNKNOWN_RELEASE_OPERATION");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runOperation(process.argv[2])
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      // Never expose raw HTTP bodies, deploy hook URLs, credentials or exec stderr.
      const reason = /^[A-Z][A-Z0-9_:.-]*$/u.test(error.message)
        ? error.message
        : "RELEASE_OPERATION_FAILED";
      console.error(reason);
      process.exitCode = 1;
    });
}
