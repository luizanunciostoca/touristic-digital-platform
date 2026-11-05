import assert from "node:assert/strict";
import test from "node:test";
import {
  ENGINEERING_CI_WORKFLOWS,
  selectLatestWorkflowRuns,
  summarizeWorkflowRun,
  requiredWorkflowJobVerified,
} from "./status.mjs";

const HEAD = "b".repeat(40),
  BASE = "a".repeat(40);
const context = {
  headSha: HEAD,
  baseSha: BASE,
  branch: "fix/task",
  prNumber: 7,
};
const run = (patch = {}) => ({
  id: 100,
  workflowId: 10,
  path: ENGINEERING_CI_WORKFLOWS[0],
  headSha: HEAD,
  branch: context.branch,
  event: "pull_request",
  runAttempt: 1,
  createdAt: "2026-11-05T09:00:00Z",
  updatedAt: "2026-11-05T09:01:00Z",
  pullRequests: [{ number: 7, headSha: HEAD, baseSha: BASE }],
  status: "completed",
  conclusion: "success",
  requiredJobVerified: true,
  ...patch,
});
const merge = () =>
  run({ id: 200, workflowId: 20, path: ENGINEERING_CI_WORKFLOWS[1] });
const select = (...runs) =>
  selectLatestWorkflowRuns([...runs, merge()], context);

test("failed historical invocation no longer vetoes a newer successful invocation", () => {
  const result = select(
    run({ id: 99, createdAt: "2026-11-05T08:00:00Z", conclusion: "failure" }),
    run(),
  );
  assert.equal(result.succeeded, true);
  assert.deepEqual(
    result.selected.map((item) => item.id),
    [100, 200],
  );
  assert.deepEqual(
    result.superseded.map((item) => item.id),
    [99],
  );
});
test("current failure or pending invocation cannot reuse an older green", () => {
  for (const patch of [
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { conclusion: "skipped" },
    { status: "in_progress", conclusion: null },
  ]) {
    const result = select(
      run(),
      run({ id: 101, createdAt: "2026-11-05T09:02:00Z", ...patch }),
    );
    assert.equal(result.succeeded, false);
    assert.equal(result.selected[0].id, 101);
  }
});
test("latest attempt wins within one invocation; rerunning an old invocation cannot supersede a newer one", () => {
  assert.equal(
    select(run({ conclusion: "failure" }), run({ runAttempt: 2 })).succeeded,
    true,
  );
  assert.equal(
    select(run(), run({ runAttempt: 2, conclusion: "failure" })).succeeded,
    false,
  );
  assert.equal(
    select(
      run({ runAttempt: 9 }),
      run({
        id: 101,
        createdAt: "2026-11-05T09:02:00Z",
        conclusion: "failure",
      }),
    ).succeeded,
    false,
  );
});
test("other events, branches, heads and bases cannot satisfy a missing requirement", () => {
  for (const patch of [
    { event: "workflow_dispatch" },
    { branch: "other" },
    { headSha: BASE },
    { pullRequests: [{ number: 7, headSha: HEAD, baseSha: HEAD }] },
    { pullRequests: [{ number: 8, headSha: HEAD, baseSha: BASE }] },
  ])
    assert.equal(select(run(patch)).succeeded, false);
  assert.equal(selectLatestWorkflowRuns([run()], context).succeeded, false);
  assert.equal(selectLatestWorkflowRuns(null, context).succeeded, false);
});
test("unknown provenance and contradictory snapshots cannot hide behind a valid old result", () => {
  for (const patch of [
    { runAttempt: null },
    { workflowId: null },
    { createdAt: null },
    { pullRequests: null },
    { path: null },
    { conclusion: "failure" },
  ])
    assert.equal(select(run(), run(patch)).succeeded, false);
});
test("active superseded runs do not block the settled current invocation", () => {
  const result = select(
    run({
      id: 99,
      createdAt: "2026-11-05T08:00:00Z",
      status: "in_progress",
      conclusion: null,
    }),
    run(),
  );
  assert.equal(result.settled, true);
});

