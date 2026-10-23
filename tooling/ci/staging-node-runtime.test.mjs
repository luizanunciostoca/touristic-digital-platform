import { verificationBarrierBinding } from "./staging-node-barrier.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  NODE_MODE,
  STAGING_SERVICE,
  STAGING_URL,
  configurationFingerprint,
} from "./staging-node-contracts.mjs";
import { receiptBody } from "./staging-node-receipts.mjs";
import { nodeRuntime } from "./staging-node-runtime.mjs";
import { fixture } from "./staging-node-test-fixtures.mjs";

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

test("repository policy disables runtime before any network call", async () => {
  const previous = process.env.GITHUB_REPOSITORY,
    original = globalThis.fetch;
  let calls = 0;
  try {
    process.env.GITHUB_REPOSITORY =
      "luizanunciostoca/touristic-digital-platform";
    globalThis.fetch = async () => {
      calls++;
      throw new Error("UNEXPECTED_NETWORK");
    };
    await assert.rejects(nodeRuntime("node-intent"), /NODE_DISPATCH_DISABLED/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previous;
  }
});
test("thin CLI fails closed on an unknown command", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./staging-node-exception.mjs", import.meta.url)),
      "unknown",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ACCEPTANCE_MODE_GATE_FAILED/);
  assert.equal(result.stdout, "");
});
