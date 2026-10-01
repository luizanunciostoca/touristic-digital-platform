import assert from "node:assert/strict";
import { githubApi } from "../control-state/status.mjs";
import { pathOwned } from "../fabric/claim-guard.mjs";
import { canonicalJson, validateChangeSetV2 } from "./changeset-v2.mjs";
import { DEFAULT_SCHEDULER_POLICY } from "./scheduler.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const ACTIVE_CLAIM_STATUSES = new Set([
  "CLAIMED",
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "PROOF_ACCEPTED",
  "INTEGRATION_READY",
]);
const TRUST_WORKFLOW =
  ".github/workflows/morro-claim-guard-trust-bootstrap.yml";
const TRUST_WORKFLOW_NAME = "Trusted Claim Guard Bootstrap";
const TRUSTED_FILES = Object.freeze([
  TRUST_WORKFLOW,
  ".github/workflows/morro-claim-guard-trusted.yml",
  "tooling/fabric/claim-guard.mjs",
]);
const TRUSTED_JOBS = Object.freeze([
  "trusted-claim-guard-bootstrap",
  "base-controlled-orchestrator-registry-proof",
  "base-controlled-independent-proof / trusted-agent-profile-contract",
]);
const GITHUB_ACTIONS_APP_ID = 15368;

function decodeJsonContent(value) {
  assert.equal(
    value?.encoding,
    "base64",
    "SCHEDULER_LIVE_CONTENT_ENCODING_INVALID",
  );
  assert.equal(
    typeof value?.content,
    "string",
    "SCHEDULER_LIVE_CONTENT_INVALID",
  );
  return JSON.parse(Buffer.from(value.content, "base64").toString("utf8"));
}

function contentSha(value, code) {
  assert.match(value?.sha ?? "", SHA, code);
  return value.sha;
}

async function list(api, endpoint, key = null) {
  const pages = await api(endpoint, { paginate: true });
  assert.ok(Array.isArray(pages), "SCHEDULER_LIVE_PAGES_INVALID");
  const flattened = pages.flatMap((page) => {
    const value = key ? page?.[key] : page;
    return Array.isArray(value) ? value : [];
  });
  return flattened;
}

function sorted(values = []) {
  assert.ok(Array.isArray(values), "SCHEDULER_LIVE_ARRAY_INVALID");
  return [...values].sort();
}

function claimAuthorityEnvelope(claim) {
  assert.ok(
    claim && typeof claim === "object" && !Array.isArray(claim),
    "SCHEDULER_CANONICAL_CLAIM_INVALID",
  );
  return {
    owner: claim.owner ?? null,
    reviewer: claim.reviewer ?? null,
    paths: sorted(claim.paths),
    domains: sorted(claim.domains),
    risk: claim.risk ?? null,
  };
}

export function changeSetAuthorityEnvelope(changeSet) {
  validateChangeSetV2(changeSet);
  return {
    id: changeSet.id,
    objective: changeSet.objective ?? null,
    risk: changeSet.risk,
    scope: changeSet.scope,
    owns: {
      paths: sorted(changeSet.owns.paths),
      contracts: sorted(changeSet.owns.contracts),
    },
    reads: {
      contracts: sorted(changeSet.reads.contracts),
    },
    produces: {
      events: sorted(changeSet.produces.events),
      routes: sorted(changeSet.produces.routes),
    },
    database: {
      tables: sorted(changeSet.database.tables),
    },
    auth: {
      capabilities: sorted(changeSet.auth.capabilities),
    },
    dependencies: sorted(changeSet.dependencies),
    requiredEvidence: sorted(changeSet.requiredEvidence),
    requiredCapabilities: sorted(changeSet.requiredCapabilities),
    contextPack: {
      maxBytes: changeSet.contextPack.maxBytes,
      include: sorted(changeSet.contextPack.include),
    },
    proof: {
      budget: {
        maxCommands: changeSet.proof.budget.maxCommands,
        maxSeconds: changeSet.proof.budget.maxSeconds,
      },
      commands: changeSet.proof.commands.map((command) => ({
        id: command.id,
        argv: [...command.argv],
        timeoutSeconds: command.timeoutSeconds,
      })),
      requiredRemoteEvidence: sorted(changeSet.proof.requiredRemoteEvidence),
    },
    stopAt: changeSet.stopAt,
  };
}

