import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCurrentMainUnchanged,
  attachLiveSchedulerState,
  buildPlan as buildMdctlPlan,
  buildScheduleCandidateItem,
} from "../mdctl/mdctl.mjs";
import {
  buildIntegrationQueue,
  buildSchedulerPlan,
  buildWorkerDispatchPlan,
  findSemanticCollisions,
  loadSchedulerPolicy,
  normalizeObjective,
  semanticLocks,
  validateSchedulerPolicy,
} from "../mdctl/scheduler.mjs";
import {
  authorityDivergence,
  collectLivePullWork,
  evaluateDependenciesAtMain,
  schedulerClaimBindingError,
  verifyTrustedClaimEvidence,
} from "../mdctl/scheduler-live.mjs";
import { buildLiveProjection } from "../mdctl/reconcile.mjs";

function changeSet(id, objective, overrides = {}) {
  return {
    schemaVersion: 2,
    id,
    objective,
    baseSha: "a".repeat(40),
    branch: "feat/" + id.toLowerCase(),
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: {
      paths: ["packages/" + id.toLowerCase() + "/**"],
      contracts: [],
    },
    reads: { contracts: [] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["remote-proof"],
    requiredCapabilities: ["github:read"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "unit",
          argv: ["node", "--test", "tooling/unit.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
    ...overrides,
  };
}

test("objective normalization is stable and bounded", () => {
  assert.equal(
    normalizeObjective(" Brand Family V2 Adoption "),
    "brand-family-v2-adoption",
  );
  assert.throws(() => normalizeObjective("x"), /SCHEDULER_OBJECTIVE_INVALID/u);
});

test("semantic collisions include objective and shared authorities", () => {
  const left = changeSet("MD-A", "brand-family-v2-adoption", {
    owns: { paths: ["apps/web/**"], contracts: ["BRAND"] },
    produces: { events: ["BRAND_UPDATED"], routes: ["/brand"] },
    database: { tables: ["brand_assets"] },
    auth: { capabilities: ["brand:write"] },
  });
  const right = changeSet("MD-B", "brand-family-v2-adoption", {
    owns: { paths: ["apps/web/src/**"], contracts: ["BRAND"] },
    produces: { events: ["BRAND_UPDATED"], routes: ["/brand"] },
    database: { tables: ["brand_assets"] },
    auth: { capabilities: ["brand:write"] },
  });
  const kinds = new Set(
    findSemanticCollisions(left, [right]).map((x) => x.kind),
  );
  for (const kind of [
    "objective",
    "path",
    "contract",
    "event",
    "table",
    "route",
    "auth",
  ]) {
    assert.ok(kinds.has(kind), kind);
  }
});

test("global WIP=3 blocks a fourth writer", () => {
  const active = ["MD-A", "MD-B", "MD-C"].map((id, index) => ({
    changeSet: changeSet(id, "objective-" + index),
    writerActive: true,
    openPr: true,
  }));
  const next = {
    changeSet: changeSet("MD-D", "objective-next"),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    openPr: false,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [...active, next],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked[0].code, "GLOBAL_WIP_FULL");
});

test("same objective cannot receive a second writer", () => {
  const current = {
    changeSet: changeSet("MD-A", "brand-family-v2-adoption"),
    writerActive: true,
    openPr: true,
  };
  const next = {
    changeSet: changeSet("MD-B", "brand-family-v2-adoption"),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    openPr: false,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [current, next],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked[0].code, "SEMANTIC_COLLISION");
});

test("drift over 20 commits forces replan", () => {
  const item = {
    changeSet: changeSet("MD-DRIFT", "drifted-task"),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    behindBy: 21,
    changedFiles: 2,
    changedLines: 20,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [item],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked[0].code, "REPLAN_REQUIRED");
  assert.deepEqual(plan.blocked[0].reasons, ["SUPERSEDED_BY_MAIN_DRIFT"]);
});
test("scheduler grants compatible work by priority", () => {
  const low = {
    changeSet: changeSet("MD-LOW", "low-objective", { risk: "low" }),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    priority: "P2",
  };
  const high = {
    changeSet: changeSet("MD-HIGH", "high-objective", { risk: "critical" }),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [low, high],
  });
  assert.deepEqual(
    plan.grants.map((x) => x.id),
    ["MD-HIGH", "MD-LOW"],
  );
  assert.ok(plan.grants.every((x) => x.exactBaseSha === "b".repeat(40)));
});

test("integration queue includes only MERGE_READY items", () => {
  const ready = changeSet("MD-READY", "ready-objective", {
    state: "MERGE_READY",
    baseSha: "b".repeat(40),
  });
  const implementing = changeSet("MD-WIP", "wip-objective");
  const queue = buildIntegrationQueue({
    mainSha: "b".repeat(40),
    workItems: [
      {
        changeSet: implementing,
        prNumber: 1,
        headSha: "c".repeat(40),
        priority: "P1",
      },
      {
        changeSet: ready,
        prNumber: 2,
        headSha: "d".repeat(40),
        priority: "P0",
        openPr: true,
        dependenciesSatisfied: true,
        behindBy: 0,
        baseIsAncestorOfMain: true,
        statsKnown: true,
        changedFiles: 1,
        changedLines: 10,
        invalid: null,
      },
    ],
  });
  assert.equal(queue.batches.length, 1);
  assert.deepEqual(
    queue.batches[0].items.map((x) => x.changeSetId),
    ["MD-READY"],
  );
  assert.equal(semanticLocks(ready).objective, "ready-objective");
});

test("versioned scheduler policy is executable and fail-closed", async () => {
  const policy = await loadSchedulerPolicy();
  assert.deepEqual(policy, {
    globalWriterLimit: 3,
    activePrLimit: 8,
    sameObjectiveLimit: 1,
    replanBehindCommits: 20,
    hardFiles: 30,
    hardLines: 1500,
    objectiveRequiredForDispatch: true,
    writerStates: [
      "IMPLEMENTING",
      "LOCAL_PROVEN",
      "REMOTE_PROVEN",
      "COMPOSITION_PROVEN",
      "POLICY_SATISFIED",
    ],
    slotReleaseStates: ["MERGE_READY", "MERGED"],
  });
  assert.throws(
    () =>
      validateSchedulerPolicy({
        version: 1,
        globalWriterLimit: 3,
        activePrLimit: 8,
        sameObjectiveLimit: 1,
        replanBehindCommits: 20,
        changeLimits: { hardFiles: 30, hardLines: 1500 },
        objectiveRequiredForDispatch: true,
        writerStates: [
          "IMPLEMENTING",
          "LOCAL_PROVEN",
          "REMOTE_PROVEN",
          "COMPOSITION_PROVEN",
          "POLICY_SATISFIED",
        ],
        slotReleaseStates: ["MERGE_READY", "MERGED"],
        typo: true,
      }),
    /SCHEDULER_POLICY_PROPERTY_UNKNOWN/u,
  );
});

test("invalid active writer prevents new dispatch", () => {
  const active = {
    changeSet: changeSet("MD-BAD-ACTIVE", "bad-active"),
    writerActive: true,
    openPr: true,
    invalid: "CLAIM_EXPIRED",
  };
  const next = {
    changeSet: changeSet("MD-NEXT", "next-objective"),
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    openPr: false,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [active, next],
  });
  assert.ok(
    plan.violations.some((item) => item.code === "LIVE_WORK_ITEM_INVALID"),
  );
  assert.equal(plan.dispatchAllowed, false);
});

test("integration queue excludes invalid, stale, or dependency-blocked candidates", () => {
  const ready = changeSet("MD-QUEUE-GOOD", "queue-good", {
    state: "MERGE_READY",
    baseSha: "b".repeat(40),
  });
  const item = (id, overrides = {}) => ({
    changeSet: { ...ready, id, objective: id.toLowerCase() },
    prNumber: 10,
    headSha: "d".repeat(40),
    priority: "P1",
    openPr: true,
    dependenciesSatisfied: true,
    behindBy: 0,
    baseIsAncestorOfMain: true,
    statsKnown: true,
    changedFiles: 1,
    changedLines: 10,
    invalid: null,
    ...overrides,
  });
  const queue = buildIntegrationQueue({
    mainSha: "b".repeat(40),
    workItems: [
      item("MD-GOOD"),
      item("MD-INVALID", { invalid: "CLAIM_EXPIRED" }),
      item("MD-DEPS", { dependenciesSatisfied: false }),
      item("MD-DRIFT", { behindBy: 21 }),
    ],
  });
  assert.deepEqual(
    queue.batches[0].items.map((entry) => entry.changeSetId),
    ["MD-GOOD"],
  );
});

test("merge-ready live PRs belong to integration queue, not writer dispatch", () => {
  const ready = {
    changeSet: changeSet("MD-INTEGRATE", "integrate-objective", {
      state: "MERGE_READY",
    }),
    writerActive: false,
    ready: true,
    openPr: true,
    headSha: "d".repeat(40),
    dependenciesSatisfied: true,
    behindBy: 0,
    baseIsAncestorOfMain: true,
    statsKnown: true,
    changedFiles: 1,
    changedLines: 10,
    invalid: null,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [ready],
  });
  assert.equal(plan.grants.length, 0);
  assert.equal(plan.blocked.length, 0);
});

