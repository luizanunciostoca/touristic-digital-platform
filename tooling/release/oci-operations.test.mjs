import assert from "node:assert/strict";
import test from "node:test";
import { targets, verifyImageService } from "./oci-proof.mjs";
import {
  proveImageTarget,
  renderRequest,
  triggerImageDeploy,
} from "./oci-operations.mjs";

const image = "ghcr.io/owner/morro-digital-v2";
const identity = {
  sourceSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  image,
  digest: `sha256:${"c".repeat(64)}`,
};
const hook = `https://api.render.com/deploy/${targets.staging.serviceId}?key=fixture-secret`;
function service() {
  return {
    id: targets.staging.serviceId,
    name: targets.staging.serviceName,
    type: "web_service",
    imagePath: image + ":prior",
    serviceDetails: { runtime: "image", url: targets.staging.canonicalUrl },
  };
}
function options(fetcher) {
  return {
    environment: "staging",
    identity,
    image,
    apiKey: "fixture-key",
    hook,
    fetcher,
  };
}
test("missing API capability fails before any request or deployment effect", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw new Error("should not call");
  };
  await assert.rejects(
    () => triggerImageDeploy({ ...options(fetcher), apiKey: "" }),
    /RENDER_API_KEY_REQUIRED/,
  );
  assert.equal(calls, 0);
});
test("Git-backed service is rejected before hook invocation", async () => {
  const methods = [];
  const fetcher = async (_url, init) => {
    methods.push(init.method);
    return {
      ok: true,
      json: async () => ({
        ...service(),
        repo: "https://github.com/owner/repository",
        serviceDetails: { ...service().serviceDetails, runtime: "node" },
      }),
    };
  };
  await assert.rejects(
    () => triggerImageDeploy(options(fetcher)),
    /IMAGE_BACKED_SERVICE_REQUIRED/,
  );
  assert.deepEqual(methods, ["GET"]);
});
test("image-backed preflight checks positive source and canonical service binding", () => {
  assert.equal(
    verifyImageService(service(), { environment: "staging", image }).serviceId,
    targets.staging.serviceId,
  );
  for (const altered of [
    { ...service(), id: targets.production.serviceId },
    { ...service(), imagePath: "ghcr.io/evil/image:latest" },
    { ...service(), imagePath: undefined },
    { ...service(), repo: "https://github.com/owner/repository" },
    {
      ...service(),
      serviceDetails: {
        ...service().serviceDetails,
        url: targets.production.canonicalUrl,
      },
    },
  ])
    assert.throws(() =>
      verifyImageService(altered, { environment: "staging", image }),
    );
});
test("image hook reuses canonical service hook and binds exact digest, returning only deployment ID", async () => {
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url: String(url), method: init.method });
    return init.method === "GET"
      ? { ok: true, json: async () => service() }
      : { status: 200, json: async () => ({ deploy: { id: "dep-new123" } }) };
  };
  assert.equal(await triggerImageDeploy(options(fetcher)), "dep-new123");
  assert.equal(requests.length, 2);
  const posted = new URL(requests[1].url);
  assert.equal(posted.searchParams.get("key"), "fixture-secret");
  assert.equal(
    posted.searchParams.get("imgURL"),
    `${image}@${identity.digest}`,
  );
});
test("HTTP 202 without deployment ID cannot become deploy proof", async () => {
  const fetcher = async (_url, init) =>
    init.method === "GET"
      ? { ok: true, json: async () => service() }
      : { status: 202, json: async () => ({ message: "queued" }) };
  await assert.rejects(
    () => triggerImageDeploy(options(fetcher)),
    /RENDER_DEPLOY_ID_REQUIRED/,
  );
});
test("HTTP failures report status without raw credential-bearing body", async () => {
  await assert.rejects(
    () =>
      renderRequest(`/services/${targets.staging.serviceId}`, {
        apiKey: "fixture-key",
        fetcher: async () => ({
          ok: false,
          status: 401,
          json: async () => ({ token: "must-not-be-read" }),
        }),
      }),
    (error) =>
      error.message.includes("RENDER_API_HTTP_401") &&
      !error.message.includes("must-not-be-read"),
  );
});
test("wrong service hook cannot invoke the provider", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      proveImageTarget({
        ...options(async () => {
          calls++;
        }),
        hook: `https://api.render.com/deploy/${targets.production.serviceId}?key=fixture-secret`,
      }),
    /TARGET_MISMATCH/,
  );
  assert.equal(calls, 0);
});
