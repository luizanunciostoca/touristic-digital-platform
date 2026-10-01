#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { githubApi } from "../control-state/status.mjs";
import { validateClaimContext } from "../fabric/claim-guard.mjs";
import {
  buildClaimRetirementProof,
  removedClaimIds,
} from "../fabric/claim-retirement-proof.mjs";
import { canonicalJson, validateChangeSetV2 } from "./changeset-v2.mjs";
import { parseAuthorityLedger } from "./event-ledger.mjs";
import {
  DEFAULT_SCHEDULER_POLICY,
  findSemanticCollisions,
  loadSchedulerPolicy,
  normalizeObjective,
} from "./scheduler.mjs";
import {
  authorityDivergence,
  changeSetAuthorityEnvelope,
  collectLivePullWork,
  evaluateDependenciesAtMain,
  resolveCanonicalClaimTransition,
  verifyTrustedClaimEvidence,
} from "./scheduler-live.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const POLICY_STATES = new Set([
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "COMPOSITION_PROVEN",
  "POLICY_SATISFIED",
  "MERGE_READY",
]);
const REQUIRED_REMOTE_EVIDENCE = Object.freeze([
  "automated-independent-proof",
  "exact-head-identity",
]);

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

function isAncestor(cwd, ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function readNdjson(root, relativePath) {
  return parseAuthorityLedger(readFileSync(join(root, relativePath), "utf8"));
}

export function addedClaimIds(canonicalRegistry, candidateRegistry) {
  assert.equal(
    canonicalRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "MERGE_GATE_ACQUISITION_CANONICAL_REGISTRY_INVALID",
  );
  assert.equal(
    candidateRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "MERGE_GATE_ACQUISITION_CANDIDATE_REGISTRY_INVALID",
  );
  assert.ok(
    canonicalRegistry.claims &&
      typeof canonicalRegistry.claims === "object" &&
      !Array.isArray(canonicalRegistry.claims),
    "MERGE_GATE_ACQUISITION_CANONICAL_CLAIMS_INVALID",
  );
  assert.ok(
    candidateRegistry.claims &&
      typeof candidateRegistry.claims === "object" &&
      !Array.isArray(candidateRegistry.claims),
    "MERGE_GATE_ACQUISITION_CANDIDATE_CLAIMS_INVALID",
  );
  return Object.keys(candidateRegistry.claims)
    .filter((id) => !(id in canonicalRegistry.claims))
    .sort();
}

export function assertAcquisitionClaimKeyset(
  canonicalRegistry,
  candidateRegistry,
  claimId,
) {
  const canonicalIds = Object.keys(canonicalRegistry?.claims ?? {}).sort();
  const candidateIds = Object.keys(candidateRegistry?.claims ?? {}).sort();
  assert.equal(
    Object.hasOwn(canonicalRegistry?.claims ?? {}, claimId),
    false,
    "MERGE_GATE_ACQUISITION_CLAIM_ALREADY_CANONICAL",
  );
  assert.deepEqual(
    candidateIds,
    [...canonicalIds, claimId].sort(),
    "MERGE_GATE_ACQUISITION_CLAIM_KEYSET_INVALID",
  );
  for (const id of canonicalIds) {
    assert.deepEqual(
      candidateRegistry.claims[id],
      canonicalRegistry.claims[id],
      "MERGE_GATE_ACQUISITION_SURVIVING_CLAIM_MUTATION_FORBIDDEN",
    );
  }
}

export function validateClaimAcquisitionEvents({
  canonicalEvents,
  events,
  claimId,
  claim,
  manifest,
  branch,
  baseSha,
}) {
  assert.ok(
    Array.isArray(canonicalEvents),
    "MERGE_GATE_ACQUISITION_CANONICAL_EVENTS_INVALID",
  );
  assert.ok(Array.isArray(events), "MERGE_GATE_ACQUISITION_EVENTS_INVALID");
  assert.equal(
    events.length,
    canonicalEvents.length + 2,
    "MERGE_GATE_ACQUISITION_EVENT_COUNT_INVALID",
  );
  assert.deepEqual(
    events.slice(0, canonicalEvents.length),
    canonicalEvents,
    "MERGE_GATE_ACQUISITION_LEDGER_HISTORY_MUTATED",
  );

  const [created, acquired] = events.slice(canonicalEvents.length);
  assert.equal(
    created?.eventType,
    "CHANGESET_CREATED",
    "MERGE_GATE_ACQUISITION_CHANGESET_EVENT_INVALID",
  );
  assert.equal(
    acquired?.eventType,
    "CLAIM_ACQUIRED",
    "MERGE_GATE_ACQUISITION_CLAIM_EVENT_INVALID",
  );
  for (const event of [created, acquired]) {
    assert.equal(
      event?.entity,
      claimId,
      "MERGE_GATE_ACQUISITION_EVENT_ENTITY_MISMATCH",
    );
    assert.equal(
      event?.actor,
      "ORCHESTRATOR",
      "MERGE_GATE_ACQUISITION_EVENT_ACTOR_INVALID",
    );
    assert.equal(
      event?.sourceSha,
      baseSha,
      "MERGE_GATE_ACQUISITION_EVENT_BASE_MISMATCH",
    );
    assert.equal(
      event?.payload?.branch,
      branch,
      "MERGE_GATE_ACQUISITION_EVENT_BRANCH_MISMATCH",
    );
  }
  assert.equal(
    acquired?.payload?.expiresAt,
    claim.expiresAt,
    "MERGE_GATE_ACQUISITION_EVENT_EXPIRY_MISMATCH",
  );
  assert.equal(
    acquired?.payload?.risk,
    claim.risk,
    "MERGE_GATE_ACQUISITION_EVENT_RISK_MISMATCH",
  );
  assert.equal(
    created?.payload?.objective,
    manifest.objective,
    "MERGE_GATE_ACQUISITION_EVENT_OBJECTIVE_MISMATCH",
  );
  return { acquired, created };
}

export function diffEvidence({ candidateDir, baseSha, headSha }) {
  assert.match(baseSha ?? "", SHA, "MERGE_GATE_DIFF_BASE_INVALID");
  assert.match(headSha ?? "", SHA, "MERGE_GATE_DIFF_HEAD_INVALID");
  const range = baseSha + "..." + headSha;
  const nameRows = git(candidateDir, "diff", "--name-status", "-M", range)
    .split("\n")
    .filter(Boolean);
  const authorizationPaths = [];
  for (const row of nameRows) {
    const parts = row.split("\t");
    const status = parts[0] ?? "";
    if (status.startsWith("R")) {
      assert.equal(parts.length, 3, "MERGE_GATE_RENAME_ROW_INVALID");
      authorizationPaths.push(parts[1], parts[2]);
    } else {
      assert.ok(parts.length >= 2, "MERGE_GATE_NAME_STATUS_ROW_INVALID");
      authorizationPaths.push(parts[1]);
    }
  }

  let additions = 0;
  let deletions = 0;
  const numRows = git(candidateDir, "diff", "--numstat", "-M", range)
    .split("\n")
    .filter(Boolean);
  for (const row of numRows) {
    const [a, d] = row.split("\t");
    additions += /^\d+$/u.test(a) ? Number(a) : 0;
    deletions += /^\d+$/u.test(d) ? Number(d) : 0;
  }
  return {
    changedFileCount: nameRows.length,
    authorizationPaths: [...new Set(authorizationPaths)],
    additions,
    deletions,
    changedLines: additions + deletions,
  };
}

export function assertRetirementClaimKeyset(
  canonicalRegistry,
  candidateRegistry,
  claimId,
) {
  const canonicalIds = Object.keys(canonicalRegistry?.claims ?? {}).sort();
  const candidateIds = Object.keys(candidateRegistry?.claims ?? {}).sort();
  assert.deepEqual(
    candidateIds,
    canonicalIds.filter((id) => id !== claimId),
    "MERGE_GATE_RETIREMENT_CLAIM_KEYSET_INVALID",
  );
}

export async function buildMergedRetirementProof(
  trustedDir,
  candidateDir,
  env,
  { proofBuilder = buildClaimRetirementProof } = {},
) {
  const proof = await proofBuilder(trustedDir, candidateDir, env, { now: 0 });
  assert.equal(
    proof?.retirements?.length,
    1,
    "MERGE_GATE_RETIREMENT_EVIDENCE_COUNT_INVALID",
  );
  assert.equal(
    proof.retirements[0]?.reason,
    "MERGED_PR",
    "MERGE_GATE_RETIREMENT_MERGED_EVIDENCE_REQUIRED",
  );
  return proof;
}

export function evaluateRetirementMergeGate({
  manifest,
  canonicalManifest,
  claimId,
  branch,
  baseSha,
  headSha,
  authorizationPaths,
  changedFileCount,
  changedLines,
  unresolvedReviewThreads,
  retirementProof,
  policy = DEFAULT_SCHEDULER_POLICY,
}) {
  validateChangeSetV2(manifest);
  validateChangeSetV2(canonicalManifest);
  assert.equal(manifest.id, claimId, "MERGE_GATE_RETIREMENT_ID_MISMATCH");
  assert.equal(
    canonicalManifest.id,
    claimId,
    "MERGE_GATE_RETIREMENT_CANONICAL_ID_MISMATCH",
  );
  assert.equal(manifest.state, "MERGED", "MERGE_GATE_RETIREMENT_STATE_INVALID");
  assert.equal(
    manifest.baseSha,
    baseSha,
    "MERGE_GATE_RETIREMENT_BASE_MISMATCH",
  );
  assert.equal(
    manifest.branch,
    branch,
    "MERGE_GATE_RETIREMENT_BRANCH_MISMATCH",
  );
  assert.match(baseSha ?? "", SHA, "MERGE_GATE_RETIREMENT_BASE_INVALID");
  assert.match(headSha ?? "", SHA, "MERGE_GATE_RETIREMENT_HEAD_INVALID");
  assert.equal(
    canonicalJson(changeSetAuthorityEnvelope(manifest)),
    canonicalJson(changeSetAuthorityEnvelope(canonicalManifest)),
    "MERGE_GATE_RETIREMENT_AUTHORITY_DIVERGED",
  );

  assert.ok(
    Number.isInteger(unresolvedReviewThreads) && unresolvedReviewThreads >= 0,
    "MERGE_GATE_REVIEW_THREAD_COUNT_INVALID",
  );
  assert.equal(
    unresolvedReviewThreads,
    0,
    "MERGE_GATE_UNRESOLVED_REVIEW_THREADS",
  );
  assert.ok(
    changedFileCount <= policy.hardFiles,
    "MERGE_GATE_HARD_FILE_LIMIT_EXCEEDED",
  );
  assert.ok(
    changedLines <= policy.hardLines,
    "MERGE_GATE_HARD_LINE_LIMIT_EXCEEDED",
  );

  const manifestPath = ".morro/changesets/" + claimId + ".json";
  const expectedPaths = [
    ".github/morro-control/claims.json",
    ".github/morro-control/events.ndjson",
    manifestPath,
  ].sort();
  assert.deepEqual(
    [...authorizationPaths].sort(),
    expectedPaths,
    "MERGE_GATE_RETIREMENT_SCOPE_INVALID",
  );
  assert.equal(
    changedFileCount,
    expectedPaths.length,
    "MERGE_GATE_RETIREMENT_FILE_COUNT_INVALID",
  );

  assert.equal(
    retirementProof?.contract,
    "MORRO-CLAIM-RETIREMENT-PROOF",
    "MERGE_GATE_RETIREMENT_PROOF_CONTRACT_INVALID",
  );
  assert.equal(
    retirementProof?.status,
    "pass",
    "MERGE_GATE_RETIREMENT_PROOF_FAILED",
  );
  assert.equal(
    retirementProof?.failClosed,
    true,
    "MERGE_GATE_RETIREMENT_PROOF_NOT_FAIL_CLOSED",
  );
  assert.equal(
    retirementProof?.exactHead,
    headSha,
    "MERGE_GATE_RETIREMENT_PROOF_HEAD_MISMATCH",
  );
  assert.equal(
    retirementProof?.currentBaseSha,
    baseSha,
    "MERGE_GATE_RETIREMENT_PROOF_BASE_MISMATCH",
  );
  assert.deepEqual(
    retirementProof?.removedClaims,
    [claimId],
    "MERGE_GATE_RETIREMENT_CLAIM_SET_INVALID",
  );
  assert.equal(
    retirementProof?.retirements?.length,
    1,
    "MERGE_GATE_RETIREMENT_EVIDENCE_COUNT_INVALID",
  );
  assert.equal(
    retirementProof.retirements[0]?.id,
    claimId,
    "MERGE_GATE_RETIREMENT_EVIDENCE_ID_INVALID",
  );
  assert.equal(
    retirementProof.retirements[0]?.reason,
    "MERGED_PR",
    "MERGE_GATE_RETIREMENT_REASON_INVALID",
  );

  return {
    schemaVersion: 1,
    kind: "TDP_MERGE_GATE_DECISION",
    decision: "POLICY_SATISFIED",
    mode: "CLAIM_RETIREMENT",
    changeSetId: claimId,
    exactBaseSha: baseSha,
    exactHeadSha: headSha,
    changedFiles: changedFileCount,
    changedLines,
    unresolvedReviewThreads,
    retirementReason: retirementProof.retirements[0].reason,
  };
}

export function evaluateClaimAcquisitionMergeGate({
  manifest,
  registry,
  canonicalRegistry,
  claimId,
  canonicalEvents,
  events,
  branch,
  baseSha,
  headSha,
  authorizationPaths,
  changedFileCount,
  changedLines,
  currentPrNumber,
  liveItems,
  dependenciesSatisfied,
  unresolvedDependencies = [],
  unresolvedReviewThreads,
  trust,
  policy = DEFAULT_SCHEDULER_POLICY,
  now = Date.now(),
  ancestor = () => true,
}) {
  validateChangeSetV2(manifest);
  assert.ok(manifest.objective, "MERGE_GATE_ACQUISITION_OBJECTIVE_REQUIRED");
  normalizeObjective(manifest.objective);
  assert.equal(
    manifest.id,
    claimId,
    "MERGE_GATE_ACQUISITION_CHANGESET_ID_MISMATCH",
  );
  assert.equal(
    manifest.state,
    "IMPLEMENTING",
    "MERGE_GATE_ACQUISITION_STATE_INVALID",
  );
  assert.equal(
    manifest.baseSha,
    baseSha,
    "MERGE_GATE_ACQUISITION_BASE_MISMATCH",
  );
  assert.equal(
    manifest.branch,
    branch,
    "MERGE_GATE_ACQUISITION_BRANCH_MISMATCH",
  );
  assert.match(baseSha ?? "", SHA, "MERGE_GATE_ACQUISITION_BASE_INVALID");
  assert.match(headSha ?? "", SHA, "MERGE_GATE_ACQUISITION_HEAD_INVALID");

  assertAcquisitionClaimKeyset(canonicalRegistry, registry, claimId);
  const claim = registry.claims[claimId];
  assert.ok(claim, "MERGE_GATE_ACQUISITION_CLAIM_MISSING");
  assert.equal(
    claim.owner,
    "CHATGPT-PRO-CONTROL",
    "MERGE_GATE_ACQUISITION_OWNER_INVALID",
  );
  assert.equal(
    claim.reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "MERGE_GATE_ACQUISITION_REVIEWER_INVALID",
  );
  assert.equal(
    claim.status,
    "IMPLEMENTING",
    "MERGE_GATE_ACQUISITION_CLAIM_STATUS_INVALID",
  );
  assert.equal(
    claim.baseSha,
    baseSha,
    "MERGE_GATE_ACQUISITION_CLAIM_BASE_MISMATCH",
  );
  assert.equal(
    claim.branch,
    branch,
    "MERGE_GATE_ACQUISITION_CLAIM_BRANCH_MISMATCH",
  );
  assert.deepEqual(
    [...claim.paths].sort(),
    [...manifest.owns.paths].sort(),
    "MERGE_GATE_ACQUISITION_CLAIM_PATHS_MISMATCH",
  );

  for (const required of REQUIRED_REMOTE_EVIDENCE) {
    assert.ok(
      manifest.proof.requiredRemoteEvidence.includes(required),
      "MERGE_GATE_REMOTE_EVIDENCE_REQUIRED:" + required,
    );
  }

  validateClaimAcquisitionEvents({
    canonicalEvents,
    events,
    claimId,
    claim,
    manifest,
    branch,
    baseSha,
  });

  assert.ok(
    Number.isInteger(unresolvedReviewThreads) && unresolvedReviewThreads >= 0,
    "MERGE_GATE_REVIEW_THREAD_COUNT_INVALID",
  );
  assert.equal(
    unresolvedReviewThreads,
    0,
    "MERGE_GATE_UNRESOLVED_REVIEW_THREADS",
  );
  assert.equal(
    dependenciesSatisfied,
    true,
    "MERGE_GATE_DEPENDENCIES_UNRESOLVED",
  );
  assert.deepEqual(
    unresolvedDependencies,
    [],
    "MERGE_GATE_DEPENDENCY_LIST_NONEMPTY",
  );
  assert.ok(
    changedFileCount <= policy.hardFiles,
    "MERGE_GATE_HARD_FILE_LIMIT_EXCEEDED",
  );
  assert.ok(
    changedLines <= policy.hardLines,
    "MERGE_GATE_HARD_LINE_LIMIT_EXCEEDED",
  );

  const manifestPath = ".morro/changesets/" + claimId + ".json";
  const expectedPaths = [
    ".github/morro-control/claims.json",
    ".github/morro-control/events.ndjson",
    manifestPath,
  ].sort();
  assert.deepEqual(
    [...authorizationPaths].sort(),
    expectedPaths,
    "MERGE_GATE_ACQUISITION_SCOPE_INVALID",
  );
  assert.equal(
    changedFileCount,
    expectedPaths.length,
    "MERGE_GATE_ACQUISITION_FILE_COUNT_INVALID",
  );

  validateClaimContext({
    registry,
    manifest,
    branch,
    currentBaseSha: baseSha,
    branchHeadSha: headSha,
    changedFiles: authorizationPaths,
    now,
    authority: "ORCHESTRATOR",
    isAncestor: ancestor,
  });

  assert.equal(
    trust?.trusted,
    true,
    "MERGE_GATE_ACQUISITION_EXACT_HEAD_TRUST_REQUIRED",
  );
  assert.equal(
    trust?.authority,
    "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
    "MERGE_GATE_ACQUISITION_TRUST_AUTHORITY_INVALID",
  );
  assert.equal(
    trust?.headSha,
    headSha,
    "MERGE_GATE_ACQUISITION_TRUST_HEAD_MISMATCH",
  );

  const others = (liveItems ?? []).filter(
    (item) => item?.prNumber !== currentPrNumber,
  );
  const invalidOthers = others.filter((item) => item?.invalid);
  assert.deepEqual(
    invalidOthers.map((item) => ({
      prNumber: item.prNumber ?? null,
      invalid: item.invalid,
    })),
    [],
    "MERGE_GATE_LIVE_WORK_ITEM_INVALID",
  );

  const openPrs = others.filter((item) => item?.openPr === true).length + 1;
  assert.ok(
    openPrs <= policy.activePrLimit,
    "MERGE_GATE_ACTIVE_PR_LIMIT_EXCEEDED",
  );
  assert.ok(
    policy.writerStates.includes(manifest.state),
    "MERGE_GATE_ACQUISITION_WRITER_STATE_POLICY_INVALID",
  );
  const activeWriters =
    others.filter((item) => item?.writerActive === true).length + 1;
  assert.ok(
    activeWriters <= policy.globalWriterLimit,
    "MERGE_GATE_GLOBAL_WIP_EXCEEDED",
  );

  const activeChangeSets = others
    .filter((item) => item?.writerActive === true && item?.changeSet)
    .map((item) => item.changeSet);
  const collisions = findSemanticCollisions(manifest, activeChangeSets);
  assert.deepEqual(collisions, [], "MERGE_GATE_SEMANTIC_COLLISION");

  return {
    schemaVersion: 1,
    kind: "TDP_MERGE_GATE_DECISION",
    decision: "POLICY_SATISFIED",
    mode: "CLAIM_ACQUISITION",
    changeSetId: claimId,
    objective: manifest.objective,
    exactBaseSha: baseSha,
    exactHeadSha: headSha,
    changedFiles: changedFileCount,
    changedLines,
    activeWriters,
    openPrs,
    unresolvedReviewThreads,
    trustAuthority: trust.authority,
    collisions: [],
  };
}

export function evaluateMergeGate({
  manifest,
  registry,
  canonicalManifest,
  canonicalRegistry,
  branch,
  baseSha,
  headSha,
  authorizationPaths,
  changedFileCount,
  changedLines,
  currentPrNumber,
  liveItems,
  dependenciesSatisfied,
  unresolvedDependencies = [],
  unresolvedReviewThreads,
  policy = DEFAULT_SCHEDULER_POLICY,
  now = Date.now(),
  ancestor = () => true,
}) {
  validateChangeSetV2(manifest);
  validateChangeSetV2(canonicalManifest);
  assert.ok(manifest.objective, "MERGE_GATE_OBJECTIVE_REQUIRED");
  normalizeObjective(manifest.objective);
  assert.ok(
    POLICY_STATES.has(manifest.state),
    "MERGE_GATE_STATE_NOT_POLICY_ELIGIBLE",
  );
  assert.match(baseSha ?? "", SHA, "MERGE_GATE_BASE_SHA_INVALID");
  assert.match(headSha ?? "", SHA, "MERGE_GATE_HEAD_SHA_INVALID");
  assert.equal(manifest.baseSha, baseSha, "MERGE_GATE_EXACT_BASE_MISMATCH");
  assert.equal(manifest.branch, branch, "MERGE_GATE_BRANCH_MISMATCH");
  assert.ok(
    Number.isInteger(currentPrNumber) && currentPrNumber > 0,
    "MERGE_GATE_PR_NUMBER_INVALID",
  );
  assert.ok(
    Number.isInteger(unresolvedReviewThreads) && unresolvedReviewThreads >= 0,
    "MERGE_GATE_REVIEW_THREAD_COUNT_INVALID",
  );
  assert.equal(
    unresolvedReviewThreads,
    0,
    "MERGE_GATE_UNRESOLVED_REVIEW_THREADS",
  );
  assert.equal(
    dependenciesSatisfied,
    true,
    "MERGE_GATE_DEPENDENCIES_UNRESOLVED",
  );
  assert.deepEqual(
    unresolvedDependencies,
    [],
    "MERGE_GATE_DEPENDENCY_LIST_NONEMPTY",
  );
  assert.ok(
    changedFileCount <= policy.hardFiles,
    "MERGE_GATE_HARD_FILE_LIMIT_EXCEEDED",
  );
  assert.ok(
    changedLines <= policy.hardLines,
    "MERGE_GATE_HARD_LINE_LIMIT_EXCEEDED",
  );
  for (const required of REQUIRED_REMOTE_EVIDENCE) {
    assert.ok(
      manifest.proof.requiredRemoteEvidence.includes(required),
      "MERGE_GATE_REMOTE_EVIDENCE_REQUIRED:" + required,
    );
  }

  const transition = resolveCanonicalClaimTransition({
    canonicalRegistry,
    candidateRegistry: registry,
    branch,
  });
  assert.equal(
    transition.id,
    manifest.id,
    "MERGE_GATE_CLAIM_CHANGESET_ID_MISMATCH",
  );
  const divergence = authorityDivergence({
    canonicalClaim: transition.canonicalClaim,
    candidateClaim: transition.candidateClaim,
    canonicalChangeSet: canonicalManifest,
    candidateChangeSet: manifest,
  });
  assert.equal(divergence, null, divergence ?? "MERGE_GATE_AUTHORITY_DIVERGED");

  const authority = authorizationPaths.includes(
    ".github/morro-control/claims.json",
  )
    ? "ORCHESTRATOR"
    : "WORKER";
  validateClaimContext({
    registry,
    manifest,
    branch,
    currentBaseSha: baseSha,
    branchHeadSha: headSha,
    changedFiles: authorizationPaths,
    now,
    authority,
    isAncestor: ancestor,
  });

  const candidate = (liveItems ?? []).find(
    (item) => item?.prNumber === currentPrNumber,
  );
  assert.ok(candidate, "MERGE_GATE_LIVE_CANDIDATE_REQUIRED");
  assert.equal(candidate.openPr, true, "MERGE_GATE_CANDIDATE_NOT_OPEN");
  assert.equal(candidate.headSha, headSha, "MERGE_GATE_LIVE_HEAD_MISMATCH");
  assert.equal(
    candidate.changeSet?.id,
    manifest.id,
    "MERGE_GATE_LIVE_CHANGESET_ID_MISMATCH",
  );
  assert.equal(
    canonicalJson(candidate.changeSet),
    canonicalJson(manifest),
    "MERGE_GATE_LIVE_CHANGESET_MISMATCH",
  );
  assert.equal(candidate.invalid, null, "MERGE_GATE_LIVE_CANDIDATE_INVALID");
  assert.equal(
    candidate.trust?.trusted,
    true,
    "MERGE_GATE_EXACT_HEAD_TRUST_REQUIRED",
  );
  assert.equal(
    candidate.trust?.authority,
    "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
    "MERGE_GATE_TRUST_AUTHORITY_INVALID",
  );

  const others = (liveItems ?? []).filter(
    (item) => item?.prNumber !== currentPrNumber,
  );
  const invalidOthers = others.filter((item) => item?.invalid);
  assert.deepEqual(
    invalidOthers.map((item) => ({
      prNumber: item.prNumber ?? null,
      invalid: item.invalid,
    })),
    [],
    "MERGE_GATE_LIVE_WORK_ITEM_INVALID",
  );
  const openPrs = others.filter((item) => item?.openPr === true).length + 1;
  assert.ok(
    openPrs <= policy.activePrLimit,
    "MERGE_GATE_ACTIVE_PR_LIMIT_EXCEEDED",
  );
  const candidateWriter = policy.writerStates.includes(manifest.state) ? 1 : 0;
  const activeWriters =
    others.filter((item) => item?.writerActive === true).length +
    candidateWriter;
  assert.ok(
    activeWriters <= policy.globalWriterLimit,
    "MERGE_GATE_GLOBAL_WIP_EXCEEDED",
  );

  const activeChangeSets = others
    .filter((item) => item?.writerActive === true && item?.changeSet)
    .map((item) => item.changeSet);
  const collisions = findSemanticCollisions(manifest, activeChangeSets);
  assert.deepEqual(collisions, [], "MERGE_GATE_SEMANTIC_COLLISION");

  return {
    schemaVersion: 1,
    kind: "TDP_MERGE_GATE_DECISION",
    decision: "POLICY_SATISFIED",
    changeSetId: manifest.id,
    objective: manifest.objective,
    exactBaseSha: baseSha,
    exactHeadSha: headSha,
    changedFiles: changedFileCount,
    changedLines,
    activeWriters,
    openPrs,
    unresolvedReviewThreads,
    trustAuthority: candidate.trust.authority,
    collisions: [],
  };
}

export function countUnresolvedReviewThreads({
  repository,
  prNumber,
  exec = execFileSync,
}) {
  const [owner, name] = String(repository).split("/");
  assert.ok(owner && name, "MERGE_GATE_REPOSITORY_INVALID");
  assert.ok(
    Number.isInteger(prNumber) && prNumber > 0,
    "MERGE_GATE_PR_NUMBER_INVALID",
  );
  const query = [
    "query($owner:String!,$name:String!,$number:Int!,$cursor:String){",
    "repository(owner:$owner,name:$name){pullRequest(number:$number){",
    "reviewThreads(first:100,after:$cursor){nodes{isResolved}",
    "pageInfo{hasNextPage endCursor}}}}}",
  ].join("");
  let cursor = null;
  let unresolved = 0;
  for (;;) {
    const args = [
      "api",
      "graphql",
      "-f",
      "query=" + query,
      "-F",
      "owner=" + owner,
      "-F",
      "name=" + name,
      "-F",
      "number=" + prNumber,
    ];
    if (cursor) args.push("-F", "cursor=" + cursor);
    const raw = exec("gh", args, {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const data = JSON.parse(raw);
    const threads = data?.data?.repository?.pullRequest?.reviewThreads ?? null;
    assert.ok(threads, "MERGE_GATE_REVIEW_THREADS_UNAVAILABLE");
    unresolved += (threads.nodes ?? []).filter(
      (thread) => thread?.isResolved !== true,
    ).length;
    if (!threads.pageInfo?.hasNextPage) break;
    cursor = threads.pageInfo?.endCursor;
    assert.ok(cursor, "MERGE_GATE_REVIEW_THREAD_CURSOR_INVALID");
  }
  return unresolved;
}

export async function runMergeGate({
  candidateDir,
  trustedDir = process.cwd(),
  repository,
  prNumber,
  headSha,
  baseSha,
  branch,
  api = githubApi,
  reviewThreadCounter = countUnresolvedReviewThreads,
  liveCollector = collectLivePullWork,
  dependencyEvaluator = evaluateDependenciesAtMain,
  retirementProofBuilder = buildMergedRetirementProof,
  trustEvidenceVerifier = verifyTrustedClaimEvidence,
} = {}) {
  assert.ok(candidateDir, "MERGE_GATE_CANDIDATE_DIR_REQUIRED");
  assert.ok(trustedDir, "MERGE_GATE_TRUSTED_DIR_REQUIRED");
  assert.match(headSha ?? "", SHA, "MERGE_GATE_HEAD_SHA_INVALID");
  assert.match(baseSha ?? "", SHA, "MERGE_GATE_BASE_SHA_INVALID");
  assert.ok(branch, "MERGE_GATE_BRANCH_REQUIRED");
  assert.ok(repository, "MERGE_GATE_REPOSITORY_REQUIRED");

  assert.equal(
    git(trustedDir, "rev-parse", "HEAD"),
    baseSha,
    "MERGE_GATE_TRUSTED_HEAD_MISMATCH",
  );
  assert.equal(
    git(candidateDir, "rev-parse", "HEAD"),
    headSha,
    "MERGE_GATE_CANDIDATE_HEAD_MISMATCH",
  );
  assert.ok(
    isAncestor(candidateDir, baseSha, headSha),
    "MERGE_GATE_BASE_NOT_ANCESTOR",
  );

  const root = "repos/" + repository;
  const pr = await api(root + "/pulls/" + prNumber);
  assert.equal(pr?.number, prNumber, "MERGE_GATE_PR_IDENTITY_INVALID");
  assert.equal(pr?.head?.sha, headSha, "MERGE_GATE_PR_HEAD_MISMATCH");
  assert.equal(pr?.head?.ref, branch, "MERGE_GATE_PR_BRANCH_MISMATCH");
  assert.equal(
    pr?.head?.repo?.full_name,
    repository,
    "MERGE_GATE_FORK_FORBIDDEN",
  );
  assert.equal(pr?.base?.sha, baseSha, "MERGE_GATE_PR_BASE_MISMATCH");
  assert.equal(pr?.base?.ref, "main", "MERGE_GATE_BASE_BRANCH_INVALID");

  const firstMain = await api(root + "/commits/main");
  assert.equal(firstMain?.sha, baseSha, "MERGE_GATE_MAIN_MOVED_BEFORE_PROOF");

  const canonicalRegistry = readJson(
    trustedDir,
    ".github/morro-control/claims.json",
  );
  const registry = readJson(candidateDir, ".github/morro-control/claims.json");
  const policy = await loadSchedulerPolicy(
    join(trustedDir, ".morro/scheduler-policy.json"),
  );
  const diff = diffEvidence({ candidateDir, baseSha, headSha });
  assert.equal(
    diff.changedFileCount,
    pr?.changed_files,
    "MERGE_GATE_PR_FILE_COUNT_MISMATCH",
  );
  assert.equal(
    diff.additions,
    pr?.additions,
    "MERGE_GATE_PR_ADDITIONS_MISMATCH",
  );
  assert.equal(
    diff.deletions,
    pr?.deletions,
    "MERGE_GATE_PR_DELETIONS_MISMATCH",
  );

  const removedClaims = removedClaimIds(canonicalRegistry, registry);
  if (removedClaims.length > 0) {
    assert.deepEqual(
      removedClaims.length,
      1,
      "MERGE_GATE_RETIREMENT_MULTIPLE_CLAIMS_FORBIDDEN",
    );
    const claimId = removedClaims[0];
    assertRetirementClaimKeyset(canonicalRegistry, registry, claimId);
    const manifestPath = ".morro/changesets/" + claimId + ".json";
    const canonicalManifest = readJson(trustedDir, manifestPath);
    const manifest = readJson(candidateDir, manifestPath);
    const unresolvedReviewThreads = await reviewThreadCounter({
      repository,
      prNumber,
    });
    const retirementProof = await retirementProofBuilder(
      trustedDir,
      candidateDir,
      {
        ...process.env,
        EXPECTED_BASE_SHA: baseSha,
        EXPECTED_CANDIDATE_SHA: headSha,
        GITHUB_REPOSITORY: repository,
      },
    );
    const finalMain = await api(root + "/commits/main");
    assert.equal(
      finalMain?.sha,
      baseSha,
      "MERGE_GATE_MAIN_MOVED_DURING_RETIREMENT_PROOF",
    );
    return evaluateRetirementMergeGate({
      manifest,
      canonicalManifest,
      claimId,
      branch,
      baseSha,
      headSha,
      authorizationPaths: diff.authorizationPaths,
      changedFileCount: diff.changedFileCount,
      changedLines: diff.changedLines,
      unresolvedReviewThreads,
      retirementProof,
      policy,
    });
  }

  const addedClaims = addedClaimIds(canonicalRegistry, registry);
  if (addedClaims.length > 0) {
    assert.equal(
      addedClaims.length,
      1,
      "MERGE_GATE_ACQUISITION_MULTIPLE_CLAIMS_FORBIDDEN",
    );
    const claimId = addedClaims[0];
    assertAcquisitionClaimKeyset(canonicalRegistry, registry, claimId);
    const manifestPath = ".morro/changesets/" + claimId + ".json";
    const manifest = readJson(candidateDir, manifestPath);
    const canonicalEvents = readNdjson(
      trustedDir,
      ".github/morro-control/events.ndjson",
    );
    const events = readNdjson(
      candidateDir,
      ".github/morro-control/events.ndjson",
    );
    const live = await liveCollector({ repository, api, policy });
    assert.equal(
      live.mainSha,
      baseSha,
      "MERGE_GATE_ACQUISITION_LIVE_MAIN_MISMATCH",
    );
    const dependencies = await dependencyEvaluator({
      changeSet: manifest,
      repository,
      mainSha: baseSha,
      api,
    });
    const unresolvedReviewThreads = await reviewThreadCounter({
      repository,
      prNumber,
    });
    const trust = await trustEvidenceVerifier({
      repository,
      mainSha: baseSha,
      headSha,
      branch,
      prNumber,
      api,
    });
    const finalMain = await api(root + "/commits/main");
    assert.equal(
      finalMain?.sha,
      baseSha,
      "MERGE_GATE_MAIN_MOVED_DURING_ACQUISITION_PROOF",
    );
    return evaluateClaimAcquisitionMergeGate({
      manifest,
      registry,
      canonicalRegistry,
      claimId,
      canonicalEvents,
      events,
      branch,
      baseSha,
      headSha,
      authorizationPaths: diff.authorizationPaths,
      changedFileCount: diff.changedFileCount,
      changedLines: diff.changedLines,
      currentPrNumber: prNumber,
      liveItems: live.items,
      dependenciesSatisfied: dependencies.satisfied,
      unresolvedDependencies: dependencies.unresolved,
      unresolvedReviewThreads,
      trust,
      policy,
      ancestor: (ancestor, descendant) =>
        isAncestor(candidateDir, ancestor, descendant),
    });
  }

  const transition = resolveCanonicalClaimTransition({
    canonicalRegistry,
    candidateRegistry: registry,
    branch,
  });
  const manifestPath = ".morro/changesets/" + transition.id + ".json";
  const canonicalManifest = readJson(trustedDir, manifestPath);
  const manifest = readJson(candidateDir, manifestPath);

  const live = await liveCollector({ repository, api, policy });
  assert.equal(live.mainSha, baseSha, "MERGE_GATE_LIVE_MAIN_MISMATCH");
  const dependencies = await dependencyEvaluator({
    changeSet: manifest,
    repository,
    mainSha: baseSha,
    api,
  });
  const unresolvedReviewThreads = await reviewThreadCounter({
    repository,
    prNumber,
  });
  const finalMain = await api(root + "/commits/main");
  assert.equal(finalMain?.sha, baseSha, "MERGE_GATE_MAIN_MOVED_DURING_PROOF");

  return evaluateMergeGate({
    manifest,
    registry,
    canonicalManifest,
    canonicalRegistry,
    branch,
    baseSha,
    headSha,
    authorizationPaths: diff.authorizationPaths,
    changedFileCount: diff.changedFileCount,
    changedLines: diff.changedLines,
    currentPrNumber: prNumber,
    liveItems: live.items,
    dependenciesSatisfied: dependencies.satisfied,
    unresolvedDependencies: dependencies.unresolved,
    unresolvedReviewThreads,
    policy,
    ancestor: (ancestor, descendant) =>
      isAncestor(candidateDir, ancestor, descendant),
  });
}

function parseArgs(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const item = argv[index + 1];
    assert.ok(key?.startsWith("--") && item, "MERGE_GATE_ARG_INVALID");
    value[key.slice(2)] = item;
  }
  return {
    candidateDir: value.candidate ? resolve(value.candidate) : null,
    trustedDir: value.trusted ? resolve(value.trusted) : process.cwd(),
    repository: value.repository,
    prNumber: value["pr-number"] ? Number(value["pr-number"]) : null,
    headSha: value["head-sha"],
    baseSha: value["base-sha"],
    branch: value.branch,
  };
}

if (process.argv[1] && process.argv[1].endsWith("merge-gate.mjs")) {
  runMergeGate(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error?.stack ?? String(error));
      process.exitCode = 1;
    });
}
