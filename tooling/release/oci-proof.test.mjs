import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateIdentity,
  createDeploymentProof,
  normalizeDigest,
  normalizeRunId,
  targets,
  validateDeployHook,
  verifyBuildProvenance,
  verifyObservedDeployment,
  verifyPromotionProof,
  verifyRuntimeProof,
  verifyWorkflowRun,
} from "./oci-proof.mjs";

const repository = "owner/repository";
const identity = {
  repository,
  sourceSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  lockfileDigest: `sha256:${"d".repeat(64)}`,
  image: "ghcr.io/owner/morro-digital-v2",
  digest: `sha256:${"c".repeat(64)}`,
};
const runtime = {
  contract: "MORRO-DIGITAL-V2-RENDER-SMOKE",
  contractVersion: 2,
  status: "pass",
  readiness: "ready",
  releaseSha: identity.sourceSha,
  serviceId: targets.staging.serviceId,
  canonicalUrl: targets.staging.canonicalUrl,
  deployId: "dep-12345",
  checks: [{ name: "commerce-runtime", status: "pass" }],
};
function runFixture() {
  return {
    id: 42,
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    path: ".github/workflows/staging-oci-promotion.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "d".repeat(40),
    status: "completed",
    conclusion: "success",
  };
}
const runExpectation = {
  runId: 42,
  workflow: "staging-oci-promotion.yml",
  repository,
  sourceSha: identity.sourceSha,
};
function deploymentFixture() {
  return {
    id: "dep-12345",
    status: "live",
    image: {
      ref: `${identity.image}@${identity.digest}`,
      sha: identity.digest.slice(7),
    },
  };
}
const observedOptions = {
  environment: "staging",
  deployId: "dep-12345",
  serviceId: targets.staging.serviceId,
};
function proofFixture() {
  return createDeploymentProof(identity, deploymentFixture(), {
    environment: "staging",
    deployId: "dep-12345",
    runtime,
    runId: 42,
    buildRunId: 17,
  });
}
test("controller SHA may advance while explicit source tree and digest remain fixed", () => {
  assert.equal(verifyWorkflowRun(runFixture(), runExpectation), "d".repeat(40));
  const provenance = {
    source_sha: identity.sourceSha,
    tree_sha: identity.treeSha,
    lockfile_digest: identity.lockfileDigest,
    image: identity.image,
    digest: identity.digest,
    workflow_run: "https://github.com/owner/repository/actions/runs/17",
  };
  assert.deepEqual(
    verifyBuildProvenance(provenance, identity, { runId: 17, repository }),
    identity,
  );
  assert.throws(
    () =>
      verifyBuildProvenance(
        { ...provenance, source_sha: "d".repeat(40) },
        identity,
        { runId: 17, repository },
      ),
    /SOURCE_MISMATCH/,
  );
  assert.throws(
    () =>
      verifyBuildProvenance(
        { ...provenance, digest: `sha256:${"e".repeat(64)}` },
        identity,
        { runId: 17, repository },
      ),
    /RENDER_IMAGE_REF_MISMATCH/,
  );
  assert.throws(
    () =>
      verifyBuildProvenance(provenance, identity, { runId: 18, repository }),
    /RUN_BINDING_MISMATCH/,
  );
});
for (const [name, mutate, error] of [
  [
    "wrong run",
    (r) => {
      r.id = 43;
    },
    /RUN_ID_MISMATCH/,
  ],
  [
    "foreign repo",
    (r) => {
      r.repository.full_name = "evil/repo";
    },
    /REPOSITORY_MISMATCH/,
  ],
  [
    "fork head",
    (r) => {
      r.head_repository.full_name = "evil/repo";
    },
    /HEAD_REPOSITORY_MISMATCH/,
  ],
  [
    "wrong workflow",
    (r) => {
      r.path = ".github/workflows/quality.yml";
    },
    /PATH_MISMATCH/,
  ],
  [
    "untrusted branch",
    (r) => {
      r.head_branch = "feature/unmerged";
    },
    /REF_UNTRUSTED/,
  ],
  [
    "skipped run",
    (r) => {
      r.conclusion = "skipped";
    },
    /NOT_SUCCESSFUL/,
  ],
  [
    "failed run",
    (r) => {
      r.conclusion = "failure";
    },
    /NOT_SUCCESSFUL/,
  ],
  [
    "PR event",
    (r) => {
      r.event = "pull_request";
    },
    /EVENT_MISMATCH/,
  ],
])
  test(`OCI rejects ${name}`, () => {
    const r = runFixture();
    mutate(r);
    assert.throws(() => verifyWorkflowRun(r, runExpectation), error);
  });

