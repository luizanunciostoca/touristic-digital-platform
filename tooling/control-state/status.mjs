#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/u;
const ACTIVE = new Set([
  "CLAIMED",
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "PROOF_ACCEPTED",
  "INTEGRATION_READY",
]);
const text = (value, limit = 200) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/gu, "").slice(0, limit)
    : null;
const sha = (value) => (SHA.test(value ?? "") ? value : null);

export function validateRepository(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value ?? ""))
    throw new Error("REPOSITORY_INVALID");
  return value;
}

export function runtimeOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("RUNTIME_ORIGIN_INVALID");
  return url.origin;
}

export async function githubApi(endpoint, { paginate = false } = {}) {
  const args = ["api", "--hostname", "github.com", "--method", "GET", endpoint];
  if (paginate) args.push("--paginate", "--slurp");
  const { stdout } = await execute("gh", args, {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function decodeContent(value) {
  if (value?.encoding !== "base64" || typeof value.content !== "string")
    throw new Error("CONTENT_INVALID");
  return JSON.parse(Buffer.from(value.content, "base64").toString("utf8"));
}

function checkSummary(value) {
  const validName =
    typeof value?.name === "string" &&
    /^[a-z][a-z0-9-]{0,159}$/u.test(value.name);
  const validMetadata = validName && typeof value?.critical === "boolean";
  const status =
    validMetadata && ["pass", "fail", "warn"].includes(value?.status)
      ? value.status
      : "unknown";
  return {
    name: validName ? value.name : "invalid-check-identifier",
    status,
    critical: typeof value?.critical === "boolean" ? value.critical : null,
  };
}

export function summarizeRuntime(health, ready) {
  const healthSha = sha(health.releaseSha);
  const readySha = sha(ready.releaseSha);
  const checks = Array.isArray(ready.body?.checks)
    ? ready.body.checks.map(checkSummary)
    : [];
  const identityVerified = Boolean(
    healthSha && readySha && healthSha === readySha,
  );
  const healthy =
    health.httpStatus === 200 &&
    health.body?.status === "live" &&
    ready.httpStatus === 200 &&
    ready.body?.readiness === "ready" &&
    ready.body?.status === "healthy" &&
    checks.length > 0 &&
    checks.length <= 50 &&
    new Set(checks.map((check) => check.name)).size === checks.length &&
    checks.every((check) => check.status === "pass") &&
    identityVerified;
  return {
    state: healthy ? "HEALTHY" : "UNHEALTHY_OR_UNVERIFIED",
    releaseSha: identityVerified ? readySha : null,
    identityVerified,
    healthHttpStatus: health.httpStatus,
    readinessHttpStatus: ready.httpStatus,
    readiness:
      ready.body?.readiness === "ready" ? "ready" : "not-ready-or-unknown",
    status: ["healthy", "degraded", "unhealthy"].includes(ready.body?.status)
      ? ready.body.status
      : "unknown",
    deploymentId: /^[A-Za-z0-9_-]{1,100}$/u.test(ready.deploymentId ?? "")
      ? ready.deploymentId
      : null,
    checks,
  };
}

export async function probeRuntime(origin, fetchImpl = fetch) {
  const safeOrigin = runtimeOrigin(origin);
  async function request(path) {
    const response = await fetchImpl(new URL(path, safeOrigin), {
      redirect: "error",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(10000),
    });
    const raw = await response.text();
    if (raw.length > 1024 * 1024) throw new Error("RUNTIME_RESPONSE_TOO_LARGE");
    return {
      httpStatus: response.status,
      body: JSON.parse(raw),
      releaseSha: response.headers.get("x-release-sha"),
      deploymentId: response.headers.get("x-deployment-id"),
    };
  }
  const [health, ready] = await Promise.all([
    request("/healthz"),
    request("/readyz"),
  ]);
  return { origin: safeOrigin, ...summarizeRuntime(health, ready) };
}

export async function localWorkspace(directory) {
  const git = async (...args) =>
    (
      await execute("git", ["--no-optional-locks", "-C", directory, ...args], {
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 2 * 1024 * 1024,
      })
    ).stdout.trim();
  const [head, branch, status] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("branch", "--show-current"),
    git("status", "--porcelain=v1", "--untracked-files=normal"),
  ]);
  return {
    headSha: sha(head),
    branch: text(branch) || "DETACHED",
    dirty: Boolean(status),
    changedEntries: status ? status.split("\n").length : 0,
    authority: "LOCAL_WORKSPACE_ONLY",
  };
}

export async function collectObservedState({
  repository = "luizanunciostoca/touristic-digital-platform",
  api = githubApi,
  probe = probeRuntime,
  workspace = localWorkspace,
  localDirectory = process.cwd(),
  stagingUrl,
  productionUrl,
  now = () => new Date().toISOString(),
} = {}) {
  validateRepository(repository);
  const sources = {};
  const blockers = [];
  const snapshotStartedAt = now();
  const root = "repos/" + repository;
  const block = (code, subject) => blockers.push({ code, subject });
  async function capture(name, operation) {
    const startedAt = now();
    try {
      const value = await operation();
      sources[name] = { state: "AVAILABLE", startedAt, completedAt: now() };
      return value;
    } catch {
      sources[name] = {
        state: "UNAVAILABLE",
        startedAt,
        completedAt: now(),
        errorCode: "SOURCE_UNAVAILABLE",
      };
      block("SOURCE_UNAVAILABLE", name);
      return null;
    }
  }
  async function list(endpoint, key) {
    const pages = await api(endpoint, { paginate: true });
    if (!Array.isArray(pages)) throw new Error("PAGINATION_INVALID");
    return pages.flatMap((page) => {
      const entries = key ? page?.[key] : page;
      if (!Array.isArray(entries)) throw new Error("PAGE_INVALID");
      return entries;
    });
  }
  const main = await capture("main", async () => {
    const value = await api(root + "/commits/main");
    if (!sha(value?.sha) || !sha(value?.commit?.tree?.sha))
      throw new Error("MAIN_IDENTITY_INVALID");
    return value;
  });
  const mainSha = main?.sha ?? null;
  const atMain = (path) => root + "/contents/" + path + "?ref=" + mainSha;
  const [pulls, registry, backlog, runs, activeRuns, deployments, local] =
    await Promise.all([
      capture("pullRequests", () =>
        list(root + "/pulls?state=open&per_page=100"),
      ),
      capture("claims", async () => {
        if (!mainSha) throw new Error("MAIN_REQUIRED");
        const value = decodeContent(
          await api(atMain(".github/morro-control/claims.json")),
        );
        if (
          value?.registryAuthority !== "ORCHESTRATOR" ||
          !value.claims ||
          typeof value.claims !== "object" ||
          Array.isArray(value.claims)
        )
          throw new Error("REGISTRY_INVALID");
        return value;
      }),
      capture("backlog", async () => {
        if (!mainSha) throw new Error("MAIN_REQUIRED");
        const value = decodeContent(
          await api(atMain(".github/morro-control/backlog.json")),
        );
        if (!Array.isArray(value?.items)) throw new Error("BACKLOG_INVALID");
        return value;
      }),
      capture("recentCi", async () => {
        const value = await api(root + "/actions/runs?per_page=30");
        if (!Array.isArray(value?.workflow_runs))
          throw new Error("CI_RESPONSE_INVALID");
        return value;
      }),
      capture("activeCi", async () =>
        (
          await Promise.all(
            ["queued", "in_progress", "waiting", "pending", "requested"].map(
              (status) =>
                list(
                  root + "/actions/runs?status=" + status + "&per_page=100",
                  "workflow_runs",
                ),
            ),
          )
        ).flat(),
      ),
      capture("deployments", async () => {
        const value = await api(root + "/deployments?per_page=30");
        if (!Array.isArray(value))
          throw new Error("DEPLOYMENTS_RESPONSE_INVALID");
        return value;
      }),
      capture("localWorkspace", () => workspace(localDirectory)),
    ]);
  const activePrs = (Array.isArray(pulls) ? pulls : []).map((pr) => ({
    number: pr.number,
    branch: text(pr.head?.ref),
    headSha: sha(pr.head?.sha),
    baseSha: sha(pr.base?.sha),
    draft: pr.draft === true,
    repository: text(pr.head?.repo?.full_name),
    url: "https://github.com/" + repository + "/pull/" + pr.number,
  }));
  async function mergedClaim(id, claim) {
    const branch = claim?.branch;
    if (!mainSha || typeof branch !== "string" || !branch) return null;
    const closed = await list(
      root +
        "/pulls?state=closed&head=" +
        encodeURIComponent(repository.split("/")[0] + ":" + branch) +
        "&per_page=100",
    );
    const merged = closed
      .filter(
        (pr) =>
          pr.state === "closed" &&
          Number.isInteger(pr.number) &&
          pr.head?.ref === branch &&
          pr.head?.repo?.full_name === repository &&
          pr.base?.ref === "main" &&
          pr.base?.repo?.full_name === repository &&
          Number.isFinite(Date.parse(pr.merged_at)) &&
          sha(pr.merge_commit_sha),
      )
      .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at))[0];
    if (!merged) return null;
    const ancestor = async (candidate, target = mainSha) => {
      if (!sha(candidate)) return false;
      if (candidate === target) return true;
      const value = await api(root + "/compare/" + candidate + "..." + target);
      return (
        ["ahead", "identical"].includes(value?.status) &&
        value?.base_commit?.sha === candidate &&
        value?.merge_base_commit?.sha === candidate
      );
    };
    if (
      !(await ancestor(merged.merge_commit_sha)) ||
      !(await ancestor(claim.baseSha, merged.merge_commit_sha))
    )
      return null;
    const historical = decodeContent(
      await api(
        root +
          "/contents/.morro/changesets/" +
          id +
          ".json?ref=" +
          merged.merge_commit_sha,
      ),
    );
    if (
      historical.id !== id ||
      historical.branch !== branch ||
      historical.baseSha !== claim.baseSha
    )
      return null;
    const refs = await api(
      root + "/git/matching-refs/heads/" + encodeURIComponent(branch),
    );
    if (
      !Array.isArray(refs) ||
      refs.some(
        (ref) =>
          typeof ref?.ref !== "string" ||
          !/^refs\/heads\/\S+$/u.test(ref.ref) ||
          ref.object?.type !== "commit" ||
          !sha(ref.object?.sha),
      )
    )
      throw new Error("REF_RESPONSE_INVALID");
    const exact = refs.filter((ref) => ref.ref === "refs/heads/" + branch);
    if (exact.length > 1) throw new Error("REF_AMBIGUOUS");
    const head = exact[0]?.object;
    if (
      exact.length &&
      (head?.type !== "commit" || !sha(head.sha) || !(await ancestor(head.sha)))
    )
      return null;
    return {
      state: "MERGED",
      basis: "GITHUB_MERGED_PR_AND_MAIN_ANCESTRY",
      prNumber: merged.number,
      mergeSha: merged.merge_commit_sha,
      mainSha,
      branchHeadSha: head?.sha ?? null,
      branchObservation: exact.length ? "ANCESTOR_OF_MAIN" : "ABSENT",
      source: "https://github.com/" + repository + "/pull/" + merged.number,
      releaseVerified: false,
    };
  }
  const observedClaims = [];
  for (const [id, value] of Object.entries(registry?.claims ?? {})) {
    if (!/^MD-[A-Z0-9-]+$/u.test(id)) {
      block("CLAIM_ID_INVALID", "registry");
      continue;
    }
    const expires = Date.parse(value?.expiresAt);
    const valid =
      ACTIVE.has(value?.status) &&
      Number.isFinite(expires) &&
      expires > Date.parse(snapshotStartedAt);
    const matches = activePrs.filter(
      (pr) => pr.branch === value?.branch && pr.repository === repository,
    );
    const claim = {
      id,
      owner: text(value?.owner),
      branch: text(value?.branch),
      baseSha: sha(value?.baseSha),
      declaredState: text(value?.status),
      expiresAt: text(value?.expiresAt),
      activeByRegistry: valid,
      openPrNumbers: matches.map((pr) => pr.number),
      prObservation: pulls === null ? "UNAVAILABLE" : "AVAILABLE",
      paths: Array.isArray(value?.paths)
        ? value.paths.map((path) => text(path)).filter(Boolean)
        : [],
    };
    const merged =
      pulls !== null && matches.length === 0
        ? await capture("claimMerge:" + id, () => mergedClaim(id, value))
        : null;
    claim.observedState = merged
      ? "MERGED"
      : matches.length
        ? "OPEN_PR"
        : "UNVERIFIED";
    claim.mergeEvidence = merged;
    observedClaims.push(claim);
    if (!valid && !merged) block("CLAIM_INACTIVE_OR_EXPIRED", id);
    if (valid && pulls !== null && matches.length === 0 && !merged)
      block("CLAIM_WITHOUT_OPEN_PR", id);
  }
  const activeClaims = observedClaims.filter(
    (claim) => claim.activeByRegistry && claim.observedState !== "MERGED",
  );
  const changeSets = [];
  // The registry is small; serialize reads rather than creating unbounded API fan-out.
  for (const claim of observedClaims) {
    const value = await capture("manifest:" + claim.id, async () =>
      decodeContent(
        await api(atMain(".morro/changesets/" + claim.id + ".json")),
      ),
    );
    if (!value) continue;
    changeSets.push({
      id: claim.id,
      declaredState: text(value.state),
      baseSha: sha(value.baseSha),
      branch: text(value.branch),
      risk: text(value.risk),
      dependencies: Array.isArray(value.dependencies)
        ? value.dependencies.map((item) => text(item))
        : [],
    });
    if (
      value.id !== claim.id ||
      value.branch !== claim.branch ||
      value.baseSha !== claim.baseSha
    )
      block("CLAIM_MANIFEST_IDENTITY_MISMATCH", claim.id);
  }
  const runtimeHealth = {};
  for (const [environment, url] of [
    ["staging", stagingUrl],
    ["production", productionUrl],
  ]) {
    if (!url) {
      runtimeHealth[environment] = {
        state: "NOT_CONFIGURED",
        releaseSha: null,
      };
      block("RUNTIME_NOT_CONFIGURED", environment);
      continue;
    }
    const value = await capture("runtime:" + environment, () => probe(url));
    runtimeHealth[environment] = value ?? {
      state: "UNAVAILABLE",
      releaseSha: null,
    };
    if (value?.state !== "HEALTHY")
      block("RUNTIME_UNHEALTHY_OR_UNVERIFIED", environment);
    if (value?.releaseSha && mainSha && value.releaseSha !== mainSha)
      block("RUNTIME_MAIN_DRIFT", environment);
  }
  const deploymentSummary = {};
  for (const environment of ["staging", "production"]) {
    const latest = (Array.isArray(deployments) ? deployments : [])
      .filter((entry) => entry.environment?.toLowerCase() === environment)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!latest) {
      deploymentSummary[environment] = {
        state: "NOT_OBSERVED_IN_RECENT_SAMPLE",
      };
      continue;
    }
    const statuses = await capture("deploymentStatus:" + environment, () =>
      api(root + "/deployments/" + latest.id + "/statuses?per_page=1"),
    );
    deploymentSummary[environment] = {
      id: latest.id,
      sha: sha(latest.sha),
      state: text(statuses?.[0]?.state) ?? "UNKNOWN",
      createdAt: text(latest.created_at),
      authority: "GITHUB_DEPLOYMENT_RECORD_NOT_RUNTIME_PROOF",
    };
  }
  const latestMain = await capture("mainRecheck", () =>
    api(root + "/commits/main"),
  );
  const mainStable = Boolean(mainSha && latestMain?.sha === mainSha);
  if (!mainStable) block("MAIN_CHANGED_OR_UNVERIFIABLE", "main");
  const summarizeRun = (run) => ({
    id: run.id,
    workflowId: run.workflow_id,
    headSha: sha(run.head_sha),
    branch: text(run.head_branch),
    status: text(run.status),
    conclusion: text(run.conclusion),
    event: text(run.event),
    updatedAt: text(run.updated_at),
  });
  const running = [
    ...new Map(
      (Array.isArray(activeRuns) ? activeRuns : []).map((run) => [
        run.id,
        summarizeRun(run),
      ]),
    ).values(),
  ];
  const desiredTasks = (backlog?.items ?? []).map((item) => {
    const claim = observedClaims.find((candidate) => candidate.id === item.id);
    return {
      id: text(item.id),
      priority: text(item.priority),
      declaredState: text(item.state),
      dependencies: Array.isArray(item.dependencies)
        ? item.dependencies.map((id) => text(id))
        : [],
      basis: "VERSIONED_DESIRED_STATE_NOT_ACCEPTED_PROOF",
      dispatchAllowed: false,
      requiresFabricProof: true,
      reason:
        claim?.observedState === "MERGED"
          ? "MERGE_OBSERVED_RELEASE_PROOF_NOT_INFERRED"
          : claim
            ? "CLAIM_PRESENT_REVIEW_CURRENT_BRANCH_AND_PROOF"
            : item.state === "READY"
              ? "DECLARED_READY_DEPENDENCY_PROOF_NOT_COLLECTED"
              : "DECLARED_STATE_REQUIRES_LIVE_RECONCILIATION",
    };
  });
  const actions = {
    SOURCE_UNAVAILABLE: "RESTORE_SOURCE_READ_ACCESS_AND_RECAPTURE",
    CLAIM_WITHOUT_OPEN_PR:
      "CHECK_BRANCH_AND_MERGED_PR_HISTORY_BEFORE_RETIRING_CLAIM",
    CLAIM_INACTIVE_OR_EXPIRED: "REVIEW_CLAIM_OWNERSHIP_BEFORE_ANY_WRITE",
    CLAIM_MANIFEST_IDENTITY_MISMATCH:
      "RECONCILE_CLAIM_IDENTITY_WITH_ORCHESTRATOR",
    RUNTIME_NOT_CONFIGURED: "CONFIGURE_VERIFIED_RUNTIME_ORIGIN_AND_RECAPTURE",
    RUNTIME_UNHEALTHY_OR_UNVERIFIED:
      "INVESTIGATE_FAILED_RUNTIME_CHECKS_AND_IDENTITY",
    RUNTIME_MAIN_DRIFT:
      "COMPARE_ACCEPTED_CANDIDATE_AND_DEPLOYMENT_BEFORE_PROMOTION",
    MAIN_CHANGED_OR_UNVERIFIABLE: "RECAPTURE_LIVE_MAIN_BEFORE_DECIDING",
  };
  const nextActions = blockers.map((blocker) => ({
    subject: blocker.subject,
    blocker: blocker.code,
    action: actions[blocker.code] ?? "INVESTIGATE_SOURCE_VALIDITY",
    dispatchAllowed: false,
  }));
  return {
    schemaVersion: 1,
    kind: "MORRO_GENERATED_OBSERVED_STATE",
    authority: "OBSERVATION_ONLY_NOT_RELEASE_PROOF",
    repository,
    snapshotStartedAt,
    generatedAt: now(),
    mainSha,
    mainTreeSha: main?.commit?.tree?.sha ?? null,
    mainShaAtEnd: sha(latestMain?.sha),
    consistency: mainStable
      ? "MAIN_STABLE_VOLATILE_SOURCES_NON_ATOMIC"
      : "INCONSISTENT",
    collectionState: Object.values(sources).some(
      (source) => source.state === "UNAVAILABLE",
    )
      ? "PARTIAL"
      : "CAPTURED",
    activePrs,
    observedClaims,
    activeClaims,
    changeSets,
    runningTasks: activeClaims
      .filter((claim) => claim.activeByRegistry)
      .map((claim) => ({
        id: claim.id,
        owner: claim.owner,
        declaredState: claim.declaredState,
        processVerified: false,
        openPrNumbers: claim.openPrNumbers,
      })),
    agents: {
      verifiedRunningCount: null,
      claimedOwners: [
        ...new Set(
          activeClaims
            .filter((claim) => claim.activeByRegistry)
            .map((claim) => claim.owner),
        ),
      ],
    },
    stagingSha: runtimeHealth.staging.releaseSha,
    productionSha: runtimeHealth.production.releaseSha,
    deployments: { sampleLimit: 30, environments: deploymentSummary },
    ci: {
      recentSampleLimit: 30,
      recentRuns: (runs?.workflow_runs ?? []).map(summarizeRun),
      activeRuns: running,
    },
    runtimeHealth,
    localWorkspace: local,
    desiredTasks,
    nextReadyTasks: [],
    readyCandidates: desiredTasks
      .filter((task) => task.declaredState === "READY")
      .map((task) => ({
        ...task,
        basis: "DESIRED_STATE_CANDIDATE",
      })),
    nextActions,
    readinessAuthority: "FABRIC_PROOF_REQUIRED_NO_AUTOMATIC_STATE_ADVANCEMENT",
    blockers,
    sources,
  };
}

