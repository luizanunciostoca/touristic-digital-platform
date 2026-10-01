import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { githubApi } from "../control-state/status.mjs";

const SHA = /^[0-9a-f]{40}$/u;
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
      (issue) =>
        !issue.pull_request && issue.title === "[TERMUX-AGENT] status",
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

export async function loadInvariantContext(root = process.cwd()) {
  const [integrationQueue, releaseState, ownership] = await Promise.all([
    readJson(root, ".morro/integration-queue.json"),
    readJson(root, ".github/morro-control/release-state.json"),
    readJson(root, ".morro/ownership.json"),
  ]);
  return { integrationQueue, releaseState, ownership };
}

export function evaluateInvariants({
  observed,
  termux,
  integrationQueue,
  releaseState,
  ownership,
}) {
  const checks = [];

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
      Date.parse(claim.expiresAt) <= observedAt &&
      claim.observedState !== "MERGED",
  );
  checks.push(
    result(
      "INV-002",
      "zero active expired claims",
      expiredActive.length === 0 ? "PASS" : "FAIL",
      expiredActive.length === 0
        ? "no expired unmerged authority remains"
        : "expired authority: " +
            expiredActive.map((claim) => claim.id).join(","),
    ),
  );

  const activeBatches = (integrationQueue?.batches ?? []).filter(
    (batch) =>
      !["MERGED", "CANCELLED", "SUPERSEDED"].includes(batch?.state),
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
  checks.push(
    result(
      "INV-004",
      "one release candidate",
      candidate == null || SHA.test(candidate) ? "PASS" : "FAIL",
      candidate == null
        ? "no active release candidate"
        : "single candidate identity is well formed",
    ),
  );

  checks.push(
    result(
      "INV-005",
      "candidate cannot self-validate trusted gates",
      "NOT_APPLICABLE",
      "no candidate validator-diff evidence supplied to this snapshot",
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
        : certifiedArtifact != null &&
            certifiedArtifact === productionArtifact
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
        path === "packages/financial/" ||
        path === "services/financial/",
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

  checks.push(
    result(
      "INV-010",
      "no cross-tenant authority leak",
      "NOT_APPLICABLE",
      "requires candidate/runtime tenant-isolation evidence",
    ),
  );
  checks.push(
    result(
      "INV-011",
      "no cross-destination authority leak",
      "NOT_APPLICABLE",
      "requires candidate/runtime destination-isolation evidence",
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

  const identityDrift = runtimeEntries.filter(
    ([, runtime]) =>
      runtime?.state === "HEALTHY" &&
      runtime?.releaseSha &&
      observed?.mainSha &&
      runtime.releaseSha !== observed.mainSha,
  );
  checks.push(
    result(
      "INV-013",
      "no runtime release identity mismatch",
      identityDrift.length
        ? "FAIL"
        : runtimeEntries.length
          ? "PASS"
          : "NOT_APPLICABLE",
      identityDrift.length
        ? "runtime identity drift: " +
            identityDrift.map(([name]) => name).join(",")
        : "no healthy runtime identity mismatch observed",
    ),
  );

  return {
    schemaVersion: 1,
    checks,
    pass: checks.filter((check) => check.status === "PASS").length,
    fail: checks.filter((check) => check.status === "FAIL").length,
    notApplicable: checks.filter(
      (check) => check.status === "NOT_APPLICABLE",
    ).length,
    criticalFailures: checks.filter(
      (check) => check.critical && check.status === "FAIL",
    ),
  };
}

export function renderInvariantReport(report) {
  const lines = report.checks.map(
    (check) =>
      `${check.id} ${check.status} — ${check.title}: ${check.reason}`,
  );
  lines.push(
    `${report.pass}/${report.checks.length} PASS; ${report.fail} FAIL; ${report.notApplicable} NOT_APPLICABLE`,
  );
  return lines.join("\n");
}