test("integration queue requires exact current-main base", () => {
  const stale = {
    changeSet: changeSet("MD-STALE-Q", "stale-q", {
      state: "MERGE_READY",
      baseSha: "a".repeat(40),
    }),
    prNumber: 77,
    headSha: "c".repeat(40),
    openPr: true,
    dependenciesSatisfied: true,
    behindBy: 1,
    baseIsAncestorOfMain: true,
    statsKnown: true,
    changedFiles: 1,
    changedLines: 1,
    invalid: null,
  };
  assert.equal(
    buildIntegrationQueue({
      mainSha: "b".repeat(40),
      workItems: [stale],
    }).batches.length,
    0,
  );
});

test("stale active writer prevents new writer grants", () => {
  const stale = {
    changeSet: changeSet("MD-STALE-W", "stale-w"),
    openPr: true,
    writerActive: true,
    behindBy: 21,
  };
  const fresh = {
    changeSet: changeSet("MD-FRESH", "fresh"),
    openPr: false,
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    priority: "P0",
  };
  const plan = buildSchedulerPlan({
    mainSha: "b".repeat(40),
    workItems: [stale, fresh],
  });
  assert.equal(plan.grants.length, 0);
  assert.ok(
    plan.violations.some(
      (item) => item.code === "ACTIVE_WRITER_REPLAN_REQUIRED",
    ),
  );
  assert.equal(plan.dispatchAllowed, false);
});

const LIVE_MAIN = "b".repeat(40);
const LIVE_HEAD = "c".repeat(40);
const LIVE_BRANCH = "feat/live-scheduler";
const LIVE_ID = "MD-LIVE";

function encodeLiveContent(value, blobChar) {
  return {
    encoding: "base64",
    content: Buffer.from(JSON.stringify(value)).toString("base64"),
    sha: blobChar.repeat(40),
  };
}

