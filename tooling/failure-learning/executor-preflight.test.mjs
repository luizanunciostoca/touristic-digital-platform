import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeDispatch,
  codexAuthPreflight,
  codexExecutorPreflight,
  codexFunctionalPreflight,
  executorHealth,
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
