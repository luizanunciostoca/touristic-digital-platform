import assert from "node:assert/strict";
import test from "node:test";
import {
  collectObservedState,
  parseArguments,
  probeRuntime,
  renderSummary,
  runtimeOrigin,
  summarizeRuntime,
  validateRepository,
} from "../control-state/status.mjs";

const MAIN = "a".repeat(40);
const TREE = "b".repeat(40);
const OLD = "c".repeat(40);
const NOW = "2026-09-28T08:00:00.000Z";
const REPO = "fixture/morro";
const root = "repos/" + REPO;
const content = (value) => ({
  encoding: "base64",
  content: Buffer.from(JSON.stringify(value)).toString("base64"),
});
function fixtures() {
  return {
    registry: {
      registryAuthority: "ORCHESTRATOR",
      claims: {
        "MD-TASK": {
          owner: "WORKER",
          branch: "infra/task",
          baseSha: MAIN,
          status: "IMPLEMENTING",
          expiresAt: "2026-09-30T00:00:00Z",
          paths: ["tooling/control-state/**"],
        },
      },
    },
    manifest: {
      id: "MD-TASK",
      branch: "infra/task",
      baseSha: MAIN,
      state: "IMPLEMENTING",
      risk: "high",
      dependencies: [],
    },
    pulls: [
      [
        {
          number: 1,
          head: { ref: "infra/task", sha: OLD, repo: { full_name: REPO } },
          base: { sha: MAIN },
          draft: true,
        },
      ],
      [],
    ],
  };
}
function harness(overrides = {}) {
  const values = fixtures();
  const calls = [];
  let mainReads = 0;
  const api = async (path, options) => {
    calls.push({ path, options });
    if (overrides.fail?.(path)) throw new Error("TOKEN=must-never-leak");
    if (path === root + "/commits/main")
      return {
        sha: ++mainReads > 1 && overrides.moveMain ? OLD : MAIN,
        commit: { tree: { sha: TREE } },
      };
    if (path.includes("/pulls?state=closed")) return overrides.closed ?? [[]];
    if (path.includes("/git/matching-refs/")) return overrides.refs ?? [];
    if (path.includes("/compare/"))
      return {
        status: overrides.diverged ? "diverged" : "ahead",
        base_commit: { sha: path.split("/compare/")[1].split("...")[0] },
        merge_base_commit: {
          sha: overrides.diverged
            ? TREE
            : path.split("/compare/")[1].split("...")[0],
        },
      };
    if (path.includes("/pulls?")) return overrides.pulls ?? values.pulls;
    if (path.includes("/contents/.github/morro-control/claims.json"))
      return content(overrides.registry ?? values.registry);
    if (path.includes("/contents/.github/morro-control/backlog.json"))
      return content({
        items: [
          { id: "MD-TASK", priority: "P0", state: "MERGED", dependencies: [] },
        ],
      });
    if (path.includes("/contents/.morro/changesets/"))
      return content(
        path.endsWith("ref=" + OLD)
          ? (overrides.historicalManifest ??
              overrides.manifest ??
              values.manifest)
          : (overrides.manifest ?? values.manifest),
      );
    if (path.includes("/actions/runs?status="))
      return [
        { workflow_runs: [{ id: 42, status: "in_progress", head_sha: MAIN }] },
      ];
    if (path.includes("/actions/runs?"))
      return {
        total_count: 40000,
        workflow_runs: [
          {
            id: 41,
            status: "completed",
            conclusion: "success",
            head_sha: MAIN,
          },
        ],
      };
    if (path.includes("/deployments/7/statuses")) return [{ state: "success" }];
    if (path.includes("/deployments?"))
      return [{ id: 7, environment: "staging", sha: OLD, created_at: NOW }];
    throw new Error("UNEXPECTED_FIXTURE_ENDPOINT");
  };
  return {
    calls,
    options: {
      repository: REPO,
      api,
      now: () => NOW,
      workspace: async () => ({ headSha: OLD, branch: "old", dirty: true }),
      stagingUrl: "https://staging.test",
      productionUrl: "https://production.test",
      probe: async () => ({
        state: "HEALTHY",
        releaseSha: MAIN,
        identityVerified: true,
      }),
    },
  };
}