export function renderSummary(state) {
  const runtime = (env) =>
    env.state + " " + (env.releaseSha ?? "SHA_UNVERIFIED");
  return [
    "MAIN " + (state.mainSha ?? "UNAVAILABLE"),
    "TREE " + (state.mainTreeSha ?? "UNAVAILABLE"),
    "OPEN PRS " + state.activePrs.map((pr) => "#" + pr.number).join(" "),
    "CLAIMS " +
      state.activeClaims
        .map((claim) => claim.id + ":" + claim.declaredState)
        .join(" "),
    "AGENTS running=UNVERIFIED claimedOwners=" +
      state.agents.claimedOwners.length,
    "CI active=" +
      state.ci.activeRuns.length +
      " recentSample=" +
      state.ci.recentRuns.length,
    "STAGING " + runtime(state.runtimeHealth.staging),
    "PRODUCTION " + runtime(state.runtimeHealth.production),
    "BLOCKERS " +
      (state.blockers.map((item) => item.code + ":" + item.subject).join(" ") ||
        "none observed"),
    "NEXT READY TASKS verified=0 unverifiedCandidates=" +
      state.readyCandidates.length,
    "NEXT ACTIONS " +
      (state.nextActions
        .map((item) => item.action + ":" + item.subject)
        .join(" ") || "REVIEW_ACCEPTED_FABRIC_PROOF_FOR_DESIRED_TASKS"),
    "OBSERVATION " + state.collectionState + " " + state.consistency,
  ].join("\n");
}

