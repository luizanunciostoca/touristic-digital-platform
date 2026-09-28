import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { targets, verifyImageService } from "./oci-proof.mjs";
import {
  proveImageTarget,
  renderRequest,
  runOperation,
  triggerImageDeploy,
  verifyCandidateSource,
} from "./oci-operations.mjs";

const image = "ghcr.io/owner/morro-digital-v2";
const identity = {
  repository: "owner/repository",
  sourceSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  lockfileDigest: `sha256:${"d".repeat(64)}`,
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

test("candidate source must be an immutable rc ref on canonical main ancestry", () => {
  const sourceSha = identity.sourceSha;
  const candidateRef = `refs/tags/rc/${sourceSha}`;
  const calls = [];
  const gitImpl = (...args) => {
    calls.push(args);
    if (args[0] === "ls-remote")
      return `${sourceSha}\t${candidateRef}`;
    return "";
  };
  assert.equal(verifyCandidateSource(sourceSha, gitImpl), candidateRef);
  assert.deepEqual(
    calls.map((args) => args[0]),
    ["ls-remote", "fetch", "merge-base"],
  );

  assert.throws(
    () =>
      verifyCandidateSource(sourceSha, (...args) => {
        if (args[0] === "ls-remote")
          return `${"e".repeat(40)}\t${candidateRef}`;
        return "";
      }),
    /CANDIDATE_REF_MISMATCH/,
  );
  assert.throws(
    () =>
      verifyCandidateSource(sourceSha, (...args) => {
        if (args[0] === "ls-remote")
          return `${sourceSha}\t${candidateRef}`;
        if (args[0] === "merge-base") throw new Error("not ancestor");
        return "";
      }),
    /CANDIDATE_NOT_ON_MAIN/,
  );
});
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

test("gate proof validates workflow run identity before emitting PASS", async () => {
  const directory = mkdtempSync(join(tmpdir(), "oci-gate-proof-"));
  const previous = process.cwd();
  try {
    process.chdir(directory);
    writeFileSync(
      "oci-image-smoke.json",
      JSON.stringify({
        result: "PASS",
        sourceSha: identity.sourceSha,
        digest: identity.digest,
      }),
    );
    const dependencies = {
      context: () => ({ identity, buildRunId: "10" }),
      proveBuild: () => ({ result: "PASS" }),
    };
    for (const invalid of [undefined, "", "0", "042"]) {
      await assert.rejects(
        runOperation("gate-proof", { GITHUB_RUN_ID: invalid }, dependencies),
        /PROMOTION_RUN_ID_INVALID/,
      );
    }
    const proof = await runOperation(
      "gate-proof",
      { GITHUB_RUN_ID: "42" },
      dependencies,
    );
    assert.equal(proof.schemaVersion, 2);
    assert.equal(proof.workflowRunId, "42");
    assert.equal(proof.buildRunId, "10");
    assert.equal(proof.result, "PASS");
  } finally {
    process.chdir(previous);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("direct trigger enforces the entire proof chain before the deployment effect", async () => {
  const directory = mkdtempSync(join(tmpdir(), "oci-boundary-"));
  try {
    for (const failure of [
      ["build", "BUILD_RUN_ID_INVALID"],
      ["build", "WORKFLOW_NOT_SUCCESSFUL"],
      ["production", "PROMOTION_RUN_ID_INVALID"],
      ["production", "PROMOTION_digest_MISMATCH"],
      ["production", "WORKFLOW_NOT_SUCCESSFUL"],
      null,
    ]) {
      const calls = [];
      const check = (stage) => {
        calls.push(stage);
        if (failure?.[0] === stage) throw new Error(failure[1]);
      };
      const dependencies = {
        context: () => ({ identity, buildRunId: "10" }),
        proveImageTarget: async () => {
          check("target");
          return targets.production;
        },
        proveBuild: () => check("build"),
        proveProductionPrerequisites: async () => check("production"),
        triggerImageDeploy: async () => {
          check("POST");
          return "dep-test";
        },
      };
      const env = {
        GITHUB_REF: "refs/heads/main",
        CONFIRM_DEPLOY: "DEPLOY",
        GITHUB_OUTPUT: join(directory, "output"),
        DEPLOY_ENVIRONMENT: "production",
      };
      if (failure) {
        await assert.rejects(
          runOperation("trigger", env, dependencies),
          new RegExp(failure[1]),
        );
        assert.ok(!calls.includes("POST"));
        assert.deepEqual(
          calls,
          failure[0] === "build"
            ? ["target", "build"]
            : ["target", "build", "production"],
        );
      } else {
        assert.deepEqual(await runOperation("trigger", env, dependencies), {
          deployId: "dep-test",
        });
        assert.deepEqual(calls, ["target", "build", "production", "POST"]);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
