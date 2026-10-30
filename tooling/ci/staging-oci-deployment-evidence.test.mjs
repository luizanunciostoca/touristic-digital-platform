import assert from "node:assert/strict";
import test from "node:test";
import { deploymentEvidence } from "./staging-oci-deployment-evidence.mjs";

const env = {
  EXPECTED_SHA: "a".repeat(40),
  IMAGE_DIGEST: "sha256:" + "b".repeat(64),
  IMAGE_RUN_ID: "123",
  LIVE_IMAGE_RUN_ID: "123",
  LIVE_RELEASE_SHA: "a".repeat(40),
  RUNTIME_OUTCOME: "success",
  DEPLOY_ID: "dep-firstattempt",
  IMAGE_REPOSITORY: "ghcr.io/luizanunciostoca/morro-digital-v2",
  TARGET_URL: "https://morro-digital-v2-staging.onrender.com",
};

test("runtime success never attributes a replacement deployment to the original request", () => {
  const result = deploymentEvidence(env);
  assert.equal(result.runtime_identity, "verified");
  assert.equal(result.requested_render_deploy_id, "dep-firstattempt");
  assert.equal(result.live_render_deploy_id, "unknown");
  assert.equal(result.provider_deployment_binding, "not_verified");
  assert.equal(result.render_deploy_id, result.requested_render_deploy_id);
  assert.equal(
    result.render_deploy_id_semantics,
    "request_receipt_not_live_binding",
  );
  assert.equal(result.image, env.IMAGE_REPOSITORY);
  assert.equal(result.target_url, env.TARGET_URL);
});
test("legacy acceptance fields remain present without claiming provider binding", () => {
  const result = deploymentEvidence(env);
  for (const field of [
    "expected_sha",
    "image",
    "digest",
    "image_run_id",
    "live_image_run_id",
    "target_url",
    "render_deploy_id",
  ])
    assert.equal(typeof result[field], "string", field);
  assert.equal(result.provider_deployment_binding, "not_verified");
});
for (const override of [
  { RUNTIME_OUTCOME: "failure" },
  { LIVE_IMAGE_RUN_ID: "456" },
  { LIVE_RELEASE_SHA: "c".repeat(40) },
  { LIVE_RELEASE_SHA: undefined },
]) {
  test(`incomplete or mismatched proof stays unverified: ${JSON.stringify(override)}`, () => {
    assert.equal(
      deploymentEvidence({ ...env, ...override }).runtime_identity,
      "unverified",
    );
  });
}
test("invalid receipt cannot inject extra evidence lines", () => {
  assert.equal(
    deploymentEvidence({
      ...env,
      DEPLOY_ID: "dep-foo\nlive_render_deploy_id=forged",
    }).requested_render_deploy_id,
    "unknown",
  );
});