function liveClaim(manifest, overrides = {}) {
  return {
    owner: "CHATGPT-PRO-CONTROL",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: manifest.branch,
    baseSha: manifest.baseSha,
    paths: [...manifest.owns.paths],
    domains: ["control-plane"],
    risk: "P1",
    status: "LOCAL_PROVEN",
    expiresAt: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function createLiveApi(options = {}) {
  const canonicalManifest = changeSet(LIVE_ID, "live-scheduler", {
    baseSha: options.authorityBlobsIdentical ? LIVE_MAIN : "a".repeat(40),
    branch:
      options.authorityBlobsIdentical || options.certifiedReanchor
        ? LIVE_BRANCH
        : "authority/live-scheduler",
    state: "LOCAL_PROVEN",
  });
  const candidateManifest = changeSet(LIVE_ID, "live-scheduler", {
    baseSha: LIVE_MAIN,
    branch: LIVE_BRANCH,
    state: "LOCAL_PROVEN",
  });
  if (options.trustRootReconciled) {
    for (const trustedPath of [
      ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
      ".github/workflows/morro-agent-profiles.yml",
    ]) {
      canonicalManifest.owns.paths.push(trustedPath);
      candidateManifest.owns.paths.push(trustedPath);
    }
  }
  if (options.authorityWiden) {
    candidateManifest.owns = {
      paths: [...candidateManifest.owns.paths, "packages/extra/**"],
      contracts: [...candidateManifest.owns.contracts],
    };
  }
  if (options.proofContractDrift) {
    candidateManifest.proof = {
      ...candidateManifest.proof,
      budget: {
        ...candidateManifest.proof.budget,
        maxSeconds: candidateManifest.proof.budget.maxSeconds + 1,
      },
    };
  }
  if (options.exactBaseMismatch) candidateManifest.baseSha = "a".repeat(40);
  if (options.manifestIdMismatch) candidateManifest.id = "MD-OTHER";

  const canonicalClaim = liveClaim(canonicalManifest);
  const candidateClaim = liveClaim(candidateManifest, {
    branch: LIVE_BRANCH,
    baseSha: candidateManifest.baseSha,
  });
  if (options.expiryExtended) {
    canonicalClaim.expiresAt = "2099-01-01T00:00:00Z";
    candidateClaim.expiresAt = "2100-01-01T00:00:00Z";
  }
  if (options.missingClaim) candidateClaim.branch = "feat/not-this-pr";
  const canonicalClaims = { [LIVE_ID]: canonicalClaim };
  const candidateClaims = { [LIVE_ID]: candidateClaim };
  if (options.ambiguousClaim) {
    canonicalClaims["MD-ALT"] = {
      ...canonicalClaim,
      branch: "authority/alt",
    };
    candidateClaims["MD-ALT"] = { ...candidateClaim };
  }
  if (options.extraClaimKey) {
    candidateClaims["MD-EXTRA"] = {
      ...candidateClaim,
      branch: "feat/extra",
    };
  }
  if (options.survivorMutation) {
    const survivor = {
      ...canonicalClaim,
      branch: "feat/survivor",
      paths: ["packages/survivor/**"],
    };
    canonicalClaims["MD-SURVIVOR"] = survivor;
    candidateClaims["MD-SURVIVOR"] = {
      ...survivor,
      risk: "P0",
    };
  }
  const canonicalRegistry = {
    registryAuthority: "ORCHESTRATOR",
    claims: canonicalClaims,
  };
  const candidateRegistry = {
    registryAuthority: "ORCHESTRATOR",
    claims: candidateClaims,
  };
  const listed = {
    number: 7,
    draft: false,
    head: { sha: LIVE_HEAD, ref: LIVE_BRANCH },
    base: {
      ref: "main",
      sha: options.trustRootStaleBase ? "e".repeat(40) : LIVE_MAIN,
    },
  };
  let mainCalls = 0;
  let pullListCalls = 0;

  const trustJobs = [
    "trusted-claim-guard-bootstrap",
    "base-controlled-orchestrator-registry-proof",
    "base-controlled-independent-proof / trusted-agent-profile-contract",
  ];
  const trustRootReconciliationJob =
    "base-controlled-trust-root-reconciliation";

  const api = async (endpoint, apiOptions = {}) => {
    if (endpoint.endsWith("/commits/main")) {
      mainCalls += 1;
      return {
        sha: options.mainMoves && mainCalls > 1 ? "d".repeat(40) : LIVE_MAIN,
      };
    }
    if (endpoint.includes("/pulls?state=open&base=main&per_page=100")) {
      assert.equal(apiOptions.paginate, true);
      pullListCalls += 1;
      const terminal = options.pullSetMoves && pullListCalls > 1;
      return [
        [],
        [
          terminal
            ? {
                ...listed,
                head: { ...listed.head, sha: "d".repeat(40) },
              }
            : listed,
        ],
      ];
    }
    if (endpoint.endsWith("/pulls/7")) {
      return {
        ...listed,
        head: options.headMoves
          ? { ...listed.head, sha: "d".repeat(40) }
          : listed.head,
        base: {
          ref: "main",
          sha: options.trustRootStaleBase ? "e".repeat(40) : LIVE_MAIN,
        },
        changed_files: options.unknownStats ? null : 6,
        additions: options.unknownStats ? null : 80,
        deletions: options.unknownStats ? null : 20,
        created_at: "2026-10-01T12:00:00Z",
      };
    }
    if (endpoint.endsWith("/pulls/7/files?per_page=100")) {
      assert.equal(apiOptions.paginate, true);
      if (options.filesUnavailable) throw new Error("files unavailable");
      const files = [
        {
          filename: "packages/md-live/a.mjs",
          status: "modified",
          additions: 20,
          deletions: 5,
        },
        {
          filename: "packages/md-live/b.mjs",
          status: "modified",
          additions: 15,
          deletions: 4,
        },
        {
          filename: "packages/md-live/c.mjs",
          status: "modified",
          additions: 15,
          deletions: 3,
        },
        {
          filename: "packages/md-live/d.mjs",
          status: "modified",
          additions: 10,
          deletions: 3,
        },
        {
          filename: "packages/md-live/e.mjs",
          status: "modified",
          additions: 10,
          deletions: 3,
        },
        {
          filename: "packages/md-live/f.mjs",
          status: "modified",
          additions: 10,
          deletions: 2,
        },
      ];
      if (options.trustRootReconciled) {
        files[0] = {
          ...files[0],
          filename: ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
        };
        files[1] = {
          ...files[1],
          filename: ".github/workflows/morro-agent-profiles.yml",
        };
      }
      if (options.certifiedReanchor) {
        files[0] = {
          ...files[0],
          filename: ".github/morro-control/claims.json",
        };
        files[1] = {
          ...files[1],
          filename: ".github/morro-control/events.ndjson",
        };
        if (options.reanchorExtraOutsideScope) {
          files[2] = {
            ...files[2],
            filename: "packages/other/outside.mjs",
          };
        }
      }
      if (options.fileOutsideScope) {
        files[0] = {
          ...files[0],
          filename: "packages/other/outside.mjs",
        };
      }
      if (options.renameFromOutsideScope) {
        files[0] = {
          ...files[0],
          status: "renamed",
          previous_filename: "packages/other/secret.mjs",
          filename: "packages/md-live/a.mjs",
        };
      }
      return [files.slice(0, 3), files.slice(3)];
    }

    const encodedMain = encodeURIComponent(LIVE_MAIN);
    const encodedHead = encodeURIComponent(LIVE_HEAD);
    if (
      endpoint.includes(
        "/contents/.github/morro-control/claims.json?ref=" + encodedMain,
      )
    ) {
      return encodeLiveContent(canonicalRegistry, "1");
    }
    if (
      endpoint.includes(
        "/contents/.github/morro-control/claims.json?ref=" + encodedHead,
      )
    ) {
      if (options.registryMalformed) throw new Error("registry unavailable");
      return encodeLiveContent(
        candidateRegistry,
        options.authorityBlobsIdentical ? "1" : "2",
      );
    }
    if (
      endpoint.includes(
        "/contents/.morro/changesets/" + LIVE_ID + ".json?ref=" + encodedMain,
      )
    ) {
      return encodeLiveContent(canonicalManifest, "3");
    }
    if (
      endpoint.includes(
        "/contents/.morro/changesets/" + LIVE_ID + ".json?ref=" + encodedHead,
      )
    ) {
      return encodeLiveContent(
        candidateManifest,
        options.authorityBlobsIdentical ? "3" : "4",
      );
    }

    if (
      endpoint.includes(
        "/contents/.github/workflows/morro-claim-guard.yml?ref=",
      )
    ) {
      const isHead = endpoint.includes("?ref=" + encodedHead);
      return {
        sha:
          isHead && options.trustRootWorkflowDiverged
            ? "7".repeat(40)
            : "6".repeat(40),
      };
    }
    if (
      endpoint.includes("/contents/") &&
      (endpoint.includes("morro-claim-guard-trusted.yml") ||
        endpoint.includes("tooling/fabric/claim-guard.mjs") ||
        endpoint.includes("tooling/mdctl/scheduler-live.mjs"))
    ) {
      const isHead = endpoint.includes("?ref=" + encodedHead);
      return {
        sha:
          isHead && options.immutableTrustFileDiverged
            ? "9".repeat(40)
            : "8".repeat(40),
      };
    }
    if (
      endpoint.includes("/contents/") &&
      (endpoint.includes("morro-claim-guard-trust-bootstrap.yml") ||
        endpoint.includes("morro-agent-profiles.yml"))
    ) {
      const isHead = endpoint.includes("?ref=" + encodedHead);
      return {
        sha:
          isHead && options.trustFileDiverged ? "5".repeat(40) : "4".repeat(40),
      };
    }
    if (
      endpoint.includes(
        "/actions/runs?head_sha=" +
          encodeURIComponent(LIVE_HEAD) +
          "&event=pull_request&per_page=100",
      )
    ) {
      assert.equal(apiOptions.paginate, true);
      return [
        {
          workflow_runs: [
            {
              id: 99,
              name: "Trusted Claim Guard Bootstrap",
              path: ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
              event: "pull_request",
              head_sha: LIVE_HEAD,
              head_branch: LIVE_BRANCH,
              status: "completed",
              conclusion: "success",
              created_at: "2026-10-01T12:10:00Z",
              pull_requests: [
                { number: options.wrongTrustPrAssociation ? 8 : 7 },
              ],
            },
            ...(options.trustRootReconciled
              ? [
                  {
                    id: 77,
                    name: "Claim Guard Contract",
                    path: ".github/workflows/morro-claim-guard.yml",
                    event: "pull_request",
                    head_sha: LIVE_HEAD,
                    head_branch: LIVE_BRANCH,
                    status: "completed",
                    conclusion: options.trustRootReconciliationFails
                      ? "failure"
                      : "success",
                    created_at: "2026-10-01T12:09:00Z",
                    pull_requests: [
                      {
                        number: options.wrongTrustRootPrAssociation ? 8 : 7,
                        head: { ref: LIVE_BRANCH, sha: LIVE_HEAD },
                        base: {
                          ref: "main",
                          sha: options.trustRootStaleRunBase
                            ? "e".repeat(40)
                            : LIVE_MAIN,
                        },
                      },
                    ],
                  },
                ]
              : []),
            ...(options.latestTrustRunFails
              ? [
                  {
                    id: 100,
                    name: "Trusted Claim Guard Bootstrap",
                    path: ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
                    event: "pull_request",
                    head_sha: LIVE_HEAD,
                    head_branch: LIVE_BRANCH,
                    status: "completed",
                    conclusion: "failure",
                    created_at: "2026-10-01T12:11:00Z",
                    pull_requests: [
                      { number: options.wrongTrustPrAssociation ? 8 : 7 },
                    ],
                  },
                ]
              : []),
          ],
        },
      ];
    }
    if (endpoint.endsWith("/actions/runs/99/jobs?per_page=100")) {
      assert.equal(apiOptions.paginate, true);
      return [
        {
          jobs: trustJobs
            .filter((name) => name !== options.missingTrustJob)
            .map((name) => ({
              name,
              status: "completed",
              conclusion: "success",
              head_sha: LIVE_HEAD,
            })),
        },
      ];
    }
    if (endpoint.endsWith("/actions/runs/77/jobs?per_page=100")) {
      assert.equal(apiOptions.paginate, true);
      return [
        {
          jobs: [
            {
              name: trustRootReconciliationJob,
              status: "completed",
              conclusion: options.trustRootReconciliationJobFails
                ? "failure"
                : "success",
              head_sha: LIVE_HEAD,
              run_id: 77,
              check_run_url:
                "https://api.github.com/repos/example/repo/check-runs/770",
              steps: [
                {
                  name: "Validate approved trust-routing candidate blobs",
                  conclusion: options.trustRootReconciliationStepFails
                    ? "failure"
                    : "success",
                },
              ],
            },
          ],
        },
      ];
    }
    if (
      endpoint.endsWith("/commits/" + LIVE_HEAD + "/check-runs?per_page=100")
    ) {
      assert.equal(apiOptions.paginate, true);
      return [
        {
          check_runs: [
            ...trustJobs.map((name) => ({
              name,
              status: "completed",
              conclusion: "success",
              app: {
                id: options.spoofCheck ? 999 : 15368,
                slug: options.spoofCheck ? "other-app" : "github-actions",
              },
            })),
            ...(options.trustRootReconciled
              ? [
                  {
                    id: options.sameAppWrongTrustRootCheck ? 771 : 770,
                    url: options.sameAppWrongTrustRootCheck
                      ? "https://api.github.com/repos/example/repo/check-runs/771"
                      : "https://api.github.com/repos/example/repo/check-runs/770",
                    head_sha: LIVE_HEAD,
                    name: trustRootReconciliationJob,
                    status: "completed",
                    conclusion: options.trustRootReconciliationJobFails
                      ? "failure"
                      : "success",
                    app: {
                      id: options.spoofTrustRootCheck ? 999 : 15368,
                      slug: options.spoofTrustRootCheck
                        ? "other-app"
                        : "github-actions",
                    },
                  },
                ]
              : []),
          ],
        },
      ];
    }
    if (endpoint.includes("/compare/")) {
      if (options.compareUnknown) throw new Error("compare unavailable");
      if (options.exactBaseMismatch) {
        return {
          status: "ahead",
          ahead_by: 1,
          merge_base_commit: { sha: "a".repeat(40) },
        };
      }
      return {
        status: "identical",
        ahead_by: 0,
        merge_base_commit: { sha: LIVE_MAIN },
      };
    }
    throw new Error("unexpected endpoint: " + endpoint);
  };

  return {
    api,
    canonicalManifest,
    candidateManifest,
    canonicalClaim,
    candidateClaim,
  };
}

test("live collector paginates, binds trusted exact-head proof and preserves stats", async () => {
  const fixture = createLiveApi();
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
    now: Date.parse("2026-10-01T12:30:00Z"),
  });
  assert.equal(live.mainSha, LIVE_MAIN);
  assert.equal(live.authority, "TRUSTED_PR_EXACT_HEADS");
  assert.equal(live.items.length, 1);
  const item = live.items[0];
  assert.equal(item.invalid, null);
  assert.equal(item.prNumber, 7);
  assert.equal(item.headSha, LIVE_HEAD);
  assert.equal(item.changedFiles, 6);
  assert.equal(item.changedLines, 100);
  assert.equal(item.statsKnown, true);
  assert.equal(item.behindBy, 0);
  assert.equal(item.baseIsAncestorOfMain, true);
  assert.equal(item.trust.trusted, true);
  assert.equal(item.trust.authority, "TRUSTED_CLAIM_GUARD_EXACT_HEAD");
  assert.equal(item.trust.workflowRunId, 99);
});