test("snapshot binds versioned reads to live main and paginates PRs", async () => {
  const { calls, options } = harness();
  const state = await collectObservedState(options);
  assert.equal(state.mainSha, MAIN);
  assert.equal(state.mainTreeSha, TREE);
  assert.equal(state.consistency, "MAIN_STABLE_VOLATILE_SOURCES_NON_ATOMIC");
  assert.equal(state.collectionState, "CAPTURED");
  assert.equal(state.activePrs.length, 1);
  assert.equal(state.activeClaims[0].openPrNumbers[0], 1);
  assert.equal(state.ci.activeRuns.length, 1);
  assert.equal(state.ci.recentSampleLimit, 30);
  assert.equal(state.ci.recentRuns.length, 1);
  assert.equal(state.deployments.environments.staging.sha, OLD);
  assert.equal(
    state.stagingSha,
    MAIN,
    "deployment records cannot override runtime identity",
  );
  assert.equal(state.runningTasks[0].processVerified, false);
  assert.equal(state.agents.verifiedRunningCount, null);
  assert.deepEqual(
    state.nextReadyTasks,
    [],
    "stale desired state must not auto-advance tasks",
  );
  assert.equal(
    calls.filter((call) => call.path.includes("/commits/main")).length,
    2,
  );
  assert.ok(
    calls
      .filter((call) => call.path.includes("/contents/"))
      .every((call) => call.path.endsWith("ref=" + MAIN)),
  );
  assert.ok(
    calls.find((call) => call.path.includes("/pulls?")).options.paginate,
  );
});

test("moved main invalidates snapshot without concealing captured identity", async () => {
  const { options } = harness({ moveMain: true });
  const state = await collectObservedState(options);
  assert.equal(state.consistency, "INCONSISTENT");
  assert.equal(state.mainSha, MAIN);
  assert.equal(state.mainShaAtEnd, OLD);
  assert.ok(
    state.blockers.some((item) => item.code === "MAIN_CHANGED_OR_UNVERIFIABLE"),
  );
});

test("API errors become explicit unknown sources and never leak stderr", async () => {
  const { options } = harness({ fail: (path) => path.includes("/pulls?") });
  const state = await collectObservedState(options);
  assert.equal(state.collectionState, "PARTIAL");
  assert.equal(state.sources.pullRequests.state, "UNAVAILABLE");
  assert.ok(state.blockers.some((item) => item.subject === "pullRequests"));
  assert.equal(JSON.stringify(state).includes("must-never-leak"), false);
});

test("invalid registry and failed main capture fail closed", async () => {
  const { options } = harness({
    registry: { registryAuthority: "WORKER", claims: {} },
  });
  let state = await collectObservedState(options);
  assert.equal(state.sources.claims.state, "UNAVAILABLE");
  assert.deepEqual(state.activeClaims, []);
  state = await collectObservedState(
    harness({ fail: (path) => path.endsWith("/commits/main") }).options,
  );
  assert.equal(state.mainSha, null);
  assert.equal(state.consistency, "INCONSISTENT");
  assert.equal(state.sources.claims.state, "UNAVAILABLE");
});

test("claims without PRs stay visible and are never implicitly removed", async () => {
  const { options } = harness({ pulls: [[], []] });
  const state = await collectObservedState(options);
  assert.equal(state.activeClaims.length, 1);
  assert.ok(
    state.blockers.some((item) => item.code === "CLAIM_WITHOUT_OPEN_PR"),
  );
  assert.equal(state.activeClaims[0].activeByRegistry, true);
});

test("fork PR with matching branch cannot satisfy canonical claim", async () => {
  const { options } = harness({
    pulls: [
      [
        {
          number: 2,
          head: {
            ref: "infra/task",
            sha: OLD,
            repo: { full_name: "fork/morro" },
          },
          base: { sha: MAIN },
        },
      ],
    ],
  });
  const state = await collectObservedState(options);
  assert.deepEqual(state.activeClaims[0].openPrNumbers, []);
});

test("expired claims and manifest identity mismatch are blockers", async () => {
  const data = fixtures();
  data.registry.claims["MD-TASK"].expiresAt = "2026-09-27T00:00:00Z";
  data.manifest.baseSha = OLD;
  const { options } = harness(data);
  const state = await collectObservedState(options);
  assert.equal(state.observedClaims[0].activeByRegistry, false);
  assert.ok(
    state.blockers.some((item) => item.code === "CLAIM_INACTIVE_OR_EXPIRED"),
  );
  assert.ok(
    state.blockers.some(
      (item) => item.code === "CLAIM_MANIFEST_IDENTITY_MISMATCH",
    ),
  );
});

