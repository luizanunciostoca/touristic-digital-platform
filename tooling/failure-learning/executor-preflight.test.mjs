import assert from "node:assert/strict";
import test from "node:test";
import { buildDispatchRequest } from "../mdctl/dispatch-runtime.mjs";
import {
  authorizeDispatch,
  codexAuthPreflight,
  codexExecutorPreflight,
  codexFunctionalPreflight,
  executorHealth,
  evaluateCloudDispatchProposal,
  selectAuthorizedExecutor,
} from "./executor-preflight.mjs";

test("codex preflight separates installed and authenticated from runtime function", () => {
  const run = (_command, args) =>
    args[0] === "--version"
      ? { status: 0, stdout: "codex 0.154.0", stderr: "" }
      : { status: 0, stdout: "Logged in using ChatGPT", stderr: "" };
  const preflight = codexAuthPreflight(run);
  assert.equal(preflight.installed, true);
  assert.equal(preflight.authenticated, true);
  assert.equal(preflight.functional, null);
  assert.equal(authorizeDispatch(preflight).result, "BLOCK");
});

test("usage-limit style executor failure triggers authorized healthy fallback", () => {
  const selection = selectAuthorizedExecutor([
    {
      executor: "codex",
      installed: true,
      authenticated: true,
      functional: false,
      authorized: true,
      evidence: "usage limit",
    },
    {
      executor: "chatgpt-control",
      installed: true,
      authenticated: true,
      functional: true,
      authorized: true,
    },
  ]);
  assert.equal(selection.result, "PASS");
  assert.equal(selection.executor, "chatgpt-control");
  assert.equal(selection.fallbackUsed, true);
  assert.equal(
    selection.attempts[0].rootCause,
    "EXECUTOR_FUNCTIONAL_PROBE_FAILED",
  );
});

test("installed and authenticated does not imply authorized or functional", () => {
  const health = executorHealth({
    executor: "codex",
    installed: true,
    authenticated: true,
    functional: true,
    authorized: false,
  });
  assert.equal(health.healthy, false);
  assert.equal(authorizeDispatch(health).rootCause, "EXECUTOR_NOT_AUTHORIZED");
});

test("dispatch fails closed when no healthy authorized executor exists", () => {
  const result = selectAuthorizedExecutor([
    {
      executor: "codex",
      installed: true,
      authenticated: true,
      functional: false,
      authorized: true,
    },
    {
      executor: "copilot-reviewer",
      installed: true,
      authenticated: true,
      functional: true,
      authorized: false,
    },
  ]);
  assert.equal(result.result, "BLOCK");
  assert.equal(result.rootCause, "NO_HEALTHY_AUTHORIZED_EXECUTOR");
});

test("codex functional preflight detects provider quota or execution failure", () => {
  const calls = [];
  const failed = codexFunctionalPreflight((command, args) => {
    calls.push({ command, args });
    return { status: 1, stdout: "", stderr: "usage limit" };
  });
  assert.equal(failed.functional, false);
  assert.equal(calls[0].command, "codex");
  assert.equal(calls[0].args[0], "exec");
});

test("full codex preflight requires a real functional probe before dispatch", () => {
  const run = (_command, args) => {
    if (args[0] === "--version")
      return { status: 0, stdout: "codex 0.154.0", stderr: "" };
    if (args[0] === "login")
      return { status: 0, stdout: "Logged in using ChatGPT", stderr: "" };
    return { status: 0, stdout: "MORRO_EXECUTOR_READY", stderr: "" };
  };
  const health = codexExecutorPreflight({ run, authorized: true });
  assert.equal(health.healthy, true);
});

test("review-only executor cannot become implementation fallback by a boolean flag", () => {
  const result = selectAuthorizedExecutor([
    {
      executor: "copilot-reviewer",
      installed: true,
      authenticated: true,
      functional: true,
      authorized: true,
    },
  ]);
  assert.equal(result.result, "BLOCK");
  assert.equal(result.attempts[0].rootCause, "EXECUTOR_ROLE_NOT_AUTHORIZED");
});

// These are declarative fixtures, never provider or operational evidence.
function cloudFixture() {
  const dispatch = {
    grant: { id: "MD-CLOUD-FIXTURE", exactBaseSha: "a".repeat(40) },
    workspace: {
      ready: true,
      exactBaseSha: "a".repeat(40),
      path: "/tmp/cloud-fixture",
      runtime: "native",
    },
    executor: "chatgpt-control",
    attempt: 1,
  };
  const expected = {
    executor: "chatgpt-control",
    workspacePath: "/tmp/cloud-fixture",
    runtime: "native",
    objective: null,
    repository: "example/product",
    operator: { login: "example-owner", id: 123 },
    claimId: "MD-CLOUD-FIXTURE",
    taskId: "MD-CLOUD-FIXTURE",
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    branch: "chore/cloud-fixture",
    workspaceDescriptorDigest: "sha256:" + "d".repeat(64),
    claimExpiresAt: "2026-10-27T18:00:00Z",
  };
  const { claimExpiresAt: _claimExpiry, baseSha: _base, ...binding } = expected;
  return {
    dispatch,
    expected,
    now: "2026-10-27T13:00:00Z",
    proposal: {
      ...structuredClone(binding),
      request: buildDispatchRequest(dispatch),
      nonce: "e".repeat(32),
      issuedAt: "2026-10-27T12:59:00Z",
      expiresAt: "2026-10-27T13:10:00Z",
    },
    revoked: false,
    priorNonces: [],
    otherAssignments: [],
  };
}

