import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { buildDispatchRequest } from "../mdctl/dispatch-runtime.mjs";

// Pure preparation only. All supplied evidence is declarative, including the
// expected context. This function does not authenticate a provider, acquire a
// lease, consume a grant, prove cessation, or authorize an executor.
export function evaluateCloudDispatchProposal(input = {}) {
  input ??= {};
  const findings = [];
  const add = (condition, code) => {
    if (!condition) findings.push(code);
  };
  const proposal = input.proposal ?? {};
  const expected = input.expected ?? {};
  const sha = /^[a-f0-9]{40}$/u;
  const digest = /^sha256:[a-f0-9]{64}$/u;
  const identifier = /^[A-Z][A-Z0-9-]{2,119}$/u;
  const instant = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
      ? Date.parse(value)
      : NaN;
  let request = null;
  try {
    request = buildDispatchRequest(input.dispatch);
  } catch {
    findings.push("DISPATCH_INPUT_INVALID");
  }
  add(
    request?.executor === "codex" || request?.executor === "chatgpt-control",
    "EXECUTOR_ROLE_INVALID",
  );
  add(
    isDeepStrictEqual(proposal.request, request),
    "DISPATCH_BINDING_MISMATCH",
  );
  add(
    typeof request?.workspacePath === "string" &&
      request.workspacePath.startsWith("/") &&
      !request.workspacePath
        .split("/")
        .some((part) => part === ".." || part === ".") &&
      !/[\x00-\x1f]/u.test(request.workspacePath),
    "WORKSPACE_DESCRIPTOR_INVALID",
  );
  for (const key of ["claimId", "taskId"])
    add(
      identifier.test(expected[key] ?? "") && proposal[key] === expected[key],
      "IDENTITY_BINDING_MISMATCH_" + key,
    );
  add(proposal.claimId === request?.changeSetId, "CLAIM_DISPATCH_MISMATCH");
  add(
    sha.test(expected.baseSha ?? "") &&
      request?.exactBaseSha === expected.baseSha,
    "BASE_BINDING_MISMATCH",
  );
  add(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(expected.repository ?? "") &&
      proposal.repository === expected.repository,
    "REPOSITORY_BINDING_MISMATCH",
  );
  add(
    Number.isSafeInteger(expected.operator?.id) &&
      expected.operator.id > 0 &&
      /^[A-Za-z0-9-]{1,39}$/u.test(expected.operator?.login ?? "") &&
      isDeepStrictEqual(proposal.operator, expected.operator),
    "OPERATOR_BINDING_MISMATCH",
  );
  for (const key of ["headSha", "treeSha"])
    add(
      sha.test(expected[key] ?? "") && proposal[key] === expected[key],
      "GIT_BINDING_MISMATCH_" + key,
    );
  add(
    digest.test(expected.workspaceDescriptorDigest ?? "") &&
      proposal.workspaceDescriptorDigest === expected.workspaceDescriptorDigest,
    "WORKSPACE_DIGEST_MISMATCH",
  );
  add(
    /^(?:agent|feat|fix|infra|wave|chore)\/[A-Za-z0-9._/-]+$/u.test(
      expected.branch ?? "",
    ) && proposal.branch === expected.branch,
    "BRANCH_BINDING_MISMATCH",
  );
  const now = instant(input.now),
    issued = instant(proposal.issuedAt),
    expires = instant(proposal.expiresAt),
    claimExpires = instant(expected.claimExpiresAt);
  add(
    [now, issued, expires, claimExpires].every(Number.isFinite) &&
      issued <= now &&
      now < expires &&
      expires <= claimExpires &&
      expires > issued &&
      expires - issued <= 30 * 60 * 1000,
    "WINDOW_INVALID",
  );
  add(/^[a-f0-9]{32,128}$/u.test(proposal.nonce ?? ""), "NONCE_INVALID");
  add(input.revoked === false, "REVOCATION_UNVERIFIED_OR_REVOKED");
  add(Array.isArray(input.priorNonces), "NONCE_HISTORY_MISSING");
  if (Array.isArray(input.priorNonces)) {
    add(
      input.priorNonces.every((nonce) => typeof nonce === "string"),
      "NONCE_HISTORY_INVALID",
    );
    add(!input.priorNonces.includes(proposal.nonce), "NONCE_REPLAY");
  }
  add(Array.isArray(input.otherAssignments), "ASSIGNMENT_INVENTORY_MISSING");
  for (const assignment of Array.isArray(input.otherAssignments)
    ? input.otherAssignments
    : []) {
    add(
      identifier.test(assignment?.taskId ?? "") &&
        identifier.test(assignment?.claimId ?? ""),
      "ASSIGNMENT_INVENTORY_INVALID",
    );
    // Expired/revoked records do not establish cessation of an earlier writer.
    add(
      assignment?.taskId !== proposal.taskId &&
        assignment?.claimId !== proposal.claimId,
      "CONCURRENT_ASSIGNMENT",
    );
  }
  return {
    status: "PREPARATION_ONLY",
    operationalAuthority: false,
    compatible: findings.length === 0,
    request: request ? structuredClone(request) : null,
    findings: [...new Set(findings)],
    unverified: [
      "PROVIDER_ORIGIN_AND_CURRENT_AUTHORIZATION",
      "INVENTORY_COMPLETENESS_AND_FRESHNESS",
      "WORKSPACE_EXISTENCE_ISOLATION_AND_GIT_ANCESTRY",
      "PRIOR_WRITER_CESSATION",
      "ATOMIC_RESERVATION_AND_REPLAY_PROTECTION",
      "EXECUTOR_READBACK",
    ],
  };
}

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
