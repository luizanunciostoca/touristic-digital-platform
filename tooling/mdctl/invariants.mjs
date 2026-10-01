import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { githubApi } from "../control-state/status.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const RUN_ID = /^[1-9][0-9]*$/u;
const ACTIVE_CLAIM_STATES = new Set([
  "CLAIMED",
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "PROOF_ACCEPTED",
  "INTEGRATION_READY",
]);

function result(id, title, status, reason, critical = true) {
  return { id, title, status, reason, critical };
}

function evidenceBoundToSha(
  releaseState,
  stateField,
  shaField,
  runField,
  subjectSha,
) {
  return Boolean(
    releaseState?.[stateField] === "VERIFIED" &&
    SHA.test(subjectSha ?? "") &&
    releaseState?.[shaField] === subjectSha &&
    RUN_ID.test(String(releaseState?.[runField] ?? "")),
  );
}

function heartbeatFields(body) {
  const values = {};
  for (const line of String(body ?? "").split("\n")) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return values;
}

export async function collectTermuxHeartbeat({
  repository = "luizanunciostoca/morro-termux-control",
  api = githubApi,
  nowMs = Date.now(),
  maxAgeMs = 5 * 60 * 1000,
} = {}) {
  const pages = await api(
    "repos/" + repository + "/issues?state=open&per_page=100",
    { paginate: true },
  );
  const issues = pages
    .flat()
    .filter(
      (issue) => !issue.pull_request && issue.title === "[TERMUX-AGENT] status",
    );
  const details = issues.map((issue) => {
    const fields = heartbeatFields(issue.body);
    const heartbeatMs = Date.parse(fields.heartbeat_utc ?? "");
    return {
      number: issue.number,
      fields,
      fresh:
        Number.isFinite(heartbeatMs) &&
        nowMs - heartbeatMs >= 0 &&
        nowMs - heartbeatMs <= maxAgeMs,
    };
  });
  const one = details[0];
  const healthy =
    details.length === 1 &&
    one.fields.state === "ONLINE" &&
    one.fields.build === "native-v3" &&
    one.fields.protocol_version === "2" &&
    Boolean(one.fields.agent_instance_id) &&
    Boolean(one.fields.boot_id) &&
    one.fresh;
  return {
    state: healthy ? "HEALTHY" : "UNHEALTHY_OR_UNVERIFIED",
    openHeartbeatCount: details.length,
    canonicalIssue: details.length === 1 ? one.number : null,
    details,
  };
}