test("cloud preparation reuses dispatch identity without authorizing an executor", () => {
  const input = cloudFixture(),
    before = structuredClone(input);
  const result = evaluateCloudDispatchProposal(input);
  assert.equal(result.compatible, true);
  assert.equal(result.status, "PREPARATION_ONLY");
  assert.equal(result.operationalAuthority, false);
  assert.deepEqual(result.request, buildDispatchRequest(input.dispatch));
  assert.deepEqual(input, before);
  assert.equal(authorizeDispatch(result).result, "BLOCK");
  assert.equal(result.unverified.length, 6);
  for (const key of ["authenticated", "authorized", "grant", "lease", "token"])
    assert.equal(Object.hasOwn(result, key), false);
  result.request.workspacePath = "/changed";
  assert.deepEqual(input, before);
});

for (const [label, mutate, code] of [
  ["operator id", (x) => x.proposal.operator.id++, "OPERATOR_BINDING_MISMATCH"],
  [
    "operator login",
    (x) => (x.proposal.operator.login = "someone"),
    "OPERATOR_BINDING_MISMATCH",
  ],
  [
    "repository",
    (x) => (x.proposal.repository = "example/other"),
    "REPOSITORY_BINDING_MISMATCH",
  ],
  [
    "task",
    (x) => (x.proposal.taskId = "MD-OTHER"),
    "IDENTITY_BINDING_MISMATCH_taskId",
  ],
  [
    "claim",
    (x) => (x.proposal.claimId = "MD-OTHER"),
    "IDENTITY_BINDING_MISMATCH_claimId",
  ],
  [
    "base",
    (x) => (x.expected.baseSha = "f".repeat(40)),
    "BASE_BINDING_MISMATCH",
  ],
  [
    "head",
    (x) => (x.proposal.headSha = "f".repeat(40)),
    "GIT_BINDING_MISMATCH_headSha",
  ],
  [
    "tree",
    (x) => (x.proposal.treeSha = "f".repeat(40)),
    "GIT_BINDING_MISMATCH_treeSha",
  ],
  ["branch", (x) => (x.proposal.branch = "main"), "BRANCH_BINDING_MISMATCH"],
  [
    "workspace digest",
    (x) => (x.proposal.workspaceDescriptorDigest = "sha256:" + "f".repeat(64)),
    "WORKSPACE_DIGEST_MISMATCH",
  ],
  [
    "workspace path",
    (x) => (x.proposal.request.workspacePath = "/other"),
    "DISPATCH_BINDING_MISMATCH",
  ],
  [
    "forged dispatch id",
    (x) => (x.proposal.request.dispatchId = "dispatch-forged"),
    "DISPATCH_BINDING_MISMATCH",
  ],
  [
    "executor",
    (x) => (x.dispatch.executor = "review-only"),
    "EXECUTOR_ROLE_INVALID",
  ],
  ["revoked", (x) => (x.revoked = true), "REVOCATION_UNVERIFIED_OR_REVOKED"],
  [
    "unknown revocation",
    (x) => delete x.revoked,
    "REVOCATION_UNVERIFIED_OR_REVOKED",
  ],
  ["replay", (x) => x.priorNonces.push(x.proposal.nonce), "NONCE_REPLAY"],
  ["no nonce history", (x) => delete x.priorNonces, "NONCE_HISTORY_MISSING"],
  [
    "invalid nonce history",
    (x) => (x.priorNonces = [null]),
    "NONCE_HISTORY_INVALID",
  ],
  [
    "no inventory",
    (x) => delete x.otherAssignments,
    "ASSIGNMENT_INVENTORY_MISSING",
  ],
  [
    "malformed inventory",
    (x) => (x.otherAssignments = {}),
    "ASSIGNMENT_INVENTORY_MISSING",
  ],
  [
    "malformed record",
    (x) => (x.otherAssignments = [null]),
    "ASSIGNMENT_INVENTORY_INVALID",
  ],
  ["missing now", (x) => delete x.now, "WINDOW_INVALID"],
  ["expired", (x) => (x.now = x.proposal.expiresAt), "WINDOW_INVALID"],
  [
    "future issuance",
    (x) => (x.proposal.issuedAt = "2026-10-27T13:01:00Z"),
    "WINDOW_INVALID",
  ],
  [
    "window too long",
    (x) => (x.proposal.expiresAt = "2026-10-27T14:00:00Z"),
    "WINDOW_INVALID",
  ],
  [
    "claim expiry",
    (x) => (x.expected.claimExpiresAt = "2026-10-27T13:05:00Z"),
    "WINDOW_INVALID",
  ],
  [
    "invalid timestamp",
    (x) => (x.proposal.expiresAt = "tomorrow"),
    "WINDOW_INVALID",
  ],
  ["invalid nonce", (x) => (x.proposal.nonce = "not-a-nonce"), "NONCE_INVALID"],
])
  test("cloud preparation rejects " + label, () => {
    const input = cloudFixture();
    mutate(input);
    const result = evaluateCloudDispatchProposal(input);
    assert.equal(result.compatible, false);
    assert.ok(result.findings.includes(code), result.findings.join(","));
    assert.equal(result.operationalAuthority, false);
  });