export function parseArguments(args, env = process.env) {
  const options = {
    repository:
      env.GITHUB_REPOSITORY ?? "luizanunciostoca/touristic-digital-platform",
    stagingUrl: env.MORRO_STAGING_URL,
    productionUrl: env.MORRO_PRODUCTION_URL,
  };
  let summary = false;
  let strict = false;
  const keys = {
    "--repo": "repository",
    "--staging-url": "stagingUrl",
    "--production-url": "productionUrl",
    "--local-dir": "localDirectory",
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--summary") summary = true;
    else if (args[i] === "--strict") strict = true;
    else if (args[i] === "--json" || args[i] === "status") continue;
    else if (keys[args[i]] && args[i + 1] && !args[i + 1].startsWith("--"))
      options[keys[args[i]]] = args[++i];
    else throw new Error("ARGUMENT_INVALID");
  }
  validateRepository(options.repository);
  for (const key of ["stagingUrl", "productionUrl"])
    if (options[key]) runtimeOrigin(options[key]);
  return { options, summary, strict };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { options, summary, strict } = parseArguments(process.argv.slice(2));
    const state = await collectObservedState(options);
    console.log(
      summary ? renderSummary(state) : JSON.stringify(state, null, 2),
    );
    if (
      strict &&
      (state.blockers.length || state.collectionState !== "CAPTURED")
    )
      process.exitCode = 1;
  } catch {
    console.error("MORRO_STATUS_FAILED:INVALID_INPUT_OR_COLLECTION_FAILURE");
    process.exitCode = 2;
  }
}