async function readJson(root, path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

function decodeGitHubJson(value) {
  if (value?.encoding !== "base64" || typeof value.content !== "string")
    throw new Error("CONTROL_PROJECTION_CONTENT_INVALID");
  return JSON.parse(Buffer.from(value.content, "base64").toString("utf8"));
}

export async function loadInvariantContext(root = process.cwd()) {
  const [integrationQueue, releaseState, ownership] = await Promise.all([
    readJson(root, ".morro/integration-queue.json"),
    readJson(root, ".github/morro-control/release-state.json"),
    readJson(root, ".morro/ownership.json"),
  ]);
  return {
    integrationQueue,
    releaseState,
    ownership,
    projectionAuthority: "LOCAL_WORKSPACE_UNTRUSTED_FOR_LIVE_AUTHORITY",
    projectionSha: null,
  };
}

export async function loadInvariantContextAtMain({
  repository = "luizanunciostoca/touristic-digital-platform",
  mainSha,
  api = githubApi,
} = {}) {
  if (!REPOSITORY.test(repository)) throw new Error("REPOSITORY_INVALID");
  if (!SHA.test(mainSha ?? "")) throw new Error("MAIN_SHA_INVALID");
  const root = "repos/" + repository + "/contents/";
  const readAtMain = async (path) =>
    decodeGitHubJson(
      await api(root + path + "?ref=" + encodeURIComponent(mainSha)),
    );
  const [integrationQueue, releaseState, ownership] = await Promise.all([
    readAtMain(".morro/integration-queue.json"),
    readAtMain(".github/morro-control/release-state.json"),
    readAtMain(".morro/ownership.json"),
  ]);
  const latestMain = await api("repos/" + repository + "/commits/main");
  if (!SHA.test(latestMain?.sha ?? ""))
    throw new Error("CONTROL_PROJECTION_MAIN_RECHECK_INVALID");
  if (latestMain.sha !== mainSha)
    throw new Error("MAIN_CHANGED_DURING_CONTROL_PROJECTION_LOAD");
  return {
    integrationQueue,
    releaseState,
    ownership,
    projectionAuthority: "GITHUB_EXACT_MAIN",
    projectionSha: mainSha,
    projectionMainShaAtEnd: latestMain.sha,
  };
}

export function evaluateInvariants({
  observed,
  termux,
  integrationQueue,
  releaseState,
  ownership,
  projectionAuthority,
  projectionSha,
}) {
  const checks = [];

  const bindingSupplied = projectionAuthority != null || projectionSha != null;
  checks.push(
    result(
      "INV-000",
      "control projections are bound to observed exact main",
      !bindingSupplied
        ? "NOT_APPLICABLE"
        : projectionAuthority === "GITHUB_EXACT_MAIN" &&
            SHA.test(projectionSha ?? "") &&
            projectionSha === observed?.mainSha
          ? "PASS"
          : "FAIL",
      !bindingSupplied
        ? "isolated invariant evaluation has no projection binding input"
        : projectionAuthority === "GITHUB_EXACT_MAIN" &&
            projectionSha === observed?.mainSha
          ? "integration, release and ownership projections came from observed exact main"
          : "control projections are not proven to originate from observed exact main",
    ),
  );

  checks.push(
    result(
      "INV-001",
      "exactly one canonical Termux heartbeat",
      termux?.state === "HEALTHY" ? "PASS" : "FAIL",
      termux?.state === "HEALTHY"
        ? "one fresh protocol-v2 Native Agent heartbeat"
        : "heartbeat singleton, freshness or identity is not proven",
    ),
  );

  const observedAt = Date.parse(observed?.snapshotStartedAt ?? "");
  const expiredActive = (observed?.observedClaims ?? []).filter(
    (claim) =>
      ACTIVE_CLAIM_STATES.has(claim.declaredState) &&
      Number.isFinite(Date.parse(claim.expiresAt)) &&
      Number.isFinite(observedAt) &&
      Date.parse(claim.expiresAt) <= observedAt,
  );
  checks.push(
    result(
      "INV-002",
      "zero active expired claims",
      expiredActive.length === 0 ? "PASS" : "FAIL",
      expiredActive.length === 0
        ? "no expired active-status declaration remains"
        : "expired authority: " +
            expiredActive.map((claim) => claim.id).join(","),
    ),
  );

  const activeBatches = (integrationQueue?.batches ?? []).filter(
    (batch) => !["MERGED", "CANCELLED", "SUPERSEDED"].includes(batch?.state),
  );
  checks.push(
    result(
      "INV-003",
      "one authoritative integration train",
      activeBatches.length <= 1 ? "PASS" : "FAIL",
      activeBatches.length <= 1
        ? "zero or one active integration train"
        : "multiple active integration trains",
    ),
  );

  const candidate = releaseState?.candidateSha;
  const activeCandidate = SHA.test(candidate ?? "");
  checks.push(
    result(
      "INV-004",
      "one release candidate",
      candidate == null || activeCandidate ? "PASS" : "FAIL",
      candidate == null
        ? "no active release candidate"
        : activeCandidate
          ? "single candidate identity is well formed"
          : "candidate identity is malformed",
    ),
  );

  const trustedValidatorEvidenceMatches = evidenceBoundToSha(
    releaseState,
    "trustedValidatorIndependenceState",
    "trustedValidatorIndependenceEvidenceSha",
    "trustedValidatorIndependenceRunId",
    candidate,
  );
  checks.push(
    result(
      "INV-005",
      "candidate cannot self-validate trusted gates",
      !activeCandidate
        ? "NOT_APPLICABLE"
        : trustedValidatorEvidenceMatches
          ? "PASS"
          : "FAIL",
      !activeCandidate
        ? "no active release candidate"
        : trustedValidatorEvidenceMatches
          ? "trusted-validator independence evidence is bound to the active candidate and trusted run"
          : "active candidate lacks candidate-bound trusted-validator independence evidence",
    ),
  );

  const certifiedArtifact = releaseState?.artifactDigest;
  const stagingArtifact = releaseState?.stagingArtifactDigest ?? null;
  checks.push(
    result(
      "INV-006",
      "staging artifact equals certified artifact",
      certifiedArtifact == null && stagingArtifact == null
        ? "NOT_APPLICABLE"
        : certifiedArtifact != null && certifiedArtifact === stagingArtifact
          ? "PASS"
          : "FAIL",
      certifiedArtifact == null && stagingArtifact == null
        ? "no active certified artifact in the versioned release projection"
        : "staging and certificate artifact identities must match",
    ),
  );

  const productionArtifact = releaseState?.productionArtifactDigest ?? null;
  checks.push(
    result(
      "INV-007",
      "production artifact equals certified artifact",
      certifiedArtifact == null && productionArtifact == null
        ? "NOT_APPLICABLE"
        : certifiedArtifact != null && certifiedArtifact === productionArtifact
          ? "PASS"
          : "FAIL",
      certifiedArtifact == null && productionArtifact == null
        ? "no active certified artifact in the versioned release projection"
        : "production and certificate artifact identities must match",
    ),
  );

  const productionVerified = releaseState?.productionState === "VERIFIED";
  const stagingVerified = releaseState?.stagingState === "VERIFIED";
  checks.push(
    result(
      "INV-008",
      "no production release without staging proof",
      productionVerified && !stagingVerified ? "FAIL" : "PASS",
      productionVerified && !stagingVerified
        ? "production is verified while staging is not"
        : "no staging-before-production violation observed",
    ),
  );

  const financialOwners = (ownership?.domains ?? []).filter((domain) =>
    (domain.pathPrefixes ?? []).some(
      (path) =>
        path === "packages/financial/" || path === "services/financial/",
    ),
  );
  checks.push(
    result(
      "INV-009",
      "financial authority has one owner",
      financialOwners.length === 1 ? "PASS" : "FAIL",
      financialOwners.length === 1
        ? "financial authority owner=" + financialOwners[0].id
        : "financial authority ownership is ambiguous",
    ),
  );

  const healthyRuntimeEntries = Object.entries(
    observed?.runtimeHealth ?? {},
  ).filter(([, runtime]) => runtime?.state === "HEALTHY");
  const acceptanceInScope =
    activeCandidate ||
    stagingVerified ||
    productionVerified ||
    healthyRuntimeEntries.length > 0;
  const expectedCertifiedReleaseSha = releaseState?.expectedCertifiedReleaseSha;
  const acceptanceSubjectSha = activeCandidate
    ? candidate
    : SHA.test(expectedCertifiedReleaseSha ?? "")
      ? expectedCertifiedReleaseSha
      : null;
  const tenantEvidenceMatches = evidenceBoundToSha(
    releaseState,
    "tenantIsolationState",
    "tenantIsolationEvidenceSha",
    "tenantIsolationRunId",
    acceptanceSubjectSha,
  );
  const destinationEvidenceMatches = evidenceBoundToSha(
    releaseState,
    "destinationIsolationState",
    "destinationIsolationEvidenceSha",
    "destinationIsolationRunId",
    acceptanceSubjectSha,
  );

  checks.push(
    result(
      "INV-010",
      "no cross-tenant authority leak",
      !acceptanceInScope
        ? "NOT_APPLICABLE"
        : tenantEvidenceMatches
          ? "PASS"
          : "FAIL",
      !acceptanceInScope
        ? "no candidate or accepted runtime requires tenant-isolation proof"
        : tenantEvidenceMatches
          ? "tenant isolation evidence is bound to the accepted subject and proof run"
          : "candidate/runtime acceptance lacks subject-bound tenant-isolation evidence",
    ),
  );
  checks.push(
    result(
      "INV-011",
      "no cross-destination authority leak",
      !acceptanceInScope
        ? "NOT_APPLICABLE"
        : destinationEvidenceMatches
          ? "PASS"
          : "FAIL",
      !acceptanceInScope
        ? "no candidate or accepted runtime requires destination-isolation proof"
        : destinationEvidenceMatches
          ? "destination isolation evidence is bound to the accepted subject and proof run"
          : "candidate/runtime acceptance lacks subject-bound destination-isolation evidence",
    ),
  );

  const runtimeEntries = Object.entries(observed?.runtimeHealth ?? {});
  const degraded200 = runtimeEntries.filter(
    ([, runtime]) =>
      runtime?.healthHttpStatus === 200 &&
      runtime?.readinessHttpStatus === 200 &&
      runtime?.status === "degraded",
  );
  checks.push(
    result(
      "INV-012",
      "no HTTP-200-but-degraded acceptance",
      degraded200.length
        ? "FAIL"
        : runtimeEntries.length
          ? "PASS"
          : "NOT_APPLICABLE",
      degraded200.length
        ? "HTTP 200 degraded environments: " +
            degraded200.map(([name]) => name).join(",")
        : "no HTTP-200 degraded acceptance observed",
    ),
  );

  const expectedReleaseValid = SHA.test(expectedCertifiedReleaseSha ?? "");
  const identityDrift = healthyRuntimeEntries.filter(
    ([, runtime]) =>
      expectedReleaseValid &&
      runtime?.releaseSha !== expectedCertifiedReleaseSha,
  );
  checks.push(
    result(
      "INV-013",
      "healthy runtime matches expected certified release",
      healthyRuntimeEntries.length === 0
        ? "NOT_APPLICABLE"
        : !expectedReleaseValid
          ? "FAIL"
          : identityDrift.length
            ? "FAIL"
            : "PASS",
      healthyRuntimeEntries.length === 0
        ? "no healthy runtime identity is in acceptance scope"
        : !expectedReleaseValid
          ? "expected certified release identity is missing or malformed"
          : identityDrift.length
            ? "runtime certified-release drift: " +
              identityDrift.map(([name]) => name).join(",")
            : "all healthy runtimes match the expected certified release",
    ),
  );

  return {
    schemaVersion: 1,
    checks,
    pass: checks.filter((check) => check.status === "PASS").length,
    fail: checks.filter((check) => check.status === "FAIL").length,
    notApplicable: checks.filter((check) => check.status === "NOT_APPLICABLE")
      .length,
    criticalFailures: checks.filter(
      (check) => check.critical && check.status === "FAIL",
    ),
  };
}

export function renderInvariantReport(report) {
  const lines = report.checks.map(
    (check) => `${check.id} ${check.status} — ${check.title}: ${check.reason}`,
  );
  lines.push(
    `${report.pass}/${report.checks.length} PASS; ${report.fail} FAIL; ${report.notApplicable} NOT_APPLICABLE`,
  );
  return lines.join("\n");
}
