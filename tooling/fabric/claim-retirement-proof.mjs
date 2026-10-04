import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathOwned } from "./claim-guard.mjs";
import { validateChangeSetV2 } from "../mdctl/changeset-v2.mjs";
import { parseAuthorityLedger } from "../mdctl/event-ledger.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const CLAIM_ID = /^MD-[A-Z0-9-]+$/u;
const RETIREMENT_REASONS = new Set(["MERGED_PR", "EXPIRED", "ORPHANED"]);

function assertRegistry(registry, code) {
  assert.equal(registry?.registryAuthority, "ORCHESTRATOR", code);
  assert.ok(
    registry.claims &&
      typeof registry.claims === "object" &&
      !Array.isArray(registry.claims),
    code,
  );
}

export function removedClaimIds(baseRegistry, candidateRegistry) {
  assertRegistry(baseRegistry, "BASE_REGISTRY_INVALID");
  assertRegistry(candidateRegistry, "CANDIDATE_REGISTRY_INVALID");
  return Object.keys(baseRegistry.claims)
    .filter((id) => !(id in candidateRegistry.claims))
    .sort();
}

export function addedClaimIds(baseRegistry, candidateRegistry) {
  assertRegistry(baseRegistry, "BASE_REGISTRY_INVALID");
  assertRegistry(candidateRegistry, "CANDIDATE_REGISTRY_INVALID");
  return Object.keys(candidateRegistry.claims)
    .filter((id) => !(id in baseRegistry.claims))
    .sort();
}

export function assertCanonicalRetirementTransition(
  baseRegistry,
  candidateRegistry,
) {
  const removed = removedClaimIds(baseRegistry, candidateRegistry);
  const added = addedClaimIds(baseRegistry, candidateRegistry);
  assert.equal(
    removed.length,
    1,
    "CLAIM_RETIREMENT_EXACTLY_ONE_REMOVAL_REQUIRED",
  );
  assert.equal(added.length, 0, "CLAIM_ADDITION_FORBIDDEN_DURING_RETIREMENT");
  return { removed, added };
}

export function validateCandidateRetirementManifest(
  manifest,
  { claimId, expectedBaseSha, canonicalManifest, evidence },
) {
  assert.ok(
    manifest && typeof manifest === "object" && !Array.isArray(manifest),
    "CLAIM_RETIREMENT_MANIFEST_INVALID",
  );
  assert.equal(manifest.id, claimId, "CLAIM_RETIREMENT_MANIFEST_ID_MISMATCH");
  assert.equal(
    canonicalManifest?.id,
    claimId,
    "CLAIM_RETIREMENT_CANONICAL_MANIFEST_INVALID",
  );
  assert.ok(
    RETIREMENT_REASONS.has(evidence?.reason),
    "CLAIM_RETIREMENT_REASON_INVALID",
  );
  assert.equal(
    manifest.state,
    evidence.reason === "MERGED_PR" ? "MERGED" : canonicalManifest.state,
    "CLAIM_RETIREMENT_IMPLEMENTATION_STATE_INVALID",
  );
  const envelope = ({ baseSha, branch, state, ...authority }) => authority;
  assert.deepEqual(
    envelope(manifest),
    envelope(canonicalManifest),
    "CLAIM_RETIREMENT_AUTHORITY_DIVERGED",
  );
  assert.equal(
    manifest.baseSha,
    expectedBaseSha,
    "CLAIM_RETIREMENT_MANIFEST_BASE_MISMATCH",
  );
  return manifest;
}