export function authorityDivergence({
  canonicalClaim,
  candidateClaim,
  canonicalChangeSet,
  candidateChangeSet,
}) {
  try {
    const canonicalExpiry = Date.parse(canonicalClaim?.expiresAt ?? "");
    const candidateExpiry = Date.parse(candidateClaim?.expiresAt ?? "");
    assert.ok(
      Number.isFinite(canonicalExpiry),
      "CANONICAL_CLAIM_EXPIRY_INVALID",
    );
    assert.ok(Number.isFinite(candidateExpiry), "CLAIM_EXPIRY_INVALID");
    assert.ok(
      candidateExpiry <= canonicalExpiry,
      "CLAIM_EXPIRY_EXCEEDS_CANONICAL_AUTHORITY",
    );
    assert.equal(
      canonicalJson(claimAuthorityEnvelope(candidateClaim)),
      canonicalJson(claimAuthorityEnvelope(canonicalClaim)),
      "CLAIM_AUTHORITY_DIVERGED_FROM_MAIN",
    );
    assert.equal(
      canonicalJson(changeSetAuthorityEnvelope(candidateChangeSet)),
      canonicalJson(changeSetAuthorityEnvelope(canonicalChangeSet)),
      "CHANGESET_AUTHORITY_DIVERGED_FROM_MAIN",
    );
    return null;
  } catch (error) {
    return String(error?.message ?? error).split("\n")[0];
  }
}

export function schedulerClaimBindingError(
  claim,
  changeSet,
  branch,
  now = Date.now(),
) {
  if (!claim || typeof claim !== "object") return "CLAIM_MISSING";
  if (!changeSet || typeof changeSet !== "object") return "CHANGESET_MISSING";
  if (!ACTIVE_CLAIM_STATUSES.has(claim.status)) return "CLAIM_STATUS_INACTIVE";
  if (claim.reviewer !== "AUTOMATED-INDEPENDENT-PROOF")
    return "CLAIM_REVIEW_AUTHORITY_INVALID";
  if (claim.branch !== branch || changeSet.branch !== branch)
    return "CLAIM_CHANGESET_BRANCH_MISMATCH";
  if (claim.baseSha !== changeSet.baseSha)
    return "CLAIM_CHANGESET_BASE_MISMATCH";
  if (
    canonicalJson(sorted(claim.paths)) !==
    canonicalJson(sorted(changeSet.owns.paths))
  ) {
    return "CLAIM_CHANGESET_PATHS_MISMATCH";
  }
  const expiresAt = Date.parse(claim.expiresAt ?? "");
  if (!Number.isFinite(expiresAt)) return "CLAIM_EXPIRY_INVALID";
  if (expiresAt <= now) return "CLAIM_EXPIRED";
  return null;
}

async function jsonAtRef({ api, root, path, ref }) {
  return api(root + "/contents/" + path + "?ref=" + encodeURIComponent(ref));
}

async function loadManifestAtRef({ api, root, id, ref }) {
  const response = await jsonAtRef({
    api,
    root,
    path: ".morro/changesets/" + encodeURIComponent(id) + ".json",
    ref,
  });
  const value = decodeJsonContent(response);
  validateChangeSetV2(value);
  assert.equal(value.id, id, "SCHEDULER_CHANGESET_ID_MISMATCH");
  return { response, value };
}

async function loadRegistryAtRef({ api, root, ref }) {
  const response = await jsonAtRef({
    api,
    root,
    path: ".github/morro-control/claims.json",
    ref,
  });
  const value = decodeJsonContent(response);
  assert.equal(
    value?.registryAuthority,
    "ORCHESTRATOR",
    "SCHEDULER_REGISTRY_AUTHORITY_INVALID",
  );
  assert.ok(
    value.claims && typeof value.claims === "object",
    "SCHEDULER_REGISTRY_INVALID",
  );
  return { response, value };
}

