import assert from "node:assert/strict";
import test from "node:test";
import { snapshot } from "../mdctl/mdctl.mjs";
import { collectLivePullWork } from "../mdctl/scheduler-live.mjs";
import {
  collectObservedState,
  parseArguments,
  probeRuntime,
  renderSummary,
  runtimeOrigin,
  selectLatestWorkflowRuns,
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
  sha: TREE,
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
          base: { sha: MAIN, ref: "main", repo: { full_name: REPO } },
          state: "open",
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
  let pullReads = 0;
  const api = async (path, options) => {
    calls.push({ path, options });
    await overrides.onRead?.(path, options);
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
    if (path.includes("/pulls?state=open&base=main"))
      return overrides.workPulls ?? overrides.pulls ?? values.pulls;
    if (path.includes("/pulls?"))
      return ++pullReads > 1
        ? (overrides.pullReadback ?? overrides.pulls ?? values.pulls)
        : (overrides.pulls ?? values.pulls);
    if (/\/pulls\/\d+$/u.test(path)) {
      const number = Number(path.split("/").at(-1));
      return (
        overrides.pullDetails?.[number] ??
        (overrides.pulls ?? values.pulls)
          .flat()
          .find((pr) => pr.number === number)
      );
    }
    if (path.includes("/issues?")) return [[]];
    if (path.includes("/contents/.morro/integration-queue.json"))
      return content({ items: [] });
    if (path.includes("/contents/.morro/ownership.json"))
      return content({ domains: [] });
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
    if (path.includes("/actions/runs?head_sha="))
      return ++candidateReads > 1
        ? (overrides.candidateReadbackPages ??
            overrides.candidatePages ?? [{ total_count: 0, workflow_runs: [] }])
        : (overrides.candidatePages ?? [{ total_count: 0, workflow_runs: [] }]);
    if (path.includes("/check-runs?")) {
      const checks = overrides.checks ?? [];
      return (
        overrides.checkPages ?? [
          { total_count: checks.length, check_runs: checks },
        ]
      );
    }
    if (/\/actions\/runs\/\d+\/attempts\/\d+\/jobs\?/u.test(path)) {
      const id = Number(path.match(/\/runs\/(\d+)\//u)[1]);
      const jobs = overrides.jobsByRun?.[id] ?? [];
      return overrides.jobPages ?? [{ total_count: jobs.length, jobs }];
    }
    if (/\/actions\/runs\/\d+$/u.test(path)) {
      const id = Number(path.split("/").at(-1));
      return (
        overrides.runReadbacks?.[id] ??
        overrides.candidatePages
          ?.flatMap((page) => page.workflow_runs)
          .find((run) => run.id === id)
      );
    }
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

function candidateFixture() {
  const runs = ["quality.yml", "morro-merge-gate.yml"].map((file, index) => ({
    id: 101 + index,
    workflow_id: 10 + index,
    path: ".github/workflows/" + file,
    head_sha: OLD,
    head_branch: "infra/task",
    event: "pull_request",
    run_attempt: 2,
    created_at: NOW,
    updated_at: NOW,
    status: "completed",
    conclusion: "success",
    pull_requests: [{ number: 1, head: { sha: OLD }, base: { sha: MAIN } }],
  }));
  const jobs = runs.map((run, index) => ({
    id: 301 + index,
    run_id: run.id,
    run_attempt: run.run_attempt,
    head_sha: OLD,
    name: index ? "morro/merge-gate" : "quality",
    status: "completed",
    conclusion: "success",
    html_url: `https://github.com/${REPO}/actions/runs/${run.id}/job/${301 + index}`,
    check_run_url: `https://api.github.com/repos/${REPO}/check-runs/${401 + index}`,
    steps: [
      {
        name: index
          ? "Run trusted merge-gate policy"
          : "Require every selected suite and core gate to succeed",
        status: "completed",
        conclusion: "success",
      },
    ],
  }));
  return {
    candidatePages: [{ total_count: runs.length, workflow_runs: runs }],
    jobsByRun: Object.fromEntries(jobs.map((job) => [job.run_id, [job]])),
    checks: jobs.map((job, index) => ({
      id: 401 + index,
      name: job.name,
      head_sha: OLD,
      status: "completed",
      conclusion: "success",
      app: { id: 15368, slug: "github-actions" },
      details_url: job.html_url,
    })),
  };
}
const candidateProof = (state) =>
  selectLatestWorkflowRuns(state.ci.candidateRuns, {
    headSha: OLD,
    branch: "infra/task",
    baseSha: MAIN,
    prNumber: 1,
  });

function reconciledSnapshotHarness(onRepeatedDetail) {
  const path = ".github/workflows/morro-agent-profiles.yml";
  const manifest = {
    ...fixtures().manifest,
    schemaVersion: 2,
    objective: "trust-routing-reconciliation",
    state: "LOCAL_PROVEN",
    scope: "PLATFORM",
    owns: { paths: [path], contracts: [] },
    reads: { contracts: [] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
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
          id: "collector",
          argv: ["node", "--test", "tooling/ci/control-state-status.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
  };
  const registry = fixtures().registry;
  Object.assign(registry.claims[manifest.id], {
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    status: "LOCAL_PROVEN",
    domains: ["control-plane"],
    risk: "P1",
    paths: [path],
    expiresAt: "2099-01-01T00:00:00Z",
  });
  const input = candidateFixture();
  const run = {
    ...input.candidatePages[0].workflow_runs[0],
    id: 77,
    workflow_id: 77,
    name: "Claim Guard Contract",
    path: ".github/workflows/morro-claim-guard.yml",
    pull_requests: [
      { number: 1, head: { sha: OLD }, base: { sha: MAIN, ref: "main" } },
    ],
  };
  const job = {
    ...input.jobsByRun[101][0],
    id: 777,
    run_id: run.id,
    name: "base-controlled-trust-root-reconciliation",
    html_url: `https://github.com/${REPO}/actions/runs/77/job/777`,
    check_run_url: `https://api.github.com/repos/${REPO}/check-runs/777`,
    steps: [
      {
        name: "Validate approved trust-routing candidate blobs",
        status: "completed",
        conclusion: "success",
      },
    ],
  };
  input.candidatePages[0].workflow_runs.push(run);
  input.candidatePages[0].total_count += 1;
  input.jobsByRun[run.id] = [job];
  input.checks.push({
    ...input.checks[0],
    id: 777,
    name: job.name,
    details_url: job.html_url,
  });
  const fixture = harness({ ...input, manifest, registry });
  const originalApi = fixture.options.api;
  let detailReads = 0;
  fixture.options.api = async (endpoint, options) => {
    if (endpoint === root + "/pulls/1") {
      const pr = structuredClone(await originalApi(endpoint, options));
      Object.assign(pr, { changed_files: 1, additions: 1, deletions: 1 });
      if (++detailReads === 2) onRepeatedDetail?.(pr);
      return pr;
    }
    if (endpoint === root + "/pulls/1/files?per_page=100")
      return [
        [{ filename: path, status: "modified", additions: 1, deletions: 1 }],
      ];
    if (endpoint === root + "/actions/runs/77/jobs?per_page=100")
      return [{ total_count: 1, jobs: [job] }];
    if (
      [
        ".github/workflows/morro-claim-guard.yml",
        ".github/workflows/morro-claim-guard-trusted.yml",
        ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
        path,
        "tooling/fabric/claim-guard.mjs",
        "tooling/mdctl/scheduler-live.mjs",
      ].some((file) => endpoint.includes("/contents/" + file + "?ref="))
    )
      return {
        sha: endpoint.endsWith("/contents/" + path + "?ref=" + OLD)
          ? OLD
          : TREE,
      };
    return originalApi(endpoint, options);
  };
  return { ...fixture, detailReads: () => detailReads };
}

test("snapshot permits normalized identical canonical trust-root rereads", async () => {
  const direct = reconciledSnapshotHarness();
  const work = await collectLivePullWork({
    repository: REPO,
    api: direct.options.api,
  });
  assert.equal(work.items[0].invalid, null);
  assert.equal(work.items[0].trust.trusted, true);
  assert.equal(
    work.items[0].trust.trustRootReconciliation.authority,
    "BASE_CONTROLLED_TRUST_ROOT_RECONCILIATION",
  );
  assert.equal(direct.detailReads(), 2);
  const composed = reconciledSnapshotHarness((pr) => {
    pr.title = "Metadata can change without changing normalized identity";
    pr.head = { repo: pr.head.repo, sha: pr.head.sha, ref: pr.head.ref };
  });
  const result = await snapshot(composed.options);
  assert.equal(result.observed.collectionState, "CAPTURED");
  assert.equal(result.observed.liveSchedulerWork[0].invalid, null);
  assert.equal(
    result.observed.liveSchedulerWork[0].trustAuthority,
    "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
  );
  assert.equal(composed.detailReads(), 3);
});

test("snapshot rejects identity drift in repeated canonical trust-root details", async (t) => {
  const mutations = {
    head: (pr) => (pr.head.sha = TREE),
    branch: (pr) => (pr.head.ref = "infra/changed"),
    draft: (pr) => (pr.draft = false),
    missingDraft: (pr) => delete pr.draft,
    baseSha: (pr) => (pr.base.sha = OLD),
    baseRef: (pr) => (pr.base.ref = "release"),
    repository: (pr) => (pr.head.repo.full_name = "fork/morro"),
    baseRepository: (pr) => (pr.base.repo.full_name = "other/morro"),
    number: (pr) => (pr.number = 2),
    closed: (pr) => (pr.state = "closed"),
  };
  for (const [name, mutate] of Object.entries(mutations))
    await t.test(name, async () => {
      const fixture = reconciledSnapshotHarness(mutate);
      await assert.rejects(
        snapshot(fixture.options),
        /WORK_PULL_DETAIL_INVALID|PULL_IDENTITY_INVALID/u,
      );
      assert.equal(fixture.detailReads(), 2);
    });
});

test("candidate proof comes from complete per-head pages, exact attempts and all checks", async () => {
  const input = candidateFixture();
  const [quality, merge] = input.candidatePages[0].workflow_runs;
  const old = {
    ...quality,
    id: 100,
    created_at: "2026-09-28T07:00:00Z",
    conclusion: "failure",
  };
  input.candidatePages = [
    { total_count: 3, workflow_runs: [old, quality] },
    { total_count: 3, workflow_runs: [merge] },
  ];
  const olderCheck = {
    ...input.checks[0],
    id: 400,
    details_url: `https://github.com/${REPO}/actions/runs/100/job/300`,
  };
  input.checkPages = [
    { total_count: 3, check_runs: [olderCheck] },
    { total_count: 3, check_runs: input.checks },
  ];
  const { options, calls } = harness(input);
  const state = await collectObservedState(options);
  assert.equal(state.collectionState, "CAPTURED");
  assert.equal(candidateProof(state).succeeded, true);
  assert.deepEqual(
    candidateProof(state).selected.map((run) => run.id),
    [101, 102],
  );
  assert.equal(
    state.ci.recentRuns.some((run) => run.id === 101),
    false,
  );
  assert.equal(
    calls.filter(({ path }) => path.includes("head_sha=")).length,
    2,
  );
  assert.ok(
    calls
      .filter(({ path }) => path.includes("head_sha="))
      .every(
        ({ path, options }) =>
          path.includes("event=pull_request") && options.paginate,
      ),
  );
  assert.ok(
    calls
      .filter(({ path }) => path.includes("/jobs?"))
      .every(
        ({ path, options }) =>
          path.includes("/attempts/2/jobs?") && options.paginate,
      ),
  );
  assert.ok(
    calls
      .find(({ path }) => path.includes("/check-runs?"))
      .path.includes("filter=all"),
  );
  assert.equal(calls.at(-1).path, root + "/commits/main");
});

test("incomplete or duplicated candidate, job and check pages cannot become captured proof", async (t) => {
  for (const source of ["candidatePages", "jobPages", "checkPages"]) {
    const key = {
      candidatePages: "workflow_runs",
      jobPages: "jobs",
      checkPages: "check_runs",
    }[source];
    const base = candidateFixture();
    const item =
      source === "candidatePages"
        ? base.candidatePages[0].workflow_runs[0]
        : source === "jobPages"
          ? base.jobsByRun[101][0]
          : base.checks[0];
    const variants = {
      emptyPages: [],
      malformedPage: [{}],
      missingEntry: [{ total_count: 2, [key]: [item] }],
      duplicate: [
        { total_count: 2, [key]: [item] },
        { total_count: 2, [key]: [item] },
      ],
      changedTotal: [
        { total_count: 1, [key]: [item] },
        { total_count: 2, [key]: [] },
      ],
      invalidId: [{ total_count: 1, [key]: [{ ...item, id: 0 }] }],
    };
    for (const [name, pages] of Object.entries(variants))
      await t.test(source + ":" + name, async () => {
        const state = await collectObservedState(
          harness({ ...candidateFixture(), [source]: pages }).options,
        );
        assert.equal(state.sources["candidateCi:1"].state, "UNAVAILABLE");
        assert.equal(state.collectionState, "PARTIAL");
        assert.deepEqual(state.ci.candidateRuns, []);
      });
  }
});

test("complete provider pages still require the unchanged A0 job and check semantics", async (t) => {
  const mutations = {
    missingAttempt: (input) => delete input.jobsByRun[101][0].run_attempt,
    wrongAttempt: (input) => (input.jobsByRun[101][0].run_attempt = 1),
    wrongRun: (input) => (input.jobsByRun[101][0].run_id = 999),
    wrongHead: (input) => (input.jobsByRun[101][0].head_sha = TREE),
    missingJob: (input) => (input.jobsByRun[101] = []),
    missingStep: (input) => (input.jobsByRun[101][0].steps = []),
    skippedStep: (input) =>
      (input.jobsByRun[101][0].steps[0].conclusion = "skipped"),
    wrongApp: (input) => (input.checks[0].app.id = 1),
    wrongCheckHead: (input) => (input.checks[0].head_sha = TREE),
    wrongCheckUrl: (input) => (input.checks[0].details_url += "/other"),
    contradictoryCheck: (input) =>
      input.checks.push({ ...input.checks[0], id: 999, conclusion: "failure" }),
  };
  for (const [name, mutate] of Object.entries(mutations))
    await t.test(name, async () => {
      const input = candidateFixture();
      mutate(input);
      const state = await collectObservedState(harness(input).options);
      assert.equal(state.sources["candidateCi:1"].state, "AVAILABLE");
      assert.equal(
        state.ci.candidateRuns.find((run) => run.id === 101)
          .requiredJobVerified,
        false,
      );
      assert.equal(candidateProof(state).succeeded, false);
    });
});

test("immediate run readback binds every A0 identity and invocation field", async (t) => {
  const changes = {
    id: 999,
    workflow_id: 99,
    path: ".github/workflows/other.yml",
    head_sha: TREE,
    head_branch: "infra/other",
    event: "push",
    run_attempt: 3,
    created_at: "2026-09-28T07:00:00Z",
    updated_at: "2026-09-28T08:00:01Z",
    status: "in_progress",
    conclusion: "failure",
    pull_requests: [],
  };
  for (const [key, value] of Object.entries(changes))
    await t.test(key, async () => {
      const input = candidateFixture();
      input.runReadbacks = {
        101: { ...input.candidatePages[0].workflow_runs[0], [key]: value },
      };
      const state = await collectObservedState(harness(input).options);
      assert.equal(state.sources["candidateCi:1"].state, "UNAVAILABLE");
      assert.deepEqual(state.ci.candidateRuns, []);
    });
});

test("terminal candidate selection rejects new applicable, ambiguous or rerun evidence", async (t) => {
  const input = candidateFixture();
  const [quality, merge] = input.candidatePages[0].workflow_runs;
  const newer = {
    ...quality,
    id: 103,
    created_at: "2026-09-28T08:00:01Z",
    updated_at: "2026-09-28T08:00:01Z",
  };
  const variants = {
    failure: [quality, merge, { ...newer, conclusion: "failure" }],
    pending: [quality, merge, { ...newer, status: "queued", conclusion: null }],
    unbound: [quality, merge, { ...newer, pull_requests: [] }],
    malformedBinding: [
      quality,
      merge,
      {
        ...newer,
        pull_requests: [
          { number: 1, head: { sha: null }, base: { sha: MAIN } },
        ],
      },
    ],
    rerun: [{ ...quality, run_attempt: 3 }, merge],
  };
  for (const [name, entries] of Object.entries(variants))
    await t.test(name, async () => {
      const state = await collectObservedState(
        harness({
          ...input,
          candidateReadbackPages: [
            { total_count: entries.length, workflow_runs: entries },
          ],
        }).options,
      );
      assert.equal(state.sources["candidateCi:1"].state, "UNAVAILABLE");
      assert.equal(state.collectionState, "PARTIAL");
      assert.equal(candidateProof(state).succeeded, false);
    });
  for (const foreign of [
    { ...newer, head_branch: "infra/other" },
    { ...newer, event: "push" },
    { ...newer, path: ".github/workflows/other.yml" },
    {
      ...newer,
      pull_requests: [{ number: 2, head: { sha: OLD }, base: { sha: MAIN } }],
    },
    {
      ...newer,
      pull_requests: [{ number: 1, head: { sha: OLD }, base: { sha: TREE } }],
    },
    {
      ...newer,
      id: 100,
      created_at: "2026-09-28T07:00:00Z",
      run_attempt: 8,
      status: "in_progress",
      conclusion: null,
    },
  ]) {
    const state = await collectObservedState(
      harness({
        ...input,
        candidateReadbackPages: [
          { total_count: 3, workflow_runs: [quality, merge, foreign] },
        ],
      }).options,
    );
    assert.equal(
      candidateProof(state).succeeded,
      true,
      JSON.stringify(foreign),
    );
  }
});

test("terminal PR list and details reject identity, Draft, state and set changes", async (t) => {
  const mutations = {
    draft: (pr) => (pr.draft = false),
    missingDraft: (pr) => delete pr.draft,
    state: (pr) => (pr.state = "closed"),
    head: (pr) => (pr.head.sha = TREE),
    branch: (pr) => (pr.head.ref = "infra/other"),
    repository: (pr) => (pr.head.repo.full_name = "fork/morro"),
    base: (pr) => (pr.base.sha = OLD),
    baseRef: (pr) => (pr.base.ref = "release"),
    baseRepository: (pr) => (pr.base.repo.full_name = "other/morro"),
    number: (pr) => (pr.number = 2),
  };
  for (const source of ["list", "detail"])
    for (const [name, mutate] of Object.entries(mutations))
      await t.test(source + ":" + name, async () => {
        const pr = structuredClone(fixtures().pulls[0][0]);
        mutate(pr);
        const input = {
          ...candidateFixture(),
          ...(source === "list"
            ? { pullReadback: [[pr]] }
            : { pullDetails: { 1: pr } }),
        };
        const { options, calls } = harness(input);
        const state = await collectObservedState(options);
        assert.equal(state.sources.pullRequestsRecheck.state, "UNAVAILABLE");
        assert.equal(state.collectionState, "PARTIAL");
        assert.deepEqual(state.ci.candidateRuns, []);
        assert.equal(calls.at(-1).path, root + "/commits/main");
      });
  const pr = fixtures().pulls[0][0];
  for (const pages of [[[]], [[pr, pr]], [[pr, { ...pr, number: 2 }]], []]) {
    const state = await collectObservedState(
      harness({ ...candidateFixture(), pullReadback: pages }).options,
    );
    assert.equal(state.collectionState, "PARTIAL");
    assert.deepEqual(state.ci.candidateRuns, []);
  }
  const state = await collectObservedState(
    harness({
      ...candidateFixture(),
      fail: (path) => path === root + "/pulls/1",
    }).options,
  );
  assert.equal(state.sources.pullRequestsRecheck.state, "UNAVAILABLE");
});

test("shared heads preserve distinct PR contexts and reordered terminal lists", async () => {
  const input = candidateFixture();
  const first = fixtures().pulls[0][0];
  const second = structuredClone(first);
  second.number = 2;
  second.head.ref = "infra/other";
  input.pulls = [[first, second]];
  input.pullReadback = [[second, first]];
  const extraRuns = input.candidatePages[0].workflow_runs.map((run) => ({
    ...run,
    id: run.id + 10,
    head_branch: "infra/other",
    pull_requests: [{ number: 2, head: { sha: OLD }, base: { sha: MAIN } }],
  }));
  for (const run of extraRuns) {
    const original = input.jobsByRun[run.id - 10][0];
    const job = {
      ...original,
      id: original.id + 10,
      run_id: run.id,
      html_url: `https://github.com/${REPO}/actions/runs/${run.id}/job/${original.id + 10}`,
      check_run_url: `https://api.github.com/repos/${REPO}/check-runs/${original.id + 110}`,
    };
    input.jobsByRun[run.id] = [job];
    input.checks.push({
      ...input.checks.find((check) => check.name === job.name),
      id: original.id + 110,
      details_url: job.html_url,
    });
  }
  input.candidatePages[0].workflow_runs.push(...extraRuns);
  input.candidatePages[0].total_count = 4;
  const state = await collectObservedState(harness(input).options);
  assert.equal(state.collectionState, "CAPTURED");
  assert.equal(state.ci.candidateRuns.length, 8);
  assert.equal(candidateProof(state).succeeded, true);
  assert.equal(
    selectLatestWorkflowRuns(state.ci.candidateRuns, {
      headSha: OLD,
      branch: "infra/other",
      baseSha: MAIN,
      prNumber: 2,
    }).succeeded,
    true,
  );
});

test("initial PR identity remains unknown instead of turning missing Draft into false", async () => {
  const pr = fixtures().pulls[0][0];
  delete pr.draft;
  const state = await collectObservedState(harness({ pulls: [[pr]] }).options);
  assert.equal(state.sources.pullRequests.state, "UNAVAILABLE");
  assert.equal(state.collectionState, "PARTIAL");
  assert.deepEqual(state.activePrs, []);
});

test("snapshot rejects a completed producer observing a different PR than the delayed collector", async (t) => {
  const mutations = {
    head: (pr) => (pr.head.sha = "d".repeat(40)),
    branch: (pr) => (pr.head.ref = "infra/changed"),
    draft: (pr) => (pr.draft = false),
    baseSha: (pr) => (pr.base.sha = TREE),
    baseRef: (pr) => (pr.base.ref = "release"),
    repository: (pr) => (pr.head.repo.full_name = "fork/morro"),
    number: (pr) => (pr.number = 2),
    closed: (pr) => (pr.state = "closed"),
  };
  for (const [name, mutate] of Object.entries(mutations))
    await t.test(name, async () => {
      const oldPr = fixtures().pulls[0][0];
      const currentPr = structuredClone(oldPr);
      mutate(currentPr);
      const input = JSON.parse(
        JSON.stringify(candidateFixture()).replaceAll(OLD, currentPr.head.sha),
      );
      input.workPulls = [[oldPr]];
      input.pulls = currentPr.state === "closed" ? [[]] : [[currentPr]];
      input.pullDetails = { 1: oldPr };
      let workReads = 0;
      let releaseCollector;
      const producerFinished = new Promise(
        (resolve) => (releaseCollector = resolve),
      );
      input.onRead = async (path) => {
        if (
          path === root + "/pulls?state=open&base=main&per_page=100" &&
          ++workReads === 2
        ) {
          input.pullDetails = { [currentPr.number]: currentPr };
          releaseCollector();
        }
        if (path === root + "/pulls?state=open&per_page=100")
          await producerFinished;
      };
      await assert.rejects(
        snapshot(harness(input).options),
        /COMPOSED_PULL_IDENTITY_MISMATCH/u,
      );
    });
});

test("snapshot finishes canonical work, heartbeat and projection reads before terminal proof", async (t) => {
  const stable = harness(candidateFixture());
  const baseline = await snapshot(stable.options);
  assert.equal(candidateProof(baseline.observed).succeeded, true);
  assert.equal(stable.calls.at(-1).path, root + "/commits/main");
  assert.equal(
    baseline.observed.liveSchedulerWork[0].invalid,
    "TRUSTED_CONTROL_FILE_UNAVAILABLE",
  );
  for (const stage of ["work", "heartbeat", "projection"])
    await t.test(stage, async () => {
      const input = candidateFixture();
      let releaseInitial;
      let delayed = false;
      const initialCaptured = new Promise(
        (resolve) => (releaseInitial = resolve),
      );
      input.onRead = async (path) => {
        if (path === root + "/actions/runs/102") releaseInitial();
        const waitHere =
          stage === "work"
            ? path.includes("/pulls?state=open&base=main")
            : stage === "heartbeat"
              ? path.includes("/issues?")
              : path.includes("/contents/.morro/ownership.json");
        if (waitHere && !delayed) {
          delayed = true;
          await initialCaptured;
          await new Promise(setImmediate);
          const [quality, merge] = input.candidatePages[0].workflow_runs;
          input.candidateReadbackPages = [
            {
              total_count: 3,
              workflow_runs: [
                quality,
                merge,
                {
                  ...quality,
                  id: 103,
                  created_at: "2026-09-28T08:00:01Z",
                  updated_at: "2026-09-28T08:00:01Z",
                  conclusion: "failure",
                },
              ],
            },
          ];
        }
      };
      const { options, calls } = harness(input);
      const result = await snapshot(options);
      assert.equal(delayed, true);
      assert.equal(
        result.observed.sources["candidateCi:1"].state,
        "UNAVAILABLE",
      );
      assert.equal(result.observed.collectionState, "PARTIAL");
      assert.equal(candidateProof(result.observed).succeeded, false);
      assert.equal(calls.at(-1).path, root + "/commits/main");
    });
});

test("composition failure rejects the snapshot and terminal main drift cannot remain CAPTURED", async () => {
  const broken = harness({
    ...candidateFixture(),
    fail: (path) => path.includes("/contents/.morro/ownership.json"),
  });
  await assert.rejects(snapshot(broken.options));
  const { options } = harness(candidateFixture());
  options.beforeFinalReadback = async () => {
    throw new Error("COMPOSITION_REJECTED");
  };
  await assert.rejects(collectObservedState(options), /COMPOSITION_REJECTED/u);
  const input = candidateFixture();
  input.onRead = async (path) => {
    if (path === root + "/pulls/1") input.moveMain = true;
  };
  const moved = harness(input);
  const state = await collectObservedState(moved.options);
  assert.equal(state.collectionState, "PARTIAL");
  assert.equal(state.consistency, "INCONSISTENT");
  assert.deepEqual(state.ci.candidateRuns, []);
  assert.equal(moved.calls.at(-1).path, root + "/commits/main");
});

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
  assert.equal(state.collectionState, "PARTIAL");
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
          base: { sha: MAIN, ref: "main", repo: { full_name: REPO } },
          state: "open",
          draft: false,
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