test("live collector accepts exact trusted reanchor bookkeeping only", async () => {
  const fixture = createLiveApi({ certifiedReanchor: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
    now: Date.parse("2026-10-01T12:30:00Z"),
  });
  const item = live.items[0];
  assert.equal(item.invalid, null, JSON.stringify(item));
  assert.equal(item.trust.trusted, true);
  assert.equal(item.trust.authority, "TRUSTED_CLAIM_GUARD_EXACT_HEAD");
  assert.deepEqual(item.transientOrchestratorPaths, [
    ".github/morro-control/claims.json",
    ".github/morro-control/events.ndjson",
  ]);
  assert.equal(item.writerActive, true);
});

test("live collector rejects reanchor bookkeeping without exact-head trusted proof", async () => {
  const fixture = createLiveApi({
    certifiedReanchor: true,
    latestTrustRunFails: true,
  });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  const item = live.items[0];
  assert.equal(item.invalid, "TRUSTED_CLAIM_GUARD_RUN_NOT_SUCCESS");
  assert.deepEqual(item.transientOrchestratorPaths, []);
  assert.equal(item.writerActive, false);
});

test("live collector never widens trusted reanchor bookkeeping to extra paths", async () => {
  const fixture = createLiveApi({
    certifiedReanchor: true,
    reanchorExtraOutsideScope: true,
  });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  const item = live.items[0];
  assert.equal(
    item.invalid,
    "CANONICAL_CLAIM_PATH_VIOLATION:packages/other/outside.mjs",
  );
  assert.deepEqual(item.transientOrchestratorPaths, [
    ".github/morro-control/claims.json",
    ".github/morro-control/events.ndjson",
  ]);
  assert.equal(item.writerActive, false);
});