export function validateClaimRetirements({
  baseRegistry,
  candidateRegistry,
  evidenceById = {},
  now = Date.now(),
}) {
  assertRegistry(baseRegistry, "BASE_REGISTRY_INVALID");
  assertRegistry(candidateRegistry, "CANDIDATE_REGISTRY_INVALID");
  assert.ok(Number.isFinite(now), "CLAIM_RETIREMENT_NOW_INVALID");

  const { removed } = assertCanonicalRetirementTransition(
    baseRegistry,
    candidateRegistry,
  );

  for (const id of Object.keys(baseRegistry.claims)) {
    if (removed.includes(id)) continue;
    if (!(id in candidateRegistry.claims)) continue;
    assert.deepEqual(
      candidateRegistry.claims[id],
      baseRegistry.claims[id],
      "SURVIVING_CLAIM_MUTATION_FORBIDDEN_DURING_RETIREMENT",
    );
  }

  const retirements = removed.map((id) => {
    assert.match(id, CLAIM_ID, "CLAIM_RETIREMENT_ID_INVALID");
    const claim = baseRegistry.claims[id];
    const evidence = evidenceById[id];
    assert.ok(evidence, "CLAIM_RETIREMENT_EVIDENCE_MISSING");
    assert.equal(evidence.id, id, "CLAIM_RETIREMENT_EVIDENCE_ID_MISMATCH");
    assert.equal(
      evidence.branch,
      claim.branch,
      "CLAIM_RETIREMENT_BRANCH_MISMATCH",
    );
    assert.equal(
      evidence.baseSha,
      claim.baseSha,
      "CLAIM_RETIREMENT_BASE_MISMATCH",
    );
    assert.ok(
      RETIREMENT_REASONS.has(evidence.reason),
      "CLAIM_RETIREMENT_REASON_INVALID",
    );

    if (evidence.reason === "EXPIRED") {
      const expiresAt = Date.parse(claim.expiresAt);
      assert.ok(Number.isFinite(expiresAt), "CLAIM_RETIREMENT_EXPIRY_INVALID");
      assert.ok(expiresAt <= now, "CLAIM_RETIREMENT_NOT_EXPIRED");
    } else if (evidence.reason === "MERGED_PR") {
      assert.ok(
        Array.isArray(evidence.materialPaths) &&
          evidence.materialPaths.length > 0 &&
          evidence.materialPaths.every((path) =>
            isMaterialClaimPath(path, claim),
          ),
        "CLAIM_RETIREMENT_MATERIAL_IMPLEMENTATION_MISSING",
      );
      assert.ok(
        Number.isInteger(evidence.prNumber) && evidence.prNumber > 0,
        "CLAIM_RETIREMENT_PR_INVALID",
      );
      assert.match(
        evidence.mergeSha ?? "",
        SHA,
        "CLAIM_RETIREMENT_MERGE_SHA_INVALID",
      );
      assert.equal(
        evidence.mergeShaAncestorOfBase,
        true,
        "CLAIM_RETIREMENT_MERGE_NOT_ANCESTOR",
      );
      assert.equal(
        evidence.claimBaseAncestorOfMerge,
        true,
        "CLAIM_RETIREMENT_CLAIM_BASE_NOT_ANCESTOR",
      );
      assert.equal(
        evidence.historicalManifestMatches,
        true,
        "CLAIM_RETIREMENT_HISTORICAL_MANIFEST_MISMATCH",
      );
    } else {
      assert.equal(
        evidence.branchExists,
        false,
        "CLAIM_RETIREMENT_ORPHAN_BRANCH_EXISTS",
      );
      assert.equal(
        evidence.pullRequestCount,
        0,
        "CLAIM_RETIREMENT_ORPHAN_PR_EXISTS",
      );
    }

    return evidence;
  });

  return {
    removedClaims: removed,
    retirements,
  };
}