export function resolveCanonicalClaimTransition({
  canonicalRegistry,
  candidateRegistry,
  branch,
}) {
  assert.ok(
    canonicalRegistry?.claims && typeof canonicalRegistry.claims === "object",
    "CANONICAL_CLAIMS_INVALID",
  );
  assert.ok(
    candidateRegistry?.claims && typeof candidateRegistry.claims === "object",
    "CANDIDATE_CLAIMS_INVALID",
  );
  const canonicalIds = Object.keys(canonicalRegistry.claims).sort();
  const candidateIds = Object.keys(candidateRegistry.claims).sort();
  assert.deepEqual(candidateIds, canonicalIds, "CLAIM_REGISTRY_KEYSET_CHANGED");

  const matching = Object.entries(candidateRegistry.claims).filter(
    ([, claim]) => claim?.branch === branch,
  );
  assert.equal(
    matching.length,
    1,
    matching.length ? "CLAIM_AMBIGUOUS" : "CLAIM_MISSING",
  );
  const [id, candidateClaim] = matching[0];
  const canonicalClaim = canonicalRegistry.claims[id];
  assert.ok(canonicalClaim, "CANONICAL_CLAIM_MISSING");

  const changedIds = candidateIds.filter(
    (claimId) =>
      canonicalJson(candidateRegistry.claims[claimId]) !==
      canonicalJson(canonicalRegistry.claims[claimId]),
  );
  assert.ok(
    changedIds.length <= 1 && (changedIds.length === 0 || changedIds[0] === id),
    "CLAIM_REGISTRY_MULTIPLE_MUTATIONS",
  );
  assert.equal(
    canonicalJson(claimAuthorityEnvelope(candidateClaim)),
    canonicalJson(claimAuthorityEnvelope(canonicalClaim)),
    "CLAIM_AUTHORITY_DIVERGED_FROM_MAIN",
  );

  return {
    id,
    canonicalClaim,
    candidateClaim,
    registryChanged: changedIds.length === 1,
  };
}

async function pullFiles({ api, root, prNumber }) {
  const files = await list(
    api,
    root + "/pulls/" + prNumber + "/files?per_page=100",
  );
  const seen = new Set();
  const normalized = [];
  for (const file of files) {
    assert.ok(
      typeof file?.filename === "string" && file.filename.length > 0,
      "PR_FILE_NAME_INVALID",
    );
    assert.equal(seen.has(file.filename), false, "PR_FILE_DUPLICATE");
    seen.add(file.filename);
    normalized.push({
      filename: file.filename,
      additions: Number.isInteger(file.additions) ? file.additions : null,
      deletions: Number.isInteger(file.deletions) ? file.deletions : null,
    });
  }
  return normalized;
}

function changedFileCoverageError(files, claim, changeSet) {
  for (const file of files) {
    if (!claim.paths.some((pattern) => pathOwned(file.filename, pattern))) {
      return "CANONICAL_CLAIM_PATH_VIOLATION:" + file.filename;
    }
    if (
      !changeSet.owns.paths.some((pattern) => pathOwned(file.filename, pattern))
    ) {
      return "CHANGESET_OWNERSHIP_VIOLATION:" + file.filename;
    }
  }
  return null;
}

function stablePullIdentity(pulls) {
  return pulls
    .map((pr) => ({
      number: pr?.number,
      headSha: pr?.head?.sha,
      branch: pr?.head?.ref,
      base: pr?.base?.ref,
    }))
    .sort((left, right) => Number(left.number) - Number(right.number));
}

async function trustedFileBlobsEqual({ repository, mainSha, headSha, api }) {
  const root = "repos/" + repository;
  for (const path of TRUSTED_FILES) {
    const [mainFile, headFile] = await Promise.all([
      jsonAtRef({ api, root, path, ref: mainSha }),
      jsonAtRef({ api, root, path, ref: headSha }),
    ]);
    const mainBlob = contentSha(mainFile, "TRUST_MAIN_BLOB_INVALID");
    const headBlob = contentSha(headFile, "TRUST_HEAD_BLOB_INVALID");
    if (mainBlob !== headBlob) {
      return {
        trusted: false,
        reason: "TRUSTED_CONTROL_FILE_DIVERGED:" + path,
      };
    }
  }
  return { trusted: true };
}