function healthy() {
  return [
    { httpStatus: 200, body: { status: "live" }, releaseSha: MAIN },
    {
      httpStatus: 200,
      body: {
        readiness: "ready",
        status: "healthy",
        checks: [{ name: "commerce-runtime", status: "pass", critical: false }],
      },
      releaseSha: MAIN,
      deploymentId: "dep-safe",
    },
  ];
}
test("HTTP200 readiness ready plus degraded commerce is not healthy", () => {
  const [health, ready] = healthy();
  ready.body.status = "degraded";
  ready.body.checks[0] = {
    name: "commerce-runtime",
    status: "fail",
    detail: "mysql://user:secret@db",
  };
  const result = summarizeRuntime(health, ready);
  assert.equal(result.state, "UNHEALTHY_OR_UNVERIFIED");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("healthy runtime requires matching identities and explicit commerce checks", () => {
  assert.equal(summarizeRuntime(...healthy()).state, "HEALTHY");
  for (const mutate of [
    (h, r) => {
      r.releaseSha = OLD;
    },
    (h, r) => {
      r.body.checks = [];
    },
    (h, r) => {
      r.body.checks[0].name = "unrelated";
    },
    (h, r) => {
      r.body.checks[0].status = "disabled";
    },
    (h, r) => {
      r.body.status = undefined;
    },
    (h, r) => {
      h.httpStatus = 503;
    },
  ]) {
    const pair = healthy();
    mutate(...pair);
    assert.equal(summarizeRuntime(...pair).state, "UNHEALTHY_OR_UNVERIFIED");
  }
});

test("runtime fetch sends no credentials, forbids redirects, and reads only health endpoints", async () => {
  const calls = [];
  const pair = healthy();
  const result = await probeRuntime(
    "https://runtime.test",
    async (url, options) => {
      calls.push({ url: url.href, options });
      const value = pair[calls.length - 1];
      return new Response(JSON.stringify(value.body), {
        status: value.httpStatus,
        headers: {
          "x-release-sha": value.releaseSha,
          "x-deployment-id": "dep-safe",
        },
      });
    },
  );
  assert.equal(result.state, "HEALTHY");
  assert.deepEqual(calls.map((call) => call.url).sort(), [
    "https://runtime.test/healthz",
    "https://runtime.test/readyz",
  ]);
  assert.ok(
    calls.every(
      (call) =>
        call.options.redirect === "error" &&
        !call.options.headers.Authorization,
    ),
  );
});

test("runtime configuration, availability and main drift remain separate blockers", async () => {
  const { options } = harness();
  options.stagingUrl = undefined;
  options.probe = async () => ({
    state: "UNHEALTHY_OR_UNVERIFIED",
    releaseSha: OLD,
  });
  const state = await collectObservedState(options);
  assert.equal(state.runtimeHealth.staging.state, "NOT_CONFIGURED");
  assert.equal(state.productionSha, OLD);
  assert.ok(state.blockers.some((item) => item.code === "RUNTIME_MAIN_DRIFT"));
  assert.ok(
    state.blockers.some(
      (item) => item.code === "RUNTIME_UNHEALTHY_OR_UNVERIFIED",
    ),
  );
});

test("arguments reject credential URLs, non-HTTPS and shell-like repository values", () => {
  for (const value of [
    "http://example.test",
    "https://user:secret@example.test",
    "https://example.test/?token=x",
    "https://example.test/path",
    "https://example.test/#x",
  ])
    assert.throws(() => runtimeOrigin(value));
  assert.throws(() => validateRepository("owner/repo;echo secret"));
  assert.throws(() => parseArguments(["--unknown"], {}));
  assert.throws(() => parseArguments(["--repo"], {}));
  const parsed = parseArguments(
    ["status", "--repo", REPO, "--summary", "--strict"],
    {},
  );
  assert.equal(parsed.options.repository, REPO);
  assert.equal(parsed.summary, true);
  assert.equal(parsed.strict, true);
});

test("summary exposes required bootstrap sections and never claims release proof", async () => {
  const summary = renderSummary(await collectObservedState(harness().options));
  for (const title of [
    "MAIN ",
    "OPEN PRS ",
    "CLAIMS ",
    "AGENTS ",
    "CI ",
    "STAGING ",
    "PRODUCTION ",
    "BLOCKERS ",
    "NEXT READY TASKS ",
    "OBSERVATION ",
  ])
    assert.ok(summary.includes(title));
  assert.ok(summary.includes("running=UNVERIFIED"));
});

test("observed blockers produce concrete next investigations without granting dispatch", async () => {
  const { options } = harness({ pulls: [[], []] });
  const state = await collectObservedState(options);
  assert.equal(state.desiredTasks[0].declaredState, "MERGED");
  assert.equal(state.desiredTasks[0].dispatchAllowed, false);
  assert.equal(state.desiredTasks[0].requiresFabricProof, true);
  assert.ok(state.desiredTasks[0].reason);
  assert.ok(
    state.nextActions.some(
      (item) =>
        item.action ===
        "CHECK_BRANCH_AND_MERGED_PR_HISTORY_BEFORE_RETIRING_CLAIM",
    ),
  );
  assert.ok(state.nextActions.every((item) => item.dispatchAllowed === false));
  assert.ok(renderSummary(state).includes("NEXT ACTIONS"));
});

test("malformed check names fail closed and cannot expose runtime diagnostics", () => {
  for (const check of [
    { status: "pass", critical: true },
    { name: "mysql://user:secret@host/db", status: "pass", critical: true },
    { name: "authorization=Bearer secret", status: "pass", critical: true },
    { name: "commerce-runtime", status: "pass" },
  ]) {
    const [health, ready] = healthy();
    ready.body.checks = [check];
    const result = summarizeRuntime(health, ready);
    assert.equal(result.state, "UNHEALTHY_OR_UNVERIFIED");
    assert.equal(JSON.stringify(result).includes("secret"), false);
    assert.equal(JSON.stringify(result).includes("mysql:"), false);
  }
});

test("duplicate runtime check identifiers do not prove health", () => {
  const [health, ready] = healthy();
  ready.body.checks.push({ ...ready.body.checks[0] });
  assert.equal(
    summarizeRuntime(health, ready).state,
    "UNHEALTHY_OR_UNVERIFIED",
  );
});

test("requested Actions runs remain visible as active work", async () => {
  const { options } = harness();
  const originalApi = options.api;
  options.api = async (path, args) =>
    path.includes("status=requested")
      ? [{ workflow_runs: [{ id: 99, status: "requested", head_sha: MAIN }] }]
      : originalApi(path, args);
  const state = await collectObservedState(options);
  assert.ok(
    state.ci.activeRuns.some(
      (run) => run.id === 99 && run.status === "requested",
    ),
  );
});

test("unavailable PR source is unknown rather than evidence that a claim has no PR", async () => {
  const state = await collectObservedState(
    harness({ fail: (path) => path.includes("/pulls?") }).options,
  );
  assert.equal(state.activeClaims[0].prObservation, "UNAVAILABLE");
  assert.equal(
    state.blockers.some((item) => item.code === "CLAIM_WITHOUT_OPEN_PR"),
    false,
  );
});

test("declared ready with unproven dependencies is only a non-dispatchable candidate", async () => {
  const { options } = harness();
  const originalApi = options.api;
  options.api = async (path, args) =>
    path.includes("/backlog.json")
      ? content({
          items: [
            {
              id: "MD-NEXT",
              state: "READY",
              priority: "P0",
              dependencies: ["MD-MISSING-PROOF"],
            },
          ],
        })
      : originalApi(path, args);
  const state = await collectObservedState(options);
  assert.deepEqual(state.nextReadyTasks, []);
  assert.equal(state.readyCandidates[0].basis, "DESIRED_STATE_CANDIDATE");
  assert.equal(state.readyCandidates[0].dispatchAllowed, false);
  assert.equal(state.readyCandidates[0].requiresFabricProof, true);
  assert.equal(
    state.readyCandidates[0].reason,
    "DECLARED_READY_DEPENDENCY_PROOF_NOT_COLLECTED",
  );
});

function mergedFixture() {
  const data = fixtures();
  data.registry.claims["MD-TASK"].baseSha = TREE;
  data.manifest.baseSha = TREE;
  return {
    registry: data.registry,
    manifest: data.manifest,
    pulls: [[]],
    closed: [
      [
        {
          number: 9,
          state: "closed",
          merged_at: NOW,
          merge_commit_sha: OLD,
          head: { ref: "infra/task", repo: { full_name: REPO } },
          base: { ref: "main", repo: { full_name: REPO } },
        },
      ],
    ],
  };
}

test("merged claim derives inactive observation with ancestry and no release inference", async () => {
  for (const refs of [
    [],
    [{ ref: "refs/heads/infra/task", object: { type: "commit", sha: MAIN } }],
  ]) {
    const input = mergedFixture();
    const { options, calls } = harness({ ...input, refs });
    const state = await collectObservedState(options);
    assert.deepEqual(state.activeClaims, []);
    assert.deepEqual(state.runningTasks, []);
    assert.deepEqual(state.agents.claimedOwners, []);
    assert.equal(state.observedClaims[0].declaredState, "IMPLEMENTING");
    assert.equal(state.observedClaims[0].observedState, "MERGED");
    assert.equal(state.observedClaims[0].mergeEvidence.mergeSha, OLD);
    assert.equal(state.observedClaims[0].mergeEvidence.mainSha, MAIN);
    assert.equal(state.observedClaims[0].mergeEvidence.releaseVerified, false);
    assert.equal(
      state.desiredTasks[0].reason,
      "MERGE_OBSERVED_RELEASE_PROOF_NOT_INFERRED",
    );
    assert.deepEqual(state.nextReadyTasks, []);
    assert.ok(
      calls.find((call) => call.path.includes("/pulls?state=closed")).options
        .paginate,
    );
  }
});

test("closed PR mismatch, missing ancestry and unreadable evidence never retire claims", async () => {
  const invalidPrs = [
    { merged_at: null },
    { merge_commit_sha: "bad" },
    { head: { ref: "infra/task", repo: { full_name: "fork/morro" } } },
    { base: { ref: "other", repo: { full_name: REPO } } },
  ];
  const cases = invalidPrs.map((patch) => {
    const input = mergedFixture();
    Object.assign(input.closed[0][0], patch);
    return input;
  });
  cases.push({
    ...mergedFixture(),
    historicalManifest: { ...fixtures().manifest, id: "MD-OTHER" },
  });
  cases.push({
    ...mergedFixture(),
    historicalManifest: { ...fixtures().manifest, baseSha: MAIN },
  });
  cases.push({
    ...mergedFixture(),
    historicalManifest: { ...fixtures().manifest, branch: "infra/other" },
  });
  cases.push({ ...mergedFixture(), refs: [{}] });
  cases.push({
    ...mergedFixture(),
    refs: [{ ref: "refs/heads/infra/task", object: {} }],
  });
  cases.push({
    ...mergedFixture(),
    fail: (path) => path.includes("/compare/" + TREE + "..." + OLD),
  });
  cases.push({ ...mergedFixture(), diverged: true });
  cases.push({
    ...mergedFixture(),
    fail: (path) => path.includes("/compare/"),
  });
  cases.push({
    ...mergedFixture(),
    fail: (path) => path.includes("/matching-refs/"),
  });
  cases.push({
    ...mergedFixture(),
    refs: [
      { ref: "refs/heads/infra/task", object: { type: "commit", sha: TREE } },
    ],
    fail: (path) => path.includes("/compare/" + TREE),
  });
  for (const input of cases) {
    const state = await collectObservedState(harness(input).options);
    assert.equal(state.activeClaims.length, 1);
    assert.equal(state.activeClaims[0].observedState, "UNVERIFIED");
    assert.equal(state.activeClaims[0].mergeEvidence, null);
    assert.ok(
      state.blockers.some((item) => item.code === "CLAIM_WITHOUT_OPEN_PR"),
    );
  }
});

test("active PR and exact branch ref prevent historical merge from hiding new work", async () => {
  const input = mergedFixture();
  input.pulls = fixtures().pulls;
  const state = await collectObservedState(harness(input).options);
  assert.equal(state.activeClaims[0].observedState, "OPEN_PR");
  assert.equal(state.activeClaims[0].mergeEvidence, null);
  const { options } = harness({
    ...mergedFixture(),
    refs: [
      { ref: "refs/heads/infra/task", object: { type: "commit", sha: TREE } },
    ],
  });
  const original = options.api;
  options.api = (path, opts) =>
    path.includes("/compare/" + TREE)
      ? Promise.resolve({ status: "diverged" })
      : original(path, opts);
  assert.equal((await collectObservedState(options)).activeClaims.length, 1);
});