export function validateRetirementEvents({
  canonicalText,
  candidateText,
  claimId,
  expectedBaseSha,
  evidence,
}) {
  assert.ok(
    RETIREMENT_REASONS.has(evidence?.reason),
    "CLAIM_RETIREMENT_REASON_INVALID",
  );
  assert.ok(
    candidateText.startsWith(canonicalText),
    "CLAIM_RETIREMENT_LEDGER_HISTORY_MUTATED",
  );
  const canonical = parseAuthorityLedger(canonicalText);
  const candidate = parseAuthorityLedger(candidateText);
  assert.deepEqual(
    candidate.slice(0, canonical.length),
    canonical,
    "CLAIM_RETIREMENT_LEDGER_HISTORY_MUTATED",
  );
  const appended = candidate.slice(canonical.length);
  const material = evidence.reason === "MERGED_PR";
  assert.deepEqual(
    appended.map((event) => event.eventType),
    material ? ["MERGED", "CLAIM_RELEASED"] : ["CLAIM_RELEASED"],
    "CLAIM_RETIREMENT_EVENT_TYPES_INVALID",
  );
  for (const event of appended) {
    assert.equal(
      event.entity,
      claimId,
      "CLAIM_RETIREMENT_EVENT_ENTITY_INVALID",
    );
    assert.equal(
      event.actor,
      "ORCHESTRATOR",
      "CLAIM_RETIREMENT_EVENT_ACTOR_INVALID",
    );
    assert.equal(
      event.sourceSha,
      material ? evidence.mergeSha : expectedBaseSha,
      "CLAIM_RETIREMENT_EVENT_SOURCE_INVALID",
    );
    if (material) {
      assert.equal(
        event.payload.pullRequest,
        evidence.prNumber,
        "CLAIM_RETIREMENT_EVENT_PR_INVALID",
      );
      assert.equal(
        event.payload.mergeSha,
        evidence.mergeSha,
        "CLAIM_RETIREMENT_EVENT_MERGE_INVALID",
      );
    } else {
      assert.equal(
        event.payload.reason,
        evidence.reason,
        "CLAIM_RETIREMENT_EVENT_REASON_INVALID",
      );
    }
  }
  return appended;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function isAncestor(root, ancestor, descendant) {
  try {
    execFileSync(
      "git",
      ["-C", root, "merge-base", "--is-ancestor", ancestor, descendant],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

async function githubJson(path, { token, fetchImpl = fetch } = {}) {
  assert.ok(token, "GITHUB_TOKEN_REQUIRED");
  const response = await fetchImpl(`https://api.github.com${path}`, {
    redirect: "error",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.ok, true, "GITHUB_EVIDENCE_REQUEST_FAILED");
  return response.json();
}

async function allPullRequests(repository, branch, options) {
  const [owner] = repository.split("/");
  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const query = new URLSearchParams({
      state: "all",
      head: `${owner}:${branch}`,
      per_page: "100",
      page: String(page),
    });
    const value = await githubJson(
      `/repos/${repository}/pulls?${query.toString()}`,
      options,
    );
    assert.ok(Array.isArray(value), "GITHUB_PULL_RESPONSE_INVALID");
    results.push(...value);
    if (value.length < 100) return results;
  }
  throw new Error("GITHUB_PULL_PAGINATION_LIMIT");
}

function isMaterialClaimPath(path, claim) {
  return (
    typeof path === "string" &&
    ![
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
    ].includes(path) &&
    !path.startsWith(".morro/changesets/") &&
    (claim.paths ?? []).some((pattern) => pathOwned(path, pattern))
  );
}

async function materialPathsForPull(repository, number, claim, options) {
  const paths = [];
  for (let page = 1; page <= 30; page += 1) {
    const files = await githubJson(
      "/repos/" +
        repository +
        "/pulls/" +
        number +
        "/files?per_page=100&page=" +
        page,
      options,
    );
    assert.ok(Array.isArray(files), "GITHUB_PULL_FILES_RESPONSE_INVALID");
    for (const file of files) {
      assert.equal(
        typeof file?.filename,
        "string",
        "GITHUB_PULL_FILE_PATH_INVALID",
      );
      for (const path of [file.filename, file.previous_filename].filter(
        Boolean,
      )) {
        if (isMaterialClaimPath(path, claim)) paths.push(path);
      }
    }
    if (files.length < 100) return [...new Set(paths)].sort();
  }
  throw new Error("GITHUB_PULL_FILES_PAGINATION_LIMIT");
}

async function mergedEvidence(claim, repository, expectedBaseSha, options) {
  const pulls = await allPullRequests(repository, claim.branch, options);
  const merged = pulls
    .filter(
      (pr) =>
        pr?.state === "closed" &&
        pr?.head?.ref === claim.branch &&
        pr?.head?.repo?.full_name === repository &&
        pr?.base?.ref === "main" &&
        pr?.base?.repo?.full_name === repository &&
        Number.isInteger(pr?.number) &&
        Number.isFinite(Date.parse(pr?.merged_at)) &&
        SHA.test(pr?.merge_commit_sha ?? ""),
    )
    .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));

  for (const pr of merged) {
    const materialPaths = await materialPathsForPull(
      repository,
      pr.number,
      claim,
      options,
    );
    if (materialPaths.length === 0) continue;
    const mergeSha = pr.merge_commit_sha;
    let ancestor = mergeSha === expectedBaseSha;
    if (!ancestor) {
      const compare = await githubJson(
        "/repos/" +
          repository +
          "/compare/" +
          mergeSha +
          "..." +
          expectedBaseSha,
        options,
      );
      ancestor =
        ["ahead", "identical"].includes(compare?.status) &&
        compare?.base_commit?.sha === mergeSha &&
        compare?.merge_base_commit?.sha === mergeSha;
    }
    assert.equal(ancestor, true, "CLAIM_RETIREMENT_MERGE_NOT_ANCESTOR");
    return {
      pulls,
      evidence: {
        id: null,
        reason: "MERGED_PR",
        branch: claim.branch,
        baseSha: claim.baseSha,
        prNumber: pr.number,
        mergeSha,
        mergeShaAncestorOfBase: true,
        materialPaths,
      },
    };
  }
  return { pulls, evidence: null };
}

async function orphanEvidence(claim, repository, pulls, options) {
  if (pulls.length !== 0) return null;
  const refs = await githubJson(
    `/repos/${repository}/git/matching-refs/heads/${encodeURIComponent(
      claim.branch,
    )}`,
    options,
  );
  assert.ok(Array.isArray(refs), "GITHUB_REF_RESPONSE_INVALID");
  const exact = refs.filter((ref) => ref?.ref === `refs/heads/${claim.branch}`);
  if (exact.length !== 0) return null;
  return {
    id: null,
    reason: "ORPHANED",
    branch: claim.branch,
    baseSha: claim.baseSha,
    branchExists: false,
    pullRequestCount: 0,
  };
}

export async function collectClaimRetirementEvidence(
  claimId,
  claim,
  { repository, expectedBaseSha, now = Date.now(), token, fetchImpl = fetch },
) {
  assert.match(claimId, CLAIM_ID, "CLAIM_RETIREMENT_ID_INVALID");
  assert.match(expectedBaseSha ?? "", SHA, "EXPECTED_BASE_INVALID");
  assert.match(
    repository ?? "",
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u,
    "GITHUB_REPOSITORY_INVALID",
  );

  const options = { token, fetchImpl };
  const merged = await mergedEvidence(
    claim,
    repository,
    expectedBaseSha,
    options,
  );
  if (merged.evidence) return { ...merged.evidence, id: claimId };

  const expiresAt = Date.parse(claim?.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= now) {
    return {
      id: claimId,
      reason: "EXPIRED",
      branch: claim.branch,
      baseSha: claim.baseSha,
    };
  }

  const orphan = await orphanEvidence(claim, repository, merged.pulls, options);
  if (orphan) return { ...orphan, id: claimId };

  throw new Error("CLAIM_RETIREMENT_NO_CANONICAL_EVIDENCE");
}

export async function buildClaimRetirementProof(
  trustedRoot,
  candidateRoot,
  env = process.env,
  { fetchImpl = fetch, now = Date.now() } = {},
) {
  const baseRoot = realpathSync(resolve(trustedRoot));
  const targetRoot = realpathSync(resolve(candidateRoot));
  const expectedBaseSha = env.EXPECTED_BASE_SHA ?? "";
  const expectedCandidateSha = env.EXPECTED_CANDIDATE_SHA ?? "";
  const repository = env.GITHUB_REPOSITORY ?? "";
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN ?? "";

  assert.match(expectedBaseSha, SHA, "EXPECTED_BASE_INVALID");
  assert.match(expectedCandidateSha, SHA, "EXPECTED_CANDIDATE_INVALID");
  assert.equal(git(baseRoot, ["rev-parse", "HEAD"]), expectedBaseSha);
  assert.equal(git(targetRoot, ["rev-parse", "HEAD"]), expectedCandidateSha);
  assert.ok(
    isAncestor(targetRoot, expectedBaseSha, expectedCandidateSha),
    "CURRENT_BASE_NOT_ANCESTOR",
  );
  assert.equal(
    git(targetRoot, ["status", "--porcelain", "--untracked-files=all"]),
    "",
    "DIRTY_CANDIDATE_WORKTREE",
  );

  const registryPath = ".github/morro-control/claims.json";
  const baseRegistry = JSON.parse(
    readFileSync(resolve(baseRoot, registryPath), "utf8"),
  );
  const candidateRegistry = JSON.parse(
    readFileSync(resolve(targetRoot, registryPath), "utf8"),
  );
  const { removed } = assertCanonicalRetirementTransition(
    baseRegistry,
    candidateRegistry,
  );
  const evidenceById = {};

  for (const id of removed) {
    const claim = baseRegistry.claims[id];
    const candidateManifest = JSON.parse(
      readFileSync(
        resolve(targetRoot, ".morro", "changesets", id + ".json"),
        "utf8",
      ),
    );
    const canonicalManifest = JSON.parse(
      readFileSync(
        resolve(baseRoot, ".morro", "changesets", id + ".json"),
        "utf8",
      ),
    );
    validateChangeSetV2(candidateManifest);
    validateChangeSetV2(canonicalManifest);
    const evidence = await collectClaimRetirementEvidence(id, claim, {
      repository,
      expectedBaseSha,
      now,
      token,
      fetchImpl,
    });

    if (evidence.reason === "MERGED_PR") {
      assert.equal(
        isAncestor(targetRoot, claim.baseSha, evidence.mergeSha),
        true,
        "CLAIM_RETIREMENT_CLAIM_BASE_NOT_ANCESTOR",
      );
      const historical = JSON.parse(
        git(targetRoot, [
          "show",
          `${evidence.mergeSha}:.morro/changesets/${id}.json`,
        ]),
      );
      assert.equal(
        historical?.id,
        id,
        "CLAIM_RETIREMENT_HISTORICAL_MANIFEST_MISMATCH",
      );
      assert.equal(
        historical?.branch,
        claim.branch,
        "CLAIM_RETIREMENT_HISTORICAL_MANIFEST_MISMATCH",
      );
      assert.equal(
        historical?.baseSha,
        claim.baseSha,
        "CLAIM_RETIREMENT_HISTORICAL_MANIFEST_MISMATCH",
      );
      evidence.claimBaseAncestorOfMerge = true;
      evidence.historicalManifestMatches = true;
    }

    validateCandidateRetirementManifest(candidateManifest, {
      claimId: id,
      expectedBaseSha,
      canonicalManifest,
      evidence,
    });
    validateRetirementEvents({
      canonicalText: readFileSync(
        resolve(baseRoot, ".github/morro-control/events.ndjson"),
        "utf8",
      ),
      candidateText: readFileSync(
        resolve(targetRoot, ".github/morro-control/events.ndjson"),
        "utf8",
      ),
      claimId: id,
      expectedBaseSha,
      evidence,
    });
    evidenceById[id] = evidence;
  }

  const result = validateClaimRetirements({
    baseRegistry,
    candidateRegistry,
    evidenceById,
    now,
  });

  return {
    contract: "MORRO-CLAIM-RETIREMENT-PROOF",
    status: "pass",
    failClosed: true,
    exactHead: expectedCandidateSha,
    currentBaseSha: expectedBaseSha,
    ...result,
  };
}

function diagnosticCode(cause) {
  const message =
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
      ? cause.message
      : "";
  return (
    message.match(/[A-Z][A-Z0-9_:.-]{2,160}/u)?.[0] ??
    "UNEXPECTED_CLAIM_RETIREMENT_ERROR"
  );
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const [trustedRoot = "trusted", candidateRoot = "candidate"] =
      process.argv.slice(2);
    console.log(
      JSON.stringify(
        await buildClaimRetirementProof(trustedRoot, candidateRoot),
      ),
    );
  } catch (cause) {
    console.error(`MORRO_CLAIM_RETIREMENT_FAILED:${diagnosticCode(cause)}`);
    process.exitCode = 1;
  }
}
