import test from "node:test";
import assert from "node:assert/strict";
import {
  NODE_MODE,
  STAGING_SERVICE,
  STAGING_URL,
  validateExternalNodeObservation,
  requireOciAcceptance,
  requireNodePublicationAuthority,
} from "./staging-node-exception.mjs";

const sha = "a".repeat(40),
  tree = "b".repeat(40);
const now = "2026-10-23T04:20:00Z";
function fixture() {
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
test("typed connector observation validates structure without manufacturing authority", () => {
  const { evidence, expected } = fixture();
  const result = validateExternalNodeObservation(evidence, expected, { now });
  assert.equal(result.contractValid, true);
  assert.equal(result.originAuthenticated, false);
  assert.equal(result.publicationAuthorized, false);
  assert.notEqual(result.providerDeploymentId, result.runtimeIdentity);
  assert.throws(
    () => requireNodePublicationAuthority(result),
    /EXTERNAL_EVIDENCE_AUTHORITY_NOT_CONFIGURED/,
  );
});
const cases = [
  [
    "missing provider ID",
    (e) => {
      delete e.provider.deploymentId;
    },
  ],
  [
    "wrong provider commit",
    (e) => {
      e.provider.commitSha = "f".repeat(40);
    },
  ],
  [
    "provider not live",
    (e) => {
      e.provider.status = "build_in_progress";
    },
  ],
  [
    "provider predates dispatch",
    (e) => {
      e.provider.createdAt = "2026-10-23T04:17:59Z";
    },
  ],
  [
    "configuration drift",
    (e) => {
      e.provider.configurationFingerprint = "sha256:" + "f".repeat(64);
    },
  ],
  [
    "runtime unhealthy",
    (e) => {
      e.runtime.healthy = false;
    },
  ],
  [
    "runtime observed before live",
    (e) => {
      e.runtime.observedAt = "2026-10-23T04:18:59Z";
    },
  ],
  [
    "wrong caller",
    (e) => {
      e.workflow.callerRunId = 11;
    },
  ],
  [
    "wrong attempt",
    (e) => {
      e.workflow.runAttempt = 2;
    },
  ],
  [
    "artifact attempt mismatch",
    (e) => {
      e.artifact.runAttempt = 2;
    },
  ],
  [
    "artifact ID mismatch",
    (e) => {
      e.artifact.id = 100;
    },
  ],
  [
    "OCI mixed into Node",
    (e) => {
      e.imageDigest = "sha256:" + "e".repeat(64);
    },
  ],
  [
    "production eligible Node",
    (e) => {
      e.productionEligible = true;
    },
  ],
  [
    "Pages eligible Node",
    (e) => {
      e.pagesEligible = true;
    },
  ],
  [
    "false CI provider attestation",
    (e) => {
      e.origin.verifiedByActions = true;
    },
  ],
  [
    "unknown external evidence",
    (e) => {
      e.externalEvidence.unknowns = ["unverified-source"];
    },
  ],
  [
    "external conflict",
    (e) => {
      e.externalEvidence.conflicts = ["different-deploy"];
    },
  ],
  [
    "unverified external status",
    (e) => {
      e.externalEvidence.items[0].status = "INFERRED";
    },
  ],
  [
    "wrong external producer",
    (e) => {
      e.externalEvidence.items[0].producer = "caller";
    },
  ],
  [
    "duplicate external item",
    (e) => {
      e.externalEvidence.items.push(
        structuredClone(e.externalEvidence.items[0]),
      );
    },
  ],
  [
    "stale external evidence",
    (e) => {
      e.externalEvidence.items[0].freshnessSeconds = 1;
    },
  ],
  [
    "replayed reservation",
    (_e, x) => {
      x.reservationConsumed = true;
    },
  ],
  [
    "ambiguous artifact",
    (_e, x) => {
      x.artifactCount = 2;
    },
  ],
  [
    "old same-SHA runtime",
    (e, x) => {
      x.previousRuntime = { releaseSha: sha, identity: e.runtime.identity };
    },
  ],
];
for (const [name, mutate] of cases)
  test(name + " fails closed", () => {
    const { evidence, expected } = fixture();
    mutate(evidence, expected);
    assert.throws(() =>
      validateExternalNodeObservation(evidence, expected, { now }),
    );
  });
for (const consumer of ["production", "pages", "oci"])
  test("Node rejected by " + consumer + " before dispatch", () => {
    const { evidence } = fixture();
    let dispatched = 0;
    assert.throws(() => {
      requireOciAcceptance(evidence, consumer);
      dispatched++;
    }, /OCI_ACCEPTANCE_REQUIRED/);
    assert.equal(dispatched, 0);
  });
test("valid immutable OCI evidence remains eligible", () => {
  assert.equal(
    requireOciAcceptance(
      {
        mode: "oci-immutable",
        productionEligible: true,
        pagesEligible: true,
        imageDigest: "sha256:" + "e".repeat(64),
        imageRunId: "42",
      },
      "production",
    ),
    true,
  );
});

import { createHash } from "node:crypto";
import {
  receiptBody,
  verifyConnectorReceipt,
} from "./staging-node-exception.mjs";
function receiptFixture() {
  const expected = {
    phase: "pre-deploy",
    authorizationId: "one-staging-publication",
    requestId: "request-10-1",
    sourceSha: sha,
    treeSha: tree,
    runId: 12,
    runAttempt: 1,
    callerRunId: 10,
    callerRunAttempt: 1,
  };
  const actor = { id: 318748875, login: "luizanunciostoca", appId: null };
  const body = receiptBody({
    ...expected,
    schemaVersion: 1,
    producer: "ORCHESTRATOR_CONNECTOR_READBACK",
    serviceId: STAGING_SERVICE,
    mode: NODE_MODE,
    maximumDeployments: 1,
    observedAt: "2026-10-23T04:19:30Z",
  });
  const comment = {
    id: 123,
    body,
    user: { id: actor.id, login: actor.login },
    performed_via_github_app: null,
    created_at: "2026-10-23T04:19:40Z",
    updated_at: "2026-10-23T04:19:40Z",
    issue_url:
      "https://api.github.com/repos/luizanunciostoca/touristic-digital-platform/issues/1072",
  };
  const reference = {
    commentId: 123,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
  return {
    comment,
    reference,
    options: {
      actor,
      expected,
      now,
      fetchComment: async () => structuredClone(comment),
      listComments: async () => ({
        complete: true,
        comments: [structuredClone(comment)],
      }),
    },
  };
}
test("authenticated comment transport does not claim CI queried Render", async () => {
  const { reference, options } = receiptFixture();
  const result = await verifyConnectorReceipt(reference, options);
  assert.equal(result.transportVerified, true);
  assert.equal(result.providerQueriedByCi, false);
  assert.equal(result.publicationAuthorized, false);
});
for (const [name, mutate] of [
  [
    "actor drift",
    (f) => {
      f.comment.user.id = 1;
    },
  ],
  [
    "app provenance drift",
    (f) => {
      f.comment.performed_via_github_app = { id: 1 };
    },
  ],
  [
    "edited comment",
    (f) => {
      f.comment.updated_at = "2026-10-23T04:19:50Z";
    },
  ],
  [
    "raw bytes drift",
    (f) => {
      f.comment.body += " ";
    },
  ],
  [
    "wrong tower",
    (f) => {
      f.comment.issue_url = f.comment.issue_url.replace("1072", "1");
    },
  ],
  [
    "request mismatch",
    (f) => {
      f.options.expected.runId = 13;
    },
  ],
  [
    "incomplete pagination",
    (f) => {
      f.options.listComments = async () => ({
        complete: false,
        comments: [f.comment],
      });
    },
  ],
  [
    "duplicate grant",
    (f) => {
      f.options.listComments = async () => ({
        complete: true,
        comments: [f.comment, { ...f.comment, id: 124 }],
      });
    },
  ],
  [
    "revocation",
    (f) => {
      f.options.listComments = async () => ({
        complete: true,
        comments: [
          f.comment,
          {
            ...f.comment,
            id: 125,
            body: receiptBody({
              authorizationId: "one-staging-publication",
              phase: "revoked",
            }),
          },
        ],
      });
    },
  ],
  [
    "reread drift",
    (f) => {
      let reads = 0;
      f.options.fetchComment = async () => ({
        ...f.comment,
        body: f.comment.body + (reads++ ? " " : ""),
      });
    },
  ],
])
  test(name + " rejects receipt", async () => {
    const f = receiptFixture();
    mutate(f);
    await assert.rejects(verifyConnectorReceipt(f.reference, f.options));
  });

import { verifyOciAcceptanceRun } from "./staging-node-exception.mjs";
function ociFixture() {
  const run = {
    id: 42,
    head_sha: sha,
    path: ".github/workflows/final-release-acceptance.yml",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    run_attempt: 2,
  };
  const artifact = {
    id: 9,
    name: "final-release-acceptance-evidence-42-2",
    expired: false,
  };
  const evidence = {
    expectedSha: sha,
    acceptanceRunId: "42",
    acceptanceRunAttempt: "2",
    mode: "oci-immutable",
    productionEligible: true,
    pagesEligible: true,
    imageDigest: "sha256:" + "e".repeat(64),
    imageRunId: "40",
  };
  const options = {
    runId: 42,
    sourceSha: sha,
    consumer: "production",
    readRun: async () => structuredClone(run),
    listArtifacts: async () => ({ complete: true, items: [artifact] }),
    readEvidence: async () => evidence,
  };
  return { run, artifact, evidence, options };
}
test("consumer verifies one current-attempt artifact and exact successful run", async () => {
  const f = ociFixture();
  assert.equal((await verifyOciAcceptanceRun(f.options)).runAttempt, 2);
});
for (const [name, mutate] of [
  [
    "Node acceptance",
    (f) => {
      f.evidence.mode = NODE_MODE;
      f.evidence.productionEligible = false;
    },
  ],
  [
    "wrong evidence run",
    (f) => {
      f.evidence.acceptanceRunId = "43";
    },
  ],
  [
    "wrong evidence attempt",
    (f) => {
      f.evidence.acceptanceRunAttempt = "1";
    },
  ],
  [
    "old artifact attempt",
    (f) => {
      f.artifact.name = "final-release-acceptance-evidence-42-1";
    },
  ],
  [
    "expired artifact",
    (f) => {
      f.artifact.expired = true;
    },
  ],
  [
    "different candidate",
    (f) => {
      f.run.head_sha = "e".repeat(40);
    },
  ],
  [
    "wrong workflow",
    (f) => {
      f.run.path = ".github/workflows/other.yml";
    },
  ],
  [
    "duplicate artifact",
    (f) => {
      f.options.listArtifacts = async () => ({
        complete: true,
        items: [f.artifact, f.artifact],
      });
    },
  ],
  [
    "incomplete artifact listing",
    (f) => {
      f.options.listArtifacts = async () => ({
        complete: false,
        items: [f.artifact],
      });
    },
  ],
])
  test(name + " cannot authorize downstream dispatch", async () => {
    const f = ociFixture();
    mutate(f);
    let mutations = 0;
    await assert.rejects(async () => {
      await verifyOciAcceptanceRun(f.options);
      mutations++;
    });
    assert.equal(mutations, 0);
  });

import { dispatchNodeWithReservation } from "./staging-node-exception.mjs";
async function dispatchFixture() {
  const f = receiptFixture();
  const payload = JSON.parse(f.comment.body.split("\n").slice(1).join("\n"));
  payload.preflight = {
    configurationPreserved: true,
    recovery: {
      status: "PROVEN",
      candidateSha: sha,
      backupRef: "retained-backup",
      restoreRef: "restore-proof",
      rollbackRef: "rollback-proof",
      mutationInventoryRef: "wrapper-and-predeploy-inventory",
    },
  };
  f.comment.body = receiptBody(payload);
  f.reference.sha256 = createHash("sha256")
    .update(f.comment.body)
    .digest("hex");
  const receipt = await verifyConnectorReceipt(f.reference, f.options),
    refs = new Map();
  let posts = 0;
  const options = {
    policy: {
      enabled: true,
      authorizationId: payload.authorizationId,
      expiresAt: "2026-10-23T05:00:00Z",
    },
    receipt,
    expected: f.options.expected,
    now,
    refStore: {
      getRef: async (ref) => refs.get(ref) ?? null,
      createRef: async (ref, source) => {
        if (refs.has(ref)) throw Error("exists");
        refs.set(ref, { sha: source });
      },
    },
    postHook: async () => {
      posts++;
      return { deploymentId: "dep-created" };
    },
  };
  return {
    options,
    refs,
    getPosts: () => posts,
    setHook: (fn) => {
      options.postHook = async () => {
        posts++;
        return fn();
      };
    },
  };
}
test("reserve before one hook POST; subsequent calls cannot replay", async () => {
  const f = await dispatchFixture();
  const result = await dispatchNodeWithReservation(f.options);
  assert.equal(result.state, "DISPATCH_ACCEPTED_NOT_LIVE");
  assert.equal(f.refs.size, 1);
  assert.equal(f.getPosts(), 1);
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /ALREADY_RESERVED/,
  );
  assert.equal(f.getPosts(), 1);
});
test("timeout after hook acceptance never produces a second POST", async () => {
  const f = await dispatchFixture();
  f.setHook(() => {
    throw Error("accepted but response lost");
  });
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /OUTCOME_UNCERTAIN_RECONCILE/,
  );
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /ALREADY_RESERVED/,
  );
  assert.equal(f.getPosts(), 1);
});
test("missing provider ID remains reserved and requires reconciliation", async () => {
  const f = await dispatchFixture();
  f.setHook(() => ({}));
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /ID_MISSING_RECONCILE/,
  );
  assert.equal(f.getPosts(), 1);
  assert.equal(f.refs.size, 1);
});
test("new run cannot reuse prior receipt", async () => {
  const f = await dispatchFixture();
  f.options.expected = { ...f.options.expected, runId: 13 };
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /DISPATCH_IDENTITY/,
  );
  assert.equal(f.getPosts(), 0);
});
test("JSON copying a verified receipt cannot manufacture dispatch authority", async () => {
  const f = await dispatchFixture();
  f.options.receipt = structuredClone(f.options.receipt);
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /AUTHENTICATED_RECEIPT_REQUIRED/,
  );
  assert.equal(f.getPosts(), 0);
});
test("uncertain reservation outcome forbids hook POST", async () => {
  const f = await dispatchFixture();
  f.options.refStore.createRef = async () => {
    throw Error("timeout");
  };
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /RESERVATION_UNCERTAIN/,
  );
  assert.equal(f.getPosts(), 0);
});
test("disabled policy never reserves or sends a POST", async () => {
  const f = await dispatchFixture();
  f.options.policy.enabled = false;
  await assert.rejects(
    dispatchNodeWithReservation(f.options),
    /DISPATCH_DISABLED/,
  );
  assert.equal(f.getPosts(), 0);
  assert.equal(f.refs.size, 0);
});

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  nodeRuntime,
  configurationFingerprint,
} from "./staging-node-exception.mjs";