test("a newer unbound or malformed PR association cannot reuse an older green", () => {
  for (const pullRequests of [
    undefined,
    [],
    [null],
    [{ number: 7, headSha: null, baseSha: BASE }],
    [{ number: 7, headSha: HEAD, baseSha: null }],
    [{ number: 7, headSha: BASE, baseSha: BASE }],
  ]) {
    const result = select(
      run(),
      run({ id: 101, createdAt: "2026-11-05T09:02:00Z", pullRequests }),
    );
    assert.equal(result.succeeded, false);
    assert.ok(result.invalid.includes(101));
  }
});
test("explicitly foreign contexts and conclusively superseded unbound runs do not contaminate current proof", () => {
  for (const patch of [
    { event: "push" },
    { branch: "other" },
    { headSha: BASE },
    { pullRequests: [{ number: 8, headSha: HEAD, baseSha: BASE }] },
    { pullRequests: [{ number: 7, headSha: HEAD, baseSha: HEAD }] },
  ])
    assert.equal(
      select(
        run(),
        run({ id: 101, createdAt: "2026-11-05T09:02:00Z", ...patch }),
      ).succeeded,
      true,
    );
  assert.equal(
    select(
      run(),
      run({ id: 99, createdAt: "2026-11-05T08:00:00Z", pullRequests: [] }),
    ).succeeded,
    true,
  );
});
test("provider run summarization retains attempt and PR binding", () => {
  const value = summarizeWorkflowRun({
    id: 1,
    workflow_id: 2,
    path: ENGINEERING_CI_WORKFLOWS[0],
    head_sha: HEAD,
    head_branch: "fix/task",
    run_attempt: 3,
    event: "pull_request",
    created_at: "2026-11-05T09:00:00Z",
    updated_at: "2026-11-05T09:01:00Z",
    pull_requests: [{ number: 7, head: { sha: HEAD }, base: { sha: BASE } }],
  });
  assert.equal(value.runAttempt, 3);
  assert.deepEqual(value.pullRequests, [
    { number: 7, headSha: HEAD, baseSha: BASE },
  ]);
});

test("workflow success without an executed trusted required job is not proof", () => {
  assert.equal(select(run({ requiredJobVerified: false })).succeeded, false);
  const workflow = run();
  const repository = "fixture/morro";
  const job = {
    id: 301,
    run_id: 100,
    name: "quality",
    head_sha: HEAD,
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/fixture/morro/actions/runs/100/job/301",
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
    head_sha: HEAD,
    status: "completed",
    conclusion: "success",
    app: { id: 15368, slug: "github-actions" },
    details_url: job.html_url,
  };
  const verified = (jobs = [job], checks = [check]) =>
    requiredWorkflowJobVerified(workflow, jobs, checks, repository);
  assert.equal(verified(), true);
  assert.equal(verified([]), false);
  assert.equal(verified([{ ...job, conclusion: "skipped" }]), false);
  assert.equal(verified([{ ...job, run_id: 99 }]), false);
  assert.equal(
    verified([job], [{ ...check, app: { id: 1, slug: "untrusted" } }]),
    false,
  );
  assert.equal(
    verified([job], [{ ...check, details_url: job.html_url + "wrong" }]),
    false,
  );
  for (const [path, name, step] of [
    [
      ENGINEERING_CI_WORKFLOWS[0],
      "quality",
      "Require every selected suite and core gate to succeed",
    ],
    [
      ENGINEERING_CI_WORKFLOWS[1],
      "morro/merge-gate",
      "Run trusted merge-gate policy",
    ],
  ]) {
    const verify = (steps) =>
      requiredWorkflowJobVerified(
        { ...workflow, path },
        [{ ...job, name, steps }],
        [{ ...check, name }],
        repository,
      );
    const assertion = {
      name: step,
      status: "completed",
      conclusion: "success",
    };
    assert.equal(
      verify([
        assertion,
        {
          name: "Wait for exact-head Trusted Claim Guard",
          status: "completed",
          conclusion: "skipped",
        },
      ]),
      true,
    );
    assert.equal(verify([]), false);
    assert.equal(verify(undefined), false);
    for (const conclusion of ["skipped", "failure", "cancelled"])
      assert.equal(verify([{ ...assertion, conclusion }]), false);
    assert.equal(verify([{ ...assertion, status: "queued" }]), false);
    assert.equal(verify([assertion, assertion]), false);
  }
});
