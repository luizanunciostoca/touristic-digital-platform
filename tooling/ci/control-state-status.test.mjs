import assert from "node:assert/strict";
import test from "node:test";
import {
  collectObservedState,
  parseArguments,
  probeRuntime,
  renderSummary,
  runtimeOrigin,
  summarizeRuntime,
  selectLatestWorkflowRuns,
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
  let candidateReads = 0;
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
    if (path.includes("/contents/.github/morro-control/release-state.json"))
      return content(
        overrides.releaseState ?? {
          schemaVersion: 1,
          expectedCertifiedReleaseSha: MAIN,
        },
      );
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
    if (path.includes("/actions/runs?head_sha="))
      return (
        (++candidateReads > 1 ? overrides.candidateReadbackPages : null) ??
        overrides.candidatePages ?? [{ total_count: 0, workflow_runs: [] }]
      );
    if (path.includes("/check-runs?"))
      return [{ check_runs: overrides.checks ?? [] }];
    if (/\/actions\/runs\/\d+\/attempts\/\d+\/jobs\?/u.test(path))
      return [
        {
          jobs: (overrides.jobs ?? []).filter(
            (job) => job.run_id === Number(path.match(/\/runs\/(\d+)\//u)[1]),
          ),
        },
      ];
    if (/\/actions\/runs\/\d+$/u.test(path))
      return (
        overrides.runReadback ??
        overrides.candidatePages
          ?.flatMap((page) => page.workflow_runs)
          .find((run) => String(run.id) === path.split("/").at(-1))
      );
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
  assert.equal(state.sources["candidateCi:1"].state, "AVAILABLE");
  assert.ok(
    calls.find((call) => call.path.includes("/actions/runs?head_sha="))?.options
      .paginate,
  );
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

test("candidate CI is collected independently of the global recent sample and incomplete pagination fails closed", async () => {
  const candidate = {
    id: 101,
    head_sha: OLD,
    head_branch: "infra/task",
    run_attempt: 2,
  };
  const { options } = harness({
    candidatePages: [{ total_count: 1, workflow_runs: [candidate] }],
  });
  const state = await collectObservedState(options);
  assert.equal(state.ci.candidateRuns[0].id, 101);
  assert.equal(state.ci.candidateRuns[0].runAttempt, 2);
  const incomplete = await collectObservedState(
    harness({
      candidatePages: [{ total_count: 2, workflow_runs: [candidate] }],
    }).options,
  );
  assert.equal(incomplete.sources["candidateCi:1"].state, "UNAVAILABLE");
  assert.equal(incomplete.collectionState, "PARTIAL");
});

test("candidate proof checks the executed job and rejects a rerun changing during capture", async () => {
  const run = {
    id: 101,
    workflow_id: 10,
    head_sha: OLD,
    head_branch: "infra/task",
    path: ".github/workflows/quality.yml",
    run_attempt: 2,
    event: "pull_request",
    created_at: NOW,
    updated_at: NOW,
    status: "completed",
    conclusion: "success",
    pull_requests: [{ number: 1, head: { sha: OLD }, base: { sha: MAIN } }],
  };
  const job = {
    id: 301,
    run_id: 101,
    name: "quality",
    head_sha: OLD,
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/fixture/morro/actions/runs/101/job/301",
    check_run_url: "https://api.github.com/repos/fixture/morro/check-runs/401",
    steps: [
      {
        name: "Require every selected suite and core gate to succeed",
        status: "completed",
        conclusion: "success",
      },
    ],
  };
  const check = {
    id: 401,
    name: "quality",
    head_sha: OLD,
    status: "completed",
    conclusion: "success",
    app: { id: 15368, slug: "github-actions" },
    details_url: job.html_url,
  };
  const input = {
    candidatePages: [{ total_count: 1, workflow_runs: [run] }],
    jobs: [job],
    checks: [check],
  };
  const state = await collectObservedState(harness(input).options);
  assert.equal(state.ci.candidateRuns[0].requiredJobVerified, true);
  const noJobs = await collectObservedState(
    harness({ ...input, jobs: [] }).options,
  );
  assert.equal(noJobs.ci.candidateRuns[0].requiredJobVerified, false);
  const moved = await collectObservedState(
    harness({ ...input, runReadback: { ...run, run_attempt: 3 } }).options,
  );
  assert.equal(moved.sources["candidateCi:1"].state, "UNAVAILABLE");

  const merge = {
    ...run,
    id: 102,
    workflow_id: 11,
    path: ".github/workflows/morro-merge-gate.yml",
  };
  const mergeJob = {
    ...job,
    id: 302,
    run_id: merge.id,
    name: "morro/merge-gate",
    html_url: "https://github.com/fixture/morro/actions/runs/102/job/302",
    check_run_url: "https://api.github.com/repos/fixture/morro/check-runs/402",
    steps: [
      {
        name: "Run trusted merge-gate policy",
        status: "completed",
        conclusion: "success",
      },
    ],
  };
  const complete = {
    candidatePages: [{ total_count: 2, workflow_runs: [run, merge] }],
    jobs: [job, mergeJob],
    checks: [
      check,
      {
        ...check,
        id: 402,
        name: mergeJob.name,
        details_url: mergeJob.html_url,
      },
    ],
  };
  const accepted = await collectObservedState(harness(complete).options);
  assert.equal(
    selectLatestWorkflowRuns(accepted.ci.candidateRuns, {
      headSha: OLD,
      branch: "infra/task",
      baseSha: MAIN,
      prNumber: 1,
    }).succeeded,
    true,
  );
  const newer = { ...run, id: 103, created_at: "2026-09-28T08:00:01Z" };
  for (const changed of [
    { ...newer, status: "in_progress", conclusion: null },
    { ...newer, conclusion: "failure" },
    { ...newer, pull_requests: [] },
    {
      ...newer,
      pull_requests: [{ number: 1, head: { sha: null }, base: { sha: MAIN } }],
    },
    { ...run, run_attempt: 3 },
  ]) {
    const current = await collectObservedState(
      harness({
        ...complete,
        candidateReadbackPages: [
          { total_count: 3, workflow_runs: [run, merge, changed] },
        ],
      }).options,
    );
    assert.equal(current.sources["candidateCi:1"].state, "UNAVAILABLE");
    assert.deepEqual(current.ci.candidateRuns, []);
  }
  const incompleteReadback = await collectObservedState(
    harness({
      ...complete,
      candidateReadbackPages: [{ total_count: 3, workflow_runs: [run, merge] }],
    }).options,
  );
  assert.equal(
    incompleteReadback.sources["candidateCi:1"].state,
    "UNAVAILABLE",
  );
  const unrelated = await collectObservedState(
    harness({
      ...complete,
      candidateReadbackPages: [
        {
          total_count: 3,
          workflow_runs: [
            run,
            merge,
            {
              ...newer,
              pull_requests: [
                { number: 99, head: { sha: OLD }, base: { sha: MAIN } },
              ],
            },
          ],
        },
      ],
    }).options,
  );
  assert.equal(unrelated.sources["candidateCi:1"].state, "AVAILABLE");

  for (const stage of ["later PR", "manifest", "runtime", "deployment"]) {
    let changed = false;
    const { options } = harness({
      ...complete,
      pulls: [
        [
          ...fixtures().pulls[0],
          {
            number: 2,
            head: { ref: "other", sha: TREE, repo: { full_name: REPO } },
            base: { sha: MAIN },
          },
        ],
      ],
    });
    const originalApi = options.api;
    const originalProbe = options.probe;
    options.api = async (path, opts) => {
      if (
        (stage === "later PR" && path.includes("head_sha=" + TREE)) ||
        (stage === "manifest" &&
          path.includes("/contents/.morro/changesets/")) ||
        (stage === "deployment" && path.includes("/deployments/7/statuses"))
      )
        changed = true;
      if (path.includes("head_sha=" + TREE))
        return [{ total_count: 0, workflow_runs: [] }];
      if (changed && path.includes("head_sha=" + OLD))
        return [
          {
            total_count: 3,
            workflow_runs: [run, merge, { ...newer, pull_requests: [] }],
          },
        ];
      return originalApi(path, opts);
    };
    options.probe = async (...args) => {
      if (stage === "runtime") changed = true;
      return originalProbe(...args);
    };
    const state = await collectObservedState(options);
    assert.equal(changed, true, stage);
    assert.equal(state.sources["candidateCi:1"].state, "UNAVAILABLE", stage);
    assert.deepEqual(state.ci.candidateRuns, [], stage);
  }

  const otherRuns = [run, merge].map((entry) => ({
    ...entry,
    id: entry.id + 10,
    head_branch: "infra/second",
    pull_requests: [{ number: 2, head: { sha: OLD }, base: { sha: MAIN } }],
  }));
  const sharedHead = harness({
    ...complete,
    pulls: [
      [
        ...fixtures().pulls[0],
        {
          number: 2,
          head: { ref: "infra/second", sha: OLD, repo: { full_name: REPO } },
          base: { sha: MAIN },
        },
      ],
    ],
    candidatePages: [
      { total_count: 4, workflow_runs: [run, merge, ...otherRuns] },
    ],
    jobs: [
      ...complete.jobs,
      ...complete.jobs.map((entry) => ({
        ...entry,
        id: entry.id + 10,
        run_id: entry.run_id + 10,
        html_url: entry.html_url
          .replace(String(entry.run_id), String(entry.run_id + 10))
          .replace(String(entry.id), String(entry.id + 10)),
        check_run_url: entry.check_run_url.replace(/40(\d)$/, "41$1"),
      })),
    ],
    checks: [
      ...complete.checks,
      ...complete.checks.map((entry, index) => ({
        ...entry,
        id: entry.id + 10,
        details_url: `https://github.com/fixture/morro/actions/runs/${111 + index}/job/${311 + index}`,
      })),
    ],
  });
  const sharedState = await collectObservedState(sharedHead.options);
  for (const [prNumber, branch] of [
    [1, "infra/task"],
    [2, "infra/second"],
  ])
    assert.equal(
      selectLatestWorkflowRuns(sharedState.ci.candidateRuns, {
        headSha: OLD,
        baseSha: MAIN,
        prNumber,
        branch,
      }).succeeded,
      true,
      branch,
    );
});

test("main is rechecked after all final candidate run pages", async () => {
  const { options } = harness();
  const originalApi = options.api;
  let candidateReads = 0,
    moved = false;
  options.api = async (path, opts) => {
    if (path.includes("/actions/runs?head_sha=") && ++candidateReads === 2)
      moved = true;
    if (path === root + "/commits/main" && moved)
      return { sha: OLD, commit: { tree: { sha: TREE } } };
    return originalApi(path, opts);
  };
  const state = await collectObservedState(options);
  assert.equal(candidateReads, 2);
  assert.equal(state.consistency, "INCONSISTENT");
  assert.equal(state.mainShaAtEnd, OLD);
  assert.ok(
    state.blockers.some(
      (entry) => entry.code === "MAIN_CHANGED_OR_UNVERIFIABLE",
    ),
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

test("runtime configuration and unhealthy state remain separate blockers", async () => {
  const { options } = harness();
  options.stagingUrl = undefined;
  options.probe = async () => ({
    state: "UNHEALTHY_OR_UNVERIFIED",
    releaseSha: OLD,
  });
  const state = await collectObservedState(options);
  assert.equal(state.runtimeHealth.staging.state, "NOT_CONFIGURED");
  assert.equal(state.productionSha, OLD);
  assert.ok(
    state.blockers.some(
      (item) => item.code === "RUNTIME_UNHEALTHY_OR_UNVERIFIED",
    ),
  );
  assert.equal(
    state.blockers.some(
      (item) => item.code === "RUNTIME_CERTIFIED_RELEASE_DRIFT",
    ),
    false,
  );
});

test("healthy runtime drift compares against expected certified release", async () => {
  const { options } = harness();
  options.probe = async () => ({
    state: "HEALTHY",
    releaseSha: OLD,
    identityVerified: true,
  });
  const state = await collectObservedState(options);
  assert.equal(state.expectedCertifiedReleaseSha, MAIN);
  assert.ok(
    state.blockers.some(
      (item) => item.code === "RUNTIME_CERTIFIED_RELEASE_DRIFT",
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
  assert.throws(() => validateRepository("../repo"));
  assert.throws(() => validateRepository("./repo"));
  assert.throws(() => validateRepository("owner/.."));
  assert.throws(() => validateRepository("owner/."));
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