for (const providerOutcome of ["accepted", "redirect"])
  test(
    "operational dispatch adapter reserves before its only POST and never writes provider configuration: " +
      providerOutcome,
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "tdp-node-adapter-")),
        oldCwd = process.cwd(),
        originalFetch = globalThis.fetch,
        oldEnv = { ...process.env };
      try {
        execFileSync("git", ["init", "-q", dir]);
        execFileSync("git", [
          "-C",
          dir,
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "commit",
          "--allow-empty",
          "-qm",
          "fixture",
        ]);
        const sourceSha = execFileSync(
          "git",
          ["-C", dir, "rev-parse", "HEAD"],
          {
            encoding: "utf8",
          },
        ).trim();
        const treeSha = execFileSync(
          "git",
          ["-C", dir, "rev-parse", "HEAD^{tree}"],
          { encoding: "utf8" },
        ).trim();
        mkdirSync(join(dir, "tooling/ci"), { recursive: true });
        const policy = {
          enabled: true,
          authorizationId: "fixture-only",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          receiptActor: {
            id: 318748875,
            login: "luizanunciostoca",
            appId: 1144995,
          },
        };
        writeFileSync(
          join(dir, "tooling/ci/staging-node-exception.json"),
          JSON.stringify(policy),
        );
        const snapshot = {
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
        const timestamp = new Date().toISOString();
        const payload = {
          schemaVersion: 1,
          producer: "ORCHESTRATOR_CONNECTOR_READBACK",
          phase: "pre-deploy",
          authorizationId: "fixture-only",
          requestId: "fixture-request",
          sourceSha,
          treeSha,
          runId: 12,
          runAttempt: 1,
          callerRunId: 10,
          callerRunAttempt: 1,
          serviceId: STAGING_SERVICE,
          mode: NODE_MODE,
          maximumDeployments: 1,
          observedAt: timestamp,
          preflight: {
            configurationPreserved: true,
            serviceSnapshot: snapshot,
            configurationFingerprint: configurationFingerprint(snapshot),
            previousProviderDeploymentId: "dep-old",
            previousRuntime: {
              releaseSha: "e".repeat(40),
              identity: "instance-old",
            },
            recovery: {
              status: "PROVEN",
              candidateSha: sourceSha,
              retainedBackup: true,
              wrapperAndPredeployCovered: true,
              codeRollbackDoesNotUndoData: true,
              backupRef: "fixture-backup",
              restoreRef: "fixture-restore",
              rollbackRef: "fixture-rollback",
              mutationInventoryRef: "fixture-inventory",
            },
          },
        };
        const comment = {
          id: 123,
          body: receiptBody(payload),
          user: { id: 318748875, login: "luizanunciostoca" },
          performed_via_github_app: { id: 1144995 },
          created_at: timestamp,
          updated_at: timestamp,
          issue_url:
            "https://api.github.com/repos/luizanunciostoca/touristic-digital-platform/issues/1072",
        };
        process.chdir(dir);
        Object.assign(process.env, {
          GITHUB_REPOSITORY: "luizanunciostoca/touristic-digital-platform",
          GITHUB_RUN_ID: "12",
          GITHUB_RUN_ATTEMPT: "1",
          EXPECTED_SHA: sourceSha,
          REQUEST_ID: "fixture-request",
          CALLER_RUN_ID: "10",
          CALLER_RUN_ATTEMPT: "1",
          GH_TOKEN: "fixture-token",
          RENDER_STAGING_DEPLOY_HOOK_URL:
            "https://api.render.com/deploy/" + STAGING_SERVICE + "?key=fixture",
        });
        const mutations = [];
        let reserved = false,
          hookPosts = 0,
          callerReads = 0,
          callerDrift = null,
          listingReads = 0,
          revokeAfterPoll = false,
          barrierJob = null;
        globalThis.fetch = async (input, options = {}) => {
          const url = String(input),
            method = options.method ?? "GET";
          const response = (body, status = 200) =>
            new Response(JSON.stringify(body), {
              status,
              headers: { "Content-Type": "application/json" },
            });
          if (method !== "GET") mutations.push({ url, method });
          if (url.includes("/attempts/1/jobs"))
            return response({ jobs: [barrierJob] });
          if (url.includes("/actions/jobs/")) return response(barrierJob);
          if (url.includes("/actions/runs/")) {
            const id = Number(url.split("/").at(-1));
            if (id === 10) callerReads++;
            const drift = id === 10 && callerReads > 1 ? callerDrift : null;
            return response({
              id,
              path:
                ".github/workflows/" +
                (id === 10
                  ? "final-release-acceptance.yml"
                  : "staging-render-promotion.yml"),
              head_sha: sourceSha,
              event: "workflow_dispatch",
              run_attempt: drift === "new-attempt" ? 2 : 1,
              head_branch: "main",
              status:
                drift && drift !== "new-attempt" ? "completed" : "in_progress",
              conclusion: drift && drift !== "new-attempt" ? drift : null,
            });
          }
          if (url.endsWith("/commits/main"))
            return response({ sha: sourceSha });
          if (url.includes("/issues/comments/")) return response(comment);
          if (url.includes("/issues/1072/comments?")) {
            listingReads++;
            return response(
              revokeAfterPoll && listingReads > 2
                ? [
                    comment,
                    {
                      ...comment,
                      id: 125,
                      body: receiptBody({ ...payload, phase: "revoked" }),
                    },
                  ]
                : [comment],
            );
          }
          if (url.includes("/git/ref/"))
            return reserved
              ? response({ object: { sha: sourceSha } })
              : response({}, 404);
          if (url.endsWith("/git/refs") && method === "POST") {
            assert.equal(reserved, false);
            reserved = true;
            return response({});
          }
          if (
            url.startsWith("https://api.render.com/deploy/") &&
            method === "POST"
          ) {
            assert.equal(reserved, true);
            assert.equal(options.redirect, "error");
            assert.equal(new URL(url).searchParams.get("ref"), sourceSha);
            hookPosts++;
            if (providerOutcome === "redirect") return response({}, 302);
            return response({ deploy: { id: "dep-fixture" } });
          }
          throw Error("UNEXPECTED_PROVIDER_OR_GITHUB_OPERATION");
        };
        process.env.RENDER_STAGING_DEPLOY_HOOK_URL =
          "https://api.render.com/deploy/srv-wrong?key=fixture";
        await assert.rejects(nodeRuntime("node-dispatch"), /NODE_HOOK_SERVICE/);
        assert.equal(hookPosts, 0);
        process.env.RENDER_STAGING_DEPLOY_HOOK_URL =
          "https://api.render.com/deploy/" + STAGING_SERVICE + "?key=fixture";
        for (const drift of ["cancelled", "failure", "new-attempt"]) {
          callerReads = 0;
          callerDrift = drift;
          await assert.rejects(
            nodeRuntime("node-dispatch"),
            /NODE_CALLER_(NOT_RUNNING|ATTEMPT)/,
          );
          assert.equal(reserved, false);
          assert.equal(hookPosts, 0);
        }
        callerReads = 0;
        callerDrift = null;
        listingReads = 0;
        revokeAfterPoll = true;
        await assert.rejects(nodeRuntime("node-dispatch"), /RECEIPT_REVOKED/);
        assert.equal(reserved, false);
        assert.equal(hookPosts, 0);
        ((revokeAfterPoll = false), (barrierJob = null));
        listingReads = 0;
        callerReads = 0;
        if (providerOutcome === "redirect") {
          await assert.rejects(
            nodeRuntime("node-dispatch"),
            /NODE_DISPATCH_NOT_PROVEN_RECONCILE/,
          );
          assert.equal(hookPosts, 1);
          assert.equal(reserved, true);
          await assert.rejects(
            nodeRuntime("node-dispatch"),
            /NODE_DISPATCH_NOT_PROVEN_RECONCILE/,
          );
          assert.equal(hookPosts, 1);
          return;
        }
        await nodeRuntime("node-dispatch");
        const outcome = JSON.parse(
          readFileSync(join(dir, "staging-node-dispatch.json"), "utf8"),
        );
        assert.equal(outcome.state, "DISPATCH_ACCEPTED_NOT_LIVE");
        const dispatchBytes = readFileSync(
          join(dir, "staging-node-dispatch.json"),
        );
        const savedDispatch = join(dir, "original-dispatch.json");
        writeFileSync(savedDispatch, dispatchBytes);
        barrierJob = {
          id: 888,
          name: "staging / external provider and runtime verification",
          run_id: 13,
          run_attempt: 1,
          head_sha: sourceSha,
          started_at: new Date().toISOString(),
          status: "in_progress",
        };
        Object.assign(process.env, {
          GITHUB_RUN_ID: "13",
          GITHUB_JOB: "verify",
        });
        await nodeRuntime("node-verification-barrier");
        const barrierRaw = readFileSync(
          join(dir, "staging-node-verification-barrier.json"),
        );
        const barrierArtifact = {
          id: 199,
          name: "staging-node-verification-barrier-13-1",
          expired: false,
          created_at: new Date().toISOString(),
          workflow_run: { id: 13, head_sha: sourceSha },
        };
        const verificationBarrier = verificationBarrierBinding({
          raw: barrierRaw,
          artifact: barrierArtifact,
          job: barrierJob,
          attemptJobs: [barrierJob],
          expected: {
            sourceSha,
            treeSha,
            authorizationId: "fixture-only",
            requestId: "fixture-request",
            verification: {
              runId: 13,
              runAttempt: 1,
              callerRunId: 10,
              callerRunAttempt: 1,
            },
          },
          now: new Date().toISOString(),
        });
        const observedAt = new Date().toISOString(),
          observation = fixture().evidence;
        Object.assign(observation, {
          sourceSha,
          treeSha,
          authorizationId: "fixture-only",
          reservationId: outcome.reservationRef,
        });
        Object.assign(observation.workflow, {
          runId: 12,
          runAttempt: 1,
          callerRunId: 10,
          callerRunAttempt: 1,
          headSha: sourceSha,
          requestId: "fixture-request",
        });
        Object.assign(observation.artifact, {
          id: 99,
          name: "staging-node-dispatch-12-1",
          runId: 12,
          runAttempt: 1,
        });
        Object.assign(observation.provider, {
          deploymentId: "dep-fixture",
          latestDeploymentId: "dep-fixture",
          commitSha: sourceSha,
          configurationFingerprint: configurationFingerprint(snapshot),
          createdAt: outcome.dispatchAt,
          liveAt: outcome.dispatchAt,
        });
        Object.assign(observation.runtime, {
          releaseSha: sourceSha,
          observedAt,
        });
        observation.origin.observedAt = observedAt;
        observation.externalEvidence.capturedAt = observedAt;
        Object.assign(observation.externalEvidence.items[0], {
          identity: STAGING_SERVICE + ":dep-fixture:" + sourceSha,
          observedAt,
        });
        const post = {
          ...comment,
          id: 124,
          created_at: observedAt,
          updated_at: observedAt,
          body: receiptBody({
            ...payload,
            phase: "post-deploy",
            verification: {
              runId: 13,
              runAttempt: 1,
              callerRunId: 10,
              callerRunAttempt: 1,
            },
            verificationId: "13:1",
            verificationBarrier,
            supersedesReceiptId: null,
            observedAt,
            preReceiptId: outcome.preReceiptId,
            preReceiptSha256: outcome.preReceiptSha256,
            dispatchArtifactId: 99,
            dispatchSha256: createHash("sha256")
              .update(dispatchBytes)
              .digest("hex"),
            observation,
          }),
        };
        const dispatchFetch = globalThis.fetch;
        globalThis.fetch = async (input, options = {}) => {
          const url = String(input),
            response = (body) =>
              new Response(JSON.stringify(body), {
                headers: { "Content-Type": "application/json" },
              });
          if (url.includes("/actions/runs/13/artifacts"))
            return response({ artifacts: [barrierArtifact] });
          if (url.includes("/actions/runs/12/artifacts"))
            return response({
              artifacts: [
                { id: 99, name: "staging-node-dispatch-12-1", expired: false },
              ],
            });
          if (url.includes("/issues/1072/comments?"))
            return response([comment, post]);
          if (url.endsWith("/issues/comments/124")) return response(post);
          return dispatchFetch(input, options);
        };
        const bin = join(dir, "bin");
        mkdirSync(bin);
        const fakeGh = join(bin, "gh");
        writeFileSync(
          fakeGh,
          '#!/usr/bin/env node\nconst fs=require("node:fs"),path=require("node:path");const i=process.argv.indexOf("--dir"),n=process.argv[process.argv.indexOf("--name")+1];if(i<0)process.exit(2);const barrier=n.startsWith("staging-node-verification-barrier-");fs.copyFileSync(barrier?process.env.FIXTURE_BARRIER:process.env.FIXTURE_DISPATCH,path.join(process.argv[i+1],barrier?"staging-node-verification-barrier.json":"staging-node-dispatch.json"));\n',
        );
        const { chmodSync } = await import("node:fs");
        chmodSync(fakeGh, 0o755);
        Object.assign(process.env, {
          PATH: bin + ":" + process.env.PATH,
          FIXTURE_DISPATCH: savedDispatch,
          FIXTURE_BARRIER: join(dir, "staging-node-verification-barrier.json"),
          GITHUB_RUN_ID: "13",
          DISPATCH_RUN_ID: "12",
          DISPATCH_RUN_ATTEMPT: "1",
        });
        delete process.env.RENDER_STAGING_DEPLOY_HOOK_URL;
        await nodeRuntime("node-verify");
        const verified = JSON.parse(
          readFileSync(join(dir, "staging-deployment-evidence.json"), "utf8"),
        );
        assert.equal(verified.verificationRunId, 13);
        assert.equal(verified.mode, NODE_MODE);
        assert.equal(verified.productionEligible, false);
        assert.equal(verified.pagesEligible, false);
        assert.equal(hookPosts, 1);
        Object.assign(process.env, {
          GITHUB_RUN_ID: "12",
          RENDER_STAGING_DEPLOY_HOOK_URL:
            "https://api.render.com/deploy/" + STAGING_SERVICE + "?key=fixture",
        });

        assert.equal(hookPosts, 1);
        await assert.rejects(
          nodeRuntime("node-dispatch"),
          /NODE_DISPATCH_NOT_PROVEN_RECONCILE/,
        );
        assert.equal(hookPosts, 1);
        assert.equal(
          mutations.filter((x) => x.url.includes("api.render.com")).length,
          1,
        );
        assert.ok(
          mutations.every(
            (x) =>
              x.method === "POST" &&
              (x.url.endsWith("/git/refs") || x.url.includes("/deploy/")),
          ),
        );
      } finally {
        globalThis.fetch = originalFetch;
        process.chdir(oldCwd);
        for (const key of Object.keys(process.env))
          if (!(key in oldEnv)) delete process.env[key];
        Object.assign(process.env, oldEnv);
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

import {
  canonicalNodeHook,
  verifyNodeAcceptanceRun,
} from "./staging-node-exception.mjs";
for (const [name, suffix] of [
  ["imageURL", "?key=fixture&imageURL=forbidden"],
  ["duplicate key", "?key=one&key=two"],
  ["existing ref", "?key=fixture&ref=other"],
  ["unknown query", "?key=fixture&extra=x"],
  ["fragment", "?key=fixture#redirect"],
  ["missing key", ""],
])
  test("canonical hook rejects " + name, () =>
    assert.throws(() =>
      canonicalNodeHook(
        "https://api.render.com/deploy/" + STAGING_SERVICE + suffix,
        sha,
      ),
    ),
  );
test("canonical hook rejects non-default port and constructs only key plus exact ref", () => {
  assert.throws(() =>
    canonicalNodeHook(
      "https://api.render.com:444/deploy/" + STAGING_SERVICE + "?key=fixture",
      sha,
    ),
  );
  const u = canonicalNodeHook(
    "https://api.render.com/deploy/" + STAGING_SERVICE + "?key=fixture",
    sha,
  );
  assert.deepEqual([...u.searchParams.keys()], ["key", "ref"]);
  assert.equal(u.searchParams.get("ref"), sha);
});

function postFixture() {
  const f = receiptFixture();
  const base = JSON.parse(f.comment.body.split("\n").slice(1).join("\n"));
  const verification = {
    runId: 14,
    runAttempt: 1,
    callerRunId: 11,
    callerRunAttempt: 1,
  };
  const barrier = barrierFixture(verification);
  const observation = fixture().evidence;
  const payload = {
    ...base,
    phase: "post-deploy",
    verification,
    verificationBarrier: barrier.binding,
    verificationId: "14:1",
    supersedesReceiptId: null,
    preReceiptId: 120,
    preReceiptSha256: "d".repeat(64),
    dispatchArtifactId: 99,
    dispatchSha256: "e".repeat(64),
    observation,
  };
  f.comment.body = receiptBody(payload);
  f.reference.sha256 = createHash("sha256")
    .update(f.comment.body)
    .digest("hex");
  f.options.expected = {
    ...f.options.expected,
    phase: "post-deploy",
    verification: structuredClone(verification),
    verificationBarrier: barrier.binding,
  };
  const comments = [f.comment];
  f.options.listComments = async () => ({
    complete: true,
    comments: structuredClone(comments),
  });
  f.options.fetchComment = async (id) =>
    structuredClone(comments.find((c) => c.id === id));
  return { ...f, payload, comments, barrier };
}
test("post observation can supersede a stale immutable observation of the same dispatch", async () => {
  const f = postFixture();
  const old = {
    ...f.comment,
    id: 122,
    created_at: "2026-10-23T04:00:00Z",
    updated_at: "2026-10-23T04:00:00Z",
    body: receiptBody({
      ...f.payload,
      observedAt: "2026-10-23T03:59:59Z",
      verification: { ...f.payload.verification, runId: 13 },
      verificationId: "13:1",
    }),
  };
  f.comments.unshift(old);
  f.payload.supersedesReceiptId = 122;
  f.comment.body = receiptBody(f.payload);
  f.reference.sha256 = createHash("sha256")
    .update(f.comment.body)
    .digest("hex");
  assert.equal(
    (await verifyConnectorReceipt(f.reference, f.options)).commentId,
    123,
  );
});
for (const [name, mutate] of [
  [
    "forked supersession",
    (f) => {
      f.payload.supersedesReceiptId = 999;
    },
  ],
  [
    "wrong verification caller",
    (f) => {
      f.payload.verification.callerRunId = 19;
    },
  ],
  [
    "stale post observation",
    (f) => {
      f.payload.observedAt = "2026-10-23T04:00:00Z";
    },
  ],
  [
    "verification ID drift",
    (f) => {
      f.payload.verificationId = "15:1";
    },
  ],
])
  test("post observation rejects " + name, async () => {
    const f = postFixture();
    mutate(f);
    f.comment.body = receiptBody(f.payload);
    f.reference.sha256 = createHash("sha256")
      .update(f.comment.body)
      .digest("hex");
    await assert.rejects(verifyConnectorReceipt(f.reference, f.options));
  });
test("supersession never makes an older receipt current again", async () => {
  const f = postFixture();
  const next = {
    ...f.comment,
    id: 124,
    body: receiptBody({
      ...f.payload,
      verificationId: "15:1",
      verification: { ...f.payload.verification, runId: 15 },
      supersedesReceiptId: 123,
    }),
  };
  f.comments.push(next);
  await assert.rejects(
    verifyConnectorReceipt(f.reference, f.options),
    /RECEIPT_SUPERSEDED/,
  );
});
function nodeAcceptanceFixture() {
  const f = postFixture();
  const evidence = {
    ...structuredClone(f.payload.observation),
    verification: f.payload.verification,
    verificationBarrier: f.barrier.binding,
    evidenceStates: ["CI_VERIFIED", "CONNECTOR_OBSERVED", "RUNTIME_OBSERVED"],
    postReceiptId: 123,
    postReceiptSha256: f.reference.sha256,
    preReceiptId: f.payload.preReceiptId,
    preReceiptSha256: f.payload.preReceiptSha256,
    dispatchArtifactId: 99,
    verificationRunId: 14,
    verificationRunAttempt: 1,
  };
  const run = {
    id: 14,
    path: ".github/workflows/staging-render-promotion.yml",
    event: "workflow_dispatch",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    run_attempt: 1,
  };
  const options = {
    runId: 14,
    sourceSha: sha,
    treeSha: tree,
    callerRunId: 11,
    callerRunAttempt: 1,
    now,
    actor: f.options.actor,
    fetchComment: f.options.fetchComment,
    listComments: f.options.listComments,
    readRun: async () => structuredClone(run),
    readBarrier: async () => f.barrier.raw,
    readJob: async () => f.barrier.job,
    listJobs: async (id, attempt) => {
      assert.equal(id, 14);
      assert.equal(attempt, 1);
      return [f.barrier.job];
    },
    listArtifacts: async () => ({
      complete: true,
      items: [
        { id: 100, name: "staging-node-verified-14-1", expired: false },
        f.barrier.artifact,
      ],
    }),
    readEvidence: async () => evidence,
  };
  return { ...f, evidence, run, acceptanceOptions: options };
}
test("FRA revalidates fresh authenticated observation tied to current acceptance caller", async () => {
  const f = nodeAcceptanceFixture();
  const result = await verifyNodeAcceptanceRun(f.acceptanceOptions);
  assert.equal(result.acceptanceRunId, "11");
  assert.equal(result.workflow.callerRunId, 10);
});
for (const [name, mutate] of [
  [
    "historical same-SHA caller",
    (f) => {
      f.acceptanceOptions.callerRunId = 99;
    },
  ],
  [
    "expired observation in retained artifact",
    (f) => {
      f.acceptanceOptions.now = "2026-10-23T04:26:00Z";
    },
  ],
  [
    "revoked after child verification",
    (f) => {
      f.comments.push({
        ...f.comment,
        id: 124,
        body: receiptBody({ ...f.payload, phase: "revoked" }),
      });
    },
  ],
  [
    "modified runtime in artifact",
    (f) => {
      f.evidence.runtime = { ...f.evidence.runtime, identity: "forged" };
    },
  ],
  [
    "wrong current attempt",
    (f) => {
      f.acceptanceOptions.callerRunAttempt = 2;
    },
  ],
  [
    "stale runtime with fresh provider",
    (f) => {
      f.evidence.runtime.observedAt = "2026-10-23T04:00:00Z";
    },
  ],
])
  test("FRA rejects " + name, async () => {
    const f = nodeAcceptanceFixture();
    mutate(f);
    await assert.rejects(verifyNodeAcceptanceRun(f.acceptanceOptions));
  });

test("intervening provider deployment fails current runtime acceptance", () => {
  const f = fixture();
  f.evidence.provider.latestDeploymentId = "dep-intervening";
  assert.throws(
    () => validateExternalNodeObservation(f.evidence, f.expected, { now }),
    /NODE_INTERVENING_DEPLOYMENT/,
  );
});
test("production prerequisite shell rejects Node evidence before any workflow dispatch", () => {
  const root = process.cwd(),
    dir = mkdtempSync(join(tmpdir(), "node-production-guard-"));
  try {
    const workflow = readFileSync(
      join(root, ".github/workflows/production-oci-promotion.yml"),
      "utf8",
    );
    const step = workflow
      .split("      - name: Resolve and execute prerequisite proof graph\n")[1]
      .split("\n      - name:")[0];
    const script = step
      .split("        run: |\n")[1]
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n");
    const gh = join(dir, "gh"),
      log = join(dir, "calls.log");
    const executable = `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_CALLS,JSON.stringify(a)+'\\n');
const sha=process.env.EXPECTED_SHA;
if(a[0]==='workflow')process.exit(85);
if(a[0]==='run'&&a[1]==='list'){process.stdout.write(JSON.stringify([{databaseId:42,headSha:sha}]));}
else if(a[0]==='api'&&a.some(x=>x.includes('/artifacts'))){process.stdout.write(JSON.stringify([{artifacts:[{id:9,name:'final-release-acceptance-evidence-42-1',expired:false}]}]));}
else if(a[0]==='api'){process.stdout.write(JSON.stringify({id:42,head_sha:sha,path:'.github/workflows/final-release-acceptance.yml',event:'workflow_dispatch',status:'completed',conclusion:'success',run_attempt:1}));}
else if(a[0]==='run'&&a[1]==='download'){const d=a[a.indexOf('--dir')+1];fs.writeFileSync(path.join(d,'final-release-staging-target-evidence.json'),JSON.stringify({expectedSha:sha,acceptanceRunId:'42',acceptanceRunAttempt:'1',mode:'staging-node-rebuild',productionEligible:false,pagesEligible:false}));}
else process.exit(86);
`;
    writeFileSync(gh, executable, { mode: 0o755 });
    assert.throws(
      () =>
        execFileSync("bash", ["-c", script], {
          cwd: root,
          env: {
            ...process.env,
            PATH: dir + ":" + process.env.PATH,
            FIXTURE_CALLS: log,
            EXPECTED_SHA: sha,
            GITHUB_REPOSITORY: "luizanunciostoca/touristic-digital-platform",
            GH_TOKEN: "fixture",
          },
          stdio: ["ignore", "pipe", "pipe"],
        }),
      (error) => String(error.stderr).includes("ACCEPTANCE_MODE_GATE_FAILED"),
    );
    const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(calls.every((a) => a[0] !== "workflow"));
    assert.ok(
      calls
        .filter((a) => a[0] === "run" && a[1] === "list")
        .every((a) => a.includes("final-release-acceptance.yml")),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("both Node terminal-verification paths use the OCI service lock, parent does not", () => {
  const workflow = readFileSync(
    ".github/workflows/staging-render-promotion.yml",
    "utf8",
  );
  const deploy = workflow.split("\n  deploy:\n")[1].split("\n  verify:\n")[0];
  const verify = workflow.split("\n  verify:\n")[1];
  for (const job of [deploy, verify]) {
    assert.match(job, /group: render-staging-srv-da4hb6c9v7es7386ttt0/);
    assert.match(job, /cancel-in-progress: false/);
    assert.match(
      job,
      /node tooling\/ci\/staging-node-exception.mjs node-verify/,
    );
  }
  assert.ok(deploy.indexOf("node-dispatch") < deploy.indexOf("node-verify"));
  assert.ok(!verify.includes("RENDER_STAGING_DEPLOY_HOOK_URL"));
  assert.ok(!verify.includes("environment:"));
  const parent = readFileSync(
    ".github/workflows/final-release-acceptance.yml",
    "utf8",
  );
  assert.ok(!parent.includes("group: render-staging-srv-da4hb6c9v7es7386ttt0"));
});

test("FRA fails when receipt expires during authenticated readback", async () => {
  const f = nodeAcceptanceFixture();
  let calls = 0;
  f.acceptanceOptions.clock = () =>
    ++calls <= 2 ? now : "2026-10-23T04:26:00Z";
  await assert.rejects(
    verifyNodeAcceptanceRun(f.acceptanceOptions),
    /NODE_ACCEPTANCE_EXPIRED_DURING_READBACK/,
  );
});

import {
  verificationBarrierBinding,
  assertObservationAfterBarrier,
} from "./staging-node-exception.mjs";
function barrierFixture(
  verification = {
    runId: 14,
    runAttempt: 1,
    callerRunId: 11,
    callerRunAttempt: 1,
  },
) {
  const marker = {
    schemaVersion: 1,
    kind: "STAGING_NODE_VERIFICATION_BARRIER",
    sourceSha: sha,
    treeSha: tree,
    authorizationId: "one-staging-publication",
    requestId: "request-10-1",
    verification,
    jobKey: "verify",
    jobName: "staging / external provider and runtime verification",
    jobId: 888,
    jobStartedAt: "2026-10-23T04:19:15Z",
    recordedAt: "2026-10-23T04:19:20Z",
  };
  const raw = JSON.stringify(marker);
  const job = {
    id: 888,
    name: marker.jobName,
    run_id: verification.runId,
    run_attempt: verification.runAttempt,
    head_sha: sha,
    started_at: marker.jobStartedAt,
    status: "completed",
    conclusion: "success",
  };
  const artifact = {
    id: 199,
    name: `staging-node-verification-barrier-${verification.runId}-${verification.runAttempt}`,
    expired: false,
    created_at: "2026-10-23T04:19:21Z",
    workflow_run: { id: verification.runId, head_sha: sha },
  };
  const expected = {
    sourceSha: sha,
    treeSha: tree,
    authorizationId: marker.authorizationId,
    requestId: marker.requestId,
    verification,
  };
  const binding = verificationBarrierBinding({
    raw,
    job,
    artifact,
    attemptJobs: [job],
    expected,
    now,
  });
  return { marker, raw, job, artifact, attemptJobs: [job], expected, binding };
}
test("verify queued behind OCI rejects fresh-in-age provider observation made before its lock barrier", () => {
  const f = fixture();
  f.expected.verificationBarrier = {
    ...f.expected.verificationBarrier,
    recordedAt: "2026-10-23T04:19:35Z",
  };
  assert.throws(
    () => validateExternalNodeObservation(f.evidence, f.expected, { now }),
    /NODE_PROVIDER_OBSERVATION_PREDATES_VERIFICATION_BARRIER/,
  );
});
test("verify queued behind OCI rejects runtime observation made before its lock barrier", () => {
  const f = fixture();
  f.evidence.origin.observedAt = "2026-10-23T04:19:50Z";
  f.evidence.externalEvidence.items[0].observedAt =
    f.evidence.origin.observedAt;
  f.expected.verificationBarrier = {
    ...f.expected.verificationBarrier,
    recordedAt: "2026-10-23T04:19:45Z",
  };
  assert.throws(
    () => validateExternalNodeObservation(f.evidence, f.expected, { now }),
    /NODE_RUNTIME_OBSERVATION_PREDATES_VERIFICATION_BARRIER/,
  );
});
test("post-lock continuation accepts fresh queries while retaining historical deployment timestamps", () => {
  const f = fixture();
  const b = barrierFixture();
  f.expected.verificationBarrier = b.binding;
  assert.ok(
    Date.parse(f.evidence.provider.createdAt) <
      Date.parse(b.binding.recordedAt),
  );
  assert.ok(
    Date.parse(f.evidence.provider.liveAt) < Date.parse(b.binding.recordedAt),
  );
  assert.equal(
    validateExternalNodeObservation(f.evidence, f.expected, { now })
      .contractValid,
    true,
  );
});
test("receipt observed before verifier lock barrier fails even if provider/runtime queries are later", () => {
  const f = fixture();
  assert.throws(
    () =>
      assertObservationAfterBarrier(
        f.evidence,
        "2026-10-23T04:19:19Z",
        f.expected.verificationBarrier,
      ),
    /NODE_RECEIPT_PREDATES_VERIFICATION_BARRIER/,
  );
});
for (const [name, mutate] of [
  [
    "workflow-start timestamp masquerading as post-lock marker",
    (f) => {
      f.marker.recordedAt = "2026-10-23T04:18:00Z";
    },
  ],
  [
    "other job",
    (f) => {
      f.job.id = 889;
    },
  ],
  [
    "queued job",
    (f) => {
      f.job.status = "queued";
    },
  ],
  [
    "wrong attempt",
    (f) => {
      f.job.run_attempt = 2;
    },
  ],
  [
    "wrong artifact run",
    (f) => {
      f.artifact.workflow_run.id = 99;
    },
  ],
  [
    "wrong source",
    (f) => {
      f.job.head_sha = "f".repeat(40);
    },
  ],
])
  test("authenticated barrier rejects " + name, () => {
    const f = barrierFixture();
    mutate(f);
    f.raw = JSON.stringify(f.marker);
    assert.throws(() => verificationBarrierBinding({ ...f, now }));
  });
test("FRA reauthenticates barrier and rejects pre-lock provider evidence retained in an artifact", async () => {
  const f = nodeAcceptanceFixture();
  f.payload.observation.origin.observedAt = "2026-10-23T04:19:19Z";
  f.payload.observation.externalEvidence.items[0].observedAt =
    f.payload.observation.origin.observedAt;
  f.evidence.origin = structuredClone(f.payload.observation.origin);
  f.evidence.externalEvidence = structuredClone(
    f.payload.observation.externalEvidence,
  );
  f.comment.body = receiptBody(f.payload);
  f.evidence.postReceiptSha256 = createHash("sha256")
    .update(f.comment.body)
    .digest("hex");
  await assert.rejects(
    verifyNodeAcceptanceRun(f.acceptanceOptions),
    /NODE_PROVIDER_OBSERVATION_PREDATES_VERIFICATION_BARRIER/,
  );
});

test("job attempt is authenticated through attempt-scoped membership when GET job omits run_attempt", () => {
  const f = barrierFixture();
  delete f.job.run_attempt;
  assert.equal(verificationBarrierBinding({ ...f, now }).jobId, 888);
});
test("job from another attempt cannot satisfy the marker", () => {
  const f = barrierFixture();
  f.attemptJobs = [];
  assert.throws(
    () => verificationBarrierBinding({ ...f, now }),
    /NODE_BARRIER_ATTEMPT_MEMBERSHIP/,
  );
});
