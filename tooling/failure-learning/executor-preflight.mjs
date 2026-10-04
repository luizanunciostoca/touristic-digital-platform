import { spawnSync } from "node:child_process";
export function codexAuthPreflight(run = spawnSync) {
  const r = run("codex", ["login", "status"], { encoding: "utf8" });
  const evidence = String(r.stdout ?? "") + "\n" + String(r.stderr ?? "");
  return {
    executor: "codex",
    authenticated:
      r.status === 0 &&
      /logged in|authenticated/i.test(evidence) &&
      !/not logged in|not authenticated|unauthenticated/i.test(evidence),
    status: r.status,
    evidence: evidence.trim(),
  };
}
export function authorizeDispatch(preflight) {
  return preflight?.authenticated === true
    ? { result: "PASS" }
    : {
        result: "BLOCK",
        failureClass: "EXECUTOR_AUTH_UNAVAILABLE",
        rootCause: "EXECUTOR_AUTH_PREFLIGHT_MISSING",
      };
}
