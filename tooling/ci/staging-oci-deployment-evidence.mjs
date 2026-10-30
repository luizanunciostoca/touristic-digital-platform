import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function deploymentEvidence(env) {
  assert.match(env.EXPECTED_SHA ?? "", /^[a-f0-9]{40}$/u);
  assert.match(env.IMAGE_DIGEST ?? "", /^sha256:[a-f0-9]{64}$/u);
  assert.match(env.IMAGE_RUN_ID ?? "", /^[1-9][0-9]*$/u);
  assert.equal(
    env.IMAGE_REPOSITORY,
    "ghcr.io/luizanunciostoca/morro-digital-v2",
  );
  assert.equal(env.TARGET_URL, "https://morro-digital-v2-staging.onrender.com");
  const requestedDeployId = /^dep-[a-z0-9]+$/u.test(env.DEPLOY_ID ?? "")
    ? env.DEPLOY_ID
    : "unknown";
  const verified =
    env.RUNTIME_OUTCOME === "success" &&
    env.LIVE_IMAGE_RUN_ID === env.IMAGE_RUN_ID &&
    env.LIVE_RELEASE_SHA === env.EXPECTED_SHA;
  return {
    expected_sha: env.EXPECTED_SHA,
    image: env.IMAGE_REPOSITORY,
    target_url: env.TARGET_URL,
    digest: env.IMAGE_DIGEST,
    image_run_id: env.IMAGE_RUN_ID,
    // Compatibility alias used by existing acceptance workflows: request only.
    render_deploy_id: requestedDeployId,
    render_deploy_id_semantics: "request_receipt_not_live_binding",
    requested_render_deploy_id: requestedDeployId,
    runtime_identity: verified ? "verified" : "unverified",
    live_release_sha: verified ? env.LIVE_RELEASE_SHA : "unknown",
    live_image_run_id: verified ? env.LIVE_IMAGE_RUN_ID : "unknown",
    // A deploy-hook receipt identifies a request, not the deployment serving HTTP.
    live_render_deploy_id: "unknown",
    provider_deployment_binding: "not_verified",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = deploymentEvidence(process.env);
  writeFileSync(
    "oci-deployment-evidence.txt",
    Object.entries(result)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
}