for (const state of ["STARTED", "ACTIVE", "EXPIRED", "REVOKED", "RELEASED"])
  test(
    "declared " +
      state +
      " sibling cannot prove cessation or permit a second writer",
    () => {
      const input = cloudFixture();
      input.otherAssignments = [
        {
          taskId: input.proposal.taskId,
          claimId: "MD-OTHER",
          state,
          runtime: "termux",
        },
      ];
      input.dispatch.attempt = 2;
      input.proposal.request = buildDispatchRequest(input.dispatch);
      input.proposal.nonce = "f".repeat(32);
      const result = evaluateCloudDispatchProposal(input);
      assert.ok(result.findings.includes("CONCURRENT_ASSIGNMENT"));
      assert.equal(result.compatible, false);
    },
  );

test("same claim different task is a conflict across runtimes", () => {
  const input = cloudFixture();
  input.otherAssignments = [
    { taskId: "MD-OTHER", claimId: input.proposal.claimId, runtime: "cloud" },
  ];
  assert.ok(
    evaluateCloudDispatchProposal(input).findings.includes(
      "CONCURRENT_ASSIGNMENT",
    ),
  );
});

test("missing inputs remain preparation failures and cannot dispatch", () => {
  for (const input of [undefined, null, {}, { dispatch: {} }]) {
    const result = evaluateCloudDispatchProposal(input);
    assert.equal(result.compatible, false);
    assert.equal(authorizeDispatch(result).result, "BLOCK");
  }
});

for (const [field, change, code] of [
  [
    "path",
    (x) => (x.dispatch.workspace.path = "/tmp/copied-workspace"),
    "WORKSPACE_PATH_BINDING_MISMATCH",
  ],
  [
    "executor",
    (x) => (x.dispatch.executor = "codex"),
    "EXECUTOR_BINDING_MISMATCH",
  ],
  [
    "objective",
    (x) => (x.dispatch.grant.objective = "different-objective"),
    "OBJECTIVE_BINDING_MISMATCH",
  ],
])
  test(
    "coordinated proposal and dispatch mutation cannot change expected " +
      field,
    () => {
      const input = cloudFixture();
      change(input);
      input.proposal.request = buildDispatchRequest(input.dispatch);
      const result = evaluateCloudDispatchProposal(input);
      assert.equal(result.compatible, false);
      assert.ok(result.findings.includes(code));
      assert.equal(result.request, null);
    },
  );

test("impossible calendar dates cannot be normalized into a valid window", () => {
  const input = cloudFixture();
  input.now = "2026-03-02T13:00:00Z";
  input.proposal.issuedAt = "2026-02-30T12:59:00Z";
  input.proposal.expiresAt = "2026-02-30T13:10:00Z";
  assert.ok(
    evaluateCloudDispatchProposal(input).findings.includes("WINDOW_INVALID"),
  );
});

for (const field of ["runtime", "objective"])
  for (const [label, payload] of [
    ["object", { syntheticMarker: "must-not-echo" }],
    ["function", () => {}],
    ["oversized", "x".repeat(2048)],
  ])
    test(
      "untrusted " +
        field +
        " " +
        label +
        " is rejected without echo or clone error",
      () => {
        const input = cloudFixture();
        if (field === "runtime") input.dispatch.workspace.runtime = payload;
        else input.dispatch.grant.objective = payload;
        input.proposal.request = buildDispatchRequest(input.dispatch);
        const result = evaluateCloudDispatchProposal(input);
        assert.ok(result.findings.includes("DISPATCH_INPUT_INVALID"));
        assert.equal(result.compatible, false);
        assert.equal(result.request, null);
        assert.ok(!JSON.stringify(result).includes("must-not-echo"));
      },
    );

test("extra dispatch fields cannot define an unreviewed protocol", () => {
  const input = cloudFixture();
  input.dispatch.workspace.authorization = true;
  assert.ok(
    evaluateCloudDispatchProposal(input).findings.includes(
      "DISPATCH_INPUT_INVALID",
    ),
  );
});