test("existing canonical service hook is reusable without a separate image hook secret", () => {
  assert.deepEqual(
    validateDeployHook(
      `https://api.render.com/deploy/${targets.staging.serviceId}?key=fixture`,
      "staging",
    ),
    { serviceId: targets.staging.serviceId },
  );
  for (const hook of [
    `https://api.render.com/deploy/${targets.production.serviceId}?key=fixture`,
    `https://evil.example/deploy/${targets.staging.serviceId}?key=fixture`,
    `http://api.render.com/deploy/${targets.staging.serviceId}?key=fixture`,
    `https://api.render.com:444/deploy/${targets.staging.serviceId}?key=fixture`,
  ])
    assert.throws(() => validateDeployHook(hook, "staging"));
});
test("provider observation requires live deployment and exact image ref plus resolved digest", () => {
  assert.equal(
    verifyObservedDeployment(deploymentFixture(), identity, observedOptions)
      .observedDigest,
    identity.digest,
  );
  const mutated = [
    {
      ...deploymentFixture(),
      image: undefined,
      commit: { id: identity.sourceSha },
    },
    { ...deploymentFixture(), status: "build_in_progress" },
    { ...deploymentFixture(), id: "dep-other" },
    {
      ...deploymentFixture(),
      image: { ref: `${identity.image}:latest`, sha: identity.digest },
    },
    {
      ...deploymentFixture(),
      image: {
        ref: `${identity.image}@${identity.digest}`,
        sha: "f".repeat(64),
      },
    },
  ];
  for (const observed of mutated)
    assert.throws(() =>
      verifyObservedDeployment(observed, identity, observedOptions),
    );
  assert.throws(
    () =>
      verifyObservedDeployment(deploymentFixture(), identity, {
        ...observedOptions,
        serviceId: targets.production.serviceId,
      }),
    /TARGET_MISMATCH/,
  );
});
test("production requires successful same-digest same-tree same-build staging evidence", () => {
  const proof = proofFixture();
  assert.deepEqual(
    verifyPromotionProof(proof, identity, {
      kind: "staging",
      runId: 42,
      buildRunId: 17,
    }),
    identity,
  );
  for (const [key, value] of [
    ["sourceSha", "e".repeat(40)],
    ["treeSha", "e".repeat(40)],
    ["lockfileDigest", `sha256:${"e".repeat(64)}`],
    ["repository", "evil/repository"],
    ["digest", `sha256:${"e".repeat(64)}`],
    ["observedDigest", `sha256:${"e".repeat(64)}`],
    ["serviceId", targets.production.serviceId],
    ["canonicalUrl", targets.production.canonicalUrl],
    ["environment", "production"],
    ["deployId", "unknown"],
    ["workflowRunId", "43"],
    ["buildRunId", "18"],
    ["liveSha", "e".repeat(40)],
    ["result", "FAIL"],
    ["verifiedAt", ""],
  ])
    assert.throws(
      () =>
        verifyPromotionProof({ ...proof, [key]: value }, identity, {
          kind: "staging",
          runId: 42,
          buildRunId: 17,
        }),
      key,
    );
});
test("proof cannot be emitted for requested-only digest or wrong runtime", () => {
  assert.throws(
    () =>
      createDeploymentProof(
        identity,
        { ...deploymentFixture(), image: undefined },
        {
          environment: "staging",
          deployId: "dep-12345",
          runtime,
          runId: 42,
          buildRunId: 17,
        },
      ),
    /DIGEST_MISMATCH/,
  );
  assert.throws(
    () =>
      createDeploymentProof(identity, deploymentFixture(), {
        environment: "staging",
        deployId: "dep-12345",
        runtime: { ...runtime, releaseSha: "e".repeat(40) },
        runId: 42,
        buildRunId: 17,
      }),
    /RUNTIME_SOURCE_MISMATCH/,
  );
});
test("digest identity accepts only SHA256, never mutable tags or unknown values", () => {
  assert.equal(normalizeDigest("c".repeat(64)), identity.digest);
  for (const value of ["latest", "unknown", "", "sha256:bad", undefined])
    assert.throws(() => normalizeDigest(value));
  assert.throws(
    () => candidateIdentity({ ...identity, image: "evil.example/image" }),
    /IMAGE_REPOSITORY_INVALID/,
  );
  assert.throws(
    () =>
      candidateIdentity({
        ...identity,
        image: "ghcr.io/evil-org/morro-digital-v2",
      }),
    /IMAGE_REPOSITORY_INVALID/,
  );
  assert.throws(
    () => candidateIdentity({ ...identity, lockfileDigest: "sha256:bad" }),
    /LOCKFILE_DIGEST_INVALID/,
  );
});

