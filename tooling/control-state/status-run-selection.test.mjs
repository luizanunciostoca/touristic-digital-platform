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
const run = (patch = {}) => {
  const value = {
    id: 100,
    workflowId: 10,
    path: ENGINEERING_CI_WORKFLOWS[0],
    headSha: HEAD,
    branch: context.branch,
    event: "pull_request",
    runAttempt: 1,
    createdAt: "2026-11-05T09:00:00Z",
    updatedAt: patch.createdAt ?? "2026-11-05T09:01:00Z",
    pullRequests: [{ number: 7, headSha: HEAD, baseSha: BASE }],
    status: "completed",
    conclusion: "success",
    requiredJobVerified: true,
    ...patch,
  };
  return {
    ...summarizeWorkflowRun({
      id: value.id,
      workflow_id: value.workflowId,
      path: value.path,
      head_sha: value.headSha,
      head_branch: value.branch,
      event: value.event,
      run_attempt: value.runAttempt,
      created_at: value.createdAt,
      updated_at: value.updatedAt,
      status: value.status,
      conclusion: value.conclusion,
      pull_requests: Array.isArray(value.pullRequests)
        ? value.pullRequests.map(
            (pr) =>
              pr && {
                number: pr.number,
                head: { sha: pr.headSha },
                base: { sha: pr.baseSha },
              },
          )
        : value.pullRequests,
    }),
    requiredJobVerified: value.requiredJobVerified,
  };
};
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
    {
      headSha: BASE,
      pullRequests: [{ number: 7, headSha: BASE, baseSha: BASE }],
    },
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