export async function verifyTrustedClaimEvidence({
  repository = "luizanunciostoca/touristic-digital-platform",
  mainSha,
  headSha,
  branch,
  api = githubApi,
}) {
  assert.match(mainSha ?? "", SHA, "TRUST_MAIN_SHA_INVALID");
  assert.match(headSha ?? "", SHA, "TRUST_HEAD_SHA_INVALID");
  assert.ok(
    typeof branch === "string" && branch.length > 0,
    "TRUST_BRANCH_INVALID",
  );
  const root = "repos/" + repository;
  const blobs = await trustedFileBlobsEqual({
    repository,
    mainSha,
    headSha,
    api,
  });
  if (!blobs.trusted) return blobs;

  const runs = await list(
    api,
    root +
      "/actions/runs?head_sha=" +
      encodeURIComponent(headSha) +
      "&event=pull_request&per_page=100",
    "workflow_runs",
  );
  const matchingRuns = runs
    .filter(
      (run) =>
        run?.path === TRUST_WORKFLOW &&
        run?.name === TRUST_WORKFLOW_NAME &&
        run?.event === "pull_request" &&
        run?.head_sha === headSha &&
        run?.head_branch === branch,
    )
    .sort(
      (left, right) =>
        Date.parse(right?.created_at ?? "") -
          Date.parse(left?.created_at ?? "") ||
        Number(right?.id ?? 0) - Number(left?.id ?? 0),
    );
  if (matchingRuns.length === 0) {
    return { trusted: false, reason: "TRUSTED_CLAIM_GUARD_RUN_MISSING" };
  }

  const run = matchingRuns[0];
  if (run?.status !== "completed") {
    return { trusted: false, reason: "TRUSTED_CLAIM_GUARD_RUN_NOT_COMPLETED" };
  }
  if (run?.conclusion !== "success") {
    return { trusted: false, reason: "TRUSTED_CLAIM_GUARD_RUN_NOT_SUCCESS" };
  }
  const jobs = await list(
    api,
    root + "/actions/runs/" + run.id + "/jobs?per_page=100",
    "jobs",
  );
  for (const name of TRUSTED_JOBS) {
    const matching = jobs.filter((job) => job?.name === name);
    if (
      matching.length !== 1 ||
      matching[0]?.status !== "completed" ||
      matching[0]?.conclusion !== "success" ||
      matching[0]?.head_sha !== headSha
    ) {
      return {
        trusted: false,
        reason: "TRUSTED_CLAIM_GUARD_JOB_INVALID:" + name,
      };
    }
  }

  const checks = await list(
    api,
    root + "/commits/" + headSha + "/check-runs?per_page=100",
    "check_runs",
  );
  for (const name of TRUSTED_JOBS) {
    const check = checks.find(
      (entry) =>
        entry?.name === name &&
        entry?.status === "completed" &&
        entry?.conclusion === "success" &&
        entry?.app?.id === GITHUB_ACTIONS_APP_ID &&
        entry?.app?.slug === "github-actions",
    );
    if (!check) {
      return {
        trusted: false,
        reason: "TRUSTED_GITHUB_ACTIONS_CHECK_MISSING:" + name,
      };
    }
  }

  return {
    trusted: true,
    authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
    workflowRunId: run.id,
    workflowPath: run.path,
    headSha,
  };
}

function validateDependencyManifest(value, expectedId) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    "SCHEDULER_DEPENDENCY_MANIFEST_INVALID",
  );
  assert.equal(value.id, expectedId, "SCHEDULER_DEPENDENCY_ID_MISMATCH");
  if (value.schemaVersion === 2) {
    validateChangeSetV2(value);
  } else {
    assert.ok(
      value.schemaVersion == null || value.schemaVersion === 1,
      "SCHEDULER_DEPENDENCY_SCHEMA_UNSUPPORTED",
    );
    assert.match(
      value.baseSha ?? "",
      SHA,
      "SCHEDULER_DEPENDENCY_BASE_SHA_INVALID",
    );
    assert.ok(
      typeof value.branch === "string" && value.branch.length > 0,
      "SCHEDULER_DEPENDENCY_BRANCH_INVALID",
    );
  }
  return value;
}

async function readDependencyAtMain({ id, repository, mainSha, api, cache }) {
  if (cache.has(id)) return cache.get(id);
  const root = "repos/" + repository;
  let value = null;
  try {
    const response = await jsonAtRef({
      api,
      root,
      path: ".morro/changesets/" + encodeURIComponent(id) + ".json",
      ref: mainSha,
    });
    value = decodeJsonContent(response);
    validateDependencyManifest(value, id);
  } catch {
    value = null;
  }
  cache.set(id, value);
  return value;
}

export async function evaluateDependenciesAtMain({
  changeSet,
  repository = "luizanunciostoca/touristic-digital-platform",
  mainSha,
  api = githubApi,
  cache = new Map(),
}) {
  validateChangeSetV2(changeSet);
  assert.match(mainSha ?? "", SHA, "SCHEDULER_MAIN_INVALID");
  const unresolved = [];
  for (const id of changeSet.dependencies) {
    const dependency = await readDependencyAtMain({
      id,
      repository,
      mainSha,
      api,
      cache,
    });
    if (dependency?.state !== "MERGED") unresolved.push(id);
  }
  return { satisfied: unresolved.length === 0, unresolved };
}

