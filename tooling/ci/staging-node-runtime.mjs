import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  SHA,
  NODE_MODE,
  STAGING_SERVICE,
  time,
  stable,
  validateNodePreflight,
  validateExternalNodeObservation,
} from "./staging-node-contracts.mjs";
import { verifyConnectorReceipt } from "./staging-node-receipts.mjs";
import { verificationBarrierBinding } from "./staging-node-barrier.mjs";
import {
  canonicalNodeHook,
  dispatchNodeWithReservation,
} from "./staging-node-dispatch.mjs";
import {
  verifyOciAcceptanceRun,
  verifyNodeAcceptanceRun,
} from "./staging-node-acceptance.mjs";

const RECEIPT_PREFIX = "TDP_STAGING_NODE_RECEIPT_V1\n";
const VERIFICATION_JOBS = Object.freeze({
  deploy: "staging / single authorized Node dispatch",
  verify: "staging / external provider and runtime verification",
});

export async function runStagingNodeCli(args) {
  if (args[0] === "verify-node-run") {
    assert.equal(args.length, 3, "NODE_ACCEPTANCE_ARGUMENTS");
    return nodeAcceptanceCli(args[1], args[2]);
  }
  if (
    [
      "node-intent",
      "node-dispatch",
      "node-verification-barrier",
      "node-verify",
    ].includes(args[0])
  ) {
    assert.equal(args.length, 1, "NODE_COMMAND_ARGUMENTS");
    return nodeRuntime(args[0]);
  }
  assert.equal(args[0], "verify-oci-run", "NODE_EXCEPTION_COMMAND_DISABLED");
  assert.equal(args.length, 4, "OCI_ACCEPTANCE_ARGUMENTS");
  const [, id, sourceSha, consumer] = args,
    repo = process.env.GITHUB_REPOSITORY;
  assert.equal(
    repo,
    "luizanunciostoca/touristic-digital-platform",
    "ACCEPTANCE_REPOSITORY",
  );
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const gh = (argv) =>
    execFileSync("gh", argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    });
  const api = (path) => JSON.parse(gh(["api", path]));
  const result = await verifyOciAcceptanceRun({
    runId: Number(id),
    sourceSha,
    consumer,
    readRun: async (runId) => api("repos/" + repo + "/actions/runs/" + runId),
    listArtifacts: async (runId) => ({
      complete: true,
      items: JSON.parse(
        gh([
          "api",
          "--paginate",
          "--slurp",
          "repos/" +
            repo +
            "/actions/runs/" +
            runId +
            "/artifacts?per_page=100",
        ]),
      ).flatMap((p) => p.artifacts),
    }),
    readEvidence: async (runId, artifact) => {
      const dir = mkdtempSync(join(tmpdir(), "tdp-oci-acceptance-"));
      try {
        gh([
          "run",
          "download",
          String(runId),
          "--repo",
          repo,
          "--name",
          artifact.name,
          "--dir",
          dir,
        ]);
        return JSON.parse(
          readFileSync(
            join(dir, "final-release-staging-target-evidence.json"),
            "utf8",
          ),
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  });
  console.log(JSON.stringify(result));
}
export async function nodeRuntime(command) {
  const { readFileSync, writeFileSync, mkdtempSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const env = process.env,
    repo = "luizanunciostoca/touristic-digital-platform";
  assert.equal(env.GITHUB_REPOSITORY, repo, "NODE_REPOSITORY");
  const policy = JSON.parse(
    readFileSync("tooling/ci/staging-node-exception.json", "utf8"),
  );
  assert.equal(policy.enabled, true, "NODE_DISPATCH_DISABLED");
  assert.ok(policy.receiptActor, "NODE_ACTOR_POLICY_REQUIRED");
  const api = async (path, { method = "GET", body } = {}) => {
    const response = await fetch(
      "https://api.github.com/repos/" + repo + "/" + path,
      {
        method,
        headers: {
          Authorization: "Bearer " + env.GH_TOKEN,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw Error("GITHUB_API_HTTP_" + response.status);
    return response.json();
  };
  const pages = async (path, key) => {
    const items = [];
    for (let page = 1; page <= 100; page++) {
      const data = await api(
        path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page,
      );
      const values = key ? data[key] : data;
      assert.ok(Array.isArray(values), "GITHUB_LIST_INVALID");
      items.push(...values);
      if (values.length < 100) return items;
    }
    throw Error("GITHUB_LIST_INCOMPLETE");
  };
  const fetchComment = (id) => api("issues/comments/" + id);
  const listComments = async () => ({
    complete: true,
    comments: await pages("issues/1072/comments"),
  });
  const treeSha = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).trim();
  const sourceSha = env.EXPECTED_SHA;
  assert.match(sourceSha ?? "", SHA, "NODE_EXPECTED_SHA");
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceSha,
    "NODE_CHECKOUT_SHA",
  );
  const identity = {
    authorizationId: policy.authorizationId,
    requestId: env.REQUEST_ID,
    sourceSha,
    treeSha,
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    callerRunId: Number(env.CALLER_RUN_ID),
    callerRunAttempt: Number(env.CALLER_RUN_ATTEMPT),
  };
  const readRun = async (id, path) => {
    const r = await api("actions/runs/" + id);
    assert.equal(r.id, id, "NODE_RUN_ID");
    assert.equal(r.path, path, "NODE_RUN_PATH");
    assert.equal(r.head_sha, sourceSha, "NODE_RUN_HEAD");
    assert.equal(r.event, "workflow_dispatch", "NODE_RUN_EVENT");
    return r;
  };
  const caller = await readRun(
    identity.callerRunId,
    ".github/workflows/final-release-acceptance.yml",
  );
  assert.equal(
    caller.run_attempt,
    identity.callerRunAttempt,
    "NODE_CALLER_ATTEMPT",
  );
  assert.equal(caller.head_branch, "main", "NODE_CALLER_BRANCH");
  const own = await readRun(
    identity.runId,
    ".github/workflows/staging-render-promotion.yml",
  );
  assert.equal(own.run_attempt, identity.runAttempt, "NODE_OWN_ATTEMPT");
  const now = () => new Date().toISOString();
  const currentCaller = async () => {
    const fresh = await readRun(
      identity.callerRunId,
      ".github/workflows/final-release-acceptance.yml",
    );
    assert.equal(
      fresh.run_attempt,
      identity.callerRunAttempt,
      "NODE_CALLER_ATTEMPT",
    );
    assert.equal(fresh.head_branch, "main", "NODE_CALLER_BRANCH");
    assert.equal(fresh.status, "in_progress", "NODE_CALLER_NOT_RUNNING");
    assert.equal(
      fresh.conclusion ?? null,
      null,
      "NODE_CALLER_ALREADY_FINISHED",
    );
    assert.equal((await api("commits/main")).sha, sourceSha, "NODE_MAIN_MOVED");
  };
  const poll = async (expected) => {
    for (let attempt = 0; attempt < 180; attempt++) {
      const listing = await listComments();
      const matches = listing.comments
        .filter(
          (c) =>
            c.user?.id === policy.receiptActor.id &&
            c.user?.login === policy.receiptActor.login &&
            (c.performed_via_github_app?.id ?? null) ===
              policy.receiptActor.appId &&
            c.body.startsWith(RECEIPT_PREFIX),
        )
        .map((c) => ({ c, p: JSON.parse(c.body.slice(RECEIPT_PREFIX.length)) }))
        .filter(
          (x) =>
            x.p.phase === expected.phase &&
            x.p.authorizationId === expected.authorizationId &&
            x.p.runId === expected.runId &&
            x.p.runAttempt === expected.runAttempt &&
            (expected.phase !== "post-deploy" ||
              x.p.verificationId ===
                `${expected.verification.runId}:${expected.verification.runAttempt}`),
        );
      assert.ok(matches.length <= 1, "NODE_RECEIPT_AMBIGUOUS");
      if (matches.length) {
        const c = matches[0].c,
          reference = {
            commentId: c.id,
            sha256: createHash("sha256").update(c.body, "utf8").digest("hex"),
          };
        return verifyConnectorReceipt(reference, {
          fetchComment,
          listComments,
          actor: policy.receiptActor,
          expected,
          now: now(),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
    throw Error("NODE_RECEIPT_WAIT_TIMED_OUT");
  };
  if (command === "node-intent") {
    assert.equal(identity.runAttempt, 1, "NODE_DISPATCH_RERUN_FORBIDDEN");
    writeFileSync(
      "staging-node-intent.json",
      JSON.stringify(
        {
          ...identity,
          mode: NODE_MODE,
          serviceId: STAGING_SERVICE,
          createdAt: now(),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "node-verification-barrier") {
    await currentCaller();
    const jobKey = env.GITHUB_JOB;
    assert.ok(Object.hasOwn(VERIFICATION_JOBS, jobKey), "NODE_BARRIER_JOB_KEY");
    const jobs = await pages(
      `actions/runs/${identity.runId}/attempts/${identity.runAttempt}/jobs`,
      "jobs",
    );
    const matching = jobs.filter(
      (j) => j.name === VERIFICATION_JOBS[jobKey] && j.status === "in_progress",
    );
    assert.equal(matching.length, 1, "NODE_BARRIER_JOB_AMBIGUOUS");
    const job = await api("actions/jobs/" + matching[0].id);
    assert.equal(job.run_id, identity.runId, "NODE_BARRIER_JOB_RUN");
    if (Object.hasOwn(job, "run_attempt"))
      assert.equal(
        job.run_attempt,
        identity.runAttempt,
        "NODE_BARRIER_JOB_ATTEMPT",
      );
    assert.equal(job.head_sha, sourceSha, "NODE_BARRIER_JOB_HEAD");
    assert.equal(job.name, VERIFICATION_JOBS[jobKey], "NODE_BARRIER_JOB_NAME");
    assert.equal(job.status, "in_progress", "NODE_BARRIER_JOB_NOT_RUNNING");
    const recordedAt = now();
    assert.ok(
      time(job.started_at) <= time(recordedAt),
      "NODE_BARRIER_START_IN_FUTURE",
    );
    const marker = {
      schemaVersion: 1,
      kind: "STAGING_NODE_VERIFICATION_BARRIER",
      sourceSha,
      treeSha,
      authorizationId: identity.authorizationId,
      requestId: identity.requestId,
      verification: {
        runId: identity.runId,
        runAttempt: identity.runAttempt,
        callerRunId: identity.callerRunId,
        callerRunAttempt: identity.callerRunAttempt,
      },
      jobKey,
      jobName: job.name,
      jobId: job.id,
      jobStartedAt: job.started_at,
      recordedAt,
    };
    writeFileSync(
      "staging-node-verification-barrier.json",
      JSON.stringify(marker, null, 2),
      { flag: "wx" },
    );
    return;
  }
  if (command === "node-dispatch") {
    assert.equal(caller.status, "in_progress", "NODE_CALLER_NOT_RUNNING");
    assert.equal((await api("commits/main")).sha, sourceSha, "NODE_MAIN_MOVED");
    const receipt = await poll({ ...identity, phase: "pre-deploy" });
    validateNodePreflight(receipt.payload.preflight, sourceSha);
    assert.equal((await api("commits/main")).sha, sourceSha, "NODE_MAIN_MOVED");
    const url = canonicalNodeHook(
      env.RENDER_STAGING_DEPLOY_HOOK_URL,
      sourceSha,
    );
    const revalidateDispatch = async () => {
      await verifyConnectorReceipt(
        { commentId: receipt.commentId, sha256: receipt.sha256 },
        {
          fetchComment,
          listComments,
          actor: policy.receiptActor,
          expected: { ...identity, phase: "pre-deploy" },
          now: now(),
        },
      );
      await currentCaller();
    };
    await revalidateDispatch();
    const dispatchAt = now();
    const refStore = {
      getRef: async (ref) => {
        const response = await fetch(
          "https://api.github.com/repos/" + repo + "/git/ref/" + ref.slice(5),
          {
            headers: {
              Authorization: "Bearer " + env.GH_TOKEN,
              Accept: "application/vnd.github+json",
            },
            signal: AbortSignal.timeout(30000),
          },
        );
        if (response.status === 404) return null;
        if (!response.ok) throw Error("NODE_RESERVATION_READ_FAILED");
        const data = await response.json();
        return { sha: data.object.sha };
      },
      createRef: async (ref, sha) =>
        api("git/refs", { method: "POST", body: { ref, sha } }),
    };
    const intent = {
      ...identity,
      mode: NODE_MODE,
      dispatchAt,
      preReceiptId: receipt.commentId,
      preReceiptSha256: receipt.sha256,
      preflight: receipt.payload.preflight,
    };
    writeFileSync(
      "staging-node-dispatch.json",
      JSON.stringify({ ...intent, state: "NOT_SENT" }, null, 2),
    );
    try {
      const result = await dispatchNodeWithReservation({
        policy,
        receipt,
        expected: identity,
        now: dispatchAt,
        refStore,
        postHook: async () => {
          await revalidateDispatch();
          const r = await fetch(url, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(30000),
          });
          if (![200, 202].includes(r.status))
            throw Error("NODE_HOOK_REJECTED_OR_UNCERTAIN");
          const body = await r.json();
          return {
            deploymentId:
              body.deploy?.id ?? body.id ?? body.deployId ?? body.deploy_id,
          };
        },
      });
      writeFileSync(
        "staging-node-dispatch.json",
        JSON.stringify({ ...intent, ...result }, null, 2),
      );
    } catch {
      writeFileSync(
        "staging-node-dispatch.json",
        JSON.stringify(
          { ...intent, state: "OUTCOME_UNCERTAIN_RECONCILE" },
          null,
          2,
        ),
      );
      throw Error("NODE_DISPATCH_NOT_PROVEN_RECONCILE");
    }
    return;
  }
  if (command === "node-verify") {
    const runId = Number(env.DISPATCH_RUN_ID || identity.runId);
    const run = await readRun(
      runId,
      ".github/workflows/staging-render-promotion.yml",
    );
    const attempt = Number(env.DISPATCH_RUN_ATTEMPT || identity.runAttempt);
    assert.equal(run.run_attempt, attempt, "NODE_DISPATCH_RUN_ATTEMPT");
    const artifactName = "staging-node-dispatch-" + runId + "-" + attempt;
    const artifacts = (
      await pages("actions/runs/" + runId + "/artifacts", "artifacts")
    ).filter((a) => a.name === artifactName && !a.expired);
    assert.equal(artifacts.length, 1, "NODE_DISPATCH_ARTIFACT_AMBIGUOUS");
    const dir = mkdtempSync(join(tmpdir(), "node-dispatch-"));
    let dispatch, raw;
    try {
      execFileSync(
        "gh",
        [
          "run",
          "download",
          String(runId),
          "--repo",
          repo,
          "--name",
          artifactName,
          "--dir",
          dir,
        ],
        { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
      );
      raw = readFileSync(join(dir, "staging-node-dispatch.json"));
      dispatch = JSON.parse(raw);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(
      dispatch.state,
      "DISPATCH_ACCEPTED_NOT_LIVE",
      "NODE_DISPATCH_UNCERTAIN_RECONCILE",
    );
    for (const key of ["sourceSha", "treeSha", "authorizationId", "requestId"])
      assert.equal(
        dispatch[key],
        identity[key],
        "NODE_DISPATCH_ARTIFACT_IDENTITY",
      );
    assert.equal(dispatch.runId, runId, "NODE_DISPATCH_RUN_ID");
    assert.equal(dispatch.runAttempt, attempt, "NODE_DISPATCH_ATTEMPT");
    const binding = {
      ...identity,
      runId,
      runAttempt: attempt,
      callerRunId: dispatch.callerRunId,
      callerRunAttempt: dispatch.callerRunAttempt,
    };
    const verification = {
      runId: identity.runId,
      runAttempt: identity.runAttempt,
      callerRunId: identity.callerRunId,
      callerRunAttempt: identity.callerRunAttempt,
    };
    await currentCaller();
    const barrierName = `staging-node-verification-barrier-${identity.runId}-${identity.runAttempt}`;
    const barrierArtifacts = (
      await pages("actions/runs/" + identity.runId + "/artifacts", "artifacts")
    ).filter((a) => a.name === barrierName);
    assert.equal(barrierArtifacts.length, 1, "NODE_BARRIER_ARTIFACT_AMBIGUOUS");
    const barrierDir = mkdtempSync(join(tmpdir(), "node-barrier-"));
    let barrierRaw;
    try {
      execFileSync(
        "gh",
        [
          "run",
          "download",
          String(identity.runId),
          "--repo",
          repo,
          "--name",
          barrierName,
          "--dir",
          barrierDir,
        ],
        { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
      );
      barrierRaw = readFileSync(
        join(barrierDir, "staging-node-verification-barrier.json"),
      );
    } finally {
      rmSync(barrierDir, { recursive: true, force: true });
    }
    assert.equal(
      barrierRaw.toString(),
      readFileSync("staging-node-verification-barrier.json", "utf8"),
      "NODE_BARRIER_LOCAL_ARTIFACT_DRIFT",
    );
    const verificationBarrier = verificationBarrierBinding({
      raw: barrierRaw,
      artifact: barrierArtifacts[0],
      job: await api("actions/jobs/" + JSON.parse(barrierRaw).jobId),
      attemptJobs: await pages(
        `actions/runs/${identity.runId}/attempts/${identity.runAttempt}/jobs`,
        "jobs",
      ),
      expected: { ...identity, verification, jobKey: env.GITHUB_JOB },
      now: now(),
    });
    const post = await poll({
      ...binding,
      verification,
      verificationBarrier,
      phase: "post-deploy",
    });
    await currentCaller();
    const p = post.payload;
    assert.equal(
      p.preReceiptId,
      dispatch.preReceiptId,
      "NODE_POST_PRE_RECEIPT_ID",
    );
    assert.equal(
      p.preReceiptSha256,
      dispatch.preReceiptSha256,
      "NODE_POST_PRE_RECEIPT_DIGEST",
    );
    assert.equal(
      p.dispatchArtifactId,
      artifacts[0].id,
      "NODE_POST_ARTIFACT_ID",
    );
    assert.equal(
      p.dispatchSha256,
      createHash("sha256").update(raw).digest("hex"),
      "NODE_POST_DISPATCH_BYTES",
    );
    const pre = await verifyConnectorReceipt(
      { commentId: dispatch.preReceiptId, sha256: dispatch.preReceiptSha256 },
      {
        fetchComment,
        listComments,
        actor: policy.receiptActor,
        expected: { ...binding, phase: "pre-deploy" },
        now: dispatch.dispatchAt,
      },
    );
    validateNodePreflight(pre.payload.preflight, sourceSha);
    assert.equal(
      stable(pre.payload.preflight),
      stable(dispatch.preflight),
      "NODE_PREFLIGHT_ARTIFACT_DRIFT",
    );
    const observation = p.observation;
    validateExternalNodeObservation(
      observation,
      {
        ...binding,
        workflow: { ...binding, headSha: sourceSha },
        artifact: { id: artifacts[0].id, name: artifactName },
        artifactCount: 1,
        providerDeploymentId: dispatch.providerDeploymentId,
        reservationId: dispatch.reservationRef,
        reservationConsumed: false,
        configurationFingerprint:
          pre.payload.preflight.configurationFingerprint,
        dispatchAt: dispatch.dispatchAt,
        previousRuntime: pre.payload.preflight.previousRuntime,
        verificationBarrier,
        receiptObservedAt: p.observedAt,
      },
      { now: now() },
    );
    const reservation = await api(
      "git/ref/" + dispatch.reservationRef.slice(5),
    );
    assert.equal(reservation.object.sha, sourceSha, "NODE_RESERVATION_MOVED");
    await verifyConnectorReceipt(
      { commentId: post.commentId, sha256: post.sha256 },
      {
        fetchComment,
        listComments,
        actor: policy.receiptActor,
        expected: {
          ...binding,
          verification,
          verificationBarrier,
          phase: "post-deploy",
        },
        now: now(),
      },
    );
    await currentCaller();
    writeFileSync(
      "staging-deployment-evidence.json",
      JSON.stringify(
        {
          ...observation,
          evidenceStates: [
            "CI_VERIFIED",
            "CONNECTOR_OBSERVED",
            "RUNTIME_OBSERVED",
          ],
          postReceiptId: post.commentId,
          postReceiptSha256: post.sha256,
          preReceiptId: pre.commentId,
          preReceiptSha256: pre.sha256,
          dispatchArtifactId: artifacts[0].id,
          verification,
          verificationBarrier,
          verificationId: p.verificationId,
          verifiedAt: now(),
          verificationRunId: identity.runId,
          verificationRunAttempt: identity.runAttempt,
        },
        null,
        2,
      ),
    );
    return;
  }
  throw Error("NODE_RUNTIME_COMMAND_INVALID");
}
async function nodeAcceptanceCli(id, sourceSha) {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const repo = "luizanunciostoca/touristic-digital-platform";
  assert.equal(
    process.env.GITHUB_REPOSITORY,
    repo,
    "NODE_ACCEPTANCE_REPOSITORY",
  );
  const policy = JSON.parse(
    readFileSync("tooling/ci/staging-node-exception.json", "utf8"),
  );
  assert.equal(policy.enabled, true, "NODE_ACCEPTANCE_DISABLED");
  const gh = (args) =>
    execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    });
  const api = (path) => JSON.parse(gh(["api", "repos/" + repo + "/" + path]));
  const pages = (path) =>
    JSON.parse(
      gh(["api", "--paginate", "--slurp", "repos/" + repo + "/" + path]),
    );
  const result = await verifyNodeAcceptanceRun({
    runId: Number(id),
    sourceSha,
    treeSha: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      encoding: "utf8",
    }).trim(),
    callerRunId: Number(process.env.GITHUB_RUN_ID),
    callerRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    now: new Date().toISOString(),
    clock: () => new Date().toISOString(),
    actor: policy.receiptActor,
    readRun: async (id) => api("actions/runs/" + id),
    readJob: async (id) => api("actions/jobs/" + id),
    listJobs: async (id, attempt) =>
      pages(`actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`).flatMap(
        (p) => p.jobs,
      ),
    readBarrier: async (id, artifact) => {
      const d = mkdtempSync(join(tmpdir(), "node-acceptance-barrier-"));
      try {
        gh([
          "run",
          "download",
          String(id),
          "--repo",
          repo,
          "--name",
          artifact.name,
          "--dir",
          d,
        ]);
        return readFileSync(join(d, "staging-node-verification-barrier.json"));
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    },
    fetchComment: async (id) => api("issues/comments/" + id),
    listComments: async () => ({
      complete: true,
      comments: pages("issues/1072/comments?per_page=100").flat(),
    }),
    listArtifacts: async (id) => ({
      complete: true,
      items: pages("actions/runs/" + id + "/artifacts?per_page=100").flatMap(
        (p) => p.artifacts,
      ),
    }),
    readEvidence: async (id, artifact) => {
      const d = mkdtempSync(join(tmpdir(), "node-current-acceptance-"));
      try {
        gh([
          "run",
          "download",
          String(id),
          "--repo",
          repo,
          "--name",
          artifact.name,
          "--dir",
          d,
        ]);
        return JSON.parse(
          readFileSync(join(d, "staging-deployment-evidence.json"), "utf8"),
        );
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    },
  });
  assert.equal(
    result.authorizationId,
    policy.authorizationId,
    "NODE_ACCEPTANCE_POLICY",
  );
  console.log(JSON.stringify(result));
}