test("identical provider snapshots retain job proof regardless of collection order", () => {
  for (const copies of [
    [run({ requiredJobVerified: undefined }), run()],
    [run(), run({ requiredJobVerified: undefined })],
  ]) {
    const result = select(...copies);
    assert.equal(result.succeeded, true);
    assert.equal(result.selected.length, 2);
    assert.deepEqual(result.superseded, []);
  }
});
test("deduplication never transfers proof across changed snapshots or hides contradictory evidence", () => {
  for (const patch of [
    { runAttempt: 2 },
    { updatedAt: "2026-11-05T09:03:00Z" },
    { conclusion: "failure" },
    {
      pullRequests: [
        { number: 7, headSha: HEAD, baseSha: BASE },
        { number: 8, headSha: HEAD, baseSha: BASE },
      ],
    },
  ]) {
    const result = select(
      run(),
      run({ ...patch, requiredJobVerified: undefined }),
    );
    assert.equal(result.succeeded, false, JSON.stringify(patch));
  }
  for (const copies of [
    [run(), run({ requiredJobVerified: false })],
    [run({ requiredJobVerified: false }), run()],
  ])
    assert.equal(select(...copies).succeeded, false);
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
    {
      headSha: BASE,
      pullRequests: [{ number: 7, headSha: BASE, baseSha: BASE }],
    },
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

test("one workflow ID cannot satisfy distinct required paths in the candidate context", () => {
  for (const workflowId of [10, 20]) {
    const quality = run({ workflowId });
    const gate = { ...merge(), workflowId };
    for (const runs of [
      [quality, gate],
      [gate, quality],
    ]) {
      for (const requireJobProof of [true, false]) {
        const result = selectLatestWorkflowRuns(runs, {
          ...context,
          requireJobProof,
        });
        assert.equal(result.succeeded, false);
        assert.equal(result.settled, false);
        assert.ok(
          result.invalid.includes("WORKFLOW_ID_PATH_CONFLICT:" + workflowId),
        );
      }
    }
  }
});

test("workflow ID comparisons remain scoped to the selected PR context", () => {
  for (const patch of [
    { event: "push" },
    { branch: "other" },
    { path: ".github/workflows/other.yml" },
    {
      headSha: BASE,
      pullRequests: [{ number: 7, headSha: BASE, baseSha: BASE }],
    },
    { pullRequests: [{ number: 8, headSha: HEAD, baseSha: BASE }] },
    { pullRequests: [{ number: 7, headSha: HEAD, baseSha: HEAD }] },
  ]) {
    const foreign = run({ id: 300, workflowId: 20, ...patch });
    for (const pair of [
      [run(), foreign],
      [foreign, run()],
    ]) {
      const result = select(...pair);
      assert.equal(result.succeeded, true, JSON.stringify(patch));
      assert.deepEqual(result.invalid, []);
    }
  }
});

test("workflow success without an executed trusted required job is not proof", () => {
  assert.equal(select(run({ requiredJobVerified: false })).succeeded, false);
  const workflow = run();
  const repository = "fixture/morro";
  const job = {
    id: 301,
    run_id: 100,
    run_attempt: workflow.runAttempt,
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
    for (const runAttempt of [1, 2]) {
      const verifyAttempt = (run_attempt) =>
        requiredWorkflowJobVerified(
          { ...workflow, path, runAttempt },
          [{ ...job, name, steps: [assertion], run_attempt }],
          [{ ...check, name }],
          repository,
        );
      assert.equal(verifyAttempt(runAttempt), true, name);
      for (const jobAttempt of [
        undefined,
        null,
        0,
        -1,
        1.5,
        "2",
        3 - runAttempt,
      ])
        assert.equal(
          verifyAttempt(jobAttempt),
          false,
          `${name}: job attempt ${jobAttempt} cannot verify run attempt ${runAttempt}`,
        );
    }
  }
});

const newer = (patch = {}) =>
  run({
    id: 101,
    createdAt: "2026-11-05T09:02:00Z",
    updatedAt: "2026-11-05T09:03:00Z",
    ...patch,
  });
const older = (patch = {}) =>
  run({
    id: 99,
    createdAt: "2026-11-05T08:00:00Z",
    updatedAt: "2026-11-05T08:01:00Z",
    ...patch,
  });
const rejectBothOrders = (first, second) => {
  for (const pair of [
    [first, second],
    [second, first],
  ]) {
    const result = select(...pair);
    assert.equal(result.succeeded, false);
    assert.equal(result.settled, false);
    assert.ok(result.invalid.length > 0);
  }
};

test("newer missing or malformed provider heads survive summarization as blocking ambiguity", () => {
  for (const headSha of [
    undefined,
    null,
    "",
    "bad",
    HEAD.slice(1),
    HEAD + "0",
    123,
    { toString: () => HEAD },
  ]) {
    const value = newer({ headSha });
    assert.equal(value.headSha, null);
    rejectBothOrders(run(), value);
  }
});

test("normalization cannot repair invalid workflow identity into positive proof", () => {
  for (const patch of [
    { path: undefined },
    { path: "" },
    { path: ENGINEERING_CI_WORKFLOWS[0] + "\u0000" },
    { branch: undefined },
    { branch: context.branch + "\n" },
    { event: undefined },
    { event: "pull_request\n" },
  ])
    rejectBothOrders(run(), newer(patch));
  assert.equal(select(summarizeWorkflowRun(null)).succeeded, false);
});

test("only valid chronology can establish that an ambiguous invocation was superseded", () => {
  for (const patch of [{ headSha: null }, { pullRequests: [] }]) {
    const result = select(older(patch), run());
    assert.equal(result.succeeded, true);
    assert.deepEqual(
      result.superseded.map((item) => item.id),
      [99],
    );
  }
  for (const patch of [
    { id: null },
    { workflowId: null },
    { runAttempt: null },
    { createdAt: "2026-11-05T09:00:00Z", updatedAt: "2026-11-05T09:00:00Z" },
    { updatedAt: "2026-11-05T07:59:00Z" },
  ])
    rejectBothOrders(run(), older({ pullRequests: [], ...patch }));
});

test("malformed ISO instants and impossible calendars never prove run order", () => {
  for (const value of [
    undefined,
    null,
    "0",
    0,
    "2026-11-05",
    "2026-11-05T09:00:00",
    "2026-02-30T09:00:00Z",
    "2026-11-05T24:00:00Z",
    "2026-11-05T09:00:60Z",
    "2026-11-05T09:00:00Z\n",
  ]) {
    for (const field of ["createdAt", "updatedAt"]) {
      rejectBothOrders(run(), newer({ [field]: value }));
      rejectBothOrders(run(), older({ pullRequests: [], [field]: value }));
    }
  }
  rejectBothOrders(run(), newer({ updatedAt: "2026-11-05T09:01:00Z" }));
  assert.equal(
    select(
      run({
        createdAt: "2026-11-05T09:00:00.1Z",
        updatedAt: "2026-11-05T09:00:00.100Z",
      }),
    ).succeeded,
    true,
  );
});

test("terminal conclusions cannot conflict within one invocation attempt at different update times", () => {
  for (const conclusion of ["failure", "cancelled", "skipped", null])
    rejectBothOrders(
      run({ conclusion }),
      run({ updatedAt: "2026-11-05T09:03:00Z" }),
    );
  rejectBothOrders(
    run(),
    run({
      status: "queued",
      conclusion: null,
      updatedAt: "2026-11-05T09:03:00Z",
    }),
  );
});

test("attempt order must agree with update chronology and preserves coherent reruns", () => {
  rejectBothOrders(
    run({ conclusion: "failure", updatedAt: "2026-11-05T09:04:00Z" }),
    run({ runAttempt: 2, updatedAt: "2026-11-05T09:03:00Z" }),
  );
  const previous = run({ conclusion: "failure" });
  const retry = run({ runAttempt: 2, updatedAt: "2026-11-05T09:03:00Z" });
  for (const pair of [
    [previous, retry],
    [retry, previous],
  ]) {
    const result = select(...pair);
    assert.equal(result.succeeded, true);
    assert.equal(result.selected[0].runAttempt, 2);
  }
  const progressing = run({
    status: "in_progress",
    conclusion: null,
    updatedAt: "2026-11-05T09:00:30Z",
  });
  assert.equal(select(progressing, run()).succeeded, true);
});

test("one provider run ID cannot change context to hide a contradictory copy", () => {
  for (const patch of [
    {
      headSha: BASE,
      pullRequests: [{ number: 8, headSha: BASE, baseSha: BASE }],
    },
    { branch: "other" },
    { event: "push" },
    { path: ".github/workflows/other.yml" },
    { workflowId: 11 },
    { createdAt: "2026-11-05T08:59:00Z" },
  ])
    rejectBothOrders(run(), run(patch));
  for (const pullRequests of [
    [{ number: 8, headSha: HEAD, baseSha: BASE }],
    [{ number: 7, headSha: HEAD, baseSha: HEAD }],
  ])
    rejectBothOrders(
      run(),
      run({ pullRequests, updatedAt: "2026-11-05T09:03:00Z" }),
    );
  for (const patch of [
    { event: "push" },
    { event: "workflow_dispatch" },
    { branch: "other" },
    { path: ".github/workflows/other.yml" },
    {
      headSha: BASE,
      pullRequests: [{ number: 7, headSha: BASE, baseSha: BASE }],
    },
    { pullRequests: [{ number: 8, headSha: HEAD, baseSha: BASE }] },
    { pullRequests: [{ number: 7, headSha: HEAD, baseSha: HEAD }] },
  ])
    assert.equal(select(run(), newer(patch)).succeeded, true);
});

test("PR head incoherence and duplicate associations cannot masquerade as foreign evidence", () => {
  for (const patch of [
    { headSha: BASE },
    { pullRequests: [{ number: 8, headSha: BASE, baseSha: BASE }] },
    {
      pullRequests: [
        { number: 7, headSha: HEAD, baseSha: BASE },
        { number: 8, headSha: BASE, baseSha: BASE },
      ],
    },
    {
      pullRequests: [
        { number: 7, headSha: HEAD, baseSha: BASE },
        { number: 7, headSha: HEAD, baseSha: BASE },
      ],
    },
    {
      pullRequests: [
        { number: 7, headSha: HEAD, baseSha: BASE },
        { number: 8, headSha: null, baseSha: BASE },
      ],
    },
    { pullRequests: [null] },
  ])
    rejectBothOrders(run(), newer(patch));
  rejectBothOrders(
    run(),
    newer({
      headSha: BASE,
      pullRequests: [{ number: 7, headSha: HEAD, baseSha: null }],
    }),
  );
  rejectBothOrders(
    run(),
    older({ pullRequests: [{ number: 7, headSha: BASE, baseSha: BASE }] }),
  );
  rejectBothOrders(
    run(),
    older({
      pullRequests: [
        { number: 7, headSha: HEAD, baseSha: BASE },
        { number: 7, headSha: HEAD, baseSha: BASE },
      ],
    }),
  );
});

test("selector context must identify a positive PR, exact SHAs and unique required workflows", () => {
  for (const patch of [
    { headSha: null },
    { headSha: "bad" },
    { baseSha: null },
    { branch: "" },
    { prNumber: 0 },
    { prNumber: "7" },
    { requireJobProof: 0 },
    { requireJobProof: null },
    { requireJobProof: "false" },
    { requiredWorkflows: [] },
    { requiredWorkflows: null },
    {
      requiredWorkflows: [
        ENGINEERING_CI_WORKFLOWS[0],
        ENGINEERING_CI_WORKFLOWS[0],
      ],
    },
  ])
    assert.equal(
      selectLatestWorkflowRuns([run(), merge()], { ...context, ...patch })
        .succeeded,
      false,
    );
  const malformed = selectLatestWorkflowRuns(
    [{}, null, run(), merge()],
    context,
  );
  assert.equal(malformed.succeeded, false);
  assert.ok(malformed.invalid.length > 0);
});

test("reordering the same PR bindings does not change snapshot identity", () => {
  const pullRequests = [
    { number: 7, headSha: HEAD, baseSha: BASE },
    { number: 8, headSha: HEAD, baseSha: BASE },
  ];
  const result = select(
    run({ pullRequests }),
    run({
      pullRequests: [...pullRequests].reverse(),
      requiredJobVerified: undefined,
    }),
  );
  assert.equal(result.succeeded, true);
  assert.equal(result.selected.length, 2);
  assert.deepEqual(result.superseded, []);
});

function proofFixture() {
  const workflow = run();
  const job = {
    id: 301,
    run_id: workflow.id,
    run_attempt: workflow.runAttempt,
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
  return { workflow, job, check };
}
const verifyProof = (workflow, jobs, checks) =>
  requiredWorkflowJobVerified(workflow, jobs, checks, "fixture/morro");

test("equal missing or malformed SHAs never establish job/check/run identity", () => {
  const { workflow, job, check } = proofFixture();
  for (const head of [
    undefined,
    null,
    "",
    "bad",
    HEAD.slice(1),
    "g".repeat(40),
    123,
  ]) {
    assert.equal(
      verifyProof(
        { ...workflow, headSha: head },
        [{ ...job, head_sha: head }],
        [{ ...check, head_sha: head }],
      ),
      false,
    );
    assert.equal(
      verifyProof(workflow, [{ ...job, head_sha: head }], [check]),
      false,
    );
    assert.equal(
      verifyProof(workflow, [job], [{ ...check, head_sha: head }]),
      false,
    );
  }
});

test("provider IDs and attempts must be positive safe integers before equality or URL binding", () => {
  const { workflow, job, check } = proofFixture();
  for (const value of [
    undefined,
    null,
    0,
    -1,
    1.5,
    "100",
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const html_url = `https://github.com/fixture/morro/actions/runs/${value}/job/${job.id}`;
    assert.equal(
      verifyProof(
        { ...workflow, id: value },
        [{ ...job, run_id: value, html_url }],
        [{ ...check, details_url: html_url }],
      ),
      false,
    );
    assert.equal(
      verifyProof(
        { ...workflow, runAttempt: value },
        [{ ...job, run_attempt: value }],
        [check],
      ),
      false,
    );
    assert.equal(
      verifyProof({ ...workflow, workflowId: value }, [job], [check]),
      false,
    );
    assert.equal(
      verifyProof(workflow, [{ ...job, id: value }], [check]),
      false,
    );
    assert.equal(
      verifyProof(workflow, [job], [{ ...check, id: value }]),
      false,
    );
  }
});

test("linked checks and job identities must be unique even if one duplicate is successful", () => {
  const { workflow, job, check } = proofFixture();
  for (const patch of [
    { conclusion: "failure" },
    { status: "queued" },
    { head_sha: BASE },
    { name: "other" },
    { details_url: "https://github.com/foreign/job" },
    { app: { id: 1, slug: "untrusted" } },
    {},
  ]) {
    const duplicate = { ...check, ...patch };
    for (const checks of [
      [check, duplicate],
      [duplicate, check],
    ])
      assert.equal(verifyProof(workflow, [job], checks), false);
  }
  const otherJob = { ...job, name: "other", conclusion: "failure" };
  for (const jobs of [
    [job, otherJob],
    [otherJob, job],
  ])
    assert.equal(verifyProof(workflow, jobs, [check]), false);
  assert.equal(
    verifyProof(workflow, [job, { ...otherJob, id: 302 }], [check]),
    true,
  );
});

test("only own workflow contracts can verify an executed assertion", () => {
  const { workflow, job, check } = proofFixture();
  for (const [path, name] of [
    ["constructor", "Object"],
    ["toString", "toString"],
    ["__proto__", undefined],
    ["unknown", undefined],
  ])
    assert.equal(
      verifyProof(
        { ...workflow, path },
        [
          {
            ...job,
            name,
            steps: [
              { name: undefined, status: "completed", conclusion: "success" },
            ],
          },
        ],
        [{ ...check, name }],
      ),
      false,
    );
  for (const value of [null, {}, "bad"]) {
    assert.equal(verifyProof(workflow, value, [check]), false);
    assert.equal(verifyProof(workflow, [job], value), false);
  }
  assert.equal(
    verifyProof(
      { ...workflow, path: { toString: () => workflow.path } },
      [job],
      [check],
    ),
    false,
  );
});