test("live collector rejects semantic authority mutation even during reanchor", async () => {
  const fixture = createLiveApi({
    certifiedReanchor: true,
    authorityWiden: true,
  });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.match(live.items[0].invalid, /AUTHORITY_DIVERGED_FROM_MAIN/u);
  assert.equal(
    live.items[0].transientOrchestratorPaths,
    undefined,
    "AUTHORITY_DRIFT_REJECTS_BEFORE_TRANSIENT_CLASSIFICATION",
  );
  assert.equal(live.items[0].writerActive, false);
});

test("live collector rejects survivor mutation during certified reanchor", async () => {
  const fixture = createLiveApi({
    certifiedReanchor: true,
    survivorMutation: true,
  });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  const item = live.items[0];
  assert.equal(item.invalid, "CLAIM_REGISTRY_MULTIPLE_MUTATIONS");
  assert.equal(item.writerActive, false);
  assert.equal(item.ready, false);
  assert.equal(item.transientOrchestratorPaths, undefined);
});

test("live collector rejects head movement during capture", async () => {
  const fixture = createLiveApi({ headMoves: true });
  await assert.rejects(
    collectLivePullWork({ repository: "example/repo", api: fixture.api }),
    /SCHEDULER_PR_MOVED_DURING_CAPTURE/u,
  );
});

test("live collector rejects canonical main movement during capture", async () => {
  const fixture = createLiveApi({ mainMoves: true });
  await assert.rejects(
    collectLivePullWork({ repository: "example/repo", api: fixture.api }),
    /MAIN_CHANGED_DURING_SCHEDULER_CAPTURE/u,
  );
});

test("live collector rejects pull-set movement during capture", async () => {
  const fixture = createLiveApi({ pullSetMoves: true });
  await assert.rejects(
    collectLivePullWork({ repository: "example/repo", api: fixture.api }),
    /PULL_SET_CHANGED_DURING_SCHEDULER_CAPTURE/u,
  );
});

