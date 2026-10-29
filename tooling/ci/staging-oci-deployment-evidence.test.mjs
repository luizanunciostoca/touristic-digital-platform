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
};

test("runtime success never attributes a replacement deployment to the original request", () => {
  const result = deploymentEvidence(env);
  assert.equal(result.runtime_identity, "verified");
  assert.equal(result.requested_render_deploy_id, "dep-firstattempt");
  assert.equal(result.live_render_deploy_id, "unknown");
  assert.equal(result.provider_deployment_binding, "not_verified");
  assert.equal(Object.hasOwn(result, "render_deploy_id"), false);
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