async function compareBaseToMain({ api, root, baseSha, mainSha }) {
  try {
    const compare = await api(
      root +
        "/compare/" +
        encodeURIComponent(baseSha) +
        "..." +
        encodeURIComponent(mainSha),
    );
    return {
      behindBy: Number.isInteger(compare?.ahead_by) ? compare.ahead_by : null,
      baseIsAncestorOfMain:
        ["ahead", "identical"].includes(compare?.status) &&
        compare?.merge_base_commit?.sha === baseSha,
    };
  } catch {
    return { behindBy: null, baseIsAncestorOfMain: false };
  }
}

function invalidItem(pr, extra = {}) {
  return {
    prNumber: pr?.number ?? null,
    openPr: true,
    draft: pr?.draft === true,
    headSha: SHA.test(pr?.head?.sha ?? "") ? pr.head.sha : null,
    branch: pr?.head?.ref ?? null,
    writerActive: false,
    ready: false,
    ...extra,
  };
}

export async function collectLivePullWork({
  repository = "luizanunciostoca/touristic-digital-platform",
  api = githubApi,
  policy = DEFAULT_SCHEDULER_POLICY,
  now = Date.now(),
} = {}) {
  const root = "repos/" + repository;
  const main = await api(root + "/commits/main");
  assert.match(main?.sha ?? "", SHA, "SCHEDULER_MAIN_INVALID");
  const mainSha = main.sha;
  const [pulls, canonicalRegistryLoaded] = await Promise.all([
    list(api, root + "/pulls?state=open&base=main&per_page=100"),
    loadRegistryAtRef({ api, root, ref: mainSha }),
  ]);
  const canonicalRegistry = canonicalRegistryLoaded.value;
  const canonicalRegistrySha = contentSha(
    canonicalRegistryLoaded.response,
    "SCHEDULER_CANONICAL_REGISTRY_BLOB_INVALID",
  );
  const items = [];
  const dependencyCache = new Map();

  for (const listed of pulls) {
    const pr = await api(root + "/pulls/" + listed.number);
    if (
      pr?.head?.sha !== listed?.head?.sha ||
      pr?.head?.ref !== listed?.head?.ref
    ) {
      throw new Error("SCHEDULER_PR_MOVED_DURING_CAPTURE");
    }
    const headSha = pr?.head?.sha;
    const branch = pr?.head?.ref;
    if (!SHA.test(headSha ?? "") || !branch) {
      items.push(invalidItem(pr, { invalid: "PR_IDENTITY_INVALID" }));
      continue;
    }

    let candidateRegistryLoaded;
    try {
      candidateRegistryLoaded = await loadRegistryAtRef({
        api,
        root,
        ref: headSha,
      });
    } catch {
      items.push(invalidItem(pr, { invalid: "CLAIM_REGISTRY_UNAVAILABLE" }));
      continue;
    }
    const candidateRegistry = candidateRegistryLoaded.value;
    let claimTransition;
    try {
      claimTransition = resolveCanonicalClaimTransition({
        canonicalRegistry,
        candidateRegistry,
        branch,
      });
    } catch (error) {
      items.push(
        invalidItem(pr, {
          invalid: String(error?.message ?? error).split("\n")[0],
        }),
      );
      continue;
    }

    const {
      id,
      canonicalClaim,
      candidateClaim: claim,
      registryChanged,
    } = claimTransition;
    let candidateManifestLoaded;
    try {
      candidateManifestLoaded = await loadManifestAtRef({
        api,
        root,
        id,
        ref: headSha,
      });
      assert.equal(
        candidateManifestLoaded.value.branch,
        branch,
        "SCHEDULER_CHANGESET_BRANCH_MISMATCH",
      );
    } catch {
      items.push(invalidItem(pr, { invalid: "CHANGESET_INVALID" }));
      continue;
    }
    const changeSet = candidateManifestLoaded.value;

    let canonicalManifestLoaded;
    try {
      canonicalManifestLoaded = await loadManifestAtRef({
        api,
        root,
        id,
        ref: mainSha,
      });
    } catch {
      items.push(
        invalidItem(pr, {
          claim,
          changeSet,
          invalid: "CANONICAL_CHANGESET_INVALID",
        }),
      );
      continue;
    }

    let invalid = schedulerClaimBindingError(claim, changeSet, branch, now);
    if (!invalid) {
      invalid = authorityDivergence({
        canonicalClaim,
        candidateClaim: claim,
        canonicalChangeSet: canonicalManifestLoaded.value,
        candidateChangeSet: changeSet,
      });
    }

    let files = [];
    try {
      files = await pullFiles({ api, root, prNumber: pr.number });
    } catch {
      if (!invalid) invalid = "PR_FILES_UNAVAILABLE";
    }
    if (!invalid) {
      invalid = changedFileCoverageError(files, canonicalClaim, changeSet);
    }

    const candidateRegistrySha = contentSha(
      candidateRegistryLoaded.response,
      "SCHEDULER_CANDIDATE_REGISTRY_BLOB_INVALID",
    );
    const candidateManifestSha = contentSha(
      candidateManifestLoaded.response,
      "SCHEDULER_CANDIDATE_MANIFEST_BLOB_INVALID",
    );
    const canonicalManifestSha = contentSha(
      canonicalManifestLoaded.response,
      "SCHEDULER_CANONICAL_MANIFEST_BLOB_INVALID",
    );
    let trust = {
      trusted: true,
      authority: "GITHUB_EXACT_MAIN",
      headSha,
    };
    if (
      candidateRegistrySha !== canonicalRegistrySha ||
      candidateManifestSha !== canonicalManifestSha
    ) {
      trust = await verifyTrustedClaimEvidence({
        repository,
        mainSha,
        headSha,
        branch,
        api,
      });
      if (!trust.trusted && !invalid) invalid = trust.reason;
    }

    const drift = await compareBaseToMain({
      api,
      root,
      baseSha: changeSet.baseSha,
      mainSha,
    });
    const dependencies = await evaluateDependenciesAtMain({
      changeSet,
      repository,
      mainSha,
      api,
      cache: dependencyCache,
    });
    const prStatsKnown =
      Number.isInteger(pr.changed_files) &&
      Number.isInteger(pr.additions) &&
      Number.isInteger(pr.deletions);
    const fileStatsKnown =
      files.length > 0 &&
      files.every(
        (file) =>
          Number.isInteger(file.additions) && Number.isInteger(file.deletions),
      );
    const fileAdditions = fileStatsKnown
      ? files.reduce((sum, file) => sum + file.additions, 0)
      : null;
    const fileDeletions = fileStatsKnown
      ? files.reduce((sum, file) => sum + file.deletions, 0)
      : null;
    const statsKnown =
      prStatsKnown &&
      fileStatsKnown &&
      files.length === pr.changed_files &&
      fileAdditions === pr.additions &&
      fileDeletions === pr.deletions;
    if (!statsKnown && !invalid) invalid = "PR_STATS_OR_FILES_MISMATCH";

    const trustedForAdmission = trust.trusted === true && !invalid;
    items.push({
      prNumber: pr.number,
      openPr: true,
      draft: pr.draft === true,
      headSha,
      branch,
      claim,
      changeSet,
      trust,
      registryChanged,
      priority: claim?.priority ?? claim?.risk ?? "P2",
      writerActive:
        trustedForAdmission && policy.writerStates.includes(changeSet.state),
      ready: trustedForAdmission && changeSet.state === "MERGE_READY",
      dependenciesSatisfied: dependencies.satisfied,
      unresolvedDependencies: dependencies.unresolved,
      behindBy: drift.behindBy,
      baseIsAncestorOfMain: drift.baseIsAncestorOfMain,
      statsKnown,
      changedFiles: statsKnown ? pr.changed_files : null,
      changedLines: statsKnown ? pr.additions + pr.deletions : null,
      actualFiles: files.map((file) => file.filename),
      createdAt: pr.created_at ?? "",
      invalid,
    });
  }

  const [terminalMain, terminalPulls] = await Promise.all([
    api(root + "/commits/main"),
    list(api, root + "/pulls?state=open&base=main&per_page=100"),
  ]);
  assert.equal(
    terminalMain?.sha,
    mainSha,
    "MAIN_CHANGED_DURING_SCHEDULER_CAPTURE",
  );
  assert.deepEqual(
    stablePullIdentity(terminalPulls),
    stablePullIdentity(pulls),
    "PULL_SET_CHANGED_DURING_SCHEDULER_CAPTURE",
  );

  return {
    mainSha,
    authority: "TRUSTED_PR_EXACT_HEADS",
    items,
  };
}