test("live collector preserves malformed registry PR as an invalid blocker", async () => {
  const fixture = createLiveApi({ registryMalformed: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.equal(live.items.length, 1);
  assert.equal(live.items[0].invalid, "CLAIM_REGISTRY_UNAVAILABLE");
  const plan = buildSchedulerPlan({
    mainSha: LIVE_MAIN,
    workItems: live.items,
  });
  assert.ok(
    plan.violations.some(
      (entry) => entry.reason === "CLAIM_REGISTRY_UNAVAILABLE",
    ),
  );
});

test("live collector binds manifest identity to the matching claim key", async () => {
  const fixture = createLiveApi({ manifestIdMismatch: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.equal(live.items[0].invalid, "CHANGESET_INVALID");
});

test("live collector rejects ambiguous branch claims", async () => {
  const fixture = createLiveApi({ ambiguousClaim: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.equal(live.items[0].invalid, "CLAIM_AMBIGUOUS");
});

test("live collector rejects candidate authority widened beyond exact main", async () => {
  const fixture = createLiveApi({ authorityWiden: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.match(live.items[0].invalid, /AUTHORITY_DIVERGED_FROM_MAIN/u);
});

test("trusted claim evidence accepts reconciled trusted control drift", async () => {
  const fixture = createLiveApi({
    trustFileDiverged: true,
    trustRootReconciled: true,
  });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, true, JSON.stringify(trust));
  assert.equal(
    trust.authority,
    "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
    JSON.stringify(trust),
  );
  assert.deepEqual(trust.reconciledTrustedFiles, [
    ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
    ".github/workflows/morro-agent-profiles.yml",
  ]);
  assert.equal(
    trust.trustRootReconciliation?.authority,
    "BASE_CONTROLLED_TRUST_ROOT_RECONCILIATION",
  );
  assert.equal(
    trust.trustRootReconciliation?.requiredStep,
    "Validate approved trust-routing candidate blobs",
  );
});

test("trusted control drift fails closed without root reconciliation", async () => {
  const fixture = createLiveApi({
    trustFileDiverged: true,
    missingTrustRootReconciliation: true,
  });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.match(trust.reason, /TRUST_ROOT_RECONCILIATION_RUN_MISSING/u);
});

test("trust root workflow itself cannot self-reconcile", async () => {
  const fixture = createLiveApi({ trustRootWorkflowDiverged: true });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.match(trust.reason, /TRUSTED_IMMUTABLE_FILE_DIVERGED/u);
});

test("trust root reconciliation rejects same-name check from another app", async () => {
  const fixture = createLiveApi({
    trustFileDiverged: true,
    trustRootReconciled: true,
    spoofTrustRootCheck: true,
  });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.match(trust.reason, /TRUST_ROOT_RECONCILIATION_CHECK_MISSING/u);
});

test("trust root reconciliation rejects proof captured against a stale base", async () => {
  const fixture = createLiveApi({
    trustFileDiverged: true,
    trustRootReconciled: true,
    trustRootStaleBase: true,
  });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false, JSON.stringify(trust));
  assert.match(trust.reason, /TRUST_ROOT_RECONCILIATION_BASE_SHA_MISMATCH/u);
});

test("trust root reconciliation rejects a run captured against a stale base", async () => {
  const fixture = createLiveApi({
    trustFileDiverged: true,
    trustRootReconciled: true,
    trustRootStaleRunBase: true,
  });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.match(trust.reason, /TRUST_ROOT_RECONCILIATION_RUN_BASE_MISMATCH/u);
});

test("trust root reconciliation rejects same-app check from another job", async () => {
  const fixture = createLiveApi({
    trustFileDiverged: true,
    trustRootReconciled: true,
    sameAppWrongTrustRootCheck: true,
  });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.match(trust.reason, /TRUST_ROOT_RECONCILIATION_CHECK_MISSING/u);
});

test("trusted claim evidence requires every base-controlled job", async () => {
  const fixture = createLiveApi({
    missingTrustJob: "base-controlled-orchestrator-registry-proof",
  });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.match(trust.reason, /TRUSTED_CLAIM_GUARD_JOB_INVALID/u);
});

test("trusted claim evidence rejects same-name checks from another app", async () => {
  const fixture = createLiveApi({ spoofCheck: true });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.match(trust.reason, /TRUSTED_GITHUB_ACTIONS_CHECK_MISSING/u);
});

test("trusted claim evidence must belong to the PR being collected", async () => {
  const fixture = createLiveApi({ wrongTrustPrAssociation: true });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.equal(trust.reason, "TRUSTED_CLAIM_GUARD_RUN_MISSING");
});

test("unknown compare and PR statistics fail closed as an invalid blocker", async () => {
  const fixture = createLiveApi({
    compareUnknown: true,
    unknownStats: true,
  });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  const item = live.items[0];
  assert.equal(item.invalid, "PR_STATS_OR_FILES_MISMATCH");
  assert.equal(item.behindBy, null);
  assert.equal(item.baseIsAncestorOfMain, false);
  assert.equal(item.statsKnown, false);
  const plan = buildSchedulerPlan({
    mainSha: LIVE_MAIN,
    workItems: live.items,
  });
  assert.equal(plan.dispatchAllowed, false);
  assert.ok(
    plan.violations.some(
      (entry) =>
        entry.code === "LIVE_WORK_ITEM_INVALID" &&
        entry.reason === "PR_STATS_OR_FILES_MISMATCH",
    ),
  );
});

test("dependency proof reads only exact-main MERGED manifests", async () => {
  const child = changeSet("MD-CHILD-LIVE", "child-live", {
    dependencies: ["MD-BASE-LIVE"],
  });
  const merged = changeSet("MD-BASE-LIVE", "base-live", {
    state: "MERGED",
  });
  const api = async (endpoint) => {
    assert.match(endpoint, /MD-BASE-LIVE\.json\?ref=/u);
    return encodeLiveContent(merged, "7");
  };
  assert.deepEqual(
    await evaluateDependenciesAtMain({
      changeSet: child,
      repository: "example/repo",
      mainSha: LIVE_MAIN,
      api,
    }),
    { satisfied: true, unresolved: [] },
  );
  assert.deepEqual(
    await evaluateDependenciesAtMain({
      changeSet: child,
      repository: "example/repo",
      mainSha: LIVE_MAIN,
      api: async () =>
        encodeLiveContent({ ...merged, state: "LOCAL_PROVEN" }, "7"),
    }),
    { satisfied: false, unresolved: ["MD-BASE-LIVE"] },
  );
});

test("claim binding rejects claim/manifest path mismatch", () => {
  const fixture = createLiveApi();
  const claim = {
    ...fixture.candidateClaim,
    paths: [...fixture.candidateClaim.paths, "packages/extra/**"],
  };
  assert.equal(
    schedulerClaimBindingError(
      claim,
      fixture.candidateManifest,
      LIVE_BRANCH,
      Date.parse("2026-10-01T12:30:00Z"),
    ),
    "CLAIM_CHANGESET_PATHS_MISMATCH",
  );
});

test("authority envelope ignores lifecycle identity but not semantic authority", () => {
  const fixture = createLiveApi();
  assert.equal(
    authorityDivergence({
      canonicalClaim: fixture.canonicalClaim,
      candidateClaim: fixture.candidateClaim,
      canonicalChangeSet: fixture.canonicalManifest,
      candidateChangeSet: fixture.candidateManifest,
    }),
    null,
  );
  const widened = structuredClone(fixture.candidateManifest);
  widened.auth.capabilities.push("platform:admin");
  assert.match(
    authorityDivergence({
      canonicalClaim: fixture.canonicalClaim,
      candidateClaim: fixture.candidateClaim,
      canonicalChangeSet: fixture.canonicalManifest,
      candidateChangeSet: widened,
    }),
    /CHANGESET_AUTHORITY_DIVERGED_FROM_MAIN/u,
  );
});

test("live collector rejects claim registry keyset mutation", async () => {
  const fixture = createLiveApi({ extraClaimKey: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.equal(live.items[0].invalid, "CLAIM_REGISTRY_KEYSET_CHANGED");
});

test("live collector rejects unavailable PR file inventory", async () => {
  const fixture = createLiveApi({ filesUnavailable: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.equal(live.items[0].invalid, "PR_FILES_UNAVAILABLE");
});

test("live collector rejects changed file outside canonical claim scope", async () => {
  const fixture = createLiveApi({ fileOutsideScope: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.match(live.items[0].invalid, /CANONICAL_CLAIM_PATH_VIOLATION/u);
});

test("live collector requires both rename source and destination to be owned", async () => {
  const fixture = createLiveApi({ renameFromOutsideScope: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.equal(
    live.items[0].invalid,
    "CANONICAL_CLAIM_PATH_VIOLATION:packages/other/secret.mjs",
  );
  assert.equal(live.items[0].writerActive, false);
  assert.equal(live.items[0].ready, false);
});

test("latest failed Trusted Claim Guard run cannot borrow an older success", async () => {
  const fixture = createLiveApi({ latestTrustRunFails: true });
  const trust = await verifyTrustedClaimEvidence({
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    headSha: LIVE_HEAD,
    branch: LIVE_BRANCH,
    prNumber: 7,
    api: fixture.api,
  });
  assert.equal(trust.trusted, false);
  assert.equal(trust.reason, "TRUSTED_CLAIM_GUARD_RUN_NOT_SUCCESS");
});

test("candidate cannot extend canonical claim expiry", async () => {
  const fixture = createLiveApi({ expiryExtended: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
    now: Date.parse("2026-10-01T12:30:00Z"),
  });
  assert.equal(
    live.items[0].invalid,
    "CLAIM_EXPIRY_EXCEEDS_CANONICAL_AUTHORITY",
  );
  assert.equal(live.items[0].writerActive, false);
  assert.equal(live.items[0].ready, false);
});

test("candidate cannot alter canonical proof contract", async () => {
  const fixture = createLiveApi({ proofContractDrift: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.match(
    live.items[0].invalid,
    /CHANGESET_AUTHORITY_DIVERGED_FROM_MAIN/u,
  );
  assert.equal(live.items[0].writerActive, false);
  assert.equal(live.items[0].ready, false);
});

test("reconciled trusted control drift is checked even when authority blobs match main", async () => {
  const fixture = createLiveApi({
    authorityBlobsIdentical: true,
    trustFileDiverged: true,
    trustRootReconciled: true,
  });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.equal(live.items[0].invalid, null);
  assert.equal(live.items[0].trust.trusted, true);
  assert.equal(live.items[0].trust.authority, "TRUSTED_CLAIM_GUARD_EXACT_HEAD");
  assert.equal(
    live.items[0].trust.trustRootReconciliation?.authority,
    "BASE_CONTROLLED_TRUST_ROOT_RECONCILIATION",
  );
});

test("authority equality cannot bypass missing trust-root reconciliation", async () => {
  const fixture = createLiveApi({
    authorityBlobsIdentical: true,
    trustFileDiverged: true,
    missingTrustRootReconciliation: true,
  });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.match(live.items[0].invalid, /TRUST_ROOT_RECONCILIATION_RUN_MISSING/u);
  assert.equal(live.items[0].writerActive, false);
  assert.equal(live.items[0].ready, false);
});

test("live collector keeps a recent ancestral writer valid without granting merge readiness", async () => {
  const fixture = createLiveApi({ exactBaseMismatch: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  const item = live.items[0];
  assert.equal(item.invalid, null);
  assert.equal(item.writerActive, true);
  assert.equal(item.ready, false);
  assert.equal(item.behindBy, 1);
  assert.equal(item.baseIsAncestorOfMain, true);
  const plan = buildSchedulerPlan({
    mainSha: LIVE_MAIN,
    workItems: live.items,
  });
  assert.equal(plan.violations.length, 0);
  assert.equal(plan.dispatchAllowed, false);
});

test("live collector preserves a missing branch claim as an invalid blocker", async () => {
  const fixture = createLiveApi({ missingClaim: true });
  const live = await collectLivePullWork({
    repository: "example/repo",
    api: fixture.api,
  });
  assert.equal(live.items.length, 1);
  assert.equal(live.items[0].invalid, "CLAIM_MISSING");
  assert.equal(live.items[0].writerActive, false);
  assert.equal(live.items[0].ready, false);
});

test("mdctl preserves canonical queue while attaching trusted live projection", () => {
  const ready = {
    changeSet: changeSet("MD-LIVE-Q", "live-q", {
      state: "MERGE_READY",
      baseSha: LIVE_MAIN,
    }),
    prNumber: 21,
    headSha: "e".repeat(40),
    openPr: true,
    writerActive: false,
    ready: true,
    dependenciesSatisfied: true,
    unresolvedDependencies: [],
    behindBy: 0,
    baseIsAncestorOfMain: true,
    statsKnown: true,
    changedFiles: 1,
    changedLines: 5,
    invalid: null,
    trust: { authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD" },
  };
  const invalid = {
    prNumber: 22,
    openPr: true,
    writerActive: false,
    ready: false,
    invalid: "CLAIM_REGISTRY_UNAVAILABLE",
  };
  const canonicalQueue = { version: 1, batches: [{ id: "canonical" }] };
  const observed = {
    mainSha: LIVE_MAIN,
    collectionState: "CAPTURED",
    blockers: [],
    integrationQueue: canonicalQueue,
  };
  const value = attachLiveSchedulerState(
    observed,
    {
      mainSha: LIVE_MAIN,
      authority: "TRUSTED_PR_EXACT_HEADS",
      items: [ready, invalid],
    },
    undefined,
  );
  assert.equal(value.integrationQueue, canonicalQueue);
  assert.equal(value.liveIntegrationQueueAuthority, "TRUSTED_PR_EXACT_HEADS");
  assert.equal(value.liveIntegrationQueueMainSha, LIVE_MAIN);
  assert.equal(value.liveSchedulerWork.length, 2);
  assert.equal(
    value.liveSchedulerWork[1].invalid,
    "CLAIM_REGISTRY_UNAVAILABLE",
  );
  assert.equal(value.liveIntegrationQueue.batches.length, 1);
  assert.equal(
    value.liveIntegrationQueue.batches[0].items[0].changeSetId,
    "MD-LIVE-Q",
  );
});

test("mdctl live projection fails closed on main mismatch", () => {
  assert.throws(
    () =>
      attachLiveSchedulerState(
        { mainSha: LIVE_MAIN },
        {
          mainSha: "d".repeat(40),
          authority: "TRUSTED_PR_EXACT_HEADS",
          items: [],
        },
      ),
    /MAIN_CHANGED_DURING_SCHEDULER_CAPTURE/u,
  );
});

test("mdctl plan consumes live scheduler grants instead of stale ready tasks", () => {
  const plan = buildMdctlPlan({
    observed: {
      mainSha: LIVE_MAIN,
      collectionState: "CAPTURED",
      blockers: [],
      readyCandidates: [],
      nextActions: [],
      nextReadyTasks: [{ id: "STALE", dispatchAllowed: true }],
      liveSchedulerPlan: {
        grants: [{ id: "MD-TRUSTED", exactBaseSha: LIVE_MAIN }],
        blocked: [],
        violations: [],
      },
    },
    invariants: { criticalFailures: [] },
  });
  assert.equal(plan.dispatchAllowed, true);
  assert.deepEqual(
    plan.dispatchableCandidates.map((item) => item.id),
    ["MD-TRUSTED"],
  );
});

test("mdctl schedule candidate requires exact main and carries dependencies", async () => {
  const manifest = changeSet("MD-SCHEDULE", "schedule-objective", {
    baseSha: LIVE_MAIN,
  });
  const accepted = await buildScheduleCandidateItem({
    manifest,
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    dependencyEvaluator: async () => ({
      satisfied: true,
      unresolved: [],
    }),
  });
  assert.equal(accepted.invalid, null);
  assert.equal(accepted.ready, true);
  assert.equal(accepted.changedFiles, 0);
  assert.equal(accepted.changedLines, 0);

  const stale = await buildScheduleCandidateItem({
    manifest: { ...manifest, baseSha: "a".repeat(40) },
    repository: "example/repo",
    mainSha: LIVE_MAIN,
    dependencyEvaluator: async () => ({
      satisfied: false,
      unresolved: ["MD-BASE"],
    }),
  });
  assert.equal(stale.invalid, "CANDIDATE_EXACT_BASE_MISMATCH");
  assert.equal(stale.dependenciesSatisfied, false);
  assert.deepEqual(stale.unresolvedDependencies, ["MD-BASE"]);
});

test("reconcile projection replaces stale main assumptions with observed main", () => {
  const mainSha = "b".repeat(40);
  const projection = buildLiveProjection({
    mainSha,
    backlog: {
      updatedFromMainSha: "c".repeat(40),
      items: [{ id: "MD-A", state: "READY" }],
    },
    registry: {
      claims: {
        "MD-A": {
          status: "IMPLEMENTING",
          branch: "feat/md-a",
          baseSha: "a".repeat(40),
          expiresAt: "2099-01-01T00:00:00Z",
        },
        "MD-OLD": {
          status: "IMPLEMENTING",
          branch: "feat/old",
          baseSha: "a".repeat(40),
          expiresAt: "2099-01-01T00:00:00Z",
        },
      },
    },
    releaseState: {
      candidateSha: null,
      stagingSha: "d".repeat(40),
      productionSha: "e".repeat(40),
    },
    liveWork: {
      mainSha,
      items: [
        {
          prNumber: 9,
          headSha: "f".repeat(40),
          changeSet: changeSet("MD-A", "objective-a"),
          claim: { branch: "feat/md-a" },
        },
      ],
    },
  });
  assert.equal(projection.currentMain, mainSha);
  assert.equal(projection.backlog.anchorMatchesMain, false);
  assert.equal(projection.backlog.versionedAnchorValid, true);
  assert.equal(
    projection.backlog.anchorSemantics,
    "SOURCE_PROVENANCE_NOT_CURRENT_MAIN_LOCK",
  );
  assert.deepEqual(projection.claims.staleCandidates, ["MD-OLD"]);
  assert.equal(
    projection.claims.items.find((item) => item.id === "MD-A").missionState,
    "ACTIVE_WORK",
  );
  assert.equal(
    projection.claims.items.find((item) => item.id === "MD-OLD").missionState,
    "ORPHANED",
  );
  assert.equal(projection.release.currentMain, mainSha);
});

test("reconcile integration queue is derived from trusted live MERGE_READY work", () => {
  const mainSha = "b".repeat(40);
  const projection = buildLiveProjection({
    mainSha,
    backlog: { updatedFromMainSha: null, items: [] },
    registry: { claims: {} },
    releaseState: {},
    liveWork: {
      mainSha,
      items: [
        {
          prNumber: 4,
          headSha: "c".repeat(40),
          openPr: true,
          writerActive: false,
          ready: true,
          changeSet: changeSet("MD-READY", "ready-objective", {
            state: "MERGE_READY",
            baseSha: mainSha,
          }),
          priority: "P0",
          dependenciesSatisfied: true,
          unresolvedDependencies: [],
          behindBy: 0,
          baseIsAncestorOfMain: true,
          statsKnown: true,
          changedFiles: 1,
          changedLines: 10,
          invalid: null,
        },
      ],
    },
  });
  assert.equal(projection.integrationQueue.batches.length, 1);
  assert.equal(
    projection.integrationQueue.batches[0].items[0].changeSetId,
    "MD-READY",
  );
});

test("reconcile projection fails closed when live collector main differs", () => {
  assert.throws(
    () =>
      buildLiveProjection({
        mainSha: "b".repeat(40),
        backlog: { items: [] },
        registry: { claims: {} },
        releaseState: {},
        liveWork: { mainSha: "c".repeat(40), items: [] },
      }),
    /RECONCILE_LIVE_MAIN_MISMATCH/u,
  );
});

test("mdctl rejects missing or unexpected live scheduler authority", () => {
  const observed = { mainSha: LIVE_MAIN };
  assert.throws(
    () =>
      attachLiveSchedulerState(
        observed,
        { mainSha: LIVE_MAIN, items: [] },
        undefined,
      ),
    /LIVE_SCHEDULER_AUTHORITY_INVALID/u,
  );
  assert.throws(
    () =>
      attachLiveSchedulerState(
        observed,
        {
          mainSha: LIVE_MAIN,
          authority: "UNTRUSTED",
          items: [],
        },
        undefined,
      ),
    /LIVE_SCHEDULER_AUTHORITY_INVALID/u,
  );
});

test("mdctl terminal main readback fails closed after dependency reads", async () => {
  assert.equal(
    await assertCurrentMainUnchanged({
      repository: "example/repo",
      expectedMainSha: LIVE_MAIN,
      api: async () => ({ sha: LIVE_MAIN }),
    }),
    LIVE_MAIN,
  );
  await assert.rejects(
    assertCurrentMainUnchanged({
      repository: "example/repo",
      expectedMainSha: LIVE_MAIN,
      api: async () => ({ sha: "d".repeat(40) }),
    }),
    /MAIN_CHANGED_AFTER_DEPENDENCY_READ/u,
  );
});

function dispatchFixture() {
  const mainSha = "b".repeat(40);
  const item = {
    changeSet: changeSet("MD-DISPATCH", "dispatch-worker", {
      baseSha: mainSha,
      state: "IMPLEMENTING",
    }),
    writerActive: false,
    ready: true,
    openPr: false,
    dependenciesSatisfied: true,
    priority: "P0",
    behindBy: 0,
    baseIsAncestorOfMain: true,
    statsKnown: true,
    changedFiles: 1,
    changedLines: 1,
    invalid: null,
  };
  return {
    mainSha,
    schedulerPlan: buildSchedulerPlan({ mainSha, workItems: [item] }),
  };
}

test("worker dispatch binds exact base, ready workspace and preferred healthy executor", () => {
  const { mainSha, schedulerPlan } = dispatchFixture();
  const plan = buildWorkerDispatchPlan({
    schedulerPlan,
    workspaceByChangeSet: {
      "MD-DISPATCH": {
        ready: true,
        exactBaseSha: mainSha,
        path: "/workspace/dispatch",
        runtime: "native",
      },
    },
    executorsByChangeSet: {
      "MD-DISPATCH": [
        {
          executor: "codex",
          installed: true,
          authenticated: true,
          functional: true,
          authorized: true,
        },
      ],
    },
  });
  assert.equal(plan.dispatchAllowed, true);
  assert.equal(plan.dispatches[0].exactBaseSha, mainSha);
  assert.equal(plan.dispatches[0].executor, "codex");
  assert.equal(plan.dispatches[0].fallbackUsed, false);
});

test("worker dispatch falls back only to a healthy explicitly authorized executor", () => {
  const { mainSha, schedulerPlan } = dispatchFixture();
  const plan = buildWorkerDispatchPlan({
    schedulerPlan,
    workspaceByChangeSet: {
      "MD-DISPATCH": {
        ready: true,
        exactBaseSha: mainSha,
        path: "/workspace/dispatch",
        runtime: "debian-proot",
      },
    },
    executorsByChangeSet: {
      "MD-DISPATCH": [
        {
          executor: "codex",
          installed: true,
          authenticated: true,
          functional: false,
          authorized: true,
        },
        {
          executor: "chatgpt-control",
          installed: true,
          authenticated: true,
          functional: true,
          authorized: true,
        },
      ],
    },
  });
  assert.equal(plan.dispatchAllowed, true);
  assert.equal(plan.dispatches[0].executor, "chatgpt-control");
  assert.equal(plan.dispatches[0].fallbackUsed, true);
});

test("worker dispatch blocks wrong or unready workspace before executor selection", () => {
  const { mainSha, schedulerPlan } = dispatchFixture();
  for (const workspace of [
    { ready: false, exactBaseSha: mainSha, path: "/workspace/dispatch" },
    { ready: true, exactBaseSha: "a".repeat(40), path: "/workspace/dispatch" },
  ]) {
    const plan = buildWorkerDispatchPlan({
      schedulerPlan,
      workspaceByChangeSet: { "MD-DISPATCH": workspace },
      executorsByChangeSet: {
        "MD-DISPATCH": [
          {
            executor: "codex",
            installed: true,
            authenticated: true,
            functional: true,
            authorized: true,
          },
        ],
      },
    });
    assert.equal(plan.dispatchAllowed, false);
    assert.equal(plan.blocked.at(-1).code, "WORKSPACE_BOOTSTRAP_INCOMPLETE");
  }
});

test("worker dispatch blocks when no healthy executor remains", () => {
  const { mainSha, schedulerPlan } = dispatchFixture();
  const plan = buildWorkerDispatchPlan({
    schedulerPlan,
    workspaceByChangeSet: {
      "MD-DISPATCH": {
        ready: true,
        exactBaseSha: mainSha,
        path: "/workspace/dispatch",
        runtime: "debian-proot",
      },
    },
    executorsByChangeSet: {
      "MD-DISPATCH": [
        {
          executor: "codex",
          installed: true,
          authenticated: true,
          functional: false,
          authorized: true,
        },
      ],
    },
  });
  assert.equal(plan.dispatchAllowed, false);
  assert.equal(plan.blocked.at(-1).code, "EXECUTOR_UNAVAILABLE");
});

test("worker dispatch fails closed on unresolved control projection drift", () => {
  const { schedulerPlan } = dispatchFixture();
  const plan = buildWorkerDispatchPlan({
    schedulerPlan,
    projectionSafe: false,
    workspaceByChangeSet: {},
    executorsByChangeSet: {},
  });
  assert.equal(plan.dispatchAllowed, false);
  assert.equal(plan.blocked.at(-1).code, "CONTROL_PROJECTION_DRIFT");
  assert.deepEqual(plan.dispatches, []);
});