test("runtime cannot pass with degraded readiness, failed checks or omitted commerce", () => {
  for (const altered of [
    { ...runtime, status: "degraded" },
    { ...runtime, readiness: "not-ready" },
    { ...runtime, checks: [] },
    { ...runtime, checks: [{ name: "commerce-runtime", status: "fail" }] },
    { ...runtime, checks: [{ name: "commerce-runtime", status: "warn" }] },
    { ...runtime, checks: [{ name: "other-runtime", status: "pass" }] },
    { ...runtime, checks: [...runtime.checks, ...runtime.checks] },
    { ...runtime, serviceId: targets.production.serviceId },
    { ...runtime, canonicalUrl: targets.production.canonicalUrl },
    { ...runtime, deployId: "dep-other" },
  ])
    assert.throws(() =>
      verifyRuntimeProof(altered, identity.sourceSha, {
        environment: "staging",
        deployId: "dep-12345",
      }),
    );
  assert.throws(
    () =>
      verifyPromotionProof(
        {
          ...proofFixture(),
          runtime: {
            ...runtime,
            checks: [{ name: "commerce-runtime", status: "fail" }],
          },
        },
        identity,
        { kind: "staging", runId: 42, buildRunId: 17 },
      ),
    /RUNTIME_DEGRADED/,
  );
});

test("prototype names cannot select an environment", () => {
  for (const environment of [
    "constructor",
    "__proto__",
    "toString",
    "unknown",
  ]) {
    assert.throws(
      () =>
        validateDeployHook(
          "https://api.render.com/deploy/srv-unknown",
          environment,
        ),
      /ENVIRONMENT_INVALID/,
    );
    assert.throws(
      () =>
        createDeploymentProof(identity, deploymentFixture(), {
          environment,
          deployId: "dep-12345",
          runtime,
          runId: 42,
          buildRunId: 17,
        }),
      /ENVIRONMENT_INVALID/,
    );
  }
});
test("runtime check IDs cannot exfiltrate arbitrary URL or credential text", () => {
  for (const name of [
    "https://fixture-user:fixture-secret@example.invalid/check",
    "check with spaces",
    "x".repeat(81),
  ]) {
    assert.throws(
      () =>
        verifyRuntimeProof(
          { ...runtime, checks: [...runtime.checks, { name, status: "pass" }] },
          identity.sourceSha,
          { environment: "staging", deployId: "dep-12345" },
        ),
      /RUNTIME_CHECK_IDENTITY_INVALID/,
    );
  }
});
test("missing proof or expected run IDs never compare as matching undefined", () => {
  const proof = { schemaVersion: 2, ...identity, result: "PASS" };
  assert.throws(
    () => verifyPromotionProof(proof, identity, { kind: "gate" }),
    /PROMOTION_RUN_ID_INVALID/,
  );
  for (const invalid of [undefined, null, "", "0", "-1", "17suffix"]) {
    assert.throws(
      () =>
        verifyPromotionProof(
          { ...proof, workflowRunId: invalid, buildRunId: "17" },
          identity,
          { kind: "gate", runId: invalid, buildRunId: "17" },
        ),
      /PROMOTION_RUN_ID_INVALID/,
    );
  }
});

test("build provenance rejects missing or malformed expected repository and run ID", () => {
  const provenance = {
    source_sha: identity.sourceSha,
    tree_sha: identity.treeSha,
    image: identity.image,
    digest: identity.digest,
    workflow_run: "https://github.com/undefined/actions/runs/undefined",
  };
  assert.throws(
    () => verifyBuildProvenance(provenance, identity, {}),
    /GITHUB_REPOSITORY_INVALID/,
  );
  assert.throws(
    () => verifyBuildProvenance(provenance, identity, { repository }),
    /BUILD_RUN_ID_INVALID/,
  );
  for (const invalid of [
    undefined,
    "",
    "../..",
    "owner/..",
    "https://github.com/owner/repo",
  ]) {
    assert.throws(
      () =>
        verifyWorkflowRun(runFixture(), {
          ...runExpectation,
          repository: invalid,
        }),
      /GITHUB_REPOSITORY_INVALID/,
    );
  }
});

test("run IDs reject coercible containers and unsafe numeric identities", () => {
  for (const id of [
    [42],
    { toString: () => "42" },
    42n,
    NaN,
    Infinity,
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "042",
  ]) {
    assert.throws(() => normalizeRunId(id));
    assert.throws(() =>
      verifyWorkflowRun({ ...runFixture(), id }, runExpectation),
    );
    assert.throws(() =>
      verifyPromotionProof({ ...proofFixture(), workflowRunId: id }, identity, {
        kind: "staging",
        runId: 42,
        buildRunId: 17,
      }),
    );
  }
  assert.equal(normalizeRunId(42), "42");
  assert.equal(normalizeRunId("42"), "42");
});
test("deployment proof timestamps must be strings, not coercible containers", () => {
  const proof = proofFixture();
  assert.throws(() =>
    verifyPromotionProof(
      { ...proof, verifiedAt: [proof.verifiedAt] },
      identity,
      { kind: "staging", runId: 42, buildRunId: 17 },
    ),
  );
});
