import { spawnSync } from "node:child_process";

function output(result) {
  return (
    String(result?.stdout ?? "") +
    "\n" +
    String(result?.stderr ?? "")
  ).trim();
}

export function codexAuthPreflight(run = spawnSync) {
  const installedProbe = run("codex", ["--version"], { encoding: "utf8" });
  const authProbe = run("codex", ["login", "status"], { encoding: "utf8" });
  const evidence = output(authProbe);
  return {
    executor: "codex",
    installed: installedProbe?.status === 0 && !installedProbe?.error,
    authenticated:
      authProbe?.status === 0 &&
      /logged in|authenticated/iu.test(evidence) &&
      !/not logged in|not authenticated|unauthenticated/iu.test(evidence),
    functional: null,
    authorized: false,
    status: authProbe?.status ?? null,
    evidence,
  };
}

export function codexFunctionalPreflight(run = spawnSync) {
  const probe = run(
    "codex",
    [
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "Reply exactly MORRO_EXECUTOR_READY",
    ],
    {
      encoding: "utf8",
      input: "",
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const evidence = output(probe);
  return {
    functional:
      probe?.status === 0 &&
      /(?:^|\s)MORRO_EXECUTOR_READY(?:\s|$)/u.test(evidence),
    status: probe?.status ?? null,
    evidence,
  };
}

export function codexExecutorPreflight({
  run = spawnSync,
  authorized = false,
} = {}) {
  const auth = codexAuthPreflight(run);
  const functional = codexFunctionalPreflight(run);
  return executorHealth({
    ...auth,
    functional: functional.functional,
    authorized,
    evidence: [auth.evidence, functional.evidence].filter(Boolean).join("\n"),
  });
}

export function executorHealth(input) {
  const result = {
    executor: input?.executor ?? null,
    installed: input?.installed === true,
    authenticated: input?.authenticated === true,
    functional: input?.functional === true,
    authorized: input?.authorized === true,
    evidence: input?.evidence ?? null,
  };
  return {
    ...result,
    healthy:
      result.installed &&
      result.authenticated &&
      result.functional &&
      result.authorized,
  };
}

const IMPLEMENTATION_EXECUTORS = new Set(["codex", "chatgpt-control"]);

export function authorizeDispatch(preflight) {
  const health = executorHealth(preflight);
  if (!IMPLEMENTATION_EXECUTORS.has(health.executor)) {
    return {
      result: "BLOCK",
      failureClass: "EXECUTOR_FAILURE",
      rootCause: "EXECUTOR_ROLE_NOT_AUTHORIZED",
      health,
    };
  }
  if (health.healthy) return { result: "PASS", health };
  const rootCause = !health.installed
    ? "EXECUTOR_NOT_INSTALLED"
    : !health.authenticated
      ? "EXECUTOR_AUTH_PREFLIGHT_MISSING"
      : !health.functional
        ? "EXECUTOR_FUNCTIONAL_PROBE_FAILED"
        : "EXECUTOR_NOT_AUTHORIZED";
  return {
    result: "BLOCK",
    failureClass:
      rootCause === "EXECUTOR_AUTH_PREFLIGHT_MISSING"
        ? "EXECUTOR_AUTH_UNAVAILABLE"
        : "EXECUTOR_FAILURE",
    rootCause,
    health,
  };
}

export function selectAuthorizedExecutor(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0)
    return {
      result: "BLOCK",
      failureClass: "EXECUTOR_FAILURE",
      rootCause: "NO_EXECUTOR_CANDIDATES",
      attempts: [],
    };
  const attempts = [];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const decision = authorizeDispatch(candidate);
    attempts.push({
      executor: candidate?.executor ?? null,
      result: decision.result,
      rootCause: decision.rootCause ?? null,
    });
    if (decision.result === "PASS") {
      return {
        result: "PASS",
        executor: decision.health.executor,
        health: decision.health,
        fallbackUsed: index > 0,
        attempts,
      };
    }
  }
  return {
    result: "BLOCK",
    failureClass: "EXECUTOR_FAILURE",
    rootCause: "NO_HEALTHY_AUTHORIZED_EXECUTOR",
    attempts,
  };
}
